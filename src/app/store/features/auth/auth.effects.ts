import { inject } from '@angular/core';
import { Actions, createEffect, ofType } from '@ngrx/effects';
import { from, interval, of } from 'rxjs';
import { catchError, filter, map, mergeMap, tap } from 'rxjs/operators';
import * as Auth from './auth.actions';
import { keycloak } from '../../../core/services/keycloak.service';
import { AuthProfile } from '../../../core/auth/keycloack.types';

// 1) Hydrate store from Keycloak after APP_INITIALIZER
export const hydrateFromKc = createEffect(() => {
  const actions$ = inject(Actions);
  return actions$.pipe(
    ofType(Auth.hydrateFromKc),
    map(() => {
      const kc = keycloak();
      if (!kc.authenticated) return Auth.authError({ error: 'not_authenticated' });
      return Auth.loginSuccess({
        profile: (kc.tokenParsed as AuthProfile) || null,
        expiresAt: ((kc.tokenParsed?.exp as number) || 0) * 1000
      });
    })
  );
}, { functional: true });

// 2) Login redirect (supports broker IdP hint)
export const loginRedirect = createEffect(() => {
  const actions$ = inject(Actions);
  return actions$.pipe(
    ofType(Auth.loginRedirect),
    tap(({ idpHint }) => keycloak().login({ idpHint }))
  );
}, { functional: true, dispatch: false });

// 3) Logout (full redirect)
export const logout = createEffect(() => {
  const actions$ = inject(Actions);
  return actions$.pipe(
    ofType(Auth.logout),
    tap(() => keycloak().logout({ redirectUri: window.location.origin }))
  );
}, { functional: true, dispatch: false });

// 4) Token refresh loop (every 20s; refresh if <60s left)
export const refreshLoop = createEffect(() => {
  return interval(20000).pipe(
    mergeMap(() =>
      from((async () => {
        const kc = keycloak();
        if (!kc.authenticated) return null;
        const refreshed = await kc.updateToken(60).catch(() => false);
        if (!refreshed) return null;
        return {
          refreshToken: kc.refreshToken || null,
          expiresAt: ((kc.tokenParsed?.exp as number) || 0) * 1000
        };
      })())
    ),
    filter((v): v is NonNullable<typeof v> => !!v),
    map(v => Auth.tokenRefreshed(v)),
    catchError(err => of(Auth.authError({ error: err })))
  );
}, { functional: true });
