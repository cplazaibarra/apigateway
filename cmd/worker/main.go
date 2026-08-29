package main

import (
	"context"
	"log"
	"os"
	"os/signal"
	"syscall"
	"time"

	"order-integration-hub/internal/adapter"
	"order-integration-hub/internal/config"
	"order-integration-hub/internal/database"
	"order-integration-hub/internal/mapping"
	"order-integration-hub/internal/service"
)

func main() {
	log.Println("==================================================")
	log.Println("  Order Integration Hub - Background Worker Engine")
	log.Println("==================================================")

	cfg := config.Load()

	// Connect to Database
	db, err := database.Connect(cfg.DatabaseURL)
	if err != nil {
		log.Fatalf("[FATAL Worker] Could not connect to database: %v", err)
	}
	defer db.Close()

	registry := adapter.NewRegistry()
	alertSvc := service.NewAlertService(db.DB)
	auditSvc := service.NewAuditService(db.DB)

	mappingEngine := mapping.NewDefaultMappingEngine()
	mappingCache := mapping.NewMappingCache(15 * time.Minute)
	mappingSvc := service.NewMappingService(db.DB, registry, mappingEngine, mappingCache, auditSvc)

	syncSvc := service.NewSyncService(db.DB, registry, mappingSvc, mappingEngine, alertSvc)
	schedulerSvc := service.NewSchedulerService(db.DB, syncSvc)

	ticker := time.NewTicker(30 * time.Second)
	defer ticker.Stop()

	stopChan := make(chan os.Signal, 1)
	signal.Notify(stopChan, syscall.SIGINT, syscall.SIGTERM)

	log.Println("[Worker] Scheduler loop started. Checking pending integration polls every 30s...")

	// Initial run
	ctxInitial, cancelInitial := context.WithTimeout(context.Background(), 1*time.Minute)
	schedulerSvc.RunPendingPolls(ctxInitial)
	cancelInitial()

	for {
		select {
		case <-ticker.C:
			ctxPoll, cancelPoll := context.WithTimeout(context.Background(), 1*time.Minute)
			n := schedulerSvc.RunPendingPolls(ctxPoll)
			cancelPoll()
			if n > 0 {
				log.Printf("[Worker] Executed %d scheduled polling tasks", n)
			}
		case <-stopChan:
			log.Println("[Worker] Stopping background worker gracefully...")
			return
		}
	}
}
