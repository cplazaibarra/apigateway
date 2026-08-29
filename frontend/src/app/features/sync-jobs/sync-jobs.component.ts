import { Component, inject, signal, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ApiService } from '../../core/services/api.service';
import { ToastService } from '../../core/services/toast.service';
import { SyncJob, SyncLog } from '../../core/models/types';

@Component({
  selector: 'app-sync-jobs',
  standalone: true,
  imports: [CommonModule, FormsModule],
  template: `
    <div class="page-body space-y-6">
      <!-- Title & Filters -->
      <div class="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h2 class="text-xl font-bold text-slate-100 flex items-center gap-2">
            <span>🔄</span> Historial de Sincronizaciones (Sync Jobs)
          </h2>
          <p class="text-xs text-slate-400 mt-0.5">Registro de ejecuciones programadas y manuales con detalle de pedidos procesados</p>
        </div>

        <div class="flex items-center flex-wrap gap-2.5">
          <select [(ngModel)]="selectedStatus" (change)="loadJobs()" class="form-select text-xs py-1.5 px-3 w-auto bg-slate-900 border-slate-800">
            <option value="">Todos los Estados</option>
            <option value="SUCCESS">SUCCESS</option>
            <option value="FAILED">FAILED</option>
            <option value="RUNNING">RUNNING</option>
            <option value="PARTIAL">PARTIAL</option>
          </select>

          <button (click)="loadJobs()" class="btn btn-secondary btn-sm flex items-center gap-1.5">
            <span>🔄</span> Refrescar
          </button>
        </div>
      </div>

      <!-- Sync Jobs Table -->
      <div class="card bg-slate-900 border-slate-800 p-0 overflow-hidden">
        <div class="table-container border-0 rounded-none bg-transparent">
          <table>
            <thead>
              <tr>
                <th>Job ID</th>
                <th>Integración & Cliente</th>
                <th>Proveedor</th>
                <th>Inicio / Fin</th>
                <th>Duración</th>
                <th>Estado</th>
                <th>Pedidos (Tot / Nv / Act)</th>
                <th class="text-right">Detalle</th>
              </tr>
            </thead>
            <tbody>
              <tr *ngFor="let j of jobs()">
                <td class="font-mono text-xs text-indigo-400 font-semibold">{{ j.id }}</td>
                <td>
                  <div class="font-medium text-slate-200 text-xs">{{ j.integration_name }}</div>
                  <div class="text-[11px] text-slate-500">{{ j.customer_name }}</div>
                </td>
                <td>
                  <span class="code-badge font-bold text-xs">{{ j.provider }}</span>
                </td>
                <td class="text-xs text-slate-400">
                  <div>{{ j.started_at | date:'dd/MM/yyyy HH:mm:ss' }}</div>
                  <div class="text-[10px] text-slate-500" *ngIf="j.finished_at">Fin: {{ j.finished_at | date:'HH:mm:ss' }}</div>
                </td>
                <td class="font-mono text-xs text-amber-400 font-semibold">
                  {{ j.duration_ms }} ms
                </td>
                <td>
                  <span class="badge" [ngClass]="{
                    'badge-success': j.status === 'SUCCESS',
                    'badge-danger': j.status === 'FAILED',
                    'badge-warning': j.status === 'PARTIAL' || j.status === 'RUNNING',
                    'badge-muted': j.status === 'PENDING' || j.status === 'CANCELLED'
                  }">
                    {{ j.status }}
                  </span>
                </td>
                <td class="text-xs font-mono">
                  <span class="text-slate-200 font-bold">{{ j.orders_found }}</span>
                  <span class="text-emerald-400"> / +{{ j.orders_new }}</span>
                  <span class="text-blue-400"> / ~{{ j.orders_updated }}</span>
                  <span *ngIf="j.orders_failed > 0" class="text-red-400"> / !{{ j.orders_failed }}</span>
                </td>
                <td class="text-right">
                  <button (click)="openDetail(j.id)" class="btn btn-secondary btn-sm text-xs py-1">
                    👁️ Ver
                  </button>
                </td>
              </tr>
              <tr *ngIf="jobs().length === 0">
                <td colspan="8" class="text-center py-6 text-slate-500 text-xs">
                  No hay ejecuciones registradas para los filtros aplicados
                </td>
              </tr>
            </tbody>
          </table>
        </div>

        <!-- Pagination -->
        <div class="p-3 bg-slate-950/40 border-t border-slate-800 flex items-center justify-between text-xs text-slate-400">
          <div>Página {{ currentPage }} de {{ totalPages }} ({{ totalCount }} registros)</div>
          <div class="flex gap-2">
            <button [disabled]="currentPage <= 1" (click)="changePage(currentPage - 1)" class="btn btn-secondary btn-sm py-1 px-2.5">Anterior</button>
            <button [disabled]="currentPage >= totalPages" (click)="changePage(currentPage + 1)" class="btn btn-secondary btn-sm py-1 px-2.5">Siguiente</button>
          </div>
        </div>
      </div>
    </div>

    <!-- Job Detail Modal -->
    <div *ngIf="selectedJobDetail()" class="modal-overlay">
      <div class="modal-container max-w-3xl">
        <div class="modal-header">
          <div>
            <h3 class="text-sm font-bold text-slate-100 flex items-center gap-2">
              <span>🔄</span> Detalle de Ejecución {{ selectedJobDetail()?.job?.id }}
            </h3>
            <span class="text-xs font-mono text-indigo-400">{{ selectedJobDetail()?.job?.integration_name }} ({{ selectedJobDetail()?.job?.provider }})</span>
          </div>
          <button (click)="selectedJobDetail.set(null)" class="text-slate-400 hover:text-slate-200">✕</button>
        </div>

        <div class="modal-body space-y-4 max-h-[70vh] overflow-y-auto">
          <!-- KPI Summary -->
          <div class="grid grid-cols-4 gap-2.5 text-center">
            <div class="p-2.5 rounded bg-slate-950 border border-slate-800">
              <span class="text-[10px] text-slate-500 block">Estado</span>
              <span class="text-xs font-bold font-mono text-slate-200">{{ selectedJobDetail()?.job?.status }}</span>
            </div>
            <div class="p-2.5 rounded bg-slate-950 border border-slate-800">
              <span class="text-[10px] text-slate-500 block">Duración</span>
              <span class="text-xs font-bold font-mono text-amber-400">{{ selectedJobDetail()?.job?.duration_ms }} ms</span>
            </div>
            <div class="p-2.5 rounded bg-slate-950 border border-slate-800">
              <span class="text-[10px] text-slate-500 block">Pedidos Encontrados</span>
              <span class="text-xs font-bold font-mono text-purple-400">{{ selectedJobDetail()?.job?.orders_found }}</span>
            </div>
            <div class="p-2.5 rounded bg-slate-950 border border-slate-800">
              <span class="text-[10px] text-slate-500 block">Pedidos Nuevos</span>
              <span class="text-xs font-bold font-mono text-emerald-400">+{{ selectedJobDetail()?.job?.orders_new }}</span>
            </div>
          </div>

          <div *ngIf="selectedJobDetail()?.job?.error_message" class="p-3 rounded bg-red-950/30 border border-red-800/40 text-xs text-red-400 font-mono">
            <strong>Error:</strong> {{ selectedJobDetail()?.job?.error_message }}
          </div>

          <!-- Associated Execution Logs -->
          <div>
            <h4 class="text-xs font-bold uppercase tracking-wider text-slate-400 mb-2">Logs de la Ejecución</h4>
            <div class="space-y-1.5">
              <div *ngFor="let l of selectedJobDetail()?.logs" class="p-2.5 rounded bg-slate-950 border border-slate-800 text-xs font-mono">
                <div class="flex items-center justify-between text-[11px] mb-1">
                  <span class="badge text-[10px]" [class.badge-success]="l.level === 'INFO'" [class.badge-danger]="l.level === 'ERROR'">{{ l.level }}</span>
                  <span class="text-slate-500">{{ l.created_at | date:'HH:mm:ss.SSS' }}</span>
                </div>
                <div class="text-slate-300 text-xs">{{ l.message }}</div>
                <div class="text-[10px] text-slate-500 mt-1">ReqID: {{ l.request_id }} | CorrID: {{ l.correlation_id }} | {{ l.duration_ms }}ms</div>
              </div>
            </div>
          </div>
        </div>

        <div class="modal-footer">
          <button (click)="selectedJobDetail.set(null)" class="btn btn-secondary btn-sm">Cerrar</button>
        </div>
      </div>
    </div>
  `
})
export class SyncJobsComponent implements OnInit {
  private api = inject(ApiService);
  private toast = inject(ToastService);

  jobs = signal<SyncJob[]>([]);
  selectedJobDetail = signal<{ job: SyncJob; logs: SyncLog[] } | null>(null);

  selectedStatus = '';
  currentPage = 1;
  totalPages = 1;
  totalCount = 0;

  ngOnInit() {
    this.loadJobs();
  }

  loadJobs() {
    const filters: any = {
      page: this.currentPage,
      limit: 20
    };
    if (this.selectedStatus) filters.status = this.selectedStatus;

    this.api.getSyncJobs(filters).subscribe({
      next: res => {
        this.jobs.set(res.jobs || []);
        this.totalCount = res.total_count || 0;
        this.totalPages = res.total_pages || 1;
        this.currentPage = res.page || 1;
      },
      error: () => this.toast.error('Error al cargar historial de ejecuciones')
    });
  }

  changePage(page: number) {
    this.currentPage = page;
    this.loadJobs();
  }

  openDetail(id: string) {
    this.api.getSyncJob(id).subscribe({
      next: res => this.selectedJobDetail.set(res),
      error: () => this.toast.error('Error al cargar detalle de la ejecución')
    });
  }
}
