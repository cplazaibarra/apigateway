import { Component, OnInit, signal, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ApiService } from '../../core/services/api.service';
import { ToastService } from '../../core/services/toast.service';
import { StandardizedOrderReport, Integration } from '../../core/models/types';

@Component({
  selector: 'app-orders',
  standalone: true,
  imports: [CommonModule, FormsModule],
  template: `
    <div class="space-y-6">
      <!-- Header -->
      <div class="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
        <div>
          <h2 class="text-xl font-bold text-slate-800 tracking-tight flex items-center gap-2">
            <span>📦</span> Pedidos Estandarizados & SKUs
          </h2>
          <p class="text-xs text-slate-500 mt-1">
            Visualización centralizada de órdenes normalizadas, desglose de SKUs, clientes y direcciones de todas las tiendas
          </p>
        </div>
        <div class="flex items-center gap-3">
          <button (click)="exportToCSV()" class="btn btn-secondary btn-sm flex items-center gap-1.5 shadow-sm text-xs">
            <span>📥</span> Exportar CSV
          </button>
          <button (click)="loadOrders()" [disabled]="loading()" class="btn btn-primary btn-sm flex items-center gap-1.5 shadow-sm text-xs">
            <span>🔄</span> {{ loading() ? 'Cargando...' : 'Actualizar' }}
          </button>
        </div>
      </div>

      <!-- KPI Summary Cards -->
      <div class="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div class="bg-white border border-slate-200 rounded-xl p-4 shadow-sm flex items-center justify-between">
          <div>
            <div class="text-xs font-semibold text-slate-500 uppercase tracking-wider">Total Pedidos Sincronizados</div>
            <div class="text-2xl font-bold text-slate-800 mt-1">{{ orders().length | number }}</div>
          </div>
          <div class="w-10 h-10 rounded-lg bg-indigo-50 flex items-center justify-center text-xl">🛒</div>
        </div>

        <div class="bg-white border border-slate-200 rounded-xl p-4 shadow-sm flex items-center justify-between">
          <div>
            <div class="text-xs font-semibold text-slate-500 uppercase tracking-wider">Total Líneas de SKU</div>
            <div class="text-2xl font-bold text-emerald-600 mt-1">{{ totalSKUsCount() | number }}</div>
          </div>
          <div class="w-10 h-10 rounded-lg bg-emerald-50 flex items-center justify-center text-xl">🏷️</div>
        </div>

        <div class="bg-white border border-slate-200 rounded-xl p-4 shadow-sm flex items-center justify-between">
          <div>
            <div class="text-xs font-semibold text-slate-500 uppercase tracking-wider">Monto Total Acumulado</div>
            <div class="text-2xl font-bold text-indigo-600 mt-1"><span>$</span>{{ totalRevenue() | number:'1.0-0' }}</div>
          </div>
          <div class="w-10 h-10 rounded-lg bg-amber-50 flex items-center justify-center text-xl">💰</div>
        </div>
      </div>

      <!-- Filters Row -->
      <div class="bg-white border border-slate-200 rounded-xl p-4 shadow-sm flex flex-col md:flex-row gap-3 items-center justify-between">
        <div class="flex-1 w-full relative">
          <input
            type="text"
            [(ngModel)]="searchQuery"
            (input)="onSearchChange()"
            placeholder="Buscar por Nº Pedido, SKU, Producto, Cliente, Dirección o Comuna..."
            class="form-control text-xs py-2 pl-9 pr-4 w-full bg-slate-50 border-slate-200 focus:bg-white"
          />
          <span class="absolute left-3 top-2.5 text-slate-400 text-xs">🔍</span>
        </div>

        <div class="flex items-center gap-3 w-full md:w-auto">
          <select [(ngModel)]="selectedIntegration" (change)="loadOrders()" class="form-select text-xs py-2 px-3 bg-slate-50 border-slate-200">
            <option value="">Todas las Tiendas / Integraciones</option>
            <option *ngFor="let it of integrations()" [value]="it.id">{{ it.name }}</option>
          </select>

          <select [(ngModel)]="selectedStatus" (change)="loadOrders()" class="form-select text-xs py-2 px-3 bg-slate-50 border-slate-200">
            <option value="">Todos los Estados</option>
            <option value="PROCESSING">PROCESSING</option>
            <option value="COMPLETED">COMPLETED</option>
            <option value="PENDING">PENDING</option>
          </select>
        </div>
      </div>

      <!-- Orders & SKUs Main Table -->
      <div class="bg-white border border-slate-200 rounded-xl shadow-sm overflow-hidden">
        <div class="overflow-x-auto">
          <table class="w-full text-left text-xs">
            <thead class="bg-slate-50 text-slate-500 font-bold border-b border-slate-200 uppercase tracking-wider text-[11px]">
              <tr>
                <th class="p-3.5">Tienda / Integración</th>
                <th class="p-3.5">Nº Pedido</th>
                <th class="p-3.5">Cliente & Contacto</th>
                <th class="p-3.5">Dirección de Despacho</th>
                <th class="p-3.5 min-w-[280px]">Desglose de SKUs & Productos</th>
                <th class="p-3.5 text-right">Total</th>
                <th class="p-3.5 text-center">Estado</th>
                <th class="p-3.5 text-right">Sincronizado</th>
                <th class="p-3.5 text-center">Acción</th>
              </tr>
            </thead>
            <tbody class="divide-y divide-slate-100 text-slate-700">
              <tr *ngFor="let ord of orders()" class="hover:bg-slate-50/80 transition-colors">
                <!-- Tienda -->
                <td class="p-3.5">
                  <div class="font-bold text-slate-800 text-xs">{{ ord.integration_name }}</div>
                  <div class="text-[10px] text-slate-400 font-mono">{{ ord.provider }}</div>
                </td>

                <!-- Nº Pedido -->
                <td class="p-3.5 font-mono">
                  <span class="font-bold text-indigo-600 bg-indigo-50 px-2 py-0.5 rounded border border-indigo-100">
                    #{{ ord.order_number }}
                  </span>
                  <div class="text-[10px] text-slate-400 mt-0.5">Ext ID: {{ ord.external_order_id }}</div>
                </td>

                <!-- Cliente -->
                <td class="p-3.5">
                  <div class="font-bold text-slate-800">{{ ord.customer_full_name || 'Sin Nombre' }}</div>
                  <div class="text-[11px] text-slate-500">{{ ord.customer_email }}</div>
                  <div *ngIf="ord.customer_phone" class="text-[10px] text-sky-600 font-semibold flex items-center gap-1 mt-0.5">
                    <span>📞</span> {{ ord.customer_phone }}
                  </div>
                </td>

                <!-- Dirección & Comuna -->
                <td class="p-3.5">
                  <div class="font-medium text-slate-700 text-xs">
                    {{ ord.shipping_address || 'Sin dirección registrada' }}
                  </div>
                  <div *ngIf="ord.city || ord.commune" class="text-[11px] font-bold text-amber-700 mt-0.5 flex items-center gap-1">
                    <span>📍</span> {{ ord.city || ord.commune }}
                  </div>
                </td>

                <!-- Desglose de SKUs & Productos -->
                <td class="p-3.5 space-y-1.5">
                  <div *ngFor="let itm of ord.items" class="p-1.5 bg-slate-50 rounded border border-slate-200/70 text-[11px] flex items-center justify-between gap-2">
                    <div class="truncate">
                      <span class="font-mono font-bold text-indigo-700 bg-indigo-100/60 px-1.5 py-0.5 rounded text-[10px]">
                        {{ itm.sku }}
                      </span>
                      <span class="ml-1.5 text-slate-700 font-medium">{{ itm.product_name }}</span>
                    </div>
                    <div class="flex-shrink-0 text-slate-500 font-mono text-[10px]">
                      <span class="font-bold text-slate-800">{{ itm.quantity }}x</span> <span>$</span>{{ itm.unit_price | number }}
                    </div>
                  </div>
                  <div *ngIf="ord.items.length === 0" class="text-slate-400 italic text-[11px]">
                    Sin ítems asociados
                  </div>
                </td>

                <!-- Total -->
                <td class="p-3.5 text-right font-mono">
                  <div class="font-bold text-slate-900 text-xs"><span>$</span>{{ ord.total_amount | number }}</div>
                  <div class="text-[10px] text-slate-400">{{ ord.currency }}</div>
                </td>

                <!-- Estado -->
                <td class="p-3.5 text-center">
                  <span class="badge badge-success text-[10px]">{{ ord.status }}</span>
                </td>

                <!-- Fecha Sincronización -->
                <td class="p-3.5 text-right text-slate-500 font-mono text-[11px]">
                  <div>{{ ord.synced_at | date:'dd/MM/yyyy' }}</div>
                  <div class="text-[10px] text-slate-400">{{ ord.synced_at | date:'HH:mm:ss' }}</div>
                </td>

                <!-- Acción (Ver detalle) -->
                <td class="p-3.5 text-center">
                  <button (click)="viewOrderDetail(ord)" class="btn btn-secondary btn-sm text-xs py-1 px-2.5" title="Ver Detalle y Raw Payload">
                    👁️ Ver
                  </button>
                </td>
              </tr>

              <tr *ngIf="orders().length === 0 && !loading()">
                <td colspan="9" class="p-8 text-center text-slate-400">
                  No se encontraron pedidos estandarizados con los filtros seleccionados.
                </td>
              </tr>

              <tr *ngIf="loading()">
                <td colspan="9" class="p-8 text-center text-slate-400">
                  Cargando pedidos estandarizados...
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>

      <!-- ORDER DETAIL MODAL -->
      <div *ngIf="selectedOrder" class="modal-overlay" (click)="selectedOrder = null">
        <div class="modal-container max-w-3xl" (click)="$event.stopPropagation()">
          <div class="modal-header">
            <div>
              <h3 class="text-base font-bold text-slate-800 flex items-center gap-2">
                <span>📦</span> Detalle del Pedido #{{ selectedOrder.order_number }}
              </h3>
              <div class="text-xs text-slate-500">{{ selectedOrder.integration_name }} ({{ selectedOrder.provider }})</div>
            </div>
            <button (click)="selectedOrder = null" class="w-8 h-8 rounded-lg flex items-center justify-center text-slate-400 hover:text-slate-700 hover:bg-slate-200 transition-colors font-bold text-base">
              ✕
            </button>
          </div>

          <div class="modal-body space-y-4 max-h-[70vh] overflow-y-auto">
            <div class="grid grid-cols-1 sm:grid-cols-2 gap-4 text-xs">
              <div class="p-3.5 bg-slate-50 rounded-xl border border-slate-200 space-y-1.5">
                <div class="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Cliente & Contacto</div>
                <div class="font-bold text-slate-800 text-sm">{{ selectedOrder.customer_full_name || 'Sin Nombre' }}</div>
                <div class="text-slate-600">{{ selectedOrder.customer_email }}</div>
                <div *ngIf="selectedOrder.customer_phone" class="text-sky-600 font-semibold flex items-center gap-1 mt-1">
                  <span>📞</span> {{ selectedOrder.customer_phone }}
                </div>
              </div>

              <div class="p-3.5 bg-slate-50 rounded-xl border border-slate-200 space-y-1.5">
                <div class="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Dirección de Despacho</div>
                <div class="font-bold text-slate-800">{{ selectedOrder.shipping_address || 'Sin dirección' }}</div>
                <div class="text-amber-700 font-bold flex items-center gap-1">
                  <span>📍</span> {{ selectedOrder.city || selectedOrder.commune }}
                </div>
                <div class="text-slate-700 pt-1 text-xs">
                  Monto Total: <strong class="text-slate-900 font-mono text-sm"><span>$</span>{{ selectedOrder.total_amount | number }} {{ selectedOrder.currency }}</strong>
                </div>
              </div>
            </div>

            <!-- Items Table in Modal -->
            <div class="space-y-2">
              <div class="text-xs font-bold text-slate-700 uppercase tracking-wider">
                Ítems Normalizados ({{ selectedOrder.items ? selectedOrder.items.length : 0 }})
              </div>
              <div class="border border-slate-200 rounded-xl overflow-hidden bg-white">
                <table class="w-full text-left text-xs">
                  <thead class="bg-slate-50 text-slate-500 font-bold border-b border-slate-200 text-[10px] uppercase">
                    <tr>
                      <th class="p-2.5">SKU</th>
                      <th class="p-2.5">Producto</th>
                      <th class="p-2.5 text-center">Cantidad</th>
                      <th class="p-2.5 text-right">Precio Unit.</th>
                      <th class="p-2.5 text-right">Total</th>
                    </tr>
                  </thead>
                  <tbody class="divide-y divide-slate-100">
                    <tr *ngFor="let itm of selectedOrder.items" class="hover:bg-slate-50/50">
                      <td class="p-2.5 font-mono font-bold text-indigo-600 bg-indigo-50/50">{{ itm.sku }}</td>
                      <td class="p-2.5 text-slate-700 font-medium">{{ itm.product_name }}</td>
                      <td class="p-2.5 text-center font-mono font-bold text-slate-800">{{ itm.quantity }}</td>
                      <td class="p-2.5 text-right font-mono text-slate-600"><span>$</span>{{ itm.unit_price | number }}</td>
                      <td class="p-2.5 text-right font-mono font-bold text-slate-900"><span>$</span>{{ itm.total_amount | number }}</td>
                    </tr>
                    <tr *ngIf="!selectedOrder.items || selectedOrder.items.length === 0">
                      <td colspan="5" class="p-4 text-center text-slate-400 italic">No hay ítems registrados</td>
                    </tr>
                  </tbody>
                </table>
              </div>
            </div>

            <!-- Raw Payload Inspection -->
            <div *ngIf="selectedOrder.raw_payload" class="space-y-2">
              <div class="text-xs font-bold text-slate-700 uppercase tracking-wider">Payload Crudo de Origen (Raw JSON)</div>
              <div class="bg-slate-950 text-emerald-400 p-3.5 rounded-xl font-mono text-[11px] max-h-48 overflow-y-auto border border-slate-800 shadow-inner">
                <pre class="whitespace-pre-wrap">{{ formatJSON(selectedOrder.raw_payload) }}</pre>
              </div>
            </div>
          </div>

          <div class="modal-footer">
            <button (click)="selectedOrder = null" class="btn btn-secondary btn-sm text-xs px-4">
              Cerrar
            </button>
          </div>
        </div>
      </div>
    </div>
  `,
  styles: [`
    .modal-overlay {
      position: fixed !important;
      top: 0 !important;
      left: 0 !important;
      right: 0 !important;
      bottom: 0 !important;
      background: rgba(15, 23, 42, 0.75) !important;
      backdrop-filter: blur(6px) !important;
      display: flex !important;
      align-items: center !important;
      justify-content: center !important;
      z-index: 99999 !important;
      padding: 1.5rem !important;
    }
    .modal-container {
      background: #ffffff !important;
      border-radius: 16px !important;
      width: 100% !important;
      max-width: 800px !important;
      max-height: 88vh !important;
      display: flex !important;
      flex-direction: column !important;
      box-shadow: 0 25px 50px -12px rgba(0, 0, 0, 0.4) !important;
      overflow: hidden !important;
      border: 1px solid #cbd5e1 !important;
    }
    .modal-header {
      padding: 1.25rem 1.5rem !important;
      border-bottom: 1px solid #e2e8f0 !important;
      display: flex !important;
      align-items: center !important;
      justify-content: space-between !important;
      background: #f8fafc !important;
    }
    .modal-body {
      padding: 1.5rem !important;
      overflow-y: auto !important;
      flex: 1 !important;
      background: #ffffff !important;
    }
    .modal-footer {
      padding: 1rem 1.5rem !important;
      border-top: 1px solid #e2e8f0 !important;
      display: flex !important;
      justify-content: flex-end !important;
      gap: 0.75rem !important;
      background: #f8fafc !important;
    }
  `]
})
export class OrdersComponent implements OnInit {
  private api = inject(ApiService);
  private toast = inject(ToastService);

  orders = signal<StandardizedOrderReport[]>([]);
  integrations = signal<Integration[]>([]);
  loading = signal<boolean>(false);

  searchQuery = '';
  selectedIntegration = '';
  selectedStatus = '';

  selectedOrder: StandardizedOrderReport | null = null;
  private searchTimeout: any;

  ngOnInit() {
    this.loadIntegrations();
    this.loadOrders();
  }

  loadIntegrations() {
    this.api.getIntegrations().subscribe({
      next: (res) => this.integrations.set(res || []),
      error: () => {}
    });
  }

  loadOrders() {
    this.loading.set(true);
    const filters: any = {};
    if (this.selectedIntegration) filters.integration_id = this.selectedIntegration;
    if (this.selectedStatus) filters.status = this.selectedStatus;
    if (this.searchQuery.trim()) filters.search = this.searchQuery.trim();

    this.api.getStandardizedOrders(filters).subscribe({
      next: (res) => {
        this.loading.set(false);
        this.orders.set(res || []);
      },
      error: (err) => {
        this.loading.set(false);
        this.toast.error('Error cargando pedidos: ' + (err.error?.error || err.message));
      }
    });
  }

  onSearchChange() {
    clearTimeout(this.searchTimeout);
    this.searchTimeout = setTimeout(() => {
      this.loadOrders();
    }, 300);
  }

  totalSKUsCount(): number {
    return this.orders().reduce((acc, o) => acc + (o.items ? o.items.length : 0), 0);
  }

  totalRevenue(): number {
    return this.orders().reduce((acc, o) => acc + o.total_amount, 0);
  }

  viewOrderDetail(ord: StandardizedOrderReport) {
    this.api.getStandardizedOrder(ord.id).subscribe({
      next: (full) => this.selectedOrder = full,
      error: () => this.selectedOrder = ord
    });
  }

  formatJSON(val: any): string {
    try {
      if (typeof val === 'string') return JSON.stringify(JSON.parse(val), null, 2);
      return JSON.stringify(val, null, 2);
    } catch {
      return String(val);
    }
  }

  exportToCSV() {
    const list = this.orders();
    if (list.length === 0) {
      this.toast.info('No hay datos para exportar');
      return;
    }

    const rows: string[] = [];
    rows.push(['Tienda', 'Proveedor', 'Num Pedido', 'SKU', 'Producto', 'Cantidad', 'Precio Unitario', 'Total Item', 'Cliente', 'Email', 'Telefono', 'Direccion', 'Comuna', 'Total Pedido', 'Estado', 'Fecha Sincronizacion'].join(','));

    for (const o of list) {
      if (o.items && o.items.length > 0) {
        for (const itm of o.items) {
          rows.push([
            `"${o.integration_name}"`,
            `"${o.provider}"`,
            `"${o.order_number}"`,
            `"${itm.sku}"`,
            `"${itm.product_name.replace(/"/g, '""')}"`,
            itm.quantity,
            itm.unit_price,
            itm.total_amount,
            `"${o.customer_full_name.replace(/"/g, '""')}"`,
            `"${o.customer_email}"`,
            `"${o.customer_phone}"`,
            `"${o.shipping_address.replace(/"/g, '""')}"`,
            `"${o.city || o.commune}"`,
            o.total_amount,
            `"${o.status}"`,
            `"${o.synced_at}"`
          ].join(','));
        }
      } else {
        rows.push([
          `"${o.integration_name}"`,
          `"${o.provider}"`,
          `"${o.order_number}"`,
          `""`,
          `""`,
          0,
          0,
          0,
          `"${o.customer_full_name.replace(/"/g, '""')}"`,
          `"${o.customer_email}"`,
          `"${o.customer_phone}"`,
          `"${o.shipping_address.replace(/"/g, '""')}"`,
          `"${o.city || o.commune}"`,
          o.total_amount,
          `"${o.status}"`,
          `"${o.synced_at}"`
        ].join(','));
      }
    }

    const csvContent = 'data:text/csv;charset=utf-8,\uFEFF' + rows.join('\n');
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement('a');
    link.setAttribute('href', encodedUri);
    link.setAttribute('download', `pedidos_estandarizados_${new Date().toISOString().slice(0, 10)}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    this.toast.success('Reporte CSV descargado correctamente');
  }
}
