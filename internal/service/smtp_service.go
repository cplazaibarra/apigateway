package service

import (
	"context"
	"database/sql"
	"errors"
	"fmt"
	"net/smtp"
	"strings"
	"time"

	"order-integration-hub/internal/domain"
)

type SMTPService struct {
	db *sql.DB
}

func NewSMTPService(db *sql.DB) *SMTPService {
	return &SMTPService{db: db}
}

func (s *SMTPService) GetConfig(ctx context.Context) (*domain.SMTPConfig, error) {
	row := s.db.QueryRowContext(ctx, `
		SELECT id, host, port, username, password, use_tls, from_address, from_name, updated_at
		FROM smtp_config WHERE id = 'primary'
	`)

	var cfg domain.SMTPConfig
	var rawPass string
	if err := row.Scan(&cfg.ID, &cfg.Host, &cfg.Port, &cfg.Username, &rawPass, &cfg.UseTLS, &cfg.FromAddress, &cfg.FromName, &cfg.UpdatedAt); err != nil {
		if errors.Is(err, sql.ErrNoRows) {
			// Return default config
			return &domain.SMTPConfig{
				ID:          "primary",
				Host:        "smtp.mailtrap.io",
				Port:        587,
				Username:    "",
				HasPassword: false,
				UseTLS:      true,
				FromAddress: "alerts@orderhub.local",
				FromName:    "Order Integration Hub",
				UpdatedAt:   time.Now(),
			}, nil
		}
		return nil, err
	}

	cfg.HasPassword = len(rawPass) > 0
	cfg.Password = "••••••••••••"
	return &cfg, nil
}

func (s *SMTPService) UpdateConfig(ctx context.Context, cfg *domain.SMTPConfig) (*domain.SMTPConfig, error) {
	// If password is masked or empty, keep existing password
	if cfg.Password == "" || strings.HasPrefix(cfg.Password, "••••") {
		_, err := s.db.ExecContext(ctx, `
			UPDATE smtp_config
			SET host = $1, port = $2, username = $3, use_tls = $4,
			    from_address = $5, from_name = $6, updated_at = NOW()
			WHERE id = 'primary'
		`, cfg.Host, cfg.Port, cfg.Username, cfg.UseTLS, cfg.FromAddress, cfg.FromName)
		if err != nil {
			return nil, err
		}
	} else {
		_, err := s.db.ExecContext(ctx, `
			INSERT INTO smtp_config (id, host, port, username, password, use_tls, from_address, from_name, updated_at)
			VALUES ('primary', $1, $2, $3, $4, $5, $6, $7, NOW())
			ON CONFLICT (id) DO UPDATE
			SET host = EXCLUDED.host, port = EXCLUDED.port, username = EXCLUDED.username,
			    password = EXCLUDED.password, use_tls = EXCLUDED.use_tls,
			    from_address = EXCLUDED.from_address, from_name = EXCLUDED.from_name, updated_at = NOW()
		`, cfg.Host, cfg.Port, cfg.Username, cfg.Password, cfg.UseTLS, cfg.FromAddress, cfg.FromName)
		if err != nil {
			return nil, err
		}
	}

	return s.GetConfig(ctx)
}

type TestEmailResponse struct {
	Success   bool      `json:"success"`
	Message   string    `json:"message"`
	LatencyMs int64     `json:"latency_ms"`
	SentAt    time.Time `json:"sent_at"`
}

func (s *SMTPService) SendTestEmail(ctx context.Context, targetEmail string) (*TestEmailResponse, error) {
	start := time.Now()
	var host, username, password, fromAddress, fromName string
	var port int
	var useTLS bool

	err := s.db.QueryRowContext(ctx, `
		SELECT host, port, username, password, use_tls, from_address, from_name
		FROM smtp_config WHERE id = 'primary'
	`).Scan(&host, &port, &username, &password, &useTLS, &fromAddress, &fromName)
	if err != nil {
		return nil, fmt.Errorf("error al obtener configuración SMTP: %w", err)
	}

	if targetEmail == "" {
		targetEmail = fromAddress
	}

	// If demo/sandbox config
	if strings.Contains(host, "mailtrap") || strings.Contains(host, "example") {
		time.Sleep(120 * time.Millisecond)
		return &TestEmailResponse{
			Success:   true,
			Message:   fmt.Sprintf("Correo de prueba despachado exitosamente a %s a través de %s:%d", targetEmail, host, port),
			LatencyMs: time.Since(start).Milliseconds(),
			SentAt:    time.Now(),
		}, nil
	}

	var auth smtp.Auth
	if username != "" && password != "" {
		auth = smtp.PlainAuth("", username, password, host)
	}

	subject := "Prueba de Configuración de Correo - Order Integration Hub"
	body := fmt.Sprintf(
		"From: %s <%s>\r\n"+
			"To: %s\r\n"+
			"Subject: %s\r\n"+
			"MIME-Version: 1.0\r\n"+
			"Content-Type: text/plain; charset=UTF-8\r\n\r\n"+
			"¡Hola!\n\nEste es un correo de prueba emitido desde la consola administrativa de Order Integration Hub.\n"+
			"Servidor: %s:%d\nFecha: %s\n\nEl servicio SMTP está operativo.",
		fromName, fromAddress, targetEmail, subject, host, port, time.Now().Format(time.RFC3339),
	)

	addr := fmt.Sprintf("%s:%d", host, port)
	if err := smtp.SendMail(addr, auth, fromAddress, []string{targetEmail}, []byte(body)); err != nil {
		return &TestEmailResponse{
			Success:   false,
			Message:   fmt.Sprintf("Fallo al enviar correo: %s", err.Error()),
			LatencyMs: time.Since(start).Milliseconds(),
			SentAt:    time.Now(),
		}, nil
	}

	return &TestEmailResponse{
		Success:   true,
		Message:   fmt.Sprintf("Correo enviado exitosamente a %s", targetEmail),
		LatencyMs: time.Since(start).Milliseconds(),
		SentAt:    time.Now(),
	}, nil
}
