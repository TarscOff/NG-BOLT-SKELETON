import { createReducer, on } from '@ngrx/store';
import { initialAuthState } from './auth.model';
import * as Auth from './auth.actions';

export const authReducer = createReducer(
  initialAuthState,
  on(Auth.loginSuccess, (s, a) => ({
    ...s,
    isAuthenticated: true,
    token: a.token,
    idToken: a.idToken,
    refreshToken: a.refreshToken,
    profile: a.profile,
    expiresAt: a.expiresAt
  })),
  on(Auth.tokenRefreshed, (s, a) => ({
    ...s,
    token: a.token,
    idToken: a.idToken,
    refreshToken: a.refreshToken,
    expiresAt: a.expiresAt
  })),
  on(Auth.logout, () => initialAuthState)
);
