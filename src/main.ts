/// <reference types="@angular/localize" />

import { bootstrapApplication } from '@angular/platform-browser';
import { inject } from '@angular/core';
import { provideAppInitializer } from '@angular/core';
import { AppComponent } from './app/app.component';
import { appConfig } from './app/app.config';
import { ConfigService } from './app/core/services/config.service';

export function loadTheme(theme: 'light' | 'dark') {
  const href = `/assets/theme/${theme}.css`;
  const existing = document.getElementById('theme-style') as HTMLLinkElement | null;
  if (existing) { existing.href = href; return; }
  const link = document.createElement('link');
  link.id = 'theme-style';
  link.rel = 'stylesheet';
  link.href = href;
  document.head.appendChild(link);
}

// Initializer that waits for config.json
const initConfig = () => inject(ConfigService).loadConfig();

// (optional) sync initializer for theme
const initTheme = () => loadTheme('light');

bootstrapApplication(AppComponent, {
  providers: [
    ...appConfig.providers,
    ConfigService,
    provideAppInitializer(initConfig),
    provideAppInitializer(initTheme),
  ]
}).catch(err => console.error('Bootstrap failed:', err));
