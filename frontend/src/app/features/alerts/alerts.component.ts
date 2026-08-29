import { Component, inject, signal, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ApiService } from '../../core/services/api.service';
import { ToastService } from '../../core/services/toast.service';
import { AuthService } from '../../core/services/auth.service';
import { AlertRule, Customer, Integration } from '../../core/models/types';

@Component({
  selector: 'app-alerts',
  standalone: true,
  imports: [CommonModule, FormsModule],
  template: `
    <div class="page-body space-y-6">
      <!-- Title Bar -->
      <div class="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h2 class="text-xl font-bold text-slate-100 flex items-center gap-2">
            <span>🔔</span> Reglas de Alertas & Notificaciones por Correo
          </h2>
          <p class="text-xs text-slate-400 mt-0.5">Definición de umbrales de falla, severidades, destinatarios y deduplicación con cooldown</p>
        </div>

        <button *ngIf="auth.isAdmin()" (click)="openCreateModal()" class="btn btn-primary btn-sm flex items-center gap-1.5">
          <span>➕</span> Nueva Regla de Alerta
        </button>
      </div>

      <!-- Alerts Table -->
      <div class="card bg-slate-900 border-slate-800 p-0 overflow-hidden">
        <div class="table-container border-0 rounded-none bg-transparent">
          <table>
            <thead>
              <tr>
                <th>Nombre de la Regla</th>
                <th>Tipo de Evento</th>
                <th>Severidad</th>
                <th>Condición / Umbral</th>
                <th>Destinatarios</th>
                <th>Cooldown</th>
                <th>Estado</th>
                <th class="text-right">Acciones</th>
              </tr>
            </thead>
            <tbody>
              <tr *ngFor="let r of alerts()">
                <td>
                  <div class="font-semibold text-slate-200 text-xs">{{ r.name }}</div>
                  <div class="text-[10px] text-slate-500 font-mono">
                    {{ r.integration_name || r.customer_name || 'Global (Todas las conexiones)' }}
                  </div>
                </td>

                <td>
                  <span class="code-badge text-xs">{{ r.event_type }}</span>
                </td>

                <td>
                  <span class="badge text-[10px]" [ngClass]="{
                    'badge-danger': r.severity === 'CRITICAL' || r.severity === 'HIGH',
                    'badge-warning': r.severity === 'MEDIUM',
                    'badge-info': r.severity === 'LOW'
                  }">
                    {{ r.severity }}
                  </span>
                </td>

                <td class="text-xs text-slate-300">
                  <div *ngIf="r.consecutive_failures > 0">≥ {{ r.consecutive_failures }} fallas consecutivas</div>
                  <div *ngIf="r.threshold_seconds > 0" class="text-amber-400 font-mono">Latencia > {{ r.threshold_seconds }}s</div>
                </td>

                <td class="text-xs text-slate-300">
                  <div class="flex flex-wrap gap-1 max-w-xs">
                    <span *ngFor="let rec of r.recipients" class="px-1.5 py-0.5 rounded bg-slate-950 border border-slate-800 text-[10px] font-mono text-indigo-400">
                      {{ rec }}
                    </span>
                  </div>
                </td>

                <td class="text-xs font-mono text-slate-400">
                  {{ r.cooldown_minutes }} min
                </td>

                <td>
                  <span class="badge" [class.badge-success]="r.enabled" [class.badge-muted]="!r.enabled">
                    {{ r.enabled ? 'Activa' : 'Pausada' }}
                  </span>
                </td>

                <td class="text-right space-x-1.5">
                  <button *ngIf="auth.isAdmin()" (click)="openEditModal(r)" class="btn btn-secondary btn-sm text-xs py-1">
                    ✏️ Editar
                  </button>
                  <button *ngIf="auth.isAdmin()" (click)="deleteAlert(r)" class="btn btn-danger btn-sm text-xs py-1">
                    🗑️
                  </button>
                </td>
              </tr>
              <tr *ngIf="alerts().length === 0">
                <td colspan="8" class="text-center py-6 text-slate-500 text-xs">
                  No hay reglas de alerta configuradas
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>
    </div>

    <!-- Create / Edit Alert Modal -->
    <div *ngIf="showFormModal()" class="modal-overlay">
      <div class="modal-container max-w-xl">
        <div class="modal-header">
          <h3 class="text-sm font-bold text-slate-100">
            {{ isEditing() ? 'Editar Regla de Alerta' : 'Nueva Regla de Alerta' }}
          </h3>
          <button (click)="showFormModal.set(false)" class="text-slate-400 hover:text-slate-200">✕</button>
        </div>
        <form (ngSubmit)="saveAlert()">
          <div class="modal-body space-y-3.5 max-h-[70vh] overflow-y-auto">
            <div class="form-group">
              <label class="form-label">Nombre de la Regla</label>
              <input type="text" [(ngModel)]="formAlert.name" name="name" required placeholder="Ej: Falla Crítica SAP" class="form-control text-xs" />
            </div>

            <div class="grid grid-cols-2 gap-3">
              <div class="form-group">
                <label class="form-label">Tipo de Evento Disparador</label>
                <select [(ngModel)]="formAlert.event_type" name="event_type" required class="form-select text-xs">
                  <option value="INTEGRATION_FAILED">Falla al sincronizar integración</option>
                  <option value="CONSECUTIVE_ERRORS">N Errores consecutivos</option>
                  <option value="LATENCY_THRESHOLD">Umbral de latencia superado</option>
                  <option value="NO_SYNC">Integración sin sincronizar por X tiempo</option>
                  <option value="PROVIDER_DOWN">Proveedor externo caído</option>
                  <option value="DAILY_DIGEST">Resumen diario consolidado</option>
                </select>
              </div>

              <div class="form-group">
                <label class="form-label">Severidad</label>
                <select [(ngModel)]="formAlert.severity" name="severity" required class="form-select text-xs">
                  <option value="CRITICAL">CRITICAL (Crítica)</option>
                  <option value="HIGH">HIGH (Alta)</option>
                  <option value="MEDIUM">MEDIUM (Media)</option>
                  <option value="LOW">LOW (Informativa)</option>
                </select>
              </div>
            </div>

            <div class="grid grid-cols-2 gap-3">
              <div class="form-group">
                <label class="form-label">Fallas Consecutivas Requeridas</label>
                <input type="number" [(ngModel)]="formAlert.consecutive_failures" name="consec" min="1" max="100" class="form-control text-xs font-mono" />
              </div>
              <div class="form-group">
                <label class="form-label">Cooldown Antispam (Minutos)</label>
                <input type="number" [(ngModel)]="formAlert.cooldown_minutes" name="cooldown" min="5" max="10080" class="form-control text-xs font-mono" />
              </div>
            </div>

            <div class="form-group">
              <label class="form-label">Destinatarios de Correo (Separados por coma)</label>
              <input type="text" [(ngModel)]="recipientsInput" name="recipients" required placeholder="noc@empresa.cl, guardia@empresa.cl" class="form-control text-xs font-mono" />
            </div>

            <div class="flex items-center gap-2 pt-1">
              <input type="checkbox" [(ngModel)]="formAlert.enabled" name="enabled" id="alertEnabled" class="rounded border-slate-700 bg-slate-900 text-indigo-600 focus:ring-indigo-500" />
              <label for="alertEnabled" class="text-xs text-slate-300">Regla activa y evaluada en tiempo real</label>
            </div>
          </div>
          <div class="modal-footer">
            <button type="button" (click)="showFormModal.set(false)" class="btn btn-secondary btn-sm">Cancelar</button>
            <button type="submit" class="btn btn-primary btn-sm">Guardar Regla</button>
          </div>
        </form>
      </div>
    </div>
  `
})
export class AlertsComponent implements OnInit {
  private api = inject(ApiService);
  private toast = inject(ToastService);
  auth = inject(AuthService);

  alerts = signal<AlertRule[]>([]);
  showFormModal = signal(false);
  isEditing = signal(false);

  formAlert: Partial<AlertRule> = {};
  recipientsInput = '';

  ngOnInit() {
    this.loadAlerts();
  }

  loadAlerts() {
    this.api.getAlerts().subscribe({
      next: res => this.alerts.set(res || []),
      error: () => this.toast.error('Error al cargar reglas de alerta')
    });
  }

  openCreateModal() {
    this.isEditing.set(false);
    this.formAlert = {
      event_type: 'INTEGRATION_FAILED',
      severity: 'HIGH',
      consecutive_failures: 3,
      threshold_seconds: 300,
      cooldown_minutes: 60,
      enabled: true
    };
    this.recipientsInput = 'noc@orderhub.local';
    this.showFormModal.set(true);
  }

  openEditModal(r: AlertRule) {
    this.isEditing.set(true);
    this.formAlert = { ...r };
    this.recipientsInput = (r.recipients || []).join(', ');
    this.showFormModal.set(true);
  }

  saveAlert() {
    if (!this.formAlert.name || !this.recipientsInput) {
      this.toast.error('Por favor complete los campos obligatorios');
      return;
    }

    const recipients = this.recipientsInput.split(',').map(s => s.trim()).filter(s => s.length > 0);
    const payload = {
      ...this.formAlert,
      recipients
    };

    if (this.isEditing() && this.formAlert.id) {
      this.api.updateAlert(this.formAlert.id, payload).subscribe({
        next: () => {
          this.toast.success('Regla de alerta actualizada correctamente');
          this.showFormModal.set(false);
          this.loadAlerts();
        },
        error: err => this.toast.error(err.error?.error || 'Error al actualizar alerta')
      });
    } else {
      this.api.createAlert(payload).subscribe({
        next: () => {
          this.toast.success('Regla de alerta creada exitosamente');
          this.showFormModal.set(false);
          this.loadAlerts();
        },
        error: err => this.toast.error(err.error?.error || 'Error al crear alerta')
      });
    }
  }

  deleteAlert(r: AlertRule) {
    if (!confirm(`¿Eliminar la regla "${r.name}"?`)) return;
    this.api.deleteAlert(r.id).subscribe({
      next: () => {
        this.toast.info('Regla eliminada');
        this.loadAlerts();
      },
      error: () => this.toast.error('Error al eliminar regla')
    });
  }
}
