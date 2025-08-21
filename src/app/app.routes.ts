import { Routes } from '@angular/router';
import { UserRole } from '@cadai/pxs-ng-core/enums';
import { authGuard } from '@cadai/pxs-ng-core/guards';
import { AppLayoutComponent } from '@cadai/pxs-ng-core/shared';

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
        data: { roles: [UserRole.ROLE_admin,UserRole.ROLE_user] }, // optional
        loadComponent: () =>
          import('./features/dashboard/dashboard.component').then(m => m.DashboardComponent),
      },
      {
        path: 'team',
        canActivate: [authGuard],
        data: { roles: [UserRole.ROLE_admin,UserRole.ROLE_user] }, // optional
        loadComponent: () =>
          import('./features/teams/teams.component').then(m => m.TeamsComponent),
      },
    ]
  }
];