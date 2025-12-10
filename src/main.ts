/// <reference types="@angular/localize" />

import { bootstrapApplication } from '@angular/platform-browser';
import { AppComponent } from './app/app.component';
import { appConfig } from './app/app.config';
import { provideCore } from '@cadai/pxs-ng-core/core';
import pkg from '../package.json';

(async () => {
  // Load runtime env before bootstrapping
  const res = await fetch('/assets/config.json', { cache: 'no-store' });
  if (!res.ok) throw new Error(`Failed to load config: ${res.status} ${res.statusText}`);
  const env = await res.json();

  await bootstrapApplication(AppComponent, {
    providers: [
      ...appConfig.providers!,
      provideCore({
        logoUrl: 'logo.png',
        appVersion: pkg.version,
        environments: env,
        theme: 'dark',
        i18n: {
          prefix: 'assets/i18n/',
          suffix: '.json',
        },
      }),
    ],
  });
})().catch(err => console.error('Bootstrap failed:', err));
