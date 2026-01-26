/// <reference types="@angular/localize" />

import { bootstrapApplication } from '@angular/platform-browser';
import { AppComponent } from './app/app.component';
import { appConfig } from './app/app.config';
import { provideCore } from '@cadai/pxs-ng-core/core';
import pkg from '../package.json';
import { env } from './app/shared/interfaces/runtime.model';
import { RuntimeConfig } from '@cadai/pxs-ng-core/interfaces';

(async () => {
  // Load runtime env before bootstrapping
  const res = await fetch('/assets/config.json', { cache: 'no-store' });
  if (!res.ok) throw new Error(`Failed to load config: ${res.status} ${res.statusText}`);
  const config = await res.json();

  // Merge runtime environment variables
  const runtimeConfig:RuntimeConfig = {
    ...config,
    apiUrl: env.API_URL,
    auth: {
      ...config.auth,
      url: env.KEYCLOAK_URL,
      realm: env.KEYCLOAK_REALM,
      clientId: env.KEYCLOAK_CLIENT_ID,
      init: window.location.origin + '/'
    }
  };

  await bootstrapApplication(AppComponent, {
    providers: [
      ...appConfig.providers!,
      provideCore({
        appVersion: pkg.version,
        environments: runtimeConfig,
        logoUrl: 'assets/logo.png',
        theme: 'dark',
        i18n: {
          prefix: 'assets/i18n/',
          suffix: '.json',
        },
      }),
    ],
  });
})().catch(err => console.error('Bootstrap failed:', err));