package service

import (
	"context"
	"database/sql"
	"encoding/json"
	"errors"
	"fmt"
	"strings"
	"time"

	"order-integration-hub/internal/adapter"
	"order-integration-hub/internal/domain"

	"github.com/google/uuid"
)

type IntegrationService struct {
	db              *sql.DB
	adapterRegistry *adapter.Registry
}

func NewIntegrationService(db *sql.DB, reg *adapter.Registry) *IntegrationService {
	return &IntegrationService{
		db:              db,
		adapterRegistry: reg,
	}
}

type IntegrationFilter struct {
	CustomerID string
	Provider   string
	Status     string
	Search     string
}

func (s *IntegrationService) List(ctx context.Context, filter IntegrationFilter) ([]domain.Integration, error) {
	query := `
		SELECT i.id, i.customer_id, c.name AS customer_name, c.code AS customer_code,
		       i.name, i.provider, i.base_url, i.auth_type, i.status, COALESCE(i.environment, 'TEST'), i.polling_enabled,
		       i.polling_interval_minutes, COALESCE(i.sync_batch_size, 10), i.last_sync_at, i.next_polling_at, i.total_orders_synced,
		       i.consecutive_errors, COALESCE(i.last_error, ''), i.avg_response_time_ms, i.created_at, i.updated_at
		FROM integrations i
		JOIN customers c ON i.customer_id = c.id
		WHERE ($1 = '' OR i.customer_id = $1)
		  AND ($2 = '' OR i.provider = $2)
		  AND ($3 = '' OR i.status = $3)
		  AND ($4 = '' OR i.name ILIKE '%' || $4 || '%' OR c.name ILIKE '%' || $4 || '%')
		ORDER BY i.name ASC
	`
	rows, err := s.db.QueryContext(ctx, query, filter.CustomerID, filter.Provider, filter.Status, filter.Search)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var list []domain.Integration
	for rows.Next() {
		var it domain.Integration
		if err := rows.Scan(&it.ID, &it.CustomerID, &it.CustomerName, &it.CustomerCode,
			&it.Name, &it.Provider, &it.BaseURL, &it.AuthType, &it.Status, &it.Environment, &it.PollingEnabled,
			&it.PollingIntervalMinutes, &it.SyncBatchSize, &it.LastSyncAt, &it.NextPollingAt, &it.TotalOrdersSynced,
			&it.ConsecutiveErrors, &it.LastError, &it.AvgResponseTimeMs, &it.CreatedAt, &it.UpdatedAt); err != nil {
			return nil, err
		}
		it.MaskedCredentials = "••••••••••••••••"
		list = append(list, it)
	}
	return list, nil
}

func (s *IntegrationService) GetByID(ctx context.Context, id string) (*domain.Integration, error) {
	row := s.db.QueryRowContext(ctx, `
		SELECT i.id, i.customer_id, c.name AS customer_name, c.code AS customer_code,
		       i.name, i.provider, i.base_url, i.auth_type, i.credentials, i.status, COALESCE(i.environment, 'TEST'), i.polling_enabled,
		       i.polling_interval_minutes, COALESCE(i.sync_batch_size, 10), i.last_sync_at, i.next_polling_at, i.total_orders_synced,
		       i.consecutive_errors, COALESCE(i.last_error, ''), i.avg_response_time_ms, i.created_at, i.updated_at
		FROM integrations i
		JOIN customers c ON i.customer_id = c.id
		WHERE i.id = $1
	`, id)

	var it domain.Integration
	if err := row.Scan(&it.ID, &it.CustomerID, &it.CustomerName, &it.CustomerCode,
		&it.Name, &it.Provider, &it.BaseURL, &it.AuthType, &it.Credentials, &it.Status, &it.Environment, &it.PollingEnabled,
		&it.PollingIntervalMinutes, &it.SyncBatchSize, &it.LastSyncAt, &it.NextPollingAt, &it.TotalOrdersSynced,
		&it.ConsecutiveErrors, &it.LastError, &it.AvgResponseTimeMs, &it.CreatedAt, &it.UpdatedAt); err != nil {
		if errors.Is(err, sql.ErrNoRows) {
			return nil, errors.New("integración no encontrada")
		}
		return nil, err
	}
	it.MaskedCredentials = maskCredentials(it.Credentials)
	return &it, nil
}

type CreateIntegrationRequest struct {
	CustomerID             string                 `json:"customer_id"`
	Name                   string                 `json:"name"`
	Provider               string                 `json:"provider"`
	BaseURL                string                 `json:"base_url"`
	AuthType               string                 `json:"auth_type"`
	Credentials            map[string]interface{} `json:"credentials"`
	Environment            string                 `json:"environment"`
	PollingEnabled         bool                   `json:"polling_enabled"`
	PollingIntervalMinutes int                    `json:"polling_interval_minutes"`
	SyncBatchSize          int                    `json:"sync_batch_size"`
}

func (s *IntegrationService) Create(ctx context.Context, req CreateIntegrationRequest) (*domain.Integration, error) {
	id := "int-" + uuid.New().String()[:8]
	credJSON, err := json.Marshal(req.Credentials)
	if err != nil {
		return nil, err
	}

	if req.Environment == "" {
		req.Environment = domain.EnvTest
	}

	if req.PollingIntervalMinutes <= 0 {
		req.PollingIntervalMinutes = 15
	}
	if req.SyncBatchSize <= 0 {
		req.SyncBatchSize = 10
	}
	nextPoll := time.Now().Add(time.Duration(req.PollingIntervalMinutes) * time.Minute)

	_, err = s.db.ExecContext(ctx, `
		INSERT INTO integrations (
			id, customer_id, name, provider, base_url, auth_type, credentials,
			status, environment, polling_enabled, polling_interval_minutes, sync_batch_size, next_polling_at, created_at, updated_at
		)
		VALUES ($1, $2, $3, $4, $5, $6, $7, 'ACTIVE', $8, $9, $10, $11, $12, NOW(), NOW())
	`, id, req.CustomerID, req.Name, req.Provider, req.BaseURL, req.AuthType, string(credJSON), req.Environment, req.PollingEnabled, req.PollingIntervalMinutes, req.SyncBatchSize, nextPoll)
	if err != nil {
		return nil, fmt.Errorf("error al crear integración: %w", err)
	}

	return s.GetByID(ctx, id)
}

type UpdateIntegrationRequest struct {
	Name                   string                 `json:"name"`
	BaseURL                string                 `json:"base_url"`
	AuthType               string                 `json:"auth_type"`
	Credentials            map[string]interface{} `json:"credentials,omitempty"`
	Environment            string                 `json:"environment"`
	PollingEnabled         bool                   `json:"polling_enabled"`
	PollingIntervalMinutes int                    `json:"polling_interval_minutes"`
	SyncBatchSize          int                    `json:"sync_batch_size"`
	Status                 string                 `json:"status"`
}

func (s *IntegrationService) Update(ctx context.Context, id string, req UpdateIntegrationRequest) (*domain.Integration, error) {
	existing, err := s.GetByID(ctx, id)
	if err != nil {
		return nil, err
	}

	credJSON := existing.Credentials
	if req.Credentials != nil && len(req.Credentials) > 0 {
		var existingMap map[string]interface{}
		_ = json.Unmarshal(existing.Credentials, &existingMap)
		if existingMap == nil {
			existingMap = make(map[string]interface{})
		}
		for k, v := range req.Credentials {
			strVal, ok := v.(string)
			if ok && (strVal == "" || strings.HasPrefix(strVal, "••••")) {
				continue // Keep existing secret
			}
			existingMap[k] = v
		}
		credJSON, _ = json.Marshal(existingMap)
	}

	if req.Environment == "" {
		req.Environment = existing.Environment
	}

	if req.Status == "" {
		req.Status = existing.Status
	}

	if req.PollingIntervalMinutes <= 0 {
		req.PollingIntervalMinutes = existing.PollingIntervalMinutes
	}
	if req.SyncBatchSize <= 0 {
		req.SyncBatchSize = existing.SyncBatchSize
	}
	if req.SyncBatchSize <= 0 {
		req.SyncBatchSize = 10
	}

	_, err = s.db.ExecContext(ctx, `
		UPDATE integrations
		SET name = $1, base_url = $2, auth_type = $3, credentials = $4,
		    polling_enabled = $5, polling_interval_minutes = $6, status = $7, environment = $8, sync_batch_size = $9, updated_at = NOW()
		WHERE id = $10
	`, req.Name, req.BaseURL, req.AuthType, string(credJSON), req.PollingEnabled, req.PollingIntervalMinutes, req.Status, req.Environment, req.SyncBatchSize, id)
	if err != nil {
		return nil, fmt.Errorf("error al actualizar integración: %w", err)
	}

	return s.GetByID(ctx, id)
}

func (s *IntegrationService) ToggleEnvironment(ctx context.Context, id string) (string, error) {
	var current string
	err := s.db.QueryRowContext(ctx, "SELECT COALESCE(environment, 'TEST') FROM integrations WHERE id = $1", id).Scan(&current)
	if err != nil {
		return "", err
	}
	newVal := domain.EnvProduction
	if current == domain.EnvProduction {
		newVal = domain.EnvTest
	}
	_, err = s.db.ExecContext(ctx, "UPDATE integrations SET environment = $1, updated_at = NOW() WHERE id = $2", newVal, id)
	return newVal, err
}

func (s *IntegrationService) ToggleStatus(ctx context.Context, id string) (string, error) {
	var current string
	err := s.db.QueryRowContext(ctx, "SELECT status FROM integrations WHERE id = $1", id).Scan(&current)
	if err != nil {
		return "", err
	}
	newStatus := "DISABLED"
	newPolling := false
	if current == "DISABLED" {
		newStatus = "ACTIVE"
		newPolling = true
	}
	_, err = s.db.ExecContext(ctx, "UPDATE integrations SET status = $1, polling_enabled = $2, updated_at = NOW() WHERE id = $3", newStatus, newPolling, id)
	return newStatus, err
}

func (s *IntegrationService) Delete(ctx context.Context, id string) error {
	_, err := s.db.ExecContext(ctx, "DELETE FROM integrations WHERE id = $1", id)
	return err
}

func (s *IntegrationService) TogglePolling(ctx context.Context, id string) (bool, error) {
	var current bool
	err := s.db.QueryRowContext(ctx, "SELECT polling_enabled FROM integrations WHERE id = $1", id).Scan(&current)
	if err != nil {
		return false, err
	}
	newVal := !current
	_, err = s.db.ExecContext(ctx, "UPDATE integrations SET polling_enabled = $1, updated_at = NOW() WHERE id = $2", newVal, id)
	return newVal, err
}

func (s *IntegrationService) TestConnection(ctx context.Context, id string) (*domain.ProviderTestResult, error) {
	it, err := s.GetByID(ctx, id)
	if err != nil {
		return nil, err
	}

	adp, err := s.adapterRegistry.Get(it.Provider)
	if err != nil {
		return nil, err
	}

	res, err := adp.TestConnection(ctx, it)
	if err != nil {
		return nil, err
	}

	// Update average response time if valid
	if res.LatencyMs > 0 {
		_, _ = s.db.ExecContext(ctx, `
			UPDATE integrations
			SET avg_response_time_ms = (avg_response_time_ms + $1) / 2, updated_at = NOW()
			WHERE id = $2
		`, int(res.LatencyMs), id)
	}

	return res, nil
}

func maskCredentials(raw json.RawMessage) string {
	var m map[string]interface{}
	if err := json.Unmarshal(raw, &m); err != nil || len(m) == 0 {
		return "••••••••"
	}
	var parts []string
	for k, v := range m {
		valStr := fmt.Sprintf("%v", v)
		if len(valStr) > 4 {
			valStr = valStr[:2] + strings.Repeat("•", len(valStr)-4) + valStr[len(valStr)-2:]
		} else {
			valStr = "••••"
		}
		parts = append(parts, fmt.Sprintf("%s: %s", k, valStr))
	}
	return strings.Join(parts, " | ")
}
