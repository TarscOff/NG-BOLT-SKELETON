# 🎯 Project Roadmap – Ordered Checklist (Angular 19 + NgRx + Keycloak)
>_Last updated: 2025-08-22_

Legend: **✅ Done** · **🟡 In progress** · **❌ To do**  
Severity: **P0 Critical**, **P1 High**, **P2 Medium**, **P3 Low**  
Workload (est.): **S ≤1d**, **M 2–3d**, **L 4–7d**, **XL >1wk**

> Update **Status**, **Owner**, and **Next Actions** as you progress. Add links to PRs or wiki when relevant.


## ✅ Summary Table (Done → In Progress → To Do)

| Category | Item | Status | Severity | Workload | Summary | Key Files / Paths | Next Actions | Owner |
|---|---|---:|---|---|---|---|---|---|
| Core | Decoupled PXS-NG-CORE Angular Core with Best practices  and its own regisry on Azure | ✅ | P1 | XL | App uses standalone components, strict TS/ESLint. Also imports are done via barels `@cadai/pxs-ng-core/*` | `See core repository on Azure actifacts https://dev.azure.com/cadai/Socle/_artifacts/feed/PXS-NG-CORE` | — | FE |
| Core | Angular 19 + Standalone APIs | ✅ | P2 | L | App uses standalone components, strict TS/ESLint. | `src/app/**`, `tsconfig.json`, `.eslintrc.*` | — | FE |
| Core | Runtime Config via `config.json` + `ConfigService` | ✅ | P1 | M | Loads `/assets/config.json` at bootstrap. | `public/assets/config.*.json`, `ConfigService` | Ensure env files match Keycloak/API | FE |
| State | NgRx Store setup | ✅ | P2 | M | Store with feature slices; functional effects enabled. | `src/app/store/**` (Barrels) | — | FE |
| State | Tokenless `auth` slice | ✅ | P1 | S | Only `name`, `email` (+ optional `isAuthenticated`, `expiresAt`). | `auth.reducer.ts`, `auth.selectors.ts` | Keep tokens out of state | FE |
| Auth | Keycloak (Broker) – redirect-only PKCE | ✅ | P1 | M | `onLoad: 'login-required'`, `pkceMethod: 'S256'`, no iframes. | `auth/keycloak.service.ts`, `assets/config.json` | Review Keycloak lifetimes/rotation | FE/SEC |
| Auth | HTTP Interceptor (Bearer) | ✅ | P1 | S | Reads live token from `keycloak().token`. | `auth/auth.interceptor.ts` | — | FE |
| Auth | Route Guard | ✅ | P1 | S | Functional guard triggers full login redirect. | `auth/auth.guard.ts`, `app.routes.ts` | — | FE |
| Auth | User Menu + Logout | ✅ | P3 | S | Sidenav shows user info & logout. | Layout component & template | — | FE |
| Forms | Dynamic Forms system | ✅🟡 | P2 | L | `FieldConfigService`, `DynamicFormComponent`, `FieldHostComponent`,`field-config.service.ts`. | `shared/forms/**` (Barrels system) | Need to customize the inputs of different field generator  | FE |
| Forms | Validators (custom + built-in) | ✅ | P2 | M | Email TLD, password strength, phone digits, etc. | `shared/forms/utils.ts` | — | FE |
| i18n | `@ngx-translate` setup | ✅ | P2 | S | Translation files under `/assets/i18n`. | `public/assets/i18n/**`, module config | Keep keys in sync | FE |
| UI | Theme & Language switchers | ✅ | P3 | S | Uses main components in `shared/forms/fields`. | `app/shared/*` | — | FE |
| Routing | Guards applied on protected routes | ✅ | P2 | S | `dashboard`, `team`, etc. | `app.routes.ts` | — | FE |
| Docker | Multi-stage build | ✅ | P2 | M | Node build → Nginx serve. | `Dockerfile` | — | DEVOPS |
| Nginx | Runtime-templated CSP | ✅ | P1 | M | Templated `default.conf`, env-driven `connect-src`. | `nginx/default.conf.template`, `docker/entrypoint.sh` | Ensure envs set per env | DEVOPS |
| CI/CD | Azure & GitLab pipelines |🟡 | P1 | M | Build, lint, env `config.json`, dockerize. | `azure-pipelines.yml`, `.gitlab-ci.yml` | — | DEVOPS |
| Docs | README (core) | ✅ | P3 | S | Project overview and usage. | `docs/README.md` | Keep updated | FE |
| Docs | Auth & Security README | ✅ | P2 | S | Current SPA posture & risks. | `docs/README-AUTH-UPGRADED.md` | — | SEC |
| Docs | Forms Guide | ✅ | P2 | S | How to instantiate/reuse fields. | `docs/forms-guide.md` | — | FE |
| Docs | Hardening Plan | ✅ | P1 | S | Remediation checklist & criteria. | `docs/hardening-plan.md` | Track to closure | SEC |
| Docs | Posture & BFF Plan | ✅ | P1 | M | Target architecture & migration steps. | `docs/bff-plan.md` | Use as implementation guide | SEC/BE |
| CSP | Enforced in prod (iframe-free) | 🟡 | P1 | S | Policy in place; verify enforce vs report-only. | Nginx conf | Confirm prod uses **enforcing** header | SEC/DEVOPS |
| Headers | Security headers (HSTS, COOP, CORP, XFO) | 🟡 | P1 | S | Some present; finalize full set. | Nginx conf | Add/verify all headers | SEC/DEVOPS |
| CORS | API CORS locked to SPA origin | 🟡 | P1 | S | Should allow only SPA origin. | API gateway/config | Review and restrict origins | API/SEC |
| CI/CD | CSP smoke test | 🟡 | P2 | S | Snippet provided; add as a job. | Pipelines | Implement & gate builds | DEVOPS |
| Core | Barrels | ✅ | P1 | M | Expose all the components, utils, as Barrels. | `src//**` (Barrels), fixed paths and linter | --- | FE |
| Core | Features & Menus per-tenant via config | ✅ | P1 | M | Feature flags + menu rendering per tenant/role. | `See PXS-NG-CORE module on cadai npm repository` | --- | FE |
| Core | Single-tenant & Multi-tenant support | ✅ | P1 | M | Tenant claim + allow-list per feature.  | `See PXS-NG-CORE module on cadai npm repository` | ---| FE |
| Core | Cloud & On-Prem compatibility | ✅ | P2 | M | Bundle external assets for offline/no-internet installs. | `public/assets/**` | Remove external URLs; vendor fonts/libs | FE |
| CI/CD | Dependency scan (npm audit/Snyk) | 🟡 | P1 | S | Block high/critical vulns. | Pipelines | Add job & thresholds | DEVOPS/SEC |
| UI | Fonts & External resources vendored | ❌ | P2 | M | Package fonts/libs in app for offline. | `fonts/`, external libs | Replace http URLs; ensure licensing | FE |
| UI | Luxon Date formatting | ❌ | P2 | s | Include Luxon to manage all dates | `utils/**` | customize dates display and management | FE |
| UI | Storybook | ❌ | P2 | M | Isolated docs/dev for components; a11y. | `.storybook/**`, `src/app/shared/forms/**` | Init Storybook; write stories; run in CI | FE |
| UI/UX | Workflows using Flow Drag and drop | ❌ | P2 | M | Design Woprkflows | `@pxs-ng-core/core` | Implement Feature in the Core | FE |
| UI/UX | Charts using D3 | ❌ | P2 | M | Design charts with different types | `@pxs-ng-core/core` | Implement Feature in the Core | FE |
| Testing | Unit tests | ❌ | P1 | M | Services, guards, FeatureService, validators. Coverage gates. | `src/**/*.spec.ts`, `jest.config.ts` | Add tests; set ≥80% thresholds in CI | FE/QA |
| Realtime | SSE / WebSocket | 🟡 | P2 | L | Realtime via BFF; SSE first, WS optional. | `See PXS-NG-CORE module on cadai npm repository` | Define event model; heartbeat; auth via session | BE/FE |
| Realtime | Push Notifications + Service Worker | 🟡 | P2 | L | Web Push alerts + background sync. | `See PXS-NG-CORE module on cadai npm repository` | Gen SW; VAPID; opt-in UX; server endpoints | FE/BE |
| Core | PWA Mode (optional) | ❌ | P3 | M | Offline shell + asset caching. | `ngsw-config.json`, `manifest.webmanifest` | Enable PWA; exclude auth routes from cache | FE |
| DX/Delivery | Git strategy (pull/rebase) | ✅ | P2 | S | PRs rebase on main; protected branches. | `CONTRIBUTING.md`, `CODEOWNERS` | Document policy; enable protections | ENG |
| DX/Delivery | Package as SDK (private npm registry) | ✅ | P1 | L | Extract reusable lib; publish to private registry. | `projects/sdk/**`, `ng-package.json` | Define public API; peerDeps; publish | FE/DEVOPS |
| DX/Delivery | Release note & versioning | ❌ | P2 | M | Conventional Commits; SemVer; channels. | `.releaserc`/`changeset/**`, `release-notes/**` | Add tooling; auto tag & publish | DEVOPS |
| CI/CD | Storybook build & publish | ❌ | P3 | S | Build Storybook; deploy to docs. | CI job `storybook:build` | Add job; optionally Chromatic | DEVOPS/FE |
| CI/CD | Test & Coverage gates | ❌ | P1 | S | Run tests with thresholds in CI. | Pipelines | Add `npm test -- --code-coverage` and fail under threshold | DEVOPS |
| CI/CD | Realtime smoke tests | ❌ | P2 | M | Verify SSE/WS in staging. | `e2e/**` | Playwright test for events; cookie-auth WS | QA |
| Docs | SDK usage guide | ✅ | P1 | XL | How to consume SDK; | `See PXS-NG-CORE module on cadai npm repository` | Write usage & migration notes | FE |
| Testing | E2E auth smoke (login/refresh/logout) | ❌ | P1 | M | Playwright/Cypress flows across reloads/cookies. | `e2e/**` | Add tests for auth flows | QA/FE |
| Keycloak | Token lifetimes + rotation | ✅ | P0 | S | Short access token; refresh rotation; revoke on reuse. | Keycloak client/realm | Apply settings; regression test | SEC/IDP |
---

## 📓 Notes
- **Tokens are not stored** in NgRx or browser storage. Interceptor reads from `keycloak().token` only.
- Keep **source maps** disabled or private in prod.
- Restrict **Keycloak** Redirect URIs/Web Origins to **exact** origins (no wildcards).
- For high-sensitivity data, prioritize the **BFF migration**.


## 🧑‍💻 Author

**Angular Product Skeleton**  
Built by **Tarik Haddadi** using Angular 19 and modern best practices (2025).