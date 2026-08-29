package main

import (
	"context"
	"fmt"
	"log"
	"net/http"
	"os"
	"os/signal"
	"syscall"
	"time"

	"order-integration-hub/internal/adapter"
	"order-integration-hub/internal/api"
	"order-integration-hub/internal/config"
	"order-integration-hub/internal/database"
	"order-integration-hub/internal/mapping"
	"order-integration-hub/internal/service"
)

func main() {
	log.Println("==================================================")
	log.Println("  Order Integration Hub - Operations REST API")
	log.Println("==================================================")

	cfg := config.Load()

	// Connect to Database & Run Migrations
	db, err := database.Connect(cfg.DatabaseURL)
	if err != nil {
		log.Fatalf("[FATAL] Could not connect to database: %v", err)
	}
	defer db.Close()

	// Seed demo data if database is fresh
	ctxSeed, cancelSeed := context.WithTimeout(context.Background(), 30*time.Second)
	defer cancelSeed()
	if err := db.SeedDatabase(ctxSeed); err != nil {
		log.Printf("[WARN] Seed database warning: %v", err)
	}
	if err := db.EnsureWooCommerceStores(ctxSeed); err != nil {
		log.Printf("[WARN] Ensure WooCommerce Stores warning: %v", err)
	}

	// Initialize Adapters & Services
	registry := adapter.NewRegistry()
	authSvc := service.NewAuthService(db.DB, cfg.JWTSecret)
	customerSvc := service.NewCustomerService(db.DB)
	integrationSvc := service.NewIntegrationService(db.DB, registry)
	alertSvc := service.NewAlertService(db.DB)
	auditSvc := service.NewAuditService(db.DB)

	mappingEngine := mapping.NewDefaultMappingEngine()
	mappingCache := mapping.NewMappingCache(15 * time.Minute)
	mappingSvc := service.NewMappingService(db.DB, registry, mappingEngine, mappingCache, auditSvc)

	syncSvc := service.NewSyncService(db.DB, registry, mappingSvc, mappingEngine, alertSvc)
	dashboardSvc := service.NewDashboardService(db.DB)
	logSvc := service.NewLogService(db.DB)
	jobSvc := service.NewJobService(db.DB)
	notificationSvc := service.NewNotificationService(db.DB)
	smtpSvc := service.NewSMTPService(db.DB)
	schedulerSvc := service.NewSchedulerService(db.DB, syncSvc)

	// Handlers & Router
	handlers := api.NewHandlers(
		authSvc,
		customerSvc,
		integrationSvc,
		syncSvc,
		mappingSvc,
		dashboardSvc,
		logSvc,
		jobSvc,
		alertSvc,
		notificationSvc,
		smtpSvc,
		auditSvc,
		schedulerSvc,
	)

	router := api.SetupRouter(handlers, authSvc)

	server := &http.Server{
		Addr:         fmt.Sprintf(":%s", cfg.Port),
		Handler:      router,
		ReadTimeout:  15 * time.Second,
		WriteTimeout: 30 * time.Second,
		IdleTimeout:  60 * time.Second,
	}

	go func() {
		log.Printf("[API] Server listening on port %s (env: %s)", cfg.Port, cfg.Environment)
		if err := server.ListenAndServe(); err != nil && err != http.ErrServerClosed {
			log.Fatalf("[FATAL] HTTP server error: %v", err)
		}
	}()

	// Graceful Shutdown
	quit := make(chan os.Signal, 1)
	signal.Notify(quit, syscall.SIGINT, syscall.SIGTERM)
	<-quit

	log.Println("[API] Shutting down server gracefully...")
	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()

	if err := server.Shutdown(ctx); err != nil {
		log.Printf("[API] Server forced shutdown: %v", err)
	}
	log.Println("[API] Server stopped successfully.")
}
