import { HttpInterceptorFn } from '@angular/common/http';
import { keycloak } from '../services/keycloak.service';

export const authInterceptor: HttpInterceptorFn = (req, next) => {
  const kc = keycloak();
  const token = kc?.token;
  if (!token) return next(req);
  return next(req.clone({ setHeaders: { Authorization: `Bearer ${token}` } }));
};
