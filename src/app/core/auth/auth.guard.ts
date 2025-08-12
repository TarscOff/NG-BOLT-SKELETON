import { CanActivateFn } from '@angular/router';
import { keycloak } from '../services/keycloak.service';

export const authGuard: CanActivateFn = () => {
  const kc = keycloak();
  if (kc?.authenticated) return true;
  kc?.login(); // full-page redirect
  return false;
};