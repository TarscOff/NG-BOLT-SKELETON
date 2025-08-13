# 🔒 Content Security Policy (CSP)
>_Last updated: 2025-08-13_

**Goal**: Lock down what the SPA can load/run; allow only calls to your API and Keycloak; **block iframes** entirely.

### Production policy (example)
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

### Dev tweaks (local only)
```
script-src 'self' 'unsafe-eval';
connect-src 'self' http://localhost:8080 http://localhost:4200 ws://localhost:4200;
```

### Rollout process
1. Start with **`Content-Security-Policy-Report-Only`** to observe violations.
2. Exercise login + API traffic; add any missing origins to `connect-src`.
3. Switch to enforcing **`Content-Security-Policy`** once clean.


# 🐳 Docker + Nginx (runtime‑templated CSP)

We ship one Docker image for all envs. At **container start**, we render Nginx from a template using environment variables to inject CSP + origins.

### Files
```
nginx/default.conf.template   # Nginx server + CSP header placeholder
docker/entrypoint.sh          # Renders the template using env vars, then starts nginx
```

### Runtime environment variables
- `KEYCLOAK_ORIGIN` — e.g. `https://keycloak.example.com`
- `API_ORIGINS` — space-separated list: `https://api.example.com https://files.example.com`
- `CSP_REPORT_ONLY` — `true|false` (recommend `true` in non-prod during rollout)

### Run locally
```bash
docker run -p 8080:80   -e KEYCLOAK_ORIGIN="http://localhost:8080"   -e API_ORIGINS="http://localhost:5000"   -e CSP_REPORT_ONLY=true   myorg/ai-product:dev-1.0.0
```

> SPA fallback is enabled in Nginx (`try_files ... /index.html`).


## 🧑‍💻 Author

**Angular Product Skeleton**  
Built by **Tarik Haddadi** using Angular 19 and modern best practices (2025).

