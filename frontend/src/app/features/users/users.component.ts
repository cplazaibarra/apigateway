import { Component, inject, signal, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ApiService } from '../../core/services/api.service';
import { ToastService } from '../../core/services/toast.service';
import { AuthService } from '../../core/services/auth.service';
import { User } from '../../core/models/types';

@Component({
  selector: 'app-users',
  standalone: true,
  imports: [CommonModule, FormsModule],
  template: `
    <div class="page-body space-y-6 max-w-5xl">
      <!-- Title Bar -->
      <div class="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h2 class="text-xl font-bold text-slate-100 flex items-center gap-2">
            <span>👥</span> Usuarios & Control de Acceso (RBAC)
          </h2>
          <p class="text-xs text-slate-400 mt-0.5">Gestión de operadores del portal y asignación de roles (ADMIN, OPERATOR, VIEWER)</p>
        </div>

        <div class="flex items-center gap-2">
          <button (click)="showPassModal.set(true)" class="btn btn-secondary btn-sm text-xs">
            🔑 Cambiar Mi Contraseña
          </button>
          <button *ngIf="auth.isAdmin()" (click)="showCreateModal.set(true)" class="btn btn-primary btn-sm flex items-center gap-1.5 text-xs">
            <span>➕</span> Nuevo Usuario
          </button>
        </div>
      </div>

      <!-- Users Table -->
      <div class="card bg-slate-900 border-slate-800 p-0 overflow-hidden">
        <div class="table-container border-0 rounded-none bg-transparent">
          <table>
            <thead>
              <tr>
                <th>Nombre</th>
                <th>Correo Electrónico</th>
                <th>Rol Asignado</th>
                <th>Permisos Clave</th>
                <th>Estado</th>
                <th>Fecha de Creación</th>
              </tr>
            </thead>
            <tbody>
              <tr *ngFor="let u of users()">
                <td class="font-medium text-slate-200 text-xs">{{ u.name }}</td>
                <td class="font-mono text-xs text-slate-300">{{ u.email }}</td>
                <td>
                  <span class="badge text-[10px]" [ngClass]="{
                    'badge-danger': u.role === 'ADMIN',
                    'badge-info': u.role === 'OPERATOR',
                    'badge-warning': u.role === 'VIEWER'
                  }">
                    {{ u.role }}
                  </span>
                </td>
                <td class="text-xs text-slate-400">
                  <span *ngIf="u.role === 'ADMIN'" class="text-indigo-400">Acceso Completo (CRUD, Secretos, Config)</span>
                  <span *ngIf="u.role === 'OPERATOR'" class="text-emerald-400">Operaciones (Test, Sync manual, Logs)</span>
                  <span *ngIf="u.role === 'VIEWER'" class="text-slate-500">Solo Lectura (Dashboard, Métricas, Logs)</span>
                </td>
                <td>
                  <span class="badge" [class.badge-success]="u.is_active" [class.badge-muted]="!u.is_active">
                    {{ u.is_active ? 'Activo' : 'Inactivo' }}
                  </span>
                </td>
                <td class="text-xs text-slate-500 font-mono">
                  {{ u.created_at | date:'dd/MM/yyyy' }}
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>
    </div>

    <!-- Create User Modal -->
    <div *ngIf="showCreateModal()" class="modal-overlay">
      <div class="modal-container max-w-md">
        <div class="modal-header">
          <h3 class="text-sm font-bold text-slate-100">Crear Nuevo Usuario</h3>
          <button (click)="showCreateModal.set(false)" class="text-slate-400 hover:text-slate-200">✕</button>
        </div>
        <form (ngSubmit)="createUser()">
          <div class="modal-body space-y-3.5">
            <div class="form-group">
              <label class="form-label">Nombre Completo</label>
              <input type="text" [(ngModel)]="newUser.name" name="name" required class="form-control text-xs" />
            </div>
            <div class="form-group">
              <label class="form-label">Correo Electrónico</label>
              <input type="email" [(ngModel)]="newUser.email" name="email" required class="form-control text-xs" />
            </div>
            <div class="form-group">
              <label class="form-label">Contraseña</label>
              <input type="password" [(ngModel)]="newUser.password" name="password" required placeholder="••••••••••••" class="form-control text-xs font-mono" />
            </div>
            <div class="form-group">
              <label class="form-label">Rol del Sistema</label>
              <select [(ngModel)]="newUser.role" name="role" required class="form-select text-xs">
                <option value="ADMIN">ADMIN (Acceso Total)</option>
                <option value="OPERATOR">OPERATOR (Operaciones y Sincronizaciones)</option>
                <option value="VIEWER">VIEWER (Solo Consulta)</option>
              </select>
            </div>
          </div>
          <div class="modal-footer">
            <button type="button" (click)="showCreateModal.set(false)" class="btn btn-secondary btn-sm">Cancelar</button>
            <button type="submit" class="btn btn-primary btn-sm">Crear Usuario</button>
          </div>
        </form>
      </div>
    </div>

    <!-- Change Password Modal -->
    <div *ngIf="showPassModal()" class="modal-overlay">
      <div class="modal-container max-w-md">
        <div class="modal-header">
          <h3 class="text-sm font-bold text-slate-100">Actualizar Contraseña</h3>
          <button (click)="showPassModal.set(false)" class="text-slate-400 hover:text-slate-200">✕</button>
        </div>
        <form (ngSubmit)="changePassword()">
          <div class="modal-body space-y-3.5">
            <div class="form-group">
              <label class="form-label">Contraseña Actual</label>
              <input type="password" [(ngModel)]="oldPassword" name="oldPass" required class="form-control text-xs font-mono" />
            </div>
            <div class="form-group">
              <label class="form-label">Nueva Contraseña (mínimo 6 caracteres)</label>
              <input type="password" [(ngModel)]="newPassword" name="newPass" required class="form-control text-xs font-mono" />
            </div>
          </div>
          <div class="modal-footer">
            <button type="button" (click)="showPassModal.set(false)" class="btn btn-secondary btn-sm">Cancelar</button>
            <button type="submit" class="btn btn-primary btn-sm">Actualizar</button>
          </div>
        </form>
      </div>
    </div>
  `
})
export class UsersComponent implements OnInit {
  private api = inject(ApiService);
  private toast = inject(ToastService);
  auth = inject(AuthService);

  users = signal<User[]>([]);
  showCreateModal = signal(false);
  showPassModal = signal(false);

  newUser: any = { role: 'OPERATOR' };
  oldPassword = '';
  newPassword = '';

  ngOnInit() {
    this.loadUsers();
  }

  loadUsers() {
    this.api.getUsers().subscribe({
      next: res => this.users.set(res || []),
      error: () => this.toast.error('Error al cargar lista de usuarios')
    });
  }

  createUser() {
    this.api.createUser(this.newUser).subscribe({
      next: () => {
        this.toast.success('Usuario registrado exitosamente');
        this.showCreateModal.set(false);
        this.newUser = { role: 'OPERATOR' };
        this.loadUsers();
      },
      error: err => this.toast.error(err.error?.error || 'Error al crear usuario')
    });
  }

  changePassword() {
    this.auth.changePassword(this.oldPassword, this.newPassword).subscribe({
      next: () => {
        this.toast.success('Contraseña actualizada correctamente');
        this.showPassModal.set(false);
        this.oldPassword = '';
        this.newPassword = '';
      },
      error: err => this.toast.error(err.error?.error || 'Error al cambiar contraseña')
    });
  }
}
