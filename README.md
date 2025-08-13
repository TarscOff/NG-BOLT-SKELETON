# AI Product – Angular 19 Skeleton
>_Last updated: 2025-08-13_

> 🚀 Modern Angular 19 project template with runtime environment configs, standalone components, NgRx state management, dynamic forms, internationalization, and full CI/CD support.


---

## 🧭 Quick Start for Developers

1. Set up a Keycloak client (Public + PKCE S256) and brokered IdPs if needed.  
2. Update `public/assets/config.dev.json` (`auth.url/realm/clientId`).  
3. `npm start` → app redirects to Keycloak and back.  
4. Verify API calls include Bearer token.  
5. For CSP, start with Report‑Only and review DevTools for violations.

---

## 🧱 Project Overview

This repository provides a scalable, production-ready **Angular 19** setup using best practices including:

- ✅ **Standalone component architecture**
- 🌐 **Runtime environment configuration** via `public/assets/config.json`
- 🔐 **Authentication with Keycloak (Broker, PKCE, iframe‑free)**
- 🔒 **Strict Content Security Policy (CSP)** compatible with Keycloak (no iframes)
- 🔄 **NgRx** for reactive global state (Store + Effects)
- 🧩 **Dynamic Forms** via reusable `FieldConfig` pattern
- 🌍 **Internationalization** with `@ngx-translate`
- 🎨 **Angular Material + CDK** UI framework
- 🐳 **Docker + Nginx** with runtime-templated CSP
- 🦾 **CI/CD** examples (Azure Pipelines & GitLab CI)

---


## 📐 Features Used

- ✅ **Angular 19 Standalone APIs**
- ✅ **Runtime config injection** via `ConfigService`
- ✅ **NgRx** for scalable and reactive global state
- ✅ **Reactive Forms** with dynamic schema rendering
- ✅ **Internationalization (i18n)** via `@ngx-translate`
- ✅ **Angular Material** UI with responsive layout
- ✅ **Signal-based ThemeService** Theming
- ✅ Integrated **Toasts**, **Dialogs**, and **Tooltips**
- ✅ Integrated Custom **Forms** Builder and custom reusable **Fields**
- ✅ Strict **TypeScript** config (`strict: true`) with ESLint
- ✅ **CI/CD-ready** with Azure Pipelines & GitLab CI support


## 📦 Dependencies

### Framework & Core

- **Angular 19** (`@angular/core`, `@angular/common`, etc.)
- **Standalone APIs** (`bootstrapApplication`, `ApplicationConfig`)
- **RxJS 7.8**

### UI & Layout

- `@angular/material` – Material Design UI components
- `@angular/cdk` – Layout utilities
- `@angular/flex-layout` – Responsive layout engine

### State Management

- `@ngrx/store`, `@ngrx/effects`, `@ngrx/store-devtools`
- `ngrx-store-localstorage` – persistent global state

### Forms & UX

- **Reactive Forms**
- **Custom DynamicFormComponent**
- `FieldConfigService` for reusable, schema-based field configuration

### Internationalization (i18n)

- `@ngx-translate/core`
- `@ngx-translate/http-loader`
- JSON-based language files (`public/assets/i18n/`)

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
| `src/app/core/services/config.service.ts`                | Loads runtime config before app bootstrap           |
| `src/app/core/services/field-config.service.ts`          | Generates reusable form field configs               |
| `src/app/shared/forms/dynamic-form.component.ts`         | Reusable dynamic form renderer                      |
| `src/app/store/`                                         | NgRx store, actions, reducers, and selectors        |
| `src/app/layout/`                                        | App layout structure: toolbar, sidenav, content     |
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
- [[✅] - Authentication and state management](./README-AUTH-NGRX.md)
- [[✅] - Theming, Assets and translattions](./README-ASSETS-TRANSLATIONS.md)
- [[🟡] - CI/CD](./README-CI-CD.md)
- [[🟡] - Contribution Guide](./CONTRIBUTING.md)
- [[🟡] - Content Security Policw CSP](./README-CSP.md)
- [[✅] - Custom Form Builder and custom fields](src/app/shared/README-FORMS.md)
- [[✅] - Authentication Flow](src/app/core/README-CURRENT-AUTH.md)
- [[✅] - Environment Config as is](src/app/core/README-ENV-CONFIG-ASIS.md)
- [[❌] - Environment Config Upgrade Custom  Config – V1](src/app/core/README-ENV-CONFIG-UPGRADE-V1.md)
- [[❌] - Environment Config – Upgrade BFF V2](src/app/core/README-ENV-CONFIG-UPGRADE-V2-BBF.md)
- [[❌] - Authentication Flow Upgrade BFF](src/app/core/README-AUTH-UPGRADE-V2-BFF.md)


## 🧑‍💻 Author

**Angular Product Skeleton**  
Built by **Tarik Haddadi** using Angular 19 and modern best practices (2025).

