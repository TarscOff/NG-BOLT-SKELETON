<!-- filepath: c:\PROXIMUS_WORK\Skeleton Angular\README-GIT.md -->
# Starter App – CI/CD Setup (Azure DevOps & GitHub Actions)

>_Last updated: 2025-12-03_

This document explains how the CI/CD is configured for the **Starter App** across:

- **Azure DevOps** (build + Docker + push to ACR)
- **GitHub Actions** (build + Docker to GHCR + CSP test)

---

## 1. Project prerequisites

### 1.1 Node, Angular & Docker

The project assumes:

- **Node**: v20 (configured in all pipelines)
- **Angular**: standard Angular CLI project
- **Dockerfile** at repo root, with a multi-stage build:

```dockerfile
FROM node:18-alpine AS builder
WORKDIR /app
COPY . .
RUN npm ci
RUN npm run build -- --configuration=production

FROM nginx:alpine
COPY --from=builder /app/dist/psx-ng-skeleton /usr/share/nginx/html
COPY nginx/default.conf.template /etc/nginx/conf.d/default.conf.template
COPY docker-entrypoint.sh /docker-entrypoint.sh
RUN chmod +x /docker-entrypoint.sh

EXPOSE 80
ENTRYPOINT ["/docker-entrypoint.sh"]
```

The Angular build output is expected at:

```text
dist/psx-ng-skeleton
```

### 1.2 Environment config files

The Angular app uses a runtime `config.json` copied from branch-specific files:

- `public/assets/config.prod.json`
- `public/assets/config.uat.json`
- `public/assets/config.dev.json`

Each pipeline copies the right file to `public/assets/config.json` **before** building.

Branch mapping:

- `main` → `config.prod.json` → `--configuration=production`
- `uat`  → `config.uat.json` → `--configuration=uat`
- everything else (`develop`, `staging`, feature branches) → `config.dev.json` → `--configuration=development`

### 1.3 Azure Artifacts npm feed

All CI systems restore dependencies (including `@cadai/*`) from **Azure Artifacts**.

The repo contains a `.npmrc` at root with registry configuration (no secrets):

```ini
registry=https://registry.npmjs.org/

@cadai:registry=https://pkgs.dev.azure.com/cadai/Socle/_packaging/PXS-NG-CORE/npm/registry/
```

Authentication is injected at CI time via a **Personal Access Token (PAT)**.

---

## 2. Azure DevOps – `azure-pipelines.yml`

### 2.1 Triggers

The pipeline runs on:

- Push and PR to: `main`, `develop`, `staging`, `uat`

```yaml
trigger:
  branches:
    include: [ main, develop, staging, uat ]

pr:
  branches:
    include: [ main, develop, staging, uat ]
```

### 2.2 Variables

```yaml
variables:
  NODE_VERSION: '20.x'
  DOCKER_REPOSITORY: 'pxs-ng-starter-app'
  DOCKER_SERVICE_CONNECTION: 'FrontSocleServiceConn'
  PKG_PATH: 'package.json'
  APP_NAME: 'pxs-ng-starter-app'
```

- **DOCKER_SERVICE_CONNECTION**: name of the Docker registry service connection pointing to the Azure Container Registry (ACR).
- **DOCKER_REPOSITORY**: repository name inside the registry (e.g. `pxs-ng-starter-app`).
- **PKG_PATH**: path to the app's `package.json` used to read the version.

### 2.3 Build & Docker stage

Main steps:

1. `npmAuthenticate@0` loads credentials into `.npmrc` using the Azure Artifacts feed.
2. `npm ci` + `npm run lint`.
3. Copy the correct `config.*.json` based on `$(Build.SourceBranchName)` and run Angular build.
4. Read `version` from `package.json` and expose it as `APP_VERSION`.
5. `Docker@2` builds and pushes image to the configured ACR with tags:
   - `<branch>-<version>` (e.g. `develop-1.9.4`)
   - `latest-<branch>` (e.g. `latest-develop`)

**Note**: Docker build/push is skipped for Pull Requests (condition: `ne(variables['Build.Reason'], 'PullRequest')`).

### 2.4 Azure DevOps setup checklist

1. **Artifacts feeds permissions**:  
   - In Azure DevOps → Artifacts → the relevant feeds (PXS-NG-CORE / PXS-NG-STARTER-APP)
   - Grant **Reader** or **Contributor** to the build service (e.g. `Project Build Service`).

2. **Docker service connection**:  
   - Project Settings → Service connections → New → Docker Registry
   - Point to the ACR instance.
   - Name it `FrontSocleServiceConn` (or update `DOCKER_SERVICE_CONNECTION` in YAML).

---

## 3. GitHub Actions – `.github/workflows/main.yml`

### 3.1 Workflow overview

The GitHub workflow includes:

- Job `build_app`: npm install, lint (runs on all branches/PRs).
- Job `docker_build`: build and push Docker image to **GitHub Container Registry (GHCR)** (runs only on `main`, `develop`, `staging`, `uat`).
- Job `csp_test`: CSP smoke test on the built image (runs only on `main`, `develop`, `staging`, `uat`).

### 3.2 Permissions and triggers

```yaml
name: Starter CI

on:
  push:
    branches: [ main, develop, staging, uat ]
  pull_request:
    branches: [ main, develop, staging, uat ]

permissions:
  contents: write
  packages: write
```

### 3.3 Azure Artifacts PAT secret

The workflow expects a GitHub **repository secret** named `AZURE_ARTIFACT_PAT` containing an **Azure DevOps PAT** with at least:

- Scope: **Packaging → Read** (for npm restore).

Configure it in GitHub:

1. Repo → **Settings → Secrets and variables → Actions → New repository secret**.
2. Name: `AZURE_ARTIFACT_PAT`.
3. Value: Azure DevOps PAT (Packaging/Read).

The CI appends this token to the repo `.npmrc`:

```yaml
- name: Configure npm for Azure Artifacts (using AZURE_ARTIFACT_PAT)
  env:
    AZURE_ARTIFACTS_PAT: ${{ secrets.AZURE_ARTIFACT_PAT }}
  run: |
    if [ -n "$AZURE_ARTIFACTS_PAT" ]; then
      echo "Configuring npm for Azure Artifacts into project .npmrc"
      {
        echo ""
        echo "//pkgs.dev.azure.com/cadai/:_authToken=${AZURE_ARTIFACTS_PAT}"
        echo "always-auth=true"
      } >> .npmrc
    fi
```

Because `.npmrc` is in the project root, `COPY . .` in the Dockerfile makes it available inside the builder image, so `npm ci` inside the Docker build can authenticate.

### 3.4 Docker image tags (GHCR)

- Registry: `ghcr.io`
- Repo: `ghcr.io/<owner>/<repo>` (lowercased in the workflow).
- Tags:

  - `<safe-branch>-<version>` (slashes in branch names are replaced by `-`)
  - `latest-<safe-branch>`

Example:

```text
ghcr.io/tarikhaddadi/ng-bolt-skeleton:develop-1.9.4
ghcr.io/tarikhaddadi/ng-bolt-skeleton:latest-develop
```

The workflow uses `docker/login-action` and `docker/build-push-action` with `GITHUB_TOKEN` to push to GHCR.

### 3.5 Job conditions

- `build_app`: runs on all configured branches and PRs.
- `docker_build` / `csp_test`: guarded with:

  ```yaml
  if: contains(fromJson('["main","develop","staging","uat"]'), github.ref_name)
  ```

  so they only run on `main`, `develop`, `staging`, `uat`.

### 3.6 CSP Test

The CSP test job:

1. Selects the appropriate config file based on branch.
2. Reads version from `package.json`.
3. Pulls the just-built Docker image from GHCR.
4. Runs the container with environment variables for Keycloak and API origins.
5. Validates the Content-Security-Policy header.

Environment variables injected into the container:

- `KEYCLOAK_ORIGIN`: read from `config.json`
- `API_ORIGINS`: read from `config.json`
- `CSP_REPORT_ONLY`: `false` for `main`, `true` for other branches

### 3.7 GitHub setup checklist

1. Create repository secret **`AZURE_ARTIFACT_PAT`** with Azure DevOps PAT (Packaging/Read).
2. Ensure workflow file is at `.github/workflows/main.yml` and committed to the repo.
3. First push to `main`/`develop` will create the GHCR repo automatically when the image is pushed.
4. Ensure `config.prod.json`, `config.uat.json`, and `config.dev.json` exist in `public/assets/`.

---

## 4. Quick setup checklist for a new environment

When cloning or onboarding this Starter App to a new environment, ensure:

### 4.1 Azure DevOps

- [ ] Configure **Artifacts** feeds and give the build service **Reader** access.
- [ ] Create Docker service connection `FrontSocleServiceConn` pointing to ACR.
- [ ] Verify `azure-pipelines.yml` is at repo root and triggers match desired branches.

### 4.2 GitHub

- [ ] Add **`AZURE_ARTIFACT_PAT`** secret with Azure DevOps PAT (Packaging/Read).
- [ ] Confirm workflow at `.github/workflows/main.yml` is committed.
- [ ] Ensure `permissions: contents: write, packages: write` is present in workflow.
- [ ] Validate that `Dockerfile`, `.npmrc`, and `public/assets/config.*.json` are present.

---

## 5. Versioning conventions

- The version is taken from **`package.json`** (field `version`).
- Docker tags follow the pattern:

  - `<branch>-<version>` (e.g., `develop-1.9.4`, `main-1.9.4`)
  - `latest-<branch>` (e.g., `latest-develop`, `latest-main`)

- Branch names with slashes (e.g. `feature/login`) are sanitized in GitHub workflow by replacing `/` with `-` for Docker tags.

---

This README should be kept in sync with:

- `azure-pipelines.yml`
- `.github/workflows/main.yml`

Whenever the CI/CD is updated, update this doc accordingly.

## 🧑‍💻 Author

**Angular Product Skeleton**  
Built by **Tarik Haddadi** using Angular 19+ and modern best practices (2025).