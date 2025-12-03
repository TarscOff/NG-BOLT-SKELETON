# PSX-NG-SKELETON – Angular 19 Skeleton
>_Last updated: 2025-09-02_

> 🚀 Modern Angular 19 project template with runtime environment configs, standalone components, NgRx state management, dynamic forms, internationalization, and full CI/CD support.

# NPMRC

Use the following so you can push to registry

```vsts-npm-auth -config .npmrc```
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

## Using the Core SDK in a Host App (Angular 19)

This guide shows how to initialize the **Core SDK** in an Angular 19 Host Application, including runtime config loading, theming, and i18n. You can paste this directly into your Azure DevOps Wiki or keep it as `USING-CORE-IN-HOST.md` in your repo.

---

### 1) Prerequisites

- Angular 19 standalone app
- Runtime config at `public/assets/config.json` (copied per environment by CI/CD), containing:
  - `auth` (Keycloak `url`, `realm`, `clientId`, etc.)
  - `features` (feature flags & rules)
  - any app-specific settings (API base URLs, tenant rules, etc.)
- Translations under `public/assets/i18n/` (`en.json`, `fr.json`, ...)
- Theme CSS under `public/assets/theme/` (`light.css`, `dark.css`)

> Ensure Keycloak token contains custom claims: `tenant` (string) and `authorization` (array of role names). See your Host README for exact mapper setup.

---

### 2) Install Core SDK

```bash
npm i @cadai/pxs-ng-core
```

> If you use a private registry / scope, configure your `.npmrc` accordingly.

---

### 3) Bootstrap in `main.ts`

Paste the following into your **Host App** `main.ts`.  
This loads your runtime config **before** bootstrapping Angular, then initializes the Core SDK via `provideCore(...)`.

```ts
/// <reference types="@angular/localize" />

import { bootstrapApplication } from '@angular/platform-browser';
import { provideAppInitializer } from '@angular/core';
import { AppComponent } from './app/app.component';
import { appConfig } from './app/app.config';
import { provideCore } from '@cadai/pxs-ng-core/core';
import pkg from '../package.json';

/** Simple theme loader (sync) */
export function loadTheme(theme: 'light' | 'dark') {
  const href = `assets/theme/${theme}.css`;
  const existing = document.getElementById('theme-style') as HTMLLinkElement | null;
  if (existing) { existing.href = href; return; }
  const link = document.createElement('link');
  link.id = 'theme-style';
  link.rel = 'stylesheet';
  link.href = href;
  document.head.appendChild(link);
}

(async () => {
  // Load runtime env before bootstrapping
  const res = await fetch('/assets/config.json', { cache: 'no-store' });
  if (!res.ok) throw new Error(`Failed to load config: ${res.status} ${res.statusText}`);
  const env = await res.json();

  await bootstrapApplication(AppComponent, {
    providers: [
      ...appConfig.providers!,                // router, animations, store
      provideCore({
        appVersion: pkg.version,
        environments: env,                    // <- the runtime config JSON
        theme: 'light',                       // 'light' | 'dark'
        i18n: {
          prefix: 'assets/i18n/',
          suffix: '.json',
          fallbackLang: 'en',
          lang: 'en',
        },
      }),
      provideAppInitializer(() => loadTheme('light')),
    ],
  });
})().catch(err => console.error('Bootstrap failed:', err));
```

**What `provideCore(...)` wires up**
- Reads `environments` (runtime config) and exposes it via the Core Config service
- Initializes Keycloak (based on `auth` from the runtime config)
- Sets up i18n (Translate loader with prefix/suffix, default & fallback lang)
- Hooks global interceptors (auth header, error handling)
- Registers feature/guard services

---

### 4) Minimal `assets/config.json` Example

```json
{
  "auth": {
    "url": "https://keycloak.example.com",
    "realm": "my-realm",
    "clientId": "my-client"
  },
  "features": {
    "dashboard": {
      "enabled": true,
      "requireAuth": true,
      "roles": ["ROLE_user", "ROLE_admin"],
      "allow": { "tenants": ["clarence", "acme"] },
      "key": "dashboard",
      "label": "nav.dashboard",
      "icon": "dashboard",
      "route": "/dashboard"
    }
  },
  "api": { "baseUrl": "https://api.example.com" }
}
```

> CI/CD should copy the right `config.*.json` into `public/assets/config.json` for each environment.

---

### 5) Routing & Guards (Host App)

```ts
// app.routes.ts
import { Routes } from '@angular/router';
import { featureGuard } from '@cadai/pxs-ng-core/core';
import { LayoutComponent } from './layout/layout.component';

export const routes: Routes = [
  { path: '', redirectTo: 'dashboard', pathMatch: 'full' },
  {
    path: '',
    component: LayoutComponent,
    canActivateChild: [featureGuard('root')],
    children: [
      {
        path: 'dashboard',
        canActivate: [featureGuard('dashboard', { forbid: '/403' })],
        loadComponent: () => import('./features/dashboard/dashboard.component').then(m => m.DashboardComponent),
      },
      { path: '403', loadComponent: () => import('@cadai/pxs-ng-core/shared').then(m => m.ForbiddenComponent) },
      { path: '**', loadComponent: () => import('@cadai/pxs-ng-core/shared').then(m => m.NotFoundComponent) },
    ]
  }
];
```

- `featureGuard('key')` enforces rules from `config.json` (`enabled`, `requireAuth`, `roles`, `allow.tenants`).  
- Unauthenticated users are redirected to Keycloak when `requireAuth` is true.

---

### 6) Dynamic Menu from Features (optional)

You can list the available features directly from the features services by using the following

```ts
// in a layout or menu service/component
import { inject } from '@angular/core';
import { FeaturesService } from '@cadai/pxs-ng-core/core';

export class AppMenuService {
  private features = inject(FeaturesService);
  get items() {
    return this.features.visibleFeatures(); // returns [{ key, label, icon, route }, ...]
  }
}
```

---

### 7) i18n Files

```
public/assets/i18n/en.json
public/assets/i18n/fr.json
```

```json
// en.json
{ "nav.dashboard": "Dashboard" }
```

---

### 8) Theming

- Place CSS files under `public/assets/theme/light.css` and `public/assets/theme/dark.css`
- Switch by calling `loadTheme('dark')` or `loadTheme('light')`

---

### 9) Common Pitfalls

- `config.json` missing or not copied by CI/CD → app fails during bootstrap
- Keycloak claims not present → features hidden/guards forbid (ensure `tenant` and `authorization` mappers)
- CORS/CSP blocking `config.json` or Keycloak redirect → start with CSP **Report‑Only**

---

### 10) TL;DR

1. Put env at `public/assets/config.json`  
2. Add `provideCore({...})` in `main.ts`  
3. Define features & routes, use `featureGuard('key')`  
4. Put translations & theme assets in the expected folders  

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
- [[✅] - Smart Tables](./README-SMARTABLES.md)
- [[✅] - WorkflowBuilder Flow Designer](./README-WORKFLOWBUILDER.md)
- [[✅] - Charts](./README-CHARTS.md)
- [[🟡] - CSP](./README-CSP.md)
- [[✅] - GIT](./README-GIT.md)
- [[✅] - Contribution Guide](./README-CONTRIBUTING.md)
- [[✅] - NGRX Contribution Guide](./README-CONTRIBUTING.NGRX.md)



## Edge Cases & Notes

- If the token lacks a **tenant** and a feature has `allow.tenants`, that feature will be **hidden/forbidden** (no match).  
  Ensure your `tenant` mapper is present for users of tenant‑scoped features.
- **Single-tenant and multi-tenant** both work: the tenant always comes from the token; `allow.tenants` comes from config.  
  (Backend must still enforce authorization & tenant constraints.)
- `label` values are **i18n keys** — add them to `assets/i18n/*.json`.

---

## Quick Checklist

- [x] **Keycloak**: add **User Attribute** mapper for `tenant` → claim `tenant` (string).  
- [x] **Keycloak**: add **User Realm Role** mapper → claim `authorization` (multivalued string).  
- [x] **Keycloak** *(optional)*: add **User Client Role** mapper(s) → same claim `authorization` (multivalued) to merge client roles.  
- [x] **RuntimeConfig**: define features with `enabled`, `roles`, `allow.tenants`, `requireAuth`, and menu fields.  
- [x] **SDK bootstrap**: call `features.setUser(kc.getUserCtx())`.  
- [x] **Host UI**: menus via `features.visibleFeatures()`, routes via `featureGuard('key')`.  
- [x] **Backend**: enforce roles/tenant server‑side (UI flags are not security).


## 🧑‍💻 Author

**Angular Product Skeleton**  
Built by **Tarik Haddadi** using Angular 19 and modern best practices (2025).

