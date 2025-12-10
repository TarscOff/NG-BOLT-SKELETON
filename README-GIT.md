# Starter App – CI/CD Setup (GitLab CI)

>_Last updated: 2025-12-09_

This document explains how the CI/CD is configured for the **Starter App** using:

- **GitLab CI** (build + automated versioning + Docker to GitLab Container Registry)

---

## 1. Project prerequisites

### 1.1 Node, Angular & Docker

The project assumes:

- **Node**: v20 (configured in pipeline)
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
- `staging` → `config.uat.json` → `--configuration=uat`
- everything else (`develop`, feature branches) → `config.dev.json` → `--configuration=development`

---

## 2. GitLab CI – `.gitlab-ci.yml`

### 2.1 Pipeline overview

The GitLab CI pipeline includes three stages:

- **Stage 1: build** - npm install + lint (runs on all branches/MRs)
- **Stage 2: release** - bump version, CHANGELOG, tag and push (runs only on `develop`, not MRs, not release commits)
- **Stage 3: docker** - build and push Docker image to **GitLab Container Registry** (runs on `main`, `develop`, `staging`, `uat`, not MRs, not release commits)

### 2.2 Workflow rules and triggers

```yaml
workflow:
  rules:
    - if: $CI_COMMIT_BRANCH == "main" || $CI_COMMIT_BRANCH == "develop" || $CI_COMMIT_BRANCH == "staging" || $CI_COMMIT_BRANCH == "uat"
    - if: $CI_PIPELINE_SOURCE == "merge_request_event"
```

Pipeline runs on:
- Direct push to: `main`, `develop`, `staging`, `uat`
- Merge Request events (build + lint only)

### 2.3 Variables

```yaml
variables:
  NODE_VERSION: '20'
  PKG_PATH: 'package.json'
  CR_REGISTRY: teamhub-se.telindus.lu:5050
  RELEASE_TYPE: 'patch'
  DOCKER_DRIVER: overlay2
  DOCKER_TLS_CERTDIR: "/certs"
```

- **NODE_VERSION**: Node.js version for build environment
- **PKG_PATH**: Path to package.json for version extraction
- **CR_REGISTRY**: Container registry (GitLab Container Registry at `teamhub-se.telindus.lu:5050`)
- **RELEASE_TYPE**: Default version bump type (patch/minor/major)
- **DOCKER_DRIVER**: Docker storage driver
- **DOCKER_TLS_CERTDIR**: Docker TLS certificate directory for DinD

### 2.4 Build stage (`build_app`)

Runs on all branches and merge requests:

1. Sets up Node.js environment
2. Configures npm for Azure Artifacts using `AZURE_ARTIFACT_PAT` variable
3. Installs dependencies with `npm ci`
4. Runs linting with `npm run lint`

```yaml
build_app:
  stage: build
  image: node:${NODE_VERSION}
  before_script:
    - |
      if [ -n "$AZURE_ARTIFACT_PAT" ]; then
        {
          echo ""
          echo "//pkgs.dev.azure.com/cadai/:_authToken=${AZURE_ARTIFACT_PAT}"
          echo "always-auth=true"
        } >> .npmrc
      fi
  script:
    - npm ci
    - npm run lint
```

### 2.5 Release stage (`release`)

**Conditions**: Runs only on `develop` branch, not on merge requests, and not on **any** release commits (prevents infinite loop).

```yaml
rules:
  - if: '$CI_PIPELINE_SOURCE != "merge_request_event" && $CI_COMMIT_BRANCH == "develop" && $CI_COMMIT_MESSAGE !~ /^chore\(release\):/'
```

**Important**: The condition skips **all** commits starting with `chore(release):`. This prevents the pipeline from re-running the release stage when:
- `chore(release): v2.1.10 – CI release develop` is pushed
- `chore(release): add JSON notes for v2.1.10` is pushed

**Key features**:

1. **Full Git history**: Uses `GIT_DEPTH: 0` to fetch all commits and tags
2. **Token validation**: Validates `CI_PUSH_TOKEN` exists before proceeding
3. **Tag conflict detection**: Checks if the next version tag already exists locally or remotely
4. **Automated versioning**: 
   - Calculates next version based on `RELEASE_TYPE`
   - Runs `standard-version` to bump version, update CHANGELOG, and create tag
   - Creates commit: `chore(release): v<version> – CI release develop`
5. **Push to remote**: Pushes release commit and tags using `--follow-tags`
6. **Artifact creation**: Creates `release.env` with VERSION variable for downstream jobs
7. **Resource group**: Uses `resource_group: release` to prevent concurrent releases

**Git authentication**:

```yaml
- git remote set-url origin https://oauth2:${CI_PUSH_TOKEN}@teamhub-se.telindus.lu:8443/${CI_PROJECT_PATH}.git
```

Requires `CI_PUSH_TOKEN` GitLab CI/CD variable (see setup section below).

### 2.6 Docker stage (`docker_build`)

**Conditions**: Runs on `main`, `develop`, `staging`, `uat` (not on merge requests, not on release commits).

```yaml
rules:
  - if: $CI_PIPELINE_SOURCE != "merge_request_event" && ($CI_COMMIT_BRANCH == "main" || $CI_COMMIT_BRANCH == "develop" || $CI_COMMIT_BRANCH == "staging" || $CI_COMMIT_BRANCH == "uat") && $CI_COMMIT_MESSAGE !~ /^chore\(release\):/
```

**Docker-in-Docker Configuration**:

```yaml
services:
  - name: docker:24-dind
    command: ["--insecure-registry=teamhub-se.telindus.lu:5050"]
```

**Certificate Handling**:

The pipeline supports two modes for handling self-signed certificates:

1. **With certificate** (if `GITLAB_REGISTRY_CERT` is set as a File variable):
   - Validates certificate content
   - Adds to system trust store
   - Adds to Docker daemon trust store
   - Configures Docker client

2. **Without certificate** (fallback):
   - Configures Docker to use insecure registry mode
   - Uses `--insecure-registry` flag in DinD service

**Steps**:

1. Pulls latest changes from remote (includes release commit if any)
2. Configures npm for Azure Artifacts
3. Installs dependencies
4. Copies appropriate config file based on branch:
   - `main` → `config.prod.json` → `--configuration=production`
   - `uat` → `config.uat.json` → `--configuration=uat`
   - `staging` → `config.uat.json` → `--configuration=uat`
   - `develop` → `config.dev.json` → `--configuration=development`
5. Builds Angular app with `npm run build -- --configuration=$NG_CONFIG`
6. Reads version from `package.json`
7. Logs into **GitLab Container Registry** using built-in `CI_JOB_TOKEN` and `CI_REGISTRY_USER`
8. Builds and pushes Docker image with tags:
   - `${SAFE_BRANCH}-psx-ng-skeleton-${VERSION}` (e.g., `develop-psx-ng-skeleton-2.1.10`)
   - `latest-psx-ng-skeleton-${SAFE_BRANCH}` (e.g., `latest-psx-ng-skeleton-develop`)

**Docker authentication (automatic)**:

```yaml
echo "${CI_JOB_TOKEN}" | docker login ${CR_REGISTRY} -u ${CI_REGISTRY_USER} --password-stdin
```

GitLab automatically provides:
- `CI_JOB_TOKEN`: Temporary token for the current job
- `CI_REGISTRY_USER`: Set to `gitlab-ci-token`
- `CI_PROJECT_PATH`: Project path (e.g., `genai/frontend/frontend-psx-ng-skeleton`)

**Docker tags example**:

```text
teamhub-se.telindus.lu:5050/genai/frontend/frontend-psx-ng-skeleton:develop-psx-ng-skeleton-2.1.10
teamhub-se.telindus.lu:5050/genai/frontend/frontend-psx-ng-skeleton:latest-psx-ng-skeleton-develop
```

### 2.7 GitLab CI/CD setup checklist

#### Required CI/CD Variables

Configure in **Settings → CI/CD → Variables**:

1. **`AZURE_ARTIFACT_PAT`** (Azure DevOps Personal Access Token)
   - Scope: **Packaging → Read**
   - Used to authenticate npm installs from Azure Artifacts
   - Type: Variable
   - Protect: ✓ (recommended)
   - Mask: ✓ (recommended)

2. **`CI_PUSH_TOKEN`** (GitLab Access Token)
   - Create via **Settings → Access Tokens** (Project or Personal)
   - Required scope: `write_repository`
   - Used to push release commits and tags
   - Type: Variable
   - Protect: ✓ (recommended)
   - Mask: ✓ (recommended)

3. **`GITLAB_REGISTRY_CERT`** (Optional - Self-signed CA Certificate)
   - Self-signed CA certificate for registry
   - Used to trust the internal registry certificate
   - Type: **File** (recommended) or Variable
   - Protect: ✓ (recommended)
   - Note: If not set, pipeline uses `--insecure-registry` mode

#### Generating CI_PUSH_TOKEN

**Option 1: Project Access Token (Recommended)**

1. Navigate to **Settings → Access Tokens**
2. Click **Add new token**
3. Configure:
   - **Token name**: `CI_PUSH_TOKEN`
   - **Role**: Maintainer
   - **Scopes**: `write_repository`
4. Click **Create project access token**
5. Copy token immediately (won't be shown again)

**Option 2: Personal Access Token**

1. User avatar → **Edit profile → Access Tokens**
2. Click **Add new token**
3. Configure:
   - **Token name**: `gitlab-ci-push`
   - **Scopes**: `write_repository`, `api`
4. Copy token immediately

#### Configuring GITLAB_REGISTRY_CERT (Optional)

If your GitLab Container Registry uses a self-signed certificate:

**Step 1: Export the CA certificate**

```bash
# From the GitLab server
openssl s_client -showcerts -connect teamhub-se.telindus.lu:5050 < /dev/null 2>/dev/null | \
  openssl x509 -outform PEM > gitlab-registry-ca.crt
```

**Step 2: Add to GitLab CI/CD Variables**

1. Go to **Settings → CI/CD → Variables**
2. Add new variable:
   - **Key**: `GITLAB_REGISTRY_CERT`
   - **Type**: **File** (recommended)
   - **Value**: Paste the certificate content (including `-----BEGIN CERTIFICATE-----` and `-----END CERTIFICATE-----`)
   - **Protect**: ✓
   - **Mask**: Leave unchecked (certificates can't be masked)

**Note**: If you don't configure this variable, the pipeline will automatically use `--insecure-registry` mode.

#### Additional Configuration

1. **Ensure pipeline file exists**: `.gitlab-ci.yml` at repository root
2. **Verify config files**: `public/assets/config.{prod,uat,dev}.json` exist
3. **Docker runner**: Ensure GitLab runners support Docker-in-Docker
4. **Branch protection**: Consider protecting `main`/`develop` branches
5. **Repository permissions**: Verify CI service account has push access
6. **Container Registry**: Verify Container Registry is enabled for your project (Settings → General → Visibility, project features, permissions → Container Registry)

### 2.8 Cache configuration

The pipeline uses cache to speed up builds:

```yaml
cache:
  key:
    files:
      - package-lock.json
  paths:
    - node_modules/
    - .npm/
```

Cache is shared across jobs when `package-lock.json` hasn't changed.

---

## 3. Quick setup checklist for a new environment

When cloning or onboarding this Starter App to a new environment, ensure:

### 3.1 GitLab CI

- [ ] Add **`AZURE_ARTIFACT_PAT`** CI/CD variable (Azure DevOps PAT with Packaging/Read)
- [ ] Add **`CI_PUSH_TOKEN`** CI/CD variable (Project/Personal Access Token with write_repository)
- [ ] Add **`GITLAB_REGISTRY_CERT`** CI/CD variable (Optional - File type with CA certificate)
- [ ] Verify `.gitlab-ci.yml` is at repo root
- [ ] Ensure `public/assets/config.{prod,uat,dev}.json` files exist
- [ ] Confirm GitLab runners support Docker-in-Docker (docker:24-dind service)
- [ ] Verify Git remote URL is accessible with correct port (`:8443` for Git, `:5050` for registry)
- [ ] Enable Container Registry for the project (Settings → General → Container Registry)

---

## 4. Pipeline Execution Flow – Understanding What Happens on Each Run

This section explains step-by-step what happens when the CI/CD pipeline runs.

### 4.1 Execution overview by branch and trigger type

| Branch | Trigger | Version Bump? | Docker Build? | Notes |
|--------|---------|---------------|---------------|-------|
| `develop` | Direct push | ✅ Yes | ✅ Yes | Full release + Docker build |
| `main` | Direct push | ❌ No | ✅ Yes | Docker build only |
| `staging` | Direct push | ❌ No | ✅ Yes | Docker build only |
| `uat` | Direct push | ❌ No | ✅ Yes | Docker build only |
| Any branch | Merge Request | ❌ No | ❌ No | Build + lint only |
| `develop` | Release commit* | ❌ Skipped | ❌ Skipped | Prevents infinite loop |

**\*Release commit**: Any commit starting with `chore(release):` (e.g., `chore(release): v2.1.10` or `chore(release): add JSON notes for v2.1.10`)

### 4.2 Step-by-step execution for a typical push to `develop`

```
Stage 1: build_app (runs on all branches/MRs)
✅ Step 1: Setup Node.js environment (node:20)
✅ Step 2: Check Node/npm versions
✅ Step 3: Configure npm for Azure Artifacts
   → Appends auth token to .npmrc
✅ Step 4: Install dependencies
   → npm ci (installs all dependencies including @cadai/*)
✅ Step 5: Run linting
   → npm run lint

Stage 2: release (only on develop, not MRs, not release commits)
✅ Step 1: Install Git + certificates
✅ Step 2: Configure Git identity
   → Sets "GitLab CI" as committer
✅ Step 3: Validate CI_PUSH_TOKEN
   → Exits with error if not set
✅ Step 4: Configure Git remote with CI_PUSH_TOKEN
   → https://oauth2:${CI_PUSH_TOKEN}@teamhub-se.telindus.lu:8443/...
✅ Step 5: Fetch all tags
   → git fetch --tags (prevents duplicate tag errors)
✅ Step 6: Configure npm for Azure Artifacts
✅ Step 7: Install dependencies
✅ Step 8: Calculate next version
   → Reads current version from package.json
   → Calculates next version based on RELEASE_TYPE
   → Example: 2.1.9 → 2.1.10 (patch)
✅ Step 9: Check for existing tags
   → Checks locally: git rev-parse v2.1.10
   → Checks remotely: git ls-remote --tags origin
   → If exists: Creates artifact and exits gracefully (exit 0)
✅ Step 10: Run standard-version
   → npm run release:patch:nopush
   → Updates package.json version
   → Updates CHANGELOG.md
   → Creates release-notes/release-v2.1.10.json
   → Creates Git tag v2.1.10
   → Commits: "chore(release): v2.1.10 – CI release develop"
   → Commits: "chore(release): add JSON notes for v2.1.10"
✅ Step 11: Handle detached HEAD
   → Checks if on branch or detached HEAD
   → If detached: git checkout -B develop
✅ Step 12: Push to remote
   → git push origin develop --follow-tags
   → Pushes BOTH release commits and tag
✅ Step 13: Create artifact
   → Writes VERSION=2.1.10 to release.env
   → Used by docker_build stage

Triggered Pipeline #2 (by "chore(release): v2.1.10" commit)
Stage 1: build_app ✅ Runs normally
Stage 2: release ❌ SKIPPED (matches /^chore\(release\):/)
Stage 3: docker_build ❌ SKIPPED (matches /^chore\(release\):/)

Triggered Pipeline #3 (by "chore(release): add JSON notes" commit)
Stage 1: build_app ✅ Runs normally
Stage 2: release ❌ SKIPPED (matches /^chore\(release\):/)
Stage 3: docker_build ❌ SKIPPED (matches /^chore\(release\):/)

Stage 3: docker_build (only on main/develop/staging/uat, not MRs, not release commits)
✅ Step 1: Setup Docker-in-Docker environment
   → docker:24 image with docker:24-dind service
   → DinD configured with --insecure-registry flag
✅ Step 2: Install Git + Node.js + npm
✅ Step 3: Configure CA certificate (if GITLAB_REGISTRY_CERT is set)
   → Validates certificate content
   → Adds to system trust store
   → Adds to Docker daemon trust store
   → OR: Configures insecure registry mode (fallback)
✅ Step 4: Pull latest changes
   → git fetch origin develop
   → git reset --hard origin/develop
   → Ensures we have the latest release commit
✅ Step 5: Configure npm for Azure Artifacts
✅ Step 6: Install dependencies
✅ Step 7: Copy environment config
   → develop → config.dev.json → --configuration=development
✅ Step 8: Build Angular app
   → npm run build -- --configuration=development
✅ Step 9: Read version from package.json
   → VERSION=2.1.10
✅ Step 10: Login to GitLab Container Registry
   → docker login teamhub-se.telindus.lu:5050 -u gitlab-ci-token
   → Uses CI_JOB_TOKEN (automatic)
✅ Step 11: Build Docker image
   → docker build -t teamhub-se.telindus.lu:5050/.../frontend-psx-ng-skeleton:develop-psx-ng-skeleton-2.1.10
   →                -t teamhub-se.telindus.lu:5050/.../frontend-psx-ng-skeleton:latest-psx-ng-skeleton-develop
✅ Step 12: Push Docker images
   → docker push teamhub-se.telindus.lu:5050/.../frontend-psx-ng-skeleton:develop-psx-ng-skeleton-2.1.10
   → docker push teamhub-se.telindus.lu:5050/.../frontend-psx-ng-skeleton:latest-psx-ng-skeleton-develop
```

### 4.3 What happens on a Merge Request?

```
✅ Checkout
✅ Authenticate to Azure Artifacts
✅ Install dependencies (npm ci)
✅ Lint (npm run lint)
⏭️  Skip version bump
⏭️  Skip Docker build
```

**Result**: MR validation only, no deployable artifacts.

### 4.4 Identifying a release commit (automatic skip)

After a successful release, the pipeline pushes **two commits**:

```
chore(release): v2.1.10 – CI release develop
chore(release): add JSON notes for v2.1.10
```

When **either** commit triggers a new pipeline run:

```
Stage 1: build_app
✅ Runs normally (build + lint)

Stage 2: release
❌ Condition not met: $CI_COMMIT_MESSAGE !~ /^chore\(release\):/
   → Job is skipped automatically
   → This prevents duplicate version bumps and infinite loops

Stage 3: docker_build
❌ Condition not met: $CI_COMMIT_MESSAGE !~ /^chore\(release\):/
   → Job is skipped automatically
   → This prevents duplicate Docker builds
```

**Result**: Only the build stage runs for release commits. Docker build is skipped to avoid unnecessary operations.

### 4.5 Understanding pipeline logs – What to look for

#### ✅ **Successful version bump**

Look for in release stage logs:

```
Running CI release of type: patch
Current version in package.json: 2.1.9
Next version will be: 2.1.10

> psx-ng-skeleton@2.1.9 release:patch:nopush

✔ bumping version in package.json from 2.1.9 to 2.1.10
✔ bumping version in package-lock.json from 2.1.9 to 2.1.10
✔ outputting changes to CHANGELOG.md
✔ committing package-lock.json and package.json and CHANGELOG.md
✔ tagging release v2.1.10

Current tag: v2.1.10
583b2ee chore(release): v2.1.10 – CI release develop

Pushing HEAD + tags to origin
```

#### ✅ **Successful Docker push**

Look for in docker_build stage logs:

```
Detected version: 2.1.10
Repository: genai/frontend/frontend-psx-ng-skeleton
Safe branch: develop
Registry: teamhub-se.telindus.lu:5050

Login Succeeded

Successfully built a1b2c3d4e5f6
Successfully tagged teamhub-se.telindus.lu:5050/genai/frontend/frontend-psx-ng-skeleton:develop-psx-ng-skeleton-2.1.10
Successfully tagged teamhub-se.telindus.lu:5050/genai/frontend/frontend-psx-ng-skeleton:latest-psx-ng-skeleton-develop

The push refers to repository [teamhub-se.telindus.lu:5050/genai/frontend/frontend-psx-ng-skeleton]
develop-psx-ng-skeleton-2.1.10: digest: sha256:... size: 1234
latest-psx-ng-skeleton-develop: digest: sha256:... size: 1234

✅ Pushed images:
   teamhub-se.telindus.lu:5050/genai/frontend/frontend-psx-ng-skeleton:develop-psx-ng-skeleton-2.1.10
   teamhub-se.telindus.lu:5050/genai/frontend/frontend-psx-ng-skeleton:latest-psx-ng-skeleton-develop
```

#### ⏭️ **Skipped version bump** (wrong branch)

Release stage logs:

```
This job has not been executed, because of the configured rules.
Condition not met: $CI_COMMIT_BRANCH == "develop"
```

#### ⏭️ **Skipped Docker build** (release commit detected)

Docker build stage logs:

```
This job has not been executed, because of the configured rules.
Condition not met: $CI_COMMIT_MESSAGE !~ /^chore\(release\):/
```

#### ⚠️ **Tag already exists** (idempotent skip)

Release stage logs:

```
Next version will be: 2.1.10
ERROR: Tag v2.1.10 already exists on remote
This version has already been released. Skipping release.
If you need to re-release, manually delete the remote tag first:
  git push origin :refs/tags/v2.1.10

Detected existing version: 2.1.9
Job succeeded
```

**This is expected behavior!** The job exits gracefully (exit 0) to allow the pipeline to continue.

#### ❌ **CI_PUSH_TOKEN missing**

Release stage logs:

```
ERROR: CI_PUSH_TOKEN is not set!
Please configure CI_PUSH_TOKEN as a GitLab CI/CD variable with write access
```

**Action**: Create the `CI_PUSH_TOKEN` variable as described in section 2.7.

#### ❌ **Docker login fails with certificate error**

Docker build stage logs:

```
Error response from daemon: Get "https://teamhub-se.telindus.lu:5050/v2/": tls: failed to verify certificate: x509: certificate signed by unknown authority
```

**Action**: Configure the `GITLAB_REGISTRY_CERT` variable as described in section 2.7, or rely on the automatic `--insecure-registry` fallback.

---

## 5. Versioning conventions

- The version is **automatically bumped** by the CI pipeline using `standard-version` via release scripts
- The version is taken from **`package.json`** (field `version`) after the automated bump
- The release creates:
  - Version bump in `package.json` (patch/minor/major based on `RELEASE_TYPE`)
  - CHANGELOG.md update with commit history
  - Git tag (e.g., `v2.1.10`)
  - Two commits:
    - `chore(release): v<version> – CI release <branch>`
    - `chore(release): add JSON notes for v<version>`
- Docker tags follow the pattern:
  - `<branch>-psx-ng-skeleton-<version>` (e.g., `develop-psx-ng-skeleton-2.1.10`, `main-psx-ng-skeleton-2.1.10`)
  - `latest-psx-ng-skeleton-<branch>` (e.g., `latest-psx-ng-skeleton-develop`, `latest-psx-ng-skeleton-main`)
- Branch names with slashes (e.g. `feature/login`) are sanitized by replacing `/` with `-` for Docker tags
- Pushes release commits and tags only on `develop` branch
- **Registry location**: GitLab Container Registry (self-hosted at `teamhub-se.telindus.lu:5050`)

---

## 6. Troubleshooting

### 6.1 Common Issues

#### **Issue**: `CI_PUSH_TOKEN is not set`

**Solution**: Create a Project or Personal Access Token with `write_repository` scope and add it as a CI/CD variable named `CI_PUSH_TOKEN`.

#### **Issue**: `fatal: tag 'v2.1.10' already exists`

**Solution**: The pipeline now handles this gracefully. If you see this error:
1. Check if the release stage exited with code 0 (success)
2. If it failed, manually delete the tag: `git push origin :refs/tags/v2.1.10`
3. Re-run the pipeline

#### **Issue**: `npm ci` fails with authentication error

**Solution**: 
1. Verify `AZURE_ARTIFACT_PAT` CI/CD variable is set correctly
2. Check that the PAT has **Packaging → Read** scope
3. Ensure the PAT hasn't expired

#### **Issue**: Docker build fails with "cannot access Azure Artifacts"

**Solution**: The `.npmrc` with authentication is created in the build stage and persists for the Docker build. Ensure `COPY . .` in Dockerfile happens after npm auth configuration.

#### **Issue**: `error: Cannot access URL` when pushing

**Solution**: 
1. Verify `CI_PUSH_TOKEN` has `write_repository` scope
2. Check that the Git remote URL includes the correct port (`:8443`)
3. Ensure the token hasn't expired or been revoked

#### **Issue**: Docker push fails with "unauthorized" to GitLab Container Registry

**Solution**:
1. Verify Container Registry is enabled: Settings → General → Container Registry
2. Check GitLab runner has access to Docker-in-Docker service
3. Ensure `CI_JOB_TOKEN` is being used correctly (automatically provided by GitLab)
4. Verify registry URL is correct: `teamhub-se.telindus.lu:5050`

#### **Issue**: Pipeline triggers multiple times after release

**Solution**: This is **expected but optimized**! The release creates two commits:
- `chore(release): v2.1.10 – CI release develop`
- `chore(release): add JSON notes for v2.1.10`

Both trigger new pipelines, but **only the build stage runs**. Release and Docker stages are automatically skipped (condition: `!~ /^chore\(release\):/`).

#### **Issue**: Docker service timeout or health check error

**Symptoms**:
```
*** WARNING: Service runner-...-docker-0 probably didn't start properly.
Health check error: service "..." timeout
```

**Solution**:
1. This is often a transient issue with Docker-in-Docker initialization
2. Retry the pipeline job
3. Check GitLab Runner configuration for Docker executor settings
4. Verify the runner machine has sufficient resources
5. If persistent, check Docker service logs in the runner

#### **Issue**: Certificate warning in Docker build

**Symptoms**:
```
WARNING: ca-cert-telindus-registry.pem does not contain exactly one certificate or CRL: skipping
```

**Solution**:
1. Verify `GITLAB_REGISTRY_CERT` contains a valid PEM certificate
2. Ensure certificate starts with `-----BEGIN CERTIFICATE-----`
3. Check there are no extra spaces or characters
4. If issue persists, the pipeline will automatically fall back to `--insecure-registry` mode

#### **Issue**: Docker login fails with TLS certificate error

**Symptoms**:
```
Error response from daemon: Get "https://teamhub-se.telindus.lu:5050/v2/": tls: failed to verify certificate: x509: certificate signed by unknown authority
```

**Solutions**:
1. **Recommended**: Set up `GITLAB_REGISTRY_CERT` as a File variable with your CA certificate
2. **Alternative**: The pipeline automatically uses `--insecure-registry` mode as fallback
3. Verify the DinD service is configured with `--insecure-registry` flag
4. Check the certificate is accessible and valid

### 6.2 Manual Version Release

If you need to manually trigger a release or change the version type:

1. **Change RELEASE_TYPE**:
   - Go to **CI/CD → Pipelines → Run pipeline**
   - Add variable: `RELEASE_TYPE` = `minor` or `major`
   - Run on `develop` branch

2. **Manual version bump**:
   ```bash
   npm run release:patch   # or release:minor or release:major
   git push --follow-tags
   ```

3. **Delete and recreate a release**:
   ```bash
   # Delete local tag
   git tag -d v2.1.10
   
   # Delete remote tag
   git push origin :refs/tags/v2.1.10
   
   # Trigger new pipeline
   git commit --allow-empty -m "trigger: new release"
   git push
   ```

### 6.3 Viewing Docker Images

**GitLab Container Registry**:
1. Navigate to **Packages & Registries → Container Registry**
2. You'll see all pushed images with their tags
3. Click on an image to see details, digests, and pull commands

**Pull command example**:
```bash
docker pull teamhub-se.telindus.lu:5050/genai/frontend/frontend-psx-ng-skeleton:develop-psx-ng-skeleton-2.1.10
```

---

## 7. Best Practices

### 7.1 Development Workflow

1. **Feature branches**: Create feature branches from `develop`
2. **Merge Requests**: Use MRs for code review before merging to `develop`
3. **Automatic versioning**: Let CI handle version bumps on `develop`
4. **Branch protection**: Protect `main` and `develop` branches from direct pushes

### 7.2 Versioning Strategy

1. **Patch releases**: Bug fixes, minor updates (default)
2. **Minor releases**: New features, non-breaking changes
3. **Major releases**: Breaking changes, major refactors
4. **Conventional commits**: Use conventional commit messages for automatic CHANGELOG generation

### 7.3 Docker Images

1. **Tag strategy**: Use version-specific tags for production, `latest-*` for development
2. **Image cleanup**: Regularly clean up old images from registry
3. **Security scanning**: Consider adding container vulnerability scanning
4. **Multi-stage builds**: Use multi-stage Dockerfile to minimize image size

### 7.4 Security

1. **Secrets management**: Never commit secrets to repository
2. **Token rotation**: Regularly rotate CI/CD tokens and certificates
3. **Branch protection**: Require code reviews for protected branches
4. **Variable masking**: Mask sensitive variables in CI/CD settings

---

This README should be kept in sync with:

- `.gitlab-ci.yml`
- `package.json` scripts
- Docker configuration

Whenever the CI/CD is updated, update this doc accordingly.

## 🧑‍💻 Author

**Angular Product Skeleton**  
Built by **Tarik Haddadi** using Angular 19+ and modern best practices (2025).