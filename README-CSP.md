
# 🚀 CI/CD (Azure Pipelines & GitLab CI)
>_Last updated: 2025-08-13_

Both pipelines do the following:
1. **Install + lint**.
2. **Select config** (`dev/uat/prod`) → copy to `public/assets/config.json`.
3. **Build Angular**.
4. **Build Docker image** with a versioned tag.
5. *(Optional)* **CSP smoke test**: run the container with `KEYCLOAK_ORIGIN` / `API_ORIGINS` and assert CSP header is present with `curl -I`.

## 🚀 Azure DevOps — CSP smoke test (snippet)
```yaml
- script: |
    VERSION=$(node -p "require('./package.json').version")
    KC=$(jq -r '.auth.url' public/assets/config.json | sed 's:/*$::')
    API=$(jq -r '.apiUrl' public/assets/config.json)
    REPORT=$([ "$(Build.SourceBranchName)" = "main" ] && echo false || echo true)

    docker run -d --rm       -e KEYCLOAK_ORIGIN="$KC"       -e API_ORIGINS="$API"       -e CSP_REPORT_ONLY="$REPORT"       -p 8081:80 myapp:$(Build.SourceBranchName)-$VERSION

    sleep 2
    curl -sI http://localhost:8081 | grep -i "content-security-policy"
  displayName: 'CSP header smoke test'
```

## 🚀 GitLab CI — CSP smoke test (snippet)
```yaml
csp_test:
  image: docker:20
  services: [ docker:dind ]
  stage: test
  script:
    - apk add --no-cache jq curl
    - VERSION=$(node -p "require('./package.json').version")
    - KC=$(jq -r '.auth.url' public/assets/config.json | sed 's:/*$::')
    - API=$(jq -r '.apiUrl' public/assets/config.json)
    - REPORT=$([ "$CI_COMMIT_BRANCH" = "main" ] && echo false || echo true)
    - docker run -d --rm -e KEYCLOAK_ORIGIN="$KC" -e API_ORIGINS="$API" -e CSP_REPORT_ONLY="$REPORT" -p 8081:80 $CI_REGISTRY_IMAGE:$CI_COMMIT_BRANCH-$VERSION
    - sleep 2
    - curl -sI http://localhost:8081 | grep -i "content-security-policy"
```

> In deployment (Kubernetes, App Service, etc.), pass the same env vars to the container.



## 6. Troubleshooting tips

### 6.1 `npm ci` fails with `E401 Unable to authenticate`

- Ensure the Azure DevOps PAT has **Packaging / Read**.
- Confirm the PAT is correctly configured:
  - **Azure DevOps**: via `npmAuthenticate@0` + `.npmrc` without hard-coded PAT.
  - **GitHub**: `AZURE_ARTIFACT_PAT` secret is set and appended to `.npmrc`.

### 6.2 Docker image not found in CSP test

- Check the tag used in `csp_test` matches the tag created in `docker_build`:
  - `<safe-branch>-<version>` and `latest-<safe-branch>`.
- Ensure the registry (GHCR) login succeeded in the build job.

### 6.3 CSP test fails

- Verify that the config file for the branch contains valid `auth.url` and `apiUrl` values.
- Check the container logs: `docker logs <container_id>`.
- Ensure `jq` and `curl` are installed in the test job runner.


## 🧑‍💻 Author

**Angular Product Skeleton**  
Built by **Tarik Haddadi** using Angular 19 and modern best practices (2025).

