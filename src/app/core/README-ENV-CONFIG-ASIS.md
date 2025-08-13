# ⚙️ Runtime Environment Config

>_Last updated: 2025-08-13_

Instead of Angular's build-time `environment.ts`, this project loads configuration **at runtime** via:

```ts
fetch('assets/config.json')
```

## As Is Configs
```text
public/assets/config.dev.json
public/assets/config.uat.json
public/assets/config.prod.json
```

Keep deploy-time environment in `public/assets/config.json` (copied to `/assets/config.json` at build). Example:


**Example (`public/assets/config.dev.json`)**
```json
{
  "name": "dev",
  "production": false,
  "apiUrl": "https://dev.api.yourdomain.com",
  "auth": {
    "url": "http://localhost:8080/",
    "realm": "my-realm",
    "clientId": "eportal_chatbot",
    "init": {
      "onLoad": "login-required",
      "checkLoginIframe": false,
      "pkceMethod": "S256"
    }
  }
}
```

Minimal typed access:

```ts
export interface AppConfig {
  name: 'dev' | 'uat' | 'prod';
  production: boolean;
  apiUrl: string;
}

export class ConfigService {
  private config!: AppConfig;

  async load(): Promise<void> {
    const res = await fetch('assets/config.json');
    this.config = (await res.json()) as AppConfig;
  }

  get<T extends keyof AppConfig>(key: T): AppConfig[T] {
    return this.config[key];
  }

  all(): AppConfig {
    return this.config;
  }
}
```

Bootstrap-time load (example):

```ts
const cfg = new ConfigService();
await cfg.load();
// provide it in DI or attach to app initializer before bootstrap
```

**Why this setup?**  
- Change envs by swapping `config.json` on the server/CDN—**no rebuild**.
- Keep assets versioned and cacheable under `/assets`.
- Keep global styles & themes outside the bundle when needed.


## 🧑‍💻 Author

**Angular Product Skeleton**  
Built by **Tarik Haddadi** using Angular 19 and modern best practices (2025).