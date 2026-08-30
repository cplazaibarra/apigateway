import { Component, inject, signal, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { ApiService } from '../../core/services/api.service';
import { ToastService } from '../../core/services/toast.service';
import { AuthService } from '../../core/services/auth.service';
import { Integration, Customer, ProviderTestResult } from '../../core/models/types';

@Component({
  selector: 'app-integrations',
  standalone: true,
  imports: [CommonModule, FormsModule, RouterLink],
  template: `
    <div class="page-body space-y-6">
      <!-- Title & Filters Bar -->
      <div class="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h2 class="text-2xl font-bold text-slate-900 flex items-center gap-2">
            <span>🔌</span> Conexiones & Integraciones
          </h2>
          <p class="text-xs text-slate-500 mt-0.5">Adaptadores para WooCommerce, SAP, Odoo y BSALE con pruebas y polling automático</p>
        </div>

        <div class="flex items-center flex-wrap gap-2.5">
          <input type="text" [(ngModel)]="searchQuery" (input)="loadIntegrations()" placeholder="Buscar integración..." 
                 class="form-control text-xs py-1.5 px-3 w-48 bg-white border-slate-200 text-slate-800 rounded-xl" />

          <select [(ngModel)]="selectedProvider" (change)="loadIntegrations()" class="form-select text-xs py-1.5 px-3 w-auto bg-white border-slate-200 text-slate-700 rounded-xl">
            <option value="">Todos los Proveedores</option>
            <option value="WOOCOMMERCE">WooCommerce</option>
            <option value="SAP">SAP</option>
            <option value="ODOO">Odoo</option>
            <option value="BSALE">BSALE</option>
          </select>

          <!-- Checkbox Filters for Status (Activas checked by default) -->
          <div class="flex items-center gap-3 bg-white border border-slate-200 px-3.5 py-1.5 rounded-xl text-xs shadow-sm">
            <span class="text-slate-400 font-bold uppercase text-[10px]">Mostrar:</span>
            
            <label class="flex items-center gap-1.5 cursor-pointer text-emerald-700 font-semibold hover:text-emerald-800">
              <input type="checkbox" [(ngModel)]="filterActive" (change)="loadIntegrations()" class="rounded border-slate-300 text-emerald-600 focus:ring-emerald-500" />
              <span>Activas</span>
            </label>

            <label class="flex items-center gap-1.5 cursor-pointer text-amber-700 font-semibold hover:text-amber-800">
              <input type="checkbox" [(ngModel)]="filterError" (change)="loadIntegrations()" class="rounded border-slate-300 text-amber-600 focus:ring-amber-500" />
              <span>Con Error</span>
            </label>

            <label class="flex items-center gap-1.5 cursor-pointer text-slate-600 font-semibold hover:text-slate-700">
              <input type="checkbox" [(ngModel)]="filterDisabled" (change)="loadIntegrations()" class="rounded border-slate-300 text-slate-500 focus:ring-slate-500" />
              <span>Deshabilitadas</span>
            </label>
          </div>

          <button *ngIf="auth.isAdmin()" (click)="openCreateModal()" class="btn btn-primary btn-sm flex items-center gap-1.5">
            <span>➕</span> Nueva Integración
          </button>
        </div>
      </div>

      <!-- Integrations Table -->
      <div class="card bg-white border-slate-200 p-0 overflow-hidden shadow-sm">
        <div class="table-container border-0 rounded-none bg-transparent overflow-x-auto">
          <table class="w-full min-w-[1100px]">
            <thead>
              <tr>
                <th class="w-64">Integración & Cliente</th>
                <th>Proveedor</th>
                <th>Endpoint Base & Auth</th>
                <th>Ambiente</th>
                <th>Estado</th>
                <th>Polling</th>
                <th>Última Sync</th>
                <th>Pedidos</th>
                <th>Latencia</th>
                <th class="text-right sticky right-0 bg-slate-50 z-10 border-l border-slate-200">Acciones</th>
              </tr>
            </thead>
            <tbody class="divide-y divide-slate-100">
              <tr *ngFor="let it of integrations()" class="hover:bg-slate-50/80 transition">
                <td>
                  <div class="font-semibold text-slate-800 text-sm">{{ it.name }}</div>
                  <div class="text-xs text-emerald-700 font-mono">{{ it.customer_name }}</div>
                  <div *ngIf="it.last_error" class="text-[11px] text-red-600 font-mono mt-0.5 truncate max-w-xs" [title]="it.last_error">
                    ⚠️ {{ it.last_error }}
                  </div>
                </td>

                <td>
                  <span class="code-badge font-bold text-xs" [ngClass]="{
                    'text-purple-700 bg-purple-50 border-purple-200': it.provider === 'WOOCOMMERCE',
                    'text-blue-700 bg-blue-50 border-blue-200': it.provider === 'SAP',
                    'text-amber-700 bg-amber-50 border-amber-200': it.provider === 'ODOO',
                    'text-emerald-700 bg-emerald-50 border-emerald-200': it.provider === 'BSALE'
                  }">
                    {{ it.provider }}
                  </span>
                </td>

                <td class="text-xs">
                  <div class="text-slate-700 font-mono truncate max-w-xs" [title]="it.base_url">{{ it.base_url }}</div>
                  <div class="text-slate-400 text-[10px] mt-0.5">{{ it.auth_type }} | {{ it.masked_credentials }}</div>
                </td>

                <!-- Ambiente (PRODUCCIÓN vs PRUEBA) -->
                <td>
                  <button *ngIf="auth.isOperator()"
                          (click)="toggleEnvironment(it)"
                          class="btn btn-sm text-xs py-1 px-2.5 font-bold rounded-lg border transition flex items-center gap-1.5 shadow-sm"
                          [ngClass]="it.environment === 'PRODUCTION' ? 'bg-emerald-50 border-emerald-300 text-emerald-700 hover:bg-emerald-100' : 'bg-amber-50 border-amber-300 text-amber-700 hover:bg-amber-100'"
                          [title]="it.environment === 'PRODUCTION' ? 'En PRODUCCIÓN: al sincronizar cambiará el estado de los pedidos en la tienda origen. Clic para cambiar a MODO PRUEBA.' : 'En MODO PRUEBA: solo consulta la API y no modifica el estado en la tienda origen. Clic para activar PRODUCCIÓN.'">
                    <span>{{ it.environment === 'PRODUCTION' ? '🟢 PRODUCCIÓN' : '🧪 MODO PRUEBA' }}</span>
                  </button>
                  <span *ngIf="!auth.isOperator()" class="badge" [ngClass]="it.environment === 'PRODUCTION' ? 'badge-success' : 'badge-warning'">
                    {{ it.environment === 'PRODUCTION' ? 'PRODUCCIÓN' : 'PRUEBA' }}
                  </span>
                  <div class="text-[10px] text-slate-400 mt-1">
                    {{ it.environment === 'PRODUCTION' ? 'Actualiza estado en tienda' : 'Solo lectura en tienda' }}
                  </div>
                </td>

                <!-- Columna Estado Operativo -->
                <td>
                  <button *ngIf="auth.isOperator()"
                          (click)="confirmToggleStatus(it)"
                          class="badge cursor-pointer transition hover:opacity-85 active:scale-95 shadow-sm font-bold py-1 px-2.5 rounded-lg border"
                          [ngClass]="it.status === 'ACTIVE' ? 'bg-emerald-50 border-emerald-300 text-emerald-700' : (it.status === 'DISABLED' ? 'bg-slate-100 border-slate-200 text-slate-500' : 'bg-red-50 border-red-300 text-red-700')"
                          [title]="it.status === 'ACTIVE' ? 'Clic para DESHABILITAR la integración' : 'Clic para ACTIVAR la integración'">
                    <span class="status-dot" [class.active]="it.status === 'ACTIVE'" [class.error]="it.status === 'ERROR'" [class.disabled]="it.status === 'DISABLED'"></span>
                    {{ it.status === 'ACTIVE' ? 'ACTIVA' : (it.status === 'DISABLED' ? 'DESHABILITADA' : it.status) }}
                  </button>
                  <span *ngIf="!auth.isOperator()" class="badge font-bold" [class.badge-success]="it.status === 'ACTIVE'" [class.badge-danger]="it.status === 'ERROR'" [class.badge-muted]="it.status === 'DISABLED'">
                    <span class="status-dot" [class.active]="it.status === 'ACTIVE'" [class.error]="it.status === 'ERROR'" [class.disabled]="it.status === 'DISABLED'"></span>
                    {{ it.status === 'ACTIVE' ? 'ACTIVA' : (it.status === 'DISABLED' ? 'DESHABILITADA' : it.status) }}
                  </span>
                </td>

                <!-- Columna Polling Automático -->
                <td class="text-xs">
                  <div *ngIf="it.status !== 'DISABLED'" class="flex items-center gap-1.5">
                    <button *ngIf="auth.isOperator()"
                            (click)="togglePolling(it)"
                            class="btn btn-xs py-0.5 px-2 font-mono text-[11px] rounded border transition flex items-center gap-1"
                            [ngClass]="it.polling_enabled ? 'bg-emerald-50 border-emerald-300 text-emerald-700 hover:bg-emerald-100' : 'bg-slate-100 border-slate-200 text-slate-500 hover:bg-slate-200'"
                            [title]="it.polling_enabled ? 'Polling activo: clic para pausar consultas automáticas' : 'Polling pausado: clic para reanudar consultas automáticas'">
                      <span>{{ it.polling_enabled ? '▶ Activo' : '⏸ Pausado' }}</span>
                    </button>
                    <span class="text-slate-500 text-[11px] font-mono">⏱️ {{ it.polling_interval_minutes }}m</span>
                  </div>
                  <div *ngIf="it.status === 'DISABLED'" class="text-[11px] text-slate-400 italic">
                    —
                  </div>
                </td>

                <td class="text-xs text-slate-600">
                  <div>{{ it.last_sync_at ? (it.last_sync_at | date:'dd/MM HH:mm') : 'Pendiente' }}</div>
                  <div class="text-[10px] text-slate-400">Próx: {{ it.next_polling_at ? (it.next_polling_at | date:'HH:mm') : '-' }}</div>
                </td>

                <td class="text-xs">
                  <div class="font-mono font-bold text-slate-800 text-sm">
                    {{ it.total_orders_synced | number }}
                  </div>
                  <div class="text-[10px] text-slate-400 font-mono mt-0.5" title="Cantidad de pedidos solicitados por lote a la API">
                    📦 Lote: {{ it.sync_batch_size || 10 }} / req
                  </div>
                </td>

                <td class="font-mono font-semibold text-xs text-slate-600">
                  {{ it.avg_response_time_ms }} ms
                </td>

                <td class="text-right space-x-1.5 whitespace-nowrap sticky right-0 bg-white z-10 border-l border-slate-200">
                  <a [routerLink]="['/integrations', it.id, 'mapping']" class="btn btn-secondary btn-sm text-xs py-1 text-emerald-700 hover:text-emerald-800 border-emerald-200 bg-emerald-50 inline-flex items-center gap-1" title="Configurar Mapeo Dinámico de Campos">
                    <span>🗺️</span> Mapeo
                  </a>
                  <button (click)="openEditModal(it)" class="btn btn-secondary btn-sm text-xs py-1 text-slate-700 hover:text-slate-900 border-slate-200 bg-white hover:bg-slate-50 inline-flex items-center gap-1 font-semibold" title="Editar configuración de la integración">
                    <span>✏️</span> Editar
                  </button>
                  <button *ngIf="auth.isOperator()" (click)="testConnection(it)" class="btn btn-secondary btn-sm text-xs py-1" title="Probar conexión en vivo">
                    🔍 Probar
                  </button>
                  <button *ngIf="auth.isOperator()" (click)="manualSync(it)" class="btn btn-primary btn-sm text-xs py-1" title="Ejecutar sincronización ahora">
                    ⚡ Sync
                  </button>
                  <a [routerLink]="['/logs']" [queryParams]="{integration_id: it.id}" class="btn btn-secondary btn-sm text-xs py-1" title="Ver logs">
                    📜 Logs
                  </a>
                  <button *ngIf="auth.isAdmin()" (click)="deleteIntegration(it)" class="btn btn-danger btn-sm text-xs py-1" title="Eliminar integración">
                    🗑️
                  </button>
                </td>
              </tr>
              <tr *ngIf="integrations().length === 0">
                <td colspan="8" class="text-center py-6 text-slate-500 text-xs">
                  No se encontraron integraciones configuradas
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>
    </div>

    <!-- Test Connection Result Modal -->
    <div *ngIf="testResult()" class="modal-overlay">
      <div class="modal-container max-w-3xl">
        <div class="modal-header">
          <h3 class="text-sm font-bold text-slate-100 flex items-center gap-2">
            <span>🔍</span> Diagnóstico y Payload en Vivo: {{ currentTestingIntegration()?.name }}
          </h3>
          <button (click)="testResult.set(null)" class="text-slate-400 hover:text-slate-200">✕</button>
        </div>
        <div class="modal-body space-y-4 max-h-[75vh] overflow-y-auto">
          <!-- Status Banner -->
          <div class="p-3 rounded-lg border flex items-center justify-between" [class.bg-emerald-950-30]="testResult()?.success" [class.border-emerald-800-40]="testResult()?.success" [class.bg-red-950-30]="!testResult()?.success" [class.border-red-800-40]="!testResult()?.success">
            <div>
              <div class="flex items-center gap-2 font-bold text-sm" [class.text-emerald-400]="testResult()?.success" [class.text-red-400]="!testResult()?.success">
                <span>{{ testResult()?.success ? '✅ Conexión y Payload Obtenidos Exitosamente' : '❌ Error de Comunicación' }}</span>
              </div>
              <p class="text-xs text-slate-300 mt-0.5">{{ testResult()?.message }}</p>
            </div>
            <div class="flex items-center gap-3">
              <span class="font-mono font-bold text-xs bg-slate-900 px-2.5 py-1 rounded border border-slate-800 text-slate-200">
                HTTP {{ testResult()?.status_code || 0 }}
              </span>
              <span class="font-mono font-bold text-xs bg-slate-900 px-2.5 py-1 rounded border border-slate-800 text-amber-400">
                {{ testResult()?.latency_ms }} ms
              </span>
            </div>
          </div>

          <!-- Payload Viewer Header with Actions -->
          <div class="space-y-2">
            <div class="flex items-center justify-between flex-wrap gap-2">
              <div class="flex items-center gap-2">
                <span class="text-xs font-bold text-slate-200 uppercase tracking-wider">📦 Datos Entregados por la API Externa</span>
                <span class="badge badge-primary text-[10px]">JSON RAW</span>
              </div>
              <div class="flex items-center gap-2">
                <button (click)="copyPayloadToClipboard()" class="btn btn-secondary btn-sm text-xs py-1 flex items-center gap-1">
                  <span>📋</span> Copiar JSON
                </button>
              </div>
            </div>

            <!-- Formatted Raw JSON Box -->
            <div class="bg-slate-950 border border-slate-800 rounded-lg p-3 max-h-72 overflow-y-auto font-mono text-[11px] text-slate-200 shadow-inner">
              <pre class="whitespace-pre-wrap leading-relaxed">{{ formatJSON(testResult()?.sample_order || testResult()?.raw_response) }}</pre>
            </div>
            <p class="text-[11px] text-slate-400">
              💡 Puedes inspeccionar las claves superiores (ej. <code>shipping</code>, <code>meta_data</code>, <code>billing</code>, <code>line_items</code>) para afinar tus reglas de mapeo dinámico.
            </p>
          </div>

          <div *ngIf="testResult()?.details" class="p-2.5 rounded bg-slate-950 border border-slate-800 text-xs font-mono text-slate-400 whitespace-pre-wrap">
            {{ testResult()?.details }}
          </div>
        </div>
        <div class="modal-footer flex items-center justify-between">
          <div class="text-[11px] text-slate-500">
            🔒 Claves privadas y passwords resguardados de forma segura.
          </div>
          <div class="flex items-center gap-2">
            <button (click)="testResult.set(null)" class="btn btn-secondary btn-sm">Cerrar</button>
            <button *ngIf="currentTestingIntegration()" (click)="openMappingFromTest()" class="btn btn-primary btn-sm flex items-center gap-1.5 shadow-sm">
              <span>🗺️</span> Afinar Mapeo de Campos con este Payload
            </button>
          </div>
        </div>
      </div>
    </div>

    <!-- Create / Edit Integration Modal -->
    <div *ngIf="showFormModal()" class="modal-overlay">
      <div class="modal-container max-w-xl flex flex-col max-h-[90vh]">
        <div class="modal-header shrink-0">
          <h3 class="text-sm font-bold text-slate-100">
            {{ isEditing() ? 'Editar Integración' : 'Registrar Nueva Integración' }}
          </h3>
          <button (click)="showFormModal.set(false)" class="text-slate-400 hover:text-slate-200">✕</button>
        </div>
        <form (ngSubmit)="saveIntegration()" class="flex flex-col overflow-hidden flex-1">
          <div class="modal-body space-y-3.5 overflow-y-auto flex-1 p-5">
            <div class="form-group" *ngIf="!isEditing()">
              <label class="form-label">Cliente / Empresa Asignada</label>
              <select [(ngModel)]="formIntegration.customer_id" name="customer_id" required class="form-select text-xs">
                <option value="">Seleccionar Cliente...</option>
                <option *ngFor="let c of customers()" [value]="c.id">{{ c.name }} ({{ c.code }})</option>
              </select>
            </div>

            <div class="form-group">
              <label class="form-label">Nombre Descriptivo de la Integración</label>
              <input type="text" [(ngModel)]="formIntegration.name" name="name" required placeholder="Ej: WooCommerce Tienda Principal" class="form-control text-xs" />
            </div>

            <div class="grid grid-cols-2 gap-3">
              <div class="form-group">
                <label class="form-label">Proveedor</label>
                <select [(ngModel)]="formIntegration.provider" name="provider" required class="form-select text-xs" [disabled]="isEditing()">
                  <option value="WOOCOMMERCE">WooCommerce REST API</option>
                  <option value="SAP">SAP Business One / S4HANA</option>
                  <option value="ODOO">Odoo ERP (JSON-RPC)</option>
                  <option value="BSALE">BSALE API</option>
                </select>
              </div>

              <div class="form-group">
                <label class="form-label">Tipo de Autenticación</label>
                <select [(ngModel)]="formIntegration.auth_type" name="auth_type" required class="form-select text-xs">
                  <option value="API_KEY">API Key / Secret</option>
                  <option value="BEARER">Bearer Access Token</option>
                  <option value="BASIC">Basic Auth / Session</option>
                  <option value="OAUTH2">OAuth 2.0 Client</option>
                </select>
              </div>
            </div>

            <div class="form-group">
              <label class="form-label">URL Base del Endpoint</label>
              <input type="url" [(ngModel)]="formIntegration.base_url" name="base_url" required placeholder="https://api.empresa.cl/v1" class="form-control text-xs font-mono" />
            </div>

            <!-- Credentials Section -->
            <div class="p-3 rounded-lg bg-slate-950 border border-slate-800 space-y-2.5">
              <span class="text-xs font-bold uppercase tracking-wider text-slate-400 block">Credenciales de Acceso (Cifradas)</span>
              
              <div class="grid grid-cols-2 gap-2.5">
                <div>
                  <label class="text-[11px] text-slate-500">API Key / Token / Usuario</label>
                  <input type="text" [(ngModel)]="formCredentials.api_key" name="api_key" placeholder="Key o Token..." class="form-control text-xs font-mono" />
                </div>
                <div>
                  <label class="text-[11px] text-slate-500">API Secret / Password</label>
                  <input type="password" [(ngModel)]="formCredentials.api_secret" name="api_secret" placeholder="••••••••••••" class="form-control text-xs font-mono" />
                </div>
              </div>
            </div>

            <div class="grid grid-cols-3 gap-3">
              <div class="form-group">
                <label class="form-label">Intervalo Polling (Min)</label>
                <input type="number" [(ngModel)]="formIntegration.polling_interval_minutes" name="polling_interval" min="1" max="1440" class="form-control text-xs font-mono" />
              </div>
              <div class="form-group">
                <label class="form-label">Pedidos por Consulta (Batch)</label>
                <input type="number" [(ngModel)]="formIntegration.sync_batch_size" name="sync_batch_size" min="1" max="100" placeholder="10" class="form-control text-xs font-mono" />
              </div>
              <div class="form-group">
                <label class="form-label">Ambiente de Ejecución</label>
                <select [(ngModel)]="formIntegration.environment" name="environment" class="form-select text-xs">
                  <option value="TEST">🧪 MODO PRUEBA</option>
                  <option value="PRODUCTION">🟢 PRODUCCIÓN</option>
                </select>
              </div>
            </div>

            <div class="grid grid-cols-2 gap-3" *ngIf="isEditing()">
              <div class="form-group">
                <label class="form-label">Estado de la Integración</label>
                <select [(ngModel)]="formIntegration.status" name="status" class="form-select text-xs">
                  <option value="ACTIVE">ACTIVE (Operativa)</option>
                  <option value="ERROR">ERROR (Con fallas)</option>
                  <option value="DISABLED">DISABLED (Deshabilitada)</option>
                </select>
              </div>
            </div>

            <div class="flex items-center gap-2 pt-1">
              <input type="checkbox" [(ngModel)]="formIntegration.polling_enabled" name="polling_enabled" id="pollEnabled" class="rounded border-slate-700 bg-slate-900 text-indigo-600 focus:ring-indigo-500" />
              <label for="pollEnabled" class="text-xs text-slate-300">Habilitar consulta programada periódica (Polling activo)</label>
            </div>
          </div>

          <div class="modal-footer shrink-0 bg-slate-950/80 border-t border-slate-800 p-4 flex items-center justify-end gap-3">
            <button type="button" (click)="showFormModal.set(false)" class="btn btn-secondary btn-sm">Cancelar</button>
            <button type="submit" class="btn btn-success btn-sm font-bold flex items-center gap-1.5 px-4 py-2 shadow-sm">
              <span>💾</span> Guardar Integración
            </button>
          </div>
        </form>
      </div>
    </div>
  `
})
export class IntegrationsComponent implements OnInit {
  private api = inject(ApiService);
  private toast = inject(ToastService);
  auth = inject(AuthService);

  integrations = signal<Integration[]>([]);
  customers = signal<Customer[]>([]);
  testResult = signal<ProviderTestResult | null>(null);
  selectedIntegrationForMapping = signal<Integration | null>(null);

  selectedProvider = '';
  searchQuery = '';

  // Status Checkboxes (Default: only active integrations visible)
  filterActive = true;
  filterError = false;
  filterDisabled = false;

  showFormModal = signal(false);
  isEditing = signal(false);
  formIntegration: Partial<Integration> = {};
  formCredentials: any = {};

  openMapping(it: Integration) {
    this.selectedIntegrationForMapping.set(it);
  }

  ngOnInit() {
    this.loadIntegrations();
    this.loadCustomers();
  }

  loadIntegrations() {
    const filters: any = {};
    if (this.selectedProvider) filters.provider = this.selectedProvider;
    if (this.searchQuery) filters.search = this.searchQuery;

    // Calculate selected status filters
    const selectedStatuses: string[] = [];
    if (this.filterActive) selectedStatuses.push('ACTIVE');
    if (this.filterError) selectedStatuses.push('ERROR');
    if (this.filterDisabled) selectedStatuses.push('DISABLED');

    if (selectedStatuses.length > 0 && selectedStatuses.length < 3) {
      filters.status = selectedStatuses.join(',');
    } else if (selectedStatuses.length === 0) {
      filters.status = 'NONE'; // Show nothing if all checkboxes are unchecked
    }

    this.api.getIntegrations(filters).subscribe({
      next: res => this.integrations.set(res || []),
      error: () => this.toast.error('Error al cargar integraciones')
    });
  }

  loadCustomers() {
    this.api.getCustomers().subscribe({
      next: res => this.customers.set(res || []),
      error: () => {}
    });
  }

  openCreateModal() {
    this.isEditing.set(false);
    this.formIntegration = {
      provider: 'WOOCOMMERCE',
      auth_type: 'API_KEY',
      polling_enabled: true,
      polling_interval_minutes: 15
    };
    this.formCredentials = {};
    this.showFormModal.set(true);
  }

  openEditModal(it: Integration) {
    this.isEditing.set(true);
    this.formIntegration = { ...it };
    this.formCredentials = {};
    this.showFormModal.set(true);
  }

  saveIntegration() {
    if (!this.formIntegration.name || !this.formIntegration.base_url) {
      this.toast.error('Por favor complete los campos obligatorios');
      return;
    }

    const payload = {
      ...this.formIntegration,
      credentials: this.formCredentials
    };

    if (this.isEditing() && this.formIntegration.id) {
      this.api.updateIntegration(this.formIntegration.id, payload).subscribe({
        next: () => {
          this.toast.success('Integración actualizada correctamente');
          this.showFormModal.set(false);
          this.loadIntegrations();
        },
        error: err => this.toast.error(err.error?.error || 'Error al actualizar integración')
      });
    } else {
      if (!this.formIntegration.customer_id) {
        this.toast.error('Debe seleccionar un cliente para la integración');
        return;
      }
      this.api.createIntegration(payload).subscribe({
        next: () => {
          this.toast.success('Integración registrada exitosamente');
          this.showFormModal.set(false);
          this.loadIntegrations();
        },
        error: err => this.toast.error(err.error?.error || 'Error al registrar integración')
      });
    }
  }

  deleteIntegration(it: Integration) {
    if (!confirm(`¿Está seguro de eliminar la integración "${it.name}"?`)) return;
    this.api.deleteIntegration(it.id).subscribe({
      next: () => {
        this.toast.info('Integración eliminada correctamente');
        this.loadIntegrations();
      },
      error: () => this.toast.error('Error al eliminar integración')
    });
  }

  togglePolling(it: Integration) {
    this.api.toggleIntegrationPolling(it.id).subscribe({
      next: res => {
        it.polling_enabled = res.polling_enabled;
        this.toast.info(`Polling ${it.polling_enabled ? 'habilitado' : 'pausado'} para ${it.name}`);
      },
      error: () => this.toast.error('Error al cambiar estado de polling')
    });
  }

  toggleEnvironment(it: Integration) {
    this.api.toggleIntegrationEnvironment(it.id).subscribe({
      next: res => {
        it.environment = res.environment;
        if (res.environment === 'PRODUCTION') {
          this.toast.success(`🟢 ${it.name} ahora está en PRODUCCIÓN: al sincronizar cambiará el estado de los pedidos en la tienda.`);
        } else {
          this.toast.info(`🧪 ${it.name} ahora está en MODO PRUEBA: no modificará el estado de los pedidos en la tienda.`);
        }
      },
      error: () => this.toast.error('Error al cambiar ambiente de ejecución')
    });
  }

  confirmToggleStatus(it: Integration) {
    const isActivating = it.status === 'DISABLED';
    const actionText = isActivating ? 'ACTIVAR' : 'DESHABILITAR';
    const msg = isActivating
      ? `¿Desea ACTIVAR la integración "${it.name}"? Se reanudará la conexión.`
      : `¿Está seguro de DESHABILITAR la integración "${it.name}"? No se procesarán pedidos ni sincronizaciones mientras esté deshabilitada.`;

    if (!confirm(msg)) return;

    this.api.toggleIntegrationStatus(it.id).subscribe({
      next: res => {
        it.status = res.status;
        if (res.status === 'DISABLED') {
          this.toast.info(`Integración "${it.name}" deshabilitada`);
        } else {
          this.toast.success(`Integración "${it.name}" activada correctamente`);
        }
      },
      error: () => this.toast.error(`Error al ${actionText.toLowerCase()} integración`)
    });
  }

  currentTestingIntegration = signal<Integration | null>(null);

  testConnection(it: Integration) {
    this.currentTestingIntegration.set(it);
    this.toast.info(`Probando conexión con ${it.name}...`);
    this.api.testConnection(it.id).subscribe({
      next: res => {
        this.testResult.set(res);
        if (res.success) {
          this.toast.success('Conexión con el proveedor validada exitosamente');
        } else {
          this.toast.error('Error en prueba de conexión: ' + res.message);
        }
        this.loadIntegrations();
      },
      error: err => this.toast.error(err.error?.error || 'Error al ejecutar prueba')
    });
  }

  formatJSON(data: any): string {
    if (!data) return '{\n  "status": "NO_DATA"\n}';
    try {
      if (typeof data === 'string') {
        const parsed = JSON.parse(data);
        return JSON.stringify(parsed, null, 2);
      }
      return JSON.stringify(data, null, 2);
    } catch {
      return String(data);
    }
  }

  copyPayloadToClipboard() {
    const res = this.testResult();
    const data = res?.sample_order || res?.raw_response || res?.details;
    if (!data) return;
    const str = typeof data === 'string' ? data : JSON.stringify(data, null, 2);
    navigator.clipboard.writeText(str).then(() => {
      this.toast.success('Payload copiado al portapapeles');
    });
  }

  openMappingFromTest() {
    const it = this.currentTestingIntegration();
    if (it) {
      this.testResult.set(null);
      this.openMapping(it);
    }
  }

  manualSync(it: Integration) {
    this.toast.info(`Ejecutando sincronización manual para ${it.name}...`);
    this.api.triggerManualSync(it.id).subscribe({
      next: () => {
        this.toast.success(`Sincronización de ${it.name} finalizada exitosamente`);
        this.loadIntegrations();
      },
      error: err => this.toast.error(err.error?.error || 'Error al sincronizar')
    });
  }
}
