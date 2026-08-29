import { Component, inject, signal, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute } from '@angular/router';
import { ApiService } from '../../core/services/api.service';
import { ToastService } from '../../core/services/toast.service';
import { SyncLog } from '../../core/models/types';

@Component({
  selector: 'app-logs',
  standalone: true,
  imports: [CommonModule, FormsModule],
  template: `
    <div class="page-body space-y-6">
      <!-- Title & Search Bar -->
      <div class="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h2 class="text-xl font-bold text-slate-100 flex items-center gap-2">
            <span>📜</span> Logs Centralizados de Operación
          </h2>
          <p class="text-xs text-slate-400 mt-0.5">Auditoría técnica de transacciones, llamadas HTTP a proveedores y eventos del sistema</p>
        </div>

        <div class="flex items-center gap-2">
          <button (click)="resetFilters()" class="btn btn-secondary btn-sm text-xs py-1.5">
            Limpiar Filtros
          </button>
          <button (click)="loadLogs()" class="btn btn-primary btn-sm flex items-center gap-1.5 text-xs py-1.5">
            <span>🔍</span> Filtrar Logs
          </button>
        </div>
      </div>

      <!-- Advanced Filter Bar -->
      <div class="card bg-slate-900 border-slate-800 p-4">
        <div class="grid grid-cols-1 md:grid-cols-3 lg:grid-cols-6 gap-3">
          <div>
            <label class="text-[11px] text-slate-400 block mb-1">Búsqueda General</label>
            <input type="text" [(ngModel)]="search" (keyup.enter)="loadLogs()" placeholder="Mensaje, operación..." class="form-control text-xs py-1 px-2.5" />
          </div>

          <div>
            <label class="text-[11px] text-slate-400 block mb-1">Nivel de Log</label>
            <select [(ngModel)]="level" (change)="loadLogs()" class="form-select text-xs py-1 px-2.5">
              <option value="">Todos los niveles</option>
              <option value="INFO">INFO</option>
              <option value="WARNING">WARNING</option>
              <option value="ERROR">ERROR</option>
              <option value="DEBUG">DEBUG</option>
            </select>
          </div>

          <div>
            <label class="text-[11px] text-slate-400 block mb-1">Proveedor</label>
            <select [(ngModel)]="provider" (change)="loadLogs()" class="form-select text-xs py-1 px-2.5">
              <option value="">Todos</option>
              <option value="WOOCOMMERCE">WooCommerce</option>
              <option value="SAP">SAP ERP</option>
              <option value="ODOO">Odoo</option>
              <option value="BSALE">BSALE</option>
            </select>
          </div>

          <div>
            <label class="text-[11px] text-slate-400 block mb-1">Correlation ID</label>
            <input type="text" [(ngModel)]="correlationId" (keyup.enter)="loadLogs()" placeholder="corr-xxxxxxxx" class="form-control text-xs py-1 px-2.5 font-mono" />
          </div>

          <div>
            <label class="text-[11px] text-slate-400 block mb-1">Request ID</label>
            <input type="text" [(ngModel)]="requestId" (keyup.enter)="loadLogs()" placeholder="req-xxxxxxxx" class="form-control text-xs py-1 px-2.5 font-mono" />
          </div>

          <div>
            <label class="text-[11px] text-slate-400 block mb-1">ID Integración</label>
            <input type="text" [(ngModel)]="integrationId" (keyup.enter)="loadLogs()" placeholder="int-xxxxxx" class="form-control text-xs py-1 px-2.5 font-mono" />
          </div>
        </div>
      </div>

      <!-- Logs Table -->
      <div class="card bg-slate-900 border-slate-800 p-0 overflow-hidden">
        <div class="table-container border-0 rounded-none bg-transparent">
          <table>
            <thead>
              <tr>
                <th>Timestamp</th>
                <th>Nivel</th>
                <th>Operación</th>
                <th>Integración & Proveedor</th>
                <th>Mensaje</th>
                <th>Duración</th>
                <th>Request / Correlation</th>
                <th class="text-right">Detalle</th>
              </tr>
            </thead>
            <tbody>
              <tr *ngFor="let l of logs()">
                <td class="text-xs text-slate-400 font-mono whitespace-nowrap">
                  {{ l.created_at | date:'dd/MM HH:mm:ss.SSS' }}
                </td>

                <td>
                  <span class="badge text-[10px]" [ngClass]="{
                    'badge-success': l.level === 'INFO',
                    'badge-danger': l.level === 'ERROR',
                    'badge-warning': l.level === 'WARNING',
                    'badge-info': l.level === 'DEBUG'
                  }">
                    {{ l.level }}
                  </span>
                </td>

                <td class="text-xs font-semibold text-slate-300 font-mono">{{ l.operation_type }}</td>

                <td>
                  <div class="text-xs text-slate-200">{{ l.integration_name || '-' }}</div>
                  <div class="text-[10px] text-slate-500 font-mono">{{ l.provider }} ({{ l.customer_name }})</div>
                </td>

                <td class="text-xs text-slate-300 max-w-md break-words" [class.text-red-400]="l.level === 'ERROR'">
                  {{ l.message }}
                </td>

                <td class="text-xs font-mono text-amber-400 whitespace-nowrap">
                  {{ l.duration_ms }} ms
                </td>

                <td class="text-[10px] font-mono text-slate-400 whitespace-nowrap">
                  <div>{{ l.request_id }}</div>
                  <div class="text-slate-500">{{ l.correlation_id }}</div>
                </td>

                <td class="text-right">
                  <button (click)="selectedLog.set(l)" class="btn btn-secondary btn-sm text-[11px] py-0.5 px-2">
                    JSON
                  </button>
                </td>
              </tr>
              <tr *ngIf="logs().length === 0">
                <td colspan="8" class="text-center py-6 text-slate-500 text-xs">
                  No se encontraron registros de log para los filtros seleccionados
                </td>
              </tr>
            </tbody>
          </table>
        </div>

        <!-- Pagination -->
        <div class="p-3 bg-slate-950/40 border-t border-slate-800 flex items-center justify-between text-xs text-slate-400">
          <div>Página {{ currentPage }} de {{ totalPages }} ({{ totalCount }} logs totales)</div>
          <div class="flex gap-2">
            <button [disabled]="currentPage <= 1" (click)="changePage(currentPage - 1)" class="btn btn-secondary btn-sm py-1 px-2.5">Anterior</button>
            <button [disabled]="currentPage >= totalPages" (click)="changePage(currentPage + 1)" class="btn btn-secondary btn-sm py-1 px-2.5">Siguiente</button>
          </div>
        </div>
      </div>
    </div>

    <!-- JSON Payload Modal -->
    <div *ngIf="selectedLog()" class="modal-overlay">
      <div class="modal-container max-w-xl">
        <div class="modal-header">
          <h3 class="text-sm font-bold text-slate-100 flex items-center gap-2">
            <span>🔍</span> Detalle Estructurado del Log
          </h3>
          <button (click)="selectedLog.set(null)" class="text-slate-400 hover:text-slate-200">✕</button>
        </div>
        <div class="modal-body">
          <pre class="p-3 rounded bg-slate-950 border border-slate-800 text-xs font-mono text-emerald-400 overflow-x-auto max-h-96">{{ selectedLog() | json }}</pre>
        </div>
        <div class="modal-footer">
          <button (click)="selectedLog.set(null)" class="btn btn-secondary btn-sm">Cerrar</button>
        </div>
      </div>
    </div>
  `
})
export class LogsComponent implements OnInit {
  private api = inject(ApiService);
  private toast = inject(ToastService);
  private route = inject(ActivatedRoute);

  logs = signal<SyncLog[]>([]);
  selectedLog = signal<SyncLog | null>(null);

  search = '';
  level = '';
  provider = '';
  correlationId = '';
  requestId = '';
  integrationId = '';

  currentPage = 1;
  totalPages = 1;
  totalCount = 0;

  ngOnInit() {
    this.route.queryParams.subscribe(params => {
      if (params['integration_id']) {
        this.integrationId = params['integration_id'];
      }
      this.loadLogs();
    });
  }

  loadLogs() {
    const filters: any = {
      page: this.currentPage,
      limit: 30,
      search: this.search,
      level: this.level,
      provider: this.provider,
      correlation_id: this.correlationId,
      request_id: this.requestId,
      integration_id: this.integrationId
    };

    this.api.getLogs(filters).subscribe({
      next: res => {
        this.logs.set(res.logs || []);
        this.totalCount = res.total_count || 0;
        this.totalPages = res.total_pages || 1;
        this.currentPage = res.page || 1;
      },
      error: () => this.toast.error('Error al cargar logs centralizados')
    });
  }

  changePage(p: number) {
    this.currentPage = p;
    this.loadLogs();
  }

  resetFilters() {
    this.search = '';
    this.level = '';
    this.provider = '';
    this.correlationId = '';
    this.requestId = '';
    this.integrationId = '';
    this.currentPage = 1;
    this.loadLogs();
  }
}
