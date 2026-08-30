package database

import (
	"context"
	"database/sql"
	"fmt"
	"log"
	"time"

	_ "github.com/jackc/pgx/v5/stdlib"
)

// DB wraps the sql.DB pool
type DB struct {
	*sql.DB
}

// Connect initializes the PostgreSQL connection pool and runs schema migrations
func Connect(databaseURL string) (*DB, error) {
	db, err := sql.Open("pgx", databaseURL)
	if err != nil {
		return nil, fmt.Errorf("failed to open database connection: %w", err)
	}

	db.SetMaxOpenConns(25)
	db.SetMaxIdleConns(10)
	db.SetConnMaxLifetime(15 * time.Minute)

	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()

	if err := db.PingContext(ctx); err != nil {
		return nil, fmt.Errorf("failed to ping database: %w", err)
	}

	dbWrapper := &DB{DB: db}
	if err := dbWrapper.Migrate(ctx); err != nil {
		return nil, fmt.Errorf("failed to run database migrations: %w", err)
	}

	log.Println("[Database] Connected and schema migrated successfully")
	return dbWrapper, nil
}

// Migrate applies all required tables, indices, and constraints
func (db *DB) Migrate(ctx context.Context) error {
	schema := `
	CREATE TABLE IF NOT EXISTS users (
		id VARCHAR(64) PRIMARY KEY,
		name VARCHAR(255) NOT NULL,
		email VARCHAR(255) UNIQUE NOT NULL,
		password_hash VARCHAR(255) NOT NULL,
		role VARCHAR(32) NOT NULL DEFAULT 'VIEWER',
		is_active BOOLEAN NOT NULL DEFAULT true,
		created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
		updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
	);

	CREATE TABLE IF NOT EXISTS customers (
		id VARCHAR(64) PRIMARY KEY,
		code VARCHAR(64) UNIQUE NOT NULL,
		name VARCHAR(255) NOT NULL,
		contact_email VARCHAR(255) NOT NULL,
		contact_phone VARCHAR(64) DEFAULT '',
		is_active BOOLEAN NOT NULL DEFAULT true,
		created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
		updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
	);

	CREATE TABLE IF NOT EXISTS integrations (
		id VARCHAR(64) PRIMARY KEY,
		customer_id VARCHAR(64) NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
		name VARCHAR(255) NOT NULL,
		provider VARCHAR(64) NOT NULL,
		base_url VARCHAR(512) NOT NULL,
		auth_type VARCHAR(64) NOT NULL,
		credentials JSONB NOT NULL DEFAULT '{}'::jsonb,
		status VARCHAR(32) NOT NULL DEFAULT 'ACTIVE',
		polling_enabled BOOLEAN NOT NULL DEFAULT true,
		polling_interval_minutes INT NOT NULL DEFAULT 15,
		last_sync_at TIMESTAMPTZ,
		next_polling_at TIMESTAMPTZ,
		total_orders_synced BIGINT NOT NULL DEFAULT 0,
		consecutive_errors INT NOT NULL DEFAULT 0,
		last_error TEXT DEFAULT '',
		avg_response_time_ms INT NOT NULL DEFAULT 0,
		created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
		updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
	);

	CREATE TABLE IF NOT EXISTS sync_jobs (
		id VARCHAR(64) PRIMARY KEY,
		integration_id VARCHAR(64) NOT NULL REFERENCES integrations(id) ON DELETE CASCADE,
		trigger_type VARCHAR(32) NOT NULL DEFAULT 'SCHEDULED',
		status VARCHAR(32) NOT NULL DEFAULT 'PENDING',
		started_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
		finished_at TIMESTAMPTZ,
		duration_ms BIGINT NOT NULL DEFAULT 0,
		orders_found INT NOT NULL DEFAULT 0,
		orders_new INT NOT NULL DEFAULT 0,
		orders_updated INT NOT NULL DEFAULT 0,
		orders_failed INT NOT NULL DEFAULT 0,
		retries_count INT NOT NULL DEFAULT 0,
		error_message TEXT DEFAULT '',
		details JSONB DEFAULT '{}'::jsonb,
		created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
	);

	CREATE TABLE IF NOT EXISTS sync_logs (
		id VARCHAR(64) PRIMARY KEY,
		sync_job_id VARCHAR(64) REFERENCES sync_jobs(id) ON DELETE SET NULL,
		integration_id VARCHAR(64) REFERENCES integrations(id) ON DELETE CASCADE,
		customer_id VARCHAR(64) REFERENCES customers(id) ON DELETE SET NULL,
		provider VARCHAR(64) NOT NULL DEFAULT '',
		level VARCHAR(16) NOT NULL DEFAULT 'INFO',
		operation_type VARCHAR(64) NOT NULL DEFAULT 'FETCH_ORDERS',
		request_id VARCHAR(64) NOT NULL DEFAULT '',
		correlation_id VARCHAR(64) NOT NULL DEFAULT '',
		duration_ms BIGINT NOT NULL DEFAULT 0,
		result VARCHAR(32) NOT NULL DEFAULT 'SUCCESS',
		message TEXT NOT NULL,
		details JSONB DEFAULT '{}'::jsonb,
		created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
	);

	CREATE TABLE IF NOT EXISTS orders (
		id VARCHAR(64) PRIMARY KEY,
		integration_id VARCHAR(64) NOT NULL REFERENCES integrations(id) ON DELETE CASCADE,
		external_order_id VARCHAR(128) NOT NULL,
		order_number VARCHAR(128) NOT NULL,
		customer_email VARCHAR(255) NOT NULL DEFAULT '',
		customer_full_name VARCHAR(255) NOT NULL DEFAULT '',
		customer_phone VARCHAR(64) NOT NULL DEFAULT '',
		shipping_address TEXT NOT NULL DEFAULT '',
		city VARCHAR(128) NOT NULL DEFAULT '',
		commune VARCHAR(128) NOT NULL DEFAULT '',
		total_amount NUMERIC(14, 2) NOT NULL DEFAULT 0,
		currency VARCHAR(8) NOT NULL DEFAULT 'USD',
		status VARCHAR(32) NOT NULL DEFAULT 'PENDING',
		item_count INT NOT NULL DEFAULT 0,
		items JSONB DEFAULT '[]'::jsonb,
		external_created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
		raw_payload JSONB DEFAULT '{}'::jsonb,
		synced_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
		CONSTRAINT uq_integration_external_order UNIQUE (integration_id, external_order_id)
	);

	ALTER TABLE orders ADD COLUMN IF NOT EXISTS customer_phone VARCHAR(64) NOT NULL DEFAULT '';
	ALTER TABLE orders ADD COLUMN IF NOT EXISTS shipping_address TEXT NOT NULL DEFAULT '';
	ALTER TABLE orders ADD COLUMN IF NOT EXISTS city VARCHAR(128) NOT NULL DEFAULT '';
	ALTER TABLE orders ADD COLUMN IF NOT EXISTS commune VARCHAR(128) NOT NULL DEFAULT '';

	CREATE TABLE IF NOT EXISTS order_items (
		id VARCHAR(64) PRIMARY KEY,
		order_id VARCHAR(64) NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
		integration_id VARCHAR(64) NOT NULL REFERENCES integrations(id) ON DELETE CASCADE,
		external_order_id VARCHAR(128) NOT NULL DEFAULT '',
		sku VARCHAR(128) NOT NULL DEFAULT '',
		product_name VARCHAR(255) NOT NULL DEFAULT '',
		quantity NUMERIC(12, 2) NOT NULL DEFAULT 1,
		unit_price NUMERIC(14, 2) NOT NULL DEFAULT 0,
		total_amount NUMERIC(14, 2) NOT NULL DEFAULT 0,
		created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
	);

	CREATE INDEX IF NOT EXISTS idx_order_items_order_id ON order_items (order_id);
	CREATE INDEX IF NOT EXISTS idx_order_items_sku ON order_items (sku);
	CREATE INDEX IF NOT EXISTS idx_order_items_integration_id ON order_items (integration_id);

	-- Backfill order_items from orders.items if empty
	INSERT INTO order_items (
		id, order_id, integration_id, external_order_id, sku,
		product_name, quantity, unit_price, total_amount, created_at
	)
	SELECT 
		'item-' || substr(md5(o.id || COALESCE(item->>'sku', '') || COALESCE(item->>'name', '') || COALESCE(item->>'description', '') || (row_number() over())::text), 1, 16) AS id,
		o.id AS order_id,
		o.integration_id,
		o.external_order_id,
		COALESCE(NULLIF(item->>'sku', ''), 'N/A') AS sku,
		COALESCE(NULLIF(item->>'description', ''), NULLIF(item->>'name', ''), 'Producto General') AS product_name,
		COALESCE((item->>'quantity')::numeric, 1) AS quantity,
		COALESCE((item->>'unit_price')::numeric, (item->>'price')::numeric, 0) AS unit_price,
		COALESCE((item->>'total')::numeric, (item->>'total_amount')::numeric, 0) AS total_amount,
		COALESCE(o.synced_at, NOW()) AS created_at
	FROM orders o,
	jsonb_array_elements(CASE WHEN jsonb_typeof(o.items) = 'array' THEN o.items ELSE '[]'::jsonb END) AS item
	ON CONFLICT (id) DO NOTHING;

	CREATE TABLE IF NOT EXISTS integration_metrics (
		id VARCHAR(64) PRIMARY KEY,
		integration_id VARCHAR(64) NOT NULL REFERENCES integrations(id) ON DELETE CASCADE,
		timestamp TIMESTAMPTZ NOT NULL,
		total_requests INT NOT NULL DEFAULT 0,
		success_count INT NOT NULL DEFAULT 0,
		error_count INT NOT NULL DEFAULT 0,
		orders_count INT NOT NULL DEFAULT 0,
		avg_duration_ms INT NOT NULL DEFAULT 0,
		min_duration_ms INT NOT NULL DEFAULT 0,
		max_duration_ms INT NOT NULL DEFAULT 0,
		p95_duration_ms INT NOT NULL DEFAULT 0
	);

	CREATE TABLE IF NOT EXISTS alert_rules (
		id VARCHAR(64) PRIMARY KEY,
		name VARCHAR(255) NOT NULL,
		customer_id VARCHAR(64) REFERENCES customers(id) ON DELETE SET NULL,
		integration_id VARCHAR(64) REFERENCES integrations(id) ON DELETE SET NULL,
		provider VARCHAR(64) DEFAULT '',
		event_type VARCHAR(64) NOT NULL,
		severity VARCHAR(32) NOT NULL DEFAULT 'HIGH',
		consecutive_failures INT NOT NULL DEFAULT 3,
		threshold_seconds INT NOT NULL DEFAULT 600,
		recipients JSONB NOT NULL DEFAULT '[]'::jsonb,
		enabled BOOLEAN NOT NULL DEFAULT true,
		cooldown_minutes INT NOT NULL DEFAULT 60,
		last_triggered_at TIMESTAMPTZ,
		created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
		updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
	);

	CREATE TABLE IF NOT EXISTS notifications (
		id VARCHAR(64) PRIMARY KEY,
		title VARCHAR(255) NOT NULL,
		message TEXT NOT NULL,
		severity VARCHAR(32) NOT NULL DEFAULT 'INFO',
		integration_id VARCHAR(64) REFERENCES integrations(id) ON DELETE SET NULL,
		customer_id VARCHAR(64) REFERENCES customers(id) ON DELETE SET NULL,
		is_read BOOLEAN NOT NULL DEFAULT false,
		created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
	);

	CREATE TABLE IF NOT EXISTS audit_logs (
		id VARCHAR(64) PRIMARY KEY,
		user_id VARCHAR(64) NOT NULL,
		user_email VARCHAR(255) NOT NULL,
		action VARCHAR(64) NOT NULL,
		entity_type VARCHAR(64) NOT NULL,
		entity_id VARCHAR(64) NOT NULL,
		old_values JSONB DEFAULT '{}'::jsonb,
		new_values JSONB DEFAULT '{}'::jsonb,
		ip_address VARCHAR(64) NOT NULL DEFAULT '',
		created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
	);

	CREATE TABLE IF NOT EXISTS smtp_config (
		id VARCHAR(64) PRIMARY KEY DEFAULT 'primary',
		host VARCHAR(255) NOT NULL DEFAULT 'smtp.example.com',
		port INT NOT NULL DEFAULT 587,
		username VARCHAR(255) NOT NULL DEFAULT '',
		password VARCHAR(512) NOT NULL DEFAULT '',
		use_tls BOOLEAN NOT NULL DEFAULT true,
		from_address VARCHAR(255) NOT NULL DEFAULT 'alerts@orderhub.local',
		from_name VARCHAR(255) NOT NULL DEFAULT 'Order Integration Hub',
		updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
	);

	CREATE TABLE IF NOT EXISTS execution_locks (
		integration_id VARCHAR(64) PRIMARY KEY,
		locked_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
		locked_by VARCHAR(64) NOT NULL DEFAULT 'worker'
	);

	-- Canonical Fields Catalog
	CREATE TABLE IF NOT EXISTS canonical_fields (
		id VARCHAR(128) PRIMARY KEY,
		name VARCHAR(255) NOT NULL,
		group_name VARCHAR(64) NOT NULL,
		data_type VARCHAR(32) NOT NULL DEFAULT 'STRING',
		description TEXT DEFAULT '',
		required BOOLEAN NOT NULL DEFAULT false,
		aliases JSONB NOT NULL DEFAULT '[]'::jsonb,
		example VARCHAR(255) DEFAULT '',
		created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
	);

	-- Mapping Profiles
	CREATE TABLE IF NOT EXISTS mapping_profiles (
		id VARCHAR(64) PRIMARY KEY,
		name VARCHAR(255) NOT NULL,
		provider_id VARCHAR(64) NOT NULL,
		description TEXT DEFAULT '',
		version INT NOT NULL DEFAULT 1,
		enabled BOOLEAN NOT NULL DEFAULT true,
		created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
		updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
	);

	-- Field Mappings
	CREATE TABLE IF NOT EXISTS field_mappings (
		id VARCHAR(64) PRIMARY KEY,
		integration_id VARCHAR(64) REFERENCES integrations(id) ON DELETE CASCADE,
		provider_id VARCHAR(64) DEFAULT '',
		profile_id VARCHAR(64) REFERENCES mapping_profiles(id) ON DELETE CASCADE,
		canonical_field VARCHAR(128) NOT NULL,
		source_path VARCHAR(255) NOT NULL,
		mapping_type VARCHAR(32) NOT NULL DEFAULT 'DEFAULT',
		data_type VARCHAR(32) NOT NULL DEFAULT 'STRING',
		required BOOLEAN NOT NULL DEFAULT false,
		default_value TEXT DEFAULT '',
		transformation VARCHAR(64) NOT NULL DEFAULT 'COPY',
		transformation_params JSONB NOT NULL DEFAULT '{}'::jsonb,
		priority INT NOT NULL DEFAULT 0,
		enabled BOOLEAN NOT NULL DEFAULT true,
		created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
		updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
	);

	-- Mapping Versions (for audit and rollback)
	CREATE TABLE IF NOT EXISTS mapping_versions (
		id VARCHAR(64) PRIMARY KEY,
		integration_id VARCHAR(64) NOT NULL REFERENCES integrations(id) ON DELETE CASCADE,
		version INT NOT NULL,
		mapping_snapshot JSONB NOT NULL DEFAULT '[]'::jsonb,
		description TEXT DEFAULT '',
		created_by VARCHAR(255) NOT NULL DEFAULT 'system',
		created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
		CONSTRAINT uq_integration_version UNIQUE (integration_id, version)
	);

	-- Integration Samples (stores latest sample payload retrieved for wizard/preview)
	CREATE TABLE IF NOT EXISTS integration_samples (
		integration_id VARCHAR(64) PRIMARY KEY REFERENCES integrations(id) ON DELETE CASCADE,
		raw_payload JSONB NOT NULL DEFAULT '{}'::jsonb,
		updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
	);

	-- Indices for high performance queries
	CREATE INDEX IF NOT EXISTS idx_integrations_customer_id ON integrations(customer_id);
	CREATE INDEX IF NOT EXISTS idx_integrations_status ON integrations(status);
	CREATE INDEX IF NOT EXISTS idx_sync_jobs_integration_started ON sync_jobs(integration_id, started_at DESC);
	CREATE INDEX IF NOT EXISTS idx_sync_jobs_started_at ON sync_jobs(started_at DESC);
	CREATE INDEX IF NOT EXISTS idx_sync_jobs_status ON sync_jobs(status);
	CREATE INDEX IF NOT EXISTS idx_sync_logs_integration_created ON sync_logs(integration_id, created_at DESC);
	CREATE INDEX IF NOT EXISTS idx_sync_logs_created_at ON sync_logs(created_at DESC);
	CREATE INDEX IF NOT EXISTS idx_sync_logs_level ON sync_logs(level);
	CREATE INDEX IF NOT EXISTS idx_sync_logs_correlation_id ON sync_logs(correlation_id);
	CREATE INDEX IF NOT EXISTS idx_orders_synced_at ON orders(synced_at DESC);
	CREATE INDEX IF NOT EXISTS idx_field_mappings_integration ON field_mappings(integration_id);
	CREATE INDEX IF NOT EXISTS idx_field_mappings_provider ON field_mappings(provider_id);
	CREATE INDEX IF NOT EXISTS idx_field_mappings_canonical ON field_mappings(canonical_field);
	CREATE INDEX IF NOT EXISTS idx_mapping_versions_integration ON mapping_versions(integration_id, version DESC);
	CREATE INDEX IF NOT EXISTS idx_integration_metrics_ts ON integration_metrics(integration_id, timestamp DESC);
	CREATE INDEX IF NOT EXISTS idx_audit_logs_created_at ON audit_logs(created_at DESC);
	CREATE INDEX IF NOT EXISTS idx_notifications_unread ON notifications(is_read, created_at DESC);

	ALTER TABLE integrations ADD COLUMN IF NOT EXISTS environment VARCHAR(32) NOT NULL DEFAULT 'TEST';

	-- Standardized Relational View joining orders header and order_items detail
	CREATE OR REPLACE VIEW view_standardized_orders AS
	SELECT 
		i.id AS integration_id,
		i.name AS tienda,
		i.provider AS proveedor,
		o.id AS order_id,
		o.order_number AS num_pedido,
		o.external_order_id AS id_externo,
		oi.id AS item_id,
		oi.sku,
		oi.product_name AS nombre_producto,
		oi.quantity AS cantidad,
		oi.unit_price AS precio_unitario,
		oi.total_amount AS total_item,
		o.customer_full_name AS cliente,
		o.customer_email AS email,
		o.customer_phone AS telefono,
		o.shipping_address AS direccion,
		o.city AS comuna,
		o.total_amount AS total_pedido,
		o.currency AS moneda,
		o.status AS estado,
		o.synced_at AS fecha_sincronizacion
	FROM orders o
	JOIN integrations i ON o.integration_id = i.id
	JOIN order_items oi ON oi.order_id = o.id
	ORDER BY o.synced_at DESC, o.order_number DESC, oi.sku;
	`

	_, err := db.ExecContext(ctx, schema)
	return err
}
