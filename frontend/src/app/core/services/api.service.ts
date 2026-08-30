import { Injectable, inject } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';
import { Observable } from 'rxjs';
import {
  Customer, CustomerDetail, Integration, SyncJob, SyncLog,
  AlertRule, Notification, AuditLog, SMTPConfig, ProviderTestResult,
  DashboardData, DetailedStatistics, SchedulerTask, User,
  CanonicalField, FieldMapping, MappingVersion, EffectiveMappingResult,
  MappingPreviewResponse, AutoMappingSuggestion, StandardizedOrderReport, StandardizedOrderItemReport
} from '../models/types';

@Injectable({
  providedIn: 'root'
})
export class ApiService {
  private http = inject(HttpClient);
  private baseUrl = '/api/v1/admin';

  // Dashboard & Stats
  getDashboard(params: any = {}): Observable<DashboardData> {
    return this.http.get<DashboardData>(`${this.baseUrl}/dashboard`, { params: this.cleanParams(params) });
  }

  getStatistics(): Observable<DetailedStatistics> {
    return this.http.get<DetailedStatistics>(`${this.baseUrl}/statistics`);
  }

  // Customers
  getCustomers(search?: string): Observable<Customer[]> {
    return this.http.get<Customer[]>(`${this.baseUrl}/customers`, { params: this.cleanParams({ search }) });
  }

  getCustomer(id: string): Observable<CustomerDetail> {
    return this.http.get<CustomerDetail>(`${this.baseUrl}/customers/${id}`);
  }

  createCustomer(data: Partial<Customer>): Observable<Customer> {
    return this.http.post<Customer>(`${this.baseUrl}/customers`, data);
  }

  updateCustomer(id: string, data: Partial<Customer>): Observable<Customer> {
    return this.http.put<Customer>(`${this.baseUrl}/customers/${id}`, data);
  }

  toggleCustomer(id: string): Observable<{ id: string; is_active: boolean }> {
    return this.http.post<{ id: string; is_active: boolean }>(`${this.baseUrl}/customers/${id}/toggle`, {});
  }

  // Integrations
  getIntegrations(filters: any = {}): Observable<Integration[]> {
    return this.http.get<Integration[]>(`${this.baseUrl}/integrations`, { params: this.cleanParams(filters) });
  }

  getIntegration(id: string): Observable<Integration> {
    return this.http.get<Integration>(`${this.baseUrl}/integrations/${id}`);
  }

  createIntegration(data: any): Observable<Integration> {
    return this.http.post<Integration>(`${this.baseUrl}/integrations`, data);
  }

  updateIntegration(id: string, data: any): Observable<Integration> {
    return this.http.put<Integration>(`${this.baseUrl}/integrations/${id}`, data);
  }

  deleteIntegration(id: string): Observable<any> {
    return this.http.delete(`${this.baseUrl}/integrations/${id}`);
  }

  toggleIntegrationPolling(id: string): Observable<{ id: string; polling_enabled: boolean }> {
    return this.http.post<{ id: string; polling_enabled: boolean }>(`${this.baseUrl}/integrations/${id}/toggle-polling`, {});
  }

  toggleIntegrationEnvironment(id: string): Observable<{ id: string; environment: 'PRODUCTION' | 'TEST' }> {
    return this.http.post<{ id: string; environment: 'PRODUCTION' | 'TEST' }>(`${this.baseUrl}/integrations/${id}/toggle-environment`, {});
  }

  toggleIntegrationStatus(id: string): Observable<{ id: string; status: 'ACTIVE' | 'ERROR' | 'DISABLED' }> {
    return this.http.post<{ id: string; status: 'ACTIVE' | 'ERROR' | 'DISABLED' }>(`${this.baseUrl}/integrations/${id}/toggle-status`, {});
  }

  testConnection(id: string): Observable<ProviderTestResult> {
    return this.http.post<ProviderTestResult>(`${this.baseUrl}/integrations/${id}/test`, {});
  }

  triggerManualSync(id: string): Observable<SyncJob> {
    return this.http.post<SyncJob>(`${this.baseUrl}/integrations/${id}/sync`, {});
  }

  // Sync Jobs
  getSyncJobs(filters: any = {}): Observable<{ jobs: SyncJob[]; total_count: number; page: number; limit: number; total_pages: number }> {
    return this.http.get<any>(`${this.baseUrl}/sync-jobs`, { params: this.cleanParams(filters) });
  }

  getSyncJob(id: string): Observable<{ job: SyncJob; logs: SyncLog[] }> {
    return this.http.get<any>(`${this.baseUrl}/sync-jobs/${id}`);
  }

  // Logs
  getLogs(filters: any = {}): Observable<{ logs: SyncLog[]; total_count: number; page: number; limit: number; total_pages: number }> {
    return this.http.get<any>(`${this.baseUrl}/logs`, { params: this.cleanParams(filters) });
  }

  // Scheduler
  getSchedulerTasks(): Observable<SchedulerTask[]> {
    return this.http.get<SchedulerTask[]>(`${this.baseUrl}/scheduler`);
  }

  // Alerts
  getAlerts(): Observable<AlertRule[]> {
    return this.http.get<AlertRule[]>(`${this.baseUrl}/alerts`);
  }

  createAlert(data: Partial<AlertRule>): Observable<AlertRule> {
    return this.http.post<AlertRule>(`${this.baseUrl}/alerts`, data);
  }

  updateAlert(id: string, data: Partial<AlertRule>): Observable<AlertRule> {
    return this.http.put<AlertRule>(`${this.baseUrl}/alerts/${id}`, data);
  }

  deleteAlert(id: string): Observable<any> {
    return this.http.delete(`${this.baseUrl}/alerts/${id}`);
  }

  // Notifications
  getNotifications(unreadOnly: boolean = false): Observable<{ notifications: Notification[]; unread_count: number }> {
    const p = unreadOnly ? { unread_only: 'true' } : {};
    return this.http.get<{ notifications: Notification[]; unread_count: number }>(`${this.baseUrl}/notifications`, { params: this.cleanParams(p) });
  }

  markNotificationRead(id: string): Observable<any> {
    return this.http.post(`${this.baseUrl}/notifications/${id}/read`, {});
  }

  markAllNotificationsRead(): Observable<any> {
    return this.http.post(`${this.baseUrl}/notifications/read-all`, {});
  }

  // SMTP
  getSMTPConfig(): Observable<SMTPConfig> {
    return this.http.get<SMTPConfig>(`${this.baseUrl}/smtp`);
  }

  updateSMTPConfig(data: Partial<SMTPConfig>): Observable<SMTPConfig> {
    return this.http.post<SMTPConfig>(`${this.baseUrl}/smtp`, data);
  }

  sendTestEmail(targetEmail?: string): Observable<{ success: boolean; message: string; latency_ms: number }> {
    return this.http.post<any>(`${this.baseUrl}/smtp/test`, { target_email: targetEmail });
  }

  // Audit
  getAuditLogs(filters: any = {}): Observable<{ audit_logs: AuditLog[]; total_count: number; page: number; limit: number; total_pages: number }> {
    return this.http.get<any>(`${this.baseUrl}/audit`, { params: this.cleanParams(filters) });
  }

  // Users
  getUsers(): Observable<User[]> {
    return this.http.get<User[]>(`${this.baseUrl}/users`);
  }

  createUser(data: any): Observable<User> {
    return this.http.post<User>(`${this.baseUrl}/users`, data);
  }

  // ----------------------------------------------------
  // DYNAMIC FIELD MAPPING API
  // ----------------------------------------------------

  getCanonicalFields(): Observable<CanonicalField[]> {
    return this.http.get<CanonicalField[]>(`${this.baseUrl}/canonical-fields`);
  }

  getProviderDefaultMapping(provider: string): Observable<FieldMapping[]> {
    return this.http.get<FieldMapping[]>(`${this.baseUrl}/providers/${provider}/default-mapping`);
  }

  getIntegrationMapping(id: string): Observable<EffectiveMappingResult> {
    return this.http.get<EffectiveMappingResult>(`${this.baseUrl}/integrations/${id}/mapping`);
  }

  saveIntegrationMapping(id: string, mappings: FieldMapping[]): Observable<EffectiveMappingResult> {
    return this.http.put<EffectiveMappingResult>(`${this.baseUrl}/integrations/${id}/mapping`, mappings);
  }

  deleteIntegrationMappingRule(id: string, mappingId: string): Observable<any> {
    return this.http.delete(`${this.baseUrl}/integrations/${id}/mapping/${mappingId}`);
  }

  fetchSampleOrderPayload(id: string): Observable<{ raw_payload: any }> {
    return this.http.post<{ raw_payload: any }>(`${this.baseUrl}/integrations/${id}/mapping/sample`, {});
  }

  previewMapping(req: { raw_payload: any; mappings: FieldMapping[] }): Observable<MappingPreviewResponse> {
    return this.http.post<MappingPreviewResponse>(`${this.baseUrl}/integrations/any/mapping/preview`, req);
  }

  testIntegrationMapping(id: string, mappings?: FieldMapping[]): Observable<MappingPreviewResponse> {
    return this.http.post<MappingPreviewResponse>(`${this.baseUrl}/integrations/${id}/mapping/test`, { mappings: mappings || [] });
  }

  getMappingVersions(id: string): Observable<MappingVersion[]> {
    return this.http.get<MappingVersion[]>(`${this.baseUrl}/integrations/${id}/mapping/versions`);
  }

  restoreMappingVersion(id: string, version: number): Observable<EffectiveMappingResult> {
    return this.http.post<EffectiveMappingResult>(`${this.baseUrl}/integrations/${id}/mapping/versions/${version}/restore`, {});
  }

  suggestAutoMappings(id: string): Observable<AutoMappingSuggestion[]> {
    return this.http.get<AutoMappingSuggestion[]>(`${this.baseUrl}/integrations/${id}/mapping/suggestions`);
  }

  getStandardizedOrders(filters?: any): Observable<StandardizedOrderReport[]> {
    return this.http.get<StandardizedOrderReport[]>(`${this.baseUrl}/orders`, {
      params: filters ? this.cleanParams(filters) : undefined
    });
  }

  getStandardizedOrder(id: string): Observable<StandardizedOrderReport> {
    return this.http.get<StandardizedOrderReport>(`${this.baseUrl}/orders/${id}`);
  }

  private cleanParams(params: any): HttpParams {
    let httpParams = new HttpParams();
    for (const key of Object.keys(params)) {
      if (params[key] !== undefined && params[key] !== null && params[key] !== '') {
        httpParams = httpParams.set(key, String(params[key]));
      }
    }
    return httpParams;
  }
}
