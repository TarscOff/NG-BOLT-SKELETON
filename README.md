# AI Product – Angular 19 Skeleton

> 🚀 Modern Angular 19 project template with runtime environment configs, standalone components, NgRx state management, dynamic forms, internationalization, and full CI/CD support.

---

## 🧱 Project Overview

This repository provides a scalable, production-ready **Angular 19** setup using best practices including:

- ✅ **Standalone component architecture**
- 🌐 **Runtime environment configuration** via `public/assets/config.json`
- 🔄 **NgRx** for reactive global state management
- 🧩 **Dynamic Forms** system via reusable `FieldConfig` pattern
- 🌍 **Internationalization** with `@ngx-translate`
- 🎨 **Angular Material + CDK** UI framework
- 🦾 **CI/CD-ready** structure (Azure Pipelines & GitLab CI support)

---


## 📦 Tech Stack

- **Angular 19** with Standalone Components
- **NgRx** Store, Effects, Devtools
- **Angular Material + CDK**
- **RxJS 7.8**
- **@ngx-translate** for i18n
- **Signal-based ThemeService**
- **Strict TypeScript + ESLint**
- **Docker + CI/CD ready**

---

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

## ⚙️ Runtime Environment Config

Instead of Angular's build-time `environment.ts`, this project loads configuration **at runtime** via:

```ts
fetch('assets/config.json')
```

## ⚙️Available Configs
```text
public/assets/config.dev.json
public/assets/config.uat.json
public/assets/config.prod.json
```

Only config.json is loaded by the app, so CI/CD pipelines copy the correct version based on branch or env.
# Development build & serve
```
npm start                 # = ng serve
```
# Static builds
```
npm run build             # = ng build --configuration=development
npm run buildUat
npm run buildProd
```

# Watch mode
npm run watch

# Testing & Linting
npm run test
npm run lint

## 🚀 CI/CD Support
CI pipelines dynamically inject the correct config.json during build:
# Azure Pipelines & GitLab CI support:
```bash
# Example (GitLab or Azure):
cp public/assets/config.prod.json public/assets/config.json
npm run buildProd
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

---

## 📐 Features Used

- ✅ **Angular 19 Standalone APIs**
- ✅ **Runtime config injection** via `ConfigService`
- ✅ **NgRx** for scalable and reactive global state
- ✅ **Reactive Forms** with dynamic schema rendering
- ✅ **Internationalization (i18n)** via `@ngx-translate`
- ✅ **Angular Material** UI with responsive layout
- ✅ Integrated **Toasts**, **Dialogs**, and **Tooltips**
- ✅ Strict **TypeScript** config (`strict: true`) with ESLint
- ✅ **CI/CD-ready** with Azure Pipelines & GitLab CI support

---

## 📦 Future Ideas

- ✅ Add **Docker support** with runtime `config.json` injection
- 🔒 Add **Auth module** with JWT/session token handling
- 🧪 Add **E2E tests** using Cypress or Playwright

---

## 🧠 Notes

This project uses Angular strict mode (`strict: true`) and TypeScript with:

- `resolveJsonModule`
- `esModuleInterop`
- `strictTemplates`
- `noImplicitReturns`
- `noFallthroughCasesInSwitch`

---

## 🧑‍💻 Author

**AI Product Skeleton**  
Built by **Tarik Haddadi** using Angular 19 and modern best practices (2025).

## 🎨 Theming Support

This project includes a fully dynamic theming system that allows runtime switching between **light** and **dark** modes with the following structure:

### ✅ How It Works

- The app injects a `<link id="theme-style">` tag that is updated at runtime to switch between `light.css` and `dark.css` themes
- The `ThemeService` handles:
  - Toggling between modes via a signal
  - Saving the user's preference to `localStorage`
  - Updating the `<html>` tag with `light` or `dark` class
- The SCSS root includes a base Material theme using the `@use '@angular/material' as mat;` system, but the main theme variables are controlled via pre-generated Material tokens

### 📁 Theme File Structure

Theme CSS files are stored in:
```text
public/assets/theme/
├── light.css ← default light theme (Material Theme Generator)
└── dark.css ← dark theme variant
```