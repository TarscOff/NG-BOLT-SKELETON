
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

## 🧑‍💻 Author

**Angular Product Skeleton**  
Built by **Tarik Haddadi** using Angular 19 and modern best practices (2025).

