#  CI/CD Setup (GitLab CI, GitHub Actions, Azure Pipelines)

>_Last updated: 2025-12-23_

This document explains how the CI/CD is configured using:

- **GitLab CI** (build + automated versioning + Docker to GitLab Container Registry)
- **GitHub Actions** (build + automated versioning + Docker to GitHub Container Registry)
- **Azure Pipelines** (build + automated versioning + Docker to Azure Container Registry)

---

## 1. Project Prerequisites

### 1.1 Node, Angular & Docker

The project assumes:

- **Node**: v20 (configured in pipeline)
- **Angular**: Angular 19+ with standalone components
- **Dockerfile** at repo root for runtime configuration

```dockerfile
FROM nginx:alpine

# Copy built Angular app (CI provides dist/psx-ng-skeleton/browser)
COPY dist/psx-ng-skeleton/browser /usr/share/nginx/html

# Copy env-config template (processed at runtime)
COPY public/env-config.template.js /usr/share/nginx/html/env-config.template.js

# Copy nginx template + entrypoint
COPY nginx/default.conf.template /etc/nginx/conf.d/default.conf.template
COPY docker/entrypoint.sh /docker-entrypoint.sh
RUN chmod +x /docker-entrypoint.sh

EXPOSE 80
ENTRYPOINT ["/docker-entrypoint.sh"]
```

The Angular build output is expected at:

```text
dist/psx-ng-skeleton/browser
```

### 1.2 Runtime Environment Configuration

**🚀 NEW APPROACH**: This application uses **runtime environment configuration** instead of build-time configuration.

**Key Changes:**
- ✅ **Single Docker image** for all environments (dev, UAT, prod)
- ✅ **No more branch-specific builds** (no `config.dev.json`, `config.uat.json`, `config.prod.json` copying)
- ✅ **Runtime configuration** via environment variables injected at container startup
- ✅ **Always builds with production Angular configuration** (`npm run buildProd`)

**How it works:**

1. **Build time**: Angular app is built once with production configuration
2. **Runtime**: Docker entrypoint generates `env-config.js` from environment variables
3. **Bootstrap**: Angular loads `window.env` and merges with static `config.json`

**Files involved:**

- **`public/env-config.template.js`**: Template with placeholders for environment variables
  ```javascript
  window.env = {
    API_URL: "${API_URL}",
    KEYCLOAK_URL: "${KEYCLOAK_URL}",
    KEYCLOAK_REALM: "${KEYCLOAK_REALM}",
    KEYCLOAK_CLIENT_ID: "${KEYCLOAK_CLIENT_ID}"
  };
  ```

- **`public/assets/config.json`**: Static feature flags and application settings (no environment-specific values)

- **`docker/entrypoint.sh`**: Generates `env-config.js` from template using `envsubst`

- **`src/main.ts`**: Loads runtime config before bootstrapping Angular

**Required environment variables at container runtime:**

| Variable | Description | Example |
|----------|-------------|---------|
| `API_URL` | Backend API URL | `https://app.pxl-codit.com/api` |
| `KEYCLOAK_URL` | Keycloak server URL (with trailing slash) | `https://keycloak.pxl-codit.com/` |
| `KEYCLOAK_REALM` | Keycloak realm | `genai-dev` |
| `KEYCLOAK_CLIENT_ID` | Keycloak clientId | `genai-app` |
| `ENVIRONMENT` | Environment name (affects CSP/COOP headers) | `production`, `uat`, `development` |

**Example deployment:**

```bash
# Development
docker run -d -p 80:80 \
  -e API_URL="https://app-dev.example.com/api" \
  -e KEYCLOAK_URL="https://keycloak-dev.example.com/" \
  -e KEYCLOAK_REALM="genai-dev" \
  -e KEYCLOAK_CLIENT_ID="genai-app" \
  -e ENVIRONMENT="development" \
  registry/psx-ng-skeleton:latest

# Production
docker run -d -p 80:80 \
  -e API_URL="https://api.example.com" \
  -e KEYCLOAK_URL="https://keycloak.example.com/" \
  -e KEYCLOAK_REALM="genai-dev" \
  -e KEYCLOAK_CLIENT_ID="genai-app" \
  -e ENVIRONMENT="production" \
  registry/psx-ng-skeleton:latest
```

### 1.3 Security Headers & CORS Configuration

The application uses nginx to serve the Angular app and configures security headers dynamically at container runtime.

**Cross-Origin-Opener-Policy (COOP)**:

The COOP header is configured based on the `ENVIRONMENT` variable to balance security with development flexibility:

- **`development`**: `unsafe-none` - Allows cross-origin access for local development
- **`uat`/`staging`**: `same-origin` - Strict isolation for pre-production
- **`production`**: `same-origin` - Strict isolation for production

**Content-Security-Policy (CSP)**:

Dynamic CSP configuration based on runtime environment variables:
- `connect-src` includes `API_URL` and `KEYCLOAK_URL` automatically
- Other directives configured in `nginx/default.conf.template`

**How it works:**

1. **Container startup**: `docker/entrypoint.sh` reads `ENVIRONMENT`, `API_URL`, `KEYCLOAK_URL`, `KEYCLOAK_REALM`,`KEYCLOAK_CLIENT_ID`
2. **Template processing**: Uses `envsubst` to render nginx config from template
3. **Header injection**: nginx serves with environment-specific security headers

**Files involved:**

- `nginx/default.conf.template` - Nginx configuration template with placeholders
- `docker/entrypoint.sh` - Sets variables and renders nginx config
- `Dockerfile` - Copies template and entrypoint

---

## 2. GitLab CI – `.gitlab-ci.yml`

### 2.1 Pipeline Overview

The GitLab CI pipeline includes three stages:

- **Stage 1: build** - npm install + lint (runs on all branches/MRs)
- **Stage 2: release** - bump version, CHANGELOG, tag and push (runs only on `develop`, not MRs, not release commits)
- **Stage 3: docker** - build and push **single universal Docker image** to GitLab Container Registry (runs on `main`/`develop`, not MRs, not release commits)

**🚀 KEY CHANGE**: Docker build no longer requires `ENVIRONMENT` build argument. Runtime configuration is injected via environment variables at container startup.

### 2.2 Workflow Rules and Triggers

```yaml
workflow:
  rules:
    - if: $CI_COMMIT_BRANCH == "main" || $CI_COMMIT_BRANCH == "develop"
    - if: $CI_PIPELINE_SOURCE == "merge_request_event"
```

Pipeline runs on:
- Direct push to: `main`, `develop`
- Merge Request events (build + lint only)

**Note**: `staging` and `uat` branches removed - use same image with different runtime env vars.

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

### 2.4 Build Stage (`build_app`)

Unchanged - runs on all branches and merge requests.

### 2.5 Release Stage (`release`)

Unchanged - runs only on `develop` branch, bumps version, updates CHANGELOG, creates tag.

### 2.6 Docker Stage (`docker_build`)

**🚀 MAJOR CHANGES**:

**Conditions**: Runs only on `main` and `develop` (not `staging`/`uat`).

```yaml
rules:
  - if: $CI_PIPELINE_SOURCE != "merge_request_event" && ($CI_COMMIT_BRANCH == "main") && $CI_COMMIT_MESSAGE !~ /^chore\(release\):/
```

**Steps:**

1. Pulls latest changes from remote
2. Configures npm for Azure Artifacts
3. Installs dependencies
4. **Builds Angular with production configuration ONLY**:
   ```bash
   npm run buildProd
   ```
   - ❌ No more branch-based config file copying
   - ❌ No more `BUILD_ENV` determination
   - ✅ Always production build
5. Reads version from `package.json`
6. Logs into GitLab Container Registry
7. **Builds single universal Docker image** (no `ENVIRONMENT` build arg):
   ```bash
   docker build \
     -t "${IMAGE_BASE}:${VERSION}" \
     -t "${IMAGE_BASE}:latest" \
     -f ./Dockerfile .
   ```
8. Pushes Docker image with **simplified tags**:
   - `${VERSION}` (e.g., `2.1.10`)
   - `latest`

**Docker tags example:**

```text
teamhub-se.telindus.lu:5050/genai/frontend/frontend-psx-ng-skeleton:2.1.10
teamhub-se.telindus.lu:5050/genai/frontend/frontend-psx-ng-skeleton:latest
```

**Environment-specific configuration at runtime:**

The Docker image requires environment variables at container startup:

```bash
# Development
docker run -d -p 80:80 \
  -e API_URL="https://app-dev.example.com/api" \
  -e KEYCLOAK_URL="https://keycloak-dev.example.com/" \
  -e KEYCLOAK_REALM="genai-dev" \
  -e KEYCLOAK_CLIENT_ID="genai-app" \
  -e ENVIRONMENT="development" \
  teamhub-se.telindus.lu:5050/genai/frontend/frontend-psx-ng-skeleton:latest

# UAT
docker run -d -p 80:80 \
  -e API_URL="https://app-uat.example.com/api" \
  -e KEYCLOAK_URL="https://keycloak-uat.example.com/" \
  -e KEYCLOAK_REALM="genai-dev" \
  -e KEYCLOAK_CLIENT_ID="genai-app" \
  -e ENVIRONMENT="uat" \
  teamhub-se.telindus.lu:5050/genai/frontend/frontend-psx-ng-skeleton:latest

# Production
docker run -d -p 80:80 \
  -e API_URL="https://api.example.com" \
  -e KEYCLOAK_URL="https://keycloak.example.com/" \
  -e KEYCLOAK_REALM="genai-dev" \
  -e KEYCLOAK_CLIENT_ID="genai-app" \
  -e ENVIRONMENT="production" \
  teamhub-se.telindus.lu:5050/genai/frontend/frontend-psx-ng-skeleton:latest
```

### 2.7 GitLab CI/CD Setup Checklist

#### Required CI/CD Variables

Configure in **Settings → CI/CD → Variables**:

1. **`AZURE_ARTIFACT_PAT`** (Azure DevOps Personal Access Token)
   - Scope: **Packaging → Read**
   - Used to authenticate npm installs from Azure Artifacts
   - Type: Variable
   - Protect: ✓
   - Mask: ✓

2. **`CI_PUSH_TOKEN`** (GitLab Access Token)
   - Create via **Settings → Access Tokens**
   - Required scope: `write_repository`
   - Used to push release commits and tags
   - Type: Variable
   - Protect: ✓
   - Mask: ✓

3. **`GITLAB_REGISTRY_CERT`** (Optional - Self-signed CA Certificate)
   - Self-signed CA certificate for registry
   - Type: **File** (recommended)
   - Protect: ✓
   - Note: If not set, uses `--insecure-registry` mode

---

## 3. GitHub Actions – `.github/workflows/ci.yml`

### 3.1 Pipeline Overview

Similar to GitLab CI with three jobs:

- **Job 1: build_app** - npm install + lint
- **Job 2: release** - bump version, CHANGELOG, tag (only on `develop`)
- **Job 3: docker_build** - build and push single Docker image to GHCR

**🚀 KEY CHANGE**: Builds single universal image, no branch-specific builds.

### 3.2 Docker Build Job

**Key changes:**

```yaml
- name: Build Angular (Production only - runtime config via env vars)
  run: |
    npm ci
    echo "Building Angular with PRODUCTION configuration..."
    npm run buildProd

- name: Build and push single universal Docker image
  uses: docker/build-push-action@v6
  with:
    context: .
    file: ./Dockerfile
    push: true
    tags: |
      ${{ env.CR_REGISTRY }}/${{ steps.image_meta.outputs.repo }}:${{ env.VERSION }}
      ${{ env.CR_REGISTRY }}/${{ steps.image_meta.outputs.repo }}:latest
```

**Tags example:**

```text
ghcr.io/your-org/psx-ng-skeleton:2.1.10
ghcr.io/your-org/psx-ng-skeleton:latest
```

### 3.3 Required Secrets

Configure in **Settings → Secrets and variables → Actions**:

1. **`AZURE_ARTIFACT_PAT`** - Azure Artifacts authentication
2. **`GITHUB_TOKEN`** - Automatically provided by GitHub

---

## 4. Azure Pipelines – `azure-pipelines.yml`

### 4.1 Pipeline Overview

Similar structure with three stages:

- **Stage 1: build** - npm install + lint
- **Stage 2: release** - version bump (only on `develop`)
- **Stage 3: docker** - build and push single Docker image

### 4.2 Docker Build Step

**Key changes:**

```yaml
- script: |
    npm run buildProd
  displayName: 'Build Angular App (Production only)'

- task: Docker@2
  displayName: 'Build & Push Docker image (single universal image)'
  inputs:
    containerRegistry: '$(DOCKER_SERVICE_CONNECTION)'
    repository: '$(DOCKER_REPOSITORY)'
    command: 'buildAndPush'
    dockerfile: 'Dockerfile'
    buildContext: '.'
    tags: |
      $(APP_VERSION)
      latest
```

**Tags example:**

```text
yourregistry.azurecr.io/psx-ng-skeleton:2.1.10
yourregistry.azurecr.io/psx-ng-skeleton:latest
```

### 4.3 Required Variables

Configure in **Pipelines → Library → Variable groups**:

1. **`AZURE_ARTIFACT_PAT`** - Azure Artifacts authentication
2. **`DOCKER_SERVICE_CONNECTION`** - Azure Container Registry connection

---

## 5. Quick Setup Checklist for New Environment

### 5.1 All Platforms

- [ ] Add **`AZURE_ARTIFACT_PAT`** variable/secret
- [ ] Verify CI/CD file exists (`.gitlab-ci.yml`, `.github/workflows/ci.yml`, `azure-pipelines.yml`)
- [ ] Ensure **single `config.json`** exists at `public/assets/config.json`
- [ ] Verify `env-config.template.js` exists at `public/env-config.template.js`
- [ ] Confirm `docker/entrypoint.sh` exists and is executable
- [ ] Test Docker build locally: `docker build -t psx-ng-skeleton-test .`

### 5.2 GitLab CI Specific

- [ ] Add **`CI_PUSH_TOKEN`** variable
- [ ] Add **`GITLAB_REGISTRY_CERT`** variable (optional)
- [ ] Enable Container Registry for project
- [ ] Verify Git remote URL uses correct ports (`:8443` for Git, `:5050` for registry)

### 5.3 GitHub Actions Specific

- [ ] Add **`AZURE_ARTIFACT_PAT`** secret
- [ ] Verify GHCR permissions (Settings → Actions → General → Workflow permissions → Read and write)

### 5.4 Azure Pipelines Specific

- [ ] Create Service Connection for Azure Container Registry
- [ ] Add **`AZURE_ARTIFACT_PAT`** to Variable Group

---

## 6. Pipeline Execution Flow

### 6.1 Execution Overview by Branch and Trigger

| Branch | Trigger | Version Bump? | Docker Build? | Docker Tags |
|--------|---------|---------------|---------------|-------------|
| `develop` | Direct push | ✅ Yes | ✅ Yes | `<version>`, `latest` |
| `main` | Direct push | ❌ No | ✅ Yes | `<version>`, `latest` |
| Any branch | Merge Request | ❌ No | ❌ No | N/A |
| `develop` | Release commit* | ❌ Skipped | ❌ Skipped | N/A |

**\*Release commit**: Any commit starting with `chore(release):`

### 6.2 Step-by-Step Execution for Push to `develop`

```
Stage 1: build_app
✅ Install dependencies (npm ci)
✅ Run linting (npm run lint)

Stage 2: release (only on develop)
✅ Calculate next version (e.g., 2.1.9 → 2.1.10)
✅ Check for existing tags (prevent duplicates)
✅ Run standard-version (bump, CHANGELOG, tag)
✅ Push release commits + tag
✅ Create artifact: VERSION=2.1.10

Triggered Pipeline #2 (by release commits)
Stage 1: build_app ✅ Runs
Stage 2: release ❌ SKIPPED (release commit detected)
Stage 3: docker_build ❌ SKIPPED (release commit detected)

Stage 3: docker_build (only on main/develop, not release commits)
✅ Pull latest changes
✅ Install dependencies
✅ Build with production config (npm run buildProd)
✅ Read version (2.1.10)
✅ Login to registry
✅ Build single Docker image (no environment arg)
✅ Push with tags: 2.1.10, latest
```

### 6.3 Deployment with Runtime Configuration

After Docker image is pushed, deploy to any environment by setting runtime env vars:

```bash
# Development environment
docker run -d -p 80:80 \
  -e API_URL="https://app-dev.example.com/api" \
  -e KEYCLOAK_URL="https://keycloak-dev.example.com/" \
  -e KEYCLOAK_REALM="genai-dev" \
  -e KEYCLOAK_CLIENT_ID="genai-app" \
  -e ENVIRONMENT="development" \
  registry/psx-ng-skeleton:latest

# UAT environment (same image!)
docker run -d -p 80:80 \
  -e API_URL="https://app-uat.example.com/api" \
  -e KEYCLOAK_URL="https://keycloak-uat.example.com/" \
  -e KEYCLOAK_REALM="genai-dev" \
  -e KEYCLOAK_CLIENT_ID="genai-app" \
  -e ENVIRONMENT="uat" \
  registry/psx-ng-skeleton:latest

# Production environment (same image!)
docker run -d -p 80:80 \
  -e API_URL="https://api.example.com" \
  -e KEYCLOAK_URL="https://keycloak.example.com/" \
  -e KEYCLOAK_REALM="genai-dev" \
  -e KEYCLOAK_CLIENT_ID="genai-app" \
  -e ENVIRONMENT="production" \
  registry/psx-ng-skeleton:latest
```

**Kubernetes example:**

```yaml
apiVersion: apps/v1
kind: Deployment
metadata:
  name: app-frontend
spec:
  replicas: 3
  template:
    spec:
      containers:
      - name: psx-ng-skeleton
        image: registry/psx-ng-skeleton:2.1.10
        env:
        - name: API_URL
          value: "https://api.example.com"
        - name: KEYCLOAK_URL
          value: "https://keycloak.example.com/"
        - name: KEYCLOAK_REALM
          value: "genai-dev"
        - name: KEYCLOAK_CLIENT_ID
          value: "genai-app"
        - name: ENVIRONMENT
          value: "production"
        ports:
        - containerPort: 80
```

---

## 7. Versioning Conventions

- Version is **automatically bumped** by CI using `standard-version`
- Version taken from **`package.json`** after bump
- Release creates:
  - Version bump in `package.json`
  - CHANGELOG.md update
  - Git tag (e.g., `v2.1.10`)
  - Two commits: `chore(release): v<version>` and `chore(release): add JSON notes`
- **Docker tags are now simplified**:
  - ✅ `<version>` (e.g., `2.1.10`)
  - ✅ `latest`
- **Single image for all environments** - configured at runtime

---

## 8. Troubleshooting

### 8.1 Common Issues

#### **Issue**: `window.env is undefined` in browser console

**Cause**: `env-config.js` not loaded or generated

**Solution**:
1. Check container logs: `docker logs <container-name>`
2. Verify entrypoint generated file: `docker exec <container> cat /usr/share/nginx/html/env-config.js`
3. Ensure environment variables are passed: `docker inspect <container> | grep -A 20 Env`
4. Check `index.html` loads script: `<script src="/env-config.js"></script>`

#### **Issue**: API calls go to wrong URL

**Cause**: Runtime configuration not merged correctly

**Solution**:
1. Check `window.env` in browser console
2. Verify `main.ts` merges runtime config:
   ```typescript
   const runtimeConfig = {
      ...staticConfig,
      apiUrl: env.API_URL,
      auth: {
        ...config.auth,
        url: env.KEYCLOAK_URL,
        realm: env.KEYCLOAK_REALM,
        clientId: env.KEYCLOAK_CLIENT_ID,
        init: window.location.origin + '/'
      }
   };
   ```
3. Check container environment: `docker exec <container> printenv`

#### **Issue**: Different security headers needed per environment

**Solution**: Set `ENVIRONMENT` variable when running container:
- `development` → COOP: `unsafe-none`
- `uat`/`production` → COOP: `same-origin`

#### **Issue**: Pipeline builds multiple images for different branches

**This is the old behavior!** New approach:
- ✅ Single image built on `main`/`develop`
- ✅ Tags: `<version>` and `latest`
- ✅ Deploy same image to any environment with runtime env vars

#### **Issue**: Need to rebuild image for config change

**This is the old behavior!** New approach:
- ❌ No rebuild needed
- ✅ Just restart container with new env vars:
  ```bash
  docker run -d -p 80:80 \
    -e API_URL="https://new-api-url.com" \
    -e KEYCLOAK_URL="https://new-keycloak-url.com/" \
    -e KEYCLOAK_RELM="genai-dev" \
    -e KEYCLOAK_CLIENT_ID="genai-app" \
    registry/psx-ng-skeleton:latest
  ```

### 8.2 Verifying Runtime Configuration

**Check generated env-config.js:**

```bash
# Inside running container
docker exec <container-name> cat /usr/share/nginx/html/env-config.js

# Expected output:
# window.env = {
#   API_URL: "https://app.pxl-codit.com/api",
#   KEYCLOAK_URL: "https://keycloak.pxl-codit.com/",
#   KEYCLOAK_REALM: 'genai-dev',
#   KEYCLOAK_CLIENT_ID: 'genai-app'
# };
```

**Check browser console:**

```javascript
console.log(window.env);
// Should show: {API_URL: "...", KEYCLOAK_URL: "...", KEYCLOAK_REALM: "...", KEYCLOAK_CLIENT_ID: "..."}
```

**Check nginx configuration:**

```bash
docker exec <container-name> cat /etc/nginx/conf.d/default.conf
# Verify COOP and CSP headers are rendered correctly
```

---

## 9. Best Practices

### 9.1 Development Workflow

1. **Feature branches**: Create from `develop`
2. **Merge Requests**: Use MRs for code review
3. **Automatic versioning**: Let CI handle version bumps on `develop`
4. **Single image**: Build once, deploy everywhere
5. **Runtime configuration**: Change env vars without rebuild

### 9.2 Versioning Strategy

1. **Patch releases**: Bug fixes (default)
2. **Minor releases**: New features
3. **Major releases**: Breaking changes
4. **Conventional commits**: For automatic CHANGELOG

### 9.3 Docker Images

1. **Single image strategy**: Build once with production config
2. **Runtime configuration**: Pass env vars at container startup
3. **Simplified tags**: Use `<version>` and `latest`
4. **Image cleanup**: Regularly clean old versions
5. **Security scanning**: Add vulnerability scanning

### 9.4 Security

1. **Secrets management**: Never commit secrets
2. **Token rotation**: Regularly rotate tokens
3. **Runtime security**: Security headers configured via `ENVIRONMENT` variable
4. **Environment isolation**: Use same image, different env vars per environment
---

## 🧑‍💻 Author

**Angular Product Skeleton**  
Built by **Tarik Haddadi** using Angular 19 and modern best practices (2025).