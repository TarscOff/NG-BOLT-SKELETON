
# 🔐 Authentication (Keycloak Broker, PKCE — iframe‑free)
>_Last updated: 2025-08-13_

**What**: Redirect-only OIDC login with **Keycloak** in a **Broker** realm. No `silent-check-sso.html`, no session-check iframe.

**Why**: Works with strict CSP. Simple SPA flow.

### Keycloak prerequisites
- Client type: **Public** with **PKCE S256**.
- **Valid Redirect URIs**: `https://<your-app>/*`
- **Web Origins**: `https://<your-app>`
- Optional Identity Providers (Azure, Google, …). Their **alias** can be used via `kc_idp_hint` to jump straight to an IdP.

### App behavior
- On app start: if not authenticated, **top-level redirect** to Keycloak (no iframe).
- After login: tokens live **in memory** and are refreshed periodically.
- HTTP requests include `Authorization: Bearer <access_token>`.
- Guards redirect to login when a protected route is accessed unauthenticated.

### Quick references
- **Force provider:** call login with `kc_idp_hint=<idp-alias>`.
- **Disable iframe:** `checkLoginIframe: false` (already in config above).


# 🗃️ State Management with NgRx (Store + Effects)

**Philosophy**  
- **Single global store** for app‑wide data (auth session, UI status, features).  
- **Feature slices** per domain (`auth`, `teamManagement`, …).  
- **Pure reducers**, **typed actions**, **selectors** for consumption.  
- **Functional effects** (Angular 16+) for side‑effects (HTTP, navigation, toasts).

**Folder layout (suggested)**
```
src/app/store/
  features/
    auth/
      auth.actions.ts
      auth.reducer.ts
      auth.selectors.ts
      auth.effects.ts   # functional effects
    other-feature/
      other-feature.actions.ts
      other-feature.reducer.ts
      other-feature.selectors.ts
      other-feature.effects.ts
```

**Conventions**
- **Action names**: `[Feature] verb object` (e.g., `[Auth] Login Redirect`).  
- **Reducers**: immutable updates, no side‑effects.  
- **Selectors**: the only way UI reads store. Compose them.  
- **Effects**: functional `createEffect(() => …, { functional: true })`.  
- **Persistence**: persist only what you need (e.g., `teamManagement`) using `ngrx-store-localstorage`. Never persist tokens.

**Auth in the Store**
- On app init, a small bootstrap dispatch **hydrates** from the Keycloak instance (profile, token expiry).  
- A periodic **refresh effect** updates `expiresAt` in store when Keycloak refreshes.  
- **Logout** clears `auth` slice; other slices subscribe to it if they need to reset on logout.

**Debugging**
- Enable **Store DevTools** in non‑prod.  
- Use **selectors** in components (`selectIsAuthenticated`, `selectProfile`, …).

## 👤 User Menu (optional UX)

Show user info (name/email/roles) and a **Logout** button in the sidenav. The app reads the profile from the JWT (e.g., `name`, `preferred_username`, `email`, `authorization` roles) and triggers `logout` to Keycloak.

## 🧑‍💻 Author

**Angular Product Skeleton**  
Built by **Tarik Haddadi** using Angular 19 and modern best practices (2025).

