import { ApplicationConfig, isDevMode } from '@angular/core';
import { provideRouter } from '@angular/router';
import { routes } from './app.routes';
import { provideAppStore } from '@cadai/pxs-ng-core/store';
import { provideCharts } from '@cadai/pxs-ng-core/providers';
import { provideStoreDevtools } from '@ngrx/store-devtools';
import { MatPaginatorIntl } from '@angular/material/paginator';
import { CustomPaginatorIntl } from '@shared/services/paginator.service';

export const appConfig: ApplicationConfig = {
  providers: [
    provideRouter(routes),
    ...provideAppStore(),
    ...provideCharts({
      defaults: {
        responsive: true,
        maintainAspectRatio: false,
        animation: { duration: 300 },
        interaction: { intersect: false, mode: 'index' }, // ✅ v4
        plugins: { legend: { position: 'bottom', labels: { usePointStyle: true } }, tooltip: { enabled: true } },
        scales: { x: { grid: { display: false } }, y: { ticks: { precision: 0 } } }
      },
      plugins: [],
    }),
    { provide: MatPaginatorIntl, useClass: CustomPaginatorIntl }
    ,
    isDevMode()
      ? provideStoreDevtools({
        name: 'PSX-NG Store',
        maxAge: 50,          // time-travel depth
        trace: true,         // stack traces on actions (toggle in DevTools)
        logOnly: false,      // set true if you must restrict in prod
        // Optional: shrink noisy payloads
        actionSanitizer: (a) =>
          a.type?.startsWith('@ngrx/router-store') ? { ...a, payload: '[router]' } : a,
        stateSanitizer: (s) => s, // or strip huge slices for perf
      })
      : [],
  ],
};