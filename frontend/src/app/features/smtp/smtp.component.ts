import { Component, inject, signal, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ApiService } from '../../core/services/api.service';
import { ToastService } from '../../core/services/toast.service';
import { AuthService } from '../../core/services/auth.service';
import { SMTPConfig } from '../../core/models/types';

@Component({
  selector: 'app-smtp',
  standalone: true,
  imports: [CommonModule, FormsModule],
  template: `
    <div class="page-body space-y-6 max-w-4xl">
      <!-- Title -->
      <div class="flex items-center justify-between">
        <div>
          <h2 class="text-xl font-bold text-slate-100 flex items-center gap-2">
            <span>✉️</span> Configuración de Servidor de Correo (SMTP)
          </h2>
          <p class="text-xs text-slate-400 mt-0.5">Parámetros de conexión para el envío de alertas operacionales e informes diarios</p>
        </div>

        <button *ngIf="auth.isOperator()" (click)="showTestModal.set(true)" class="btn btn-secondary btn-sm flex items-center gap-1.5">
          <span>📨</span> Enviar Correo de Prueba
        </button>
      </div>

      <!-- SMTP Settings Form -->
      <div class="card bg-slate-900 border-slate-800 p-6">
        <form (ngSubmit)="saveConfig()">
          <div class="space-y-4">
            <div class="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div class="md:col-span-2 form-group">
                <label class="form-label">Servidor SMTP Host</label>
                <input type="text" [(ngModel)]="config.host" name="host" required placeholder="smtp.ejemplo.com" class="form-control text-xs font-mono" />
              </div>
              <div class="form-group">
                <label class="form-label">Puerto SMTP</label>
                <input type="number" [(ngModel)]="config.port" name="port" required placeholder="587" class="form-control text-xs font-mono" />
              </div>
            </div>

            <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div class="form-group">
                <label class="form-label">Usuario SMTP / Auth User</label>
                <input type="text" [(ngModel)]="config.username" name="username" class="form-control text-xs font-mono" />
              </div>
              <div class="form-group">
                <label class="form-label">Contraseña SMTP (Cifrada)</label>
                <input type="password" [(ngModel)]="config.password" name="password" placeholder="••••••••••••" class="form-control text-xs font-mono" />
                <span class="text-[10px] text-slate-500 mt-0.5 block" *ngIf="config.has_password">
                  ✓ Contraseña guardada en servidor. Deje en blanco o use puntos para conservarla.
                </span>
              </div>
            </div>

            <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div class="form-group">
                <label class="form-label">Dirección de Remitente (From Address)</label>
                <input type="email" [(ngModel)]="config.from_address" name="from_address" required placeholder="alertas@orderhub.local" class="form-control text-xs" />
              </div>
              <div class="form-group">
                <label class="form-label">Nombre del Remitente (From Name)</label>
                <input type="text" [(ngModel)]="config.from_name" name="from_name" required placeholder="Order Integration Hub NOC" class="form-control text-xs" />
              </div>
            </div>

            <div class="flex items-center gap-2 pt-2 border-t border-slate-800">
              <input type="checkbox" [(ngModel)]="config.use_tls" name="use_tls" id="useTLS" class="rounded border-slate-700 bg-slate-900 text-indigo-600 focus:ring-indigo-500" />
              <label for="useTLS" class="text-xs text-slate-300">Utilizar cifrado TLS / STARTTLS obligatorio</label>
            </div>

            <div *ngIf="auth.isAdmin()" class="pt-4 flex justify-end">
              <button type="submit" class="btn btn-primary btn-sm px-5">
                💾 Guardar Configuración SMTP
              </button>
            </div>
          </div>
        </form>
      </div>
    </div>

    <!-- Send Test Email Modal -->
    <div *ngIf="showTestModal()" class="modal-overlay">
      <div class="modal-container max-w-md">
        <div class="modal-header">
          <h3 class="text-sm font-bold text-slate-100 flex items-center gap-2">
            <span>📨</span> Enviar Correo de Prueba
          </h3>
          <button (click)="showTestModal.set(false)" class="text-slate-400 hover:text-slate-200">✕</button>
        </div>
        <form (ngSubmit)="sendTest()">
          <div class="modal-body space-y-3.5">
            <p class="text-xs text-slate-400">
              El sistema despachará un mensaje de diagnóstico a la dirección indicada para verificar la conectividad y autenticación con el servidor SMTP.
            </p>
            <div class="form-group">
              <label class="form-label">Dirección Destino</label>
              <input type="email" [(ngModel)]="testTargetEmail" name="testTarget" required placeholder="operaciones@orderhub.local" class="form-control text-xs" />
            </div>
          </div>
          <div class="modal-footer">
            <button type="button" (click)="showTestModal.set(false)" class="btn btn-secondary btn-sm">Cancelar</button>
            <button type="submit" [disabled]="testingEmail()" class="btn btn-primary btn-sm">
              <span *ngIf="testingEmail()">Enviando...</span>
              <span *ngIf="!testingEmail()">Enviar Ahora</span>
            </button>
          </div>
        </form>
      </div>
    </div>
  `
})
export class SmtpComponent implements OnInit {
  private api = inject(ApiService);
  private toast = inject(ToastService);
  auth = inject(AuthService);

  config: Partial<SMTPConfig> = {};
  showTestModal = signal(false);
  testingEmail = signal(false);
  testTargetEmail = '';

  ngOnInit() {
    this.loadConfig();
  }

  loadConfig() {
    this.api.getSMTPConfig().subscribe({
      next: res => {
        this.config = res;
        this.testTargetEmail = res.from_address || 'operaciones@orderhub.local';
      },
      error: () => this.toast.error('Error al cargar configuración SMTP')
    });
  }

  saveConfig() {
    this.api.updateSMTPConfig(this.config).subscribe({
      next: res => {
        this.config = res;
        this.toast.success('Configuración SMTP guardada exitosamente');
      },
      error: err => this.toast.error(err.error?.error || 'Error al guardar configuración')
    });
  }

  sendTest() {
    this.testingEmail.set(true);
    this.api.sendTestEmail(this.testTargetEmail).subscribe({
      next: res => {
        this.testingEmail.set(false);
        this.showTestModal.set(false);
        if (res.success) {
          this.toast.success(res.message);
        } else {
          this.toast.error(res.message);
        }
      },
      error: err => {
        this.testingEmail.set(false);
        this.toast.error(err.error?.error || 'Fallo en el despacho del correo de prueba');
      }
    });
  }
}
