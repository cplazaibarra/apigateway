package service

import (
	"context"
	"database/sql"
	"errors"
	"fmt"
	"time"

	"order-integration-hub/internal/domain"

	"github.com/golang-jwt/jwt/v5"
	"github.com/google/uuid"
	"golang.org/x/crypto/bcrypt"
)

var (
	ErrInvalidCredentials = errors.New("correo electrónico o contraseña incorrectos")
	ErrUserInactive       = errors.New("la cuenta de usuario se encuentra deshabilitada")
	ErrUserNotFound       = errors.New("usuario no encontrado")
)

type JWTClaims struct {
	UserID string `json:"user_id"`
	Email  string `json:"email"`
	Role   string `json:"role"`
	Name   string `json:"name"`
	jwt.RegisteredClaims
}

type AuthService struct {
	db        *sql.DB
	jwtSecret []byte
}

func NewAuthService(db *sql.DB, secret string) *AuthService {
	if secret == "" {
		secret = "order-hub-default-jwt-secret-key-2026-very-secure"
	}
	return &AuthService{
		db:        db,
		jwtSecret: []byte(secret),
	}
}

type LoginResponse struct {
	Token     string       `json:"token"`
	ExpiresAt time.Time    `json:"expires_at"`
	User      *domain.User `json:"user"`
}

func (s *AuthService) Login(ctx context.Context, email, password string) (*LoginResponse, error) {
	row := s.db.QueryRowContext(ctx, `
		SELECT id, name, email, password_hash, role, is_active, created_at, updated_at
		FROM users
		WHERE LOWER(email) = LOWER($1)
	`, email)

	var u domain.User
	if err := row.Scan(&u.ID, &u.Name, &u.Email, &u.PasswordHash, &u.Role, &u.IsActive, &u.CreatedAt, &u.UpdatedAt); err != nil {
		if errors.Is(err, sql.ErrNoRows) {
			return nil, ErrInvalidCredentials
		}
		return nil, err
	}

	if !u.IsActive {
		return nil, ErrUserInactive
	}

	if err := bcrypt.CompareHashAndPassword([]byte(u.PasswordHash), []byte(password)); err != nil {
		return nil, ErrInvalidCredentials
	}

	expiresAt := time.Now().Add(24 * time.Hour)
	claims := &JWTClaims{
		UserID: u.ID,
		Email:  u.Email,
		Role:   u.Role,
		Name:   u.Name,
		RegisteredClaims: jwt.RegisteredClaims{
			ExpiresAt: jwt.NewNumericDate(expiresAt),
			IssuedAt:  jwt.NewNumericDate(time.Now()),
			Subject:   u.ID,
		},
	}

	token := jwt.NewWithClaims(jwt.SigningMethodHS256, claims)
	tokenString, err := token.SignedString(s.jwtSecret)
	if err != nil {
		return nil, fmt.Errorf("failed to sign jwt token: %w", err)
	}

	return &LoginResponse{
		Token:     tokenString,
		ExpiresAt: expiresAt,
		User:      &u,
	}, nil
}

func (s *AuthService) ValidateToken(tokenStr string) (*JWTClaims, error) {
	token, err := jwt.ParseWithClaims(tokenStr, &JWTClaims{}, func(t *jwt.Token) (interface{}, error) {
		if _, ok := t.Method.(*jwt.SigningMethodHMAC); !ok {
			return nil, fmt.Errorf("unexpected signing method: %v", t.Header["alg"])
		}
		return s.jwtSecret, nil
	})
	if err != nil {
		return nil, err
	}

	claims, ok := token.Claims.(*JWTClaims)
	if !ok || !token.Valid {
		return nil, errors.New("invalid token claims")
	}

	return claims, nil
}

func (s *AuthService) GetUserByID(ctx context.Context, id string) (*domain.User, error) {
	row := s.db.QueryRowContext(ctx, `
		SELECT id, name, email, password_hash, role, is_active, created_at, updated_at
		FROM users
		WHERE id = $1
	`, id)

	var u domain.User
	if err := row.Scan(&u.ID, &u.Name, &u.Email, &u.PasswordHash, &u.Role, &u.IsActive, &u.CreatedAt, &u.UpdatedAt); err != nil {
		if errors.Is(err, sql.ErrNoRows) {
			return nil, ErrUserNotFound
		}
		return nil, err
	}
	return &u, nil
}

func (s *AuthService) ChangePassword(ctx context.Context, userID, oldPass, newPass string) error {
	u, err := s.GetUserByID(ctx, userID)
	if err != nil {
		return err
	}

	if err := bcrypt.CompareHashAndPassword([]byte(u.PasswordHash), []byte(oldPass)); err != nil {
		return errors.New("contraseña actual incorrecta")
	}

	hashed, err := bcrypt.GenerateFromPassword([]byte(newPass), bcrypt.DefaultCost)
	if err != nil {
		return err
	}

	_, err = s.db.ExecContext(ctx, `
		UPDATE users SET password_hash = $1, updated_at = NOW() WHERE id = $2
	`, string(hashed), userID)
	return err
}

func (s *AuthService) ListUsers(ctx context.Context) ([]domain.User, error) {
	rows, err := s.db.QueryContext(ctx, `
		SELECT id, name, email, role, is_active, created_at, updated_at
		FROM users
		ORDER BY created_at ASC
	`)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var list []domain.User
	for rows.Next() {
		var u domain.User
		if err := rows.Scan(&u.ID, &u.Name, &u.Email, &u.Role, &u.IsActive, &u.CreatedAt, &u.UpdatedAt); err != nil {
			return nil, err
		}
		list = append(list, u)
	}
	return list, nil
}

func (s *AuthService) CreateUser(ctx context.Context, name, email, password, role string) (*domain.User, error) {
	hashed, err := bcrypt.GenerateFromPassword([]byte(password), bcrypt.DefaultCost)
	if err != nil {
		return nil, err
	}
	id := "usr-" + uuid.New().String()[:8]
	_, err = s.db.ExecContext(ctx, `
		INSERT INTO users (id, name, email, password_hash, role, is_active, created_at, updated_at)
		VALUES ($1, $2, $3, $4, $5, true, NOW(), NOW())
	`, id, name, email, string(hashed), role)
	if err != nil {
		return nil, err
	}
	return s.GetUserByID(ctx, id)
}
