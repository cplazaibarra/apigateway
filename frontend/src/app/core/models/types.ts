export interface User {
  id: string;
  name: string;
  email: string;
  role: 'ADMIN' | 'OPERATOR' | 'VIEWER';
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export interface Customer {
  id: string;
  code: string;
  name: string;
  contact_email: string;
  contact_phone: string;
  is_active: boolean;
  total_integrations?: number;
  active_integrations?: number;
  last_sync_at?: string;
  created_at: string;
  updated_at: string;
}

export interface CustomerDetail {
  customer: Customer;
  integrations: Integration[];
  stats: {
    total_integrations: number;
    active_integrations: number;
    total_orders: number;
    last_sync_at?: string;
    recent_errors_count: number;
  };
  recent_errors: SyncLog[];
}

export interface Integration {
  id: string;
  customer_id: string;
  customer_name?: string;
  customer_code?: string;
  name: string;
  provider: 'WOOCOMMERCE' | 'SAP' | 'ODOO' | 'BSALE';
  base_url: string;
  auth_type: 'API_KEY' | 'OAUTH2' | 'BASIC' | 'BEARER';
  masked_credentials?: string;
  status: 'ACTIVE' | 'ERROR' | 'DISABLED' | 'SYNCING';
  environment?: 'PRODUCTION' | 'TEST';
  polling_enabled: boolean;
  polling_interval_minutes: number;
  sync_batch_size?: number;
  last_sync_at?: string;
  next_polling_at?: string;
  total_orders_synced: number;
  consecutive_errors: number;
  last_error?: string;
  avg_response_time_ms: number;
  created_at: string;
  updated_at: string;
}

export interface SyncJob {
  id: string;
  integration_id: string;
  integration_name?: string;
  customer_id?: string;
  customer_name?: string;
  provider?: string;
  trigger_type: 'SCHEDULED' | 'MANUAL' | 'WEBHOOK';
  status: 'PENDING' | 'RUNNING' | 'SUCCESS' | 'PARTIAL' | 'FAILED' | 'CANCELLED';
  started_at: string;
  finished_at?: string;
  duration_ms: number;
  orders_found: number;
  orders_new: number;
  orders_updated: number;
  orders_failed: number;
  retries_count: number;
  error_message?: string;
  details?: any;
  created_at: string;
}

export interface SyncLog {
  id: string;
  sync_job_id?: string;
  integration_id?: string;
  integration_name?: string;
  customer_id?: string;
  customer_name?: string;
  provider?: string;
  level: 'INFO' | 'WARNING' | 'ERROR' | 'DEBUG';
  operation_type: string;
  request_id: string;
  correlation_id: string;
  duration_ms: number;
  result: 'SUCCESS' | 'FAILED' | 'SKIPPED' | 'RETRIED';
  message: string;
  details?: any;
  created_at: string;
}

export interface AlertRule {
  id: string;
  name: string;
  customer_id?: string;
  customer_name?: string;
  integration_id?: string;
  integration_name?: string;
  provider?: string;
  event_type: string;
  severity: 'CRITICAL' | 'HIGH' | 'MEDIUM' | 'LOW';
  consecutive_failures: number;
  threshold_seconds: number;
  recipients: string[];
  enabled: boolean;
  cooldown_minutes: number;
  last_triggered_at?: string;
  created_at: string;
  updated_at: string;
}

export interface Notification {
  id: string;
  title: string;
  message: string;
  severity: 'INFO' | 'WARNING' | 'ERROR' | 'CRITICAL';
  integration_id?: string;
  integration_name?: string;
  customer_id?: string;
  is_read: boolean;
  created_at: string;
}

export interface AuditLog {
  id: string;
  user_id: string;
  user_email: string;
  action: string;
  entity_type: string;
  entity_id: string;
  old_values?: any;
  new_values?: any;
  ip_address: string;
  created_at: string;
}

export interface SMTPConfig {
  id: string;
  host: string;
  port: number;
  username: string;
  password?: string;
  has_password?: boolean;
  use_tls: boolean;
  from_address: string;
  from_name: string;
  updated_at: string;
}

export interface ProviderTestResult {
  success: boolean;
  status_code: number;
  latency_ms: number;
  message: string;
  details?: string;
  raw_response?: any;
  sample_order?: any;
  tested_at: string;
}

export interface ProblematicIntegration {
  integration_id: string;
  integration_name: string;
  customer_id: string;
  customer_name: string;
  provider: string;
  last_run_at?: string;
  last_error: string;
  status: string;
  consecutive_failures: number;
  next_polling_at?: string;
}

export interface DashboardSummary {
  total_customers: number;
  active_integrations: number;
  error_integrations: number;
  disabled_integrations: number;
  today_queries: number;
  today_recovered_orders: number;
  today_errors: number;
  success_rate_percent: number;
  avg_response_time_ms: number;
  global_last_sync?: string;
  avg_response_time_by_provider: Record<string, number>;
  problematic_integrations: ProblematicIntegration[];
}

export interface ChartDataSeries {
  labels: string[];
  datasets: {
    label: string;
    data: number[];
    backgroundColor?: string;
    borderColor?: string;
  }[];
}

export interface DashboardData {
  summary: DashboardSummary;
  charts: {
    hourly_queries: ChartDataSeries;
    daily_queries: ChartDataSeries;
    daily_errors: ChartDataSeries;
    daily_orders: ChartDataSeries;
    avg_response_time: ChartDataSeries;
    queries_by_provider: ChartDataSeries;
    queries_by_customer: ChartDataSeries;
  };
}

export interface DetailedStatistics {
  total_queries: number;
  success_queries: number;
  failed_queries: number;
  success_rate: number;
  avg_duration_ms: number;
  min_duration_ms: number;
  max_duration_ms: number;
  p95_duration_ms: number;
  recovered_orders: number;
  total_retries: number;
  total_timeouts: number;
  grouped_by_provider: StatGroup[];
  grouped_by_customer: StatGroup[];
}

export interface StatGroup {
  name: string;
  total_queries: number;
  success_count: number;
  error_count: number;
  success_rate: number;
  avg_latency_ms: number;
  orders_count: number;
}

export interface SchedulerTask {
  integration_id: string;
  integration_name: string;
  customer_id: string;
  customer_name: string;
  provider: string;
  polling_enabled: boolean;
  interval_minutes: number;
  next_run_at?: string;
  last_run_at?: string;
  status: string;
  avg_duration_ms: number;
  is_locked: boolean;
}

// ----------------------------------------------------
// DYNAMIC FIELD MAPPING TYPES
// ----------------------------------------------------

export interface CanonicalField {
  id: string;
  name: string;
  group_name: string;
  data_type: 'STRING' | 'NUMBER' | 'BOOLEAN' | 'DATE' | 'ARRAY' | 'OBJECT';
  description: string;
  required: boolean;
  aliases: string[];
  example: string;
  created_at: string;
}

export interface FieldMapping {
  id?: string;
  integration_id?: string;
  provider_id?: string;
  profile_id?: string;
  canonical_field: string;
  source_path: string;
  mapping_type: 'DEFAULT' | 'OVERRIDE';
  data_type: string;
  required: boolean;
  default_value: string;
  transformation: string;
  transformation_params?: any;
  priority?: number;
  enabled: boolean;
  created_at?: string;
  updated_at?: string;
}

export interface MappingVersion {
  id: string;
  integration_id: string;
  version: number;
  mapping_snapshot: FieldMapping[];
  description: string;
  created_by: string;
  created_at: string;
}

export interface MappingWarning {
  canonical_field: string;
  source_path: string;
  warning_type: string;
  message: string;
  severity: 'WARNING' | 'ERROR';
}

export interface CanonicalOrder {
  id: string;
  external_id: string;
  order_number: string;
  status: string;
  created_at: string;
  currency: string;
  subtotal: number;
  tax: number;
  total: number;
  customer: {
    id?: string;
    name: string;
    document?: string;
    email: string;
    phone: string;
  };
  delivery: {
    address: string;
    city: string;
    region: string;
    country: string;
    postal_code: string;
    contact: string;
    phone: string;
  };
  items: Array<{
    sku: string;
    external_product_id?: string;
    description: string;
    quantity: number;
    unit_price: number;
    discount: number;
    tax: number;
    total: number;
  }>;
  raw_payload?: any;
}

export interface MappingPreviewResponse {
  canonical_order?: CanonicalOrder;
  warnings: MappingWarning[];
  errors: string[];
  success: boolean;
}

export interface EffectiveMappingResult {
  integration_id: string;
  integration_name: string;
  provider: string;
  mappings: FieldMapping[];
  canonical_fields: CanonicalField[];
  coverage_percent: number;
  required_count: number;
  required_mapped: number;
  optional_count: number;
  optional_mapped: number;
  current_version: number;
  latest_sample?: any;
}

export interface AutoMappingSuggestion {
  canonical_field: string;
  source_path: string;
  confidence: number;
  transformation: string;
  reason: string;
}

export interface StandardizedOrderItemReport {
  id: string;
  sku: string;
  product_name: string;
  quantity: number;
  unit_price: number;
  total_amount: number;
}

export interface StandardizedOrderReport {
  id: string;
  integration_id: string;
  integration_name: string;
  provider: string;
  order_number: string;
  external_order_id: string;
  customer_full_name: string;
  customer_email: string;
  customer_phone: string;
  shipping_address: string;
  city: string;
  commune: string;
  total_amount: number;
  currency: string;
  status: string;
  item_count: number;
  items: StandardizedOrderItemReport[];
  raw_payload?: any;
  synced_at: string;
}
