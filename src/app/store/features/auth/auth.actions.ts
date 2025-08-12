import { createAction, props } from '@ngrx/store';
import { AuthProfile } from '../../../core/auth/keycloack.types';

export const hydrateFromKc = createAction('[Auth] Hydrate From Keycloak');

export const loginRedirect = createAction(
  '[Auth] Login Redirect',
  props<{ idpHint?: string }>() // broker IdP alias
);

export const loginSuccess = createAction(
  '[Auth] Login Success',
  props<{
    profile: AuthProfile | null;
    expiresAt: number;
  }>()
);

export const tokenRefreshed = createAction(
  '[Auth] Token Refreshed',
  props<{ expiresAt: number }>()
);

export const logout = createAction('[Auth] Logout');

export const authError = createAction('[Auth] Error', props<{ error: unknown }>());
