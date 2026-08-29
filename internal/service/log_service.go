package service

import (
	"context"
	"database/sql"
	"fmt"
	"time"

	"order-integration-hub/internal/domain"
)

type LogService struct {
	db *sql.DB
}

func NewLogService(db *sql.DB) *LogService {
	return &LogService{db: db}
}

type LogFilter struct {
	CustomerID    string
	IntegrationID string
	Provider      string
	Level         string
	RequestID     string
	CorrelationID string
	Search        string
	DateFrom      *time.Time
	DateTo        *time.Time
	Page          int
	Limit         int
}

type PaginatedLogsResponse struct {
	Logs       []domain.SyncLog `json:"logs"`
	TotalCount int64            `json:"total_count"`
	Page       int              `json:"page"`
	Limit      int              `json:"limit"`
	TotalPages int              `json:"total_pages"`
}

func (s *LogService) List(ctx context.Context, f LogFilter) (*PaginatedLogsResponse, error) {
	if f.Page <= 0 {
		f.Page = 1
	}
	if f.Limit <= 0 || f.Limit > 100 {
		f.Limit = 50
	}
	offset := (f.Page - 1) * f.Limit

	baseQuery := `
		FROM sync_logs l
		LEFT JOIN integrations i ON l.integration_id = i.id
		LEFT JOIN customers c ON l.customer_id = c.id
		WHERE ($1 = '' OR l.customer_id = $1)
		  AND ($2 = '' OR l.integration_id = $2)
		  AND ($3 = '' OR l.provider = $3)
		  AND ($4 = '' OR l.level = $4)
		  AND ($5 = '' OR l.request_id ILIKE '%' || $5 || '%')
		  AND ($6 = '' OR l.correlation_id ILIKE '%' || $6 || '%')
		  AND ($7 = '' OR l.message ILIKE '%' || $7 || '%' OR l.operation_type ILIKE '%' || $7 || '%')
		  AND ($8::timestamptz IS NULL OR l.created_at >= $8)
		  AND ($9::timestamptz IS NULL OR l.created_at <= $9)
	`

	var total int64
	countQuery := "SELECT COUNT(*) " + baseQuery
	err := s.db.QueryRowContext(ctx, countQuery, f.CustomerID, f.IntegrationID, f.Provider, f.Level,
		f.RequestID, f.CorrelationID, f.Search, f.DateFrom, f.DateTo).Scan(&total)
	if err != nil {
		return nil, fmt.Errorf("error counting logs: %w", err)
	}

	selectQuery := `
		SELECT l.id, l.sync_job_id, l.integration_id, COALESCE(i.name, ''),
		       l.customer_id, COALESCE(c.name, ''), l.provider, l.level,
		       l.operation_type, l.request_id, l.correlation_id, l.duration_ms,
		       l.result, l.message, l.details, l.created_at
	` + baseQuery + `
		ORDER BY l.created_at DESC
		LIMIT $10 OFFSET $11
	`

	rows, err := s.db.QueryContext(ctx, selectQuery, f.CustomerID, f.IntegrationID, f.Provider, f.Level,
		f.RequestID, f.CorrelationID, f.Search, f.DateFrom, f.DateTo, f.Limit, offset)
	if err != nil {
		return nil, fmt.Errorf("error fetching logs: %w", err)
	}
	defer rows.Close()

	var logs []domain.SyncLog
	for rows.Next() {
		var l domain.SyncLog
		if err := rows.Scan(&l.ID, &l.SyncJobID, &l.IntegrationID, &l.IntegrationName,
			&l.CustomerID, &l.CustomerName, &l.Provider, &l.Level,
			&l.OperationType, &l.RequestID, &l.CorrelationID, &l.DurationMs,
			&l.Result, &l.Message, &l.Details, &l.CreatedAt); err != nil {
			return nil, err
		}
		logs = append(logs, l)
	}

	totalPages := int((total + int64(f.Limit) - 1) / int64(f.Limit))
	return &PaginatedLogsResponse{
		Logs:       logs,
		TotalCount: total,
		Page:       f.Page,
		Limit:      f.Limit,
		TotalPages: totalPages,
	}, nil
}
