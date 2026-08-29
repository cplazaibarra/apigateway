import { Component, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterOutlet } from '@angular/router';
import { SidebarComponent } from './shared/components/sidebar.component';
import { HeaderComponent } from './shared/components/header.component';
import { ToastComponent } from './shared/components/toast.component';
import { AuthService } from './core/services/auth.service';

@Component({
  selector: 'app-root',
  standalone: true,
  imports: [CommonModule, RouterOutlet, SidebarComponent, HeaderComponent, ToastComponent],
  template: `
    <ng-container *ngIf="authService.isAuthenticated(); else unauthenticated">
      <div class="app-container">
        <!-- Sidebar Navigation -->
        <app-sidebar></app-sidebar>

        <!-- Main Content Area -->
        <div class="main-content">
          <app-header></app-header>
          <main class="flex-1">
            <router-outlet></router-outlet>
          </main>
        </div>
      </div>
    </ng-container>

    <ng-template #unauthenticated>
      <router-outlet></router-outlet>
    </ng-template>

    <!-- Global Toast Center -->
    <app-toast></app-toast>
  `
})
export class AppComponent {
  authService = inject(AuthService);
}
