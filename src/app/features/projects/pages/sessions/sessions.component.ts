import { Component, OnInit, inject, signal, computed, DestroyRef, OnDestroy, effect } from '@angular/core';
import { CommonModule } from '@angular/common';
import { MatTabsModule } from '@angular/material/tabs';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatTooltipModule } from '@angular/material/tooltip';
import { TranslateModule, TranslateService } from '@ngx-translate/core';
import { FieldConfigService, LayoutService, ToastService, ToolbarActionsService } from '@cadai/pxs-ng-core/services';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';

import { TemplateLoaderComponent } from '@features/workflows/templates/components/loader/template-loader.component';
import { TemplatingService } from '@features/workflows/templates/services/templating.service';
import { TemplateConfig, TemplatePageResponse } from '@features/workflows/templates/utils/template-config.interface';
import { DynamicFormComponent, SeoComponent } from '@cadai/pxs-ng-core/shared';
import { FieldConfig, ToolbarAction } from '@cadai/pxs-ng-core/interfaces';
import { ActivatedRoute, Router } from '@angular/router';
import { debounceTime, distinctUntilChanged, firstValueFrom, map, interval, finalize, switchMap, tap, catchError, of, takeWhile } from 'rxjs';
import { MatCardModule } from '@angular/material/card';
import { ProjectsService } from '@features/projects/services/projects.service';
import { ArtifactsDataDto, FileItem, ProjectDto, ProjectSessionDto, TaskDto, WorkflowStatusDto } from '@features/projects/interfaces/project.model';
import { MatSidenavModule } from '@angular/material/sidenav';
import { FormBuilder, FormGroup } from '@angular/forms';
import { MatChipsModule } from '@angular/material/chips';
import { MatMenuModule } from '@angular/material/menu';
import { DateTime } from 'luxon';
import { Store } from '@ngrx/store';
import { AppSelectors } from '@cadai/pxs-ng-core/store';
import { MatDividerModule } from '@angular/material/divider';

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
    MatCardModule,
    MatSidenavModule,
    DynamicFormComponent,
    MatChipsModule,
    MatMenuModule,
    MatDividerModule
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
  private readonly fields = inject(FieldConfigService);
  private readonly fb = inject(FormBuilder);
  private readonly store = inject(Store);
  configInputs: FieldConfig[] = [];
  formInputs: FormGroup = this.fb.group({});

  // State
  pageConfig = signal<TemplatePageResponse | null>(null);
  loading = signal(true);
  error = signal<string | null>(null);
  selectedTabIndex = signal(0);
  projectId = signal<string | null>(null);
  sessionId = signal<string | null>(null);
  readonly project = signal<ProjectDto | null>(null);
  readonly session = signal<ProjectSessionDto | null>(null);
  artifactsPanelOpen = signal(false);
  readonly files = signal<FileItem[]>([]);
  private readonly _workflowStatus = signal<WorkflowStatusDto | null>(null);
  private readonly _isPolling = signal<boolean>(false);
  private readonly _hasRunningWorkflows = signal<boolean>(false);
  private taskStatesMap = new Map<string, string>();
  private completedTasksTimestamps = new Map<string, number>();
  private readonly TASK_REMOVAL_DELAY = 2000;

  // User role from store
  readonly isAdmin$ = this.store
    .select(AppSelectors.UserSelectors.selectUserRole)
    .pipe(map(roles => roles?.includes('ROLE_admin') ?? false));
  canSubmitArtifacts = signal(false);


  // Computed
  enabledTemplates = computed(() => {
    const config = this.pageConfig();
    if (!config) return [];
    return config.templates;
  });
  readonly filesCount = computed(() => this.files().length);

  workflowStatus$ = computed(() => this._workflowStatus());
  isPolling$ = computed(() => this._isPolling());
  showWorkflowStatus$ = computed(() => this._isPolling() || this._hasRunningWorkflows());

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

    // File input configuration
    this.configInputs = [
      this.fields.getFileField({
        name: 'files',
        label: 'form.labels.files',
        multiple: true,
        accept: 'image/*,.pdf,.doc,.docx,.ppt,.pptx,.txt,.xls,.xlsx',
        required: false,
        fileVariant: 'dropzone',
        validators: undefined,
      })
    ];

    // Subscribe to form changes to enable/disable submit button
    effect(() => {
      this.formInputs.valueChanges
        .pipe(
          debounceTime(150),
          distinctUntilChanged(),
          takeUntilDestroyed(this.destroyRef)
        )
        .subscribe(values => {
          const files = values?.files || [];
          const hasFiles = Array.isArray(files) && files.length > 0;
          const isValid = this.formInputs.valid;

          this.canSubmitArtifacts.set(hasFiles && isValid);
        });
    });
  }

  pageTitle = computed(() => this.pageConfig()?.pageTitle || 'AI Tools');
  pageDescription = computed(() => this.pageConfig()?.pageDescription);

  ngOnInit(): void {
    this.loadPageConfig();
    this.checkForRunningWorkflows();
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

      if (this.sessionId()) {
        this.loadSessionArtifacts();
      }
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

  private async loadSessionArtifacts(): Promise<void> {
    this.loading.set(true);
    this.error.set(null);

    try {
      // Load artifacts data
      const projects = await firstValueFrom(this.projectsService.getSessionArtifacts(this.sessionId()!));
      this.files.set(this.mapToFiles(projects));

      // Setup toolbar actions
      const back: ToolbarAction = {
        id: 'back',
        icon: 'arrow_back',
        tooltip: 'back',
        class: "error",
        variant: "flat",
        label: this.translateService.instant("common.back"),
        click: () => this.router.navigate(['/genai-projects', this.projectId()]),
      };
      const artifactsBtn: ToolbarAction = {
        id: 'artifacts',
        icon: 'folder',
        tooltip: 'artifacts',
        class: "primary",
        variant: "flat",
        label: this.translateService.instant("workflow.runPanel.artifacts") + ` (${this.filesCount()})`,
        click: () => this.toggleArtifactsPanel(),
      };
      this.toolbarService.scope(this.destroyRef, [back, artifactsBtn]);

      // Breadcrumbs items
      this.layoutService.setBreadcrumbs([
        { label: this.translateService.instant("nav.genai-projects"), route: '/genai-projects' },
        { label: '' + this.project()?.name, route: '/genai-projects/' + this.projectId() },
        { label: '' + (this.session()?.session_name ? this.session()?.session_name : this.session()?.session_id || this.translateService.instant('new-session')) },
      ]);

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

  mapToFiles(artifacts: ArtifactsDataDto[]): FileItem[] {
    if (!artifacts) { return []; }
    return artifacts.map((e) => ({
      id: e.artifact_id,
      name: e.artifact_name || e.artifact_id || 'Untitled File',
      size: e.artifact_size,
      type: e.artifact_type,
      uploadedAt: DateTime.fromJSDate(new Date(e.created_on)),
    }));
  }

  toggleArtifactsPanel(): void {
    this.artifactsPanelOpen.set(!this.artifactsPanelOpen());
  }

  closeArtifactsPanel(): void {
    this.artifactsPanelOpen.set(false);
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
      this.error.set(this.translateService.instant('projects.error.failed-to-load-templates') + " " + (error as Error).message);
      this.loading.set(false);
      this.toast.showError(
        this.translateService.instant('projects.error.failed-to-load-templates') + " " + (error as Error).message,
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

  prettySize(bytes: number): string {
    if (bytes < 1024) return `${bytes} B`;
    const kb = bytes / 1024;
    if (kb < 1024) return `${kb.toFixed(1)} KB`;
    const mb = kb / 1024;
    return `${mb.toFixed(1)} MB`;
  }

  fileIcon(name: string, type?: string): string {
    const ext = name.split('.')[1]?.toLowerCase() ?? type;
    if (ext === 'pdf') return 'picture_as_pdf';
    if (ext === 'json' || ext === 'application/json') return 'code';
    if (
      ['png', 'jpg', 'jpeg', 'gif', 'webp', 'svg', 'image'].includes(ext ?? '')
    )
      return 'image';
    if (['csv', 'xls', 'xlsx'].includes(ext ?? '')) return 'table_chart';
    if (['ppt', 'pptx', 'key'].includes(ext ?? '')) return 'slideshow';
    if (['doc', 'docx', 'rtf', 'odt', 'txt', 'md'].includes(ext ?? ''))
      return 'description';
    if (['zip', 'rar', '7z', 'tar', 'gz', 'collection_metadata'].includes(ext ?? ''))
      return 'folder_zip';
    return 'attach_file';
  }

  submitArtifacts(): void {
    if (!this.canSubmitArtifacts()) {
      return;
    }

    const filesControl = this.formInputs.get('files');
    const files: File[] = filesControl?.value || [];

    if (files.length === 0) {
      this.toast.showError(
        this.translateService.instant('projects.error.no-files-selected')
      );
      return;
    }

    if (!this.sessionId()) {
      this.toast.showError(
        this.translateService.instant('projects.error.session-not-found')
      );
      return;
    }

    this.projectsService.submitArtifacts(
      this.sessionId()!,
      this.pageConfig()?.templates[0]?.fileTemplateId || '',
      files
    ).subscribe({
      next: (response) => {
        this.toast.show(
          this.translateService.instant('projects.success.artifacts-uploaded')
        );
        this.formInputs.reset();
        this.canSubmitArtifacts.set(false);

        // Start polling workflow status if workflow_instance_id is returned
        if (response.workflow_instance_id) {
          this.startPollingWorkflowStatus(response.workflow_instance_id);
        }
      },
      error: (error) => {
        console.error('Error uploading artifacts:', error);
        this.toast.showError(
          this.translateService.instant('projects.error.failed-to-upload-artifacts')
        );
      }
    });
  }

  private checkForRunningWorkflows(): void {
    if (!this.sessionId()) {
      return;
    }

    this.projectsService.getSessionStatusById(this.sessionId()!)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: sessionStatus => {
          const runningWorkflows = sessionStatus.workflow_executions.filter(
            wf => wf.workflow_status === 'running' || wf.workflow_status === 'pending'
          );

          if (runningWorkflows.length > 0) {
            console.log(`Found ${runningWorkflows.length} running workflows on load`);
            this._hasRunningWorkflows.set(true);

            const mostRecentWorkflow = runningWorkflows.sort((a, b) => {
              const dateA = typeof a.created_on === 'string'
                ? new Date(a.created_on).getTime()
                : a.created_on.toMillis();
              const dateB = typeof b.created_on === 'string'
                ? new Date(b.created_on).getTime()
                : b.created_on.toMillis();
              return dateB - dateA;
            })[0];

            this.startPollingWorkflowStatus(mostRecentWorkflow.workflow_instance_id);
          } else {
            this._hasRunningWorkflows.set(false);
            this._workflowStatus.set(null);
          }
        },
        error: err => {
          console.error('Error checking for running workflows:', err);
          this._hasRunningWorkflows.set(false);
          this._workflowStatus.set(null);
        }
      });
  }

  private startPollingWorkflowStatus(workflowInstanceId: string): void {
    const maxNotFoundRetries = 5;
    let notFoundCount = 0;

    this._isPolling.set(true);

    interval(2000)
      .pipe(
        switchMap(() => {
          return this.projectsService.getSessionStatusById(this.sessionId()!).pipe(
            map(sessionStatus => {
              if (sessionStatus.status === 'completed' || sessionStatus.status === 'failed') {

                return {
                  workflow_status: sessionStatus.status,
                  workflow_instance_id: workflowInstanceId,
                  workflow_name: 'Session completed',
                  tasks: [],
                  created_on: DateTime.now(),
                  updated_on: DateTime.now(),
                  completed_on: DateTime.now()
                } as WorkflowStatusDto;

              }

              const workflowExecution = sessionStatus.workflow_executions.find(
                wf => wf.workflow_instance_id === workflowInstanceId
              );

              if (!workflowExecution) {
                throw { status: 404, message: 'Workflow execution not found in session' };
              }

              const allRunningWorkflows = sessionStatus.workflow_executions.filter(
                wf => wf.workflow_status === 'running' || wf.workflow_status === 'pending'
              );

              const allActiveTasks = allRunningWorkflows
                .flatMap(wf => wf.tasks?.map(task => ({
                  ...task,
                  workflow_name: wf.workflow_name,
                  workflow_id: wf.workflow_instance_id
                })) || [])
                .sort((a, b) => {
                  const dateA = typeof a.created_on === 'string'
                    ? new Date(a.created_on).getTime()
                    : a.created_on.toMillis();
                  const dateB = typeof b.created_on === 'string'
                    ? new Date(b.created_on).getTime()
                    : b.created_on.toMillis();
                  return dateA - dateB;
                });

              const now = Date.now();
              allActiveTasks.forEach(task => {
                if (task.task_status === 'completed' && !this.completedTasksTimestamps.has(task.task_id)) {
                  this.completedTasksTimestamps.set(task.task_id, now);
                }
              });

              const visibleTasks = allActiveTasks.filter(task => {
                const completedTime = this.completedTasksTimestamps.get(task.task_id);
                if (completedTime) {
                  const timeSinceCompletion = now - completedTime;
                  return timeSinceCompletion < this.TASK_REMOVAL_DELAY;
                }
                return true;
              });

              return {
                workflow_status: sessionStatus.status === 'running' ? 'running' : sessionStatus.status,
                workflow_instance_id: workflowInstanceId,
                workflow_name: workflowExecution.workflow_name,
                tasks: visibleTasks,
                created_on: workflowExecution.created_on,
                updated_on: workflowExecution.updated_on,
                completed_on: workflowExecution.completed_on
              } as WorkflowStatusDto;
            }),
            tap(() => { notFoundCount = 0; }),
            catchError(err => {
              const is404 = err?.status === 404 ||
                err?.message?.includes('Workflow execution not found');

              if (is404) {
                notFoundCount++;
                if (notFoundCount >= maxNotFoundRetries) {
                  return of({
                    workflow_status: 'failed',
                    workflow_instance_id: workflowInstanceId,
                    workflow_name: 'Workflow not found',
                    tasks: [],
                    created_on: DateTime.now(),
                    updated_on: DateTime.now(),
                    completed_on: DateTime.now()
                  } as WorkflowStatusDto);
                }
              }

              return of({
                workflow_status: 'pending',
                workflow_instance_id: workflowInstanceId,
                workflow_name: 'Initializing workflow...',
                tasks: [],
                created_on: DateTime.now(),
                updated_on: DateTime.now(),
                completed_on: DateTime.now()
              } as WorkflowStatusDto);
            })
          );
        }),
        tap(status => {
          status.tasks?.forEach(task => {
            const previousState = this.taskStatesMap.get(task.task_id);
            if (previousState !== task.task_status) {
              this.taskStatesMap.set(task.task_id, task.task_status);
            }
          });

          this._workflowStatus.set(status);
          this._hasRunningWorkflows.set(
            status.workflow_status === 'running' || status.workflow_status === 'pending'
          );
        }),
        takeWhile(status => {
          return status.workflow_status === 'pending' || status.workflow_status === 'running';
        }, true),
        takeUntilDestroyed(this.destroyRef),
        finalize(() => {
          this._isPolling.set(false);
          this._hasRunningWorkflows.set(false);
          this.taskStatesMap.clear();
          this.completedTasksTimestamps.clear();
          this.closeArtifactsPanel();

          setTimeout(() => {
            this._workflowStatus.set(null);
            this.loadSessionArtifacts();
          }, 1000);
        })
      )
      .subscribe({
        next: status => {
          if (status.workflow_status === 'failed') {
            this.toast.showError(
              this.translateService.instant('projects.error.workflow-failed')
            );
          }
        },
        error: err => {
          console.error('Polling error:', err);
          this._isPolling.set(false);
          this._hasRunningWorkflows.set(false);
          this._workflowStatus.set(null);
          this.loading.set(false);
        }
      });
  }

  // Trackers
  trackFile = (_: number, f: FileItem) => f.id;
  trackByTaskId = (_: number, task: TaskDto) => task.task_id;

}