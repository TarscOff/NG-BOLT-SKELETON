
# 🎨 Theming Support
>
>_Last updated: 2025-09-11_

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

# Styling Guide for Dynamic Form Components

This document explains how **styling and coloring** works for dynamic
form components in the Core SDK.\
It focuses only on styling and theming so developers can easily apply
consistent colors across components.

------------------------------------------------------------------------

## 1. Layout Classes

Each field in a form can define a `layoutClass` property.\
This property is directly applied to the host Material component via
`[class]="field.layoutClass"`.

### Example

``` ts
field: FieldConfig = {
  name: 'username',
  type: 'text',
  label: 'User Name',
  layoutClass: 'success',   // <- applied to the mat-form-field
  color: 'primary'
}
```

### Supported Layout Classes

- `primary`
- `accent`
- `warn`
- `success`
- `neutral`

> These map to custom CSS palettes defined in the global stylesheet.

------------------------------------------------------------------------

## 2. Base CSS Variables

At the root level, we define a palette of custom CSS variables:

``` css
:root {
  --mat-primary: #ca1149;
  --mat-primary-variant: #1e88e5;
  --mat-accent: #ff4081;
  --mat-warn: #ec9a00ff;
  --mat-neutral: #9e9e9e;
  --mat-success: #4caf50;
  --mat-error: #4caf50;
}
```

These variables represent the base colors for the theme.\
Components use them through Material Design tokens.

------------------------------------------------------------------------

## 3. Hue Classes

Each layout class remaps the base Material roles (`primary`, `accent`,
`warn`) inside the component subtree.

``` css
.primary { --mat-primary: var(--mat-primary); }
.accent  { --mat-primary: var(--mat-accent); }
.warn    { --mat-primary: var(--mat-warn); }
.success { --mat-primary: var(--mat-success); }
.neutral { --mat-primary: var(--mat-neutral); }
.error { --mat-error: var(--mat-error); }
```

All components keep `[color]="'primary'"`, but the meaning of "primary"
changes depending on the class.

------------------------------------------------------------------------

## 4. Material Design Tokens

To ensure Angular Material components actually adopt the new colors, MDC
tokens are overridden inside each hue class.

Example for `.success`:

``` css
.success {
  --mdc-outlined-text-field-outline-color: var(--mat-primary);
  --mdc-outlined-text-field-hover-outline-color: var(--mat-primary);
  --mdc-outlined-text-field-focus-outline-color: var(--mat-primary);
  --mdc-outlined-text-field-caret-color: var(--mat-primary);
  --mdc-slider-handle-color: var(--mat-primary);
  --mdc-switch-selected-handle-color: var(--mat-primary);
  --mat-datepicker-calendar-date-selected-state-background-color: var(--mat-primary);
}
```

This guarantees that borders, carets, slider thumbs, switches, chips,
and datepickers all reflect the field's hue.

------------------------------------------------------------------------

## 5. Component Usage

All dynamic form components already bind `layoutClass` in their
templates.

Examples:

``` html
<!-- Text Input -->
<mat-form-field [class]="field.layoutClass" [color]="'primary'"> ... </mat-form-field>

<!-- Select -->
<mat-form-field [class]="field.layoutClass" [color]="'primary'"> ... </mat-form-field>

<!-- Slider -->
<mat-slider [class]="field.layoutClass" [color]="'primary'"> ... </mat-slider>

<!-- Toggle -->
<mat-slide-toggle [class]="field.layoutClass" [color]="'primary'"> ... </mat-slide-toggle>

<!-- Chips -->
<mat-chip-option [class]="field.layoutClass" [color]="'primary'"> ... </mat-chip-option>

<!-- Datepicker -->
<mat-datepicker [class]="field.layoutClass"></mat-datepicker>
```

------------------------------------------------------------------------

## 6. Adding a New Color

1. Define the color in `:root`:

``` css
:root {
  --mat-info: #2196f3;
}
```

2. Add a hue class remap:

``` css
.info {
  --mat-primary: var(--mat-info);
}
```

3. Use it in a field config:

``` ts
field.layoutClass = 'info';
```

The component will now be styled with the `info` hue.

------------------------------------------------------------------------

## 7. Best Practices

- Always pass `[color]="'primary'"` to Material components.\
    The class remapping takes care of applying the actual hue.
- Use semantic `layoutClass` values (`success`, `neutral`, etc.)
    instead of hard-coded colors.
- Keep overrides **scoped** under classes to avoid global theme
    pollution.
- Extend only by defining new CSS variables + hue classes; no need to
    touch TypeScript.

------------------------------------------------------------------------

## Summary

✔ `layoutClass` drives the per-field color.\
✔ Custom colors are managed via CSS variables in `:root`.\
✔ Hue classes remap Material's roles locally.\
✔ MDC tokens ensure all component parts adopt the hue.\
✔ Adding a new color = define var + hue class + use in field config.

This setup provides a **flexible, scalable, and theme-safe** way to
style all dynamic form components consistently.

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
