package database

import (
	"context"
	"encoding/json"
	"fmt"
	"log"
	"math/rand"
	"time"

	"order-integration-hub/internal/domain"

	"golang.org/x/crypto/bcrypt"
)

// SeedDatabase inserts realistic demo data if tables are empty
func (db *DB) SeedDatabase(ctx context.Context) error {
	var userCount int
	err := db.QueryRowContext(ctx, "SELECT COUNT(*) FROM users").Scan(&userCount)
	if err != nil {
		return err
	}
	if userCount > 0 {
		log.Println("[Database] Seed data already present, skipping seed")
		return nil
	}

	log.Println("[Database] Seeding initial data...")

	// 1. Seed Users
	hashedAdmin, _ := bcrypt.GenerateFromPassword([]byte("Admin123!"), bcrypt.DefaultCost)
	hashedOp, _ := bcrypt.GenerateFromPassword([]byte("Operator123!"), bcrypt.DefaultCost)
	hashedViewer, _ := bcrypt.GenerateFromPassword([]byte("Viewer123!"), bcrypt.DefaultCost)

	users := []domain.User{
		{ID: "usr-admin-01", Name: "Admin Principal", Email: "admin@orderhub.local", PasswordHash: string(hashedAdmin), Role: domain.RoleAdmin, IsActive: true},
		{ID: "usr-op-01", Name: "Operador NOC", Email: "operator@orderhub.local", PasswordHash: string(hashedOp), Role: domain.RoleOperator, IsActive: true},
		{ID: "usr-view-01", Name: "Auditor Consultor", Email: "viewer@orderhub.local", PasswordHash: string(hashedViewer), Role: domain.RoleViewer, IsActive: true},
	}

	for _, u := range users {
		_, err := db.ExecContext(ctx, `
			INSERT INTO users (id, name, email, password_hash, role, is_active, created_at, updated_at)
			VALUES ($1, $2, $3, $4, $5, $6, NOW(), NOW())
			ON CONFLICT (email) DO NOTHING
		`, u.ID, u.Name, u.Email, u.PasswordHash, u.Role, u.IsActive)
		if err != nil {
			return fmt.Errorf("failed to seed user %s: %w", u.Email, err)
		}
	}

	// 2. Seed Customers
	customers := []domain.Customer{
		{ID: "cust-01", Code: "OMNI-RETAIL", Name: "OmniRetail Global SpA", ContactEmail: "integraciones@omniretail.cl", ContactPhone: "+56 9 8765 4321", IsActive: true},
		{ID: "cust-02", Code: "NORDIC-FASH", Name: "Nordic Fashion Brands", ContactEmail: "ecommerce@nordicfashion.com", ContactPhone: "+56 9 1234 5678", IsActive: true},
		{ID: "cust-03", Code: "ELECTRO-B2B", Name: "ElectroTech B2B Solutions", ContactEmail: "systems@electrotech.io", ContactPhone: "+56 2 2345 6789", IsActive: true},
		{ID: "cust-04", Code: "FRESH-MARKET", Name: "FreshMarket Direct", ContactEmail: "soporte@freshmarket.com", ContactPhone: "+56 9 5555 4444", IsActive: true},
		{ID: "cust-05", Code: "ANDES-DIST", Name: "Andes Distribuciones Ltda", ContactEmail: "ti@andesdist.cl", ContactPhone: "+56 2 9988 7766", IsActive: true},
		{ID: "cust-06", Code: "VALPO-LOG", Name: "Valparaíso Express Logistics", ContactEmail: "ops@valpolog.cl", ContactPhone: "+56 32 234 567", IsActive: false},
	}

	for _, c := range customers {
		_, err := db.ExecContext(ctx, `
			INSERT INTO customers (id, code, name, contact_email, contact_phone, is_active, created_at, updated_at)
			VALUES ($1, $2, $3, $4, $5, $6, NOW() - INTERVAL '30 days', NOW())
			ON CONFLICT (id) DO NOTHING
		`, c.ID, c.Code, c.Name, c.ContactEmail, c.ContactPhone, c.IsActive)
		if err != nil {
			return fmt.Errorf("failed to seed customer %s: %w", c.Name, err)
		}
	}

	// 3. Seed Integrations
	type intSeed struct {
		id, custID, name, provider, url, authType, status, lastErr string
		interval, consecErrors, avgMs                              int
		ordersSynced                                               int64
	}

	now := time.Now()
	lastSyncGood := now.Add(-12 * time.Minute)
	lastSyncErr := now.Add(-45 * time.Minute)
	nextPoll := now.Add(3 * time.Minute)

	integrations := []intSeed{
		{"int-01", "cust-01", "WooCommerce Flagship Store", domain.ProviderWooCommerce, "https://tienda.omniretail.cl/wp-json/wc/v3", domain.AuthTypeAPIKey, "ACTIVE", "", 15, 0, 320, 14250},
		{"int-02", "cust-01", "SAP B1 Central ERP", domain.ProviderSAP, "https://sap.omniretail.cl:50000/b1s/v2", domain.AuthTypeBasic, "ACTIVE", "", 30, 0, 480, 9820},
		{"int-03", "cust-02", "WooCommerce Nordic Chile", domain.ProviderWooCommerce, "https://store.nordicfashion.com/wp-json/wc/v3", domain.AuthTypeAPIKey, "ACTIVE", "", 10, 0, 290, 8430},
		{"int-04", "cust-02", "BSALE Sucursales & Retail", domain.ProviderBSALE, "https://api.bsale.io/v1", domain.AuthTypeBearer, "ACTIVE", "", 15, 0, 240, 5210},
		{"int-05", "cust-03", "Odoo Enterprise 16 B2B", domain.ProviderOdoo, "https://odoo.electrotech.io/jsonrpc", domain.AuthTypeAPIKey, "ERROR", "HTTP 503: Service Unavailable (Database Connection Pool Timeout)", 5, 4, 1850, 6100},
		{"int-06", "cust-03", "SAP S/4HANA Supply", domain.ProviderSAP, "https://s4.electrotech.io/sap/opu/odata/sap", domain.AuthTypeOAuth2, "ACTIVE", "", 60, 0, 520, 3190},
		{"int-07", "cust-04", "WooCommerce Express Market", domain.ProviderWooCommerce, "https://pedidos.freshmarket.com/wp-json/wc/v3", domain.AuthTypeAPIKey, "ACTIVE", "", 10, 0, 310, 11400},
		{"int-08", "cust-04", "BSALE Facturación Rápida", domain.ProviderBSALE, "https://api.bsale.io/v1", domain.AuthTypeBearer, "ACTIVE", "", 15, 0, 230, 4950},
		{"int-09", "cust-05", "Odoo Distribución Andes", domain.ProviderOdoo, "https://erp.andesdist.cl/jsonrpc", domain.AuthTypeAPIKey, "ACTIVE", "", 20, 0, 410, 7890},
		{"int-10", "cust-05", "SAP Business One Sucursales", domain.ProviderSAP, "https://b1.andesdist.cl:50000/b1s/v2", domain.AuthTypeBasic, "ERROR", "HTTP 401: Invalid Session Cookie / Expired B1SESSION token", 15, 3, 980, 2310},
		{"int-11", "cust-06", "BSALE Archivo Histórico", domain.ProviderBSALE, "https://api.bsale.io/v1", domain.AuthTypeBearer, "DISABLED", "", 120, 0, 250, 1400},
	}

	for _, it := range integrations {
		cred := map[string]string{
			"api_key":      "sk_live_99f8482a94018274a1024b",
			"api_secret":   "cs_sec_8849182374910293847192",
			"access_token": "bsale_tok_9918204918273645",
			"username":     "service_user",
			"password":     "SecretPass2026!",
		}
		credJSON, _ := json.Marshal(cred)

		var lastSync *time.Time
		if it.status == "ACTIVE" {
			lastSync = &lastSyncGood
		} else if it.status == "ERROR" {
			lastSync = &lastSyncErr
		}

		_, err := db.ExecContext(ctx, `
			INSERT INTO integrations (
				id, customer_id, name, provider, base_url, auth_type, credentials,
				status, polling_enabled, polling_interval_minutes, last_sync_at, next_polling_at,
				total_orders_synced, consecutive_errors, last_error, avg_response_time_ms, created_at, updated_at
			)
			VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, NOW() - INTERVAL '30 days', NOW())
			ON CONFLICT (id) DO NOTHING
		`, it.id, it.custID, it.name, it.provider, it.url, it.authType, string(credJSON),
			it.status, it.status != "DISABLED", it.interval, lastSync, nextPoll,
			it.ordersSynced, it.consecErrors, it.lastErr, it.avgMs)
		if err != nil {
			return fmt.Errorf("failed to seed integration %s: %w", it.name, err)
		}
	}

	// 4. Seed Sync Jobs and Logs (last 7 days history + today)
	r := rand.New(rand.NewSource(42))
	for day := 6; day >= 0; day-- {
		dayTime := now.AddDate(0, 0, -day)
		for hour := 0; hour < 24; hour += 2 {
			runTime := time.Date(dayTime.Year(), dayTime.Month(), dayTime.Day(), hour, r.Intn(50), 0, 0, time.UTC)
			if runTime.After(now) {
				continue
			}

			for _, it := range integrations {
				if it.status == "DISABLED" {
					continue
				}

				jobID := fmt.Sprintf("job-%d-%02d-%s", day, hour, it.id)
				isError := (it.status == "ERROR" && day == 0 && hour >= 14) || (r.Float64() < 0.05)
				jobStatus := domain.JobStatusSuccess
				errMsg := ""
				ordersFound := r.Intn(40) + 5
				ordersNew := int(float64(ordersFound) * 0.8)
				ordersUpd := ordersFound - ordersNew
				ordersFail := 0

				if isError {
					jobStatus = domain.JobStatusFailed
					errMsg = "Connection timeout after 30000ms: gateway upstream server did not respond"
					ordersNew = 0
					ordersUpd = 0
					ordersFail = ordersFound
				}

				duration := int64(it.avgMs + r.Intn(150) - 50)
				if duration < 100 {
					duration = 150
				}
				finTime := runTime.Add(time.Duration(duration) * time.Millisecond)

				_, err := db.ExecContext(ctx, `
					INSERT INTO sync_jobs (
						id, integration_id, trigger_type, status, started_at, finished_at,
						duration_ms, orders_found, orders_new, orders_updated, orders_failed,
						retries_count, error_message, details, created_at
					)
					VALUES ($1, $2, 'SCHEDULED', $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, '{}'::jsonb, $4)
					ON CONFLICT (id) DO NOTHING
				`, jobID, it.id, jobStatus, runTime, finTime, duration, ordersFound, ordersNew, ordersUpd, ordersFail, r.Intn(2), errMsg)
				if err != nil {
					return err
				}

				// Insert corresponding sync logs
				reqID := fmt.Sprintf("req-%08d", r.Intn(99999999))
				corrID := fmt.Sprintf("corr-%08d", r.Intn(99999999))

				logLevel := domain.LogLevelInfo
				logResult := "SUCCESS"
				logMsg := fmt.Sprintf("Sincronización completada exitosamente. Se procesaron %d pedidos.", ordersFound)
				if isError {
					logLevel = domain.LogLevelError
					logResult = "FAILED"
					logMsg = fmt.Sprintf("Error crítico al consultar proveedor %s: %s", it.provider, errMsg)
				}

				logID := fmt.Sprintf("log-%s-fetch", jobID)
				_, err = db.ExecContext(ctx, `
					INSERT INTO sync_logs (
						id, sync_job_id, integration_id, customer_id, provider, level,
						operation_type, request_id, correlation_id, duration_ms, result, message, details, created_at
					)
					VALUES ($1, $2, $3, $4, $5, $6, 'FETCH_ORDERS', $7, $8, $9, $10, $11, '{}'::jsonb, $12)
					ON CONFLICT (id) DO NOTHING
				`, logID, jobID, it.id, it.custID, it.provider, logLevel, reqID, corrID, duration, logResult, logMsg, runTime)
				if err != nil {
					return err
				}
			}
		}
	}

	// 5. Seed Alert Rules
	alertRules := []domain.AlertRule{
		{ID: "rule-01", Name: "Falla de Integración Crítica", EventType: "INTEGRATION_FAILED", Severity: "CRITICAL", ConsecutiveFailures: 2, ThresholdSeconds: 300, Recipients: []string{"noc@orderhub.local", "oncall@orderhub.local"}, Enabled: true, CooldownMinutes: 30},
		{ID: "rule-02", Name: "Múltiples Errores Consecutivos", EventType: "CONSECUTIVE_ERRORS", Severity: "HIGH", ConsecutiveFailures: 3, ThresholdSeconds: 600, Recipients: []string{"soporte@orderhub.local"}, Enabled: true, CooldownMinutes: 60},
		{ID: "rule-03", Name: "Alerta de Latencia Elevada (>2s)", EventType: "LATENCY_THRESHOLD", Severity: "MEDIUM", ConsecutiveFailures: 1, ThresholdSeconds: 2000, Recipients: []string{"perf@orderhub.local"}, Enabled: true, CooldownMinutes: 120},
		{ID: "rule-04", Name: "Resumen Diario de Sincronizaciones", EventType: "DAILY_DIGEST", Severity: "LOW", ConsecutiveFailures: 1, ThresholdSeconds: 0, Recipients: []string{"gerencia@orderhub.local", "operaciones@orderhub.local"}, Enabled: true, CooldownMinutes: 1440},
	}

	for _, ar := range alertRules {
		recJSON, _ := json.Marshal(ar.Recipients)
		_, err := db.ExecContext(ctx, `
			INSERT INTO alert_rules (
				id, name, customer_id, integration_id, provider, event_type, severity,
				consecutive_failures, threshold_seconds, recipients, enabled, cooldown_minutes, created_at, updated_at
			)
			VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, NOW() - INTERVAL '15 days', NOW())
			ON CONFLICT (id) DO NOTHING
		`, ar.ID, ar.Name, nil, nil, "", ar.EventType, ar.Severity, ar.ConsecutiveFailures, ar.ThresholdSeconds, string(recJSON), ar.Enabled, ar.CooldownMinutes)
		if err != nil {
			return err
		}
	}

	// 6. Seed Internal Notifications
	notifications := []domain.Notification{
		{ID: "notif-01", Title: "Integración Odoo con Fallas", Message: "La integración 'Odoo Enterprise 16 B2B' de ElectroTech presenta 4 errores consecutivos por timeout de base de datos.", Severity: "ERROR", IsRead: false, CreatedAt: now.Add(-35 * time.Minute)},
		{ID: "notif-02", Title: "Sesión SAP Expirada", Message: "La integración 'SAP Business One Sucursales' de Andes Distribuciones requiere renovación de token B1SESSION.", Severity: "WARNING", IsRead: false, CreatedAt: now.Add(-1 * time.Hour)},
		{ID: "notif-03", Title: "Sincronización Masiva Exitosa", Message: "WooCommerce Flagship Store de OmniRetail recuperó y procesó 245 pedidos nuevos.", Severity: "INFO", IsRead: true, CreatedAt: now.Add(-2 * time.Hour)},
	}

	for _, n := range notifications {
		intID := "int-05"
		custID := "cust-03"
		if n.ID == "notif-02" {
			intID = "int-10"
			custID = "cust-05"
		} else if n.ID == "notif-03" {
			intID = "int-01"
			custID = "cust-01"
		}

		_, err := db.ExecContext(ctx, `
			INSERT INTO notifications (id, title, message, severity, integration_id, customer_id, is_read, created_at)
			VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
			ON CONFLICT (id) DO NOTHING
		`, n.ID, n.Title, n.Message, n.Severity, intID, custID, n.IsRead, n.CreatedAt)
		if err != nil {
			return err
		}
	}

	// 7. Seed SMTP Config
	_, err = db.ExecContext(ctx, `
		INSERT INTO smtp_config (id, host, port, username, password, use_tls, from_address, from_name, updated_at)
		VALUES ('primary', 'smtp.mailtrap.io', 587, 'hub_notifier', 'enc_pass_seed_demo', true, 'no-reply@orderhub.local', 'Order Integration Hub NOC', NOW())
		ON CONFLICT (id) DO NOTHING
	`)
	if err != nil {
		return err
	}

	// 8. Seed Audit Logs
	auditLogs := []struct {
		id, user, action, entity, entityID, oldVal, newVal, ip string
	}{
		{"aud-01", "admin@orderhub.local", "UPDATE_INTEGRATION", "INTEGRATION", "int-05", `{"polling_interval_minutes": 15}`, `{"polling_interval_minutes": 5}`, "192.168.1.50"},
		{"aud-02", "admin@orderhub.local", "UPDATE_SMTP", "SMTP_CONFIG", "primary", `{"host": "smtp.old.com"}`, `{"host": "smtp.mailtrap.io"}`, "192.168.1.50"},
		{"aud-03", "operator@orderhub.local", "MANUAL_SYNC", "INTEGRATION", "int-01", `{}`, `{"trigger": "manual_dashboard"}`, "192.168.1.72"},
		{"aud-04", "admin@orderhub.local", "CREATE_CUSTOMER", "CUSTOMER", "cust-05", `{}`, `{"name": "Andes Distribuciones Ltda"}`, "192.168.1.50"},
	}

	for _, a := range auditLogs {
		_, err := db.ExecContext(ctx, `
			INSERT INTO audit_logs (id, user_id, user_email, action, entity_type, entity_id, old_values, new_values, ip_address, created_at)
			VALUES ($1, 'usr-admin-01', $2, $3, $4, $5, $6::jsonb, $7::jsonb, $8, NOW() - INTERVAL '2 days')
			ON CONFLICT (id) DO NOTHING
		`, a.id, a.user, a.action, a.entity, a.entityID, a.oldVal, a.newVal, a.ip)
		if err != nil {
			return err
		}
	}

	log.Println("[Database] Initial seed data loaded successfully!")
	return nil
}

// EnsureWooCommerceStores guarantees that Tienda 1 and Tienda 2 integrations exist and point to the live store containers
func (db *DB) EnsureWooCommerceStores(ctx context.Context) error {
	// 1. Ensure Customer 1 (Tienda 1)
	_, err := db.ExecContext(ctx, `
		INSERT INTO customers (id, code, name, contact_email, contact_phone, is_active, created_at, updated_at)
		VALUES ('cust-tienda1', 'TIENDA-01', 'Tienda 1 - Moda & Calzado SpA', 'contacto@tienda1.cl', '+56 9 8811 2233', true, NOW(), NOW())
		ON CONFLICT (id) DO UPDATE SET name = EXCLUDED.name, is_active = true
	`)
	if err != nil {
		return err
	}

	// 2. Ensure Customer 2 (Tienda 2)
	_, err = db.ExecContext(ctx, `
		INSERT INTO customers (id, code, name, contact_email, contact_phone, is_active, created_at, updated_at)
		VALUES ('cust-tienda2', 'TIENDA-02', 'Tienda 2 - Tecnología & Gadgets SpA', 'contacto@tienda2.cl', '+56 9 7722 3344', true, NOW(), NOW())
		ON CONFLICT (id) DO UPDATE SET name = EXCLUDED.name, is_active = true
	`)
	if err != nil {
		return err
	}

	cred1, _ := json.Marshal(map[string]string{
		"consumer_key":    "ck_tienda1_live_a8f93b",
		"consumer_secret": "cs_tienda1_secret_99b1a",
	})
	cred2, _ := json.Marshal(map[string]string{
		"consumer_key":    "ck_tienda2_live_b7c21e",
		"consumer_secret": "cs_tienda2_secret_44f8d",
	})

	// 3. Ensure Integration 1 (Tienda 1)
	_, err = db.ExecContext(ctx, `
		INSERT INTO integrations (id, customer_id, name, provider, base_url, auth_type, credentials, polling_interval_minutes, polling_enabled, status, created_at, updated_at)
		VALUES ('int-wc-tienda1', 'cust-tienda1', 'Tienda 1 - WooCommerce Moda Live', 'WOOCOMMERCE', 'http://woocomerce-tienda1:8080/wp-json/wc/v3', 'API_KEY', $1, 5, true, 'ACTIVE', NOW(), NOW())
		ON CONFLICT (id) DO UPDATE SET base_url = EXCLUDED.base_url, credentials = EXCLUDED.credentials, status = 'ACTIVE', polling_enabled = true
	`, cred1)
	if err != nil {
		return err
	}

	// 4. Ensure Integration 2 (Tienda 2)
	_, err = db.ExecContext(ctx, `
		INSERT INTO integrations (id, customer_id, name, provider, base_url, auth_type, credentials, polling_interval_minutes, polling_enabled, status, created_at, updated_at)
		VALUES ('int-wc-tienda2', 'cust-tienda2', 'Tienda 2 - WooCommerce Tech Live', 'WOOCOMMERCE', 'http://woocomerce-tienda2:8080/wp-json/wc/v3', 'API_KEY', $1, 5, true, 'ACTIVE', NOW(), NOW())
		ON CONFLICT (id) DO UPDATE SET base_url = EXCLUDED.base_url, credentials = EXCLUDED.credentials, status = 'ACTIVE', polling_enabled = true
	`, cred2)
	if err != nil {
		return err
	}

	log.Println("[Database] WooCommerce Stores (Tienda 1 & Tienda 2) registered and active in Hub")
	return db.EnsureCanonicalFieldsAndMappings(ctx)
}

// EnsureCanonicalFieldsAndMappings seeds canonical fields catalog, provider defaults and overrides
func (db *DB) EnsureCanonicalFieldsAndMappings(ctx context.Context) error {
	// 1. Canonical Fields
	cfs := []struct {
		id, name, groupName, dataType, desc, example string
		required                                     bool
		aliases                                      []string
	}{
		{"order.id", "ID Externo", "order", "STRING", "Identificador único en sistema origen", "1055", true, []string{"id", "external_id", "order_id"}},
		{"order.order_number", "Número de Pedido", "order", "STRING", "Número de orden visible al cliente", "#1055", true, []string{"number", "order_number", "name", "id"}},
		{"order.status", "Estado del Pedido", "order", "STRING", "Estado de ciclo de vida del pedido", "PROCESSING", true, []string{"status", "state", "order_status"}},
		{"order.created_at", "Fecha Creación", "order", "DATE", "Fecha de emisión original del pedido", "2026-08-29T14:30:00Z", true, []string{"date_created", "created_at", "date", "created"}},
		{"order.currency", "Moneda", "order", "STRING", "Código ISO de moneda", "CLP", false, []string{"currency", "curr", "currency_code"}},
		{"order.subtotal", "Subtotal Neto", "order", "NUMBER", "Monto subtotal antes de impuestos", "100823.53", false, []string{"subtotal", "net_amount", "sub_total"}},
		{"order.tax", "Impuestos / IVA", "order", "NUMBER", "Monto total de impuestos", "19156.47", false, []string{"total_tax", "tax_amount", "tax", "iva"}},
		{"order.total", "Monto Total", "order", "NUMBER", "Monto final facturado del pedido", "119980.00", true, []string{"total", "total_amount", "grand_total", "price"}},

		{"customer.id", "ID Cliente", "customer", "STRING", "Identificador del comprador", "usr_9981", false, []string{"customer_id", "client_id", "user_id"}},
		{"customer.name", "Nombre Completo", "customer", "STRING", "Nombre y apellido del cliente", "Carlos Plaza", true, []string{"name", "full_name", "first_name", "customer_name"}},
		{"customer.document", "RUT / Documento", "customer", "STRING", "Identificador fiscal o tributario", "18.234.567-8", false, []string{"rut", "document", "tax_id", "identification"}},
		{"customer.email", "Email Contacto", "customer", "STRING", "Correo electrónico del cliente", "carlos.plaza@ejemplo.cl", true, []string{"email", "billing.email", "contact_email"}},
		{"customer.phone", "Teléfono Contacto", "customer", "STRING", "Número de contacto del cliente", "+56 9 9123 4567", false, []string{"phone", "billing.phone", "telephone", "mobile"}},

		{"delivery.address", "Dirección de Entrega", "delivery", "STRING", "Calle y número de despacho", "Av. Providencia 1240, Depto 502", true, []string{"address", "address_1", "shipping.address_1", "street", "custom_delivery_address"}},
		{"delivery.city", "Comuna / Ciudad", "delivery", "STRING", "Comuna o ciudad de entrega", "Providencia", true, []string{"city", "shipping.city", "commune", "comuna", "custom_commune"}},
		{"delivery.region", "Región / Provincia", "delivery", "STRING", "Región o estado administrativo", "Región Metropolitana", false, []string{"state", "region", "province", "shipping.state"}},
		{"delivery.country", "País", "delivery", "STRING", "Código de país de despacho", "CL", false, []string{"country", "shipping.country", "country_code"}},
		{"delivery.postal_code", "Código Postal", "delivery", "STRING", "Código postal o ZIP", "7500000", false, []string{"postcode", "postal_code", "zip", "shipping.postcode"}},
		{"delivery.contact", "Contacto Entrega", "delivery", "STRING", "Persona que recibe el pedido", "Carlos Plaza", false, []string{"contact", "recipient", "receiver"}},
		{"delivery.phone", "Teléfono Entrega", "delivery", "STRING", "Teléfono de contacto para chofer", "+56 9 9123 4567", false, []string{"shipping_phone", "delivery_phone", "phone"}},

		{"items[].sku", "SKU Producto", "items", "STRING", "Código de artículo", "MODA-CHQ-01", true, []string{"sku", "line_items[].sku", "item_code", "product_sku"}},
		{"items[].external_product_id", "ID Producto Origen", "items", "STRING", "ID del producto en la tienda", "412", false, []string{"product_id", "line_items[].product_id", "item_id"}},
		{"items[].description", "Descripción Ítem", "items", "STRING", "Nombre o descripción del producto", "Chaqueta Cortaviento Térmica", true, []string{"name", "description", "line_items[].name", "title"}},
		{"items[].quantity", "Cantidad", "items", "NUMBER", "Unidades compradas", "1", true, []string{"quantity", "qty", "line_items[].quantity", "count"}},
		{"items[].unit_price", "Precio Unitario", "items", "NUMBER", "Precio por unidad", "49990.00", true, []string{"price", "unit_price", "line_items[].price"}},
		{"items[].discount", "Descuento", "items", "NUMBER", "Monto descontado por unidad/línea", "0.00", false, []string{"discount", "discount_total", "rebate"}},
		{"items[].tax", "Impuesto Ítem", "items", "NUMBER", "Impuesto de la línea", "0.00", false, []string{"tax", "total_tax", "subtotal_tax"}},
		{"items[].total", "Total Línea", "items", "NUMBER", "Total de la línea de producto", "49990.00", false, []string{"total", "line_total", "line_items[].total"}},
	}

	for _, cf := range cfs {
		aliasesJSON, _ := json.Marshal(cf.aliases)
		_, err := db.ExecContext(ctx, `
			INSERT INTO canonical_fields (id, name, group_name, data_type, description, required, aliases, example, created_at)
			VALUES ($1, $2, $3, $4, $5, $6, $7, $8, NOW())
			ON CONFLICT (id) DO UPDATE SET
				name = EXCLUDED.name, group_name = EXCLUDED.group_name, data_type = EXCLUDED.data_type,
				description = EXCLUDED.description, required = EXCLUDED.required, aliases = EXCLUDED.aliases, example = EXCLUDED.example
		`, cf.id, cf.name, cf.groupName, cf.dataType, cf.desc, cf.required, aliasesJSON, cf.example)
		if err != nil {
			return fmt.Errorf("error seeding canonical field %s: %w", cf.id, err)
		}
	}

	// 2. Mapping Profile (WooCommerce Standard)
	_, _ = db.ExecContext(ctx, `
		INSERT INTO mapping_profiles (id, name, provider_id, description, version, enabled, created_at, updated_at)
		VALUES ('prof-wc-standard', 'WooCommerce Estándar REST v3', 'WOOCOMMERCE', 'Perfil estándar para tiendas WooCommerce 8.x', 1, true, NOW(), NOW())
		ON CONFLICT (id) DO NOTHING
	`)

	// 3. Provider Default Mappings (WooCommerce)
	concatParams, _ := json.Marshal(map[string]interface{}{
		"paths":     []string{"billing.first_name", "billing.last_name"},
		"separator": " ",
	})
	statusParams, _ := json.Marshal(map[string]string{
		"processing": "PROCESSING",
		"on-hold":    "ON_HOLD",
		"completed":  "COMPLETED",
		"cancelled":  "CANCELLED",
		"refunded":   "REFUNDED",
		"failed":     "FAILED",
		"pending":    "PENDING",
		"default":    "PENDING",
	})

	defaults := []struct {
		id, canonicalField, sourcePath, dataType, defaultVal, transform string
		params                                                          json.RawMessage
		required                                                        bool
		priority                                                        int
	}{
		{"fm-wc-def-01", "order.id", "id", "STRING", "", "COPY", nil, true, 10},
		{"fm-wc-def-02", "order.order_number", "number", "STRING", "", "COPY", nil, true, 10},
		{"fm-wc-def-03", "order.status", "status", "STRING", "", "STATUS_MAP", statusParams, true, 10},
		{"fm-wc-def-04", "order.created_at", "date_created", "DATE", "", "DATE_FORMAT", nil, true, 10},
		{"fm-wc-def-05", "order.currency", "currency", "STRING", "CLP", "COPY", nil, false, 10},
		{"fm-wc-def-06", "order.total", "total", "NUMBER", "0", "NUMBER", nil, true, 10},

		{"fm-wc-def-07", "customer.name", "billing.first_name", "STRING", "", "CONCAT", concatParams, true, 10},
		{"fm-wc-def-08", "customer.email", "billing.email", "STRING", "", "LOWERCASE", nil, true, 10},
		{"fm-wc-def-09", "customer.phone", "billing.phone", "STRING", "", "COPY", nil, false, 10},

		{"fm-wc-def-10", "delivery.address", "shipping.address_1", "STRING", "", "COPY", nil, true, 10},
		{"fm-wc-def-11", "delivery.city", "shipping.city", "STRING", "", "COPY", nil, true, 10},
		{"fm-wc-def-12", "delivery.region", "shipping.state", "STRING", "Región Metropolitana", "DEFAULT", nil, false, 10},
		{"fm-wc-def-13", "delivery.country", "shipping.country", "STRING", "CL", "DEFAULT", nil, false, 10},
		{"fm-wc-def-14", "delivery.postal_code", "shipping.postcode", "STRING", "", "COPY", nil, false, 10},

		{"fm-wc-def-15", "items[].sku", "line_items[].sku", "STRING", "", "COPY", nil, true, 10},
		{"fm-wc-def-16", "items[].external_product_id", "line_items[].product_id", "STRING", "", "COPY", nil, false, 10},
		{"fm-wc-def-17", "items[].description", "line_items[].name", "STRING", "", "COPY", nil, true, 10},
		{"fm-wc-def-18", "items[].quantity", "line_items[].quantity", "NUMBER", "1", "NUMBER", nil, true, 10},
		{"fm-wc-def-19", "items[].unit_price", "line_items[].price", "NUMBER", "0", "NUMBER", nil, true, 10},
		{"fm-wc-def-20", "items[].total", "line_items[].total", "NUMBER", "0", "NUMBER", nil, false, 10},
	}

	for _, d := range defaults {
		params := d.params
		if params == nil {
			params = json.RawMessage("{}")
		}
		_, err := db.ExecContext(ctx, `
			INSERT INTO field_mappings (
				id, provider_id, profile_id, canonical_field, source_path, mapping_type,
				data_type, required, default_value, transformation, transformation_params,
				priority, enabled, created_at, updated_at
			)
			VALUES ($1, 'WOOCOMMERCE', 'prof-wc-standard', $2, $3, 'DEFAULT', $4, $5, $6, $7, $8, $9, true, NOW(), NOW())
			ON CONFLICT (id) DO UPDATE SET
				canonical_field = EXCLUDED.canonical_field, source_path = EXCLUDED.source_path,
				data_type = EXCLUDED.data_type, required = EXCLUDED.required, default_value = EXCLUDED.default_value,
				transformation = EXCLUDED.transformation, transformation_params = EXCLUDED.transformation_params,
				enabled = true
		`, d.id, d.canonicalField, d.sourcePath, d.dataType, d.required, d.defaultVal, d.transform, params, d.priority)
		if err != nil {
			return fmt.Errorf("error seeding default mapping %s: %w", d.id, err)
		}
	}

	// 4. Seed Overrides for Tienda 2 (Cliente B with custom metadata plugin)
	overrides := []struct {
		id, canonicalField, sourcePath, dataType, defaultVal, transform string
	}{
		{"fm-ovr-t2-01", "delivery.address", "meta_data.custom_delivery_address", "STRING", "", "COPY"},
		{"fm-ovr-t2-02", "delivery.city", "meta_data.custom_commune", "STRING", "", "COPY"},
		{"fm-ovr-t2-03", "delivery.region", "meta_data.custom_region", "STRING", "Región Metropolitana", "DEFAULT"},
	}

	for _, ov := range overrides {
		_, err := db.ExecContext(ctx, `
			INSERT INTO field_mappings (
				id, integration_id, canonical_field, source_path, mapping_type,
				data_type, required, default_value, transformation, transformation_params,
				priority, enabled, created_at, updated_at
			)
			VALUES ($1, 'int-wc-tienda2', $2, $3, 'OVERRIDE', $4, true, $5, $6, '{}'::jsonb, 100, true, NOW(), NOW())
			ON CONFLICT (id) DO UPDATE SET
				canonical_field = EXCLUDED.canonical_field, source_path = EXCLUDED.source_path,
				default_value = EXCLUDED.default_value, transformation = EXCLUDED.transformation, enabled = true
		`, ov.id, ov.canonicalField, ov.sourcePath, ov.dataType, ov.defaultVal, ov.transform)
		if err != nil {
			return fmt.Errorf("error seeding override mapping %s: %w", ov.id, err)
		}
	}

	// 5. Seed initial snapshot versions for Tienda 1 and Tienda 2
	_, _ = db.ExecContext(ctx, `
		INSERT INTO mapping_versions (id, integration_id, version, mapping_snapshot, description, created_by, created_at)
		VALUES
		  ('mver-t1-v1', 'int-wc-tienda1', 1, '[]'::jsonb, 'Versión inicial estándar WooCommerce', 'system', NOW() - INTERVAL '1 hour'),
		  ('mver-t2-v1', 'int-wc-tienda2', 1, '[{"canonical_field":"delivery.address","source_path":"meta_data.custom_delivery_address","transformation":"COPY","mapping_type":"OVERRIDE"}]'::jsonb, 'Versión inicial con plugin custom de despacho', 'system', NOW() - INTERVAL '1 hour')
		ON CONFLICT (id) DO NOTHING
	`)

	log.Println("[Database] Canonical Fields and Dynamic Mappings initialized successfully")
	return nil
}
