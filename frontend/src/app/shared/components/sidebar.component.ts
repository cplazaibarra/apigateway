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
      <!-- Profile Header matching reference image -->
      <div class="sidebar-profile">
        <div class="avatar-outer-circle">
          <div class="avatar-inner-circle">
            <svg class="avatar-svg" viewBox="0 0 24 24">
              <path d="M12 12c2.21 0 4-1.79 4-4s-1.79-4-4-4-4 1.79-4 4 1.79 4 4 4zm0 2c-2.67 0-8 1.34-8 4v2h16v-2c0-2.66-5.33-4-8-4z"/>
            </svg>
          </div>
        </div>

        <div class="profile-name">
          {{ authService.currentUser()?.name || 'ADMIN PRINCIPAL' }}
        </div>
        <div class="profile-email">
          {{ authService.currentUser()?.email || 'admin@orderhub.local' }}
        </div>
      </div>

      <!-- Navigation Menu -->
      <nav class="sidebar-nav">
        <a routerLink="/dashboard" routerLinkActive="active" class="nav-link">
          <span class="nav-icon">📊</span>
          <span>home / dashboard</span>
        </a>

        <a routerLink="/customers" routerLinkActive="active" class="nav-link">
          <span class="nav-icon">📁</span>
          <span>file / clientes</span>
        </a>

        <a routerLink="/integrations" routerLinkActive="active" class="nav-link">
          <span class="nav-icon">🔌</span>
          <span>integraciones</span>
        </a>

        <a routerLink="/orders" routerLinkActive="active" class="nav-link">
          <span class="nav-icon">📦</span>
          <span>pedidos estandarizados</span>
        </a>

        <a routerLink="/sync-jobs" routerLinkActive="active" class="nav-link">
          <span class="nav-icon">🔄</span>
          <span>ejecuciones</span>
        </a>

        <a routerLink="/logs" routerLinkActive="active" class="nav-link">
          <span class="nav-icon">✉️</span>
          <span>messages / logs</span>
        </a>

        <a routerLink="/notifications" routerLinkActive="active" class="nav-link">
          <span class="nav-icon">🔔</span>
          <span>notification</span>
        </a>

        <a routerLink="/statistics" routerLinkActive="active" class="nav-link">
          <span class="nav-icon">📈</span>
          <span>graph / métricas</span>
        </a>

        <a routerLink="/scheduler" routerLinkActive="active" class="nav-link">
          <span class="nav-icon">⏱️</span>
          <span>scheduler</span>
        </a>

        <a routerLink="/alerts" routerLinkActive="active" class="nav-link">
          <span class="nav-icon">🚨</span>
          <span>alertas</span>
        </a>

        <a routerLink="/smtp" routerLinkActive="active" class="nav-link">
          <span class="nav-icon">⚙️</span>
          <span>correo smtp</span>
        </a>

        <a routerLink="/audit" routerLinkActive="active" class="nav-link">
          <span class="nav-icon">🛡️</span>
          <span>auditoría</span>
        </a>

        <a *ngIf="authService.isAdmin()" routerLink="/users" routerLinkActive="active" class="nav-link">
          <span class="nav-icon">👥</span>
          <span>usuarios</span>
        </a>
      </nav>

      <!-- Footer -->
      <div class="sidebar-footer">
        <div style="display: flex; align-items: center; gap: 8px;">
          <span class="status-dot active"></span>
          <span>Gateway Activo</span>
        </div>
        <span style="font-family: monospace; font-size: 11px;">v1.0.0</span>
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
