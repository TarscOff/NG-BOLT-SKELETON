import { ActionReducer, MetaReducer, provideStore } from '@ngrx/store';
import { provideEffects } from '@ngrx/effects';
import { userReducer } from './features/user/user.reducer';
import { localStorageSync } from 'ngrx-store-localstorage';
import { teamManagementReducer } from './features/team-management/team-management.reducer';
import { effects } from './app.effects';
import { AppState } from './app.reducer';
import { authReducer } from './features/auth/auth.reducer';

const localStorageSyncReducer = (reducer: ActionReducer<AppState>): ActionReducer<AppState> =>
  localStorageSync({ keys: ['teamManagement'], rehydrate: true })(reducer);

export const metaReducers: MetaReducer[] = [localStorageSyncReducer];

export const provideAppStore = () => [
  provideStore({ user: userReducer, teamManagement: teamManagementReducer, auth: authReducer },  {metaReducers,
    runtimeChecks: {
      strictActionImmutability: true,
      strictStateImmutability: true
    }
  }),
  provideEffects(effects)
];

