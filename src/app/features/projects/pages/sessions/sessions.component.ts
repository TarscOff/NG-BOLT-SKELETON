import { Component, OnInit, inject, signal, computed, DestroyRef } from '@angular/core';
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
import { map } from 'rxjs';
import { MatCardModule } from '@angular/material/card';

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
export class SessionsComponent implements OnInit {
  private templating = inject(TemplatingService);
  private toast = inject(ToastService);
  private layoutService = inject(LayoutService);
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

        if(sessionId) this.sessionId.set(sessionId);
        if(projectId) this.projectId.set(projectId);

        this.layoutService.setTitle(sessionId ? `Session: ${sessionId}` : 'Sessions');

        return { sessionId, projectId };
      }),
      takeUntilDestroyed(this.destroyRef) // Automatic cleanup
    ).subscribe({
      next: ({ sessionId, projectId }) => {
        console.log('Route params loaded:', { sessionId, projectId });
      },
      error: (err) => {
        console.error('Error reading route params:', err);
      }
    });

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
        { label: 'Project ' + this.projectId(), route: '/genai-projects/'+this.projectId() },
        { label: 'Session ' + this.sessionId() }, // Current page, no route
    ]);
  }

  pageTitle = computed(() => this.pageConfig()?.pageTitle || 'AI Tools');
  pageDescription = computed(() => this.pageConfig()?.pageDescription);

  ngOnInit(): void {
    this.loadPageConfig();
  }

  /**
   * Load page configuration from API
   */
  loadPageConfig(pageId = 'default'): void {
    this.loading.set(true);
    this.error.set(null);

    this.templating.fetchTemplateConfig(pageId, !this.sessionId() || this.sessionId() === 'new').subscribe({
      next: (config) => {
        this.pageConfig.set(config);
        this.loading.set(false);
      },
      error: (err) => {
        console.error('Failed to load page config:', err);
        this.error.set('Failed to load page configuration');
        this.loading.set(false);
        this.toast.show(
          'Failed to load page configuration.',
          'Close',
          5000
        );
      },
    });
  }

  /**
   * Handle template error
   */
  onTemplateError(error: Error): void {
    console.error('Template error:', error);
    this.toast.show(`Error: ${error.message}`, 'Close', 5000);
  }

  /**
   * Track by function for templates
   */
  trackByTemplateId(index: number, template: TemplateConfig): string {
    return template.type;
  }

  public onTitleChange(title: string): void {
    this.layoutService.setTitle(title);
  }
}