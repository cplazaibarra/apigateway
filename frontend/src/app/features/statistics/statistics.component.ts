import { Component, inject, signal, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ApiService } from '../../core/services/api.service';
import { ToastService } from '../../core/services/toast.service';
import { DetailedStatistics } from '../../core/models/types';

@Component({
  selector: 'app-statistics',
  standalone: true,
  imports: [CommonModule],
  template: `
    <div class="page-body space-y-6">
      <!-- Title -->
      <div class="flex items-center justify-between">
        <div>
          <h2 class="text-xl font-bold text-slate-100 flex items-center gap-2">
            <span>📈</span> Métricas & Estadísticas de Rendimiento
          </h2>
          <p class="text-xs text-slate-400 mt-0.5">Indicadores p95, tasas de éxito, retries y análisis comparativo por proveedor y cliente</p>
        </div>
        <button (click)="loadStats()" class="btn btn-secondary btn-sm flex items-center gap-1.5">
          <span>🔄</span> Recalcular
        </button>
      </div>

      <!-- KPI Grid -->
      <div class="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-3.5">
        <div class="card bg-slate-900 border-slate-800 p-4">
          <span class="text-[11px] text-slate-400 block">Total Consultas</span>
          <div class="text-2xl font-bold text-indigo-400">{{ stats()?.total_queries | number }}</div>
          <span class="text-[10px] text-slate-500">{{ stats()?.success_queries | number }} exitosas</span>
        </div>

        <div class="card bg-slate-900 border-slate-800 p-4">
          <span class="text-[11px] text-slate-400 block">Tasa de Éxito Global</span>
          <div class="text-2xl font-bold text-emerald-400">{{ stats()?.success_rate }} %</div>
          <span class="text-[10px] text-slate-500">{{ stats()?.failed_queries | number }} fallos totales</span>
        </div>

        <div class="card bg-slate-900 border-slate-800 p-4">
          <span class="text-[11px] text-slate-400 block">Latencia Media</span>
          <div class="text-2xl font-bold text-amber-400">{{ stats()?.avg_duration_ms }} ms</div>
          <span class="text-[10px] text-slate-500">Min: {{ stats()?.min_duration_ms }}ms | Max: {{ stats()?.max_duration_ms }}ms</span>
        </div>

        <div class="card bg-slate-900 border-slate-800 p-4">
          <span class="text-[11px] text-slate-400 block">Percentil P95</span>
          <div class="text-2xl font-bold text-cyan-400">{{ stats()?.p95_duration_ms }} ms</div>
          <span class="text-[10px] text-slate-500">95% de llamadas bajo este umbral</span>
        </div>

        <div class="card bg-slate-900 border-slate-800 p-4">
          <span class="text-[11px] text-slate-400 block">Pedidos Recuperados</span>
          <div class="text-2xl font-bold text-purple-400">{{ stats()?.recovered_orders | number }}</div>
          <span class="text-[10px] text-slate-500">Persistidos en base de datos</span>
        </div>

        <div class="card bg-slate-900 border-slate-800 p-4">
          <span class="text-[11px] text-slate-400 block">Reintentos / Timeouts</span>
          <div class="text-2xl font-bold text-rose-400">{{ stats()?.total_retries }} / {{ stats()?.total_timeouts }}</div>
          <span class="text-[10px] text-slate-500">Manejo de resiliencia</span>
        </div>
      </div>

      <!-- Performance Grouped by Provider -->
      <div class="card bg-slate-900 border-slate-800 p-0 overflow-hidden">
        <div class="p-4 border-b border-slate-800 flex items-center justify-between">
          <h3 class="text-xs font-bold uppercase tracking-wider text-slate-200">Desempeño por Proveedor de E-commerce / ERP</h3>
        </div>
        <div class="table-container border-0 rounded-none bg-transparent">
          <table>
            <thead>
              <tr>
                <th>Proveedor</th>
                <th>Consultas Totales</th>
                <th>Consultas Exitosas</th>
                <th>Consultas con Error</th>
                <th>Tasa de Éxito</th>
                <th>Latencia Media</th>
                <th>Pedidos Recuperados</th>
              </tr>
            </thead>
            <tbody>
              <tr *ngFor="let g of stats()?.grouped_by_provider">
                <td class="font-bold text-xs">
                  <span class="code-badge">{{ g.name }}</span>
                </td>
                <td class="font-mono text-slate-200">{{ g.total_queries | number }}</td>
                <td class="font-mono text-emerald-400">{{ g.success_count | number }}</td>
                <td class="font-mono text-red-400">{{ g.error_count | number }}</td>
                <td>
                  <div class="flex items-center gap-2">
                    <span class="font-mono font-bold text-xs" [class.text-emerald-400]="g.success_rate >= 95" [class.text-amber-400]="g.success_rate < 95 && g.success_rate >= 80" [class.text-red-400]="g.success_rate < 80">
                      {{ g.success_rate }} %
                    </span>
                  </div>
                </td>
                <td class="font-mono text-amber-400 font-semibold">{{ g.avg_latency_ms }} ms</td>
                <td class="font-mono text-purple-400 font-bold">{{ g.orders_count | number }}</td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>

      <!-- Performance Grouped by Customer -->
      <div class="card bg-slate-900 border-slate-800 p-0 overflow-hidden">
        <div class="p-4 border-b border-slate-800 flex items-center justify-between">
          <h3 class="text-xs font-bold uppercase tracking-wider text-slate-200">Distribución de Actividad por Cliente</h3>
        </div>
        <div class="table-container border-0 rounded-none bg-transparent">
          <table>
            <thead>
              <tr>
                <th>Cliente</th>
                <th>Consultas Totales</th>
                <th>Exitosas</th>
                <th>Errores</th>
                <th>Tasa de Éxito</th>
                <th>Latencia Media</th>
                <th>Pedidos Procesados</th>
              </tr>
            </thead>
            <tbody>
              <tr *ngFor="let c of stats()?.grouped_by_customer">
                <td class="font-semibold text-slate-200 text-xs">{{ c.name }}</td>
                <td class="font-mono text-slate-300">{{ c.total_queries | number }}</td>
                <td class="font-mono text-emerald-400">{{ c.success_count | number }}</td>
                <td class="font-mono text-red-400">{{ c.error_count | number }}</td>
                <td class="font-mono text-xs font-bold text-slate-200">{{ c.success_rate }} %</td>
                <td class="font-mono text-amber-400">{{ c.avg_latency_ms }} ms</td>
                <td class="font-mono text-purple-400 font-bold">{{ c.orders_count | number }}</td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>
    </div>
  `
})
export class StatisticsComponent implements OnInit {
  private api = inject(ApiService);
  private toast = inject(ToastService);

  stats = signal<DetailedStatistics | null>(null);

  ngOnInit() {
    this.loadStats();
  }

  loadStats() {
    this.api.getStatistics().subscribe({
      next: res => this.stats.set(res),
      error: () => this.toast.error('Error al calcular estadísticas')
    });
  }
}
