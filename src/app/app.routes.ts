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
        path: 'genai-workflows',
        canActivate: [featureGuard('ai.workflows', { forbid: '/403' })],
        data: { roles: [UserRole.ROLE_admin, UserRole.ROLE_user] },
        loadComponent: () =>
          import('./features/workflows/workflows.component')
            .then(m => m.WorkflowsComponent)
      },
      {
        path: 'team',
        canActivate: [featureGuard('team', { forbid: '/403' })],
        data: { roles: [UserRole.ROLE_admin, UserRole.ROLE_user] },
        loadComponent: () =>
          import('./features/teams/teams.component').then(m => m.TeamsComponent),
      },
      {
        path: 'components',
        canActivate: [featureGuard('components', { forbid: '/403' })],
        data: { roles: [UserRole.ROLE_admin, UserRole.ROLE_user] },
        loadComponent: () =>
          import('./features/components/components.component').then(m => m.CustomComponentsComponent),
      },
      {
        path: 'genai-chat',
        canActivate: [featureGuard('ai.chat', { forbid: '/403' })],
        data: { roles: [UserRole.ROLE_admin, UserRole.ROLE_user] },
        loadComponent: () =>
          import('./features/chat/chat.component').then(m => m.ChatPageComponent),
      },
      {
        path: 'genai-projects',
        canActivate: [featureGuard('ai.projects', { forbid: '/403' })],
        data: { roles: [UserRole.ROLE_admin, UserRole.ROLE_user] },
        children: [
          {
            path: '',
            loadComponent: () =>
              import('./features/projects/pages/list/projects.component').then(m => m.ProjectsComponent),
          },
          {
            path: ':id/sessions/new',
            loadComponent: () =>
              import('./features/projects/pages/sessions/sessions.component').then(m => m.SessionsComponent),
          },
          {
            path: ':id',
            loadComponent: () =>
              import('./features/projects/pages/details/details.component').then(m => m.ProjectDetailsComponent),
          },
          {
            path: ':id/sessions/:sessionId',
            loadComponent: () =>
              import('./features/projects/pages/sessions/sessions.component').then(m => m.SessionsComponent),
          },
        ]
      },
      { path: '403', loadComponent: () => import('@cadai/pxs-ng-core/shared').then(m => m.ForbiddenComponent) },
      { path: '**', loadComponent: () => import('@cadai/pxs-ng-core/shared').then(m => m.NotFoundComponent) },
    ]
  }
];