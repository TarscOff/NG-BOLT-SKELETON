# Serve Config from the BFF – Implementation Process
_Last updated: 2025-08-12_


This document explains **how to move runtime configuration out of the SPA** and **serve it from the BFF**. The BFF becomes the **source of truth** for per-tenant, per-role, per-environment features and menus.

---

## 1) What we’re building
- A **BFF endpoint** that returns the **effective config** for the current session/user:
  - Pruned by **tenant** and **roles**
  - Honoring `enabled`, `requireAuth`, `allow.tenants`
  - Including `variants` (e.g., AI provider/model)
  - Returning only features the user is allowed to see (menus == features)
- The SPA will **fetch `/config`** at startup (instead of reading `/assets/config.json`).

---

## 2) Source of truth
- Keep **canonical configs** versioned in the repo or a config store (S3/Blob/DB):
  - `config.base.json`, `config.dev.json`, `config.uat.json`, `config.prod.json`
  - Optional overlays: `config.customer-<TENANT>.json`
- CI/CD **merges** preset + overlay + env overrides (FEATURE_*/AI_*).
- The **BFF loads** the merged canonical config at **startup** and on change (watcher or reload API).

---

## 3) Endpoint design
- `GET /config` → returns JSON with the **effective, filtered** config:
  - `200 OK` with body:
    ```json
    {
      "name": "dev",
      "appVersion": "1.4.3",
      "configVersion": "2025-08-12T10:00:00Z",
      "apiUrl": "https://api.example.com",
      "features": { /* filtered features map */ }
    }
    ```
  - Headers: `Cache-Control: private, max-age=60`, `ETag: "<hash>"`, `X-Config-Version: "<iso-or-gitsha>"`

**Related endpoints**
- `GET /session` → `{ isAuthenticated, user: {name,email,roles,tenant}, expiresAt }` (no tokens)
- `POST /config/reload` (ops/protected) → reload canonical config without restart (optional)

---

## 4) Filtering (server-side algorithm)
Given `user.roles: string[]`, `user.tenant: string | undefined`:
1. Start with the **canonical** `features` object.
2. For each feature `f`:
   - If `f.enabled !== true` → **drop**.
   - If `f.requireAuth === true` and `!isAuthenticated` → **drop**.
   - If `f.roles` exists and has **no intersection** with `user.roles` → **drop**.
   - If `f.allow.tenants` exists and **doesn’t include** `user.tenant` → **drop**.
3. Keep surviving features with their `key`, `label`, `icon`, `route`, `variants`, etc.
4. (Optional) Strip internal fields not needed by the client.
5. Return `{ name, apiUrl, features, appVersion, configVersion }`.

> Backend authorization must still be enforced; UI pruning is **not** security by itself.

---

## 5) Validation & safety
- Validate canonical config at **BFF startup** using a **JSON Schema** (ajv or similar).
- Reject startup if schema fails; log exact path to errors.
- On `/config/reload`, re-validate before swapping in-memory config.
- Unit-test the filtering against edge cases (missing roles/tenant, disabled features, variants).

---

## 6) Caching & performance
- Compute `featuresHash = sha256(JSON.stringify(filteredFeatures))` and set `ETag`.
- Support conditional requests: if `If-None-Match` matches, return `304 Not Modified`.
- TTL: `Cache-Control: private, max-age=60` is a safe default.
- For multi-node BFFs, keep canonical config in a shared store or invalidate via messaging.

---

## 7) SPA integration
- **ConfigService**: switch to `fetch('/config', { credentials: 'include' })`.
- **FeatureService**: consume the **filtered** `features` map from `ConfigService`:
  - `isEnabled(key)`, `visibleFeatures()`, `variant(path)` still work.
- **Route guards/menus**: unchanged, but now simpler because the list is pre-filtered.
- **CSP**: browser connects only to **'self'** (BFF origin).

Pseudo-bootstrap:
```ts
// ConfigService.load()
const res = await fetch('/config', { credentials: 'include' });
if (!res.ok) throw new Error('Config load failed');
this.config = await res.json();

// FeatureService
isEnabled(key: string) { return !!this.config.features?.[key]?.enabled; }
visibleFeatures() { return Object.values(this.config.features ?? {}); }
variant<T>(k: string, fb?: T): T { /* lookup in any feature's variants */ return fb as T; }
```

---

## 8) CI/CD changes
- Keep your existing **merge step** (preset + customer overlay + env var overrides) but **target the BFF** as the consumer:
  - Place merged config where the BFF reads it (e.g., `config/runtime/config.json` bundled into the image or mounted).
- Add **schema validation** in CI (ajv-cli).
- Optionally publish the canonical config to a config bucket (S3/Blob/KeyVault) and let the BFF load from there.

**Environment variables**
- `TENANT`, `FEATURE_*`, `AI_PROVIDER`, `AI_MODEL` continue to drive the merge.
- BFF gets `CONFIG_PATH` to locate the merged file; `/config/reload` re-reads it (optional).

---

## 9) Security checklist
- Browser never sees tokens; only hits `GET /config` with **HttpOnly** session cookie.
- `connect-src 'self'`, `frame-src 'none'` in CSP.
- `GET /config` must **not** include secrets (only flags/labels/variants/routes).
- Enforce **CSRF** on mutating BFF endpoints (not needed for `GET /config`).

---

## 10) Rollout plan
1. **Implement** `/config` in BFF (load → validate → filter → cache).
2. **Switch SPA** to `ConfigService.fetch('/config')`.
3. **Test** with two tenants → different menus/features.
4. **Add CI validation** + production CSP check.
5. **Monitor** with logs including `configVersion` and feature counts.

---

## 11) Test plan (minimal)
- **Unit (BFF)**: filtering cases (enabled/disabled, roles, tenants, requireAuth).
- **Unit (SPA)**: FeatureService consumes filtered config (no client filtering needed).
- **E2E**: 
  - Tenant A vs Tenant B: different menu items.
  - Unauthenticated: features with `requireAuth=true` are not returned.
  - 304 path exercised via ETag (do a second `/config`).

---

## 12) Example response (after filtering)
```json
{
  "name": "dev",
  "appVersion": "1.4.3",
  "configVersion": "2025-08-12T10:00:00Z",
  "apiUrl": "https://api.example.com",
  "features": {
    "ai.chat":   {
      "enabled": true,
      "key": "genai-chat",
      "label": "nav.genai-chat",
      "icon": "genai-chat",
      "route": "/genai-chat",
      "variants": {
        "ai.provider": "openai",
        "ai.model": "gpt-4o-mini"
      }
    },
    "reports":   {
      "enabled": true,
      "key": "reports",
      "label": "nav.reports",
      "icon": "reports",
      "route": "/reports"
    }
  }
}
```

---

## 13) Definition of Done
- `/config` returns **only** features the user can see.
- SPA boots using `/config`; CSP is simplified to `'self'`.
- CI validates canonical config; BFF validates at startup/reload.
- ETag works; short TTL caching works.
- No secrets in config; backend still enforces authorization.
