# Core SDK — Layout & Configuration Guide

> _Last updated: 2025‑12‑10_

This document explains how to configure and use the **`AppLayoutComponent`** from the Core SDK, including:
- **Dynamic logo configuration** from the hosting app
- **Dynamic toolbar actions** (e.g., Back, Export, Delete) that each routed page can publish
- **Navigation menu** with Material 3 components
- **User profile panel** with roles and logout
- **Quick settings dialog** (theme, language, AI configuration)

Works with **Angular 16–19+**, standalone components, Material 3, NgRx, and ngx-translate.

---

## Table of Contents

1. [Basic Usage in Routes](#1-basic-usage-in-routes)
2. [Logo Configuration](#2-logo-configuration)
3. [Dynamic Toolbar Actions](#3-dynamic-toolbar-actions)
4. [Navigation Menu](#4-navigation-menu)
5. [API Reference](#5-api-reference)

---

## 1) Basic Usage in Routes

The `AppLayoutComponent` is used as a parent route that wraps all your feature pages:

```ts
import { Routes } from '@angular/router';
import { UserRole } from '@cadai/pxs-ng-core/enums';
import { authGuard, featureGuard } from '@cadai/pxs-ng-core/guards';
import { AppLayoutComponent } from '@cadai/pxs-ng-core/shared';

export const routes: Routes = [
  {
    path: '',
    redirectTo: 'dashboard',
    pathMatch: 'full',
  },
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
        path: 'genai-chat',
        canActivate: [featureGuard('ai.chat', { forbid: '/403' })],
        data: { roles: [UserRole.ROLE_admin, UserRole.ROLE_user] },
        loadComponent: () =>
          import('./features/chat/chat.component').then(m => m.ChatPageComponent),
      },
      { 
        path: '403', 
        loadComponent: () => import('@cadai/pxs-ng-core/shared').then(m => m.ForbiddenComponent) 
      },
      { 
        path: '**', 
        loadComponent: () => import('@cadai/pxs-ng-core/shared').then(m => m.NotFoundComponent) 
      },
    ]
  }
];
```

---

## 2) Logo Configuration

The layout supports **dynamic logo configuration** from the hosting app via the `CoreOptions` interface.

### Step 1: Add Logo URL to App Configuration

In your hosting app's `app.config.ts`:

```ts
import { ApplicationConfig } from '@angular/core';
import { provideCore } from '@cadai/pxs-ng-core';

export const appConfig: ApplicationConfig = {
  providers: [
    provideCore({
      logoUrl: '/assets/images/my-company-logo.png', // ✅ Your custom logo
      appVersion: '1.0.0',
      theme: {
        primary: '#1976d2',
        accent: '#ff4081',
        warn: '#f44336',
      },
      i18n: {
        defaultLanguage: 'en',
        availableLanguages: ['en', 'fr', 'nl'],
      },
      // ...other options
    }),
    // ...other providers
  ],
};
```

### Step 2: Logo Fallback Behavior

The layout uses the following priority order:
1. **`CoreOptions.logoUrl`** (from `provideCore`)
2. **Default logo** (if not provided)

The logo is displayed in the sidenav header:

```html
<div class="nav-title">
  <img [src]="logoUrl" alt="Logo" class="logo" />
  {{ 'navigationTitle' | translate }}
</div>
```

### Styling the Logo

Add custom styles in your hosting app's global styles or theme:

```scss
.side-nav {
  .nav-title {
    .logo {
      max-width: 40px;
      max-height: 40px;
      object-fit: contain;
      margin-right: 12px;
    }
  }
}
```

---

## 3) Dynamic Toolbar Actions

The layout subscribes to a `ToolbarActionsService` that allows each routed page to publish its own buttons without modifying the layout code.

### Service Interface

The `ToolbarActionsService` (already implemented in Core SDK) exposes:

```ts
export type ButtonVariant = 'icon' | 'stroked' | 'raised' | 'flat';

export interface ToolbarAction {
  id: string;
  icon?: string;           // Material icon name
  label?: string;          // Translation key for button text
  tooltip?: string;        // Translation key for tooltip
  color?: ThemePalette;    // 'primary' | 'accent' | 'warn'
  variant?: ButtonVariant; // defaults to 'icon'
  class?: string;          // Additional CSS classes
  visible$?: Observable<boolean>;
  disabled$?: Observable<boolean>;
  click: () => void;
}

@Injectable({ providedIn: 'root' })
export class ToolbarActionsService {
  readonly actions$: Observable<ToolbarAction[]>;
  
  set(actions: ToolbarAction[]): void;
  add(...actions: ToolbarAction[]): void;
  remove(id: string): void;
  clear(): void;
  scope(destroyRef: DestroyRef, actions: ToolbarAction[]): void;
}
```

### Layout Integration

The `AppLayoutComponent` already includes the toolbar actions rendering:

```html
<mat-toolbar color="primary">
  <button mat-icon-button (click)="sidenav.toggle()">
    <mat-icon>menu</mat-icon>
  </button>
  <span class="title">{{ title$ | async }}</span>

  <span class="spacer"></span>

  <div class="custom-btns">
    @for (a of (toolbarActions$ | async) ?? []; track a.id) {
      @if ((a.visible$ | async) ?? true) {
        <!-- Icon variant -->
        @if ((a.variant ?? 'icon') === 'icon') {
          <button
            mat-icon-button
            [color]="a.color || 'primary'"
            [class]="a.class || ''"
            [matTooltip]="a.tooltip || '' | translate"
            [disabled]="a.disabled$ | async"
            (click)="a.click()"
          >
            <mat-icon [color]="a.color || 'primary'">{{ a.icon }}</mat-icon>
          </button>
        }
        <!-- Stroked variant -->
        @else if (a.variant === 'stroked') {
          <button
            mat-stroked-button
            [color]="a.color || 'primary'"
            [class]="a.class || ''"
            [matTooltip]="a.tooltip || '' | translate"
            [disabled]="a.disabled$ | async"
            (click)="a.click()"
          >
            @if (a.icon) {
              <mat-icon>{{ a.icon }}</mat-icon>
            }
            {{ a.label | translate }}
          </button>
        }
        <!-- Raised variant -->
        @else if (a.variant === 'raised') {
          <button
            mat-raised-button
            [color]="a.color || 'primary'"
            [class]="a.class || ''"
            [matTooltip]="a.tooltip || '' | translate"
            [disabled]="a.disabled$ | async"
            (click)="a.click()"
          >
            @if (a.icon) {
              <mat-icon>{{ a.icon }}</mat-icon>
            }
            {{ a.label | translate }}
          </button>
        }
        <!-- Flat variant (default) -->
        @else {
          <button
            mat-flat-button
            [color]="a.color || 'primary'"
            [class]="a.class || ''"
            [matTooltip]="a.tooltip || '' | translate"
            [disabled]="a.disabled$ | async"
            (click)="a.click()"
          >
            @if (a.icon) {
              <mat-icon>{{ a.icon }}</mat-icon>
            }
            {{ a.label | translate }}
          </button>
        }
      }
    }
  </div>
</mat-toolbar>
```

### Example: Page with Toolbar Actions

```ts
import { Component, DestroyRef, OnInit, inject } from '@angular/core';
import { Location } from '@angular/common';
import { Store } from '@ngrx/store';
import { map } from 'rxjs/operators';
import { ToolbarActionsService, ToolbarAction } from '@cadai/pxs-ng-core/services';
import { AppSelectors } from '@cadai/pxs-ng-core/store';

@Component({
  selector: 'app-dashboard',
  standalone: true,
  template: `<p>Dashboard Content</p>`,
})
export class DashboardComponent implements OnInit {
  private destroyRef = inject(DestroyRef);
  private toolbar = inject(ToolbarActionsService);
  private location = inject(Location);
  private store = inject(Store);

  private selectedCount$ = this.store
    .select(AppSelectors.ItemsSelectors.selectSelectedCount);

  ngOnInit(): void {
    const back: ToolbarAction = {
      id: 'back',
      icon: 'arrow_back',
      tooltip: 'back',
      color: 'primary',
      variant: 'icon',
      click: () => this.location.back(),
    };

    const exportCsv: ToolbarAction = {
      id: 'export',
      icon: 'download',
      label: 'export',
      tooltip: 'export',
      color: 'primary',
      variant: 'flat',
      click: () => this.exportToCsv(),
    };

    const deleteSel: ToolbarAction = {
      id: 'delete',
      icon: 'delete',
      label: 'delete',
      tooltip: 'delete',
      color: 'warn',
      variant: 'stroked',
      disabled$: this.selectedCount$.pipe(map(count => count === 0)),
      click: () => this.deleteSelected(),
    };

    const refresh: ToolbarAction = {
      id: 'refresh',
      icon: 'refresh',
      label: 'refresh',
      tooltip: 'refresh',
      color: 'accent',
      variant: 'raised',
      click: () => this.refreshData(),
    };

    // Set actions and auto-clear on component destroy
    this.toolbar.scope(this.destroyRef, [back, exportCsv, deleteSel, refresh]);
  }

  private exportToCsv() { /* ... */ }
  private deleteSelected() { /* ... */ }
  private refreshData() { /* ... */ }
}
```

### Patterns & Recipes

#### A) Role-based Visibility

```ts
const isAdmin$ = this.store
  .select(AppSelectors.AuthSelectors.selectRoles)
  .pipe(map(roles => roles?.includes('ROLE_admin') ?? false));

const adminSettings: ToolbarAction = {
  id: 'admin-settings',
  icon: 'admin_panel_settings',
  tooltip: 'admin_settings',
  visible$: isAdmin$,
  click: () => this.openAdminSettings(),
};
```

#### B) Conditional Disabled State

```ts
const saveAction: ToolbarAction = {
  id: 'save',
  icon: 'save',
  label: 'save',
  disabled$: this.form.statusChanges.pipe(
    map(status => status === 'INVALID')
  ),
  click: () => this.save(),
};
```

---

## 4) Navigation Menu

The layout includes an auto-generated navigation menu based on feature flags and roles.

### Menu Configuration

Navigation items are configured via `CoreOptions.features`:

```ts
provideCore({
  features: {
    dashboard: { enabled: true, label: 'Dashboard', icon: 'dashboard', route: '/dashboard' },
    'ai.chat': { enabled: true, label: 'AI Chat', icon: 'chat', route: '/genai-chat' },
    'ai.workflows': { enabled: false, label: 'Workflows', icon: 'account_tree', route: '/genai-workflows' },
    team: { enabled: true, label: 'Team', icon: 'people', route: '/team' },
  },
})
```

The menu automatically:
- Filters items based on `enabled` flag
- Shows/hides based on user roles (via route guards)
- Translates labels using `ngx-translate`
- Highlights active route
- Collapses labels when sidebar is minimized

---

## 5) API Reference

### `CoreOptions` Interface

```ts
export interface CoreOptions {
  logoUrl?: string;                    // Custom logo URL
  appVersion?: string;                 // Version displayed in footer
  theme?: CoreTheme;                   // Theme configuration
  i18n?: CoreI18nOptions;              // Internationalization
  features?: Record<string, Feature>;  // Feature flags & menu items
  interceptors?: HttpInterceptorFn[];  // HTTP interceptors
  animations?: boolean;                // Enable/disable animations
  environments?: RuntimeConfig;        // Runtime environment config
}
```

### `ToolbarAction` Interface

| Property    | Type                                        | Required | Description                               |
| ----------- | ------------------------------------------- | -------- | ----------------------------------------- |
| `id`        | `string`                                    | ✅       | Stable ID for tracking/removal            |
| `icon`      | `string`                                    |          | Material Icon name                        |
| `label`     | `string`                                    |          | Translation key for button text           |
| `tooltip`   | `string`                                    |          | Translation key for tooltip               |
| `color`     | `ThemePalette`                              |          | `'primary' \| 'accent' \| 'warn'`         |
| `variant`   | `'icon' \| 'stroked' \| 'raised' \| 'flat'` |          | Defaults to `'icon'`                      |
| `class`     | `string`                                    |          | Additional CSS classes                    |
| `visible$`  | `Observable<boolean>`                       |          | Stream to show/hide (default: visible)    |
| `disabled$` | `Observable<boolean>`                       |          | Disable button reactively                 |
| `click`     | `() => void`                                | ✅       | Click handler                             |

### `ToolbarActionsService` Methods

- `actions$: Observable<ToolbarAction[]>` — Current actions for the layout
- `set(actions: ToolbarAction[])` — Replace all actions
- `add(...actions: ToolbarAction[])` — Append actions
- `remove(id: string)` — Remove action by ID
- `clear()` — Remove all actions
- `scope(destroyRef: DestroyRef, actions: ToolbarAction[])` — Set actions with auto-cleanup on destroy

---

## 🧑‍💻 Author

**Angular Product Skeleton** — _Tarik Haddadi_  
Angular 19+, standalone APIs, runtime configs, NgRx, Keycloak integration.