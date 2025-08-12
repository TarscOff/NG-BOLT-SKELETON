import { ApplicationConfig } from '@angular/core';
import { provideRouter } from '@angular/router';
import { provideAnimations } from '@angular/platform-browser/animations';
import { provideHttpClient, withInterceptors } from '@angular/common/http';
import { routes } from './app.routes';
import { provideTranslateService } from '@ngx-translate/core';
import { provideTranslateHttpLoader } from '@ngx-translate/http-loader';
import { provideAppStore } from './store';
import { MatNativeDateModule } from '@angular/material/core';
import { APP_DATE_PROVIDERS } from './shared/date-formats';

import { authInterceptor } from './core/auth/auth.interceptor';
import { httpErrorInterceptor } from './core/services/http-error.interceptor';

export const appConfig: ApplicationConfig = {
  providers: [
    MatNativeDateModule,
    ...APP_DATE_PROVIDERS,

    provideRouter(routes),

    provideHttpClient(
      withInterceptors([
        // Order matters: auth first, errors last
        authInterceptor,
        httpErrorInterceptor,
      ])
    ),

    provideAnimations(),
    provideTranslateService({
      loader: provideTranslateHttpLoader({
        prefix: '/assets/i18n/',
        suffix: '.json'
      }),
      fallbackLang: 'en',
      lang: 'en'
    }),
    ...provideAppStore(),
  ]
};