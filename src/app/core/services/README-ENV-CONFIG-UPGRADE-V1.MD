# Feature Flags, Menus & Tenants – Installation & Operations Guide

_Last updated: 2025-08-12_


This guide explains how to:
- Install and run the skeleton in **single-tenant** or **multi-tenant** mode
- Configure **features** (menus are features) from **runtime config**
- Bootstrap a **Feature Service** with the app
- Wire **guards/menu rendering**
- Prepare **CI/CD** to generate the right `config.json`
- Use a **pre-deployment checklist** to avoid mistakes

---

## 1) Concept

- A **feature** is both a capability **and** a menu entry (same config object).
- Visibility is controlled by:
  - `enabled` (on/off)
  - `roles` (who can see/use it)
  - `allow.tenants` (which customers can see/use it)
  - `requireAuth` (hide & guard if user is not authenticated)
- Feature **variants** tune behavior (e.g., AI provider or model).

**Important:** client-side flags only control **UI**. Your backend must enforce permissions/tenant constraints independently.

---

## 2) Goals

- Enable/disable **Push**, **SSE**, and **WebSocket** at **runtime** (per environment & tenant).
- Keep a **single build**; select transports via **config.json** (or **BFF /config**).
- Provide a tiny **RealtimeClient** abstraction and factory that picks the right transport.
- Keep everything **same-origin** via the **BFF** so CSP can be strict (`connect-src 'self'`).
- Make it easy to **test & toggle** via CI/CD variables.


## 3) Runtime Config Shape

Place this in `public/assets/config.*.json`, then CI copies/merges into `/assets/config.json` for the build.

```json
{
  "name": "dev",
  "production": false,
  "apiUrl": "https://api.example.com",
   "realtime": {
    "enabled": true,

    // Preferred order; app picks the first enabled & supported one
    "order": ["sse", "websocket", "push"],

    "transports": {
      "sse": {
        "enabled": true,
        "endpoint": "/rt/events"           // BFF SSE endpoint (same origin)
      },
      "websocket": {
        "enabled": false,
        "url": "wss://app.example.com/rt/ws" // BFF WS URL (same origin domain)
      },
      "push": {
        "enabled": false,
        "vapidPublicKey": "<PUBLIC_VAPID_KEY>", // safe to expose
        "topics": ["alerts", "jobs"],          // optional defaults
        "requireUserOptIn": true
      }
    }
  },
  "features": {
    "ai.chat": {
      "enabled": true,
      "variants": {
        "ai.provider": "openai",
        "ai.model": "gpt-4o-mini"
      },
      "roles": ["ROLE_user", "ROLE_admin"],
      "allow": { "tenants": ["clarence", "other_tenant"] },
      "key": "genai-chat",
      "label": "nav.genai-chat",
      "icon": "genai-chat",
      "route": "/genai-chat",
      "requireAuth": true
    },
    "ai.compare": {
      "enabled": true,
      "variants": {
        "ai.provider": "openai",
        "ai.model": "gpt-4o-mini"
      },
      "roles": ["ROLE_admin", "ROLE_user"],
      "allow": { "tenants": ["clarence", "other_tenant"] },
      "key": "genai-compare",
      "label": "nav.genai-compare",
      "icon": "genai-compare",
      "route": "/genai-compare",
      "requireAuth": true
    },
    "ai.workflows": {
      "enabled": true,
      "variants": {
        "ai.provider": "openai",
        "ai.model": "gpt-4o-mini"
      },
      "roles": ["ROLE_admin", "ROLE_user"],
      "allow": { "tenants": ["clarence", "other_tenant"] },
      "key": "genai-workflows",
      "label": "nav.genai-workflows",
      "icon": "genai-workflows",
      "route": "/genai-workflows",
      "requireAuth": true
    },
    "ai.projects": {
      "enabled": true,
      "roles": ["ROLE_admin", "ROLE_user", "ROLE_owner"],
      "allow": { "tenants": ["clarence", "other_tenant"] },
      "key": "genai-projects",
      "label": "nav.genai-projects",
      "icon": "genai-projects",
      "route": "/genai-projects",
      "requireAuth": true
    },
    "ai.admin": {
      "enabled": true,
      "roles": ["ROLE_admin"],
      "allow": { "tenants": ["clarence", "other_tenant"] },
      "key": "genai-admin",
      "label": "nav.genai-admin",
      "icon": "genai-admin",
      "route": "/genai-admin",
      "requireAuth": true
    },
    "reports": {
      "key": "reports",
      "label": "nav.reports",
      "icon": "reports",
      "route": "/reports",
      "enabled": true,
      "roles": ["ROLE_user"],
      "allow": { "tenants": ["clarence", "other_tenant"] },
      "requireAuth": true
    },
    "admin": {
      "key": "admin",
      "label": "nav.admin",
      "icon": "admin",
      "route": "/admin",
      "enabled": false,
      "roles": ["ROLE_admin"],
      "allow": { "tenants": ["clarence", "other_tenant"] },
      "requireAuth": true
    }
  }
}
```

### Field notes
- `key/label/icon/route` let a feature **render as a menu item**.
- `roles` is an **allow-list**. If provided, user must have at least one of them.
- `allow.tenants` is a **customer allow-list**. Leave empty/omit to allow all.
- `requireAuth: true` hides the feature and denies navigation if unauthenticated.
- `variants` can be read to decide providers/models at runtime.

---

## 4) Single-Tenant vs Multi-Tenant Installation

### Single-Tenant
- In CI, set `TENANT=<your-tenant>` (e.g., `TENANT=clarence`).
- Ensure all features you want include that tenant in `allow.tenants`.
- Optionally, strip other tenants from the merged config to reduce noise.
- Keycloak token must include a **tenant claim** that equals `TENANT` (e.g., `"tenant": "clarence"`).

### Multi-Tenant
- Leave multiple tenants in `allow.tenants` arrays.
- Keycloak token **must** include a tenant discriminator (e.g., `"tenant": "clarence"`).
- The **Feature Service** will evaluate visibility using both `roles` and `tenant` at runtime.

**Adding the tenant claim in Keycloak**
- Create a **protocol mapper** on the client (or realm) to add a custom claim, e.g., `tenant`.
- Value can come from user attribute, group, or a script mapper (depending on your realm design).

---

## 5) Feature Service (bootstraped with the app)

### Responsibilities
- Load the final `/assets/config.json` (via `ConfigService`) and expose:
  - `isEnabled(key, user): boolean` – requires `enabled=true`, role match, tenant match, and auth if `requireAuth`.
  - `visibleFeatures(user): Feature[]` – filtered list to build menus.
  - `variant<T>(path, fallback?): T` – read knobs like `variants["ai.provider"]`.
  - `list(): string[]` – list all feature keys.
- Provide helpers:
  - **Route Guard**: `featureGuard('ai.chat')` – checks `isEnabled` and optionally redirects to login/403.
  - **Directive**: `*appFeature="'ai.chat'"` – structural directive to show/hide UI blocks.

### Bootstrap
- Register the service in `app.config.ts` via a small `APP_INITIALIZER` that loads config first (you already do this for `ConfigService`).
- The Feature Service depends on:
  - **User roles** (from your NgRx `auth.profile`/Keycloak token), and
  - **Tenant** (from the Keycloak token custom claim).

> Keep the store **token-free**. Only pass `roles` and `tenant` to the Feature Service.

---

## 6) Menus = Features

- Build the sidenav/topnav by calling `featureService.visibleFeatures(user)`.
- Each feature includes `key/label/icon/route` so it can render directly as a menu item.
- If a menu item shouldn’t be linked to a feature, keep it outside of this system (rare).

---

## 7) CI/CD Process

**Inputs**
- Base and environment presets: `public/assets/config.base.json`, `config.dev.json`, `config.uat.json`, `config.prod.json`
- Optional **customer overlay**: `public/assets/config.customer-{TENANT}.json`
- Pipeline variables:
  - `TENANT` → single-tenant deployments
  - `FEATURE_*` → overrides per feature (`FEATURE_AI_CHAT=true/false`)
  - `AI_PROVIDER`, `AI_MODEL` → variant overrides

**Steps**
1. **Pick preset** by branch (`dev/uat/main`).  
2. **Overlay** customer config if `TENANT` is set and `config.customer-{TENANT}.json` exists.  
3. **Apply overrides** from env vars into `features[...]` and `features.[...].variants[...]`.  
4. **Validate** final JSON against a **schema** (fail on error).  
5. **Write** merged JSON to `public/assets/config.json` before `ng build`.  
6. Build, dockerize, and run existing **CSP smoke test**.

**Schema (excerpt)**
```json
{
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "type": "object",
  "properties": {
    "realtime": {
      "type": "object",
      "properties": {
        "enabled": { "type": "boolean" },
        "order": { "type": "array", "items": { "enum": ["sse", "websocket", "push"] } },
        "transports": {
          "type": "object",
          "properties": {
            "sse": {
              "type": "object",
              "properties": {
                "enabled": { "type": "boolean" },
                "endpoint": { "type": "string" }
              }
            },
            "websocket": {
              "type": "object",
              "properties": {
                "enabled": { "type": "boolean" },
                "url": { "type": "string" }
              }
            },
            "push": {
              "type": "object",
              "properties": {
                "enabled": { "type": "boolean" },
                "vapidPublicKey": { "type": "string" },
                "topics": { "type": "array", "items": { "type": "string" } },
                "requireUserOptIn": { "type": "boolean" }
              }
            }
          }
        }
      },
      "required": ["enabled", "order", "transports"]
    },
    "features": {
      "type": "object",
      "additionalProperties": {
        "type": "object",
        "properties": {
          "enabled": { "type": "boolean" },
          "roles": { "type": "array", "items": { "type": "string" } },
          "allow": {
            "type": "object",
            "properties": {
              "tenants": { "type": "array", "items": { "type": "string" } }
            }
          },
          "key": { "type": "string" },
          "label": { "type": "string" },
          "icon": { "type": "string" },
          "route": { "type": "string" },
          "requireAuth": { "type": "boolean" },
          "variants": { "type": "object" }
        },
        "required": ["enabled"]
      }
    }
  },
  "required": ["features"]
}
```

---

## 8) Pre-Deployment Checklist

**Config & Tenants**
- [ ] `TENANT` pipeline variable set correctly (single-tenant) or omitted (multi-tenant).
- [ ] For every enabled feature, `allow.tenants` contains the target tenant(s).
- [ ] `roles` values correspond to roles issued by Keycloak for this tenant.
- [ ] `requireAuth` matches expected UX (true for protected features).

**Keycloak**
- [ ] Client has **PKCE S256** code flow; implicit/hybrid off.
- [ ] Client/realm has a **tenant claim** mapper (e.g., `tenant`).
- [ ] Web Origins/Redirect URIs are exact (no wildcards).

**App**
- [ ] Feature Service bootstraps before routes render (init order ok).
- [ ] Menu is built from `visibleFeatures(user)`.
- [ ] Feature **guards** applied on routes (`canActivate` using `featureGuard`).

**CI/CD**
- [ ] Config merge step picked the right preset and overlays.
- [ ] Overrides applied (FEATURE_*, AI_PROVIDER/MODEL) as expected.
- [ ] JSON Schema validation **passed**.
- [ ] CSP smoke test **passed** (header present).

**Security**
- [ ] Tokens are not persisted client-side; store remains token-free.
- [ ] API enforces authorization/tenant checks server-side.
- [ ] CSP enforced in prod; CORS restricted to app origin(s).

**UX/i18n**
- [ ] All `label` keys exist in `/assets/i18n/*.json`.
- [ ] All `icon` names resolve in the icon set.
- [ ] Routes exist and lazy components load.

---

## 9) Rollout Plan (Proposal)

1. **Day 1** – Add `features` section to presets; create JSON Schema; wire CI merge + validation.  
2. **Day 2** – Implement Feature Service (isEnabled/visibleFeatures/variant/list) + route guard + structural directive.  
3. **Day 3** – Migrate the sidenav to use `visibleFeatures(user)`; add i18n keys and icons for all features.  
4. **Day 4** – Add tenant claim in Keycloak; test single-tenant deploy (`TENANT=<id>`).  
5. **Day 5** – E2E: one build, two tenants → different menus; guards block unauthorized routes; finalize docs.

---

## 10) Developer Cheatsheet

- **Check a feature:** `featureService.isEnabled('ai.chat', user)`  
- **Menu model:** `featureService.visibleFeatures(user)`  
- **Route guard:** `canActivate: [featureGuard('ai.chat')]`  
- **Template:** `*appFeature="'ai.chat'"`  
- **Variant:** `featureService.variant('ai.model', 'gpt-4o-mini')`

---

## 11) CI/CD Snippets – Merge Env Vars into `config.json`

Below are **copy-paste** snippets for **Azure Pipelines** and **GitLab CI** that:
1) pick the right preset (`config.dev|uat|prod.json`),  
2) overlay a **customer** file if `TENANT` is set,  
3) apply **FEATURE_*** and **variant** env var overrides, and  
4) write the final **`public/assets/config.json`**.

They use **jq** for JSON manipulation.

### Env var → Feature key mapping
We map environment variables to feature keys like this:

- `FEATURE_AI_CHAT` → `features["ai.chat"].enabled`
- `FEATURE_AI_COMPARE` → `features["ai.compare"].enabled`
- `FEATURE_AI_WORKFLOWS` → `features["ai.workflows"].enabled`
- `FEATURE_AI_PROJECTS` → `features["ai.projects"].enabled`
- `FEATURE_AI_ADMIN` → `features["ai.admin"].enabled`
- `FEATURE_REPORTS` → `features["reports"].enabled`
- `FEATURE_ADMIN` → `features["admin"].enabled`

Variant overrides (applied to all features that declare these variant keys):
- `AI_PROVIDER` → `.features[*].variants["ai.provider"]`
- `AI_MODEL` → `.features[*].variants["ai.model"]`

Tenant handling:
- If `TENANT` is set, we **ensure** it appears in `allow.tenants` for **every** feature.  
  (You can switch to “strict” mode to replace the list with only that tenant.)

---

### Azure Pipelines (YAML)

```yaml
# Add these steps inside your Build job, after npm install and before ng build
- script: |
    sudo apt-get update && sudo apt-get install -y jq

    # 1) Choose preset by branch
    if [ "$(Build.SourceBranchName)" = "main" ]; then
      PRESET=public/assets/config.prod.json
    elif [ "$(Build.SourceBranchName)" = "uat" ]; then
      PRESET=public/assets/config.uat.json
    else
      PRESET=public/assets/config.dev.json
    fi
    cp "$PRESET" public/assets/config.json

    # 2) Optional customer overlay if TENANT is set and file exists
    if [ -n "$TENANT" ] && [ -f "public/assets/config.customer-${TENANT}.json" ]; then
      jq -s '.[0] * .[1]' public/assets/config.json "public/assets/config.customer-${TENANT}.json" > public/assets/config.merged.json && mv public/assets/config.merged.json public/assets/config.json
    fi

    # 3) Feature flag mapping and overrides
    declare -A FEATURE_MAP=(
      [AI_CHAT]="ai.chat"
      [AI_COMPARE]="ai.compare"
      [AI_WORKFLOWS]="ai.workflows"
      [AI_PROJECTS]="ai.projects"
      [AI_ADMIN]="ai.admin"
      [REPORTS]="reports"
      [ADMIN]="admin"
    )

    for K in "${!FEATURE_MAP[@]}"; do
      VAR="FEATURE_${K}"
      VAL="${!VAR}"
      if [ -n "$VAL" ]; then
        # normalize booleans
        if echo "$VAL" | grep -qiE '^(1|true|yes|y)$'; then BOOL=true; else BOOL=false; fi
        jq --arg fk "${FEATURE_MAP[$K]}" --argjson b "$BOOL" '
          (.features[$fk].enabled) = $b
        ' public/assets/config.json > public/assets/config.tmp && mv public/assets/config.tmp public/assets/config.json
      fi
    done

    # 4) Variant overrides (applies to any feature that has the key)
    if [ -n "$AI_PROVIDER" ]; then
      jq --arg v "$AI_PROVIDER" '
        .features |= with_entries(
          if (.value.variants and .value.variants["ai.provider"]) then
            .value.variants["ai.provider"] = $v | .
          else . end
        )
      ' public/assets/config.json > public/assets/config.tmp && mv public/assets/config.tmp public/assets/config.json
    fi

    if [ -n "$AI_MODEL" ]; then
      jq --arg v "$AI_MODEL" '
        .features |= with_entries(
          if (.value.variants and .value.variants["ai.model"]) then
            .value.variants["ai.model"] = $v | .
          else . end
        )
      ' public/assets/config.json > public/assets/config.tmp && mv public/assets/config.tmp public/assets/config.json
    fi

    # 5) Tenant allow-list handling
    if [ -n "$TENANT" ]; then
      # "loose" mode: ensure TENANT is present (append if missing)
      jq --arg t "$TENANT" '
        .features |= with_entries(
          .value.allow.tenants |= (
            if . == null then [ $t ]
            elif index($t) == null then . + [ $t ]
            else . end
          )
        )
      ' public/assets/config.json > public/assets/config.tmp && mv public/assets/config.tmp public/assets/config.json

      # For strict single-tenant deployments, replace the list entirely:
      # jq --arg t "$TENANT" '.features |= with_entries( .value.allow.tenants = [ $t ] )' public/assets/config.json > public/assets/config.tmp && mv public/assets/config.tmp public/assets/config.json
    fi

    echo "Effective config:"
    cat public/assets/config.json | jq .
  displayName: 'Merge config + apply feature/tenant overrides'

# Keep your existing step that runs ng build AFTER this
- script: |
    npm run build -- --configuration=production
  displayName: 'Build Angular App (after config merge)'
```

> Tip: set pipeline variables in Azure as **Variables** or via variable groups: `TENANT`, `FEATURE_AI_CHAT`, `AI_PROVIDER`, etc.

---

### GitLab CI (YAML)

```yaml
merge_config:
  image: alpine:3.20
  stage: build
  before_script:
    - apk add --no-cache jq bash coreutils
  script:
    - |
      # 1) Choose preset by branch
      if [ "$CI_COMMIT_BRANCH" = "main" ]; then
        PRESET=public/assets/config.prod.json
      elif [ "$CI_COMMIT_BRANCH" = "uat" ]; then
        PRESET=public/assets/config.uat.json
      else
        PRESET=public/assets/config.dev.json
      fi
      cp "$PRESET" public/assets/config.json

      # 2) Optional customer overlay
      if [ -n "$TENANT" ] && [ -f "public/assets/config.customer-${TENANT}.json" ]; then
        jq -s '.[0] * .[1]' public/assets/config.json "public/assets/config.customer-${TENANT}.json" > public/assets/config.merged.json && mv public/assets/config.merged.json public/assets/config.json
      fi

      # 3) Feature overrides
      declare -A FEATURE_MAP=(
        [AI_CHAT]="ai.chat"
        [AI_COMPARE]="ai.compare"
        [AI_WORKFLOWS]="ai.workflows"
        [AI_PROJECTS]="ai.projects"
        [AI_ADMIN]="ai.admin"
        [REPORTS]="reports"
        [ADMIN]="admin"
      )

      for K in "${!FEATURE_MAP[@]}"; do
        VAR="FEATURE_${K}"
        VAL="${!VAR}"
        if [ -n "$VAL" ]; then
          if echo "$VAL" | grep -qiE '^(1|true|yes|y)$'; then BOOL=true; else BOOL=false; fi
          jq --arg fk "${FEATURE_MAP[$K]}" --argjson b "$BOOL" '
            (.features[$fk].enabled) = $b
          ' public/assets/config.json > public/assets/config.tmp && mv public/assets/config.tmp public/assets/config.json
        fi
      done

      # 4) Variants
      if [ -n "$AI_PROVIDER" ]; then
        jq --arg v "$AI_PROVIDER" '
          .features |= with_entries(
            if (.value.variants and .value.variants["ai.provider"]) then
              .value.variants["ai.provider"] = $v | .
            else . end
          )
        ' public/assets/config.json > public/assets/config.tmp && mv public/assets/config.tmp public/assets/config.json
      fi

      if [ -n "$AI_MODEL" ]; then
        jq --arg v "$AI_MODEL" '
          .features |= with_entries(
            if (.value.variants and .value.variants["ai.model"]) then
              .value.variants["ai.model"] = $v | .
            else . end
          )
        ' public/assets/config.json > public/assets/config.tmp && mv public/assets/config.tmp public/assets/config.json
      fi

      # 5) Tenant allow-list
      if [ -n "$TENANT" ]; then
        jq --arg t "$TENANT" '
          .features |= with_entries(
            .value.allow.tenants |= (
              if . == null then [ $t ]
              elif index($t) == null then . + [ $t ]
              else . end
            )
          )
        ' public/assets/config.json > public/assets/config.tmp && mv public/assets/config.tmp public/assets/config.json
      fi

      echo "Effective config:"
      cat public/assets/config.json | jq .
  artifacts:
    paths:
      - public/assets/config.json
    expire_in: 1 week
```

> Set variables in **GitLab → Settings → CI/CD → Variables**: `TENANT`, `FEATURE_AI_CHAT`, `FEATURE_AI_ADMIN`, `AI_PROVIDER`, `AI_MODEL`, etc.

---

### Optional: JSON Schema Validation in CI

You can use **ajv-cli** to validate `config.json` against a JSON Schema:

```yaml
- script: |
    npm i -g ajv-cli
    ajv validate -s ci/config.schema.json -d public/assets/config.json
  displayName: 'Validate config.json against schema'
```

Keep your schema under `ci/config.schema.json`. Fail the pipeline if validation fails.

---
# REALTIME INTEGRATION
## 1) App wiring (lightweight & pluggable)

### 1.1 Interface
```ts
export interface RealtimeClient {
  connect(): Promise<void>;
  disconnect(): void;
  subscribe(channel: string, cb: (data: unknown) => void): () => void; // unsubscribe
  publish?(channel: string, payload: unknown): Promise<void>;          // optional
}
```

### 1.2 Implementations (thin)
- **SSE**: `EventSource(endpoint)`; decode events and call handlers.
- **WebSocket**: `WebSocket(url)`; JSON message routing by `channel`.
- **Push**: Service Worker registers; app just manages subscription (no live socket).

### 1.3 Selection factory
Pick the first transport from `realtime.order` that is enabled and supported:

```ts
function chooseRealtimeClient(cfg, deps): RealtimeClient | null {
  if (!cfg.realtime?.enabled) return null;
  const order = cfg.realtime.order ?? [];
  for (const t of order) {
    const rt = cfg.realtime.transports?.[t];
    if (!rt?.enabled) continue;
    if (t === 'sse')       return new SseClient(rt.endpoint, deps.http);
    if (t === 'websocket') return new WebSocketClient(rt.url);
    if (t === 'push')      return new PushClient(rt.vapidPublicKey, deps.serviceWorker);
  }
  return null;
}
```

### 1.4 Feature usage
- Each routed view asks `FeatureService` for `feature.realtime` and subscribes accordingly:
  - If `transport === "off"` → skip.
  - If `channels` provided → subscribe per channel on `ngOnInit`, unsubscribe on `ngOnDestroy`.

---

## 2) BFF expectations

Keep realtime **same-origin** behind the BFF:

- **SSE**  
  - `GET /rt/events` streams events for the authenticated session.  
  - Auth via **HttpOnly session cookie** (no Bearer in JS).  
  - Server may multiplex channels per query `?channels=a,b` or via initial event.

- **WebSocket**  
  - `wss://app/rt/ws` upgrades on the BFF.  
  - Auth via the same **session**; optionally a CSRF token in the initial message for safety.  
  - BFF maps logical **channels** to backend topics.

- **Push**  
  - `POST /push/subscribe` / `POST /push/unsubscribe` with the **PushSubscription** JSON.  
  - BFF stores the subscription keyed to the session user/tenant and performs VAPID-signed sends.

> Token handling stays **server-side**. The browser uses cookies only.

---

## 3) CSP & Security

- With **SSE only**: `connect-src 'self'` is sufficient.  
- If **WebSocket**: ensure `connect-src` covers your `wss://` origin.  
- **Push** requires HTTPS + SW. Do **not** put private VAPID keys in config (server-only).  
- Keep tokens out of the browser; BFF authenticates realtime endpoints via cookies.  
- Apply **CSRF** to mutating endpoints; not needed for `GET /rt/events`.

---

## 4) CI/CD — Variables & Merge

Use your existing `jq`-based merge step and add these **env vars**:

- `REALTIME_ENABLED=true|false` → `.realtime.enabled`
- `REALTIME_ORDER="sse,websocket,push"` → `.realtime.order`
- `REALTIME_SSE_ENABLED=true|false` → `.realtime.transports.sse.enabled`
- `REALTIME_SSE_ENDPOINT="/rt/events"` → `.realtime.transports.sse.endpoint`
- `REALTIME_WS_ENABLED=true|false` → `.realtime.transports.websocket.enabled`
- `REALTIME_WS_URL="wss://app.example.com/rt/ws"` → `.realtime.transports.websocket.url`
- `REALTIME_PUSH_ENABLED=true|false` → `.realtime.transports.push.enabled`
- `REALTIME_VAPID_PUBLIC="<PUBLIC_VAPID_KEY>"` → `.realtime.transports.push.vapidPublicKey`
- `REALTIME_PUSH_TOPICS="alerts,jobs"` → `.realtime.transports.push.topics`
- `REALTIME_PUSH_REQUIRE_OPTIN=true|false` → `.realtime.transports.push.requireUserOptIn`

**Azure/GitLab `jq` examples (append to your merge step):**
```bash
# Real-time globals
[ -n "$REALTIME_ENABLED" ] && jq --argjson v $(echo $REALTIME_ENABLED | grep -qiE '^(1|true|yes|y)$' && echo true || echo false)   '.realtime.enabled = $v' config.json > tmp && mv tmp config.json

[ -n "$REALTIME_ORDER" ] && jq --arg v "$REALTIME_ORDER"   '.realtime.order = ($v | split(",") | map(gsub("\s+"; "")))' config.json > tmp && mv tmp config.json

# SSE
[ -n "$REALTIME_SSE_ENABLED" ] && jq --argjson v $(echo $REALTIME_SSE_ENABLED | grep -qiE '^(1|true|yes|y)$' && echo true || echo false)   '.realtime.transports.sse.enabled = $v' config.json > tmp && mv tmp config.json
[ -n "$REALTIME_SSE_ENDPOINT" ] && jq --arg v "$REALTIME_SSE_ENDPOINT"   '.realtime.transports.sse.endpoint = $v' config.json > tmp && mv tmp config.json

# WebSocket
[ -n "$REALTIME_WS_ENABLED" ] && jq --argjson v $(echo $REALTIME_WS_ENABLED | grep -qiE '^(1|true|yes|y)$' && echo true || echo false)   '.realtime.transports.websocket.enabled = $v' config.json > tmp && mv tmp config.json
[ -n "$REALTIME_WS_URL" ] && jq --arg v "$REALTIME_WS_URL"   '.realtime.transports.websocket.url = $v' config.json > tmp && mv tmp config.json

# Push
[ -n "$REALTIME_PUSH_ENABLED" ] && jq --argjson v $(echo $REALTIME_PUSH_ENABLED | grep -qiE '^(1|true|yes|y)$' && echo true || echo false)   '.realtime.transports.push.enabled = $v' config.json > tmp && mv tmp config.json
[ -n "$REALTIME_VAPID_PUBLIC" ] && jq --arg v "$REALTIME_VAPID_PUBLIC"   '.realtime.transports.push.vapidPublicKey = $v' config.json > tmp && mv tmp config.json
[ -n "$REALTIME_PUSH_TOPICS" ] && jq --arg v "$REALTIME_PUSH_TOPICS"   '.realtime.transports.push.topics = ($v | split(",") | map(gsub("\s+"; "")))' config.json > tmp && mv tmp config.json
[ -n "$REALTIME_PUSH_REQUIRE_OPTIN" ] && jq --argjson v $(echo $REALTIME_PUSH_REQUIRE_OPTIN | grep -qiE '^(1|true|yes|y)$' && echo true || echo false)   '.realtime.transports.push.requireUserOptIn = $v' config.json > tmp && mv tmp config.json
```

> Replace `config.json` path with `public/assets/config.json` or your working file in the pipeline.

---

## 5) Testing Plan

- **Unit (client)**: 
  - Selection factory picks correct transport for combinations of config/env.
  - SSE/WS clients call handlers and unsubscribe correctly.
  - Push client requests permission only if `requireUserOptIn`.
- **Unit (BFF)**:
  - SSE endpoint streams only authorized channels; WS authenticates on upgrade.
  - Push subscription endpoints validate session and store safely.
- **Integration**:
  - Feature route subscribes to its `channels` and updates UI.
  - Switching `REALTIME_ORDER` flips selection without code changes.
- **E2E**:
  - Tenant A and B: different features → different subscribes.
  - SSE fallback when WS disabled; Push off when no permission.

---

## 6) Pre‑Deployment Checklist (Realtime)

- [ ] `realtime.enabled` matches the environment needs.
- [ ] For **SSE**: `/rt/events` reachable via BFF; CSP allows `connect-src 'self'`.
- [ ] For **WebSocket**: `wss://` URL correct; CSP includes it; load balancer/WebSocket upgrade allowed.
- [ ] For **Push**: HTTPS, Service Worker registered, **public** VAPID key set; private key stored server-side only.
- [ ] No secrets in `config.json`; tokens not exposed to JS.
- [ ] CI schema validation passed; pipelines set `REALTIME_*` vars as intended.
- [ ] BFF logs include `configVersion` and realtime selections for observability.

---

## 7) Troubleshooting

- **Nothing connects** → Check `realtime.enabled` and the chosen transport in logs. Validate CSP `connect-src`.
- **SSE disconnects** → Ensure no proxy timeouts; add heartbeats; retry with backoff.
- **WS 101 upgrade fails** → Verify reverse proxy supports WebSocket and correct `wss://` URL.
- **Push permission denied** → Respect user opt-in; surface a settings UI to re-prompt.
- **Wrong transport used** → Inspect `realtime.order` & per-transport `enabled`; remember the app picks the **first** viable one.

---

## 8) Definition of Done

- Runtime toggles select **one** transport cleanly per env/tenant.
- SSE/WS/Push remain **same-origin** (BFF) with cookies; no tokens in browser.
- CSP is as strict as possible (ideally `connect-src 'self'` with SSE or WS on same origin).
- CI variables override config without rebuilds; schema validation in CI and BFF.
- Per-feature overrides (`transport`, `channels`) work and are easy to test.
