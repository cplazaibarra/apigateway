import { Component, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ToastService } from '../../core/services/toast.service';

@Component({
  selector: 'app-toast',
  standalone: true,
  imports: [CommonModule],
  template: `
    <div class="toast-container">
      <div *ngFor="let m of toastService.messages()" 
           class="toast" 
           [class.toast-success]="m.type === 'success'"
           [class.toast-error]="m.type === 'error'"
           [class.toast-info]="m.type === 'info'"
           [class.toast-warning]="m.type === 'warning'">
        <div class="flex-1">
          <div *ngIf="m.title" class="font-semibold text-xs text-slate-200 mb-0.5">{{ m.title }}</div>
          <div class="text-xs text-slate-300">{{ m.message }}</div>
        </div>
        <button (click)="toastService.remove(m.id)" class="text-slate-400 hover:text-slate-200 text-xs px-1">✕</button>
      </div>
    </div>
  `
})
export class ToastComponent {
  toastService = inject(ToastService);
}
