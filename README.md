# PSX-NG-SKELETON – Angular 19 Skeleton
>_Last updated: 2025-08-21_

> 🚀 Modern Angular 19 project template with runtime environment configs, standalone components, NgRx state management, dynamic forms, internationalization, and full CI/CD support.


---

## 🧭 Quick Start for Developers

1. Set up a Keycloak client (Public + PKCE S256) and brokered IdPs if needed.  
2. Update `public/assets/config.dev.json` (`auth.url/realm/clientId`).  
3. `npm start` → app redirects to Keycloak and back.  
4. Verify API calls include Bearer token.  
5. For CSP, start with Report‑Only and review DevTools for violations.
# Feature Flags & Tenant Resolution — How It Works

> **TL;DR**  
> - `KeycloakService` builds a **`userCtx`** from the token (auth state, **roles from `authorization`**, and **tenant**).  
> - `FeatureService` compares that `userCtx` against **RuntimeConfig** (`features`) to decide **what to show** (menus, routes, UI).  
> - `featureGuard('key')` and `visibleFeatures(userCtx?)` use the **same checks**, keeping navigation and menus in sync.

---

## Terms

- **RuntimeConfig** (`assets/config.json`): holds `features` and their rules (`enabled`, `requireAuth`, `roles`, `allow.tenants`, plus `key/label/icon/route` for menus).
- **userCtx**: `{ isAuthenticated: boolean; roles: string[]; tenant: string | null }`  
  Sourced from **Keycloak token** via `KeycloakService`:
  - `roles` come from the **custom `authorization` claim** (array of role names, e.g., `ROLE_user`, `ROLE_admin`).
  - `tenant` comes from the **custom `tenant` claim**.

---

## Data Flow

1. **Auth & user context**  
   `KeycloakService.getUserCtx()` reads the current session:
   - `isAuthenticated` (boolean)
   - `roles` (from custom `authorization` claim; falls back to realm/client roles only if needed)
   - `tenant` (from custom `tenant` claim)

2. **Feature evaluation**  
   `FeatureService.isEnabled(featureKey, userCtx)` checks the feature entry in RuntimeConfig:
   - `enabled === true`
   - if `requireAuth`, then `userCtx.isAuthenticated` must be `true`
   - if `roles` present, user must have **at least one**
   - if `allow.tenants` present, `userCtx.tenant` must be **included**

3. **Menus & Guards**  
   - `FeatureService.visibleFeatures(userCtx?)` filters all features using the checks above and returns items (`key/label/icon/route`) to render the menu.  
   - `featureGuard('feature.key')` applies the **same rules** to allow/deny navigation.  
     - If `requireAuth` and the user is not authenticated, the guard **triggers Keycloak login** (no `/login` route needed).  
     - If authenticated but not allowed (role/tenant mismatch), it redirects to an optional `/403`.

---

## Keycloak Pre‑requisites (custom claims)

To make the UI/guards work as designed, configure **two custom claims** on your Keycloak client (or realm) so they are included in the **Access Token** (and optionally **ID Token**):

### 1) `tenant` claim (string)
Use a **User Attribute** mapper.
- **Mapper Type:** *User Attribute*
- **User Attribute:** `tenant` (add this attribute on each user, or set via groups)
- **Token Claim Name:** `tenant`
- **Claim JSON Type:** `String`
- **Add to access token:** ✅
- **Add to ID token:** ✅ (optional)
- *(Optional)* **Add to userinfo:** ✅

> Alternative: if tenant comes from group membership, use a **Script Mapper** or a **Group Membership** mapper and output a single string. Most teams keep a simple user attribute named `tenant`.

### 2) `authorization` claim (array of role names)
You want one array that merges realm and/or client roles into **one** claim. You can achieve this **without scripts** using multiple role mappers pointing to the **same** claim name with **Multivalued** enabled.

**Option A — Realm roles only (simple):**
- **Mapper Type:** *User Realm Role*
- **Token Claim Name:** `authorization`
- **Claim JSON Type:** `String`
- **Multivalued:** ✅
- **Add to access token:** ✅
- *(repeat for other realms if applicable)*

**Option B — Merge realm + client roles:**
Create **two** mappers (or more, one per client) with the **same** claim name `authorization`:
1. *User Realm Role* mapper → `authorization`, `String`, **Multivalued** ✅
2. *User Client Role* mapper (select your client) → `authorization`, `String`, **Multivalued** ✅

Keycloak will **merge** values from both mappers into one `authorization: [...]` array.

> If you prefer a fully custom build (e.g., renaming roles or mapping from groups), you can use a **Script Mapper** to push a curated array into `authorization`.

### Sample token (after mappers)

```json
{
  "preferred_username": "alice",
  "authorization": ["ROLE_user", "ROLE_admin"],
  "tenant": "clarence",
  "exp": 1712345678,
  "iat": 1712342078
}
```

---

## Example: RuntimeConfig (excerpt)

```json
{
  "features": {
    "reports": {
      "enabled": true,
      "roles": ["ROLE_user", "ROLE_admin"],
      "allow": { "tenants": ["clarence", "other_tenant"] },
      "requireAuth": true,
      "key": "reports",
      "label": "nav.reports",
      "icon": "dashboard",
      "route": "/dashboard"
    },
    "ai.projects": {
      "enabled": true,
      "roles": ["ROLE_user", "ROLE_admin"],
      "allow": { "tenants": ["clarence"] },
      "requireAuth": true,
      "key": "team",
      "label": "nav.team",
      "icon": "group",
      "route": "/team"
    }
  }
}
```

---

## Where it’s used

### 1) App bootstrap (SDK)
```ts
// provideCore initializer (SDK): after Keycloak init
const { isAuthenticated, roles, tenant } = kc.getUserCtx(); // roles from `authorization`, tenant from `tenant`
features.setUser({ isAuthenticated, roles, tenant });
```

### 2) Menus from features (Host or SDK layout)
```ts
// Build menu items once, or recompute if auth/roles change
this.menuItems = this.features.visibleFeatures(); // uses the user set above
```

*(Optional reactive pattern: recompute after login/role changes, and re-call `setUser(getUserCtx())`.)*

### 3) Routes and Guards

```ts
// app.routes.ts
import {{ Routes }} from '@angular/router';
import {{ authGuard, UserRole }} from '@core';
import { AppLayoutComponent } from '@shared/layout/app-layout.component';

export const routes: Routes = [
  { path: '', redirectTo: 'dashboard', pathMatch: 'full' },
  {
    path: '',
    component: AppLayoutComponent,
    canActivateChild: [authGuard],
    children: [
      {
        path: 'dashboard',
        canActivate: [featureGuard('dashboard', { forbid: '/403' })],
        data: { roles: [UserRole.ROLE_admin, UserRole.ROLE_user] },
        loadComponent: () =>
          import('./features/dashboard/dashboard.component').then(m => m.DashboardComponent),
      },
      {
        path: 'team',
        canActivate: [featureGuard('team', { forbid: '/403' })],
        data: { roles: [UserRole.ROLE_admin, UserRole.ROLE_user] },
        loadComponent: () =>
          import('./features/teams/teams.component').then(m => m.TeamsComponent),
      },
      { path: '403', loadComponent: () => import('@cadai/pxs-ng-core/shared').then(m => m.ForbiddenComponent) },
      { path: '**', loadComponent: () => import('@cadai/pxs-ng-core/shared').then(m => m.NotFoundComponent) },
    ]
  },
];
```

---
- If the feature has `requireAuth: true` and the user is not authenticated, the guard **invokes Keycloak login**.
- If authenticated but not allowed (roles/tenant), it redirects to `/403` (configurable).

---

## Edge Cases & Notes

- If the token lacks a **tenant** and a feature has `allow.tenants`, that feature will be **hidden/forbidden** (no match).  
  Ensure your `tenant` mapper is present for users of tenant‑scoped features.
- **Single-tenant and multi-tenant** both work: the tenant always comes from the token; `allow.tenants` comes from config.  
  (Backend must still enforce authorization & tenant constraints.)
- `label` values are **i18n keys** — add them to `assets/i18n/*.json`.

---

## Quick Checklist

- [ ] **Keycloak**: add **User Attribute** mapper for `tenant` → claim `tenant` (string).  
- [ ] **Keycloak**: add **User Realm Role** mapper → claim `authorization` (multivalued string).  
- [ ] **Keycloak** *(optional)*: add **User Client Role** mapper(s) → same claim `authorization` (multivalued) to merge client roles.  
- [ ] **RuntimeConfig**: define features with `enabled`, `roles`, `allow.tenants`, `requireAuth`, and menu fields.  
- [ ] **SDK bootstrap**: call `features.setUser(kc.getUserCtx())`.  
- [ ] **Host UI**: menus via `features.visibleFeatures()`, routes via `featureGuard('key')`.  
- [ ] **Backend**: enforce roles/tenant server‑side (UI flags are not security).


---

Only config.json is loaded by the app, so CI/CD pipelines copy the correct version based on branch or env.

## ⚒️ Development build & serve
```
npm start                 # = ng serve
```
### Static builds
```
npm run build             # = ng build --configuration=development
npm run buildUat
npm run buildProd
```

### Watch mode
```
npm run watch
```
### Testing & Linting
```
npm run test
npm run lint
```

## 📁 Project Structure Highlights

| Path                                                     | Purpose                                             |
|----------------------------------------------------------|-----------------------------------------------------|
| `public/assets/config.*.json`                            | Runtime environment configs (`dev`, `uat`, `prod`)  |
| `src/app/app.config.ts`                                  | Angular 19 `ApplicationConfig` & DI providers       |
| `src/app/app.routes.ts`                                  | Routing config using standalone components          |


## 🧠 Notes

This project uses Angular strict mode (`strict: true`) and TypeScript with:

- `resolveJsonModule`
- `esModuleInterop`
- `strictTemplates`
- `noImplicitReturns`
- `noFallthroughCasesInSwitch`


## 📃 Documentation Index
Legend: **✅ Done** · **🟡 Ongoing** · **❌ To do**  

- [[✅] - Global Core Overview](./README-OVERVIEW.md)
- [[✅] - Change log](./CHANGELOG.md)
- [[✅] - Theming, Assets and translattions](./README-ASSETS-TRANSLATIONS.md)
- [[🟡] - CI/CD](./README-CI-CD.md)
- [[✅] - Contribution Guide](./CONTRIBUTING.md)



## 🧑‍💻 Author

**Angular Product Skeleton**  
Built by **Tarik Haddadi** using Angular 19 and modern best practices (2025).

