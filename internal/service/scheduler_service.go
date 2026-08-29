package service

import (
	"context"
	"database/sql"
	"log"
	"time"

	"order-integration-hub/internal/domain"
)

type SchedulerService struct {
	db          *sql.DB
	syncService *SyncService
}

func NewSchedulerService(db *sql.DB, syncSvc *SyncService) *SchedulerService {
	return &SchedulerService{
		db:          db,
		syncService: syncSvc,
	}
}

func (s *SchedulerService) GetTasks(ctx context.Context) ([]domain.SchedulerTask, error) {
	query := `
		SELECT i.id, i.name, c.id, c.name, i.provider, i.polling_enabled,
		       i.polling_interval_minutes, i.next_polling_at, i.last_sync_at,
		       i.status, i.avg_response_time_ms,
		       CASE WHEN l.integration_id IS NOT NULL THEN true ELSE false END AS is_locked
		FROM integrations i
		JOIN customers c ON i.customer_id = c.id
		LEFT JOIN execution_locks l ON i.id = l.integration_id
		ORDER BY i.polling_enabled DESC, i.next_polling_at ASC
	`
	rows, err := s.db.QueryContext(ctx, query)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var list []domain.SchedulerTask
	for rows.Next() {
		var t domain.SchedulerTask
		if err := rows.Scan(&t.IntegrationID, &t.IntegrationName, &t.CustomerID, &t.CustomerName,
			&t.Provider, &t.PollingEnabled, &t.IntervalMinutes, &t.NextRunAt, &t.LastRunAt,
			&t.Status, &t.AvgDurationMs, &t.IsLocked); err != nil {
			return nil, err
		}
		list = append(list, t)
	}
	return list, nil
}

// RunPendingPolls finds all due integrations and triggers execution concurrently with locking
func (s *SchedulerService) RunPendingPolls(ctx context.Context) int {
	now := time.Now()
	rows, err := s.db.QueryContext(ctx, `
		SELECT id
		FROM integrations
		WHERE polling_enabled = true
		  AND status != 'DISABLED'
		  AND (next_polling_at IS NULL OR next_polling_at <= $1)
	`, now)
	if err != nil {
		log.Printf("[Scheduler] Error querying pending polls: %v", err)
		return 0
	}
	defer rows.Close()

	var dueIDs []string
	for rows.Next() {
		var id string
		if err := rows.Scan(&id); err == nil {
			dueIDs = append(dueIDs, id)
		}
	}

	triggered := 0
	for _, id := range dueIDs {
		intID := id
		triggered++
		go func() {
			execCtx, cancel := context.WithTimeout(context.Background(), 2*time.Minute)
			defer cancel()
			log.Printf("[Scheduler] Triggering scheduled poll for integration %s", intID)
			_, err := s.syncService.ExecuteSync(execCtx, intID, "SCHEDULED")
			if err != nil {
				log.Printf("[Scheduler] Poll execution failed for %s: %v", intID, err)
			}
		}()
	}

	return triggered
}
