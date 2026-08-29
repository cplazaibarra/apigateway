package service

import (
	"context"
	"database/sql"
	"encoding/json"
	"fmt"
	"log"
	"net/smtp"
	"strings"
	"sync"
	"time"

	"order-integration-hub/internal/domain"

	"github.com/google/uuid"
)

type AlertService struct {
	db       *sql.DB
	cooldown sync.Map // key: ruleID:integrationID -> time.Time
}

func NewAlertService(db *sql.DB) *AlertService {
	return &AlertService{db: db}
}

func (s *AlertService) List(ctx context.Context) ([]domain.AlertRule, error) {
	rows, err := s.db.QueryContext(ctx, `
		SELECT r.id, r.name, r.customer_id, COALESCE(c.name, ''),
		       r.integration_id, COALESCE(i.name, ''), COALESCE(r.provider, ''),
		       r.event_type, r.severity, r.consecutive_failures, r.threshold_seconds,
		       r.recipients, r.enabled, r.cooldown_minutes, r.last_triggered_at,
		       r.created_at, r.updated_at
		FROM alert_rules r
		LEFT JOIN customers c ON r.customer_id = c.id
		LEFT JOIN integrations i ON r.integration_id = i.id
		ORDER BY r.created_at DESC
	`)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var list []domain.AlertRule
	for rows.Next() {
		var r domain.AlertRule
		var recJSON []byte
		if err := rows.Scan(&r.ID, &r.Name, &r.CustomerID, &r.CustomerName,
			&r.IntegrationID, &r.IntegrationName, &r.Provider,
			&r.EventType, &r.Severity, &r.ConsecutiveFailures, &r.ThresholdSeconds,
			&recJSON, &r.Enabled, &r.CooldownMinutes, &r.LastTriggeredAt,
			&r.CreatedAt, &r.UpdatedAt); err != nil {
			return nil, err
		}
		_ = json.Unmarshal(recJSON, &r.Recipients)
		list = append(list, r)
	}
	return list, nil
}

func (s *AlertService) Create(ctx context.Context, r *domain.AlertRule) (*domain.AlertRule, error) {
	if r.ID == "" {
		r.ID = "rule-" + uuid.New().String()[:8]
	}
	if r.CooldownMinutes <= 0 {
		r.CooldownMinutes = 30
	}
	recJSON, _ := json.Marshal(r.Recipients)

	_, err := s.db.ExecContext(ctx, `
		INSERT INTO alert_rules (
			id, name, customer_id, integration_id, provider, event_type, severity,
			consecutive_failures, threshold_seconds, recipients, enabled, cooldown_minutes,
			created_at, updated_at
		)
		VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, NOW(), NOW())
	`, r.ID, r.Name, r.CustomerID, r.IntegrationID, r.Provider, r.EventType, r.Severity,
		r.ConsecutiveFailures, r.ThresholdSeconds, string(recJSON), r.Enabled, r.CooldownMinutes)
	if err != nil {
		return nil, fmt.Errorf("error al crear regla de alerta: %w", err)
	}
	return r, nil
}

func (s *AlertService) Update(ctx context.Context, id string, r *domain.AlertRule) (*domain.AlertRule, error) {
	recJSON, _ := json.Marshal(r.Recipients)
	_, err := s.db.ExecContext(ctx, `
		UPDATE alert_rules
		SET name = $1, customer_id = $2, integration_id = $3, provider = $4,
		    event_type = $5, severity = $6, consecutive_failures = $7, threshold_seconds = $8,
		    recipients = $9, enabled = $10, cooldown_minutes = $11, updated_at = NOW()
		WHERE id = $12
	`, r.Name, r.CustomerID, r.IntegrationID, r.Provider, r.EventType, r.Severity,
		r.ConsecutiveFailures, r.ThresholdSeconds, string(recJSON), r.Enabled, r.CooldownMinutes, id)
	if err != nil {
		return nil, fmt.Errorf("error al actualizar regla de alerta: %w", err)
	}
	r.ID = id
	return r, nil
}

func (s *AlertService) Delete(ctx context.Context, id string) error {
	_, err := s.db.ExecContext(ctx, "DELETE FROM alert_rules WHERE id = $1", id)
	return err
}

// EvaluateRule checks if an event triggers any active alert rule with cooldown deduplication
func (s *AlertService) EvaluateRule(ctx context.Context, integrationID, customerID, provider, eventType string, consecFailures int, latencyMs int, errorDetails string) error {
	rules, err := s.List(ctx)
	if err != nil {
		return err
	}

	for _, rule := range rules {
		if !rule.Enabled {
			continue
		}
		if rule.EventType != eventType && rule.EventType != "INTEGRATION_FAILED" {
			continue
		}
		if rule.IntegrationID != nil && *rule.IntegrationID != "" && *rule.IntegrationID != integrationID {
			continue
		}
		if rule.CustomerID != nil && *rule.CustomerID != "" && *rule.CustomerID != customerID {
			continue
		}
		if rule.Provider != "" && !strings.EqualFold(rule.Provider, provider) {
			continue
		}
		if consecFailures < rule.ConsecutiveFailures {
			continue
		}

		// Check Cooldown
		key := fmt.Sprintf("%s:%s", rule.ID, integrationID)
		if lastSent, ok := s.cooldown.Load(key); ok {
			if t, okTime := lastSent.(time.Time); okTime {
				if time.Since(t) < time.Duration(rule.CooldownMinutes)*time.Minute {
					log.Printf("[Alerts] Cooldown active for rule %s on integration %s, skipping email", rule.Name, integrationID)
					continue
				}
			}
		}

		// Dispatch Email & Record Timestamp
		now := time.Now()
		s.cooldown.Store(key, now)
		_, _ = s.db.ExecContext(ctx, "UPDATE alert_rules SET last_triggered_at = $1 WHERE id = $2", now, rule.ID)

		go s.dispatchEmailAlert(rule, integrationID, errorDetails)
	}
	return nil
}

func (s *AlertService) dispatchEmailAlert(rule domain.AlertRule, integrationID, errorDetails string) {
	if len(rule.Recipients) == 0 {
		return
	}

	// Fetch SMTP config
	var host, username, password, fromAddress, fromName string
	var port int
	var useTLS bool

	err := s.db.QueryRow(`
		SELECT host, port, username, password, use_tls, from_address, from_name
		FROM smtp_config WHERE id = 'primary'
	`).Scan(&host, &port, &username, &password, &useTLS, &fromAddress, &fromName)
	if err != nil || host == "" {
		log.Printf("[Alerts] Email dispatch skipped: SMTP not configured")
		return
	}

	subject := fmt.Sprintf("[%s] ALERTA: %s en Integración %s", rule.Severity, rule.Name, integrationID)
	body := fmt.Sprintf(
		"From: %s <%s>\r\n"+
			"To: %s\r\n"+
			"Subject: %s\r\n"+
			"MIME-Version: 1.0\r\n"+
			"Content-Type: text/plain; charset=UTF-8\r\n\r\n"+
			"ALERTA OPERACIONAL - ORDER INTEGRATION HUB\n\n"+
			"Regla: %s\n"+
			"Severidad: %s\n"+
			"Integración: %s\n"+
			"Fecha/Hora: %s\n\n"+
			"Detalle del Incidente:\n%s\n\n"+
			"Este mensaje fue generado automáticamente. Cooldown de %d minutos aplicado.\n",
		fromName, fromAddress, strings.Join(rule.Recipients, ", "), subject,
		rule.Name, rule.Severity, integrationID, time.Now().Format(time.RFC3339),
		errorDetails, rule.CooldownMinutes,
	)

	// In sandbox/testing mode, if credentials are mock, log cleanly
	if strings.Contains(host, "mailtrap") || strings.Contains(host, "example") {
		log.Printf("[Alerts Mock] Simulated Email Sent to %v | Subject: %s", rule.Recipients, subject)
		return
	}

	var auth smtp.Auth
	if username != "" && password != "" {
		auth = smtp.PlainAuth("", username, password, host)
	}

	addr := fmt.Sprintf("%s:%d", host, port)
	if err := smtp.SendMail(addr, auth, fromAddress, rule.Recipients, []byte(body)); err != nil {
		log.Printf("[Alerts] Failed to send email alert: %v", err)
	} else {
		log.Printf("[Alerts] Email alert sent successfully to %v", rule.Recipients)
	}
}
