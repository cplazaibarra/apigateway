package api

import (
	"encoding/json"
	"net/http"
	"strconv"
	"time"

	"order-integration-hub/internal/domain"
	"order-integration-hub/internal/service"

	"github.com/go-chi/chi/v5"
)

type Handlers struct {
	authSvc         *service.AuthService
	customerSvc     *service.CustomerService
	integrationSvc  *service.IntegrationService
	syncSvc         *service.SyncService
	mappingSvc      *service.MappingService
	dashboardSvc    *service.DashboardService
	logSvc          *service.LogService
	jobSvc          *service.JobService
	alertSvc        *service.AlertService
	notificationSvc *service.NotificationService
	smtpSvc         *service.SMTPService
	auditSvc        *service.AuditService
	schedulerSvc    *service.SchedulerService
}

func NewHandlers(
	authSvc *service.AuthService,
	customerSvc *service.CustomerService,
	integrationSvc *service.IntegrationService,
	syncSvc *service.SyncService,
	mappingSvc *service.MappingService,
	dashboardSvc *service.DashboardService,
	logSvc *service.LogService,
	jobSvc *service.JobService,
	alertSvc *service.AlertService,
	notificationSvc *service.NotificationService,
	smtpSvc *service.SMTPService,
	auditSvc *service.AuditService,
	schedulerSvc *service.SchedulerService,
) *Handlers {
	return &Handlers{
		authSvc:         authSvc,
		customerSvc:     customerSvc,
		integrationSvc:  integrationSvc,
		syncSvc:         syncSvc,
		mappingSvc:      mappingSvc,
		dashboardSvc:    dashboardSvc,
		logSvc:          logSvc,
		jobSvc:          jobSvc,
		alertSvc:        alertSvc,
		notificationSvc: notificationSvc,
		smtpSvc:         smtpSvc,
		auditSvc:        auditSvc,
		schedulerSvc:    schedulerSvc,
	}
}

// Helpers for JSON responses
func respondJSON(w http.ResponseWriter, status int, payload interface{}) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(status)
	_ = json.NewEncoder(w).Encode(payload)
}

func respondError(w http.ResponseWriter, status int, message string) {
	respondJSON(w, status, map[string]string{"error": message})
}

// --- AUTH HANDLERS ---

type LoginRequest struct {
	Email    string `json:"email"`
	Password string `json:"password"`
}

func (h *Handlers) Login(w http.ResponseWriter, r *http.Request) {
	var req LoginRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		respondError(w, http.StatusBadRequest, "Cuerpo de solicitud inválido")
		return
	}

	resp, err := h.authSvc.Login(r.Context(), req.Email, req.Password)
	if err != nil {
		respondError(w, http.StatusUnauthorized, err.Error())
		return
	}

	respondJSON(w, http.StatusOK, resp)
}

func (h *Handlers) GetCurrentUser(w http.ResponseWriter, r *http.Request) {
	claims := GetUserClaims(r)
	if claims == nil {
		respondError(w, http.StatusUnauthorized, "No autenticado")
		return
	}

	u, err := h.authSvc.GetUserByID(r.Context(), claims.UserID)
	if err != nil {
		respondError(w, http.StatusNotFound, "Usuario no encontrado")
		return
	}

	respondJSON(w, http.StatusOK, u)
}

type ChangePasswordRequest struct {
	OldPassword string `json:"old_password"`
	NewPassword string `json:"new_password"`
}

func (h *Handlers) ChangePassword(w http.ResponseWriter, r *http.Request) {
	claims := GetUserClaims(r)
	var req ChangePasswordRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		respondError(w, http.StatusBadRequest, "Datos inválidos")
		return
	}

	if len(req.NewPassword) < 6 {
		respondError(w, http.StatusBadRequest, "La nueva contraseña debe tener al menos 6 caracteres")
		return
	}

	if err := h.authSvc.ChangePassword(r.Context(), claims.UserID, req.OldPassword, req.NewPassword); err != nil {
		respondError(w, http.StatusBadRequest, err.Error())
		return
	}

	h.auditSvc.Log(r.Context(), claims.UserID, claims.Email, "CHANGE_PASSWORD", "USER", claims.UserID, GetClientIP(r), nil, nil)
	respondJSON(w, http.StatusOK, map[string]string{"message": "Contraseña actualizada exitosamente"})
}

func (h *Handlers) ListUsers(w http.ResponseWriter, r *http.Request) {
	users, err := h.authSvc.ListUsers(r.Context())
	if err != nil {
		respondError(w, http.StatusInternalServerError, err.Error())
		return
	}
	respondJSON(w, http.StatusOK, users)
}

type CreateUserRequest struct {
	Name     string `json:"name"`
	Email    string `json:"email"`
	Password string `json:"password"`
	Role     string `json:"role"`
}

func (h *Handlers) CreateUser(w http.ResponseWriter, r *http.Request) {
	claims := GetUserClaims(r)
	var req CreateUserRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		respondError(w, http.StatusBadRequest, "Datos inválidos")
		return
	}

	u, err := h.authSvc.CreateUser(r.Context(), req.Name, req.Email, req.Password, req.Role)
	if err != nil {
		respondError(w, http.StatusBadRequest, err.Error())
		return
	}

	h.auditSvc.Log(r.Context(), claims.UserID, claims.Email, "CREATE_USER", "USER", u.ID, GetClientIP(r), nil, map[string]string{"email": u.Email, "role": u.Role})
	respondJSON(w, http.StatusCreated, u)
}

// --- DASHBOARD HANDLERS ---

func (h *Handlers) GetDashboard(w http.ResponseWriter, r *http.Request) {
	q := r.URL.Query()
	f := service.DashboardFilter{
		CustomerID:    q.Get("customer_id"),
		Provider:      q.Get("provider"),
		IntegrationID: q.Get("integration_id"),
		Status:        q.Get("status"),
	}

	summary, err := h.dashboardSvc.GetSummary(r.Context(), f)
	if err != nil {
		respondError(w, http.StatusInternalServerError, err.Error())
		return
	}

	charts, err := h.dashboardSvc.GetCharts(r.Context(), f)
	if err != nil {
		respondError(w, http.StatusInternalServerError, err.Error())
		return
	}

	respondJSON(w, http.StatusOK, map[string]interface{}{
		"summary": summary,
		"charts":  charts,
	})
}

func (h *Handlers) GetStatistics(w http.ResponseWriter, r *http.Request) {
	stats, err := h.dashboardSvc.GetStatistics(r.Context())
	if err != nil {
		respondError(w, http.StatusInternalServerError, err.Error())
		return
	}
	respondJSON(w, http.StatusOK, stats)
}

// --- CUSTOMER HANDLERS ---

func (h *Handlers) ListCustomers(w http.ResponseWriter, r *http.Request) {
	search := r.URL.Query().Get("search")
	list, err := h.customerSvc.List(r.Context(), search)
	if err != nil {
		respondError(w, http.StatusInternalServerError, err.Error())
		return
	}
	respondJSON(w, http.StatusOK, list)
}

func (h *Handlers) GetCustomer(w http.ResponseWriter, r *http.Request) {
	id := chi.URLParam(r, "id")
	detail, err := h.customerSvc.GetByID(r.Context(), id)
	if err != nil {
		respondError(w, http.StatusNotFound, err.Error())
		return
	}
	respondJSON(w, http.StatusOK, detail)
}

func (h *Handlers) CreateCustomer(w http.ResponseWriter, r *http.Request) {
	claims := GetUserClaims(r)
	var c domain.Customer
	if err := json.NewDecoder(r.Body).Decode(&c); err != nil {
		respondError(w, http.StatusBadRequest, "Datos inválidos")
		return
	}

	created, err := h.customerSvc.Create(r.Context(), &c)
	if err != nil {
		respondError(w, http.StatusBadRequest, err.Error())
		return
	}

	h.auditSvc.Log(r.Context(), claims.UserID, claims.Email, "CREATE_CUSTOMER", "CUSTOMER", created.ID, GetClientIP(r), nil, created)
	respondJSON(w, http.StatusCreated, created)
}

func (h *Handlers) UpdateCustomer(w http.ResponseWriter, r *http.Request) {
	claims := GetUserClaims(r)
	id := chi.URLParam(r, "id")
	var c domain.Customer
	if err := json.NewDecoder(r.Body).Decode(&c); err != nil {
		respondError(w, http.StatusBadRequest, "Datos inválidos")
		return
	}
	c.ID = id

	existing, _ := h.customerSvc.GetByID(r.Context(), id)
	updated, err := h.customerSvc.Update(r.Context(), &c)
	if err != nil {
		respondError(w, http.StatusBadRequest, err.Error())
		return
	}

	var oldVal interface{}
	if existing != nil {
		oldVal = existing.Customer
	}
	h.auditSvc.Log(r.Context(), claims.UserID, claims.Email, "UPDATE_CUSTOMER", "CUSTOMER", id, GetClientIP(r), oldVal, updated)
	respondJSON(w, http.StatusOK, updated)
}

func (h *Handlers) ToggleCustomer(w http.ResponseWriter, r *http.Request) {
	claims := GetUserClaims(r)
	id := chi.URLParam(r, "id")
	newVal, err := h.customerSvc.ToggleActive(r.Context(), id)
	if err != nil {
		respondError(w, http.StatusBadRequest, err.Error())
		return
	}

	h.auditSvc.Log(r.Context(), claims.UserID, claims.Email, "TOGGLE_CUSTOMER_STATUS", "CUSTOMER", id, GetClientIP(r), nil, map[string]bool{"is_active": newVal})
	respondJSON(w, http.StatusOK, map[string]interface{}{"id": id, "is_active": newVal})
}

// --- INTEGRATION HANDLERS ---

func (h *Handlers) ListIntegrations(w http.ResponseWriter, r *http.Request) {
	q := r.URL.Query()
	f := service.IntegrationFilter{
		CustomerID: q.Get("customer_id"),
		Provider:   q.Get("provider"),
		Status:     q.Get("status"),
		Search:     q.Get("search"),
	}

	list, err := h.integrationSvc.List(r.Context(), f)
	if err != nil {
		respondError(w, http.StatusInternalServerError, err.Error())
		return
	}
	respondJSON(w, http.StatusOK, list)
}

func (h *Handlers) GetIntegration(w http.ResponseWriter, r *http.Request) {
	id := chi.URLParam(r, "id")
	it, err := h.integrationSvc.GetByID(r.Context(), id)
	if err != nil {
		respondError(w, http.StatusNotFound, err.Error())
		return
	}
	respondJSON(w, http.StatusOK, it)
}

func (h *Handlers) CreateIntegration(w http.ResponseWriter, r *http.Request) {
	claims := GetUserClaims(r)
	var req service.CreateIntegrationRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		respondError(w, http.StatusBadRequest, "Datos de integración inválidos")
		return
	}

	created, err := h.integrationSvc.Create(r.Context(), req)
	if err != nil {
		respondError(w, http.StatusBadRequest, err.Error())
		return
	}

	h.auditSvc.Log(r.Context(), claims.UserID, claims.Email, "CREATE_INTEGRATION", "INTEGRATION", created.ID, GetClientIP(r), nil, map[string]interface{}{
		"name": req.Name, "provider": req.Provider, "base_url": req.BaseURL, "customer_id": req.CustomerID,
	})
	respondJSON(w, http.StatusCreated, created)
}

func (h *Handlers) UpdateIntegration(w http.ResponseWriter, r *http.Request) {
	claims := GetUserClaims(r)
	id := chi.URLParam(r, "id")
	var req service.UpdateIntegrationRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		respondError(w, http.StatusBadRequest, "Datos inválidos")
		return
	}

	existing, _ := h.integrationSvc.GetByID(r.Context(), id)
	updated, err := h.integrationSvc.Update(r.Context(), id, req)
	if err != nil {
		respondError(w, http.StatusBadRequest, err.Error())
		return
	}

	h.auditSvc.Log(r.Context(), claims.UserID, claims.Email, "UPDATE_INTEGRATION", "INTEGRATION", id, GetClientIP(r), existing, updated)
	respondJSON(w, http.StatusOK, updated)
}

func (h *Handlers) DeleteIntegration(w http.ResponseWriter, r *http.Request) {
	claims := GetUserClaims(r)
	id := chi.URLParam(r, "id")
	if err := h.integrationSvc.Delete(r.Context(), id); err != nil {
		respondError(w, http.StatusBadRequest, err.Error())
		return
	}

	h.auditSvc.Log(r.Context(), claims.UserID, claims.Email, "DELETE_INTEGRATION", "INTEGRATION", id, GetClientIP(r), nil, nil)
	respondJSON(w, http.StatusOK, map[string]string{"message": "Integración eliminada correctamente"})
}

func (h *Handlers) ToggleIntegrationPolling(w http.ResponseWriter, r *http.Request) {
	claims := GetUserClaims(r)
	id := chi.URLParam(r, "id")
	newVal, err := h.integrationSvc.TogglePolling(r.Context(), id)
	if err != nil {
		respondError(w, http.StatusBadRequest, err.Error())
		return
	}

	h.auditSvc.Log(r.Context(), claims.UserID, claims.Email, "TOGGLE_POLLING", "INTEGRATION", id, GetClientIP(r), nil, map[string]bool{"polling_enabled": newVal})
	respondJSON(w, http.StatusOK, map[string]interface{}{"id": id, "polling_enabled": newVal})
}

func (h *Handlers) ToggleIntegrationEnvironment(w http.ResponseWriter, r *http.Request) {
	claims := GetUserClaims(r)
	id := chi.URLParam(r, "id")
	newEnv, err := h.integrationSvc.ToggleEnvironment(r.Context(), id)
	if err != nil {
		respondError(w, http.StatusBadRequest, err.Error())
		return
	}

	h.auditSvc.Log(r.Context(), claims.UserID, claims.Email, "TOGGLE_ENVIRONMENT", "INTEGRATION", id, GetClientIP(r), nil, map[string]string{"environment": newEnv})
	respondJSON(w, http.StatusOK, map[string]interface{}{"id": id, "environment": newEnv})
}

func (h *Handlers) ToggleIntegrationStatus(w http.ResponseWriter, r *http.Request) {
	claims := GetUserClaims(r)
	id := chi.URLParam(r, "id")
	newStatus, err := h.integrationSvc.ToggleStatus(r.Context(), id)
	if err != nil {
		respondError(w, http.StatusBadRequest, err.Error())
		return
	}

	h.auditSvc.Log(r.Context(), claims.UserID, claims.Email, "TOGGLE_INTEGRATION_STATUS", "INTEGRATION", id, GetClientIP(r), nil, map[string]string{"status": newStatus})
	respondJSON(w, http.StatusOK, map[string]interface{}{"id": id, "status": newStatus})
}

func (h *Handlers) TestConnection(w http.ResponseWriter, r *http.Request) {
	claims := GetUserClaims(r)
	id := chi.URLParam(r, "id")
	res, err := h.integrationSvc.TestConnection(r.Context(), id)
	if err != nil {
		respondError(w, http.StatusBadRequest, err.Error())
		return
	}

	h.auditSvc.Log(r.Context(), claims.UserID, claims.Email, "TEST_CONNECTION", "INTEGRATION", id, GetClientIP(r), nil, res)
	respondJSON(w, http.StatusOK, res)
}

func (h *Handlers) TriggerManualSync(w http.ResponseWriter, r *http.Request) {
	claims := GetUserClaims(r)
	id := chi.URLParam(r, "id")
	job, err := h.syncSvc.TriggerManualSync(r.Context(), id)
	if err != nil {
		respondError(w, http.StatusConflict, err.Error())
		return
	}

	h.auditSvc.Log(r.Context(), claims.UserID, claims.Email, "MANUAL_SYNC", "INTEGRATION", id, GetClientIP(r), nil, map[string]string{"job_id": job.ID})
	respondJSON(w, http.StatusOK, job)
}

// --- LOG HANDLERS ---

func (h *Handlers) ListLogs(w http.ResponseWriter, r *http.Request) {
	q := r.URL.Query()
	page, _ := strconv.Atoi(q.Get("page"))
	limit, _ := strconv.Atoi(q.Get("limit"))

	var dateFrom, dateTo *time.Time
	if d := q.Get("date_from"); d != "" {
		if t, err := time.Parse(time.RFC3339, d); err == nil {
			dateFrom = &t
		}
	}
	if d := q.Get("date_to"); d != "" {
		if t, err := time.Parse(time.RFC3339, d); err == nil {
			dateTo = &t
		}
	}

	f := service.LogFilter{
		CustomerID:    q.Get("customer_id"),
		IntegrationID: q.Get("integration_id"),
		Provider:      q.Get("provider"),
		Level:         q.Get("level"),
		RequestID:     q.Get("request_id"),
		CorrelationID: q.Get("correlation_id"),
		Search:        q.Get("search"),
		DateFrom:      dateFrom,
		DateTo:        dateTo,
		Page:          page,
		Limit:         limit,
	}

	resp, err := h.logSvc.List(r.Context(), f)
	if err != nil {
		respondError(w, http.StatusInternalServerError, err.Error())
		return
	}
	respondJSON(w, http.StatusOK, resp)
}

// --- SYNC JOB HANDLERS ---

func (h *Handlers) ListSyncJobs(w http.ResponseWriter, r *http.Request) {
	q := r.URL.Query()
	page, _ := strconv.Atoi(q.Get("page"))
	limit, _ := strconv.Atoi(q.Get("limit"))

	f := service.JobFilter{
		CustomerID:    q.Get("customer_id"),
		IntegrationID: q.Get("integration_id"),
		Provider:      q.Get("provider"),
		Status:        q.Get("status"),
		Page:          page,
		Limit:         limit,
	}

	resp, err := h.jobSvc.List(r.Context(), f)
	if err != nil {
		respondError(w, http.StatusInternalServerError, err.Error())
		return
	}
	respondJSON(w, http.StatusOK, resp)
}

func (h *Handlers) GetSyncJob(w http.ResponseWriter, r *http.Request) {
	id := chi.URLParam(r, "id")
	detail, err := h.jobSvc.GetByID(r.Context(), id)
	if err != nil {
		respondError(w, http.StatusNotFound, err.Error())
		return
	}
	respondJSON(w, http.StatusOK, detail)
}

// --- SCHEDULER HANDLERS ---

func (h *Handlers) GetSchedulerTasks(w http.ResponseWriter, r *http.Request) {
	tasks, err := h.schedulerSvc.GetTasks(r.Context())
	if err != nil {
		respondError(w, http.StatusInternalServerError, err.Error())
		return
	}
	respondJSON(w, http.StatusOK, tasks)
}

// --- ALERT RULES HANDLERS ---

func (h *Handlers) ListAlerts(w http.ResponseWriter, r *http.Request) {
	rules, err := h.alertSvc.List(r.Context())
	if err != nil {
		respondError(w, http.StatusInternalServerError, err.Error())
		return
	}
	respondJSON(w, http.StatusOK, rules)
}

func (h *Handlers) CreateAlert(w http.ResponseWriter, r *http.Request) {
	claims := GetUserClaims(r)
	var rRule domain.AlertRule
	if err := json.NewDecoder(r.Body).Decode(&rRule); err != nil {
		respondError(w, http.StatusBadRequest, "Datos de alerta inválidos")
		return
	}

	created, err := h.alertSvc.Create(r.Context(), &rRule)
	if err != nil {
		respondError(w, http.StatusBadRequest, err.Error())
		return
	}

	h.auditSvc.Log(r.Context(), claims.UserID, claims.Email, "CREATE_ALERT_RULE", "ALERT_RULE", created.ID, GetClientIP(r), nil, created)
	respondJSON(w, http.StatusCreated, created)
}

func (h *Handlers) UpdateAlert(w http.ResponseWriter, r *http.Request) {
	claims := GetUserClaims(r)
	id := chi.URLParam(r, "id")
	var rRule domain.AlertRule
	if err := json.NewDecoder(r.Body).Decode(&rRule); err != nil {
		respondError(w, http.StatusBadRequest, "Datos de alerta inválidos")
		return
	}

	updated, err := h.alertSvc.Update(r.Context(), id, &rRule)
	if err != nil {
		respondError(w, http.StatusBadRequest, err.Error())
		return
	}

	h.auditSvc.Log(r.Context(), claims.UserID, claims.Email, "UPDATE_ALERT_RULE", "ALERT_RULE", id, GetClientIP(r), nil, updated)
	respondJSON(w, http.StatusOK, updated)
}

func (h *Handlers) DeleteAlert(w http.ResponseWriter, r *http.Request) {
	claims := GetUserClaims(r)
	id := chi.URLParam(r, "id")
	if err := h.alertSvc.Delete(r.Context(), id); err != nil {
		respondError(w, http.StatusBadRequest, err.Error())
		return
	}

	h.auditSvc.Log(r.Context(), claims.UserID, claims.Email, "DELETE_ALERT_RULE", "ALERT_RULE", id, GetClientIP(r), nil, nil)
	respondJSON(w, http.StatusOK, map[string]string{"message": "Regla de alerta eliminada correctamente"})
}

// --- NOTIFICATION HANDLERS ---

func (h *Handlers) ListNotifications(w http.ResponseWriter, r *http.Request) {
	unreadOnly := r.URL.Query().Get("unread_only") == "true"
	resp, err := h.notificationSvc.List(r.Context(), unreadOnly)
	if err != nil {
		respondError(w, http.StatusInternalServerError, err.Error())
		return
	}
	respondJSON(w, http.StatusOK, resp)
}

func (h *Handlers) MarkNotificationRead(w http.ResponseWriter, r *http.Request) {
	id := chi.URLParam(r, "id")
	if err := h.notificationSvc.MarkAsRead(r.Context(), id); err != nil {
		respondError(w, http.StatusBadRequest, err.Error())
		return
	}
	respondJSON(w, http.StatusOK, map[string]string{"message": "Notificación marcada como leída"})
}

func (h *Handlers) MarkAllNotificationsRead(w http.ResponseWriter, r *http.Request) {
	if err := h.notificationSvc.MarkAllAsRead(r.Context()); err != nil {
		respondError(w, http.StatusInternalServerError, err.Error())
		return
	}
	respondJSON(w, http.StatusOK, map[string]string{"message": "Todas las notificaciones fueron marcadas como leídas"})
}

// --- SMTP HANDLERS ---

func (h *Handlers) GetSMTPConfig(w http.ResponseWriter, r *http.Request) {
	cfg, err := h.smtpSvc.GetConfig(r.Context())
	if err != nil {
		respondError(w, http.StatusInternalServerError, err.Error())
		return
	}
	respondJSON(w, http.StatusOK, cfg)
}

func (h *Handlers) UpdateSMTPConfig(w http.ResponseWriter, r *http.Request) {
	claims := GetUserClaims(r)
	var cfg domain.SMTPConfig
	if err := json.NewDecoder(r.Body).Decode(&cfg); err != nil {
		respondError(w, http.StatusBadRequest, "Datos SMTP inválidos")
		return
	}

	updated, err := h.smtpSvc.UpdateConfig(r.Context(), &cfg)
	if err != nil {
		respondError(w, http.StatusBadRequest, err.Error())
		return
	}

	h.auditSvc.Log(r.Context(), claims.UserID, claims.Email, "UPDATE_SMTP_CONFIG", "SMTP_CONFIG", "primary", GetClientIP(r), nil, map[string]interface{}{
		"host": cfg.Host, "port": cfg.Port, "username": cfg.Username, "from_address": cfg.FromAddress,
	})
	respondJSON(w, http.StatusOK, updated)
}

type TestEmailRequest struct {
	TargetEmail string `json:"target_email"`
}

func (h *Handlers) SendTestEmail(w http.ResponseWriter, r *http.Request) {
	claims := GetUserClaims(r)
	var req TestEmailRequest
	_ = json.NewDecoder(r.Body).Decode(&req)

	res, err := h.smtpSvc.SendTestEmail(r.Context(), req.TargetEmail)
	if err != nil {
		respondError(w, http.StatusBadRequest, err.Error())
		return
	}

	h.auditSvc.Log(r.Context(), claims.UserID, claims.Email, "SEND_TEST_EMAIL", "SMTP_CONFIG", "primary", GetClientIP(r), nil, res)
	respondJSON(w, http.StatusOK, res)
}

// --- AUDIT HANDLERS ---

func (h *Handlers) ListAuditLogs(w http.ResponseWriter, r *http.Request) {
	q := r.URL.Query()
	page, _ := strconv.Atoi(q.Get("page"))
	limit, _ := strconv.Atoi(q.Get("limit"))

	f := service.AuditFilter{
		Action:     q.Get("action"),
		EntityType: q.Get("entity_type"),
		Search:     q.Get("search"),
		Page:       page,
		Limit:      limit,
	}

	resp, err := h.auditSvc.List(r.Context(), f)
	if err != nil {
		respondError(w, http.StatusInternalServerError, err.Error())
		return
	}
	respondJSON(w, http.StatusOK, resp)
}

// --- DYNAMIC FIELD MAPPING HANDLERS ---

func (h *Handlers) GetCanonicalFields(w http.ResponseWriter, r *http.Request) {
	fields, err := h.mappingSvc.GetCanonicalFields(r.Context())
	if err != nil {
		respondError(w, http.StatusInternalServerError, err.Error())
		return
	}
	respondJSON(w, http.StatusOK, fields)
}

func (h *Handlers) GetProviderDefaultMapping(w http.ResponseWriter, r *http.Request) {
	provider := chi.URLParam(r, "provider")
	mappings, err := h.mappingSvc.GetProviderDefaultMapping(r.Context(), provider)
	if err != nil {
		respondError(w, http.StatusInternalServerError, err.Error())
		return
	}
	respondJSON(w, http.StatusOK, mappings)
}

func (h *Handlers) GetIntegrationMapping(w http.ResponseWriter, r *http.Request) {
	id := chi.URLParam(r, "id")
	res, err := h.mappingSvc.GetEffectiveMapping(r.Context(), id)
	if err != nil {
		respondError(w, http.StatusNotFound, err.Error())
		return
	}
	respondJSON(w, http.StatusOK, res)
}

func (h *Handlers) SaveIntegrationMapping(w http.ResponseWriter, r *http.Request) {
	claims := GetUserClaims(r)
	id := chi.URLParam(r, "id")

	var mappings []domain.FieldMapping
	if err := json.NewDecoder(r.Body).Decode(&mappings); err != nil {
		respondError(w, http.StatusBadRequest, "Datos de mapeo inválidos")
		return
	}

	res, err := h.mappingSvc.SaveMappings(r.Context(), id, mappings, claims.Email, GetClientIP(r))
	if err != nil {
		respondError(w, http.StatusBadRequest, err.Error())
		return
	}
	respondJSON(w, http.StatusOK, res)
}

func (h *Handlers) DeleteIntegrationMappingRule(w http.ResponseWriter, r *http.Request) {
	claims := GetUserClaims(r)
	id := chi.URLParam(r, "id")
	mappingID := chi.URLParam(r, "mapping_id")

	if err := h.mappingSvc.DeleteMappingRule(r.Context(), id, mappingID, claims.Email, GetClientIP(r)); err != nil {
		respondError(w, http.StatusBadRequest, err.Error())
		return
	}
	respondJSON(w, http.StatusOK, map[string]string{"message": "Regla de mapeo eliminada"})
}

func (h *Handlers) FetchSampleOrderPayload(w http.ResponseWriter, r *http.Request) {
	id := chi.URLParam(r, "id")
	sample, err := h.mappingSvc.FetchSamplePayload(r.Context(), id)
	if err != nil {
		respondError(w, http.StatusBadRequest, err.Error())
		return
	}
	respondJSON(w, http.StatusOK, map[string]interface{}{
		"raw_payload": sample,
	})
}

func (h *Handlers) PreviewMapping(w http.ResponseWriter, r *http.Request) {
	var req domain.MappingPreviewRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		respondError(w, http.StatusBadRequest, "Datos de preview inválidos")
		return
	}

	resp, err := h.mappingSvc.PreviewMapping(r.Context(), req)
	if err != nil {
		respondError(w, http.StatusBadRequest, err.Error())
		return
	}
	respondJSON(w, http.StatusOK, resp)
}

func (h *Handlers) TestIntegrationMapping(w http.ResponseWriter, r *http.Request) {
	claims := GetUserClaims(r)
	id := chi.URLParam(r, "id")

	var req struct {
		Mappings []domain.FieldMapping `json:"mappings"`
	}
	_ = json.NewDecoder(r.Body).Decode(&req)

	resp, err := h.mappingSvc.TestIntegrationMapping(r.Context(), id, req.Mappings, claims.Email, GetClientIP(r))
	if err != nil {
		respondError(w, http.StatusBadRequest, err.Error())
		return
	}
	respondJSON(w, http.StatusOK, resp)
}

func (h *Handlers) GetMappingVersions(w http.ResponseWriter, r *http.Request) {
	id := chi.URLParam(r, "id")
	versions, err := h.mappingSvc.GetVersions(r.Context(), id)
	if err != nil {
		respondError(w, http.StatusInternalServerError, err.Error())
		return
	}
	respondJSON(w, http.StatusOK, versions)
}

func (h *Handlers) RestoreMappingVersion(w http.ResponseWriter, r *http.Request) {
	claims := GetUserClaims(r)
	id := chi.URLParam(r, "id")
	versionStr := chi.URLParam(r, "version")
	ver, err := strconv.Atoi(versionStr)
	if err != nil {
		respondError(w, http.StatusBadRequest, "Número de versión inválido")
		return
	}

	res, err := h.mappingSvc.RestoreVersion(r.Context(), id, ver, claims.Email, GetClientIP(r))
	if err != nil {
		respondError(w, http.StatusBadRequest, err.Error())
		return
	}
	respondJSON(w, http.StatusOK, res)
}

func (h *Handlers) SuggestAutoMappings(w http.ResponseWriter, r *http.Request) {
	id := chi.URLParam(r, "id")
	suggestions, err := h.mappingSvc.SuggestAutoMappings(r.Context(), id)
	if err != nil {
		respondError(w, http.StatusBadRequest, err.Error())
		return
	}
	respondJSON(w, http.StatusOK, suggestions)
}

// --- STANDARDIZED ORDERS HANDLERS ---

func (h *Handlers) ListStandardizedOrders(w http.ResponseWriter, r *http.Request) {
	integrationID := r.URL.Query().Get("integration_id")
	search := r.URL.Query().Get("search")
	status := r.URL.Query().Get("status")
	limitStr := r.URL.Query().Get("limit")
	limit := 100
	if limitStr != "" {
		if l, err := strconv.Atoi(limitStr); err == nil && l > 0 && l <= 500 {
			limit = l
		}
	}

	orders, err := h.syncSvc.ListStandardizedOrders(r.Context(), integrationID, search, status, limit)
	if err != nil {
		respondError(w, http.StatusInternalServerError, err.Error())
		return
	}

	respondJSON(w, http.StatusOK, orders)
}

func (h *Handlers) GetStandardizedOrder(w http.ResponseWriter, r *http.Request) {
	id := chi.URLParam(r, "id")
	ord, err := h.syncSvc.GetStandardizedOrder(r.Context(), id)
	if err != nil {
		respondError(w, http.StatusNotFound, "Pedido no encontrado")
		return
	}

	respondJSON(w, http.StatusOK, ord)
}
