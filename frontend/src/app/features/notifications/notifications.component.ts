import { Component, inject, signal, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ApiService } from '../../core/services/api.service';
import { ToastService } from '../../core/services/toast.service';
import { Notification } from '../../core/models/types';

@Component({
  selector: 'app-notifications',
  standalone: true,
  imports: [CommonModule],
  template: `
    <div class="page-body space-y-6">
      <!-- Title Bar -->
      <div class="flex items-center justify-between">
        <div>
          <h2 class="text-xl font-bold text-slate-100 flex items-center gap-2">
            <span>📬</span> Centro de Notificaciones Internas
          </h2>
          <p class="text-xs text-slate-400 mt-0.5">Avisos en tiempo real, alertas de sincronización y eventos generados por el hub</p>
        </div>

        <div class="flex items-center gap-2">
          <button (click)="markAllAsRead()" class="btn btn-secondary btn-sm text-xs">
            ✓ Marcar Todas como Leídas
          </button>
          <button (click)="loadNotifications()" class="btn btn-primary btn-sm flex items-center gap-1.5 text-xs">
            <span>🔄</span> Refrescar
          </button>
        </div>
      </div>

      <!-- Notifications List -->
      <div class="card bg-slate-900 border-slate-800 p-0 overflow-hidden">
        <div class="divide-y divide-slate-800">
          <div *ngFor="let n of notifications()" class="p-4 flex items-start justify-between gap-4 transition-colors hover:bg-slate-800/40"
               [ngClass]="{'bg-indigo-950/20': !n.is_read}">
            <div class="flex items-start gap-3">
              <div class="mt-0.5 text-base">
                <span *ngIf="n.severity === 'ERROR' || n.severity === 'CRITICAL'">🚨</span>
                <span *ngIf="n.severity === 'WARNING'">⚠️</span>
                <span *ngIf="n.severity === 'INFO'">ℹ️</span>
              </div>
              <div>
                <div class="flex items-center gap-2">
                  <h4 class="text-xs font-bold text-slate-200" [class.text-indigo-400]="!n.is_read">{{ n.title }}</h4>
                  <span class="badge text-[10px]" [class.badge-danger]="n.severity === 'ERROR' || n.severity === 'CRITICAL'"
                        [class.badge-warning]="n.severity === 'WARNING'" [class.badge-info]="n.severity === 'INFO'">
                    {{ n.severity }}
                  </span>
                  <span *ngIf="!n.is_read" class="w-2 h-2 rounded-full bg-indigo-500"></span>
                </div>
                <p class="text-xs text-slate-300 mt-1">{{ n.message }}</p>
                <div class="text-[10px] text-slate-500 font-mono mt-1.5 flex items-center gap-2">
                  <span>{{ n.created_at | date:'dd/MM/yyyy HH:mm:ss' }}</span>
                  <span *ngIf="n.integration_name">| Integración: {{ n.integration_name }}</span>
                </div>
              </div>
            </div>

            <div *ngIf="!n.is_read">
              <button (click)="markAsRead(n)" class="btn btn-secondary btn-sm text-[11px] py-1">
                Marcar leída
              </button>
            </div>
          </div>

          <div *ngIf="notifications().length === 0" class="p-8 text-center text-xs text-slate-500">
            No hay notificaciones en la bandeja
          </div>
        </div>
      </div>
    </div>
  `
})
export class NotificationsComponent implements OnInit {
  private api = inject(ApiService);
  private toast = inject(ToastService);

  notifications = signal<Notification[]>([]);

  ngOnInit() {
    this.loadNotifications();
  }

  loadNotifications() {
    this.api.getNotifications().subscribe({
      next: res => this.notifications.set(res.notifications || []),
      error: () => this.toast.error('Error al cargar notificaciones')
    });
  }

  markAsRead(n: Notification) {
    this.api.markNotificationRead(n.id).subscribe({
      next: () => {
        n.is_read = true;
        this.toast.info('Notificación marcada como leída');
      },
      error: () => this.toast.error('Error al marcar notificación')
    });
  }

  markAllAsRead() {
    this.api.markAllNotificationsRead().subscribe({
      next: () => {
        this.notifications.update(list => list.map(item => ({ ...item, is_read: true })));
        this.toast.success('Todas las notificaciones marcadas como leídas');
      },
      error: () => this.toast.error('Error al marcar notificaciones')
    });
  }
}
