package service

import (
	"context"
	"database/sql"

	"order-integration-hub/internal/domain"
)

type NotificationService struct {
	db *sql.DB
}

func NewNotificationService(db *sql.DB) *NotificationService {
	return &NotificationService{db: db}
}

type NotificationSummary struct {
	Notifications []domain.Notification `json:"notifications"`
	UnreadCount   int                   `json:"unread_count"`
}

func (s *NotificationService) List(ctx context.Context, unreadOnly bool) (*NotificationSummary, error) {
	query := `
		SELECT n.id, n.title, n.message, n.severity, n.integration_id, COALESCE(i.name, ''),
		       n.customer_id, n.is_read, n.created_at
		FROM notifications n
		LEFT JOIN integrations i ON n.integration_id = i.id
		WHERE ($1 = false OR n.is_read = false)
		ORDER BY n.created_at DESC
		LIMIT 50
	`
	rows, err := s.db.QueryContext(ctx, query, unreadOnly)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var list []domain.Notification
	for rows.Next() {
		var n domain.Notification
		if err := rows.Scan(&n.ID, &n.Title, &n.Message, &n.Severity, &n.IntegrationID, &n.IntegrationName,
			&n.CustomerID, &n.IsRead, &n.CreatedAt); err != nil {
			return nil, err
		}
		list = append(list, n)
	}

	var unreadCount int
	_ = s.db.QueryRowContext(ctx, "SELECT COUNT(*) FROM notifications WHERE is_read = false").Scan(&unreadCount)

	return &NotificationSummary{
		Notifications: list,
		UnreadCount:   unreadCount,
	}, nil
}

func (s *NotificationService) MarkAsRead(ctx context.Context, id string) error {
	_, err := s.db.ExecContext(ctx, "UPDATE notifications SET is_read = true WHERE id = $1", id)
	return err
}

func (s *NotificationService) MarkAllAsRead(ctx context.Context) error {
	_, err := s.db.ExecContext(ctx, "UPDATE notifications SET is_read = true WHERE is_read = false")
	return err
}
