import { Routes } from '@angular/router';
import { AppLayoutComponent } from './shared/shared';
import { authGuard } from './core/auth/auth.guard';
export const routes: Routes = [
  {
    path: '',
    redirectTo: 'dashboard',
    pathMatch: 'full',
  },
  {
    path: '',
    component: AppLayoutComponent,
    children: [
      {
        path: 'dashboard',
        canActivate: [authGuard],
        loadComponent: () =>
          import('./features/dashboard/dashboard.component').then(m => m.DashboardComponent),
      },
      {
        path: 'team',
        canActivate: [authGuard],
        loadComponent: () =>
          import('./features/teams/teams.component').then(m => m.TeamsComponent),
      },
    ]
  }
];