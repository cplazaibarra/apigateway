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
          <h2 class="text-xl font-bold text-slate-100 flex items-center gap-2">
            <span>🔌</span> Conexiones & Integraciones
          </h2>
          <p class="text-xs text-slate-400 mt-0.5">Adaptadores para WooCommerce, SAP, Odoo y BSALE con pruebas y polling automático</p>
        </div>

        <div class="flex items-center flex-wrap gap-2.5">
          <input type="text" [(ngModel)]="searchQuery" (input)="loadIntegrations()" placeholder="Buscar integración..." 
                 class="form-control text-xs py-1.5 px-3 w-48 bg-slate-900 border-slate-800" />

          <select [(ngModel)]="selectedProvider" (change)="loadIntegrations()" class="form-select text-xs py-1.5 px-3 w-auto bg-slate-900 border-slate-800">
            <option value="">Todos los Proveedores</option>
            <option value="WOOCOMMERCE">WooCommerce</option>
            <option value="SAP">SAP</option>
            <option value="ODOO">Odoo</option>
            <option value="BSALE">BSALE</option>
          </select>

          <select [(ngModel)]="selectedStatus" (change)="loadIntegrations()" class="form-select text-xs py-1.5 px-3 w-auto bg-slate-900 border-slate-800">
            <option value="">Todos los Estados</option>
            <option value="ACTIVE">Activas</option>
            <option value="ERROR">Con Error</option>
            <option value="DISABLED">Deshabilitadas</option>
          </select>

          <button *ngIf="auth.isAdmin()" (click)="openCreateModal()" class="btn btn-primary btn-sm flex items-center gap-1.5">
            <span>➕</span> Nueva Integración
          </button>
        </div>
      </div>

      <!-- Integrations Table -->
      <div class="card bg-slate-900 border-slate-800 p-0 overflow-hidden">
        <div class="table-container border-0 rounded-none bg-transparent">
          <table>
            <thead>
              <tr>
                <th>Integración & Cliente</th>
                <th>Proveedor</th>
                <th>Endpoint Base & Auth</th>
                <th>Ambiente</th>
                <th>Estado & Polling</th>
                <th>Última Sincronización</th>
                <th>Pedidos</th>
                <th>Latencia</th>
                <th class="text-right">Acciones</th>
              </tr>
            </thead>
            <tbody>
              <tr *ngFor="let it of integrations()">
                <td>
                  <div class="font-semibold text-slate-200 text-sm">{{ it.name }}</div>
                  <div class="text-xs text-indigo-400 font-mono">{{ it.customer_name }}</div>
                  <div *ngIf="it.last_error" class="text-[11px] text-red-400 font-mono mt-0.5 truncate max-w-xs" [title]="it.last_error">
                    ⚠️ {{ it.last_error }}
                  </div>
                </td>

                <td>
                  <span class="code-badge font-bold text-xs" [ngClass]="{
                    'text-purple-400': it.provider === 'WOOCOMMERCE',
                    'text-blue-400': it.provider === 'SAP',
                    'text-amber-400': it.provider === 'ODOO',
                    'text-emerald-400': it.provider === 'BSALE'
                  }">
                    {{ it.provider }}
                  </span>
                </td>

                <td class="text-xs">
                  <div class="text-slate-300 font-mono truncate max-w-xs" [title]="it.base_url">{{ it.base_url }}</div>
                  <div class="text-slate-500 text-[10px] mt-0.5">{{ it.auth_type }} | {{ it.masked_credentials }}</div>
                </td>

                <!-- Ambiente (PRODUCCIÓN vs PRUEBA) -->
                <td>
                  <button *ngIf="auth.isOperator()"
                          (click)="toggleEnvironment(it)"
                          class="btn btn-sm text-xs py-1 px-2.5 font-bold rounded-lg border transition flex items-center gap-1.5 shadow-sm"
                          [ngClass]="it.environment === 'PRODUCTION' ? 'bg-emerald-950/80 border-emerald-500 text-emerald-300 hover:bg-emerald-900' : 'bg-amber-950/80 border-amber-500 text-amber-300 hover:bg-amber-900'"
                          [title]="it.environment === 'PRODUCTION' ? 'En PRODUCCIÓN: al sincronizar cambiará el estado de los pedidos en la tienda origen. Clic para cambiar a MODO PRUEBA.' : 'En MODO PRUEBA: solo consulta la API y no modifica el estado en la tienda origen. Clic para activar PRODUCCIÓN.'">
                    <span>{{ it.environment === 'PRODUCTION' ? '🟢 PRODUCCIÓN' : '🧪 MODO PRUEBA' }}</span>
                  </button>
                  <span *ngIf="!auth.isOperator()" class="badge" [ngClass]="it.environment === 'PRODUCTION' ? 'badge-success' : 'badge-warning'">
                    {{ it.environment === 'PRODUCTION' ? 'PRODUCCIÓN' : 'PRUEBA' }}
                  </span>
                  <div class="text-[10px] text-slate-500 mt-1">
                    {{ it.environment === 'PRODUCTION' ? 'Actualiza estado en tienda' : 'Solo lectura en tienda' }}
                  </div>
                </td>

                <td>
                  <div class="flex items-center gap-2">
                    <span class="badge" [class.badge-success]="it.status === 'ACTIVE'" [class.badge-danger]="it.status === 'ERROR'" [class.badge-muted]="it.status === 'DISABLED'">
                      <span class="status-dot" [class.active]="it.status === 'ACTIVE'" [class.error]="it.status === 'ERROR'" [class.disabled]="it.status === 'DISABLED'"></span>
                      {{ it.status }}
                    </span>
                  </div>
                  <div class="text-[11px] text-slate-400 mt-1 flex items-center gap-1.5">
                    <span>⏱️ {{ it.polling_interval_minutes }}m</span>
                    <button *ngIf="auth.isOperator()" (click)="togglePolling(it)" class="text-[10px] text-indigo-400 hover:underline">
                      ({{ it.polling_enabled ? 'Activado' : 'Pausado' }})
                    </button>
                  </div>
                </td>

                <td class="text-xs text-slate-400">
                  <div>{{ it.last_sync_at ? (it.last_sync_at | date:'dd/MM HH:mm') : 'Pendiente' }}</div>
                  <div class="text-[10px] text-slate-500">Próx: {{ it.next_polling_at ? (it.next_polling_at | date:'HH:mm') : '-' }}</div>
                </td>

                <td class="font-mono font-bold text-xs text-purple-400">
                  {{ it.total_orders_synced | number }}
                </td>

                <td class="font-mono font-semibold text-xs text-amber-400">
                  {{ it.avg_response_time_ms }} ms
                </td>

                <td class="text-right space-x-1.5 whitespace-nowrap">
                  <a [routerLink]="['/integrations', it.id, 'mapping']" class="btn btn-secondary btn-sm text-xs py-1 text-indigo-300 hover:text-indigo-200 border-indigo-500/30 inline-flex items-center gap-1" title="Configurar Mapeo Dinámico de Campos">
                    <span>🗺️</span> Mapeo
                  </a>
                  <button *ngIf="auth.isOperator()" (click)="testConnection(it)" class="btn btn-secondary btn-sm text-xs py-1" title="Probar conexión en vivo">
                    🔍 Probar
                  </button>
                  <button *ngIf="auth.isOperator()" (click)="manualSync(it)" class="btn btn-primary btn-sm text-xs py-1" title="Ejecutar sincronización ahora">
                    ⚡ Sync
                  </button>
                  <a [routerLink]="['/logs']" [queryParams]="{integration_id: it.id}" class="btn btn-secondary btn-sm text-xs py-1" title="Ver logs">
                    📜 Logs
                  </a>
                  <button *ngIf="auth.isAdmin()" (click)="openEditModal(it)" class="btn btn-secondary btn-sm text-xs py-1" title="Editar configuración">
                    ✏️
                  </button>
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
      <div class="modal-container max-w-xl">
        <div class="modal-header">
          <h3 class="text-sm font-bold text-slate-100">
            {{ isEditing() ? 'Editar Integración' : 'Registrar Nueva Integración' }}
          </h3>
          <button (click)="showFormModal.set(false)" class="text-slate-400 hover:text-slate-200">✕</button>
        </div>
        <form (ngSubmit)="saveIntegration()">
          <div class="modal-body space-y-3.5 max-h-[70vh] overflow-y-auto">
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

            <div class="grid grid-cols-2 gap-3">
              <div class="form-group">
                <label class="form-label">Intervalo de Polling (Minutos)</label>
                <input type="number" [(ngModel)]="formIntegration.polling_interval_minutes" name="polling_interval" min="1" max="1440" class="form-control text-xs font-mono" />
              </div>
              <div class="form-group">
                <label class="form-label">Ambiente de Ejecución</label>
                <select [(ngModel)]="formIntegration.environment" name="environment" class="form-select text-xs">
                  <option value="TEST">🧪 MODO PRUEBA (Solo lectura en tienda)</option>
                  <option value="PRODUCTION">🟢 PRODUCCIÓN (Actualiza estado de pedidos en tienda)</option>
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

          <div class="modal-footer">
            <button type="button" (click)="showFormModal.set(false)" class="btn btn-secondary btn-sm">Cancelar</button>
            <button type="submit" class="btn btn-primary btn-sm">Guardar Integración</button>
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
  selectedStatus = '';
  searchQuery = '';

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
    if (this.selectedStatus) filters.status = this.selectedStatus;
    if (this.searchQuery) filters.search = this.searchQuery;

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
