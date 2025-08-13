# Authentication & Security – Current SPA Setup (Angular 19 + Keycloak + NgRx)

>_Last updated: 2025-08-13_

This README documents **how authentication works today**, the **benefits** of the current setup, and the main **residual risks** with non-breaking **hardening suggestions**. It reflects the *current* SPA architecture (no BFF).

## 🧭 Architecture Summary

- **SPA (Angular 19)** with standalone APIs and **NgRx** for UI/state.
- **Keycloak (Broker realm)** for OIDC Code Flow with **PKCE (S256)**.
- **Tokens** are held **in memory** by `keycloak-js`. No browser storage.
- **NgRx** mirrors minimal session metadata (e.g., `isAuthenticated`, `profile`, `expiresAt`).  
  > If tokens exist in the `auth` slice, they are *in-memory only* and **not persisted** unless explicitly synced to storage (we do **not** persist the `auth` slice neither tokens informations on the store , we only take user information and authentication status).
- **CSP** is strict and **iframe-free** (`checkLoginIframe: false`, no `silent-check-sso.html`).


## 🔁 Process Flow (as-is)

1) **App Boot**
   - `APP_INITIALIZER` loads `/assets/config.json` (runtime config).
   - `keycloak-js` is initialized with:
     - `onLoad: "login-required"`
     - `pkceMethod: "S256"`
     - `checkLoginIframe: false`

2) **Login (Redirect-Only)**
   - If not authenticated, `keycloak.login()` triggers a **full-page redirect** to Keycloak.
   - User authenticates (at brokered IdP if applicable).
   - Keycloak redirects back with `?code=...` (authorization code).

3) **Token Exchange**
   - `keycloak-js` exchanges the `code` at Keycloak `/token` endpoint (XHR).
   - **Access token**, **ID token**, and **refresh token** are kept **in memory** inside `keycloak-js`.

4) **State & UI**
   - We **optionally** mirror session metadata in NgRx: `isAuthenticated`, `profile`, `expiresAt` (and currently also token fields; see hardening).
   - Components use selectors to read auth state for UI (menus, guards, etc.).

5) **API Calls**
   - An **HTTP interceptor** reads the **current** access token from `keycloak().token` and adds `Authorization: Bearer <token>` to API requests.

6) **Refresh**
   - A periodic task calls `keycloak.updateToken(60)` to refresh before expiry.
   - When refreshed, the store’s metadata (`expiresAt`) is updated so the UI can react.

7) **Logout**
   - `keycloak.logout({ redirectUri: window.location.origin })` clears the Keycloak session and we reset our NgRx `auth` slice.

8) **CSP**
   - No iframes used; only **Keycloak** and **API** origins are allowed in `connect-src`.
   - `frame-src 'none'` (no embedding).

---

## 📍 Where data lives

| Item                | Location                         | Persistence |
|---------------------|----------------------------------|-------------|
| Access/Refresh/ID   | `keycloak-js` (in-memory)        | ❌ (cleared on reload) |
| Session metadata    | NgRx `auth` slice                | ❌ (not persisted) |
| Runtime config      | `/assets/config.json`            | Static file |
| User profile (UI)   | From JWT claims → in state (UI)  | ❌          |

> **Important:** NgRx state is in memory by default. It is only persisted if we add a storage sync (we don’t for `auth`).


## 🔒 CSP Profile (prod example)

```
Content-Security-Policy:
  default-src 'self';
  script-src 'self';
  style-src  'self' 'unsafe-inline';
  img-src    'self' data: https:;
  font-src   'self' https: data:;
  connect-src 'self' https://keycloak.example.com https://api.example.com;
  frame-src 'none';
  frame-ancestors 'none';
  base-uri 'self';
  object-src 'none';
```

- Dev-only additions: `'unsafe-eval'` and local/ws origins in `connect-src`.
- No `frame-src` needed (no iframes/silent SSO).


## ✅ Benefits of the current approach

- **No persistent tokens in the browser** (memory-only in `keycloak-js`).
- **Modern OAuth2/OIDC**: Authorization Code + **PKCE (S256)**.
- **Strict CSP compatible**: no session-check iframe, no `silent-check-sso.html`.
- **Simple integration**: SPA calls **only** our API + Keycloak; easy `connect-src` rules.
- **NgRx clarity**: selectors drive UI; effects handle refresh/logout.
- **Low operational overhead**: no extra backend layer required.
- **IdP brokering**: easy provider jump via `kc_idp_hint`.


## ⚠️ Residual Risks / Vulnerabilities

- **XSS → token theft (in-memory)**  
  If an attacker executes JS in our page, they can read `keycloak().token`. CSP + Angular sanitization reduce risk, but **don’t make it zero**.

- **CSP trade-offs**  
  `style-src 'unsafe-inline'` (used by Angular Material) is less strict than hashing styles. Dev must ensure **no inline scripts**.

- **Misconfiguration risk**  
  Over-broad Keycloak **Redirect URIs**/**Web Origins** or API **CORS** could open attack paths. Keep origins exact and reviewed.

- **Token lifetimes**  
  Longer lifetimes increase risk if exfiltrated. (Tune realm/client lifetimes and rotation.)

- **Source maps**  
  Public source maps can help attackers find XSS. Keep off in prod (or protect).


## 🛡️ Non-Breaking Hardening (keep current architecture)

1) **Keycloak tuning**
   - Access token lifetime: **2–5 min**
   - Enable **Refresh Token Rotation**; reduce max reuse
   - Restrict scopes/claims (only what the UI needs)
   - Exact **Redirect URIs/Web Origins** (no wildcards)

2) **Headers (Nginx/API)**
   - `Strict-Transport-Security: max-age=31536000; includeSubDomains; preload`
   - `Referrer-Policy: strict-origin-when-cross-origin`
   - `X-Content-Type-Options: nosniff`
   - `Cross-Origin-Opener-Policy: same-origin`

3) **CSP discipline**
   - Enforce in prod (not report-only)
   - `connect-src`: only Keycloak + API origins
   - Consider **Trusted Types** if you want to further reduce DOM XSS

4) **CORS discipline (API)**
   - Allow only the SPA origin; avoid `*` with credentials


## 📌 Developer Checklist

- [ ] Do **not** persist the `auth` slice (no `ngrx-store-localstorage` keys for it)
- [ ] Do **not** log tokens or send them to analytics
- [ ] Interceptor reads tokens from `keycloak()` (not from store)
- [ ] DevTools: tokens redacted or not present; “Persist State” off
- [ ] CSP enforced in prod; dev extras only in dev
- [ ] Keycloak client: PKCE S256; exact Redirect URIs/Web Origins
- [ ] API CORS: only our frontend origin allowed
- [ ] Source maps: disabled or protected in prod


## 🧠 Notes

This is a **solid, industry-standard SPA** posture. The **main residual risk** is XSS → in-memory token theft. If that’s unacceptable for your data classification, the next step is a **BFF** (Backend-for-Frontend), which keeps tokens server-side (HttpOnly cookies to the SPA). We can revisit that architecture when needed.


## 🧑‍💻 Author

**Angular Product Skeleton**  
Built by **Tarik Haddadi** using Angular 19 and modern best practices (2025).