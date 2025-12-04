# Starter App – CI/CD Setup (Azure DevOps & GitHub Actions)

>_Last updated: 2025-12-04_

This document explains how the CI/CD is configured for the **Starter App** across:

- **Azure DevOps** (build + Docker + push to ACR + automated versioning)
- **GitHub Actions** (build + Docker to GHCR + automated versioning)

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
COPY --from=builder /app/dist/acd /usr/share/nginx/html
COPY nginx/default.conf.template /etc/nginx/conf.d/default.conf.template
COPY docker-entrypoint.sh /docker-entrypoint.sh
RUN chmod +x /docker-entrypoint.sh

EXPOSE 80
ENTRYPOINT ["/docker-entrypoint.sh"]
```

The Angular build output is expected at:

```text
dist/acd
```

### 1.2 Environment config files

The Angular app uses a runtime `config.json` copied from branch-specific files:

- `public/assets/config.prod.json`
- `public/assets/config.uat.json`
- `public/assets/config.dev.json`

Each pipeline copies the right file to `public/assets/config.json` **before** building.

Branch mapping:

- `master` → `config.prod.json` → `--configuration=production`
- `uat`  → `config.uat.json` → `--configuration=uat`
- `staging` → `config.uat.json` → `--configuration=uat`
- everything else (`develop`, feature branches) → `config.dev.json` → `--configuration=development`

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

- Push and PR to: `master`, `develop`, `staging`, `uat`

```yaml
trigger:
  branches:
    include: [ master, develop, staging, uat ]

pr:
  branches:
    include: [ master, develop, staging, uat ]
```

### 2.2 Variables

```yaml
variables:
  NODE_VERSION: '20.x'
  DOCKER_REPOSITORY: 'pxs-acd-app'
  DOCKER_SERVICE_CONNECTION: 'FrontSocleServiceConn'
  PKG_PATH: 'package.json'
  APP_NAME: 'pxs-acd-app'
  RELEASE_TYPE: 'patch'  # default release type; can be overridden
```

- **DOCKER_SERVICE_CONNECTION**: name of the Docker registry service connection pointing to the Azure Container Registry (ACR).
- **DOCKER_REPOSITORY**: repository name inside the registry (e.g. `pxs-acd-app`).
- **PKG_PATH**: path to the app's `package.json` used to read the version.
- **RELEASE_TYPE**: type of version bump (patch/minor/major) for automated releases.

### 2.3 Build & Docker stage

Main steps:

1. `npmAuthenticate@0` loads credentials into `.npmrc` using the Azure Artifacts feed.
2. `npm ci` + `npm run lint`.
3. **CI release step (bump version + CHANGELOG.md + tag)** - runs on develop only (not PRs, not already a release commit):
   - Executes `npm run release:patch:nopush`, `release:minor:nopush`, or `release:major:nopush` based on `RELEASE_TYPE`
   - Updates version in `package.json`
   - Generates/updates `CHANGELOG.md`
   - Creates Git tag
   - Commits with message `chore(release): v<version> – CI release <branch>`
4. Copy the correct `config.*.json` based on `$(Build.SourceBranchName)` and run Angular build.
5. Read `version` from `package.json` and expose it as `APP_VERSION`.
6. `Docker@2` builds and pushes image to the configured ACR with tags:
   - `<branch>-acd-<version>` (e.g. `develop-acd-1.9.4`)
   - `latest-acd-<branch>` (e.g. `latest-acd-develop`)
7. **Push release commit + tags** - only on develop (not PRs, not already a release commit)

**Note**: Docker build/push is skipped for Pull Requests (condition: `ne(variables['Build.Reason'], 'PullRequest')`).

### 2.4 Azure DevOps setup checklist

1. **Artifacts feeds permissions**:  
   - In Azure DevOps → Artifacts → the relevant feeds (PXS-NG-CORE / PXS-NG-STARTER-APP)
   - Grant **Reader** or **Contributor** to the build service (e.g. `Project Build Service`).

2. **Docker service connection**:  
   - Project Settings → Service connections → New → Docker Registry
   - Point to the ACR instance.
   - Name it `FrontSocleServiceConn` (or update `DOCKER_SERVICE_CONNECTION` in YAML).

3. **Repository permissions**:
   - Ensure build service has permission to push commits and tags back to the repository.

---

## 3. GitHub Actions – `.github/workflows/main.yml`

### 3.1 Workflow overview

The GitHub workflow includes:

- Job `build_app`: npm install, lint (runs on all branches/PRs).
- Job `release`: bump version, CHANGELOG, tag and push (runs only on `master`, `develop`, `staging`, `uat`, not on PRs).
- Job `docker_build`: build and push Docker image to **GitHub Container Registry (GHCR)** (runs only on `master`, `develop`, `staging`, `uat`, not on PRs).

### 3.2 Permissions and triggers

```yaml
name: Starter CI

on:
  push:
    branches: [ master, develop, staging, uat ]
  pull_request:
    branches: [ master, develop, staging, uat ]

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

### 3.4 Release job (automated versioning)

The `release` job runs after `build_app` succeeds and:

1. Checks out the repository with full history (`fetch-depth: 0`)
2. Configures npm for Azure Artifacts
3. Installs dependencies with `npm ci`
4. Configures Git user (github-actions bot)
5. Bumps version based on `RELEASE_TYPE` (patch/minor/major):
   - Executes `npm run release:patch:nopush`, `release:minor:nopush`, or `release:major:nopush`
   - Updates `package.json` version
   - Generates/updates `CHANGELOG.md`
   - Creates Git tag
   - Commits with message `chore(release): v<version> – CI release <branch>`
6. Pushes the release commit and tags to GitHub
7. Outputs the new version for use in subsequent jobs

**Conditions**: Only runs on push (not PRs) to `master`, `develop`, `staging`, `uat`, and only if the commit message doesn't already start with `chore(release): v`.

### 3.5 Docker image tags (GHCR)

- Registry: `ghcr.io`
- Repo: `ghcr.io/<owner>/<repo>` (lowercased in the workflow).
- Tags:

  - `<safe-branch>-acd-<version>` (slashes in branch names are replaced by `-`)
  - `latest-acd-<safe-branch>`

Example:

```text
ghcr.io/your_tenant/ng-bolt-skeleton:develop-acd-1.9.4
ghcr.io/your_tenant/ng-bolt-skeleton:latest-acd-develop
```

The workflow uses `docker/login-action` and `docker/build-push-action` with `GITHUB_TOKEN` to push to GHCR.

### 3.6 Job conditions

- `build_app`: runs on all configured branches and PRs.
- `release`: runs only on `master`, `develop`, `staging`, `uat` (not PRs, not already a release commit).
- `docker_build`: runs only on `master`, `develop`, `staging`, `uat` (not PRs, after successful build and release).

### 3.7 GitHub setup checklist

1. Create repository secret **`AZURE_ARTIFACT_PAT`** with Azure DevOps PAT (Packaging/Read).
2. Ensure workflow file is at `.github/workflows/main.yml` and committed to the repo.
3. First push to `master`/`develop` will create the GHCR repo automatically when the image is pushed.
4. Ensure `config.prod.json`, `config.uat.json`, and `config.dev.json` exist in `public/assets/`.
5. Verify that the GitHub Actions bot has write permissions to push commits and tags.

---

## 4. Quick setup checklist for a new environment

When cloning or onboarding this Starter App to a new environment, ensure:

### 4.1 Azure DevOps

- [ ] Configure **Artifacts** feeds and give the build service **Reader** access.
- [ ] Create Docker service connection `FrontSocleServiceConn` pointing to ACR.
- [ ] Verify `azure-pipelines.yml` is at repo root and triggers match desired branches.
- [ ] Ensure build service has permissions to push commits and tags to repository.

### 4.2 GitHub

- [ ] Add **`AZURE_ARTIFACT_PAT`** secret with Azure DevOps PAT (Packaging/Read).
- [ ] Confirm workflow at `.github/workflows/main.yml` is committed.
- [ ] Ensure `permissions: contents: write, packages: write` is present in workflow.
- [ ] Validate that `Dockerfile`, `.npmrc`, and `public/assets/config.*.json` are present.
- [ ] Verify GitHub Actions has write permissions to push commits and tags.

---

## 5. Pipeline Execution Flow – Understanding What Happens on Each Run

This section explains step-by-step what happens when the CI/CD pipeline runs, helping you understand the logs and behavior for different scenarios.

### 5.1 Execution overview by branch and trigger type

| Branch | Trigger | Version Bump? | Docker Build? | Push Commit/Tags? | Notes |
|--------|---------|---------------|---------------|-------------------|-------|
| `develop` | Direct push | ✅ Yes | ✅ Yes | ✅ Yes (Azure & GitHub) | Full release cycle |
| `master` | Direct push | ❌ No (Azure) / ✅ Yes (GitHub) | ✅ Yes | ❌ No (Azure) / ✅ Yes (GitHub) | Azure: only on develop |
| `staging` | Direct push | ❌ No (Azure) / ✅ Yes (GitHub) | ✅ Yes | ❌ No (Azure) / ✅ Yes (GitHub) | Azure: only on develop |
| `uat` | Direct push | ❌ No (Azure) / ✅ Yes (GitHub) | ✅ Yes | ❌ No (Azure) / ✅ Yes (GitHub) | Azure: only on develop |
| Any branch | Pull Request | ❌ No | ❌ No | ❌ No | Build + lint only |
| Any branch | Release commit | ❌ Skipped | ❌ Skipped | ❌ Skipped | Prevents infinite loop |

**Key differences between platforms:**
- **Azure Pipelines**: Currently configured to bump version only on `develop` branch
- **GitHub Actions**: Bumps version on all 4 branches (`master`, `develop`, `staging`, `uat`)

### 5.2 Step-by-step execution for a typical push to `develop`

#### **Azure DevOps Pipeline**

```
✅ Step 1: Checkout (with full history + tags)
   → Fetches all commits and tags for CHANGELOG generation

✅ Step 2: Check for release commit
   → Reads commit message
   → If starts with "chore(release):" → FAIL and exit (prevents infinite loop)
   → Otherwise → Continue

✅ Step 3: Authenticate to Azure Artifacts
   → Injects PAT token into .npmrc

✅ Step 4: Install & Lint
   → npm ci (installs all dependencies)
   → npm run lint (validates code quality)

✅ Step 5: Configure Git identity
   → Sets up "Azure Pipeline Bot" as committer

✅ Step 6: Bump version + CHANGELOG + tag
   ⚠️  ONLY on develop branch (Azure), not PRs, not release commits
   → Runs: npm run release:patch:nopush
   → Updates package.json version (e.g., 2.1.4 → 2.1.5)
   → Generates CHANGELOG.md with commit history
   → Creates release-notes/release-v2.1.5.json
   → Creates Git tag v2.1.5
   → Creates commit: "chore(release): v2.1.5 – CI release develop"
   → Does NOT push yet (nopush flag)

✅ Step 7: Build Angular app
   → Copies config.dev.json to config.json (for develop branch)
   → Runs: npm run build -- --configuration=development
   → Output: dist/acd/

✅ Step 8: Read version from package.json
   → Extracts version (e.g., 2.1.5)
   → Stores in pipeline variable: APP_VERSION

✅ Step 9: Build & Push Docker image
   ⚠️  Skipped on PRs
   → Builds Docker image using Dockerfile
   → Tags: develop-acd-2.1.5, latest-acd-develop
   → Pushes to Azure Container Registry (pxs-acd-app)

✅ Step 10: Push release commit + tags
   ⚠️  ONLY on develop branch (Azure), not PRs, not release commits
   → Resets modified files (.npmrc, config.json)
   → Pushes HEAD to origin/develop with --follow-tags
   → This triggers a new pipeline run, BUT it will be skipped by Step 2
```

#### **GitHub Actions Workflow**

```
Job 1: build_app (runs on all branches/PRs)
✅ Checkout → Setup Node → Configure npm → Install & Lint

Job 2: release (only on master/develop/staging/uat, not PRs, not release commits)
✅ Checkout with full history
✅ Configure npm for Azure Artifacts
✅ Install dependencies
✅ Configure Git (github-actions bot)
✅ Bump version + CHANGELOG + tag
   → Same as Azure Step 6
✅ Push release commit + tags to GitHub
✅ Output version for next job

Job 3: docker_build (only on master/develop/staging/uat, not PRs)
✅ Checkout + pull latest changes (to get release commit)
✅ Configure npm
✅ Install & build Angular with environment config
✅ Read version from package.json
✅ Build & push Docker image to GHCR
   → Tags: develop-acd-2.1.5, latest-acd-develop
```

### 5.3 What happens on a Pull Request?

**Both platforms:**

```
✅ Checkout
✅ Authenticate to Azure Artifacts
✅ Install dependencies (npm ci)
✅ Lint (npm run lint)
⏭️  Skip version bump
⏭️  Skip Docker build
⏭️  Skip push
```

**Result**: PR validation only, no deployable artifacts.

### 5.4 Identifying a release commit (automatic skip)

After a successful release, the pipeline pushes a commit like:

```
chore(release): v2.1.5 – CI release develop
```

When this commit triggers a new pipeline run:

**Azure Pipelines:**
```
✅ Step 1: Checkout
✅ Step 2: Check for release commit
   → Detects "chore(release):" prefix
   → Logs warning: "Skipping build - release commit detected"
   → Exits with code 1 → Pipeline FAILS (expected)
   → This prevents infinite loop of releases
```

**GitHub Actions:**
```
✅ build_app starts
❌ release job condition fails (commit message check)
   → Job is skipped
❌ docker_build depends on successful release
   → Job is skipped
```

**Result**: Both platforms stop processing release commits to prevent infinite loops.

### 5.5 Understanding pipeline logs – What to look for

#### ✅ **Successful version bump** (Azure)

Look for this in Step 6 logs:

```
Running CI release of type: patch
✔ bumping version in package.json from 2.1.4 to 2.1.5
✔ outputting changes to CHANGELOG.md
✔ committing package.json and CHANGELOG.md
✔ tagging release v2.1.5
✔ Run `git push --follow-tags origin develop` to publish
v2.1.5
a1b2c3d chore(release): v2.1.5 – CI release develop
```

#### ✅ **Successful Docker push** (Azure)

Look for in Step 9 logs:

```
Successfully built a1b2c3d4e5f6
Successfully tagged pxs-acd-app:develop-acd-2.1.5
Successfully tagged pxs-acd-app:latest-acd-develop
Pushing develop-acd-2.1.5...
Pushing latest-acd-develop...
```

#### ⏭️ **Skipped version bump** (not on develop branch in Azure)

Step 6 logs:

```
Condition not met: eq(variables['Build.SourceBranch'], 'refs/heads/develop')
Step skipped
```

#### ⏭️ **Release commit detected** (expected failure)

Step 2 logs:

```
Commit message: chore(release): v2.1.5 – CI release develop
##[warning]Skipping build - release commit detected
Exiting pipeline to prevent infinite loop
##[error]Bash exited with code '1'.
```

**This is expected behavior!** The pipeline fails on purpose to stop the infinite loop.

---

## 6. Versioning conventions

- The version is **automatically bumped** by the CI pipelines using `standard-version` via release scripts.
- The version is taken from **`package.json`** (field `version`) after the automated bump.
- The release creates:
  - Version bump in `package.json` (patch/minor/major based on `RELEASE_TYPE`)
  - CHANGELOG.md update with commit history
  - Git tag (e.g., `v1.9.4`)
  - Commit with message `chore(release): v<version> – CI release <branch>`
- Docker tags follow the pattern:

  - `<branch>-acd-<version>` (e.g., `develop-acd-1.9.4`, `master-acd-1.9.4`)
  - `latest-acd-<branch>` (e.g., `latest-acd-develop`, `latest-acd-master`)

- Branch names with slashes (e.g. `feature/login`) are sanitized in GitHub workflow by replacing `/` with `-` for Docker tags.
- **Azure Pipelines**: Pushes release commits and tags only on `develop` branch.
- **GitHub Actions**: Pushes release commits and tags on `master`, `develop`, `staging`, and `uat` branches.

---

This README should be kept in sync with:

- `azure-pipelines.yml`
- `.github/workflows/main.yml`

Whenever the CI/CD is updated, update this doc accordingly.

## 🧑‍💻 Author

**Angular Product Skeleton**  
Built by **Tarik Haddadi** using Angular 19+ and modern best practices (2025).