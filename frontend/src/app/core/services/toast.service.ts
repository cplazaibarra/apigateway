import { Injectable, signal } from '@angular/core';

export interface ToastMessage {
  id: string;
  type: 'success' | 'error' | 'info' | 'warning';
  title?: string;
  message: string;
}

@Injectable({
  providedIn: 'root'
})
export class ToastService {
  messages = signal<ToastMessage[]>([]);

  show(type: 'success' | 'error' | 'info' | 'warning', message: string, title?: string) {
    const id = Math.random().toString(36).substring(2, 9);
    const item: ToastMessage = { id, type, message, title };
    this.messages.update(prev => [...prev, item]);

    setTimeout(() => {
      this.remove(id);
    }, 4500);
  }

  success(message: string, title: string = 'Éxito') {
    this.show('success', message, title);
  }

  error(message: string, title: string = 'Error') {
    this.show('error', message, title);
  }

  info(message: string, title: string = 'Información') {
    this.show('info', message, title);
  }

  remove(id: string) {
    this.messages.update(prev => prev.filter(m => m.id !== id));
  }
}
