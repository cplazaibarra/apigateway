import { Routes } from '@angular/router';
import { authGuard } from './core/guards/auth.guard';
import { roleGuard } from './core/guards/role.guard';

export const routes: Routes = [
  {
    path: 'login',
    loadComponent: () => import('./features/login/login.component').then(m => m.LoginComponent)
  },
  {
    path: '',
    canActivate: [authGuard],
    children: [
      {
        path: '',
        redirectTo: 'dashboard',
        pathMatch: 'full'
      },
      {
        path: 'dashboard',
        loadComponent: () => import('./features/dashboard/dashboard.component').then(m => m.DashboardComponent)
      },
      {
        path: 'customers',
        loadComponent: () => import('./features/customers/customers.component').then(m => m.CustomersComponent)
      },
      {
        path: 'integrations',
        loadComponent: () => import('./features/integrations/integrations.component').then(m => m.IntegrationsComponent)
      },
      {
        path: 'orders',
        loadComponent: () => import('./features/orders/orders.component').then(m => m.OrdersComponent)
      },
      {
        path: 'sync-jobs',
        loadComponent: () => import('./features/sync-jobs/sync-jobs.component').then(m => m.SyncJobsComponent)
      },
      {
        path: 'logs',
        loadComponent: () => import('./features/logs/logs.component').then(m => m.LogsComponent)
      },
      {
        path: 'statistics',
        loadComponent: () => import('./features/statistics/statistics.component').then(m => m.StatisticsComponent)
      },
      {
        path: 'scheduler',
        loadComponent: () => import('./features/scheduler/scheduler.component').then(m => m.SchedulerComponent)
      },
      {
        path: 'alerts',
        loadComponent: () => import('./features/alerts/alerts.component').then(m => m.AlertsComponent)
      },
      {
        path: 'notifications',
        loadComponent: () => import('./features/notifications/notifications.component').then(m => m.NotificationsComponent)
      },
      {
        path: 'smtp',
        loadComponent: () => import('./features/smtp/smtp.component').then(m => m.SmtpComponent)
      },
      {
        path: 'audit',
        loadComponent: () => import('./features/audit/audit.component').then(m => m.AuditComponent)
      },
      {
        path: 'users',
        canActivate: [roleGuard(['ADMIN'])],
        loadComponent: () => import('./features/users/users.component').then(m => m.UsersComponent)
      }
    ]
  },
  {
    path: '**',
    redirectTo: 'dashboard'
  }
];
