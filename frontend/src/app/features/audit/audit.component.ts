import { Component, inject, signal, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ApiService } from '../../core/services/api.service';
import { ToastService } from '../../core/services/toast.service';
import { AuditLog } from '../../core/models/types';

@Component({
  selector: 'app-audit',
  standalone: true,
  imports: [CommonModule, FormsModule],
  template: `
    <div class="page-body space-y-6">
      <!-- Title & Filter -->
      <div class="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h2 class="text-xl font-bold text-slate-100 flex items-center gap-2">
            <span>🛡️</span> Registro de Auditoría (Audit Log)
          </h2>
          <p class="text-xs text-slate-400 mt-0.5">Trazabilidad completa de modificaciones, ejecuciones y cambios de configuración</p>
        </div>

        <div class="flex items-center gap-2">
          <input type="text" [(ngModel)]="search" (keyup.enter)="loadAudit()" placeholder="Buscar por usuario o entidad..." class="form-control text-xs py-1.5 px-3 w-64 bg-slate-900 border-slate-800" />
          <button (click)="loadAudit()" class="btn btn-primary btn-sm flex items-center gap-1.5 text-xs py-1.5">
            <span>🔍</span> Filtrar
          </button>
        </div>
      </div>

      <!-- Audit Table -->
      <div class="card bg-slate-900 border-slate-800 p-0 overflow-hidden">
        <div class="table-container border-0 rounded-none bg-transparent">
          <table>
            <thead>
              <tr>
                <th>Fecha / Hora</th>
                <th>Usuario</th>
                <th>Acción</th>
                <th>Entidad</th>
                <th>ID Objeto</th>
                <th>IP Origen</th>
                <th class="text-right">Diferencias</th>
              </tr>
            </thead>
            <tbody>
              <tr *ngFor="let a of logs()">
                <td class="text-xs text-slate-400 font-mono whitespace-nowrap">
                  {{ a.created_at | date:'dd/MM/yyyy HH:mm:ss' }}
                </td>

                <td class="text-xs font-semibold text-slate-200">
                  {{ a.user_email }}
                </td>

                <td>
                  <span class="code-badge text-xs" [ngClass]="{
                    'text-emerald-400': a.action.startsWith('CREATE'),
                    'text-amber-400': a.action.startsWith('UPDATE') || a.action.startsWith('TOGGLE'),
                    'text-red-400': a.action.startsWith('DELETE'),
                    'text-indigo-400': a.action.startsWith('TEST') || a.action.startsWith('MANUAL')
                  }">
                    {{ a.action }}
                  </span>
                </td>

                <td class="text-xs font-mono text-slate-300">{{ a.entity_type }}</td>
                <td class="text-xs font-mono text-slate-400">{{ a.entity_id }}</td>
                <td class="text-xs font-mono text-slate-500">{{ a.ip_address || '127.0.0.1' }}</td>

                <td class="text-right">
                  <button (click)="selectedAudit.set(a)" class="btn btn-secondary btn-sm text-[11px] py-0.5 px-2">
                    Ver Cambios
                  </button>
                </td>
              </tr>
              <tr *ngIf="logs().length === 0">
                <td colspan="7" class="text-center py-6 text-slate-500 text-xs">
                  No hay registros de auditoría
                </td>
              </tr>
            </tbody>
          </table>
        </div>

        <!-- Pagination -->
        <div class="p-3 bg-slate-950/40 border-t border-slate-800 flex items-center justify-between text-xs text-slate-400">
          <div>Página {{ currentPage }} de {{ totalPages }} ({{ totalCount }} eventos registrados)</div>
          <div class="flex gap-2">
            <button [disabled]="currentPage <= 1" (click)="changePage(currentPage - 1)" class="btn btn-secondary btn-sm py-1 px-2.5">Anterior</button>
            <button [disabled]="currentPage >= totalPages" (click)="changePage(currentPage + 1)" class="btn btn-secondary btn-sm py-1 px-2.5">Siguiente</button>
          </div>
        </div>
      </div>
    </div>

    <!-- Audit Diff Modal -->
    <div *ngIf="selectedAudit()" class="modal-overlay">
      <div class="modal-container max-w-xl">
        <div class="modal-header">
          <h3 class="text-sm font-bold text-slate-100 flex items-center gap-2">
            <span>🛡️</span> Detalle de la Auditoría ({{ selectedAudit()?.action }})
          </h3>
          <button (click)="selectedAudit.set(null)" class="text-slate-400 hover:text-slate-200">✕</button>
        </div>
        <div class="modal-body space-y-3">
          <div class="grid grid-cols-2 gap-2 text-xs">
            <div class="p-2 rounded bg-slate-950 border border-slate-800">
              <span class="text-slate-500 block">Usuario</span>
              <span class="text-slate-200 font-mono">{{ selectedAudit()?.user_email }}</span>
            </div>
            <div class="p-2 rounded bg-slate-950 border border-slate-800">
              <span class="text-slate-500 block">Fecha y Hora</span>
              <span class="text-slate-200 font-mono">{{ selectedAudit()?.created_at | date:'dd/MM/yyyy HH:mm:ss' }}</span>
            </div>
          </div>

          <div *ngIf="selectedAudit()?.old_values">
            <label class="text-[11px] font-bold text-slate-400 block mb-1">Estado / Valores Anteriores:</label>
            <pre class="p-2.5 rounded bg-slate-950 border border-slate-800 text-[11px] font-mono text-amber-400 overflow-x-auto">{{ selectedAudit()?.old_values | json }}</pre>
          </div>

          <div *ngIf="selectedAudit()?.new_values">
            <label class="text-[11px] font-bold text-slate-400 block mb-1">Nuevos Valores Aplicados:</label>
            <pre class="p-2.5 rounded bg-slate-950 border border-slate-800 text-[11px] font-mono text-emerald-400 overflow-x-auto">{{ selectedAudit()?.new_values | json }}</pre>
          </div>
        </div>
        <div class="modal-footer">
          <button (click)="selectedAudit.set(null)" class="btn btn-secondary btn-sm">Cerrar</button>
        </div>
      </div>
    </div>
  `
})
export class AuditComponent implements OnInit {
  private api = inject(ApiService);
  private toast = inject(ToastService);

  logs = signal<AuditLog[]>([]);
  selectedAudit = signal<AuditLog | null>(null);

  search = '';
  currentPage = 1;
  totalPages = 1;
  totalCount = 0;

  ngOnInit() {
    this.loadAudit();
  }

  loadAudit() {
    this.api.getAuditLogs({ page: this.currentPage, limit: 25, search: this.search }).subscribe({
      next: res => {
        this.logs.set(res.audit_logs || []);
        this.totalCount = res.total_count || 0;
        this.totalPages = res.total_pages || 1;
        this.currentPage = res.page || 1;
      },
      error: () => this.toast.error('Error al cargar logs de auditoría')
    });
  }

  changePage(p: number) {
    this.currentPage = p;
    this.loadAudit();
  }
}
