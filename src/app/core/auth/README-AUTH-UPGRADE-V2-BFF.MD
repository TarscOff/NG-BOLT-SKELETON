2# Security Posture & Migration Plan – SPA → BFF
**Stack:** Angular 19 SPA + Keycloak (Broker, PKCE) + NgRx + Nginx (Docker)  
**Decision:** Keep the SPA for UI, **implement a BFF (Backend‑for‑Frontend)** to hold tokens server‑side.

---

## 1) Current State (As‑Is)

- **Auth**: Keycloak Authorization Code + **PKCE S256**, **redirect‑only** (no iframes, no `silent-check-sso.html`).  
- **Tokens**: live **only in `keycloak-js` memory**; **not persisted**; removed from NgRx store.  
- **Store**: contains **minimal user info** (`name`, `email`, optionally `isAuthenticated` & `expiresAt`).  
- **CSP**: strict & iframe‑free; `connect-src` limited to Keycloak + API.  
- **HTTP**: interceptor reads token from `keycloak().token` per request.  
- **Logout/Refresh**: handled by `keycloak-js` (`updateToken`, `logout`).

**Strengths**
- No token persistence; PKCE; CSP‑friendly; low ops complexity.

**Residual Risk**
- **XSS can still steal in‑memory tokens** (any SPA risk).

---

## 2) Target State (To‑Be): BFF Pattern

**Why BFF?** Eliminate SPA token exposure even under XSS; simplify CSP/CORS; centralize auth & refresh.

**Roles**
- **SPA (Angular)**: no tokens; interacts **only with the BFF** (same origin).  
- **BFF (Node/.NET/Go)**: performs OIDC (code+PKCE) server‑side; stores tokens in **server session** (e.g., Redis); **proxies** API with Bearer tokens.  
- **Keycloak**: IdP (brokered).  
- **API**: resource server; trusts Bearer tokens from BFF.

### Sequence (high‑level)
```
[SPA] -- /login --> [BFF] --redirect--> [Keycloak]
[User authenticates at Keycloak]
[Keycloak] -- callback(code) --> [BFF] -- exchange --> [Keycloak /token]
[BFF] stores tokens (server session) + sets HttpOnly session cookie to browser
[SPA] -- /api/* (Cookie) --> [BFF] -- (Bearer) --> [API] -- JSON --> [BFF] -- JSON --> [SPA]
[Logout] SPA -> BFF -> Keycloak -> destroy session + clear cookie
```

**Security properties**
- No tokens in JS runtime; HttpOnly cookie only.  
- `connect-src 'self'` (SPA never calls Keycloak or API directly).  
- CSRF protection on mutating routes.  
- Centralized token rotation/refresh on server.

---

## 3) Implementation Checklist

### A) Keycloak (Broker realm & client)
- [ ] Client uses **Authorization Code + PKCE S256**; **implicit/hybrid disabled**.  
- [ ] **Valid Redirect URIs** point to **BFF callback** endpoint(s) (exact origins, no wildcards).  
- [ ] **Web Origins**: exact SPA/BFF origin.  
- [ ] **Post‑logout redirect** URIs set to SPA root.  
- [ ] **Token lifetimes**: Access token **2–5 min**; sensible session idle/max.  
- [ ] **Refresh Token Rotation** + **Revoke Refresh Token** enabled; low max reuse.  
- [ ] Scopes/claims **minimal** (openid, profile, email unless more needed).

### B) BFF Server (same origin as SPA)
**Endpoints**
- [ ] `GET /login` → start OIDC (supports `?idp=<alias>` for broker).  
- [ ] `GET /oauth/callback` → handle `code`, exchange for tokens, create server session, redirect to SPA.  
- [ ] `GET /session` → returns `{isAuthenticated, user, roles, expiresAt}` (no tokens).  
- [ ] `ALL /api/*` → **proxy** to upstream API with `Authorization: Bearer <access_token>`.  
- [ ] `POST /logout` → call Keycloak logout, destroy session, **Clear‑Cookie**.

**Session & Security**
- [ ] Session store (Redis / encrypted cookie) with rotation.  
- [ ] Cookie: **HttpOnly; Secure; SameSite=Lax** (or Strict if UX allows).  
- [ ] **CSRF**: token on mutating endpoints (header or double submit).  
- [ ] Token refresh handled server‑side; rotate refresh token as returned.  
- [ ] Input validation & error handling; no token logs.

### C) SPA (Angular)
- [ ] Replace direct Keycloak init with **/session** bootstrap (SPA learns auth state from BFF).  
- [ ] All API calls go to **`/api/*` on BFF** (same origin).  
- [ ] Keep NgRx **token‑free**; store only user/profile & flags.  
- [ ] Login button → navigate to `/login` (optionally `?idp=`).  
- [ ] Logout button → `POST /logout` (with CSRF token).

### D) API (Resource server)
- [ ] Trust Keycloak issuer/audience; validate JWTs.  
- [ ] **CORS**: allow **BFF origin only** (or disable browser CORS if only server‑to‑server).  
- [ ] Avoid `*` with credentials; explicit methods/headers; preflight cache.

### E) Nginx / Headers / CSP
- [ ] **HSTS**: `Strict-Transport-Security: max-age=31536000; includeSubDomains; preload`.  
- [ ] `Referrer-Policy: strict-origin-when-cross-origin`.  
- [ ] `X-Content-Type-Options: nosniff`.  
- [ ] `Cross-Origin-Opener-Policy: same-origin`.  
- [ ] `Cross-Origin-Resource-Policy: same-site`.  
- [ ] `X-Frame-Options: DENY` and **CSP** with:  
  - Prod SPA CSP: `default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data: https:; font-src 'self' https: data:; connect-src 'self'; frame-src 'none'; frame-ancestors 'none'; base-uri 'self'; object-src 'none'`
  - (Note: BFF calls Keycloak/API server‑side; the browser only hits `'self'`.)

### F) CI/CD & Observability
- [ ] Pipeline **CSP smoke test** (curl headers from container).  
- [ ] **Dependency scan** (npm audit/Snyk) blocking on high/critical.  
- [ ] Optional **ZAP baseline** or Mozilla Observatory in non‑blocking → then blocking.  
- [ ] Optional **CSP reporting** endpoint to collect violations.

---

## 4) Small Plan (Phased)

### Phase 0 – Already Done
- [x] Tokens removed from NgRx store (store only `name`, `email`, etc.).  
- [x] CSP enforcing, iframe‑free; Keycloak redirect‑only.

### Phase 1 – Prep (1 week)
- [ ] Finalize Keycloak client settings (redirect URIs to BFF; PKCE only; lifetimes; rotation).  
- [ ] Stand up BFF skeleton: `/login`, `/oauth/callback`, `/session`, `/logout`, `/api/*` proxy.  
- [ ] Add security headers (HSTS, COOP, CORP, XFO).  
- [ ] CI: CSP smoke test + dependency audit.

**Exit criteria:** BFF starts, callback works locally, `/session` returns auth state after login.

### Phase 2 – Switch SPA to BFF (1 week)
- [ ] SPA uses `/session` to hydrate auth.  
- [ ] SPA calls `/api/*` (BFF proxy) instead of direct API.  
- [ ] Login/logout wired to BFF endpoints.  
- [ ] CSRF token flow implemented for `POST/PUT/DELETE`.

**Exit criteria:** App works end‑to‑end without `keycloak-js` in the browser; tokens never exposed to JS.

### Phase 3 – Harden & Clean (1 week)
- [ ] Enable refresh rotation verification; tighten lifetimes.  
- [ ] CSP restrict `connect-src 'self'` only.  
- [ ] Observability (CSP reports) optional.  
- [ ] ZAP baseline scan clean.

**Exit criteria:** Security checks green; simplified CSP; docs updated.

---

## 5) Definition of Done

- [ ] **No tokens** in browser (storage, memory, logs, DevTools).  
- [ ] SPA uses only the **BFF**; no direct calls to Keycloak/API.  
- [ ] **CSP** in prod: `connect-src 'self'`; `frame-src 'none'`.  
- [ ] **HSTS/COOP/CORP/XFO** headers present.  
- [ ] **Keycloak**: PKCE only; exact origins; short lifetimes; refresh rotation.  
- [ ] **API**: CORS restricted to BFF; JWT validated.  
- [ ] **CI/CD**: dependency scan + CSP smoke test; optional ZAP baseline.  
- [ ] Runbook & onboarding docs updated.

---

## 6) FAQ

**Q: Can we keep the SPA flow for dev?**  
A: Yes. You can run SPA‑only in dev with a looser CSP and keep the BFF flow in staging/prod. But it’s simpler to use BFF consistently.

**Q: Do we still need NgRx for auth?**  
A: Yes for UI state (user info, flags). But keep **no tokens** in state.

**Q: What about SSO across tabs?**  
A: The BFF session cookie covers tabs. Server token refresh is centralized.

---

## 7) Owners & Review

- **Security lead:** …  
- **BFF owner:** …  
- **Frontend owner:** …  
- **API owner:** …

**Last updated:** 2025-08-12
