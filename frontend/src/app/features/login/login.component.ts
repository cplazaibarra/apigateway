import { Component, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { AuthService } from '../../core/services/auth.service';
import { ToastService } from '../../core/services/toast.service';

@Component({
  selector: 'app-login',
  standalone: true,
  imports: [CommonModule, FormsModule],
  template: `
    <div class="min-h-screen bg-slate-950 flex items-center justify-center p-4">
      <div class="w-full max-w-md bg-slate-900 border border-slate-800 rounded-2xl p-8 shadow-2xl relative overflow-hidden">
        <!-- Background decorative gradient glow -->
        <div class="absolute -top-24 -left-24 w-48 h-48 bg-indigo-500/20 rounded-full blur-3xl pointer-events-none"></div>
        <div class="absolute -bottom-24 -right-24 w-48 h-48 bg-pink-500/20 rounded-full blur-3xl pointer-events-none"></div>

        <div class="text-center mb-8 relative">
          <div class="w-12 h-12 rounded-xl bg-gradient-to-tr from-indigo-600 to-violet-500 flex items-center justify-center text-white font-bold text-2xl mx-auto shadow-lg shadow-indigo-500/30 mb-3">
            ⚡
          </div>
          <h1 class="text-xl font-bold text-slate-100">Order Integration Hub</h1>
          <p class="text-xs text-slate-400 mt-1">Portal Administrativo & Operaciones NOC</p>
        </div>

        <form (ngSubmit)="onSubmit()" class="space-y-4 relative">
          <div class="form-group">
            <label class="form-label">Correo Electrónico</label>
            <input type="email" [(ngModel)]="email" name="email" required placeholder="usuario@orderhub.local" class="form-control" />
          </div>

          <div class="form-group">
            <label class="form-label">Contraseña</label>
            <input type="password" [(ngModel)]="password" name="password" required placeholder="••••••••••••" class="form-control" />
          </div>

          <button type="submit" [disabled]="loading()" class="btn btn-primary w-full py-2.5 mt-2 font-semibold">
            <span *ngIf="loading()">Autenticando...</span>
            <span *ngIf="!loading()">Iniciar Sesión</span>
          </button>
        </form>

        <!-- Quick Demo Credentials -->
        <div class="mt-8 pt-6 border-t border-slate-800/80">
          <span class="text-[11px] font-semibold uppercase tracking-wider text-slate-500 block mb-3 text-center">Acceso Rápido de Demostración</span>
          <div class="grid grid-cols-3 gap-2">
            <button (click)="fillDemo('admin@orderhub.local', 'Admin123!')" class="btn btn-secondary btn-sm text-[11px] flex-col py-2">
              <span class="font-bold text-indigo-400">ADMIN</span>
              <span class="text-[10px] text-slate-500">Acceso Total</span>
            </button>
            <button (click)="fillDemo('operator@orderhub.local', 'Operator123!')" class="btn btn-secondary btn-sm text-[11px] flex-col py-2">
              <span class="font-bold text-emerald-400">OPERATOR</span>
              <span class="text-[10px] text-slate-500">NOC / Sync</span>
            </button>
            <button (click)="fillDemo('viewer@orderhub.local', 'Viewer123!')" class="btn btn-secondary btn-sm text-[11px] flex-col py-2">
              <span class="font-bold text-amber-400">VIEWER</span>
              <span class="text-[10px] text-slate-500">Solo Lectura</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  `
})
export class LoginComponent {
  authService = inject(AuthService);
  toast = inject(ToastService);
  router = inject(Router);

  email = 'admin@orderhub.local';
  password = 'Admin123!';
  loading = signal(false);

  fillDemo(email: string, pass: string) {
    this.email = email;
    this.password = pass;
    this.onSubmit();
  }

  onSubmit() {
    if (!this.email || !this.password) {
      this.toast.error('Ingrese correo y contraseña');
      return;
    }

    this.loading.set(true);
    this.authService.login(this.email, this.password).subscribe({
      next: () => {
        this.loading.set(false);
        this.toast.success('Bienvenido a Order Integration Hub');
        this.router.navigate(['/dashboard']);
      },
      error: err => {
        this.loading.set(false);
        this.toast.error(err.error?.error || 'Credenciales inválidas');
      }
    });
  }
}
