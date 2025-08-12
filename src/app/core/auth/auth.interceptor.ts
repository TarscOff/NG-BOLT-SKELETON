// core/auth/auth.interceptor.ts
import { HttpInterceptorFn } from '@angular/common/http';
import { keycloak } from '../services/keycloak.service';

// Optionally skip auth for some URLs:
const isPublic = (url: string) => url.startsWith('/assets/') || url.includes('/public/');

export const authInterceptor: HttpInterceptorFn = (req, next) => {
  if (isPublic(req.url)) return next(req);

  const kc = keycloak();
  const token = kc?.token;
  if (!token) return next(req);

  return next(req.clone({ setHeaders: { Authorization: `Bearer ${token}` } }));
};