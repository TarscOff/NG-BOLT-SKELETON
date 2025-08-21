import { ApplicationConfig } from '@angular/core';
import { provideRouter } from '@angular/router';
import { provideAnimations } from '@angular/platform-browser/animations';
import { routes } from './app.routes';
import { provideCore } from '@cadai/pxs-ng-core/core';
import { provideAppStore } from '@cadai/pxs-ng-core/store';
import pkg from '../../package.json';


export const appConfig: ApplicationConfig = {
  providers: [
    provideRouter(routes),
    provideAnimations(),
    provideCore({
      theme: 'light',
      i18n: {
        prefix: 'assets/i18n/', // no leading slash => works under subpaths
        suffix: '.json',
        fallbackLang: 'en',
        lang: 'en',
      },
      // Optionally add extra interceptors before error interceptor:
      // interceptors: [myExtraInterceptorFn],
      appVersion: pkg.version
    }),
    ...provideAppStore(),
  ],
};