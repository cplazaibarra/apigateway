import { Component, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterLink, RouterLinkActive } from '@angular/router';
import { AuthService } from '../../core/services/auth.service';

@Component({
  selector: 'app-sidebar',
  standalone: true,
  imports: [CommonModule, RouterLink, RouterLinkActive],
  template: `
    <aside class="sidebar-wrapper">
      <!-- Brand Logo matching Consist reference -->
      <div class="sidebar-brand">
        <div class="sidebar-logo-icon">
          <svg class="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
            <path d="M4 15s1-1 4-1 5 2 8 2 4-1 4-1V3s-1 1-4 1-5-2-8-2-4 1-4 1z"></path>
            <line x1="4" y1="22" x2="4" y2="15"></line>
          </svg>
        </div>
        <div class="sidebar-brand-name">
          Consist <span class="text-emerald-600">Hub</span>
        </div>
      </div>

      <!-- Navigation Menu -->
      <nav class="sidebar-nav">
        <div class="nav-section-label">MAIN MENU</div>

        <a routerLink="/dashboard" routerLinkActive="active" class="nav-link">
          <span class="nav-icon">📊</span>
          <span>Overview</span>
        </a>

        <a routerLink="/integrations" routerLinkActive="active" class="nav-link">
          <span class="nav-icon">🔌</span>
          <span>Integrations</span>
        </a>

        <a routerLink="/orders" routerLinkActive="active" class="nav-link">
          <span class="nav-icon">📦</span>
          <span>Orders & Hub</span>
        </a>

        <a routerLink="/customers" routerLinkActive="active" class="nav-link">
          <span class="nav-icon">🏢</span>
          <span>Customers</span>
        </a>

        <a routerLink="/statistics" routerLinkActive="active" class="nav-link">
          <span class="nav-icon">📈</span>
          <span>Performance</span>
        </a>

        <div class="nav-section-label">OPERATIONS</div>

        <a routerLink="/sync-jobs" routerLinkActive="active" class="nav-link">
          <span class="nav-icon">🔄</span>
          <span>Sync Executions</span>
        </a>

        <a routerLink="/logs" routerLinkActive="active" class="nav-link">
          <span class="nav-icon">✉️</span>
          <span>Messages & Logs</span>
        </a>

        <a routerLink="/notifications" routerLinkActive="active" class="nav-link">
          <span class="nav-icon">🔔</span>
          <span>Notifications</span>
        </a>

        <a routerLink="/scheduler" routerLinkActive="active" class="nav-link">
          <span class="nav-icon">⏱️</span>
          <span>Scheduler</span>
        </a>

        <a routerLink="/alerts" routerLinkActive="active" class="nav-link">
          <span class="nav-icon">🚨</span>
          <span>Alert Rules</span>
        </a>

        <a routerLink="/smtp" routerLinkActive="active" class="nav-link">
          <span class="nav-icon">⚙️</span>
          <span>SMTP Email</span>
        </a>

        <a routerLink="/audit" routerLinkActive="active" class="nav-link">
          <span class="nav-icon">🛡️</span>
          <span>Audit Trail</span>
        </a>

        <a *ngIf="authService.isAdmin()" routerLink="/users" routerLinkActive="active" class="nav-link">
          <span class="nav-icon">👥</span>
          <span>Users & Access</span>
        </a>
      </nav>

      <!-- Bottom Card Widget matching Consist reference -->
      <div class="sidebar-promo">
        <h5>Gateway Pro</h5>
        <p>Real-time order sync with multi-store monitoring</p>
        <button type="button" routerLink="/integrations">Manage Stores</button>
      </div>

      <!-- Footer status -->
      <div class="sidebar-footer">
        <div class="flex items-center gap-2">
          <span class="status-dot active"></span>
          <span class="text-xs font-semibold text-slate-700">Online Gateway</span>
        </div>
        <span class="font-mono text-[10px] text-slate-400">v2.0</span>
      </div>
    </aside>
  `,
  styles: [`
    :host {
      display: block;
    }
  `]
})
export class SidebarComponent {
  authService = inject(AuthService);
}
