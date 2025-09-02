import { Routes } from '@angular/router';
import { UserRole } from '@cadai/pxs-ng-core/enums';
import { authGuard, featureGuard } from '@cadai/pxs-ng-core/guards';
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
    canActivateChild: [authGuard],
    children: [
      {
        path: 'dashboard',
        canActivate: [featureGuard('dashboard', { forbid: '/403' })],
        data: { roles: [UserRole.ROLE_admin, UserRole.ROLE_user] },
        loadComponent: () =>
          import('./features/dashboard/dashboard.component').then(m => m.DashboardComponent),
      },
      {
        path: 'team',
        canActivate: [featureGuard('team', { forbid: '/403' })],
        data: { roles: [UserRole.ROLE_admin, UserRole.ROLE_user] },
        loadComponent: () =>
          import('./features/teams/teams.component').then(m => m.TeamsComponent),
      },
      { path: '403', loadComponent: () => import('@cadai/pxs-ng-core/shared').then(m => m.ForbiddenComponent) },
      { path: '**', loadComponent: () => import('@cadai/pxs-ng-core/shared').then(m => m.NotFoundComponent) },
    ]
  }
];