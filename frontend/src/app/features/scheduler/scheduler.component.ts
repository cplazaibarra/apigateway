import { Component, inject, signal, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ApiService } from '../../core/services/api.service';
import { ToastService } from '../../core/services/toast.service';
import { AuthService } from '../../core/services/auth.service';
import { SchedulerTask } from '../../core/models/types';

@Component({
  selector: 'app-scheduler',
  standalone: true,
  imports: [CommonModule, FormsModule],
  template: `
    <div class="page-body space-y-6">
      <!-- Title Bar -->
      <div class="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h2 class="text-xl font-bold text-slate-100 flex items-center gap-2">
            <span>⏱️</span> Programador de Tareas (Scheduler)
          </h2>
          <p class="text-xs text-slate-400 mt-0.5">Control de polling periódico, intervalos de ejecución y locking contra ejecuciones concurrentes</p>
        </div>

        <button (click)="loadTasks()" class="btn btn-secondary btn-sm flex items-center gap-1.5">
          <span>🔄</span> Actualizar
        </button>
      </div>

      <!-- Scheduler Tasks Table -->
      <div class="card bg-slate-900 border-slate-800 p-0 overflow-hidden">
        <div class="table-container border-0 rounded-none bg-transparent">
          <table>
            <thead>
              <tr>
                <th>Integración & Cliente</th>
                <th>Proveedor</th>
                <th>Intervalo</th>
                <th>Próxima Ejecución</th>
                <th>Última Ejecución</th>
                <th>Estado & Lock</th>
                <th>Latencia Media</th>
                <th class="text-right">Acciones</th>
              </tr>
            </thead>
            <tbody>
              <tr *ngFor="let t of tasks()">
                <td>
                  <div class="font-semibold text-slate-200 text-xs">{{ t.integration_name }}</div>
                  <div class="text-[11px] text-slate-500">{{ t.customer_name }}</div>
                </td>

                <td>
                  <span class="code-badge text-xs">{{ t.provider }}</span>
                </td>

                <td class="text-xs font-mono">
                  <span class="text-indigo-400 font-bold">Cada {{ t.interval_minutes }} min</span>
                </td>

                <td class="text-xs text-slate-300 font-mono">
                  {{ t.next_run_at ? (t.next_run_at | date:'HH:mm:ss') : 'En pausa' }}
                </td>

                <td class="text-xs text-slate-400 font-mono">
                  {{ t.last_run_at ? (t.last_run_at | date:'dd/MM HH:mm:ss') : 'Pendiente' }}
                </td>

                <td>
                  <div class="flex items-center gap-2">
                    <span class="badge" [class.badge-success]="t.status === 'ACTIVE'" [class.badge-danger]="t.status === 'ERROR'" [class.badge-muted]="t.status === 'DISABLED'">
                      {{ t.status }}
                    </span>
                    <span *ngIf="t.is_locked" class="badge badge-warning text-[10px]" title="Lock activo: tarea en ejecución">
                      🔒 En Ejecución
                    </span>
                  </div>
                </td>

                <td class="text-xs font-mono text-amber-400">
                  {{ t.avg_duration_ms }} ms
                </td>

                <td class="text-right space-x-1.5 whitespace-nowrap">
                  <button *ngIf="auth.isOperator()" (click)="togglePolling(t)" class="btn btn-sm text-xs py-1"
                          [class.btn-secondary]="t.polling_enabled" [class.btn-success]="!t.polling_enabled">
                    {{ t.polling_enabled ? '⏸️ Pausar' : '▶️ Activar' }}
                  </button>
                  <button *ngIf="auth.isOperator()" (click)="runNow(t)" [disabled]="t.is_locked" class="btn btn-primary btn-sm text-xs py-1">
                    ⚡ Ejecutar Ahora
                  </button>
                </td>
              </tr>
              <tr *ngIf="tasks().length === 0">
                <td colspan="8" class="text-center py-6 text-slate-500 text-xs">
                  No hay tareas programadas configuradas
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>
    </div>
  `
})
export class SchedulerComponent implements OnInit {
  private api = inject(ApiService);
  private toast = inject(ToastService);
  auth = inject(AuthService);

  tasks = signal<SchedulerTask[]>([]);

  ngOnInit() {
    this.loadTasks();
  }

  loadTasks() {
    this.api.getSchedulerTasks().subscribe({
      next: res => this.tasks.set(res || []),
      error: () => this.toast.error('Error al cargar tareas programadas')
    });
  }

  togglePolling(t: SchedulerTask) {
    this.api.toggleIntegrationPolling(t.integration_id).subscribe({
      next: res => {
        t.polling_enabled = res.polling_enabled;
        this.toast.info(`Polling ${t.polling_enabled ? 'activado' : 'pausado'} para ${t.integration_name}`);
      },
      error: () => this.toast.error('Error al actualizar estado del scheduler')
    });
  }

  runNow(t: SchedulerTask) {
    this.toast.info(`Lanzando sincronización inmediata para ${t.integration_name}...`);
    this.api.triggerManualSync(t.integration_id).subscribe({
      next: () => {
        this.toast.success(`Ejecución de ${t.integration_name} iniciada correctamente`);
        this.loadTasks();
      },
      error: err => this.toast.error(err.error?.error || 'Error al ejecutar tarea')
    });
  }
}
