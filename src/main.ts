/// <reference types="@angular/localize" />

import { bootstrapApplication } from '@angular/platform-browser';
import { provideAppInitializer } from '@angular/core';
import { AppComponent } from './app/app.component';
import { appConfig } from './app/app.config';
import { provideCore } from '@cadai/pxs-ng-core/core';
import pkg from '../package.json';

/** Simple theme loader (sync) */
export function loadTheme(theme: 'light' | 'dark') {
  const href = `assets/theme/${theme}.css`;
  const existing = document.getElementById('theme-style') as HTMLLinkElement | null;
  if (existing) { existing.href = href; return; }
  const link = document.createElement('link');
  link.id = 'theme-style';
  link.rel = 'stylesheet';
  link.href = href;
  document.head.appendChild(link);
}

(async () => {
  // Load runtime env before bootstrapping
  const res = await fetch('/assets/config.json', { cache: 'no-store' });
  if (!res.ok) throw new Error(`Failed to load config: ${res.status} ${res.statusText}`);
  const env = await res.json();

  await bootstrapApplication(AppComponent, {
    providers: [
      ...appConfig.providers!,                // router, animations, store
      provideCore({
        appVersion: pkg.version,
        environments: env,
        theme: 'light',
        i18n: {
          prefix: 'assets/i18n/',
          suffix: '.json',
          fallbackLang: 'en',
          lang: 'en',
        },
      }),
      provideAppInitializer(() => loadTheme('light')),
    ],
  });
})().catch(err => console.error('Bootstrap failed:', err));
