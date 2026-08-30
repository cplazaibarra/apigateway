package service

import (
	"context"
	"database/sql"
	"encoding/json"
	"errors"
	"fmt"
	"log"
	"math/rand"
	"strings"
	"time"

	"order-integration-hub/internal/adapter"
	"order-integration-hub/internal/domain"
	"order-integration-hub/internal/mapping"

	"github.com/google/uuid"
)

var (
	ErrIntegrationLocked = errors.New("la integración ya tiene una sincronización en ejecución")
)

type SyncService struct {
	db              *sql.DB
	adapterRegistry *adapter.Registry
	mappingSvc      *MappingService
	mappingEngine   mapping.MappingEngine
	alertService    *AlertService
}

func NewSyncService(db *sql.DB, reg *adapter.Registry, mapSvc *MappingService, engine mapping.MappingEngine, alertSvc *AlertService) *SyncService {
	return &SyncService{
		db:              db,
		adapterRegistry: reg,
		mappingSvc:      mapSvc,
		mappingEngine:   engine,
		alertService:    alertSvc,
	}
}

// AcquireLock attempts to lock integration execution
func (s *SyncService) AcquireLock(ctx context.Context, integrationID, lockedBy string) (bool, error) {
	res, err := s.db.ExecContext(ctx, `
		INSERT INTO execution_locks (integration_id, locked_at, locked_by)
		VALUES ($1, NOW(), $2)
		ON CONFLICT (integration_id) DO NOTHING
	`, integrationID, lockedBy)
	if err != nil {
		return false, err
	}
	rows, err := res.RowsAffected()
	if err != nil {
		return false, err
	}
	if rows == 0 {
		// Check for stale lock (older than 10 minutes)
		var lockedAt time.Time
		err := s.db.QueryRowContext(ctx, "SELECT locked_at FROM execution_locks WHERE integration_id = $1", integrationID).Scan(&lockedAt)
		if err == nil && time.Since(lockedAt) > 10*time.Minute {
			s.ReleaseLock(ctx, integrationID)
			return s.AcquireLock(ctx, integrationID, lockedBy)
		}
		return false, nil
	}
	return true, nil
}

// ReleaseLock removes execution lock
func (s *SyncService) ReleaseLock(ctx context.Context, integrationID string) {
	_, _ = s.db.ExecContext(ctx, "DELETE FROM execution_locks WHERE integration_id = $1", integrationID)
}

// TriggerManualSync handles ad-hoc sync request
func (s *SyncService) TriggerManualSync(ctx context.Context, integrationID string) (*domain.SyncJob, error) {
	return s.ExecuteSync(ctx, integrationID, "MANUAL")
}

// ExecuteScheduledSync handles cron/worker polling execution
func (s *SyncService) ExecuteScheduledSync(ctx context.Context, integrationID string) (*domain.SyncJob, error) {
	return s.ExecuteSync(ctx, integrationID, "SCHEDULED")
}

// ExecuteSync contains core integration retrieval, dynamic mapping, and persistence pipeline
func (s *SyncService) ExecuteSync(ctx context.Context, integrationID, triggerType string) (*domain.SyncJob, error) {
	locked, err := s.AcquireLock(ctx, integrationID, triggerType)
	if err != nil {
		return nil, fmt.Errorf("error al adquirir lock: %w", err)
	}
	if !locked {
		return nil, ErrIntegrationLocked
	}
	defer s.ReleaseLock(ctx, integrationID)

	// Fetch integration
	row := s.db.QueryRowContext(ctx, `
		SELECT i.id, i.customer_id, c.name, i.name, i.provider, i.base_url, i.auth_type, i.credentials,
		       i.status, COALESCE(i.environment, 'TEST'), i.polling_enabled, i.polling_interval_minutes, i.last_sync_at, i.consecutive_errors
		FROM integrations i
		JOIN customers c ON i.customer_id = c.id
		WHERE i.id = $1
	`, integrationID)

	var it domain.Integration
	var custName string
	if err := row.Scan(&it.ID, &it.CustomerID, &custName, &it.Name, &it.Provider, &it.BaseURL, &it.AuthType,
		&it.Credentials, &it.Status, &it.Environment, &it.PollingEnabled, &it.PollingIntervalMinutes, &it.LastSyncAt, &it.ConsecutiveErrors); err != nil {
		return nil, fmt.Errorf("integración no encontrada: %w", err)
	}

	jobID := "job-" + uuid.New().String()[:12]
	reqID := fmt.Sprintf("req-%08d", rand.Intn(99999999))
	corrID := fmt.Sprintf("corr-%08d", rand.Intn(99999999))
	startTime := time.Now()

	// Insert Sync Job in RUNNING state
	_, err = s.db.ExecContext(ctx, `
		INSERT INTO sync_jobs (id, integration_id, trigger_type, status, started_at, created_at)
		VALUES ($1, $2, $3, 'RUNNING', $4, $4)
	`, jobID, integrationID, triggerType, startTime)
	if err != nil {
		return nil, err
	}

	adp, err := s.adapterRegistry.Get(it.Provider)
	if err != nil {
		s.recordJobFailure(ctx, jobID, integrationID, it.CustomerID, it.Provider, reqID, corrID, startTime, err.Error(), it.ConsecutiveErrors+1)
		return nil, err
	}

	// 1. Fetch un-opinionated Raw Orders from Adapter
	rawOrders, err := adp.FetchRawOrders(ctx, &it, it.LastSyncAt)
	duration := time.Since(startTime).Milliseconds()
	finTime := time.Now()

	if err != nil {
		s.recordJobFailure(ctx, jobID, integrationID, it.CustomerID, it.Provider, reqID, corrID, startTime, err.Error(), it.ConsecutiveErrors+1)
		return nil, fmt.Errorf("error al obtener pedidos: %w", err)
	}

	// 2. Fetch Effective Field Mappings for this Integration
	var mappings []domain.FieldMapping
	if s.mappingSvc != nil {
		mappings, _ = s.mappingSvc.GetResolvedMappings(ctx, integrationID)
	}

	// 3. Transform Raw Payloads to CanonicalOrder via MappingEngine (Cap at 10 orders per sync batch)
	if len(rawOrders) > 10 {
		rawOrders = rawOrders[:10]
	}
	newOrders := 0
	updOrders := 0
	ordersFound := len(rawOrders)
	var syncedExternalIDs []string

	for _, raw := range rawOrders {
		var canonical *domain.CanonicalOrder
		if s.mappingEngine != nil && len(mappings) > 0 {
			var warnings []domain.MappingWarning
			canonical, warnings, _ = s.mappingEngine.Transform(ctx, raw, mappings)
			if len(warnings) > 0 {
				warnJSON, _ := json.Marshal(warnings)
				logMsg := fmt.Sprintf("Advertencias de mapeo: %d diagnosticadas", len(warnings))
				_, _ = s.db.ExecContext(ctx, `
					INSERT INTO sync_logs (
						id, sync_job_id, integration_id, customer_id, provider, level,
						operation_type, request_id, correlation_id, duration_ms, result, message, details, created_at
					)
					VALUES ($1, $2, $3, $4, $5, 'WARNING', 'NORMALIZE', $6, $7, 0, 'SKIPPED', $8, $9, NOW())
				`, "log-"+uuid.New().String()[:8], jobID, integrationID, it.CustomerID, it.Provider, reqID, corrID, logMsg, string(warnJSON))
			}
		}

		if canonical == nil {
			// Fallback: smart extraction of WooCommerce JSON fields when no mapping is configured
			var gen map[string]interface{}
			_ = json.Unmarshal(raw, &gen)

			extID := fmt.Sprintf("%v", gen["id"])
			orderNum := fmt.Sprintf("%v", gen["number"])
			if orderNum == "" || orderNum == "<nil>" {
				orderNum = extID
			}
			status := "PROCESSING"
			if st, ok := gen["status"].(string); ok && st != "" {
				status = strings.ToUpper(st)
			}
			currency := "CLP"
			if cur, ok := gen["currency"].(string); ok && cur != "" {
				currency = cur
			}
			var total float64
			if totStr, ok := gen["total"].(string); ok {
				fmt.Sscanf(totStr, "%f", &total)
			} else if totNum, ok := gen["total"].(float64); ok {
				total = totNum
			}

			// Extract customer from billing
			var custName, custEmail, custPhone string
			if billing, ok := gen["billing"].(map[string]interface{}); ok {
				fn, _ := billing["first_name"].(string)
				ln, _ := billing["last_name"].(string)
				custName = strings.TrimSpace(fn + " " + ln)
				custEmail, _ = billing["email"].(string)
				custPhone, _ = billing["phone"].(string)
			}

			// Extract address: try meta_data first, checking all known plugin field names
			var address, city, commune string
			if meta, ok := gen["meta_data"].(map[string]interface{}); ok {
				// Tienda 3 - Plugin "WooComuna Pro" fields
				if v, ok := meta["woo_direccion_completa"].(string); ok && v != "" {
					address = v
				}
				if v, ok := meta["woo_barrio"].(string); ok && v != "" {
					commune = v
					city = v
				}
				if v, ok := meta["woo_region_entrega"].(string); ok && v != "" && city == "" {
					city = v
				}
				// Tienda 2 - Plugin "Custom Checkout" fields (only if not already set)
				if address == "" {
					if v, ok := meta["custom_delivery_address"].(string); ok && v != "" {
						address = v
					}
				}
				if commune == "" {
					if v, ok := meta["custom_commune"].(string); ok && v != "" {
						commune = v
						city = v
					}
					if v, ok := meta["custom_region"].(string); ok && v != "" && city == "" {
						city = v
					}
				}
			}
			// Fallback to standard shipping fields if meta_data was empty
			if address == "" {
				if shipping, ok := gen["shipping"].(map[string]interface{}); ok {
					if v, ok := shipping["address_1"].(string); ok {
						address = v
					}
					if v, ok := shipping["city"].(string); ok {
						city = v
						commune = v
					}
				}
			}
			// Final fallback: billing address
			if address == "" {
				if billing, ok := gen["billing"].(map[string]interface{}); ok {
					if v, ok := billing["address_1"].(string); ok {
						address = v
					}
					if commune == "" {
						if v, ok := billing["city"].(string); ok {
							city = v
							commune = v
						}
					}
				}
			}

			canonical = &domain.CanonicalOrder{
				ExternalID:  extID,
				OrderNumber: orderNum,
				Status:      status,
				Currency:    currency,
				Total:       total,
				CreatedAt:   time.Now(),
				Customer: domain.CanonicalCustomer{
					Name:  custName,
					Email: custEmail,
					Phone: custPhone,
				},
				Delivery: domain.CanonicalDelivery{
					Address: address,
					City:    city,
					Commune: commune,
				},
			}
		}

		syncedExternalIDs = append(syncedExternalIDs, canonical.ExternalID)

		oID := "ord-" + uuid.New().String()[:8]
		itemsJSON, _ := json.Marshal(canonical.Items)

		// Resolve commune: prefer Delivery.Commune, fall back to Delivery.City
		effectiveCommune := canonical.Delivery.Commune
		if effectiveCommune == "" {
			effectiveCommune = canonical.Delivery.City
		}

		var effectiveOrderID string
		_ = s.db.QueryRowContext(ctx, "SELECT id FROM orders WHERE integration_id = $1 AND external_order_id = $2", integrationID, canonical.ExternalID).Scan(&effectiveOrderID)
		if effectiveOrderID != "" {
			updOrders++
			_, _ = s.db.ExecContext(ctx, `
				UPDATE orders
				SET order_number = $1, customer_email = $2, customer_full_name = $3, customer_phone = $4,
				    shipping_address = $5, city = $6, commune = $7, total_amount = $8,
				    currency = $9, status = $10, item_count = $11, items = $12, raw_payload = $13, synced_at = NOW()
				WHERE id = $14
			`, canonical.OrderNumber, canonical.Customer.Email, canonical.Customer.Name, canonical.Customer.Phone,
				canonical.Delivery.Address, canonical.Delivery.City, effectiveCommune, canonical.Total,
				canonical.Currency, canonical.Status, len(canonical.Items), string(itemsJSON), string(raw), effectiveOrderID)
		} else {
			newOrders++
			effectiveOrderID = oID
			_, _ = s.db.ExecContext(ctx, `
				INSERT INTO orders (
					id, integration_id, external_order_id, order_number, customer_email,
					customer_full_name, customer_phone, shipping_address, city, commune,
					total_amount, currency, status, item_count, items,
					external_created_at, raw_payload, synced_at
				)
				VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, NOW())
				ON CONFLICT (integration_id, external_order_id) DO NOTHING
			`, effectiveOrderID, integrationID, canonical.ExternalID, canonical.OrderNumber, canonical.Customer.Email, canonical.Customer.Name,
				canonical.Customer.Phone, canonical.Delivery.Address, canonical.Delivery.City, effectiveCommune,
				canonical.Total, canonical.Currency, canonical.Status, len(canonical.Items), string(itemsJSON), canonical.CreatedAt, string(raw))
		}

		// Sync normalized line items into order_items table
		if len(canonical.Items) > 0 {
			_, _ = s.db.ExecContext(ctx, "DELETE FROM order_items WHERE order_id = $1", effectiveOrderID)
			for idx, itm := range canonical.Items {
				itmID := fmt.Sprintf("item-%s-%02d", effectiveOrderID[4:], idx+1)
				sku := itm.SKU
				if sku == "" {
					sku = "N/A"
				}
				name := itm.Description
				if name == "" {
					name = "Producto General"
				}
				_, _ = s.db.ExecContext(ctx, `
					INSERT INTO order_items (
						id, order_id, integration_id, external_order_id, sku,
						product_name, quantity, unit_price, total_amount, created_at
					)
					VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, NOW())
				`, itmID, effectiveOrderID, integrationID, canonical.ExternalID, sku, name, itm.Quantity, itm.UnitPrice, itm.Total)
			}
		}
	}

	// 4. Acknowledge and update status of synced orders in external store (ONLY in PRODUCTION mode)
	if len(syncedExternalIDs) > 0 {
		if it.Environment == domain.EnvProduction {
			if err := adp.AcknowledgeOrders(ctx, &it, syncedExternalIDs, "sincronizado"); err != nil {
				log.Printf("[Sync] Advertencia al actualizar estado de pedidos en %s: %v", it.Name, err)
			} else {
				log.Printf("[Sync] ✅ [PRODUCCIÓN] %d pedidos actualizados a estado 'sincronizado' en %s", len(syncedExternalIDs), it.Name)
			}
		} else {
			log.Printf("[Sync] ℹ️ [MODO PRUEBA] Integración %s en modo TEST: no se modifica el estado de los %d pedidos en la plataforma de origen", it.Name, len(syncedExternalIDs))
		}
	}

	// Update Sync Job as SUCCESS
	_, _ = s.db.ExecContext(ctx, `
		UPDATE sync_jobs
		SET status = 'SUCCESS', finished_at = $1, duration_ms = $2,
		    orders_found = $3, orders_new = $4, orders_updated = $5, orders_failed = 0
		WHERE id = $6
	`, finTime, duration, ordersFound, newOrders, updOrders, jobID)

	// Update Integration State
	nextPoll := finTime.Add(time.Duration(it.PollingIntervalMinutes) * time.Minute)
	_, _ = s.db.ExecContext(ctx, `
		UPDATE integrations
		SET status = 'ACTIVE', last_sync_at = $1, next_polling_at = $2,
		    total_orders_synced = total_orders_synced + $3, consecutive_errors = 0,
		    last_error = '', avg_response_time_ms = (avg_response_time_ms + $4) / 2, updated_at = NOW()
		WHERE id = $5
	`, finTime, nextPoll, newOrders+updOrders, int(duration), integrationID)

	// Record Success Log
	logID := "log-" + uuid.New().String()[:8]
	logMsg := fmt.Sprintf("Sincronización exitosa: %d pedidos encontrados (%d nuevos, %d actualizados) en %dms", ordersFound, newOrders, updOrders, duration)
	_, _ = s.db.ExecContext(ctx, `
		INSERT INTO sync_logs (
			id, sync_job_id, integration_id, customer_id, provider, level,
			operation_type, request_id, correlation_id, duration_ms, result, message, details, created_at
		)
		VALUES ($1, $2, $3, $4, $5, 'INFO', 'FETCH_ORDERS', $6, $7, $8, 'SUCCESS', $9, '{}'::jsonb, $10)
	`, logID, jobID, integrationID, it.CustomerID, it.Provider, reqID, corrID, duration, logMsg, finTime)

	// Record Metric
	mID := "met-" + uuid.New().String()[:8]
	_, _ = s.db.ExecContext(ctx, `
		INSERT INTO integration_metrics (
			id, integration_id, timestamp, total_requests, success_count, error_count, orders_count,
			avg_duration_ms, min_duration_ms, max_duration_ms, p95_duration_ms
		)
		VALUES ($1, $2, $3, 1, 1, 0, $4, $5, $5, $5, $5)
	`, mID, integrationID, finTime, ordersFound, int(duration))

	return &domain.SyncJob{
		ID:            jobID,
		IntegrationID: integrationID,
		TriggerType:   triggerType,
		Status:        domain.JobStatusSuccess,
		StartedAt:     startTime,
		FinishedAt:    &finTime,
		DurationMs:    duration,
		OrdersFound:   ordersFound,
		OrdersNew:     newOrders,
		OrdersUpdated: updOrders,
		OrdersFailed:  0,
		CreatedAt:     startTime,
	}, nil
}

func (s *SyncService) recordJobFailure(ctx context.Context, jobID, integrationID, customerID, provider, reqID, corrID string, startTime time.Time, errMsg string, consecErrors int) {
	finTime := time.Now()
	duration := time.Since(startTime).Milliseconds()

	_, _ = s.db.ExecContext(ctx, `
		UPDATE sync_jobs
		SET status = 'FAILED', finished_at = $1, duration_ms = $2, error_message = $3
		WHERE id = $4
	`, finTime, duration, errMsg, jobID)

	_, _ = s.db.ExecContext(ctx, `
		UPDATE integrations
		SET status = 'ERROR', consecutive_errors = $1, last_error = $2, updated_at = NOW()
		WHERE id = $3
	`, consecErrors, errMsg, integrationID)

	logID := "log-" + uuid.New().String()[:8]
	_, _ = s.db.ExecContext(ctx, `
		INSERT INTO sync_logs (
			id, sync_job_id, integration_id, customer_id, provider, level,
			operation_type, request_id, correlation_id, duration_ms, result, message, details, created_at
		)
		VALUES ($1, $2, $3, $4, $5, 'ERROR', 'FETCH_ORDERS', $6, $7, $8, 'FAILED', $9, '{}'::jsonb, $10)
	`, logID, jobID, integrationID, customerID, provider, reqID, corrID, duration, errMsg, finTime)

	// Record failure metric
	mID := "met-" + uuid.New().String()[:8]
	_, _ = s.db.ExecContext(ctx, `
		INSERT INTO integration_metrics (
			id, integration_id, timestamp, total_requests, success_count, error_count, orders_count,
			avg_duration_ms, min_duration_ms, max_duration_ms, p95_duration_ms
		)
		VALUES ($1, $2, $3, 1, 0, 1, 0, $4, $4, $4, $4)
	`, mID, integrationID, finTime, int(duration))

	// Create internal notification
	notifID := "notif-" + uuid.New().String()[:8]
	_, _ = s.db.ExecContext(ctx, `
		INSERT INTO notifications (id, title, message, severity, integration_id, customer_id, is_read, created_at)
		VALUES ($1, $2, $3, 'ERROR', $4, $5, false, NOW())
	`, notifID, "Falla en sincronización", fmt.Sprintf("Error en integración %s: %s", integrationID, errMsg), integrationID, customerID)

	// Trigger alert evaluator
	if s.alertService != nil {
		go func() {
			evalCtx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
			defer cancel()
			if err := s.alertService.EvaluateRule(evalCtx, integrationID, customerID, provider, "INTEGRATION_FAILED", consecErrors, int(duration), errMsg); err != nil {
				log.Printf("[Alerts] Warning: %v", err)
			}
		}()
	}
}

// ListStandardizedOrders retrieves standardized orders with SKUs
func (s *SyncService) ListStandardizedOrders(ctx context.Context, integrationID, search, status string, limit int) ([]domain.StandardizedOrderReport, error) {
	if limit <= 0 || limit > 500 {
		limit = 100
	}

	query := `
		SELECT 
			o.id, o.integration_id, i.name AS integration_name, i.provider,
			o.order_number, o.external_order_id, o.customer_full_name, o.customer_email, o.customer_phone,
			o.shipping_address, o.city, o.commune, o.total_amount, o.currency, o.status,
			o.item_count, o.synced_at
		FROM orders o
		JOIN integrations i ON o.integration_id = i.id
		WHERE 1=1
	`
	args := []interface{}{}
	argIdx := 1

	if integrationID != "" {
		query += fmt.Sprintf(" AND o.integration_id = $%d", argIdx)
		args = append(args, integrationID)
		argIdx++
	}
	if status != "" {
		query += fmt.Sprintf(" AND o.status = $%d", argIdx)
		args = append(args, status)
		argIdx++
	}
	if search != "" {
		st := "%" + search + "%"
		query += fmt.Sprintf(" AND (o.order_number ILIKE $%d OR o.customer_full_name ILIKE $%d OR o.customer_email ILIKE $%d OR o.shipping_address ILIKE $%d OR o.city ILIKE $%d OR EXISTS (SELECT 1 FROM order_items oi WHERE oi.order_id = o.id AND (oi.sku ILIKE $%d OR oi.product_name ILIKE $%d)))", argIdx, argIdx, argIdx, argIdx, argIdx, argIdx, argIdx)
		args = append(args, st)
		argIdx++
	}

	query += fmt.Sprintf(" ORDER BY o.synced_at DESC, o.order_number DESC LIMIT $%d", argIdx)
	args = append(args, limit)

	rows, err := s.db.QueryContext(ctx, query, args...)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	orders := make([]domain.StandardizedOrderReport, 0)
	orderIDs := make([]string, 0)
	orderMap := make(map[string]*domain.StandardizedOrderReport)

	for rows.Next() {
		var ord domain.StandardizedOrderReport
		if err := rows.Scan(
			&ord.ID, &ord.IntegrationID, &ord.IntegrationName, &ord.Provider,
			&ord.OrderNumber, &ord.ExternalOrderID, &ord.CustomerFullName, &ord.CustomerEmail, &ord.CustomerPhone,
			&ord.ShippingAddress, &ord.City, &ord.Commune, &ord.TotalAmount, &ord.Currency, &ord.Status,
			&ord.ItemCount, &ord.SyncedAt,
		); err == nil {
			ord.Items = make([]domain.StandardizedOrderItemReport, 0)
			orders = append(orders, ord)
			orderIDs = append(orderIDs, ord.ID)
		}
	}

	for i := range orders {
		orderMap[orders[i].ID] = &orders[i]
	}

	if len(orderIDs) > 0 {
		itemRows, err := s.db.QueryContext(ctx, `
			SELECT id, order_id, sku, product_name, quantity, unit_price, total_amount
			FROM order_items
			WHERE order_id = ANY($1)
			ORDER BY sku
		`, orderIDs)
		if err == nil {
			defer itemRows.Close()
			for itemRows.Next() {
				var itm domain.StandardizedOrderItemReport
				var oID string
				if err := itemRows.Scan(&itm.ID, &oID, &itm.SKU, &itm.ProductName, &itm.Quantity, &itm.UnitPrice, &itm.TotalAmount); err == nil {
					if ord, exists := orderMap[oID]; exists {
						ord.Items = append(ord.Items, itm)
					}
				}
			}
		}
	}

	return orders, nil
}

// GetStandardizedOrder retrieves single standardized order
func (s *SyncService) GetStandardizedOrder(ctx context.Context, id string) (*domain.StandardizedOrderReport, error) {
	var ord domain.StandardizedOrderReport
	err := s.db.QueryRowContext(ctx, `
		SELECT 
			o.id, o.integration_id, i.name AS integration_name, i.provider,
			o.order_number, o.external_order_id, o.customer_full_name, o.customer_email, o.customer_phone,
			o.shipping_address, o.city, o.commune, o.total_amount, o.currency, o.status,
			o.item_count, o.raw_payload, o.synced_at
		FROM orders o
		JOIN integrations i ON o.integration_id = i.id
		WHERE o.id = $1
	`, id).Scan(
		&ord.ID, &ord.IntegrationID, &ord.IntegrationName, &ord.Provider,
		&ord.OrderNumber, &ord.ExternalOrderID, &ord.CustomerFullName, &ord.CustomerEmail, &ord.CustomerPhone,
		&ord.ShippingAddress, &ord.City, &ord.Commune, &ord.TotalAmount, &ord.Currency, &ord.Status,
		&ord.ItemCount, &ord.RawPayload, &ord.SyncedAt,
	)
	if err != nil {
		return nil, err
	}

	ord.Items = make([]domain.StandardizedOrderItemReport, 0)
	rows, err := s.db.QueryContext(ctx, `
		SELECT id, sku, product_name, quantity, unit_price, total_amount
		FROM order_items
		WHERE order_id = $1
		ORDER BY sku
	`, id)
	if err == nil {
		defer rows.Close()
		for rows.Next() {
			var itm domain.StandardizedOrderItemReport
			if err := rows.Scan(&itm.ID, &itm.SKU, &itm.ProductName, &itm.Quantity, &itm.UnitPrice, &itm.TotalAmount); err == nil {
				ord.Items = append(ord.Items, itm)
			}
		}
	}

	return &ord, nil
}
