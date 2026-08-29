package service

import (
	"context"
	"database/sql"
	"errors"
	"fmt"
	"time"

	"order-integration-hub/internal/domain"
)

type JobService struct {
	db *sql.DB
}

func NewJobService(db *sql.DB) *JobService {
	return &JobService{db: db}
}

type JobFilter struct {
	CustomerID    string
	IntegrationID string
	Provider      string
	Status        string
	DateFrom      *time.Time
	DateTo        *time.Time
	Page          int
	Limit         int
}

type PaginatedJobsResponse struct {
	Jobs       []domain.SyncJob `json:"jobs"`
	TotalCount int64            `json:"total_count"`
	Page       int              `json:"page"`
	Limit      int              `json:"limit"`
	TotalPages int              `json:"total_pages"`
}

type JobDetailResponse struct {
	Job  domain.SyncJob   `json:"job"`
	Logs []domain.SyncLog `json:"logs"`
}

func (s *JobService) List(ctx context.Context, f JobFilter) (*PaginatedJobsResponse, error) {
	if f.Page <= 0 {
		f.Page = 1
	}
	if f.Limit <= 0 || f.Limit > 100 {
		f.Limit = 25
	}
	offset := (f.Page - 1) * f.Limit

	baseQuery := `
		FROM sync_jobs j
		JOIN integrations i ON j.integration_id = i.id
		JOIN customers c ON i.customer_id = c.id
		WHERE ($1 = '' OR i.customer_id = $1)
		  AND ($2 = '' OR j.integration_id = $2)
		  AND ($3 = '' OR i.provider = $3)
		  AND ($4 = '' OR j.status = $4)
		  AND ($5::timestamptz IS NULL OR j.started_at >= $5)
		  AND ($6::timestamptz IS NULL OR j.started_at <= $6)
	`

	var total int64
	err := s.db.QueryRowContext(ctx, "SELECT COUNT(*) "+baseQuery,
		f.CustomerID, f.IntegrationID, f.Provider, f.Status, f.DateFrom, f.DateTo).Scan(&total)
	if err != nil {
		return nil, fmt.Errorf("error counting sync jobs: %w", err)
	}

	selectQuery := `
		SELECT j.id, j.integration_id, i.name AS integration_name,
		       c.id AS customer_id, c.name AS customer_name, i.provider,
		       j.trigger_type, j.status, j.started_at, j.finished_at, j.duration_ms,
		       j.orders_found, j.orders_new, j.orders_updated, j.orders_failed,
		       j.retries_count, COALESCE(j.error_message, ''), j.details, j.created_at
	` + baseQuery + `
		ORDER BY j.started_at DESC
		LIMIT $7 OFFSET $8
	`

	rows, err := s.db.QueryContext(ctx, selectQuery,
		f.CustomerID, f.IntegrationID, f.Provider, f.Status, f.DateFrom, f.DateTo, f.Limit, offset)
	if err != nil {
		return nil, fmt.Errorf("error fetching sync jobs: %w", err)
	}
	defer rows.Close()

	var jobs []domain.SyncJob
	for rows.Next() {
		var j domain.SyncJob
		if err := rows.Scan(&j.ID, &j.IntegrationID, &j.IntegrationName,
			&j.CustomerID, &j.CustomerName, &j.Provider,
			&j.TriggerType, &j.Status, &j.StartedAt, &j.FinishedAt, &j.DurationMs,
			&j.OrdersFound, &j.OrdersNew, &j.OrdersUpdated, &j.OrdersFailed,
			&j.RetriesCount, &j.ErrorMessage, &j.Details, &j.CreatedAt); err != nil {
			return nil, err
		}
		jobs = append(jobs, j)
	}

	totalPages := int((total + int64(f.Limit) - 1) / int64(f.Limit))
	return &PaginatedJobsResponse{
		Jobs:       jobs,
		TotalCount: total,
		Page:       f.Page,
		Limit:      f.Limit,
		TotalPages: totalPages,
	}, nil
}

func (s *JobService) GetByID(ctx context.Context, id string) (*JobDetailResponse, error) {
	row := s.db.QueryRowContext(ctx, `
		SELECT j.id, j.integration_id, i.name AS integration_name,
		       c.id AS customer_id, c.name AS customer_name, i.provider,
		       j.trigger_type, j.status, j.started_at, j.finished_at, j.duration_ms,
		       j.orders_found, j.orders_new, j.orders_updated, j.orders_failed,
		       j.retries_count, COALESCE(j.error_message, ''), j.details, j.created_at
		FROM sync_jobs j
		JOIN integrations i ON j.integration_id = i.id
		JOIN customers c ON i.customer_id = c.id
		WHERE j.id = $1
	`, id)

	var j domain.SyncJob
	if err := row.Scan(&j.ID, &j.IntegrationID, &j.IntegrationName,
		&j.CustomerID, &j.CustomerName, &j.Provider,
		&j.TriggerType, &j.Status, &j.StartedAt, &j.FinishedAt, &j.DurationMs,
		&j.OrdersFound, &j.OrdersNew, &j.OrdersUpdated, &j.OrdersFailed,
		&j.RetriesCount, &j.ErrorMessage, &j.Details, &j.CreatedAt); err != nil {
		if errors.Is(err, sql.ErrNoRows) {
			return nil, errors.New("ejecución de sincronización no encontrada")
		}
		return nil, err
	}

	// Fetch logs for this job
	logRows, err := s.db.QueryContext(ctx, `
		SELECT id, sync_job_id, integration_id, customer_id, provider, level,
		       operation_type, request_id, correlation_id, duration_ms, result, message, details, created_at
		FROM sync_logs
		WHERE sync_job_id = $1
		ORDER BY created_at ASC
	`, id)
	var logs []domain.SyncLog
	if err == nil {
		defer logRows.Close()
		for logRows.Next() {
			var l domain.SyncLog
			if err := logRows.Scan(&l.ID, &l.SyncJobID, &l.IntegrationID, &l.CustomerID, &l.Provider, &l.Level,
				&l.OperationType, &l.RequestID, &l.CorrelationID, &l.DurationMs, &l.Result, &l.Message, &l.Details, &l.CreatedAt); err == nil {
				logs = append(logs, l)
			}
		}
	}

	return &JobDetailResponse{
		Job:  j,
		Logs: logs,
	}, nil
}
