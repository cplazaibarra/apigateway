import { Injectable, signal, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Router } from '@angular/router';
import { Observable, tap } from 'rxjs';
import { User } from '../models/types';

export interface LoginResponse {
  token: string;
  expires_at: string;
  user: User;
}

@Injectable({
  providedIn: 'root'
})
export class AuthService {
  private http = inject(HttpClient);
  private router = inject(Router);

  private readonly TOKEN_KEY = 'oih_auth_token';
  private readonly USER_KEY = 'oih_auth_user';

  currentUser = signal<User | null>(this.getStoredUser());
  token = signal<string | null>(localStorage.getItem(this.TOKEN_KEY));

  isAuthenticated(): boolean {
    return !!this.token();
  }

  isAdmin(): boolean {
    return this.currentUser()?.role === 'ADMIN';
  }

  isOperator(): boolean {
    const role = this.currentUser()?.role;
    return role === 'ADMIN' || role === 'OPERATOR';
  }

  login(email: string, password: string): Observable<LoginResponse> {
    return this.http.post<LoginResponse>('/api/v1/auth/login', { email, password }).pipe(
      tap(res => {
        localStorage.setItem(this.TOKEN_KEY, res.token);
        localStorage.setItem(this.USER_KEY, JSON.stringify(res.user));
        this.token.set(res.token);
        this.currentUser.set(res.user);
      })
    );
  }

  logout(): void {
    localStorage.removeItem(this.TOKEN_KEY);
    localStorage.removeItem(this.USER_KEY);
    this.token.set(null);
    this.currentUser.set(null);
    this.router.navigate(['/login']);
  }

  changePassword(oldPass: string, newPass: string): Observable<any> {
    return this.http.post('/api/v1/auth/change-password', {
      old_password: oldPass,
      new_password: newPass
    });
  }

  refreshProfile(): Observable<User> {
    return this.http.get<User>('/api/v1/auth/me').pipe(
      tap(user => {
        localStorage.setItem(this.USER_KEY, JSON.stringify(user));
        this.currentUser.set(user);
      })
    );
  }

  private getStoredUser(): User | null {
    const data = localStorage.getItem(this.USER_KEY);
    if (!data) return null;
    try {
      return JSON.parse(data);
    } catch {
      return null;
    }
  }
}
