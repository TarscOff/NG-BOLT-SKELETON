import { ApplicationConfig } from '@angular/core';
import { provideRouter } from '@angular/router';
import { routes } from './app.routes';
import { provideAppStore } from '@cadai/pxs-ng-core/store';

export const appConfig: ApplicationConfig = {
  providers: [
    provideRouter(routes),
    ...provideAppStore(),
  ],
};