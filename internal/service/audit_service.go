package service

import (
	"context"
	"database/sql"
	"encoding/json"
	"fmt"

	"order-integration-hub/internal/domain"

	"github.com/google/uuid"
)

type AuditService struct {
	db *sql.DB
}

func NewAuditService(db *sql.DB) *AuditService {
	return &AuditService{db: db}
}

type AuditFilter struct {
	Action     string
	EntityType string
	Search     string
	Page       int
	Limit      int
}

type PaginatedAuditResponse struct {
	AuditLogs  []domain.AuditLog `json:"audit_logs"`
	TotalCount int64             `json:"total_count"`
	Page       int               `json:"page"`
	Limit      int               `json:"limit"`
	TotalPages int               `json:"total_pages"`
}

func (s *AuditService) Log(ctx context.Context, userID, userEmail, action, entityType, entityID, ip string, oldVal, newVal interface{}) {
	id := "aud-" + uuid.New().String()[:8]

	oldJSON, _ := json.Marshal(oldVal)
	newJSON, _ := json.Marshal(newVal)

	_, err := s.db.ExecContext(ctx, `
		INSERT INTO audit_logs (id, user_id, user_email, action, entity_type, entity_id, old_values, new_values, ip_address, created_at)
		VALUES ($1, $2, $3, $4, $5, $6, $7::jsonb, $8::jsonb, $9, NOW())
	`, id, userID, userEmail, action, entityType, entityID, string(oldJSON), string(newJSON), ip)
	if err != nil {
		fmt.Printf("[Audit] Error inserting audit log: %v\n", err)
	}
}

func (s *AuditService) List(ctx context.Context, f AuditFilter) (*PaginatedAuditResponse, error) {
	if f.Page <= 0 {
		f.Page = 1
	}
	if f.Limit <= 0 || f.Limit > 100 {
		f.Limit = 50
	}
	offset := (f.Page - 1) * f.Limit

	baseQuery := `
		FROM audit_logs
		WHERE ($1 = '' OR action = $1)
		  AND ($2 = '' OR entity_type = $2)
		  AND ($3 = '' OR user_email ILIKE '%' || $3 || '%' OR entity_id ILIKE '%' || $3 || '%')
	`

	var total int64
	err := s.db.QueryRowContext(ctx, "SELECT COUNT(*) "+baseQuery, f.Action, f.EntityType, f.Search).Scan(&total)
	if err != nil {
		return nil, err
	}

	selectQuery := `
		SELECT id, user_id, user_email, action, entity_type, entity_id, old_values, new_values, ip_address, created_at
	` + baseQuery + `
		ORDER BY created_at DESC
		LIMIT $4 OFFSET $5
	`

	rows, err := s.db.QueryContext(ctx, selectQuery, f.Action, f.EntityType, f.Search, f.Limit, offset)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var logs []domain.AuditLog
	for rows.Next() {
		var a domain.AuditLog
		if err := rows.Scan(&a.ID, &a.UserID, &a.UserEmail, &a.Action, &a.EntityType, &a.EntityID,
			&a.OldValues, &a.NewValues, &a.IPAddress, &a.CreatedAt); err != nil {
			return nil, err
		}
		logs = append(logs, a)
	}

	totalPages := int((total + int64(f.Limit) - 1) / int64(f.Limit))
	return &PaginatedAuditResponse{
		AuditLogs:  logs,
		TotalCount: total,
		Page:       f.Page,
		Limit:      f.Limit,
		TotalPages: totalPages,
	}, nil
}
