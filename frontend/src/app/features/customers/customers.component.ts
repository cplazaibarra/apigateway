import { Component, inject, signal, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { ApiService } from '../../core/services/api.service';
import { ToastService } from '../../core/services/toast.service';
import { AuthService } from '../../core/services/auth.service';
import { Customer, CustomerDetail } from '../../core/models/types';

@Component({
  selector: 'app-customers',
  standalone: true,
  imports: [CommonModule, FormsModule, RouterLink],
  template: `
    <div class="page-body space-y-6">
      <!-- Title Bar -->
      <div class="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h2 class="text-xl font-bold text-slate-100 flex items-center gap-2">
            <span>🏢</span> Clientes & Empresas
          </h2>
          <p class="text-xs text-slate-400 mt-0.5">Gestión de cuentas comerciales, integraciones asignadas y estados de sincronización</p>
        </div>

        <div class="flex items-center gap-3">
          <input type="text" [(ngModel)]="searchQuery" (input)="onSearch()" placeholder="Buscar cliente por nombre o código..." 
                 class="form-control text-xs py-1.5 px-3 w-64 bg-slate-900 border-slate-800" />
          <button *ngIf="auth.isAdmin()" (click)="openCreateModal()" class="btn btn-primary btn-sm flex items-center gap-1.5">
            <span>➕</span> Nuevo Cliente
          </button>
        </div>
      </div>

      <!-- Customers Table -->
      <div class="card bg-slate-900 border-slate-800 p-0 overflow-hidden">
        <div class="table-container border-0 rounded-none bg-transparent">
          <table>
            <thead>
              <tr>
                <th>Código</th>
                <th>Nombre de Empresa</th>
                <th>Contacto</th>
                <th>Integraciones</th>
                <th>Última Sincronización</th>
                <th>Estado</th>
                <th class="text-right">Acciones</th>
              </tr>
            </thead>
            <tbody>
              <tr *ngFor="let c of customers()">
                <td class="font-mono font-semibold text-indigo-400 text-xs">{{ c.code }}</td>
                <td class="font-medium text-slate-200">{{ c.name }}</td>
                <td class="text-xs text-slate-400">
                  <div>{{ c.contact_email }}</div>
                  <div class="text-slate-500 font-mono text-[11px]">{{ c.contact_phone }}</div>
                </td>
                <td>
                  <span class="badge badge-info">
                    {{ c.active_integrations || 0 }} / {{ c.total_integrations || 0 }} activas
                  </span>
                </td>
                <td class="text-xs text-slate-400">
                  {{ c.last_sync_at ? (c.last_sync_at | date:'dd/MM/yyyy HH:mm') : 'Nunca' }}
                </td>
                <td>
                  <span class="badge" [class.badge-success]="c.is_active" [class.badge-muted]="!c.is_active">
                    <span class="status-dot" [class.active]="c.is_active" [class.disabled]="!c.is_active"></span>
                    {{ c.is_active ? 'Habilitado' : 'Deshabilitado' }}
                  </span>
                </td>
                <td class="text-right space-x-1.5">
                  <button (click)="viewCustomer(c.id)" class="btn btn-secondary btn-sm text-xs py-1">
                    👁️ Ver Detalle
                  </button>
                  <button *ngIf="auth.isAdmin()" (click)="openEditModal(c)" class="btn btn-secondary btn-sm text-xs py-1">
                    ✏️ Editar
                  </button>
                  <button *ngIf="auth.isAdmin()" (click)="toggleActive(c)" class="btn btn-sm text-xs py-1"
                          [class.btn-danger]="c.is_active" [class.btn-success]="!c.is_active">
                    {{ c.is_active ? 'Deshabilitar' : 'Habilitar' }}
                  </button>
                </td>
              </tr>
              <tr *ngIf="customers().length === 0">
                <td colspan="7" class="text-center py-6 text-slate-500 text-xs">
                  No se encontraron clientes registrados
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>
    </div>

    <!-- Customer Detail Modal / Drawer -->
    <div *ngIf="selectedCustomer()" class="modal-overlay">
      <div class="modal-container max-w-2xl">
        <div class="modal-header">
          <div>
            <h3 class="text-sm font-bold text-slate-100 flex items-center gap-2">
              <span>🏢</span> {{ selectedCustomer()?.customer?.name }}
            </h3>
            <span class="text-xs font-mono text-indigo-400">{{ selectedCustomer()?.customer?.code }}</span>
          </div>
          <button (click)="selectedCustomer.set(null)" class="text-slate-400 hover:text-slate-200">✕</button>
        </div>

        <div class="modal-body space-y-5">
          <!-- Stats Summary -->
          <div class="grid grid-cols-3 gap-3">
            <div class="p-3 rounded-lg bg-slate-950 border border-slate-800">
              <span class="text-slate-500 text-[11px] block">Integraciones</span>
              <span class="text-lg font-bold text-slate-200">
                {{ selectedCustomer()?.stats?.active_integrations }} / {{ selectedCustomer()?.stats?.total_integrations }}
              </span>
            </div>
            <div class="p-3 rounded-lg bg-slate-950 border border-slate-800">
              <span class="text-slate-500 text-[11px] block">Total Pedidos</span>
              <span class="text-lg font-bold text-purple-400">
                {{ selectedCustomer()?.stats?.total_orders | number }}
              </span>
            </div>
            <div class="p-3 rounded-lg bg-slate-950 border border-slate-800">
              <span class="text-slate-500 text-[11px] block">Errores Recientes</span>
              <span class="text-lg font-bold" [class.text-emerald-400]="selectedCustomer()?.stats?.recent_errors_count === 0" [class.text-red-400]="(selectedCustomer()?.stats?.recent_errors_count || 0) > 0">
                {{ selectedCustomer()?.stats?.recent_errors_count }}
              </span>
            </div>
          </div>

          <!-- Integrations List -->
          <div>
            <h4 class="text-xs font-bold uppercase tracking-wider text-slate-400 mb-2">Integraciones Asignadas</h4>
            <div class="space-y-2">
              <div *ngFor="let it of selectedCustomer()?.integrations" class="p-3 rounded-lg bg-slate-950 border border-slate-800 flex items-center justify-between">
                <div>
                  <div class="font-semibold text-xs text-slate-200">{{ it.name }}</div>
                  <div class="text-[11px] text-slate-400 font-mono">{{ it.provider }} | {{ it.base_url }}</div>
                </div>
                <div class="text-right">
                  <span class="badge text-[10px]" [class.badge-success]="it.status === 'ACTIVE'" [class.badge-danger]="it.status === 'ERROR'" [class.badge-muted]="it.status === 'DISABLED'">
                    {{ it.status }}
                  </span>
                  <div class="text-[10px] text-slate-500 mt-1">{{ it.avg_response_time_ms }} ms</div>
                </div>
              </div>
              <div *ngIf="!selectedCustomer()?.integrations?.length" class="text-xs text-slate-500 text-center py-2">
                Sin integraciones configuradas para este cliente
              </div>
            </div>
          </div>

          <!-- Recent Errors -->
          <div *ngIf="selectedCustomer()?.recent_errors?.length">
            <h4 class="text-xs font-bold uppercase tracking-wider text-red-400 mb-2">Errores Recientes</h4>
            <div class="space-y-1.5 max-h-40 overflow-y-auto">
              <div *ngFor="let err of selectedCustomer()?.recent_errors" class="p-2 rounded bg-red-950/20 border border-red-900/30 text-xs">
                <div class="flex justify-between text-[10px] text-red-400 font-mono">
                  <span>{{ err.provider }} ({{ err.operation_type }})</span>
                  <span>{{ err.created_at | date:'dd/MM HH:mm:ss' }}</span>
                </div>
                <div class="text-slate-300 text-[11px] mt-0.5">{{ err.message }}</div>
              </div>
            </div>
          </div>
        </div>

        <div class="modal-footer">
          <button (click)="selectedCustomer.set(null)" class="btn btn-secondary btn-sm">Cerrar</button>
        </div>
      </div>
    </div>

    <!-- Create / Edit Customer Modal -->
    <div *ngIf="showFormModal()" class="modal-overlay">
      <div class="modal-container">
        <div class="modal-header">
          <h3 class="text-sm font-bold text-slate-100">
            {{ isEditing() ? 'Editar Cliente' : 'Registrar Nuevo Cliente' }}
          </h3>
          <button (click)="showFormModal.set(false)" class="text-slate-400 hover:text-slate-200">✕</button>
        </div>
        <form (ngSubmit)="saveCustomer()">
          <div class="modal-body space-y-3.5">
            <div class="form-group">
              <label class="form-label">Código Único (Ej: OMNI-RETAIL)</label>
              <input type="text" [(ngModel)]="formCustomer.code" name="code" required class="form-control text-xs font-mono uppercase" />
            </div>
            <div class="form-group">
              <label class="form-label">Razón Social / Nombre Comercial</label>
              <input type="text" [(ngModel)]="formCustomer.name" name="name" required class="form-control text-xs" />
            </div>
            <div class="form-group">
              <label class="form-label">Correo Electrónico de Contacto</label>
              <input type="email" [(ngModel)]="formCustomer.contact_email" name="contact_email" required class="form-control text-xs" />
            </div>
            <div class="form-group">
              <label class="form-label">Teléfono de Contacto</label>
              <input type="text" [(ngModel)]="formCustomer.contact_phone" name="contact_phone" class="form-control text-xs font-mono" />
            </div>
            <div class="flex items-center gap-2 pt-2">
              <input type="checkbox" [(ngModel)]="formCustomer.is_active" name="is_active" id="custActive" class="rounded border-slate-700 bg-slate-900 text-indigo-600 focus:ring-indigo-500" />
              <label for="custActive" class="text-xs text-slate-300">Cliente activo y habilitado para procesar pedidos</label>
            </div>
          </div>
          <div class="modal-footer">
            <button type="button" (click)="showFormModal.set(false)" class="btn btn-secondary btn-sm">Cancelar</button>
            <button type="submit" class="btn btn-primary btn-sm">Guardar Cliente</button>
          </div>
        </form>
      </div>
    </div>
  `
})
export class CustomersComponent implements OnInit {
  private api = inject(ApiService);
  private toast = inject(ToastService);
  auth = inject(AuthService);

  customers = signal<Customer[]>([]);
  selectedCustomer = signal<CustomerDetail | null>(null);
  showFormModal = signal(false);
  isEditing = signal(false);

  searchQuery = '';
  formCustomer: Partial<Customer> = {};

  ngOnInit() {
    this.loadCustomers();
  }

  loadCustomers() {
    this.api.getCustomers(this.searchQuery).subscribe({
      next: res => this.customers.set(res || []),
      error: () => this.toast.error('Error al cargar clientes')
    });
  }

  onSearch() {
    this.loadCustomers();
  }

  viewCustomer(id: string) {
    this.api.getCustomer(id).subscribe({
      next: res => this.selectedCustomer.set(res),
      error: () => this.toast.error('Error al cargar detalle del cliente')
    });
  }

  openCreateModal() {
    this.isEditing.set(false);
    this.formCustomer = { is_active: true };
    this.showFormModal.set(true);
  }

  openEditModal(c: Customer) {
    this.isEditing.set(true);
    this.formCustomer = { ...c };
    this.showFormModal.set(true);
  }

  saveCustomer() {
    if (!this.formCustomer.code || !this.formCustomer.name || !this.formCustomer.contact_email) {
      this.toast.error('Por favor complete todos los campos obligatorios');
      return;
    }

    if (this.isEditing() && this.formCustomer.id) {
      this.api.updateCustomer(this.formCustomer.id, this.formCustomer).subscribe({
        next: () => {
          this.toast.success('Cliente actualizado correctamente');
          this.showFormModal.set(false);
          this.loadCustomers();
        },
        error: err => this.toast.error(err.error?.error || 'Error al actualizar cliente')
      });
    } else {
      this.api.createCustomer(this.formCustomer).subscribe({
        next: () => {
          this.toast.success('Cliente registrado exitosamente');
          this.showFormModal.set(false);
          this.loadCustomers();
        },
        error: err => this.toast.error(err.error?.error || 'Error al registrar cliente')
      });
    }
  }

  toggleActive(c: Customer) {
    this.api.toggleCustomer(c.id).subscribe({
      next: res => {
        c.is_active = res.is_active;
        this.toast.info(`Cliente ${c.is_active ? 'habilitado' : 'deshabilitado'} exitosamente`);
      },
      error: () => this.toast.error('Error al cambiar estado del cliente')
    });
  }
}
