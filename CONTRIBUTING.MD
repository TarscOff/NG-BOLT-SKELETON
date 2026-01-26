# 🚀 Commit & Release Guide
>_Last updated: 2025-08-13_

**Core repo** for the Angular 19 + NgRx + Keycloak skeleton that powers multiple product apps.  
This document defines **how to contribute**, **how we release**, and **how consuming projects safely adopt updates** without disrupting **prod/uat/dev**.

### Branching
- `main` – stable
- `uat` – integration
- `develop` – development and test (To be checked and validated before the GO)
- `feature/<ticket-or-topic>` – new work
- `fix/<ticket-or-topic>` – hotfix
- `docs/<topic>` – docs changes

## ✅ Commits (Conventional Commits)

**Format**

```
type(scope?): subject
```

**Types:** `feat` | `fix` | `docs` | `style` | `refactor` | `perf` | `test` | `build` | `ci` | `chore` | `revert`

**Examples**

```bash
feat(auth): add refresh token flow
fix(ui): prevent double submit on Enter
docs(readme): add quick start
refactor(forms): split dynamic fields into subcomponents
```

**Mechanism**

Commit messages are auto-checked at commit time; non-conforming messages are rejected.

---

## 🚀 Versioning & Releases

Use these commands to bump the version (SemVer), tag it, and generate **JSON** release notes:

```bash
npm run release:patch   # 1.0.0 -> 1.0.1
npm run release:minor   # 1.0.0 -> 1.1.0
npm run release:major   # 1.0.0 -> 2.0.0
```

**Optional custom release commit message** (`%s` becomes the version):

```bash
npm run release:patch -- -m "chore(release): v%s – short note"
```

### What happens under the hood (Automatic Push)

- Bumps `package.json` via **standard-version**
- Creates a Git tag: `vX.Y.Z`
- Generates machine-readable notes at:  
  `release-notes/release-vX.Y.Z.json`
- Commits the JSON notes
- Pushes `HEAD` + tags (via `release:push`)

### You can Also try the No-push workflow (this only generates tags and config json, etc..)

```bash
npm run release:patch:nopush
npm run release:minor:nopush
npm run release:major:nopush
# then:
npm run release:push
```

### JSON notes

The generated JSON includes basic stats and grouped sections (features, fixes, breaking changes, etc.) derived from Conventional Commits.


## 0) Principles

- **Single source of truth**: shared logic lives here; product apps consume it as a **versioned package (SDK)** from a private npm registry.
- **Predictable releases**: **Semantic Versioning (SemVer)** + **release channels** (`next` → `rc` → `latest`).
- **Safety first**: no breaking changes on minor/patch; feature flags for behavior changes; strong CI gates.
- **Clear upgrade path**: migration notes + automated PRs (Renovate) + environment-specific adoption rules.
- **Small PRs**: incremental, reviewed, tested.


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


## 4) Definition of Done (for PRs)

- [ ] Conventional Commit message (with `!` and migration notes if breaking).
- [ ] Unit tests added/updated (≥80% coverage maintained).
- [ ] Storybook stories updated for UI components.
- [ ] Docs updated (`docs/` and relevant READMEs).
- [ ] CSP/CORS/Keycloak implications reviewed (Security label if needed).
- [ ] Size/Perf impact considered (no huge bundles/regressions).
- [ ] All required CI checks green.


## 5) Hotfix & Backport Policy (To be defined with CI/CD TEAM)

- **Hotfix on `main`** when applicable; release as patch.
- If apps are pinned to an older minor: cherry-pick to `release/x.y` and publish `x.y.z` (tag: `latest` for that line).
- Keep a **support window** for the last **two minor** versions; older lines best-effort.



## 🧑‍💻 Author

**Angular Product Skeleton**  
Built by **Tarik Haddadi** using Angular 19 and modern best practices (2025).