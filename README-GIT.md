# Starter App – CI/CD Setup (Azure DevOps, GitHub Actions, GitLab)

>_Last updated: 2025-12-02_


This document explains how the CI/CD is wired for the **Starter App** across:

- **Azure DevOps** (build + Docker + tag)
- **GitHub Actions** (build + Docker to GHCR + CSP test + tag)
- **GitLab CI** (build + Docker + optional CSP test + tag)

and how to configure everything quickly when cloning or onboarding a new project.

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

All three CI systems restore dependencies (including `@cadai/*`) from **Azure Artifacts**.

The repo contains a `.npmrc` at root with registry configuration (no secrets):

```ini
registry=https://registry.npmjs.org/

@cadai:registry=https://pkgs.dev.azure.com/cadai/Socle/_packaging/PXS-NG-CORE/npm/registry/
@cadai:registry=https://pkgs.dev.azure.com/cadai/Socle/_packaging/PXS-NG-STARTER-APP/npm/registry/
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
```

- **DOCKER_SERVICE_CONNECTION**: name of the Docker registry service connection pointing to the Azure Container Registry (ACR) where images are pushed.
- **DOCKER_REPOSITORY**: repository name inside the registry (e.g. `pxs-ng-starter-app`).
- **PKG_PATH**: path to the app’s `package.json` used to read the version.

### 2.3 Build & Docker stage

Main steps:

1. `npmAuthenticate@0` loads credentials into `.npmrc` using the Azure Artifacts feed.
2. `npm ci` + `npm run lint`.
3. Copy the correct `config.*.json` based on `$(Build.SourceBranchName)` and run Angular build.
4. Read `version` from `package.json` and expose it as `APP_VERSION`.
5. `Docker@2` builds and pushes image to the configured ACR with tags:
   - `<branch>-<version>` (e.g. `develop-1.9.4`)
   - `latest-<branch>` (e.g. `latest-develop`).

### 2.4 Tag stage (main only)

A second stage `tag_on_main`:

- Runs only on `refs/heads/main` and if the build succeeded.
- Reads `version` from `package.json`.
- Creates a git tag `PXS-NG-STARTER-APP@<version>` if it doesn’t already exist.
- Pushes the tag back to Azure Repos using `System.AccessToken`.

> **Note**: Ensure the build service account has permission to **Create tag** on the repo.

### 2.5 Azure DevOps setup checklist

1. **Artifacts feeds permissions**:  
   - In Azure DevOps → Artifacts → the relevant feeds (PXS-NG-CORE / PXS-NG-STARTER-APP)
   - Grant **Reader** or **Contributor** to the build service (e.g. `Project Build Service`).

2. **Docker service connection**:  
   - Project Settings → Service connections → New → Docker Registry
   - Point to the ACR instance.
   - Name it `FrontSocleServiceConn` (or update `DOCKER_SERVICE_CONNECTION` in YAML).

3. **Repository permissions** for tagging:  
   - Project Settings → Repositories → (this repo) → Security
   - Allow `Create tag` for the build service identity.

---

## 3. GitHub Actions – `.github/workflows/main.yml`

### 3.1 Workflow overview

The GitHub workflow **mirrors** Azure:

- Job `build_app`: npm install, lint, build Angular.
- Job `docker_build`: build and push Docker image to **GitHub Container Registry (GHCR)**.
- Job `csp_test`: optional CSP smoke test on the built image.
- Job `tag_release`: tag `PXS-NG-STARTER-APP@<version>` on `main` only.

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

The workflow expects a GitHub **repository secret** named e.g. `AZURE_ARTIFACT_PAT` containing an **Azure DevOps PAT** with at least:

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

- `tag_release`: runs only on `refs/heads/main` and tags `PXS-NG-STARTER-APP@<version>` if not existing.

### 3.6 GitHub setup checklist

1. Create repository secret **`AZURE_ARTIFACT_PAT`** with Azure DevOps PAT (Packaging/Read).
2. Ensure workflow file is at `.github/workflows/main.yml` and committed to the repo.
3. First push to `main`/`develop` will create the GHCR repo automatically when the image is pushed.

---

## 4. GitLab CI – `.gitlab-ci.yml` (summary)

> **Note**: Check the actual `.gitlab-ci.yml` in the repo for the latest version; this section describes the overall pattern.

### 4.1 Stages

Typical stages used:

```yaml
stages: [ build, dockerize, test, tag ]
```

### 4.2 Azure Artifacts PAT variable

In GitLab, a CI/CD variable is used to authenticate to Azure Artifacts, e.g.:

- `AZURE_ARTIFACTS_PAT` (or `BOLT_SECRET`, depending on your local naming).

You can set it via:

- Project → **Settings → CI/CD → Variables → Add variable**.

The `build_app` job writes this value into `~/.npmrc` or `.npmrc` so that `npm ci` can restore from Azure Artifacts.

### 4.3 Docker build & registry

By default, the GitLab pipeline:

- uses `docker:20-dind` service,
- logs in to **GitLab Container Registry** using built-in variables:
  - `CI_REGISTRY`
  - `CI_REGISTRY_USER`
  - `CI_REGISTRY_PASSWORD`
  - `CI_REGISTRY_IMAGE`

Tags are similar to other platforms:

- `<branch>-<version>` (with branch sanitized if needed)
- `latest-<branch>`

Alternatively, the pipeline can be configured to push directly to the **same ACR** used by Azure DevOps by logging into `youracr.azurecr.io` using CI variables (not shown here for brevity).

### 4.4 Tag job (main only)

A `tag_release` job on GitLab:

- runs only on `main`,
- reads `version` from `package.json`,
- creates `PXS-NG-STARTER-APP@<version>` if it doesn’t already exist,
- pushes the tag using `CI_JOB_TOKEN` (requires `write_repository` permission).

---

## 5. Quick setup checklist for a new environment

When cloning or onboarding this Starter App to a new environment, ensure:

### 5.1 Azure DevOps

- [ ] Configure **Artifacts** feeds and give the build service **Reader** access.
- [ ] Create Docker service connection `FrontSocleServiceConn` pointing to ACR.
- [ ] Ensure repo permissions allow build service to **create tags**.
- [ ] Verify `azure-pipelines.yml` is at repo root and triggers match desired branches.

### 5.2 GitHub

- [ ] Add **`AZURE_ARTIFACT_PAT`** secret with Azure DevOps PAT (Packaging/Read).
- [ ] Confirm workflow at `.github/workflows/main.yml` is committed.
- [ ] Ensure `permissions: contents: write, packages: write` is present in workflow.
- [ ] Validate that `Dockerfile`, `.npmrc`, and `public/assets/config.*.json` are present.

### 5.3 GitLab

- [ ] Enable **Container Registry** for the project.
- [ ] Add CI/CD variable with Azure Artifacts PAT (`AZURE_ARTIFACTS_PAT` or similar).
- [ ] Ensure `.gitlab-ci.yml` is present and stages match the desired flow.
- [ ] If using ACR instead of GitLab registry, configure `ACR_LOGIN_SERVER`, `ACR_USERNAME`, `ACR_PASSWORD` CI variables and update `docker login` / `docker build` commands accordingly.

---

## 6. Tagging & versioning conventions

- The version is taken from **`package.json`** (field `version`).
- Git tags follow:

  ```text
  PXS-NG-STARTER-APP@<version>
  ```

  Example: `PXS-NG-STARTER-APP@1.9.4`

- Docker tags:

  - `develop-1.9.4`, `latest-develop`
  - `staging-1.9.4`, `latest-staging`
  - `uat-1.9.4`, `latest-uat`
  - `main-1.9.4`, `latest-main`

- Branch names with slashes (e.g. `feature/login`) are sanitized in GitHub workflow by replacing `/` with `-` for Docker tags.

---

## 7. Troubleshooting tips

### 7.1 `npm ci` fails with `E401 Unable to authenticate`

- Ensure the Azure DevOps PAT has **Packaging / Read**.
- Confirm the PAT is correctly configured:
  - Azure: via `npmAuthenticate@0` + `.npmrc` without hard-coded PAT.
  - GitHub: `AZURE_ARTIFACT_PAT` secret is set and appended to `.npmrc`.
  - GitLab: `AZURE_ARTIFACTS_PAT` CI variable is set and written to `.npmrc` or `~/.npmrc`.

### 7.2 Docker image not found in CSP test

- Check the tag used in `csp_test` matches the tag created in `docker_build`:
  - `<safe-branch>-<version>` and `latest-<safe-branch>`.
- Ensure the registry (GHCR / ACR / GitLab) login succeeded in the build job.

### 7.3 Tag creation fails

- Make sure the CI identity (System.AccessToken in Azure, CI_JOB_TOKEN in GitLab, GITHUB_TOKEN in GitHub) has permission to **push tags**.
- Verify that the tag does not already exist (pipelines skip creation if tag is already present).

---

This README should be kept in sync with:

- `azure-pipelines.yml`
- `.github/workflows/main.yml`
- `.gitlab-ci.yml`

Whenever the CI/CD is updated, update this doc accordingly.



## 🧑‍💻 Author

**Angular Product Skeleton**  
Built by **Tarik Haddadi** using Angular 19+ and modern best practices (2025).
