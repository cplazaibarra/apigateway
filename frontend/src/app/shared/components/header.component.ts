import { Component, inject, signal, OnInit, OnDestroy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterLink } from '@angular/router';
import { AuthService } from '../../core/services/auth.service';
import { ApiService } from '../../core/services/api.service';
import { Notification } from '../../core/models/types';
import { ToastService } from '../../core/services/toast.service';

@Component({
  selector: 'app-header',
  standalone: true,
  imports: [CommonModule, RouterLink],
  template: `
    <header class="header-bar">
      <!-- Title according to image -->
      <div style="display: flex; align-items: baseline; gap: 12px;">
        <h1 style="font-size: 1.5rem; font-weight: 400; color: #1e293b; letter-spacing: -0.02em;">
          Dashboard <span style="font-weight: 700;">User</span>
        </h1>
        <span style="font-size: 0.75rem; color: #10b981; font-weight: 600; display: inline-flex; align-items: center; gap: 6px;">
          <span class="status-dot active"></span> Online
        </span>
      </div>

      <!-- Right controls: Notifications, status & hamburger -->
      <div style="display: flex; align-items: center; gap: 16px;">
        <!-- Notifications Bell Button -->
        <div style="position: relative;">
          <button (click)="toggleNotifications()" class="btn btn-secondary" style="padding: 8px 12px; position: relative; border-radius: 8px;">
            🔔
            <span *ngIf="unreadCount() > 0" style="position: absolute; top: -4px; right: -4px; background-color: #f59e0b; color: white; font-size: 10px; font-weight: bold; padding: 1px 5px; border-radius: 10px; border: 2px solid white;">
              {{ unreadCount() }}
            </span>
          </button>

          <!-- Notifications Dropdown -->
          <div *ngIf="showNotifications()" style="position: absolute; right: 0; margin-top: 8px; width: 320px; background: white; border: 1px solid #e2e8f0; border-radius: 12px; box-shadow: 0 20px 25px -5px rgba(0,0,0,0.1); z-index: 50; overflow: hidden;">
            <div style="padding: 12px 16px; border-bottom: 1px solid #f1f5f9; display: flex; align-items: center; justify-content: space-between; background-color: #f8fafc;">
              <span style="font-size: 11px; font-weight: bold; text-transform: uppercase; color: #64748b;">Notificaciones ({{ unreadCount() }})</span>
              <button (click)="markAllAsRead()" style="font-size: 11px; color: #f59e0b; font-weight: 600; background: none; border: none; cursor: pointer;">Marcar leídas</button>
            </div>
            <div style="max-height: 250px; overflow-y: auto;">
              <div *ngFor="let n of notifications()" (click)="markAsRead(n)" style="padding: 12px 16px; border-bottom: 1px solid #f1f5f9; cursor: pointer; transition: background 0.15s;" [style.background-color]="!n.is_read ? '#fffbeb' : 'white'">
                <div style="display: flex; align-items: center; justify-content: space-between; margin-bottom: 4px;">
                  <span style="font-size: 12px; font-weight: 600; color: #1e293b;">{{ n.title }}</span>
                  <span style="font-size: 10px; color: #94a3b8;">{{ n.created_at | date:'shortTime' }}</span>
                </div>
                <p style="font-size: 11px; color: #64748b; margin: 0; line-height: 1.4;">{{ n.message }}</p>
              </div>
              <div *ngIf="notifications().length === 0" style="padding: 24px; text-align: center; font-size: 12px; color: #94a3b8;">
                No hay notificaciones
              </div>
            </div>
            <div style="padding: 8px; border-top: 1px solid #f1f5f9; background-color: #f8fafc; text-align: center;">
              <a routerLink="/notifications" (click)="showNotifications.set(false)" style="font-size: 11px; color: #1e293b; font-weight: 600; text-decoration: none;">Ver todas las alertas</a>
            </div>
          </div>
        </div>

        <!-- Right Hamburger / Logout Icon -->
        <button (click)="authService.logout()" title="Cerrar sesión" class="btn btn-secondary" style="padding: 8px 14px; border-radius: 8px; font-weight: 600;">
          <span>☰</span>
          <span style="font-size: 12px;">Salir</span>
        </button>
      </div>
    </header>
  `,
  styles: [`
    :host {
      display: block;
    }
  `]
})
export class HeaderComponent implements OnInit, OnDestroy {
  authService = inject(AuthService);
  apiService = inject(ApiService);
  toast = inject(ToastService);

  showNotifications = signal(false);
  notifications = signal<Notification[]>([]);
  unreadCount = signal(0);
  private intervalId: any;

  ngOnInit() {
    this.loadNotifications();
    this.intervalId = setInterval(() => this.loadNotifications(), 15000);
  }

  ngOnDestroy() {
    if (this.intervalId) clearInterval(this.intervalId);
  }

  loadNotifications() {
    this.apiService.getNotifications().subscribe({
      next: res => {
        this.notifications.set(res.notifications || []);
        this.unreadCount.set(res.unread_count || 0);
      },
      error: () => {}
    });
  }

  toggleNotifications() {
    this.showNotifications.update(v => !v);
  }

  markAsRead(n: Notification) {
    if (n.is_read) return;
    this.apiService.markNotificationRead(n.id).subscribe({
      next: () => {
        n.is_read = true;
        this.unreadCount.update(c => Math.max(0, c - 1));
      }
    });
  }

  markAllAsRead() {
    this.apiService.markAllNotificationsRead().subscribe({
      next: () => {
        this.notifications.update(list => list.map(item => ({ ...item, is_read: true })));
        this.unreadCount.set(0);
        this.toast.info('Todas las notificaciones marcadas como leídas');
      }
    });
  }
}
