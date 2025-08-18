# Contributing Guide – Core, Shared, Features & Store

_Last updated: 2025-08-13

This document is the **source of truth** for how to work in this repository. It explains the folder structure, barrel usage, contribution workflow, and a pre‑push checklist to keep everything aligned.

---

## 1) Project Structure & Barrels

> We use **barrel files** (`index.ts`) so consumers import from a single entry per layer. This keeps imports stable and avoids deep relative paths.

```text
src/
└─ app/
   ├─ core/                           # Framework-agnostic building blocks
   │  ├─ services/                    # Config, Http, Keycloak, Layout, Theme, Toast, User, etc.
   │  ├─ interfaces/                  # Shared TS interfaces & models
   │  ├─ enums/                       # Shared enums (e.g., UserRole)
   │  ├─ utils/                       # Pure helpers & validators
   │  ├─ guards/                      # Route guards (e.g., authGuard)
   │  ├─ interceptors/                # Http interceptors (auth, error)
   │  ├─ core.ts                      # Single init point (Http, i18n, Keycloak, dates, etc.)
   │  └─ index.ts                     # Barrel: re‑exports public API (services, interfaces, provideCore, store API)
   │
   ├─ shared/                         # Reusable UI + headless components
   │  ├─ dialog/                      # Confirm dialogs, etc.
   │  ├─ forms/                       # Form system & fields
   │  ├─ fields/                      # Input, select, chips, autocomplete, etc.
   │  ├─ dynamic-form-builder/        # Dynamic form engine/components
   │  ├─ seo/                         # SEO component / meta service
   │  ├─ layout/                      # AppLayoutComponent (standalone)
   │  └─ index.ts                     # Barrel: re‑exports shared components
   │
   ├─ features/                       # App features (lazy, standalone)
   │  ├─ dashboard/
   │  ├─ teams/
   │  └─ 401/
   │
   └─ store/                          # NgRx (root + features)
      ├─ features/
      │  ├─ auth/ {actions,effects,reducer,selectors}/
      │  ├─ team/ {actions,effects,reducer,selectors}/
      │  └─ user/ {actions,effects,reducer,selectors}/
      ├─ app.actions.ts               # Global app actions (optional)
      ├─ app.effects.ts               # Global effects (optional)
      ├─ app.reducer.ts               # Root reducer map
      ├─ app.selectors.ts             # Root selectors (optional)
      ├─ app.state.ts                 # Root state
      └─ index.ts                     # Barrel: provideAppStore(), actions, selectors
```

### Path Aliases (tsconfig)
Make sure these exist so barrel imports work:

```jsonc
// tsconfig.base.json
{{
  "compilerOptions": {{
    "baseUrl": ".",
    "paths": {{
      "@core": ["src/app/core/index.ts"],
      "@core/*": ["src/app/core/*"],
      "@shared": ["src/app/shared/index.ts"],
      "@shared/*": ["src/app/shared/*"],
      "@features": ["src/app/features/index.ts"],
      "@features/*": ["src/app/features/*"],
      "@store": ["src/app/store/index.ts"],
      "@store/*": ["src/app/store/*"]
    }}
  }}
}}
```

### ESLint (Flat Config) Barrel Policy
- **Allowed deep alias imports**: `@core/**`, `@shared/**`
- **Disallowed deep alias imports**: `@features/**`, `@store/**` (use their barrels)
- **Disallowed relative deep paths** into `core/shared/features/store` from outside

(See `eslint.config.cjs` in repo for exact rules.)

### Example Imports
```ts
// Good
import {{ provideCore, FieldConfigService, ToastService }} from '@core';
import {{ ConfirmDialogComponent, DynamicFormComponent, SeoComponent }} from '@shared';
import {{ actions as AppActions, selectors as AppSelectors }} from '@store';

// Allowed deep @core/@shared
import {{ KeycloakService }} from '@core/services';
import {{ AppLayoutComponent }} from '@shared/layout';
```

---

## 2) Core Layer

**Purpose:** framework-agnostic services, models, guards, interceptors, and the **single init point**.

### Key Files
- `core.ts` – registers HttpClient (interceptors), i18n, date providers, loads runtime config, initializes Keycloak, hydrates store.
- `services/keycloak.service.ts` – PKCE, `login-required` (no auto-login in refresh loop), `ensureFreshToken`.
- `interceptors/auth.interceptor.ts` – injects token, skips KC endpoints, only redirects to login on API `401`.
- `guards/auth.guard.ts` – waits for Keycloak readiness and authorizes; with `login-required`, it does not call `login()`.

### Contributing to Core
1. **Add service/interface/enum/util** under the correct subfolder.
2. Export it from the sub‑barrel in `index.ts`.
3. If it’s app-wide (e.g., new interceptor/guard), wire it in `core.ts`.
4. If the feature needs to be available in the whole app, its **mandatory** to use/create its corresponding store see [_**(5) Store (NgRx)**_].
4. Add unit tests if applicable.

---

## 3) Shared Layer

**Purpose:** reusable UI primitives and headless components (dialog, layout, form fields, SEO).

### Conventions
- Components are **standalone**.
- Provide a minimal API and i18n keys.
- Re-export public components via `shared/index.ts` (or sub‑barrels like `shared/layout.ts`).

### Contributing to Shared
1. Place new component in the right domain folder.
2. Keep inputs/outputs generic (no feature-specific logic).
3. Export via `shared/index.ts`.

---

## 4) Features Layer

**Purpose:** business features (lazy-loaded, standalone).

### Conventions
- Feature routes are added in `app.routes.ts` with `loadComponent` (standalone) or `loadChildren` (module).
- Side-effectful logic goes to the **store feature** (effects), not the component.

### Adding a Feature
1. Create `src/app/features/<name>/` with component(s).
2. Add route in `app.routes.ts` (guarded if needed).
3. If stateful, create a matching store feature (see next section).

---

## 5) Store (NgRx)

**Purpose:** state management for app and features.


### A) Folder Structure

```text
src/app/store/
├─ features/
│  ├─ auth/  {actions,effects,reducer,selectors}/
│  ├─ team/  {actions,effects,reducer,selectors}/
│  └─ user/  {actions,effects,reducer,selectors}/
├─ app.actions.ts      # Aggregates feature actions -> AppActions
├─ app.effects.ts      # Root effects registration list -> AppEffects
├─ app.reducer.ts      # Root reducer map -> AppReducers
├─ app.selectors.ts    # Aggregates feature selectors -> AppSelectors
├─ app.state.ts        # Root AppState
└─ index.ts            # provideAppStore(), metaReducers (localStorageSync), etc.
```

**In `@core/index.ts`** we re-export the two root objects so components can import from `@core` only:
```ts
// src/app/core/index.ts
export * from '@store/app.actions';
export * from '@store/app.selectors';
export { provideCore } from './core'; // unrelated to NgRx but lives here
```

---

### B) Root Wiring

#### `store/index.ts`
Provides the root store and effects, and applies persistence to specific slices.

```ts
// src/app/store/index.ts
import { ActionReducer, MetaReducer, provideStore } from '@ngrx/store';
import { provideEffects } from '@ngrx/effects';
import { localStorageSync } from 'ngrx-store-localstorage';
import { AppEffects } from './app.effects';
import { AppReducers } from './app.reducer';
import { AppState } from '@core/interfaces';

const localStorageSyncReducer = (reducer: ActionReducer<AppState>): ActionReducer<AppState> =>
  localStorageSync({ keys: ['teamManagement'], rehydrate: true })(reducer);

export const metaReducers: MetaReducer[] = [localStorageSyncReducer];

export const provideAppStore = () => [
  provideStore(AppReducers, {
    metaReducers,
    runtimeChecks: {
      strictActionImmutability: true,
      strictStateImmutability: true,
    },
  }),
  provideEffects(AppEffects),
];
```

> **Note:** `AppReducers` and `AppEffects` are maintained in their respective files (***DO NOT TOUCH***); this guide focuses on **actions** and **selectors** aggregation.

---

### C) Aggregation (Root Objects)

#### `store/app.actions.ts`
Aggregate feature action namespaces into a single `AppActions` object:

```ts
// src/app/store/app.actions.ts
import * as UserActions from './features/user/user.actions';
import * as TeamActions from './features/team-management/team-management.actions';
import * as AuthActions from './features/auth/auth.actions';

export const AppActions = {
  UserActions,
  TeamActions,
  AuthActions,
};
```

#### `store/app.selectors.ts`
Aggregate feature selectors into a single `AppSelectors` object:

```ts
// src/app/store/app.selectors.ts
import * as UserSelectors from './features/user/user.selectors';
import * as TeamSelectors from './features/team-management/team-management.selectors';
import * as AuthSelectors from './features/auth/auth.selectors';

export const AppSelectors = {
  UserSelectors,
  TeamSelectors,
  AuthSelectors,
};
```

These are re-exported by `@core/index.ts`, so components use:
```ts
import { AppActions, AppSelectors } from '@core';
```

---

### D) Feature Pattern (Actions / Effects / Reducer / Selectors)

Below is the **canonical** pattern your features follow. Example: **User**.

#### 4.1 Actions (`user.actions.ts`)
```ts
import { createAction, props } from '@ngrx/store';
import { User } from '../../../core/interfaces/user.model';

// Get one user
export const loadUser         = createAction('[User] Load');
export const loadUserSuccess  = createAction('[User] Load Success', props<{ user: User }>());
export const loadUserFailure  = createAction('[User] Load Failure', props<{ error: string }>());

// Get all users
export const loadUsers        = createAction('[User] Load All');
export const loadUsersSuccess = createAction('[User] Load All Success', props<{ users: User[] }>());
export const loadUsersFailure = createAction('[User] Load All Failure', props<{ error: string }>());

// Create
export const createUser       = createAction('[User] Create', props<{ user: Partial<User> }>());
export const createUserSuccess= createAction('[User] Create Success', props<{ user: User }>());
export const createUserFailure= createAction('[User] Create Failure', props<{ error: string }>());

// Update
export const updateUser       = createAction('[User] Update', props<{ id: string, user: Partial<User> }>());
export const updateUserSuccess= createAction('[User] Update Success', props<{ user: User }>());
export const updateUserFailure= createAction('[User] Update Failure', props<{ error: string }>());

// Delete
export const deleteUser       = createAction('[User] Delete', props<{ id: string }>());
export const deleteUserSuccess= createAction('[User] Delete Success', props<{ id: string }>());
export const deleteUserFailure= createAction('[User] Delete Failure', props<{ error: string }>());

```

#### 4.2 Effects (`user.effects.ts`)
Functional effects that inject dependencies inside the effect factory:

```ts
import { inject } from '@angular/core';
import { Actions, createEffect, ofType } from '@ngrx/effects';
import * as UserActions from './user.actions';
import { catchError, map, mergeMap, of } from 'rxjs';
import { UserService } from '../../../core/services/user.service';

export const loadUser = createEffect(() => {
  const actions$ = inject(Actions);
  const userService = inject(UserService);
  return actions$.pipe(
    ofType(UserActions.loadUser),
    mergeMap(() => userService.getCurrentUser().pipe(
      map(user => UserActions.loadUserSuccess({ user })),
      catchError(error => of(UserActions.loadUserFailure({ error: error.message })))
    ))
  );
}, { functional: true });

// Similar for loadUsers, createUser, updateUser, deleteUser ...
```

#### 4.3 Reducer (`user.reducer.ts`)
```ts
import { createReducer, on } from '@ngrx/store';
import * as UserActions from './user.actions';
import { UserState } from '../../../core/interfaces/user.model';

const initialState: UserState = {
  user: null,
  users: [],
  loading: false,
  error: null,
};

export const userReducer = createReducer(
  initialState,
  on(UserActions.loadUser,               s => ({ ...s, loading: true,  error: null })),
  on(UserActions.loadUserSuccess, (s,{ user }) => ({ ...s, loading: false, user })),
  on(UserActions.loadUserFailure, (s,{ error }) => ({ ...s, loading: false, error })),

  on(UserActions.loadUsers,              s => ({ ...s, loading: true,  error: null })),
  on(UserActions.loadUsersSuccess,(s,{ users }) => ({ ...s, loading: false, users })),
  on(UserActions.loadUsersFailure,(s,{ error }) => ({ ...s, loading: false, error })),

  on(UserActions.createUser,             s => ({ ...s, loading: true,  error: null })),
  on(UserActions.createUserSuccess,(s,{ user }) => ({ ...s, loading: false, users: [...s.users, user] })),
  on(UserActions.createUserFailure,(s,{ error }) => ({ ...s, loading: false, error })),

  on(UserActions.updateUser,             s => ({ ...s, loading: true,  error: null })),
  on(UserActions.updateUserSuccess,(s,{ user }) => ({ ...s, loading: false, users: s.users.map(u => u.id === user.id ? user : u) })),
  on(UserActions.updateUserFailure,(s,{ error }) => ({ ...s, loading: false, error })),

  on(UserActions.deleteUser,             s => ({ ...s, loading: true,  error: null })),
  on(UserActions.deleteUserSuccess,(s,{ id }) => ({ ...s, loading: false, users: s.users.filter(u => u.id !== id) })),
  on(UserActions.deleteUserFailure,(s,{ error }) => ({ ...s, loading: false, error })),
);
```

#### 4.4 Selectors (`user.selectors.ts`)
```ts
import { createFeatureSelector, createSelector } from '@ngrx/store';
import { UserState } from '../../../core/interfaces/user.model';

export const selectUserState   = createFeatureSelector<UserState>('user');
export const selectUser        = createSelector(selectUserState, s => s.user);
export const selectUserRole    = createSelector(selectUser, u => u?.role ?? null);
export const selectUserLoading = createSelector(selectUserState, s => s.loading);
export const selectUsers       = createSelector(selectUserState, s => s.users);
export const selectUserError   = createSelector(selectUserState, s => s.error);
```

---

### E) Usage in Components

Use only the **root objects re-exported by `@core`**:

```ts
import { AppActions, AppSelectors } from '@core';
import { Store } from '@ngrx/store';

// Select
this.user$        = this.store.select(AppSelectors.UserSelectors.selectUser);
this.userLoading$ = this.store.select(AppSelectors.UserSelectors.selectUserLoading);

// Dispatch
this.store.dispatch(AppActions.UserActions.loadUser());
```

This keeps components free from deep store paths.

---

### F) Adding a New Store Feature (Checklist)

1. **Scaffold feature** under `store/features/<name>/{actions,effects,reducer,selectors}`.
2. **Register reducer** in `app.reducer.ts` (update `AppReducers`).
3. **Register effects** in `app.effects.ts` (add to `AppEffects` list).
4. **Aggregate** in root:
   - `app.actions.ts`: `import * as <Name>Actions ...; export const AppActions = { ...AppActions, <Name>Actions };`
   - `app.selectors.ts`: `import * as <Name>Selectors ...; export const AppSelectors = { ...AppSelectors, <Name>Selectors };`
5. **Export** `AppActions` & `AppSelectors` through `@core/index.ts` (already wired).
6. **Use** in components via `@core` (no deep imports).

---

### G) Persistence Policy

- We sync **`teamManagement`** slice to `localStorage` via `localStorageSync` in `store/index.ts`.
- To persist another slice:
  1. Add its key to `keys: [...]` in `localStorageSync({ keys: [...] })`.
  2. Ensure its state is serializable.
  3. Consider versioning/migrations if shape changes.

---

### H) PR Checklist (NgRx-specific)

- [ ] Reducer added to `AppReducers`
- [ ] Effects added to `AppEffects`
- [ ] Feature selectors/actions aggregated in `app.selectors.ts` / `app.actions.ts`
- [ ] Components use `AppActions` / `AppSelectors` from `@core`
- [ ] No deep relative imports into `store/**` from components
- [ ] Side effects live in **effects**, not components
- [ ] State is serializable; no plain class instances in store
- [ ] Tests/lint pass (`ng build`, `pnpm lint`, `pnpm test` if present)

---

## 6) Routing & Roles

```ts
// app.routes.ts
import {{ Routes }} from '@angular/router';
import {{ authGuard, UserRole }} from '@core';
import { AppLayoutComponent } from '@shared/layout/app-layout.component';

export const routes: Routes = [
  {{ path: '', redirectTo: 'dashboard', pathMatch: 'full' }},
  {{
    path: '',
    component: AppLayoutComponent,
    children: [
      {{
        path: 'dashboard',
        canActivate: [authGuard],
        data: {{ roles: [UserRole.ROLE_admin, UserRole.ROLE_user] }},
        loadComponent: () =>
          import('./features/dashboard/dashboard.component').then(m => m.DashboardComponent),
      }},
    ],
  }},
];
```

---

## 7) Keycloak Notes (login‑required)

- Keep `onLoad: 'login-required'` in `KeycloakService.init()`.
- **Do not** call `kc.login()` automatically on refresh errors (avoid loops).
- Interceptor must **skip Keycloak endpoints** and only re‑login on **API 401**.
- Guard should **not** call `login()` (Keycloak already redirects before app loads).

---

## 8) Adding a New Feature – Quick Steps

1. **Create feature UI** under `src/app/features/<name>` (standalone component).
2. **Route**: add lazy `loadComponent` entry to `app.routes.ts`.
3. **Store**: add feature slice (actions/effects/reducer/selectors), register in root, expose via `store/index.ts`.
4. **Shared**: if you need a reusable UI piece, add it under `shared/` and export via the barrel.
5. **Core**: if you need a cross‑cutting concern (service/interceptor), add under `core/` and wire in `provideCore.ts`.
6. **i18n**: add/extend translation JSONs.
7. **Docs**: update this guide only if structure or rules change.

---

## 9) Pre‑Push Checklist

- [ ] **Build passes**: `ng build`
- [ ] **Lint passes**: `pnpm lint` (or `npm run lint`)
- [ ] **No deep relative imports** into `core/shared/features/store` (respect barrel policy)
- [ ] **Barrels updated**: new public APIs re‑exported via `index.ts`
- [ ] **Routes lazy‑loaded** and guarded appropriately
- [ ] **Store wired**: reducer registered, effects provided, selectors exported
- [ ] **i18n keys** added/updated
- [ ] **Keycloak**: no loops (refresh doesn’t auto‑login), KC endpoints skipped in interceptor
- [ ] **Types**: no `any`; strict mode friendly
- [ ] **Changelog/commit messages** follow Conventional Commits
- [ ] **Version bump** planned if releasing

---

## 10) Rationale: Barrel Usage

- Barrels allow consistent imports and future refactors without touching consumers.
- We **allow deep `@core/**` and `@shared/**`** to unlock granular imports for framework/util layers.
- We **disallow deep `@features/**` and `@store/**`** to keep feature contracts stable and reduce coupling.

**Example**

```ts
// Use barrels for features & store
import { AppActions, AppSelectors } from '@store';

// Allowed deep for core/shared
import { FieldConfigService } from '@core/services';
import { ConfirmDialogComponent } from '@shared/dialog';
```

---

## 11) Questions

Open a PR with the `docs/` label or start a thread in the repository discussions. This guide is living documentation; keep it small, precise, and practical.


## 🧑‍💻 Author

**Angular Product Skeleton**  
Built by **Tarik Haddadi** using Angular 19 and modern best practices (2025).