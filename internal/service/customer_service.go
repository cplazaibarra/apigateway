package service

import (
	"context"
	"database/sql"
	"errors"
	"fmt"
	"time"

	"order-integration-hub/internal/domain"

	"github.com/google/uuid"
)

type CustomerService struct {
	db *sql.DB
}

func NewCustomerService(db *sql.DB) *CustomerService {
	return &CustomerService{db: db}
}

type CustomerStats struct {
	TotalIntegrations  int        `json:"total_integrations"`
	ActiveIntegrations int        `json:"active_integrations"`
	TotalOrders        int64      `json:"total_orders"`
	LastSyncAt         *time.Time `json:"last_sync_at,omitempty"`
	RecentErrorsCount  int        `json:"recent_errors_count"`
}

type CustomerDetail struct {
	Customer     domain.Customer      `json:"customer"`
	Integrations []domain.Integration `json:"integrations"`
	Stats        CustomerStats        `json:"stats"`
	RecentErrors []domain.SyncLog     `json:"recent_errors"`
}

func (s *CustomerService) List(ctx context.Context, search string) ([]domain.Customer, error) {
	query := `
		SELECT c.id, c.code, c.name, c.contact_email, c.contact_phone, c.is_active, c.created_at, c.updated_at,
		       COUNT(i.id) as total_integrations,
		       COUNT(CASE WHEN i.status = 'ACTIVE' THEN 1 END) as active_integrations,
		       MAX(i.last_sync_at) as last_sync_at
		FROM customers c
		LEFT JOIN integrations i ON c.id = i.customer_id
		WHERE ($1 = '' OR c.name ILIKE '%' || $1 || '%' OR c.code ILIKE '%' || $1 || '%' OR c.contact_email ILIKE '%' || $1 || '%')
		GROUP BY c.id, c.code, c.name, c.contact_email, c.contact_phone, c.is_active, c.created_at, c.updated_at
		ORDER BY c.name ASC
	`
	rows, err := s.db.QueryContext(ctx, query, search)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var customers []domain.Customer
	for rows.Next() {
		var c domain.Customer
		if err := rows.Scan(&c.ID, &c.Code, &c.Name, &c.ContactEmail, &c.ContactPhone, &c.IsActive, &c.CreatedAt, &c.UpdatedAt,
			&c.TotalIntegrations, &c.ActiveIntegrations, &c.LastSyncAt); err != nil {
			return nil, err
		}
		customers = append(customers, c)
	}
	return customers, nil
}

func (s *CustomerService) GetByID(ctx context.Context, id string) (*CustomerDetail, error) {
	row := s.db.QueryRowContext(ctx, `
		SELECT id, code, name, contact_email, contact_phone, is_active, created_at, updated_at
		FROM customers WHERE id = $1
	`, id)

	var c domain.Customer
	if err := row.Scan(&c.ID, &c.Code, &c.Name, &c.ContactEmail, &c.ContactPhone, &c.IsActive, &c.CreatedAt, &c.UpdatedAt); err != nil {
		if errors.Is(err, sql.ErrNoRows) {
			return nil, errors.New("cliente no encontrado")
		}
		return nil, err
	}

	// Fetch integrations
	intRows, err := s.db.QueryContext(ctx, `
		SELECT id, customer_id, name, provider, base_url, auth_type, status, polling_enabled,
		       polling_interval_minutes, last_sync_at, next_polling_at, total_orders_synced,
		       consecutive_errors, COALESCE(last_error, ''), avg_response_time_ms, created_at, updated_at
		FROM integrations
		WHERE customer_id = $1
		ORDER BY name ASC
	`, id)
	if err != nil {
		return nil, err
	}
	defer intRows.Close()

	var integrations []domain.Integration
	var stats CustomerStats
	for intRows.Next() {
		var it domain.Integration
		if err := intRows.Scan(&it.ID, &it.CustomerID, &it.Name, &it.Provider, &it.BaseURL, &it.AuthType,
			&it.Status, &it.PollingEnabled, &it.PollingIntervalMinutes, &it.LastSyncAt, &it.NextPollingAt,
			&it.TotalOrdersSynced, &it.ConsecutiveErrors, &it.LastError, &it.AvgResponseTimeMs, &it.CreatedAt, &it.UpdatedAt); err != nil {
			return nil, err
		}
		stats.TotalIntegrations++
		if it.Status == "ACTIVE" {
			stats.ActiveIntegrations++
		}
		stats.TotalOrders += it.TotalOrdersSynced
		if it.LastSyncAt != nil && (stats.LastSyncAt == nil || it.LastSyncAt.After(*stats.LastSyncAt)) {
			stats.LastSyncAt = it.LastSyncAt
		}
		integrations = append(integrations, it)
	}

	// Fetch recent errors
	errRows, err := s.db.QueryContext(ctx, `
		SELECT id, sync_job_id, integration_id, customer_id, provider, level, operation_type,
		       request_id, correlation_id, duration_ms, result, message, details, created_at
		FROM sync_logs
		WHERE customer_id = $1 AND level IN ('ERROR', 'WARNING')
		ORDER BY created_at DESC
		LIMIT 10
	`, id)
	var recentErrors []domain.SyncLog
	if err == nil {
		defer errRows.Close()
		for errRows.Next() {
			var l domain.SyncLog
			if err := errRows.Scan(&l.ID, &l.SyncJobID, &l.IntegrationID, &l.CustomerID, &l.Provider, &l.Level,
				&l.OperationType, &l.RequestID, &l.CorrelationID, &l.DurationMs, &l.Result, &l.Message, &l.Details, &l.CreatedAt); err == nil {
				recentErrors = append(recentErrors, l)
			}
		}
	}
	stats.RecentErrorsCount = len(recentErrors)

	return &CustomerDetail{
		Customer:     c,
		Integrations: integrations,
		Stats:        stats,
		RecentErrors: recentErrors,
	}, nil
}

func (s *CustomerService) Create(ctx context.Context, c *domain.Customer) (*domain.Customer, error) {
	if c.ID == "" {
		c.ID = "cust-" + uuid.New().String()[:8]
	}
	_, err := s.db.ExecContext(ctx, `
		INSERT INTO customers (id, code, name, contact_email, contact_phone, is_active, created_at, updated_at)
		VALUES ($1, $2, $3, $4, $5, $6, NOW(), NOW())
	`, c.ID, c.Code, c.Name, c.ContactEmail, c.ContactPhone, c.IsActive)
	if err != nil {
		return nil, fmt.Errorf("error al crear cliente: %w", err)
	}
	res, err := s.GetByID(ctx, c.ID)
	if err != nil {
		return nil, err
	}
	return &res.Customer, nil
}

func (s *CustomerService) Update(ctx context.Context, c *domain.Customer) (*domain.Customer, error) {
	_, err := s.db.ExecContext(ctx, `
		UPDATE customers
		SET code = $1, name = $2, contact_email = $3, contact_phone = $4, is_active = $5, updated_at = NOW()
		WHERE id = $6
	`, c.Code, c.Name, c.ContactEmail, c.ContactPhone, c.IsActive, c.ID)
	if err != nil {
		return nil, fmt.Errorf("error al actualizar cliente: %w", err)
	}
	res, err := s.GetByID(ctx, c.ID)
	if err != nil {
		return nil, err
	}
	return &res.Customer, nil
}

func (s *CustomerService) ToggleActive(ctx context.Context, id string) (bool, error) {
	var current bool
	err := s.db.QueryRowContext(ctx, "SELECT is_active FROM customers WHERE id = $1", id).Scan(&current)
	if err != nil {
		return false, err
	}
	newVal := !current
	_, err = s.db.ExecContext(ctx, "UPDATE customers SET is_active = $1, updated_at = NOW() WHERE id = $2", newVal, id)
	return newVal, err
}
