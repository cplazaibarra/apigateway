package domain

import (
	"encoding/json"
	"time"
)

// Role types for RBAC
const (
	RoleAdmin    = "ADMIN"
	RoleOperator = "OPERATOR"
	RoleViewer   = "VIEWER"
)

// Sync Job Statuses
const (
	JobStatusPending   = "PENDING"
	JobStatusRunning   = "RUNNING"
	JobStatusSuccess   = "SUCCESS"
	JobStatusPartial   = "PARTIAL"
	JobStatusFailed    = "FAILED"
	JobStatusCancelled = "CANCELLED"
)

// Log Levels
const (
	LogLevelInfo    = "INFO"
	LogLevelWarning = "WARNING"
	LogLevelError   = "ERROR"
	LogLevelDebug   = "DEBUG"
)

// Environment Modes
const (
	EnvProduction = "PRODUCTION"
	EnvTest       = "TEST"
)

// Providers
const (
	ProviderWooCommerce = "WOOCOMMERCE"
	ProviderSAP         = "SAP"
	ProviderOdoo        = "ODOO"
	ProviderBSALE       = "BSALE"
)

// Auth Types
const (
	AuthTypeAPIKey = "API_KEY"
	AuthTypeOAuth2 = "OAUTH2"
	AuthTypeBasic  = "BASIC"
	AuthTypeBearer = "BEARER"
)

// Mapping Types
const (
	MappingTypeDefault  = "DEFAULT"
	MappingTypeOverride = "OVERRIDE"
)

// Transformation Types
const (
	TransformCopy         = "COPY"
	TransformDefault      = "DEFAULT"
	TransformConcat       = "CONCAT"
	TransformUppercase    = "UPPERCASE"
	TransformLowercase    = "LOWERCASE"
	TransformTrim         = "TRIM"
	TransformDateFormat   = "DATE_FORMAT"
	TransformNumber       = "NUMBER"
	TransformBoolean      = "BOOLEAN"
	TransformStatusMap    = "STATUS_MAP"
	TransformLookup       = "LOOKUP"
	TransformRegexReplace = "REGEX_REPLACE"
)

// User represents a system administrator/operator/viewer
type User struct {
	ID           string    `json:"id"`
	Name         string    `json:"name"`
	Email        string    `json:"email"`
	PasswordHash string    `json:"-"`
	Role         string    `json:"role"` // ADMIN, OPERATOR, VIEWER
	IsActive     bool      `json:"is_active"`
	CreatedAt    time.Time `json:"created_at"`
	UpdatedAt    time.Time `json:"updated_at"`
}

// Customer represents a business client using integrations
type Customer struct {
	ID                 string     `json:"id"`
	Code               string     `json:"code"`
	Name               string     `json:"name"`
	ContactEmail       string     `json:"contact_email"`
	ContactPhone       string     `json:"contact_phone"`
	IsActive           bool       `json:"is_active"`
	TotalIntegrations  int        `json:"total_integrations,omitempty"`
	ActiveIntegrations int        `json:"active_integrations,omitempty"`
	LastSyncAt         *time.Time `json:"last_sync_at,omitempty"`
	CreatedAt          time.Time  `json:"created_at"`
	UpdatedAt          time.Time  `json:"updated_at"`
}

// CustomerDetail provides full overview of customer and associated integrations
type CustomerDetail struct {
	Customer     Customer      `json:"customer"`
	Integrations []Integration `json:"integrations"`
	Stats        struct {
		TotalIntegrations  int        `json:"total_integrations"`
		ActiveIntegrations int        `json:"active_integrations"`
		TotalOrders        int64      `json:"total_orders"`
		LastSyncAt         *time.Time `json:"last_sync_at,omitempty"`
		RecentErrorsCount  int        `json:"recent_errors_count"`
	} `json:"stats"`
	RecentErrors []SyncLog `json:"recent_errors"`
}

// Integration represents an adapter connection configuration for a customer
type Integration struct {
	ID                     string          `json:"id"`
	CustomerID             string          `json:"customer_id"`
	CustomerName           string          `json:"customer_name,omitempty"`
	CustomerCode           string          `json:"customer_code,omitempty"`
	Name                   string          `json:"name"`
	Provider               string          `json:"provider"` // WOOCOMMERCE, SAP, ODOO, BSALE
	BaseURL                string          `json:"base_url"`
	AuthType               string          `json:"auth_type"` // API_KEY, OAUTH2, BASIC, BEARER
	Credentials            json.RawMessage `json:"-"`         // Hidden from normal output
	MaskedCredentials      string          `json:"masked_credentials,omitempty"`
	Status                 string          `json:"status"` // ACTIVE, ERROR, DISABLED, SYNCING
	Environment            string          `json:"environment"` // PRODUCTION, TEST
	PollingEnabled         bool            `json:"polling_enabled"`
	PollingIntervalMinutes int             `json:"polling_interval_minutes"`
	SyncBatchSize          int             `json:"sync_batch_size"`
	LastSyncAt             *time.Time      `json:"last_sync_at,omitempty"`
	NextPollingAt          *time.Time      `json:"next_polling_at,omitempty"`
	TotalOrdersSynced      int64           `json:"total_orders_synced"`
	ConsecutiveErrors      int             `json:"consecutive_errors"`
	LastError              string          `json:"last_error,omitempty"`
	AvgResponseTimeMs      int             `json:"avg_response_time_ms"`
	CreatedAt              time.Time       `json:"created_at"`
	UpdatedAt              time.Time       `json:"updated_at"`
}

// SyncJob represents a single batch execution or manual sync run
type SyncJob struct {
	ID              string          `json:"id"`
	IntegrationID   string          `json:"integration_id"`
	IntegrationName string          `json:"integration_name,omitempty"`
	CustomerID      string          `json:"customer_id,omitempty"`
	CustomerName    string          `json:"customer_name,omitempty"`
	Provider        string          `json:"provider,omitempty"`
	TriggerType     string          `json:"trigger_type"` // SCHEDULED, MANUAL, WEBHOOK
	Status          string          `json:"status"`       // PENDING, RUNNING, SUCCESS, PARTIAL, FAILED, CANCELLED
	StartedAt       time.Time       `json:"started_at"`
	FinishedAt      *time.Time      `json:"finished_at,omitempty"`
	DurationMs      int64           `json:"duration_ms"`
	OrdersFound     int             `json:"orders_found"`
	OrdersNew       int             `json:"orders_new"`
	OrdersUpdated   int             `json:"orders_updated"`
	OrdersFailed    int             `json:"orders_failed"`
	RetriesCount    int             `json:"retries_count"`
	ErrorMessage    string          `json:"error_message,omitempty"`
	Details         json.RawMessage `json:"details,omitempty"`
	CreatedAt       time.Time       `json:"created_at"`
}

// SyncLog represents a detailed structured log entry
type SyncLog struct {
	ID              string          `json:"id"`
	SyncJobID       *string         `json:"sync_job_id,omitempty"`
	IntegrationID   *string         `json:"integration_id,omitempty"`
	IntegrationName string          `json:"integration_name,omitempty"`
	CustomerID      *string         `json:"customer_id,omitempty"`
	CustomerName    string          `json:"customer_name,omitempty"`
	Provider        string          `json:"provider,omitempty"`
	Level           string          `json:"level"`          // INFO, WARNING, ERROR, DEBUG
	OperationType   string          `json:"operation_type"` // AUTH, FETCH_ORDERS, NORMALIZE, PERSIST, NOTIFY
	RequestID       string          `json:"request_id"`
	CorrelationID   string          `json:"correlation_id"`
	DurationMs      int64           `json:"duration_ms"`
	Result          string          `json:"result"` // SUCCESS, FAILED, SKIPPED, RETRIED
	Message         string          `json:"message"`
	Details         json.RawMessage `json:"details,omitempty"`
	CreatedAt       time.Time       `json:"created_at"`
}

// NormalizedOrder standardizes order schema across providers
type NormalizedOrder struct {
	ID                string                `json:"id"`
	IntegrationID     string                `json:"integration_id"`
	ExternalOrderID   string                `json:"external_order_id"`
	OrderNumber       string                `json:"order_number"`
	CustomerEmail     string                `json:"customer_email"`
	CustomerFullName  string                `json:"customer_full_name"`
	CustomerPhone     string                `json:"customer_phone"`
	ShippingAddress   string                `json:"shipping_address"`
	City              string                `json:"city"`
	Commune           string                `json:"commune"`
	TotalAmount       float64               `json:"total_amount"`
	Currency          string                `json:"currency"`
	Status            string                `json:"status"` // PENDING, PROCESSING, COMPLETED, CANCELLED, REFUNDED
	ItemCount         int                   `json:"item_count"`
	Items             []NormalizedOrderItem `json:"items,omitempty"`
	ExternalCreatedAt time.Time             `json:"external_created_at"`
	RawPayload        json.RawMessage       `json:"raw_payload,omitempty"`
	SyncedAt          time.Time             `json:"synced_at"`
}

// NormalizedOrderItem standardizes order items
type NormalizedOrderItem struct {
	SKU         string  `json:"sku"`
	Name        string  `json:"name"`
	Quantity    float64 `json:"quantity"`
	UnitPrice   float64 `json:"unit_price"`
	TotalAmount float64 `json:"total_amount"`
}

// StandardizedOrderItemReport represents individual SKU line in report
type StandardizedOrderItemReport struct {
	ID          string  `json:"id"`
	SKU         string  `json:"sku"`
	ProductName string  `json:"product_name"`
	Quantity    float64 `json:"quantity"`
	UnitPrice   float64 `json:"unit_price"`
	TotalAmount float64 `json:"total_amount"`
}

// StandardizedOrderReport represents order overview with lines for reporting
type StandardizedOrderReport struct {
	ID               string                        `json:"id"`
	IntegrationID    string                        `json:"integration_id"`
	IntegrationName  string                        `json:"integration_name"`
	Provider         string                        `json:"provider"`
	OrderNumber      string                        `json:"order_number"`
	ExternalOrderID  string                        `json:"external_order_id"`
	CustomerFullName string                        `json:"customer_full_name"`
	CustomerEmail    string                        `json:"customer_email"`
	CustomerPhone    string                        `json:"customer_phone"`
	ShippingAddress  string                        `json:"shipping_address"`
	City             string                        `json:"city"`
	Commune          string                        `json:"commune"`
	TotalAmount      float64                       `json:"total_amount"`
	Currency         string                        `json:"currency"`
	Status           string                        `json:"status"`
	ItemCount        int                           `json:"item_count"`
	Items            []StandardizedOrderItemReport `json:"items"`
	RawPayload       json.RawMessage               `json:"raw_payload,omitempty"`
	SyncedAt         time.Time                     `json:"synced_at"`
}

// ----------------------------------------------------
// DYNAMIC FIELD MAPPING DOMAIN MODELS
// ----------------------------------------------------

// CanonicalField represents a central system target field definition
type CanonicalField struct {
	ID          string    `json:"id"`          // e.g. "order.order_number", "delivery.address"
	Name        string    `json:"name"`        // e.g. "Número de Pedido", "Dirección de Entrega"
	GroupName   string    `json:"group_name"`  // "order", "customer", "delivery", "items"
	DataType    string    `json:"data_type"`   // STRING, NUMBER, BOOLEAN, DATE, ARRAY, OBJECT
	Description string    `json:"description"` // Description for help tooltip
	Required    bool      `json:"required"`    // Is required for valid CanonicalOrder
	Aliases     []string  `json:"aliases"`     // Known aliases for auto-mapping
	Example     string    `json:"example"`     // Sample format
	CreatedAt   time.Time `json:"created_at"`
}

// FieldMapping defines a single mapping rule from source path to canonical field
type FieldMapping struct {
	ID                   string          `json:"id"`
	IntegrationID        *string         `json:"integration_id,omitempty"` // Nullable for provider defaults
	ProviderID           *string         `json:"provider_id,omitempty"`    // Nullable for integration overrides
	ProfileID            *string         `json:"profile_id,omitempty"`
	CanonicalField       string          `json:"canonical_field"`
	SourcePath           string          `json:"source_path"`
	MappingType          string          `json:"mapping_type"` // DEFAULT, OVERRIDE
	DataType             string          `json:"data_type"`    // STRING, NUMBER, BOOLEAN, DATE, ARRAY
	Required             bool            `json:"required"`
	DefaultValue         string          `json:"default_value"`
	Transformation       string          `json:"transformation"` // COPY, CONCAT, STATUS_MAP, etc.
	TransformationParams json.RawMessage `json:"transformation_params,omitempty"`
	Priority             int             `json:"priority"`
	Enabled              bool            `json:"enabled"`
	CreatedAt            time.Time       `json:"created_at"`
	UpdatedAt            time.Time       `json:"updated_at"`
}

// MappingProfile encapsulates a reusable provider mapping template
type MappingProfile struct {
	ID          string    `json:"id"`
	Name        string    `json:"name"`
	ProviderID  string    `json:"provider_id"`
	Description string    `json:"description"`
	Version     int       `json:"version"`
	Enabled     bool      `json:"enabled"`
	CreatedAt   time.Time `json:"created_at"`
	UpdatedAt   time.Time `json:"updated_at"`
}

// MappingVersion represents a point-in-time snapshot for rollback and auditing
type MappingVersion struct {
	ID              string          `json:"id"`
	IntegrationID   string          `json:"integration_id"`
	Version         int             `json:"version"`
	MappingSnapshot json.RawMessage `json:"mapping_snapshot"`
	Description     string          `json:"description"`
	CreatedBy       string          `json:"created_by"`
	CreatedAt       time.Time       `json:"created_at"`
}

// CanonicalCustomer represents customer info in canonical model
type CanonicalCustomer struct {
	ID       string `json:"id,omitempty"`
	Name     string `json:"name"`
	Document string `json:"document,omitempty"`
	Email    string `json:"email"`
	Phone    string `json:"phone"`
}

// CanonicalDelivery represents shipping/delivery address info
type CanonicalDelivery struct {
	Address    string `json:"address"`
	City       string `json:"city"`
	Commune    string `json:"commune"`
	Region     string `json:"region"`
	Country    string `json:"country"`
	PostalCode string `json:"postal_code"`
	Contact    string `json:"contact"`
	Phone      string `json:"phone"`
}

// CanonicalOrderItem represents a line item in canonical model
type CanonicalOrderItem struct {
	SKU               string  `json:"sku"`
	ExternalProductID string  `json:"external_product_id,omitempty"`
	Description       string  `json:"description"`
	Quantity          float64 `json:"quantity"`
	UnitPrice         float64 `json:"unit_price"`
	Discount          float64 `json:"discount"`
	Tax               float64 `json:"tax"`
	Total             float64 `json:"total"`
}

// CanonicalOrder is the unified platform order model
type CanonicalOrder struct {
	ID          string               `json:"id"`
	ExternalID  string               `json:"external_id"`
	OrderNumber string               `json:"order_number"`
	Status      string               `json:"status"` // PENDING, PROCESSING, ON_HOLD, COMPLETED, CANCELLED, REFUNDED, FAILED
	CreatedAt   time.Time            `json:"created_at"`
	Currency    string               `json:"currency"`
	Subtotal    float64              `json:"subtotal"`
	Tax         float64              `json:"tax"`
	Total       float64              `json:"total"`
	Customer    CanonicalCustomer    `json:"customer"`
	Delivery    CanonicalDelivery    `json:"delivery"`
	Items       []CanonicalOrderItem `json:"items"`
	RawPayload  json.RawMessage      `json:"raw_payload,omitempty"`
}

// MappingWarning captures diagnostic issues found during transformation
type MappingWarning struct {
	CanonicalField string `json:"canonical_field"`
	SourcePath     string `json:"source_path"`
	WarningType    string `json:"warning_type"` // SOURCE_FIELD_NOT_FOUND, TYPE_CONVERSION_ERROR, REQUIRED_FIELD_MISSING, INVALID_DATE, etc.
	Message        string `json:"message"`
	Severity       string `json:"severity"` // WARNING, ERROR
}

// MappingPreviewRequest represents user request to test/preview mapping against a sample payload
type MappingPreviewRequest struct {
	RawPayload map[string]interface{} `json:"raw_payload"`
	Mappings   []FieldMapping         `json:"mappings"`
}

// MappingPreviewResponse returns transformed canonical order and detected warnings
type MappingPreviewResponse struct {
	CanonicalOrder *CanonicalOrder  `json:"canonical_order,omitempty"`
	Warnings       []MappingWarning `json:"warnings"`
	Errors         []string         `json:"errors"`
	Success        bool             `json:"success"`
}

// EffectiveMappingResult provides full view for the web UI
type EffectiveMappingResult struct {
	IntegrationID   string           `json:"integration_id"`
	IntegrationName string           `json:"integration_name"`
	Provider        string           `json:"provider"`
	Mappings        []FieldMapping   `json:"mappings"`
	CanonicalFields []CanonicalField `json:"canonical_fields"`
	CoveragePercent float64          `json:"coverage_percent"`
	RequiredCount   int              `json:"required_count"`
	RequiredMapped  int              `json:"required_mapped"`
	OptionalCount   int              `json:"optional_count"`
	OptionalMapped  int              `json:"optional_mapped"`
	CurrentVersion  int              `json:"current_version"`
	LatestSample    json.RawMessage  `json:"latest_sample,omitempty"`
}

// AutoMappingSuggestion represents a suggested field match for the wizard
type AutoMappingSuggestion struct {
	CanonicalField string  `json:"canonical_field"`
	SourcePath     string  `json:"source_path"`
	Confidence     float64 `json:"confidence"` // 0.0 - 1.0
	Transformation string  `json:"transformation"`
	Reason         string  `json:"reason"`
}

// AlertRule represents incident trigger criteria
type AlertRule struct {
	ID                  string     `json:"id"`
	Name                string     `json:"name"`
	CustomerID          *string    `json:"customer_id,omitempty"`
	CustomerName        string     `json:"customer_name,omitempty"`
	IntegrationID       *string    `json:"integration_id,omitempty"`
	IntegrationName     string     `json:"integration_name,omitempty"`
	Provider            string     `json:"provider,omitempty"`
	EventType           string     `json:"event_type"` // INTEGRATION_ERROR, CONSECUTIVE_ERRORS, HIGH_LATENCY, INACTIVITY
	Severity            string     `json:"severity"`   // INFO, WARNING, ERROR, CRITICAL
	ConsecutiveFailures int        `json:"consecutive_failures"`
	ThresholdSeconds    int        `json:"threshold_seconds"`
	ThresholdValue      int        `json:"threshold_value"`
	CooldownMinutes     int        `json:"cooldown_minutes"`
	LastTriggeredAt     *time.Time `json:"last_triggered_at,omitempty"`
	Recipients          []string   `json:"recipients"`
	SendEmail           bool       `json:"send_email"`
	SendInternalNotify  bool       `json:"send_internal_notify"`
	Enabled             bool       `json:"enabled"`
	CreatedAt           time.Time  `json:"created_at"`
	UpdatedAt           time.Time  `json:"updated_at"`
}

// Notification represents an in-app operator alert
type Notification struct {
	ID              string    `json:"id"`
	Title           string    `json:"title"`
	Message         string    `json:"message"`
	Severity        string    `json:"severity"` // INFO, WARNING, ERROR, CRITICAL
	IntegrationID   *string   `json:"integration_id,omitempty"`
	IntegrationName string    `json:"integration_name,omitempty"`
	CustomerID      *string   `json:"customer_id,omitempty"`
	CustomerName    string    `json:"customer_name,omitempty"`
	IsRead          bool      `json:"is_read"`
	CreatedAt       time.Time `json:"created_at"`
}

// AuditLog tracks administrative mutations
type AuditLog struct {
	ID         string          `json:"id"`
	UserID     string          `json:"user_id"`
	UserEmail  string          `json:"user_email"`
	Action     string          `json:"action"`      // CREATE, UPDATE, DELETE, TEST, TOGGLE, etc.
	EntityType string          `json:"entity_type"` // CUSTOMER, INTEGRATION, ALERT, SMTP, MAPPING, etc.
	EntityID   string          `json:"entity_id"`
	OldValues  json.RawMessage `json:"old_values,omitempty"`
	NewValues  json.RawMessage `json:"new_values,omitempty"`
	IPAddress  string          `json:"ip_address"`
	CreatedAt  time.Time       `json:"created_at"`
}

// SMTPConfig represents email outbound dispatch settings
type SMTPConfig struct {
	ID          string    `json:"id"`
	Host        string    `json:"host"`
	Port        int       `json:"port"`
	Username    string    `json:"username"`
	Password    string    `json:"-"`
	HasPassword bool      `json:"has_password"`
	UseTLS      bool      `json:"use_tls"`
	FromAddress string    `json:"from_address"`
	FromName    string    `json:"from_name"`
	UpdatedAt   time.Time `json:"updated_at"`
}

// ProviderTestResult represents output of "Probar conexión"
type ProviderTestResult struct {
	Success     bool            `json:"success"`
	StatusCode  int             `json:"status_code"`
	LatencyMs   int64           `json:"latency_ms"`
	Message     string          `json:"message"`
	Details     string          `json:"details,omitempty"`
	RawResponse json.RawMessage `json:"raw_response,omitempty"`
	SampleOrder json.RawMessage `json:"sample_order,omitempty"`
	TestedAt    time.Time       `json:"tested_at"`
}

// DashboardSummary represents the main dashboard KPI cards and metrics
type DashboardSummary struct {
	TotalCustomers            int64                    `json:"total_customers"`
	ActiveIntegrations        int64                    `json:"active_integrations"`
	ErrorIntegrations         int64                    `json:"error_integrations"`
	DisabledIntegrations      int64                    `json:"disabled_integrations"`
	TodayQueries              int64                    `json:"today_queries"`
	TodayRecoveredOrders      int64                    `json:"today_recovered_orders"`
	TodayErrors               int64                    `json:"today_errors"`
	SuccessRatePercent        float64                  `json:"success_rate_percent"`
	AvgResponseTimeMs         int                      `json:"avg_response_time_ms"`
	GlobalLastSync            *time.Time               `json:"global_last_sync,omitempty"`
	AvgResponseTimeByProvider map[string]int           `json:"avg_response_time_by_provider"`
	ProblematicIntegrations   []ProblematicIntegration `json:"problematic_integrations"`
}

// ProblematicIntegration represents troubled connections for immediate action
type ProblematicIntegration struct {
	IntegrationID       string     `json:"integration_id"`
	IntegrationName     string     `json:"integration_name"`
	CustomerID          string     `json:"customer_id"`
	CustomerName        string     `json:"customer_name"`
	Provider            string     `json:"provider"`
	LastRunAt           *time.Time `json:"last_run_at,omitempty"`
	LastError           string     `json:"last_error"`
	Status              string     `json:"status"`
	ConsecutiveFailures int        `json:"consecutive_failures"`
	LastSuccessfulSync  *time.Time `json:"last_successful_sync,omitempty"`
	NextPollingAt       *time.Time `json:"next_polling_at,omitempty"`
}

// ChartDataSeries for dashboard and statistics visualization
type ChartDataSeries struct {
	Labels   []string  `json:"labels"`
	Datasets []Dataset `json:"datasets"`
}

// Dataset represents single chart dataset
type Dataset struct {
	Label           string    `json:"label"`
	Data            []float64 `json:"data"`
	BackgroundColor string    `json:"backgroundColor,omitempty"`
	BorderColor     string    `json:"borderColor,omitempty"`
}

// SchedulerTask for scheduled tasks view
type SchedulerTask struct {
	IntegrationID   string     `json:"integration_id"`
	IntegrationName string     `json:"integration_name"`
	CustomerID      string     `json:"customer_id"`
	CustomerName    string     `json:"customer_name"`
	Provider        string     `json:"provider"`
	PollingEnabled  bool       `json:"polling_enabled"`
	IntervalMinutes int        `json:"interval_minutes"`
	NextRunAt       *time.Time `json:"next_run_at,omitempty"`
	LastRunAt       *time.Time `json:"last_run_at,omitempty"`
	Status          string     `json:"status"`
	AvgDurationMs   int        `json:"avg_duration_ms"`
	IsLocked        bool       `json:"is_locked"`
}
