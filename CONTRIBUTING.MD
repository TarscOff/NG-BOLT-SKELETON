# CONTRIBUTING

**Core repo** for the Angular 19 + NgRx + Keycloak skeleton that powers multiple product apps.  
This document defines **how to contribute**, **how we release**, and **how consuming projects safely adopt updates** without disrupting **prod/uat/dev**.

_Last updated: 2025-08-12_

---


## 0) Principles

- **Single source of truth**: shared logic lives here; product apps consume it as a **versioned package (SDK)** from a private npm registry.
- **Predictable releases**: **Semantic Versioning (SemVer)** + **release channels** (`next` → `rc` → `latest`).
- **Safety first**: no breaking changes on minor/patch; feature flags for behavior changes; strong CI gates.
- **Clear upgrade path**: migration notes + automated PRs (Renovate) + environment-specific adoption rules.
- **Small PRs**: incremental, reviewed, tested.

---

## 1) Repository Model & Roles

- **Branch protections** on `main`:
  - Required checks: lint, unit tests, build, type-check, security scan, CSP smoke test, size check (optional), Storybook build (optional).
  - **Code Owners** review mandatory for affected areas.
  - Only **squash merges** from PRs (no direct pushes).
- **Release branches** (created by maintainers when needed): `release/x.y` for patch backports.
- **Labels**: `feat`, `fix`, `docs`, `refactor`, `perf`, `test`, `build`, `ci`, `chore`, `security`, `breaking`.
- **Roles**:
  - **Maintainers**: approve, cut releases, manage backports.
  - **Contributors**: open issues/PRs; follow guidelines.
  - **Security**: reviews auth/CSP/CORS/Keycloak-sensitive changes.

---

## 2) Development Workflow

1. **Fork/clone** the repo; create a **feature branch** from `main`: `feat/short-desc` or `fix/short-desc`.
2. Keep branches **rebased** on `main` (avoid merge commits).
3. Follow **Conventional Commits**:
   - `feat(forms): add chips field`
   - `fix(auth): refresh token race`
   - `docs(readme): add quick start`
   - For breaking changes: `feat(config)!: rename variant key` + `BREAKING CHANGE:` footer.
4. Ensure **lint + unit tests** pass locally.
5. Open a PR with a **clear description** and checklist:
   - Motivation & context
   - Implementation details
   - Screenshots/Storybook link if UI
   - Tests added/updated
   - Docs updated (README/docs/*)
   - Backward compatibility notes
6. Address review feedback; **squash-merge** into `main` when approved.

> Tip: use `pnpm`/`npm ci` for clean installs; avoid lockfile churn.

---

## 3) Coding Standards

- **TypeScript strict** (`strict`, `strictTemplates`).
- **ESLint + Prettier**; no unused exports; prefer pure functions.
- **Angular**: standalone components; inject() for DI; functional guards/effects.
- **NgRx**: reducers pure; effects functional; keep **no tokens** in store.
- **Security**: CSP-compatible (no iframes); avoid `unsafe-eval`; sanitize dynamic HTML.
- **Testing**:
  - **Unit**: services, guards, FeatureService, validators (≥80% coverage).
  - **Storybook** for shared UI (with a11y addon).
  - **E2E** (Playwright/Cypress) for auth flows (smoke).
- **Docs**: update docs in `docs/` + changelogs (see Releases).

---

## 4) Package Architecture (SDK)

This repo ships a **versioned library** (or multiple packages) to a **private npm registry**. Product apps consume it via `package.json`.

**Structure example**:
```
projects/
  sdk/                # Angular library (ng-packagr)
    src/
    public-api.ts     # Public API surface
  bff-helpers/        # Optional Node helpers for BFF (separate package)
```

**Do:**
- Expose stable APIs via **barrels** (`public-api.ts`).
- Keep breaking changes behind **major** bumps and provide migration docs.
- Keep external deps minimal; prefer **peerDependencies** for Angular, RxJS, NgRx, Material.

---

## 5) Branching & Release Strategy

### Branching
- `main` = trunk; always releasable.
- `release/x.y` = maintenance branch for **patches** on an older minor line.

### Versioning (SemVer)
- **MAJOR**: breaking API changes.
- **MINOR**: backward-compatible features.
- **PATCH**: backward-compatible bug fixes.

### Channels & dist-tags
- **`next`**: prerelease builds (beta/canary) → dev environments.
- **`rc`**: release candidates → UAT environments.
- **`latest`**: stable GA → prod environments.
- Each published version can have multiple **dist-tags** without republishing (e.g., promote `v1.5.0` from `rc` to `latest`).

### Tooling
- **Changesets** (recommended) or **standard-version** for versioning + changelogs.
- Auto-generate **release notes** (JSON + Markdown).
- Git tags: `vX.Y.Z` created by CI on publish.

---

## 6) Release Pipeline (CI/CD)

**On every PR** (required checks):
- Lint, type-check, unit tests (coverage gate), build, Storybook build, CSP header smoke test, dependency scan.

**On merge to `main`**:
- Build + test + package.
- **Prerelease** to `next` (optional) for every merge, or nightly.
- Create changelog entry + tag if publishing.

**Promotion**:
- After soak in dev, **promote** the version to `rc`:
  ```bash
  npm dist-tag add @org/sdk@1.5.0 rc
  ```
- After UAT sign-off, **promote** to `latest`:
  ```bash
  npm dist-tag add @org/sdk@1.5.0 latest
  ```

**Backports**:
- Cherry-pick PRs to `release/x.y` for patch fixes; publish `x.y.z` with `latest` tag on that line.

---

## 7) Safe Adoption in Consuming Projects (no env disruption)

**Pin by channel per environment**:
- **dev** → `@org/sdk`: `dist-tag "next"` (or explicit prerelease `^1.6.0-next`).
- **uat** → `dist-tag "rc"` (or explicit `-rc`).
- **prod** → `dist-tag "latest"` (no prereleases).

**How to configure** (example `.npmrc` in CI/CD for each environment):
```
@org:registry=https://npm.private.local/
//npm.private.local/:_authToken=${NPM_TOKEN}
@org/sdk:tag=next     # dev pipeline
# @org/sdk:tag=rc     # uat pipeline
# @org/sdk:tag=latest # prod pipeline
```

**Renovate/Bot PRs**:
- Enable Renovate to raise **version bump PRs** automatically:
  - dev tracks `next`
  - uat tracks `rc`
  - prod tracks `latest`
- Each PR runs app CI + E2E; merge when green.

**Feature flags & BFF delivery**:
- New capabilities ship **disabled by default** and are toggled via **runtime config** served by the **BFF**.
- This lets you update the SDK without changing prod behavior.

**Lockfiles**:
- Commit lockfiles per app to avoid surprise upgrades.
- Update intentionally via Renovate PRs + human review.

**Breaking changes**:
- Only on **major** versions; apps can stay on previous major until ready.
- Provide **migration guides** and codemods when possible.

---

## 8) Proposing Changes (RFCs)

Use the RFC process for:
- Public API changes in the SDK
- New packages or deprecations
- Architectural changes (BFF interfaces, auth flow)

**RFC template** (open a PR in `rfcs/`):
- Problem statement
- Design & alternatives
- Impacted apps/packages
- Backward compatibility & migration
- Rollout plan & metrics

---

## 9) Security & Compliance

- **No secrets** in source or `config.json`; use CI secrets/KeyVault.
- **CSP**: keep iframe-free; prefer `connect-src 'self'`. Avoid `unsafe-inline` scripts.
- **Auth**: never store tokens in NgRx/browser; prefer **BFF** pattern.
- **Keycloak**: PKCE S256; short lifetimes; refresh rotation.
- **Dependencies**: run `npm audit`/Snyk in CI; block high/critical vulns.
- **Responsible disclosure**: report vulnerabilities privately to Security (see `SECURITY.md`).

---

## 10) Definition of Done (for PRs)

- [ ] Conventional Commit message (with `!` and migration notes if breaking).
- [ ] Unit tests added/updated (≥80% coverage maintained).
- [ ] Storybook stories updated for UI components.
- [ ] Docs updated (`docs/` and relevant READMEs).
- [ ] CSP/CORS/Keycloak implications reviewed (Security label if needed).
- [ ] Size/Perf impact considered (no huge bundles/regressions).
- [ ] All required CI checks green.

---

## 11) Hotfix & Backport Policy

- **Hotfix on `main`** when applicable; release as patch.
- If apps are pinned to an older minor: cherry-pick to `release/x.y` and publish `x.y.z` (tag: `latest` for that line).
- Keep a **support window** for the last **two minor** versions; older lines best-effort.

---

## 12) Local Setup & Testing

```bash
npm ci
npm run lint
npm run test
npm run build
# Storybook (if enabled)
npm run storybook
```

Run affected tests locally before pushing. Use **mock Keycloak/BFF** for deterministic tests.

---

## 13) Private Registry Setup (once per machine/CI)

Create or update `.npmrc`:
```
@org:registry=https://npm.private.local/
//npm.private.local/:_authToken=${NPM_TOKEN}
always-auth=true
```

> Ask DevOps for `NPM_TOKEN` with publish/install scopes.

---

## 14) Communication

- **Issues**: bugs/requests with repro steps and logs.
- **Discussions**: design questions; start RFCs for major changes.
- **Security**: email security team or open a private advisory.
- **Release notes**: see Git tags and `release-notes/` JSON.

---

## 15) FAQ

**Q: How do we update apps without risking prod?**  
A: Publish to **`next`** → dev apps upgrade via bot PRs. After soak, promote to **`rc`** → UAT upgrades. After sign-off, **promote dist-tag** to `latest` for prod. No code changes to the app needed; only dependency bump PRs per environment branch.

**Q: Can we force an app to stay on an older major?**  
A: Yes. Pin `@org/sdk` to `^1.x` and keep receiving 1.x patches via `latest-1` dist-tag if we define one, or maintain `release/1.x` with backports.

**Q: What about tenant-specific features?**  
A: Ship features **disabled by default**; enable per-tenant in the **BFF-served config**. No rebuild necessary.

---

Thank you for contributing! Keep changes small, documented, and tested. Consuming apps (and their users) will thank you.
