package config

import (
	"os"
)

type Config struct {
	Port        string
	DatabaseURL string
	JWTSecret   string
	Environment string
}

func Load() *Config {
	port := os.Getenv("PORT")
	if port == "" {
		port = "8080"
	}

	dbURL := os.Getenv("DATABASE_URL")
	if dbURL == "" {
		dbURL = "postgres://postgres:postgres@localhost:5432/order_hub?sslmode=disable"
	}

	secret := os.Getenv("JWT_SECRET")
	if secret == "" {
		secret = "order-hub-default-jwt-secret-key-2026-very-secure"
	}

	env := os.Getenv("ENVIRONMENT")
	if env == "" {
		env = "development"
	}

	return &Config{
		Port:        port,
		DatabaseURL: dbURL,
		JWTSecret:   secret,
		Environment: env,
	}
}
