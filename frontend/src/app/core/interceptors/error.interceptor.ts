import { HttpInterceptorFn, HttpErrorResponse } from '@angular/common/http';
import { inject } from '@angular/core';
import { catchError, throwError } from 'rxjs';
import { AuthService } from '../services/auth.service';
import { ToastService } from '../services/toast.service';

export const errorInterceptor: HttpInterceptorFn = (req, next) => {
  const authService = inject(AuthService);
  const toast = inject(ToastService);

  return next(req).pipe(
    catchError((error: HttpErrorResponse) => {
      let errMsg = 'Ocurrió un error inesperado';

      if (error.error && typeof error.error === 'object' && error.error.error) {
        errMsg = error.error.error;
      } else if (error.message) {
        errMsg = error.message;
      }

      if (error.status === 401 && !req.url.includes('/api/v1/auth/login')) {
        toast.error('Sesión expirada o no autorizada. Inicie sesión nuevamente.');
        authService.logout();
      } else if (error.status === 403) {
        toast.error('Acceso denegado: permisos insuficientes.');
      } else if (error.status >= 500) {
        toast.error(`Error del servidor: ${errMsg}`);
      }

      return throwError(() => error);
    })
  );
};
