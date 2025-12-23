import { Component, OnInit, inject, signal, computed, DestroyRef, OnDestroy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { MatTabsModule } from '@angular/material/tabs';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatTooltipModule } from '@angular/material/tooltip';
import { TranslateModule, TranslateService } from '@ngx-translate/core';
import { LayoutService, ToastService, ToolbarActionsService } from '@cadai/pxs-ng-core/services';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';

import { TemplateLoaderComponent } from '@features/workflows/templates/components/loader/template-loader.component';
import { TemplatingService } from '@features/workflows/templates/services/templating.service';
import { TemplateConfig, TemplatePageResponse } from '@features/workflows/templates/utils/template-config.interface';
import { SeoComponent } from '@cadai/pxs-ng-core/shared';
import { ToolbarAction } from '@cadai/pxs-ng-core/interfaces';
import { ActivatedRoute, Router } from '@angular/router';
import { firstValueFrom, map } from 'rxjs';
import { MatCardModule } from '@angular/material/card';
import { ProjectsService } from '@features/projects/services/projects.service';
import { ProjectDto, ProjectSessionDto } from '@features/projects/interfaces/project.model';

@Component({
  selector: 'app-chat',
  standalone: true,
  imports: [
    CommonModule,
    MatTabsModule,
    MatButtonModule,
    MatIconModule,
    MatProgressSpinnerModule,
    MatTooltipModule,
    TranslateModule,
    TemplateLoaderComponent,
    SeoComponent,
    MatCardModule
  ],
  templateUrl: './sessions.component.html',
  styleUrls: ['./sessions.component.scss'],
})
export class SessionsComponent implements OnInit, OnDestroy {
  private templating = inject(TemplatingService);
  private toast = inject(ToastService);
  private layoutService = inject(LayoutService);
  private projectsService = inject(ProjectsService);
  private toolbarService = inject(ToolbarActionsService);
  private router = inject(Router);
  private translateService = inject(TranslateService)
  private destroyRef = inject(DestroyRef);
  private readonly route = inject(ActivatedRoute);

  // State
  pageConfig = signal<TemplatePageResponse | null>(null);
  loading = signal(true);
  error = signal<string | null>(null);
  selectedTabIndex = signal(0);
  projectId = signal<string | null>(null);
  sessionId = signal<string | null>(null);
  readonly project = signal<ProjectDto | null>(null);
  readonly session = signal<ProjectSessionDto | null>(null);

  // Computed
  enabledTemplates = computed(() => {
    const config = this.pageConfig();
    if (!config) return [];
    return config.templates;
  });

  constructor() {
    // Subscribe to route params with automatic cleanup
    this.route.paramMap.pipe(
      map(params => {
        const sessionId = params.get('sessionId');
        const projectId = params.get('id');

        if (sessionId) this.sessionId.set(sessionId);
        if (projectId) this.projectId.set(projectId);

        this.layoutService.setTitle(sessionId ? `Session: ${sessionId}` : 'Sessions');

        return { sessionId, projectId };
      }),
      takeUntilDestroyed(this.destroyRef) // Automatic cleanup
    ).subscribe({
      error: (err) => {
        console.error('Error reading route params:', err);
      }
    });
  }

  pageTitle = computed(() => this.pageConfig()?.pageTitle || 'AI Tools');
  pageDescription = computed(() => this.pageConfig()?.pageDescription);

  ngOnInit(): void {
    this.loadPageConfig();
  }


  ngOnDestroy(): void {
    this.layoutService.clearBreadcrumbs();
  }

  private async loadProjectDetails(projectId: string): Promise<void> {
    this.loading.set(true);
    this.error.set(null);

    try {
      // Load project data
      const projects = await firstValueFrom(this.projectsService.getProjectsList());
      const project = projects?.find((p) => p.project_id === projectId);

      if (!project) {
        this.error.set(
          this.translateService.instant('projects.error.not-found')
        );
        return;
      }

      this.project.set(project);

      this.loadSessionDetails(projectId);
    } catch (err) {
      this.error.set(
        this.translateService.instant('projects.error.failed-to-load')
      );
      this.toast.showError(
        this.translateService.instant('projects.error.failed-to-load'),
      );
      console.error('Failed to load project details:', err);
    } finally {
      this.loading.set(false);
    }
  }

  private async loadSessionDetails(projectId: string): Promise<void> {
    this.loading.set(true);
    this.error.set(null);

    try {
      // Load session data
      const session = await firstValueFrom(this.projectsService.getProjectsSessions(projectId));
      const current_session = session?.find((s) => s.session_id === this.sessionId());
      if (!session) {
        this.error.set(
          this.translateService.instant('projects.error.session-not-found')
        );
        return;
      }

      this.session.set(current_session || null);


      // Setup toolbar actions
      const back: ToolbarAction = {
        id: 'back',
        icon: 'arrow_back',
        tooltip: 'back',
        class: "accent",
        variant: "flat",
        label: this.translateService.instant("common.back"),
        click: () => this.router.navigate(['/genai-projects', this.projectId()]),
      };
      this.toolbarService.scope(this.destroyRef, [back]);

      // Breadcrumbs items
      this.layoutService.setBreadcrumbs([
        { label: this.translateService.instant("nav.genai-projects"), route: '/genai-projects' },
        { label: '' + this.project()?.name, route: '/genai-projects/' + this.projectId() },
        { label: '' + (this.session()?.session_name ? this.session()?.session_name : this.translateService.instant('new-session')) },
      ]);
    } catch (err) {
      this.error.set(
        this.translateService.instant('projects.error.failed-to-load-session')
      );
      this.toast.showError(
        this.translateService.instant('projects.error.failed-to-load-session'),
      );
      console.error('Failed to load session details:', err);
    } finally {
      this.loading.set(false);
    }
  }

  /**
   * Load page configuration from API
   */
  async loadPageConfig(): Promise<void> {
    this.loading.set(true);
    this.error.set(null);

    try {
      const templates = await this.templating.fetchTemplateConfig(this.projectId()!);
      templates.subscribe({
        next: (config) => {
          this.pageConfig.set(config);
          this.loading.set(false);

          this.loadProjectDetails(this.projectId()!);
        },
        error: () => {
          this.error.set(this.translateService.instant('projects.error.failed-to-load-templates'));
          this.loading.set(false);
          this.toast.showError(
            this.translateService.instant('projects.error.failed-to-load-templates'),
          );
        },
      });
    } catch (error) {
      this.error.set(this.translateService.instant('projects.error.failed-to-load-templates') +" "+ (error as Error).message);
      this.loading.set(false);
      this.toast.showError(
        this.translateService.instant('projects.error.failed-to-load-templates') +" "+ (error as Error).message,
      );
    }

  }

  /**
   * Handle template error
   */
  onTemplateError(error: Error): void {
    console.error('Template error:', error);
    this.toast.showError(`Error: ${error}`);
  }

  /**
   * Track by function for templates
   */
  trackByTemplateId(index: number, template: TemplateConfig): string {
    return template?.type || crypto.randomUUID();
  }

  public onTitleChange(title: string): void {
    this.layoutService.setTitle(title);
  }
}