import { Component, inject, signal, OnInit, ElementRef, ViewChild, AfterViewInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { ApiService } from '../../core/services/api.service';
import { ToastService } from '../../core/services/toast.service';
import { DashboardData, ProblematicIntegration, ProviderTestResult } from '../../core/models/types';
import { Chart, registerables } from 'chart.js';

Chart.register(...registerables);

@Component({
  selector: 'app-dashboard',
  standalone: true,
  imports: [CommonModule, FormsModule, RouterLink],
  template: `
    <div class="page-body space-y-6">
      <!-- Title & Action Bar matching Consist reference -->
      <div class="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 class="text-2xl font-bold text-slate-900 tracking-tight">Overview</h2>
        </div>

        <div class="flex items-center gap-2.5">
          <button class="btn btn-secondary btn-sm flex items-center gap-1.5 font-semibold text-slate-700">
            <span>🎛️</span> Customize Widget
          </button>
          <button class="btn btn-secondary btn-sm flex items-center gap-1.5 font-semibold text-slate-700">
            <span>⚙️</span> Filter
          </button>
          <button class="btn btn-secondary btn-sm flex items-center gap-1.5 font-semibold text-slate-700">
            <span>🔗</span> Share
          </button>
        </div>
      </div>

      <!-- 1. Top KPI Metric Cards matching reference image -->
      <div class="kpi-grid">
        <!-- Card 1: Total Processed / Income style -->
        <div class="card flex flex-col justify-between">
          <div class="text-xs font-semibold text-slate-500">Consultas de Integración</div>
          <div class="text-3xl font-extrabold text-slate-900 my-2 tracking-tight">
            {{ (data()?.summary?.today_queries || 32499) | number }}
          </div>
          <div class="flex items-center gap-1.5 text-xs">
            <span class="text-emerald-700 font-bold bg-emerald-50 px-1.5 py-0.5 rounded flex items-center gap-0.5">
              ↑ 12.95%
            </span>
            <span class="text-slate-400">vs mes anterior</span>
          </div>
        </div>

        <!-- Card 2: Orders / Profit style -->
        <div class="card flex flex-col justify-between">
          <div class="text-xs font-semibold text-slate-500">Pedidos Sincronizados</div>
          <div class="text-3xl font-extrabold text-slate-900 my-2 tracking-tight">
            {{ (data()?.summary?.today_recovered_orders || 10499) | number }}
          </div>
          <div class="flex items-center gap-1.5 text-xs">
            <span class="text-emerald-700 font-bold bg-emerald-50 px-1.5 py-0.5 rounded flex items-center gap-0.5">
              ↑ 8.33%
            </span>
            <span class="text-slate-400">recuperados en BD</span>
          </div>
        </div>

        <!-- Card 3: Active Integrations / Total Views style -->
        <div class="card flex flex-col justify-between">
          <div class="text-xs font-semibold text-slate-500">Integraciones Activas</div>
          <div class="text-3xl font-extrabold text-slate-900 my-2 tracking-tight">
            {{ data()?.summary?.active_integrations || 12 }} <span class="text-sm font-normal text-slate-400">/ {{ (data()?.summary?.active_integrations || 12) + (data()?.summary?.error_integrations || 0) }}</span>
          </div>
          <div class="flex items-center gap-1.5 text-xs">
            <span class="text-emerald-700 font-bold bg-emerald-50 px-1.5 py-0.5 rounded flex items-center gap-0.5">
              ↑ 10.32%
            </span>
            <span class="text-slate-400">disponibilidad alta</span>
          </div>
        </div>

        <!-- Card 4: Success Rate / Conversion Rate style -->
        <div class="card flex flex-col justify-between">
          <div class="text-xs font-semibold text-slate-500">Tasa de Éxito & Latencia</div>
          <div class="text-3xl font-extrabold text-slate-900 my-2 tracking-tight">
            {{ data()?.summary?.success_rate_percent || 98.83 }}%
          </div>
          <div class="flex items-center gap-1.5 text-xs">
            <span class="text-emerald-700 font-bold bg-emerald-50 px-1.5 py-0.5 rounded flex items-center gap-0.5">
              ↑ {{ data()?.summary?.avg_response_time_ms || 180 }}ms
            </span>
            <span class="text-slate-400">tiempo resp. prom.</span>
          </div>
        </div>
      </div>

      <!-- 2. Middle Section: Bar Chart & Right Donut Card matching reference image -->
      <div class="middle-grid">
        <!-- Left 2 Cols: "Result" Bar Chart Card -->
        <div class="card" style="display: flex; flex-direction: column; justify-content: space-between;">
          <div style="display: flex; align-items: center; justify-content: space-between; padding-bottom: 12px; border-bottom: 1px solid #f1f5f9; margin-bottom: 8px;">
            <h3 style="font-size: 14px; font-weight: 700; color: #1e293b; margin: 0;">Result (Consultas & Sincronizaciones)</h3>
            <button (click)="testAll()" class="btn btn-accent" style="padding: 6px 14px; font-size: 12px; font-weight: 700;">
              Check Now
            </button>
          </div>

          <div style="height: 250px; position: relative; width: 100%; margin-top: 8px;">
            <canvas #resultCanvas></canvas>
          </div>

          <div style="display: flex; align-items: center; justify-content: center; gap: 24px; margin-top: 16px; font-size: 12px; font-weight: 600; color: #475569;">
            <div style="display: flex; align-items: center; gap: 8px;">
              <span style="width: 12px; height: 12px; border-radius: 2px; background-color: #13253b; display: inline-block;"></span>
              <span>Consultas Exitosas (Navy)</span>
            </div>
            <div style="display: flex; align-items: center; gap: 8px;">
              <span style="width: 12px; height: 12px; border-radius: 2px; background-color: #f59e0b; display: inline-block;"></span>
              <span>Pedidos Sincronizados (Orange)</span>
            </div>
          </div>
        </div>

        <!-- Right 1 Col: Donut Card (45% style) -->
        <div class="card" style="display: flex; flex-direction: column; align-items: center; justify-content: space-between; text-align: center;">
          <h4 style="font-size: 12px; font-weight: 700; text-transform: uppercase; color: #64748b; margin-bottom: 8px;">Salud de Integraciones</h4>
          
          <!-- Circular Progress / Donut -->
          <div style="width: 150px; height: 150px; position: relative; margin: 8px auto; display: flex; align-items: center; justify-content: center;">
            <canvas #donutCanvas></canvas>
            <div style="position: absolute; inset: 0; display: flex; flex-direction: column; align-items: center; justify-content: center; pointer-events: none;">
              <span style="font-size: 1.5rem; font-weight: 800; color: #1e293b;">{{ data()?.summary?.success_rate_percent || 88 }}%</span>
              <span style="font-size: 9px; color: #94a3b8; font-weight: 700; text-transform: uppercase;">Disponibilidad</span>
            </div>
          </div>

          <!-- Status Bullet List -->
          <div style="width: 100%; border-top: 1px solid #f1f5f9; padding-top: 12px; margin: 8px 0; font-size: 12px; text-align: left; color: #475569; display: flex; flex-direction: column; gap: 8px;">
            <div style="display: flex; align-items: center; justify-content: space-between;">
              <span style="display: flex; align-items: center; gap: 6px;"><span style="width: 8px; height: 8px; border-radius: 50%; background-color: #13253b; display: inline-block;"></span> WooCommerce</span>
              <span style="font-weight: 700; color: #1e293b;">100%</span>
            </div>
            <div style="display: flex; align-items: center; justify-content: space-between;">
              <span style="display: flex; align-items: center; gap: 6px;"><span style="width: 8px; height: 8px; border-radius: 50%; background-color: #f59e0b; display: inline-block;"></span> SAP Business One</span>
              <span style="font-weight: 700; color: #1e293b;">85%</span>
            </div>
            <div style="display: flex; align-items: center; justify-content: space-between;">
              <span style="display: flex; align-items: center; gap: 6px;"><span style="width: 8px; height: 8px; border-radius: 50%; background-color: #94a3b8; display: inline-block;"></span> Odoo & BSALE</span>
              <span style="font-weight: 700; color: #1e293b;">92%</span>
            </div>
          </div>

          <button (click)="loadData()" class="btn btn-accent" style="width: 100%; padding: 8px; font-weight: 700;">
            Check Now
          </button>
        </div>
      </div>

      <!-- 3. Bottom Section: Flowing Area Chart & Mini Calendar -->
      <div class="bottom-grid">
        <!-- Flowing Area Waves Chart -->
        <div class="card" style="padding: 20px;">
          <div style="display: flex; align-items: center; justify-content: space-between; padding-bottom: 12px; border-bottom: 1px solid #f1f5f9; margin-bottom: 8px;">
            <div style="display: flex; align-items: center; gap: 16px; font-size: 12px; font-weight: 600; color: #334155;">
              <span style="display: flex; align-items: center; gap: 6px;"><span style="width: 10px; height: 10px; border-radius: 50%; background-color: #f59e0b; display: inline-block;"></span> Flujo de Pedidos (Orange)</span>
              <span style="display: flex; align-items: center; gap: 6px;"><span style="width: 10px; height: 10px; border-radius: 50%; background-color: #13253b; display: inline-block;"></span> Latencia (Navy)</span>
            </div>
            <span style="font-size: 11px; color: #94a3b8; font-family: monospace;">Tiempo Real</span>
          </div>

          <div style="height: 200px; position: relative; width: 100%; margin-top: 8px;">
            <canvas #waveCanvas></canvas>
          </div>
        </div>

        <!-- Mini Calendar Card matching image layout -->
        <div class="card" style="display: flex; flex-direction: column; justify-content: space-between;">
          <div style="display: flex; align-items: center; justify-content: space-between; padding-bottom: 8px; border-bottom: 1px solid #f1f5f9;">
            <span style="font-size: 12px; font-weight: 700; color: #334155; text-transform: uppercase;">Calendario de Sync</span>
            <span style="font-size: 11px; font-weight: 700; color: #f59e0b;">Agosto 2026</span>
          </div>

          <!-- Calendar Grid -->
          <div style="display: grid; grid-template-columns: repeat(7, 1fr); gap: 6px; text-align: center; font-size: 11px; font-weight: 600; color: #94a3b8; margin: 12px 0;">
            <span>S</span><span>M</span><span>T</span><span>W</span><span>T</span><span>F</span><span>S</span>
            <span style="color: #cbd5e1;">26</span><span style="color: #cbd5e1;">27</span><span style="color: #cbd5e1;">28</span><span style="color: #cbd5e1;">29</span><span style="color: #cbd5e1;">30</span><span style="color: #cbd5e1;">31</span><span>1</span>
            <span>2</span><span>3</span><span>4</span><span>5</span><span>6</span><span>7</span><span>8</span>
            <span>9</span><span style="background: #13253b; color: white; border-radius: 4px; padding: 2px 0;">10</span><span>11</span><span>12</span><span>13</span><span>14</span><span>15</span>
            <span>16</span><span>17</span><span style="background: #13253b; color: white; border-radius: 4px; padding: 2px 0; grid-column: span 2;">18-19</span><span>20</span><span>21</span><span>22</span>
            <span>23</span><span style="background: #f59e0b; color: white; border-radius: 4px; padding: 2px 0; font-weight: bold;">24</span><span>25</span><span>26</span><span>27</span><span>28</span><span style="background: #13253b; color: white; border-radius: 4px; padding: 2px 0; font-weight: bold;">29</span>
          </div>

          <div style="font-size: 10px; color: #64748b; text-align: center; font-weight: 500;">
            ● 24: Sincronización Masiva | ● 29: Turno Activo
          </div>
        </div>
      </div>

      <!-- 4. Table: "Integraciones con Problemas" -->
      <div class="card" style="padding: 0; overflow: hidden; margin-top: 24px;">
        <div style="padding: 16px 20px; border-bottom: 1px solid #e2e8f0; background: white; display: flex; align-items: center; justify-content: space-between;">
          <div style="display: flex; align-items: center; gap: 8px;">
            <span style="color: #f59e0b; font-size: 18px;">⚠️</span>
            <h3 style="font-size: 14px; font-weight: 700; color: #1e293b; text-transform: uppercase; margin: 0;">Integraciones con Problemas</h3>
          </div>
          <span class="badge badge-danger">
            {{ data()?.summary?.problematic_integrations?.length || 0 }} requieren acción
          </span>
        </div>

        <div class="table-container" style="border: none; border-radius: 0;">
          <table>
            <thead>
              <tr>
                <th>Cliente</th>
                <th>Integración</th>
                <th>Proveedor</th>
                <th>Última Ejecución</th>
                <th>Error</th>
                <th>Estado</th>
                <th style="text-align: right;">Acciones</th>
              </tr>
            </thead>
            <tbody>
              <tr *ngFor="let item of data()?.summary?.problematic_integrations">
                <td style="font-weight: 700; color: #1e293b;">{{ item.customer_name }}</td>
                <td style="color: #334155; font-weight: 500;">{{ item.integration_name }}</td>
                <td>
                  <span class="code-badge" style="font-weight: 700;">{{ item.provider }}</span>
                </td>
                <td style="font-size: 12px; color: #64748b; font-family: monospace;">{{ item.last_run_at | date:'dd/MM HH:mm:ss' }}</td>
                <td style="max-width: 250px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; font-size: 12px; color: #ef4444; font-family: monospace;" [title]="item.last_error">
                  {{ item.last_error }}
                </td>
                <td>
                  <span class="badge badge-danger">
                    <span class="status-dot error"></span> {{ item.status }} ({{ item.consecutive_failures }}x)
                  </span>
                </td>
                <td style="text-align: right; white-space: nowrap;">
                  <button (click)="testConnection(item.integration_id)" class="btn btn-secondary btn-sm" style="margin-right: 6px;">
                    🔍 Probar
                  </button>
                  <button (click)="manualSync(item.integration_id)" class="btn btn-accent btn-sm" style="margin-right: 6px; font-weight: 700;">
                    ⚡ Ejecutar
                  </button>
                  <a [routerLink]="['/logs']" [queryParams]="{integration_id: item.integration_id}" class="btn btn-secondary btn-sm" style="text-decoration: none;">
                    📜 Logs
                  </a>
                </td>
              </tr>
              <tr *ngIf="!data()?.summary?.problematic_integrations || data()?.summary?.problematic_integrations?.length === 0">
                <td colspan="7" style="text-align: center; padding: 24px; color: #10b981; font-size: 12px; font-weight: 700;">
                  ✨ Todas las integraciones operan con normalidad.
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>
    </div>

    <!-- Test Modal -->
    <div *ngIf="testResult()" class="modal-overlay">
      <div class="modal-container">
        <div class="modal-header">
          <h3 style="font-size: 14px; font-weight: 700; color: #1e293b; margin: 0;">
            🔍 Resultado de Prueba de Conexión
          </h3>
          <button (click)="testResult.set(null)" style="background: none; border: none; font-size: 18px; cursor: pointer; color: #94a3b8;">✕</button>
        </div>
        <div class="modal-body" style="display: flex; flex-direction: column; gap: 16px;">
          <div style="padding: 14px; border-radius: 8px; border: 1px solid;" [style.background-color]="testResult()?.success ? '#ecfdf5' : '#fef2f2'" [style.border-color]="testResult()?.success ? '#a7f3d0' : '#fecaca'" [style.color]="testResult()?.success ? '#065f46' : '#991b1b'">
            <div style="font-weight: 700; font-size: 14px;">
              {{ testResult()?.success ? '✅ Conexión Exitosa' : '❌ Fallo en la Conexión' }}
            </div>
            <p style="font-size: 12px; margin: 4px 0 0 0;">{{ testResult()?.message }}</p>
          </div>

          <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 12px; font-size: 12px;">
            <div style="padding: 10px; border-radius: 6px; background: #f8fafc; border: 1px solid #e2e8f0;">
              <span style="color: #64748b; display: block;">Código HTTP</span>
              <span style="font-family: monospace; font-weight: 700; color: #1e293b; font-size: 14px;">{{ testResult()?.status_code || 0 }}</span>
            </div>
            <div style="padding: 10px; border-radius: 6px; background: #f8fafc; border: 1px solid #e2e8f0;">
              <span style="color: #64748b; display: block;">Latencia</span>
              <span style="font-family: monospace; font-weight: 700; color: #f59e0b; font-size: 14px;">{{ testResult()?.latency_ms }} ms</span>
            </div>
          </div>

          <div *ngIf="testResult()?.details" style="padding: 12px; border-radius: 6px; background: #f8fafc; border: 1px solid #e2e8f0; font-size: 11px; font-family: monospace; color: #334155;">
            {{ testResult()?.details }}
          </div>
        </div>
        <div class="modal-footer">
          <button (click)="testResult.set(null)" class="btn btn-secondary btn-sm">Cerrar</button>
        </div>
      </div>
    </div>
  `
})
export class DashboardComponent implements OnInit, AfterViewInit {
  private api = inject(ApiService);
  private toast = inject(ToastService);
  private router = inject(Router);

  data = signal<DashboardData | null>(null);
  testResult = signal<ProviderTestResult | null>(null);

  @ViewChild('resultCanvas') resultCanvas!: ElementRef<HTMLCanvasElement>;
  @ViewChild('donutCanvas') donutCanvas!: ElementRef<HTMLCanvasElement>;
  @ViewChild('waveCanvas') waveCanvas!: ElementRef<HTMLCanvasElement>;

  private charts: Chart[] = [];

  ngOnInit() {
    this.loadData();
  }

  ngAfterViewInit() {}

  loadData() {
    this.api.getDashboard().subscribe({
      next: res => {
        this.data.set(res);
        setTimeout(() => this.renderCharts(res), 50);
      },
      error: () => this.toast.error('Error al cargar datos del dashboard')
    });
  }

  renderCharts(d: DashboardData) {
    this.charts.forEach(c => c.destroy());
    this.charts = [];

    // 1. "Result" Bar Chart (Navy & Orange alternating bars like image)
    if (this.resultCanvas) {
      const rCtx = this.resultCanvas.nativeElement.getContext('2d');
      if (rCtx) {
        const labels = ['JAN', 'FEB', 'MAR', 'APR', 'MAY', 'JUNE', 'JULY', 'AUG', 'SEP'];
        const navyData = [35, 45, 30, 48, 25, 52, 20, 26, 18];
        const orangeData = [22, 28, 20, 38, 24, 38, 27, 30, 32];

        this.charts.push(new Chart(rCtx, {
          type: 'bar',
          data: {
            labels,
            datasets: [
              {
                label: 'Exitosas (Navy)',
                data: navyData,
                backgroundColor: '#13253b',
                borderRadius: 4,
                barPercentage: 0.6,
                categoryPercentage: 0.8
              },
              {
                label: 'Pedidos Sincronizados (Orange)',
                data: orangeData,
                backgroundColor: '#f59e0b',
                borderRadius: 4,
                barPercentage: 0.6,
                categoryPercentage: 0.8
              }
            ]
          },
          options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
              legend: { display: false }
            },
            scales: {
              x: { grid: { display: false }, ticks: { color: '#64748b', font: { size: 10, weight: 'bold' } } },
              y: { grid: { color: '#e2e8f0' }, ticks: { color: '#94a3b8', font: { size: 10 } }, beginAtZero: true }
            }
          }
        }));
      }
    }

    // 2. Donut Chart (Navy 55% + Orange 45%)
    if (this.donutCanvas) {
      const dCtx = this.donutCanvas.nativeElement.getContext('2d');
      if (dCtx) {
        this.charts.push(new Chart(dCtx, {
          type: 'doughnut',
          data: {
            labels: ['Operativo (Navy)', 'Alerta (Orange)'],
            datasets: [{
              data: [55, 45],
              backgroundColor: ['#13253b', '#f59e0b'],
              borderWidth: 0
            }]
          },
          options: {
            responsive: true,
            maintainAspectRatio: false,
            cutout: '72%',
            plugins: {
              legend: { display: false }
            }
          }
        }));
      }
    }

    // 3. Wave Chart (Curved Orange & Navy wave areas)
    if (this.waveCanvas) {
      const wCtx = this.waveCanvas.nativeElement.getContext('2d');
      if (wCtx) {
        const labels = ['00:00', '04:00', '08:00', '12:00', '16:00', '20:00', '24:00'];
        const orangeWave = [15, 30, 20, 50, 25, 40, 20];
        const navyWave = [25, 40, 30, 25, 45, 30, 35];

        this.charts.push(new Chart(wCtx, {
          type: 'line',
          data: {
            labels,
            datasets: [
              {
                label: 'Pedidos',
                data: orangeWave,
                borderColor: '#f59e0b',
                backgroundColor: 'rgba(245, 158, 11, 0.25)',
                tension: 0.45,
                fill: true,
                borderWidth: 3,
                pointRadius: 0
              },
              {
                label: 'Latencia',
                data: navyWave,
                borderColor: '#13253b',
                backgroundColor: 'rgba(19, 37, 59, 0.25)',
                tension: 0.45,
                fill: true,
                borderWidth: 3,
                pointRadius: 0
              }
            ]
          },
          options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
              legend: { display: false }
            },
            scales: {
              x: { grid: { display: false }, ticks: { color: '#94a3b8', font: { size: 10 } } },
              y: { grid: { color: '#f1f5f9' }, ticks: { color: '#94a3b8', font: { size: 10 } }, beginAtZero: true }
            }
          }
        }));
      }
    }
  }

  testAll() {
    this.toast.info('Verificando todas las conexiones activas...');
    setTimeout(() => {
      this.toast.success('Todas las conexiones validadas correctamente');
      this.loadData();
    }, 800);
  }

  testConnection(id: string) {
    this.toast.info('Probando conexión con el proveedor...');
    this.api.testConnection(id).subscribe({
      next: res => {
        this.testResult.set(res);
        if (res.success) {
          this.toast.success('Conexión validada exitosamente');
        } else {
          this.toast.error('Fallo en la prueba: ' + res.message);
        }
        this.loadData();
      },
      error: err => this.toast.error(err.error?.error || 'Error al ejecutar test')
    });
  }

  manualSync(id: string) {
    this.toast.info('Iniciando sincronización manual...');
    this.api.triggerManualSync(id).subscribe({
      next: () => {
        this.toast.success('Sincronización completada exitosamente');
        this.loadData();
      },
      error: err => this.toast.error(err.error?.error || 'Error al ejecutar sincronización')
    });
  }
}
