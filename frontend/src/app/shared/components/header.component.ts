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
      <!-- Search Input matching Consist style -->
      <div class="flex items-center gap-3 w-96">
        <div class="relative w-full">
          <span class="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-slate-400 text-sm">
            🔍
          </span>
          <input type="text"
                 placeholder="Search anything here..."
                 class="form-control pl-9 pr-4 py-2 text-xs bg-slate-50 border-slate-200 text-slate-800 placeholder-slate-400 rounded-xl w-full focus:bg-white focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500 transition" />
        </div>
      </div>

      <!-- Right controls matching Consist style -->
      <div class="flex items-center gap-3">
        <!-- Quick Action Icons -->
        <button class="w-9 h-9 rounded-xl border border-slate-200 flex items-center justify-center text-slate-500 hover:bg-slate-50 transition text-sm" title="Export data">
          📥
        </button>

        <button class="w-9 h-9 rounded-xl border border-slate-200 flex items-center justify-center text-slate-500 hover:bg-slate-50 transition text-sm" title="Fast Sync">
          🚀
        </button>

        <!-- Notifications Bell Button -->
        <div class="relative">
          <button (click)="toggleNotifications()" class="w-9 h-9 rounded-xl border border-slate-200 flex items-center justify-center text-slate-500 hover:bg-slate-50 transition text-sm relative" title="Notifications">
            🔔
            <span *ngIf="unreadCount() > 0" class="absolute -top-1 -right-1 bg-emerald-500 text-white text-[10px] font-bold px-1.5 py-0.2 rounded-full ring-2 ring-white">
              {{ unreadCount() }}
            </span>
          </button>

          <!-- Notifications Dropdown -->
          <div *ngIf="showNotifications()" class="absolute right-0 mt-2 w-80 bg-white border border-slate-200 rounded-2xl shadow-xl z-50 overflow-hidden">
            <div class="p-3.5 border-b border-slate-100 flex items-center justify-between bg-slate-50/80">
              <span class="text-xs font-bold uppercase text-slate-600">Notifications ({{ unreadCount() }})</span>
              <button (click)="markAllAsRead()" class="text-xs text-emerald-600 font-semibold hover:underline bg-transparent border-0 cursor-pointer">Mark read</button>
            </div>
            <div class="max-h-60 overflow-y-auto">
              <div *ngFor="let n of notifications()" (click)="markAsRead(n)" class="p-3 border-b border-slate-100 cursor-pointer hover:bg-slate-50 transition" [class.bg-emerald-50]="!n.is_read">
                <div class="flex items-center justify-between mb-1">
                  <span class="text-xs font-semibold text-slate-800">{{ n.title }}</span>
                  <span class="text-[10px] text-slate-400">{{ n.created_at | date:'shortTime' }}</span>
                </div>
                <p class="text-[11px] text-slate-600 m-0 leading-relaxed">{{ n.message }}</p>
              </div>
              <div *ngIf="notifications().length === 0" class="p-6 text-center text-xs text-slate-400">
                No new notifications
              </div>
            </div>
            <div class="p-2.5 border-t border-slate-100 bg-slate-50 text-center">
              <a routerLink="/notifications" (click)="showNotifications.set(false)" class="text-xs text-emerald-700 font-semibold no-underline hover:underline">View all alerts</a>
            </div>
          </div>
        </div>

        <!-- User Profile Pill matching reference -->
        <div class="flex items-center gap-2.5 pl-3 border-l border-slate-200">
          <div class="w-9 h-9 rounded-full bg-amber-500 text-white flex items-center justify-center font-bold text-sm shadow-sm">
            😊
          </div>
          <div class="hidden sm:block text-left">
            <div class="text-xs font-bold text-slate-800 leading-tight">{{ authService.currentUser()?.name || 'Administrator' }}</div>
            <div class="text-[10px] text-emerald-600 font-medium">● Online</div>
          </div>
          <button (click)="authService.logout()" class="text-slate-400 hover:text-red-500 ml-1 text-xs border-0 bg-transparent cursor-pointer p-1" title="Sign Out">
            ✕
          </button>
        </div>
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
