import { Routes } from '@angular/router';
import { AppLayoutComponent } from './shared/shared';
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
        loadComponent: () =>
          import('./features/dashboard/dashboard.component').then(m => m.DashboardComponent),
      },
      {
        path: 'team',
        loadComponent: () =>
          import('./features/teams/teams.component').then(m => m.TeamsComponent),
      },
    ]
  }
];