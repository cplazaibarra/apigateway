package api

import (
	"context"
	"net/http"
	"strings"

	"order-integration-hub/internal/service"
)

type contextKey string

const (
	UserContextKey contextKey = "user_claims"
)

// JWTMiddleware validates Bearer token and sets user in context
func JWTMiddleware(authSvc *service.AuthService) func(http.Handler) http.Handler {
	return func(next http.Handler) http.Handler {
		return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			authHeader := r.Header.Get("Authorization")
			if authHeader == "" {
				http.Error(w, `{"error":"Cabecera Authorization no proporcionada"}`, http.StatusUnauthorized)
				return
			}

			parts := strings.Split(authHeader, " ")
			if len(parts) != 2 || strings.ToLower(parts[0]) != "bearer" {
				http.Error(w, `{"error":"Formato de token Bearer inválido"}`, http.StatusUnauthorized)
				return
			}

			claims, err := authSvc.ValidateToken(parts[1])
			if err != nil {
				http.Error(w, `{"error":"Token JWT inválido o expirado"}`, http.StatusUnauthorized)
				return
			}

			ctx := context.WithValue(r.Context(), UserContextKey, claims)
			next.ServeHTTP(w, r.WithContext(ctx))
		})
	}
}

// RequireRole checks if user role matches one of allowed roles
func RequireRole(allowedRoles ...string) func(http.Handler) http.Handler {
	return func(next http.Handler) http.Handler {
		return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			claims, ok := r.Context().Value(UserContextKey).(*service.JWTClaims)
			if !ok || claims == nil {
				http.Error(w, `{"error":"No autenticado"}`, http.StatusUnauthorized)
				return
			}

			hasRole := false
			for _, role := range allowedRoles {
				if strings.EqualFold(claims.Role, role) {
					hasRole = true
					break
				}
			}

			if !hasRole {
				http.Error(w, `{"error":"Acceso denegado: permisos insuficientes para su rol ("`+claims.Role+`")"}`, http.StatusForbidden)
				return
			}

			next.ServeHTTP(w, r)
		})
	}
}

// GetUserClaims retrieves user from request context
func GetUserClaims(r *http.Request) *service.JWTClaims {
	if claims, ok := r.Context().Value(UserContextKey).(*service.JWTClaims); ok {
		return claims
	}
	return nil
}

// GetClientIP extracts remote IP address
func GetClientIP(r *http.Request) string {
	forwarded := r.Header.Get("X-Forwarded-For")
	if forwarded != "" {
		parts := strings.Split(forwarded, ",")
		return strings.TrimSpace(parts[0])
	}
	realIP := r.Header.Get("X-Real-IP")
	if realIP != "" {
		return realIP
	}
	parts := strings.Split(r.RemoteAddr, ":")
	return parts[0]
}
