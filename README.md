# AI Product – Angular 19 Skeleton
>_Last updated: 2025-08-21_

> 🚀 Modern Angular 19 project template with runtime environment configs, standalone components, NgRx state management, dynamic forms, internationalization, and full CI/CD support.


---

## 🧭 Quick Start for Developers

1. Set up a Keycloak client (Public + PKCE S256) and brokered IdPs if needed.  
2. Update `public/assets/config.dev.json` (`auth.url/realm/clientId`).  
3. `npm start` → app redirects to Keycloak and back.  
4. Verify API calls include Bearer token.  
5. For CSP, start with Report‑Only and review DevTools for violations.

---

Only config.json is loaded by the app, so CI/CD pipelines copy the correct version based on branch or env.

## ⚒️ Development build & serve
```
npm start                 # = ng serve
```
### Static builds
```
npm run build             # = ng build --configuration=development
npm run buildUat
npm run buildProd
```

### Watch mode
```
npm run watch
```
### Testing & Linting
```
npm run test
npm run lint
```

## 📁 Project Structure Highlights

| Path                                                     | Purpose                                             |
|----------------------------------------------------------|-----------------------------------------------------|
| `public/assets/config.*.json`                            | Runtime environment configs (`dev`, `uat`, `prod`)  |
| `src/app/app.config.ts`                                  | Angular 19 `ApplicationConfig` & DI providers       |
| `src/app/app.routes.ts`                                  | Routing config using standalone components          |


## 🧠 Notes

This project uses Angular strict mode (`strict: true`) and TypeScript with:

- `resolveJsonModule`
- `esModuleInterop`
- `strictTemplates`
- `noImplicitReturns`
- `noFallthroughCasesInSwitch`


## 📃 Documentation Index
Legend: **✅ Done** · **🟡 Ongoing** · **❌ To do**  

- [[✅] - Global Core Overview](./README-OVERVIEW.md)
- [[✅] - Change log](./CHANGELOG.md)
- [[✅] - Theming, Assets and translattions](./README-ASSETS-TRANSLATIONS.md)
- [[🟡] - CI/CD](./README-CI-CD.md)
- [[✅] - Contribution Guide](./CONTRIBUTING.md)



## 🧑‍💻 Author

**Angular Product Skeleton**  
Built by **Tarik Haddadi** using Angular 19 and modern best practices (2025).

