
# 🧭 Contributing Guide — Adding New NgRx Features
>
>_Last updated: 2026-01-13_

_This document explains how to add **host-specific** NgRx features to an app that already uses the SDK store. It covers project structure, wiring, patterns, runtime flags, testing, and common pitfalls._

> TL;DR: The SDK owns the root store. **Do not** call `provideStore()` in the host. Register your feature with `provideState(...)` and `provideEffects(...)` (eager or lazy).

---

## 1) Architecture & Responsibilities

### SDK (Core)

- Bootstraps the **root** NgRx store (`provideAppStore()`).
- Provides shared slices (e.g., theme, language, AI variants, auth) and shared effects.
- Optionally integrates Keycloak and feature flags.
- Exposes selectors/actions for host consumption.

### Host Application

- Adds **project-specific features** as separate NgRx slices.
- Wires those features **on top of** the SDK store via `provideState` / `provideEffects`.
- Optionally uses `@ngrx/component-store` for local, page-scoped state.

### Runtime flags

- **`hasNgrx`** (in `/assets/config.json`): when `false`, the app should run without global NgRx. Only register host features when this flag is `true`.
- **`auth.hasKeycloak`**: independent of NgRx. If `false`, the SDK runs in guest mode (guards allow, auth interceptor off).

---

## 2) Folder Structure (Host)

Create a feature folder under `src/app/store` (or your preferred location):

```
src/app/store/
  my-feature/
    my-feature.actions.ts
    my-feature.reducer.ts
    my-feature.selectors.ts
    my-feature.effects.ts
```

- **Actions**: just functions — no registration needed.
- **Selectors**: just functions — no registration needed.
- **Reducer**: must be registered (`provideState`).
- **Effects**: must be registered (`provideEffects`) if you have side-effects.

> Use `createFeature` to generate `featureKey`, reducer, and feature selectors together.

---

## 3) Step-by-Step: Create a Feature

### 3.1 Define Your State Model

Create interfaces in `src/app/store/interfaces/`:

- Define your feature state interface
- Include `loading: boolean` and `error?: string` for async operations
- Add enums for typed constants (e.g., status types, categories)

### 3.2 Create Actions

In `my-feature.actions.ts`:

- Use descriptive action names with feature prefix: `[MyFeature] Action Name`
- Create action triplets for async operations: `load`, `loadSuccess`, `loadFailure`
- Always serialize errors in failure actions: `props<{ error: string }>()`
- Include all necessary data in action payloads

### 3.3 Build Your Reducer

In `my-feature.reducer.ts`:

- Export a feature key constant for uniqueness
- Use `createReducer` with `on()` handlers
- Handle loading states consistently across async actions
- Reset errors when starting new operations
- Use immutable updates with spread syntax

### 3.4 Create Selectors

In `my-feature.selectors.ts`:

- Start with `createFeatureSelector` using your feature key
- Build basic selectors for each state property
- Create parameterized selectors for filtering/finding items
- Add computed selectors for derived state (counts, sorted lists)
- Group related data with combined selectors

### 3.5 Add Effects (if needed)

In `my-feature.effects.ts`:

- Use functional effects with `createEffect(() => {}, { functional: true })`
- Inject services with `inject()` pattern
- Handle errors gracefully and return failure actions
- Use appropriate operators (`mergeMap`, `switchMap`, `concatMap`)
- Add side-effects like toast notifications with `dispatch: false`

### 3.6 Export Your Feature

In `src/app/store/index.ts`:

- Export your reducer and effects for easy importing
- Follow consistent naming patterns

---

## 4) Registration Guidelines

### Choose Your Registration Strategy

- **Eager (global)**: Add to `app.config.ts` for features used app-wide
- **Lazy (route-scoped)**: Register in route providers for feature-specific functionality

### Registration Syntax

```ts
// In app.config.ts or route providers
provideState("featureName", MyFeatureReducer),
provideEffects(MyFeatureEffects),
```

**Remember**: Never call `provideStore()` - the SDK already provides the root store.

---

### 4.1 Development Best Practices

#### Naming Conventions

- Feature keys: unique, descriptive constants
- Actions: `[FeatureName] Verb Object`
- Selectors: `select` + descriptive name
- Effects: descriptive name + `Effect`

#### State Management

- Keep state normalized and flat when possible
- Use selectors for all data access, never access state directly
- Compose complex selectors from simpler ones
- Handle loading and error states consistently

#### Error Handling

- Always serialize errors before dispatching
- Provide meaningful error messages
- Reset errors when retrying operations
- Consider user-facing error notifications

#### Testing Strategy

- Unit test reducers with various action scenarios
- Test selectors with mock state
- Mock dependencies in effect tests
- Verify action dispatching in components

#### 4.2 Lazy (route-scoped) registration

Register on the route where the feature lives:

```ts
// src/app/app.routes.ts
import { Routes } from '@angular/router';
import { provideState } from '@ngrx/store';
import { provideEffects } from '@ngrx/effects';
import { myFeatureFeature } from './store/my-feature/my-feature.reducer';
import { loadItemsEffect } from './store/my-feature/my-feature.effects';

export const routes: Routes = [
  {
    path: 'reports',
    providers: [
      provideState(myFeatureFeature),
      provideEffects(loadItemsEffect),
    ],
    loadComponent: () => import('./features/reports/reports.component')
      .then(m => m.ReportsComponent),
  },
];
```

> Use lazy registration for large features or rare routes to keep boot lean.

---

## 5) Using Your Feature in Components

```ts
import { Component, inject } from '@angular/core';
import { Store } from '@ngrx/store';
import * as MyFeatureActions from '../store/my-feature/my-feature.actions';
import { selectItems, selectLoading } from '../store/my-feature/my-feature.reducer';

@Component({
  standalone: true,
  template: `
    <button (click)="load()">Load</button>
    <div *ngIf="loading$ | async">Loading…</div>
    <ul>
      <li *ngFor="let i of (items$ | async)">{{ i }}</li>
    </ul>
  `,
})
export class DemoComponent {
  private store = inject(Store);
  items$   = this.store.select(selectItems);
  loading$ = this.store.select(selectLoading);

  load() {
    this.store.dispatch(MyFeatureActions.loadItems());
  }
}
```

---

## 6) Integration Guidelines (SDK ↔ Host)

- **Root store ownership**: The SDK owns it. Host adds features with `provideState`/`provideEffects` only.
- **Selectors/actions from SDK**: Import and use them in Host features (e.g., listen to `SdkAuthActions.loginSuccess` from your Host effects).
- **Avoid cycles**: Host must not import SDK internals other than public exports (actions/selectors/services/tokens).
- **Runtime `hasNgrx` flag**: If you support running without NgRx, conditionally include your Host providers only when `hasNgrx=true`.
- **Serializability**: If NgRx runtime checks are on, **serialize errors** before dispatching (`String(err.message ?? err)` or a dedicated `serializeError` utility).

---

## 7) Patterns & Best Practices

- **Feature keys**: keep them **unique** across SDK + Host. Export a constant from your reducer.
- **Use `createFeature`**: it gives you a reducer, key, and basic selectors in one place.
- **Effects**:
  - Prefer **functional effects** (Angular 16+) for simple flows.
  - Use `mergeMap`/`switchMap` based on desired concurrency.
  - Emit `loadFailure` with a **string** or serializable object.
- **Selectors**: compose and memoize. Avoid doing heavy work in components.
- **ComponentStore**: great for page-scoped or isolated widgets — no global registration required.
- **DevTools**: enable in dev via `provideStoreDevtools`. Avoid enabling it twice (SDK should not force it).

---

## 8) Common Pitfalls

- **Calling `provideStore()` in the Host** → duplicates the root store and breaks DI.
- **Feature key collisions** with SDK slices.
- **Dispatching `Error` objects** → fails serializability checks; serialize first.
- **Unregistered effects** → actions fire, nothing happens.
- **Guarding on SDK state before it’s ready** → subscribe carefully; use SDK user context provider when available.

---

## 9) PR Checklist

- [ ] Feature key constant exported and unique.
- [ ] All actions, reducer, effects, selectors covered by basic tests.
- [ ] Effects return **serializable** payloads on failure.
- [ ] Feature registered eagerly or lazily (but not both).
- [ ] No additional `provideStore()` calls in the Host.
- [ ] No circular imports with SDK barrels.
- [ ] DevTools enabled only in dev.
- [ ] Docs updated if new runtime flags/config keys were added.

---

## 10) When NOT to use NgRx

- Ephemeral UI-only state (form validity, local component toggles).
- State that never crosses component boundaries.
- Highly localized logic better served by `@ngrx/component-store` or **signals**.

---

## 11) FAQ

**Q: Can I read SDK slices from my Host feature?**  
Yes. Import SDK selectors/actions from its public API and use them normally.

**Q: How do I avoid registering my Host feature when `hasNgrx=false`?**  
Put your `provideState`/`provideEffects` calls behind a conditional providers array built in `main.ts` after you’ve loaded `/assets/config.json`.

**Q: Can I lazy-register the same feature on two routes?**  
Yes, but register it **once** at a shared parent route or guard against duplicate registration.

---

Happy building!

## 🧑‍💻 Author

**Angular Product Skeleton**  
Built by **Tarik Haddadi** using Angular 19 and modern best practices (2025).
