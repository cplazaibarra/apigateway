package api

import (
	"net/http"

	"order-integration-hub/internal/domain"
	"order-integration-hub/internal/service"

	"github.com/go-chi/chi/v5"
	chiMiddleware "github.com/go-chi/chi/v5/middleware"
	"github.com/go-chi/cors"
)

// SetupRouter initializes the HTTP server routes and middleware
func SetupRouter(h *Handlers, authSvc *service.AuthService) *chi.Mux {
	r := chi.NewRouter()

	// Base middleware
	r.Use(chiMiddleware.RequestID)
	r.Use(chiMiddleware.RealIP)
	r.Use(chiMiddleware.Logger)
	r.Use(chiMiddleware.Recoverer)

	// CORS config
	r.Use(cors.Handler(cors.Options{
		AllowedOrigins:   []string{"*"},
		AllowedMethods:   []string{"GET", "POST", "PUT", "DELETE", "OPTIONS", "PATCH"},
		AllowedHeaders:   []string{"Accept", "Authorization", "Content-Type", "X-CSRF-Token", "X-Request-ID", "X-Correlation-ID"},
		ExposedHeaders:   []string{"Link", "X-Total-Count"},
		AllowCredentials: true,
		MaxAge:           300,
	}))

	// Health Check
	r.Get("/health", func(w http.ResponseWriter, r *http.Request) {
		respondJSON(w, http.StatusOK, map[string]string{
			"status":  "UP",
			"service": "order-integration-hub-api",
			"version": "1.0.0",
		})
	})

	// API v1 Routes
	r.Route("/api/v1", func(r chi.Router) {
		// Public Auth
		r.Post("/auth/login", h.Login)

		// Protected Routes (JWT required)
		r.Group(func(r chi.Router) {
			r.Use(JWTMiddleware(authSvc))

			// Current User
			r.Get("/auth/me", h.GetCurrentUser)
			r.Post("/auth/change-password", h.ChangePassword)

			// Admin Group
			r.Route("/admin", func(r chi.Router) {
				// --- Read routes (VIEWER, OPERATOR, ADMIN) ---
				r.Group(func(r chi.Router) {
					r.Use(RequireRole(domain.RoleViewer, domain.RoleOperator, domain.RoleAdmin))

					r.Get("/dashboard", h.GetDashboard)
					r.Get("/statistics", h.GetStatistics)

					r.Get("/customers", h.ListCustomers)
					r.Get("/customers/{id}", h.GetCustomer)

					r.Get("/integrations", h.ListIntegrations)
					r.Get("/integrations/{id}", h.GetIntegration)

					r.Get("/sync-jobs", h.ListSyncJobs)
					r.Get("/sync-jobs/{id}", h.GetSyncJob)

					r.Get("/logs", h.ListLogs)
					r.Get("/scheduler", h.GetSchedulerTasks)

					r.Get("/alerts", h.ListAlerts)

					r.Get("/notifications", h.ListNotifications)
					r.Post("/notifications/{id}/read", h.MarkNotificationRead)
					r.Post("/notifications/read-all", h.MarkAllNotificationsRead)

					r.Get("/smtp", h.GetSMTPConfig)
					r.Get("/audit", h.ListAuditLogs)

					// Standardized Orders Report
					r.Get("/orders", h.ListStandardizedOrders)
					r.Get("/orders/{id}", h.GetStandardizedOrder)

					// Dynamic Field Mapping (Read)
					r.Get("/canonical-fields", h.GetCanonicalFields)
					r.Get("/providers/{provider}/default-mapping", h.GetProviderDefaultMapping)
					r.Get("/integrations/{id}/mapping", h.GetIntegrationMapping)
					r.Get("/integrations/{id}/mapping/versions", h.GetMappingVersions)
				})

				// --- Operational routes (OPERATOR, ADMIN) ---
				r.Group(func(r chi.Router) {
					r.Use(RequireRole(domain.RoleOperator, domain.RoleAdmin))

					r.Post("/integrations/{id}/test", h.TestConnection)
					r.Post("/integrations/{id}/sync", h.TriggerManualSync)
					r.Post("/integrations/{id}/toggle-polling", h.ToggleIntegrationPolling)
					r.Post("/integrations/{id}/toggle-environment", h.ToggleIntegrationEnvironment)
					r.Post("/integrations/{id}/toggle-status", h.ToggleIntegrationStatus)
					r.Post("/smtp/test", h.SendTestEmail)

					// Dynamic Field Mapping (Test & Edit & Restore)
					r.Post("/integrations/{id}/mapping/sample", h.FetchSampleOrderPayload)
					r.Post("/integrations/{id}/mapping/preview", h.PreviewMapping)
					r.Post("/integrations/{id}/mapping/test", h.TestIntegrationMapping)
					r.Get("/integrations/{id}/mapping/suggestions", h.SuggestAutoMappings)
					r.Put("/integrations/{id}/mapping", h.SaveIntegrationMapping)
					r.Delete("/integrations/{id}/mapping/{mapping_id}", h.DeleteIntegrationMappingRule)
					r.Post("/integrations/{id}/mapping/versions/{version}/restore", h.RestoreMappingVersion)
				})

				// --- Administrative CRUD routes (ADMIN only) ---
				r.Group(func(r chi.Router) {
					r.Use(RequireRole(domain.RoleAdmin))

					r.Post("/customers", h.CreateCustomer)
					r.Put("/customers/{id}", h.UpdateCustomer)
					r.Post("/customers/{id}/toggle", h.ToggleCustomer)

					r.Post("/integrations", h.CreateIntegration)
					r.Put("/integrations/{id}", h.UpdateIntegration)
					r.Delete("/integrations/{id}", h.DeleteIntegration)

					r.Post("/alerts", h.CreateAlert)
					r.Put("/alerts/{id}", h.UpdateAlert)
					r.Delete("/alerts/{id}", h.DeleteAlert)

					r.Post("/smtp", h.UpdateSMTPConfig)

					r.Get("/users", h.ListUsers)
					r.Post("/users", h.CreateUser)
				})
			})
		})
	})

	return r
}
