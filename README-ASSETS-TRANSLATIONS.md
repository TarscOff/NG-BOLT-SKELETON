
# 🎨 Theming Support
>_Last updated: 2025-08-13_

This project includes a fully dynamic theming system that allows runtime switching between **light** and **dark** modes with the following structure:

## ✅ How It Works

- The app injects a `<link id="theme-style">` tag that is updated at runtime to switch between `light.css` and `dark.css` themes
- The `ThemeService` handles:
  - Toggling between modes via a signal
  - Saving the user's preference to `localStorage`
  - Updating the `<html>` tag with `light` or `dark` class
- The SCSS root includes a base Material theme using the `@use '@angular/material' as mat;` system, but the main theme variables are controlled via pre-generated Material tokens

## 📁 Theme File Structure

Theme CSS files are stored in:
```text
public/assets/theme/
├── light.css ← default light theme (Material Theme Generator)
└── dark.css ← dark theme variant
```


## 🗂️ Assets And Translations (styles, i18n)

All static assets live under `public/assets` and are served at runtime from `/assets` (thanks to the `angular.json` mapping). This lets us ship **styles**, **i18n files**, **icons**, and a **runtime environment config** without rebuilding the app.

### Angular CLI mapping

```jsonc
// angular.json -> architect.build.options.assets
[
  { "glob": "**/*", "input": "public/assets", "output": "assets" },
  { "glob": "favicon.ico", "input": "public", "output": "/" }
]
```

- Build/serve outputs everything from `public/assets/**` to `/assets/**` in `dist/`.
- Unit tests also serve assets (see `architect.test.options.assets`).

### Styles

Global styles are included by Angular CLI:

```jsonc
// angular.json -> architect.build.options.styles
[
  "src/styles.scss",
  "src/styles/main.scss"
]
```

You can also keep additional CSS under `public/assets/theme/` and link or swap them at runtime:

```html
<!-- src/index.html -->
<link id="theme-style" rel="stylesheet" href="assets/theme/light.css" />
```

> Tip: swap the `href` at runtime to toggle themes without a rebuild.

## 🔠 i18n (ngx-translate)

Place translation files under `public/assets/i18n`:

```
public/assets/i18n/en.json
public/assets/i18n/fr.json
```

Configure the HTTP loader to read from `/assets/i18n/`:

```ts
// app.config.ts (or app.module.ts for non-standalone setups)
import { provideHttpClient, withInterceptorsFromDi } from '@angular/common/http';
import { TranslateLoader, TranslateModule } from '@ngx-translate/core';
import { TranslateHttpLoader } from '@ngx-translate/http-loader';
import { HttpClient } from '@angular/common/http';

export function httpLoaderFactory(http: HttpClient) {
  return new TranslateHttpLoader(http, 'assets/i18n/', '.json');
}

// In your providers/imports:
TranslateModule.forRoot({
  loader: { provide: TranslateLoader, useFactory: httpLoaderFactory, deps: [HttpClient] }
});
```

Usage in templates: `{{ 'home.title' | translate }}`



## 🧑‍💻 Author

**Angular Product Skeleton**  
Built by **Tarik Haddadi** using Angular 19 and modern best practices (2025).

