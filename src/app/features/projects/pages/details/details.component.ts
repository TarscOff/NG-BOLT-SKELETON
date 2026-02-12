import {
    ChangeDetectionStrategy,
    Component,
    computed,
    DestroyRef,
    inject,
    OnDestroy,
    OnInit,
    signal,
} from '@angular/core';
import { takeUntilDestroyed, toObservable, toSignal } from '@angular/core/rxjs-interop';
import { CommonModule } from '@angular/common';
import { ActivatedRoute, Router } from '@angular/router';
import { TranslateModule, TranslateService } from '@ngx-translate/core';
import { MatCardModule } from '@angular/material/card';
import { MatTabsModule } from '@angular/material/tabs';
import { MatListModule } from '@angular/material/list';
import { MatIconModule } from '@angular/material/icon';
import { MatButtonModule } from '@angular/material/button';
import { MatTooltipModule } from '@angular/material/tooltip';
import { MatMenuModule } from '@angular/material/menu';
import { MatPaginatorModule } from '@angular/material/paginator';
import { MatChipsModule } from '@angular/material/chips';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatDividerModule } from '@angular/material/divider';
import { MatProgressBarModule } from '@angular/material/progress-bar';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatSlideToggleModule } from '@angular/material/slide-toggle';
import { ProjectsService } from '../../services/projects.service';
import { FileItem, HistoryItem, Member, ArtifactsDataDto, ProjectDto, ProjectSessionDto, ProjectTemplateAssignment } from '../../interfaces/project.model';
import { ConfirmDialogComponent, SeoComponent } from '@cadai/pxs-ng-core/shared';
import { KeycloakService, LayoutService, ToastService, ToolbarActionsService } from '@cadai/pxs-ng-core/services';
import { UserRole } from '@cadai/pxs-ng-core/enums';
import { ConfirmDialogData, ToolbarAction } from '@cadai/pxs-ng-core/interfaces';
import { firstValueFrom } from 'rxjs';
import { MatDialog } from '@angular/material/dialog';
import { DateTime } from 'luxon';
import { MatExpansionModule } from '@angular/material/expansion';
import { FavoritesFacade } from '@shared/services/favorites.facade';
import { FavoriteType } from '@store/interfaces/favorites.model';
import { ProjectWorkflowsStore } from '../../data/project-workflows.store';
import { TemplateWorkflowsStore } from '@features/workflows/templates/data/template-workflows.store';
import { WorkflowsStore } from '@features/workflows/data/workflows.store';
import { ProjectTemplateCanvasComponent } from '../../components/project-template-canvas/project-template-canvas.component';
import { TemplateExecutionPanelComponent, TemplateExecutionConfig } from '../../components/template-execution-panel/template-execution-panel.component';
import { TemplateWorkflow } from '@features/workflows/templates/interfaces/template-workflow.interface';

@Component({
    selector: 'app-project-details',
    standalone: true,
    templateUrl: './details.component.html',
    styleUrls: ['./details.component.scss'],
    imports: [
        CommonModule,
        TranslateModule,
        MatCardModule,
        MatTabsModule,
        MatListModule,
        MatIconModule,
        MatButtonModule,
        MatTooltipModule,
        MatMenuModule,
        MatPaginatorModule,
        MatChipsModule,
        MatFormFieldModule,
        MatInputModule,
        MatDividerModule,
        MatProgressBarModule,
        MatProgressSpinnerModule,
        MatSlideToggleModule,
        SeoComponent,
        MatChipsModule,
        MatExpansionModule,
        TemplateExecutionPanelComponent,
        ProjectTemplateCanvasComponent,
    ],
    providers: [WorkflowsStore], // Only WorkflowsStore needs to be provided (others are providedIn: 'root')
    changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ProjectDetailsComponent implements OnInit, OnDestroy {
    private readonly route = inject(ActivatedRoute);
    private readonly router = inject(Router);
    private readonly projectsService = inject(ProjectsService);
    private readonly translateService = inject(TranslateService);
    private readonly layoutService = inject(LayoutService);
    private readonly toolbarService = inject(ToolbarActionsService);
    private readonly destroyRef = inject(DestroyRef);
    private readonly toast = inject(ToastService);
    private readonly favoritesFacade = inject(FavoritesFacade);
    private readonly projectWorkflowsStore = inject(ProjectWorkflowsStore);
    private readonly templateWorkflowsStore = inject(TemplateWorkflowsStore);
    private readonly keycloak = inject(KeycloakService);
    private dialog = inject(MatDialog);

    // State
    readonly loading = signal(false);
    readonly error = signal<string | null>(null);
    readonly project = signal<ProjectDto | null>(null);

    // Current project ID for store operations
    private readonly currentProjectId = computed(() => this.project()?.project_id ?? '');

    // Computed URL for favorites
    private readonly currentUrl = computed(() => {
        const projectId = this.project()?.project_id;
        return projectId ? `/genai-projects/${projectId}` : null;
    });

    // Admin signal for template
    readonly isAdmin = signal(false);

    // ======== TEMPLATE WORKFLOWS (Tier 3) ========
    
    // Template assignments from store (reactive)
    private readonly templateAssignmentsFromStore = signal<ProjectTemplateAssignment[]>([]);
    private readonly templatesByIdFromStore = signal<Map<string, TemplateWorkflow>>(new Map());
    private readonly templateSessionCounts = signal<Record<string, number>>({});
    private readonly templateSessionCountSubscriptions = new Set<string>();
    readonly templateAssignments = this.templateAssignmentsFromStore.asReadonly();
    readonly templateAssignmentsCount = computed(() => this.templateAssignments().length);
    readonly enabledTemplateAssignments = computed(() =>
        this.templateAssignments().filter(t => t.enabled)
    );
    
    // Enabled templates count (for the Run Templates tab)
    readonly enabledTemplatesCount = computed(() =>
        this.templateAssignments().filter(t => t.enabled).length
    );

    // Files
    readonly files = signal<FileItem[]>([]);
    readonly filesCount = computed(() => this.files().length);

    // Sessiions History
    readonly sessionsHistory = signal<HistoryItem[]>([]);
    readonly sessionsCount = computed(() => this.sessionsHistory().length);

    readonly groupedSessions = computed(() => {
        const sessions = this.sessionsHistory();
        const now = DateTime.now();
        const today = now.startOf('day');
        const yesterday = today.minus({ days: 1 });
        const weekAgo = today.minus({ days: 7 });

        const groups = {
            today: [] as typeof sessions,
            yesterday: [] as typeof sessions,
            pastWeek: [] as typeof sessions,
            older: [] as typeof sessions
        };

        sessions.forEach(session => {
            const sessionDate = session.createdAt.startOf('day');

            if (sessionDate >= today) {
                groups.today.push(session);
            } else if (sessionDate >= yesterday) {
                groups.yesterday.push(session);
            } else if (sessionDate >= weekAgo) {
                groups.pastWeek.push(session);
            } else {
                groups.older.push(session);
            }
        });

        return groups;
    });

    readonly expandedGroups = signal({
        today: true,
        yesterday: true,
        pastWeek: false,
        older: false
    });

    readonly editingSessionId = signal<string | null>(null);
    readonly originalTitle = signal<string | null>(null);

    toggleGroup(group: 'today' | 'yesterday' | 'pastWeek' | 'older') {
        this.expandedGroups.update(state => ({
            ...state,
            [group]: !state[group]
        }));
    }
    private readonly loading$ = toObservable(this.loading);
    private readonly favoriteSessionUrls = toSignal(
        this.favoritesFacade.favorites$,
        { initialValue: [] }
    );

    /* 
        // Chat History
    readonly chatHistory = signal<HistoryItem[]>([]);
    readonly chatCount = computed(() => this.chatHistory().length);

        // Compare History
        readonly compareHistory = signal<HistoryItem[]>([]);
        readonly compareCount = computed(() => this.compareHistory().length);
    
        // Summarize History
        readonly summarizeHistory = signal<HistoryItem[]>([]);
        readonly summarizeCount = computed(() => this.summarizeHistory().length);
    
        // Extract History
        readonly extractHistory = signal<HistoryItem[]>([]);
        readonly extractCount = computed(() => this.extractHistory().length);
    
        // Workflows (admin-only)
        readonly workflows = signal<WorkflowItem[]>([]);
        readonly wfPageIndex = signal(0);
        readonly wfPageSize = signal(8);
        readonly wfPageSizeOptions = [8, 16, 24];
        readonly wfLength = computed(() => this.workflows().length);
        readonly wfStart = computed(() => this.wfPageIndex() * this.wfPageSize());
        readonly wfEnd = computed(() => this.wfStart() + this.wfPageSize());
        readonly pagedWorkflows = computed(() =>
            this.workflows().slice(this.wfStart(), this.wfEnd())
        );
    
        // Members (admin-only)
        readonly members = signal<Member[]>([]);
        readonly inviteEmail = signal('');
        readonly ownersCount = computed(
            () => this.members().filter((m) => m.role === 'owner').length
        );
        readonly membersCount = computed(
            () => this.members().filter((m) => m.role === 'member').length
        );
     */

    constructor() {
        this.setupToolbarActions();
        this.initAdminStatus();
    }

    private initAdminStatus(): void {
        const { roles } = this.keycloak.getUserCtx();
        this.isAdmin.set(roles.includes(UserRole.ROLE_admin));
    }

    ngOnInit(): void {
        const projectId = this.route.snapshot.paramMap.get('id');
        if (!projectId) {
            this.router.navigate(['/projects']);
            return;
        }
        this.subscribeToTemplates();
        this.loadProjectDetails(projectId);
    }

    private async loadProjectDetails(projectId: string): Promise<void> {
        this.loading.set(true);
        this.error.set(null);

        try {
            const projects = await firstValueFrom(this.projectsService.getProjectsList());
            const project = projects?.find((p) => p.project_id === projectId);

            if (!project) {
                this.error.set(
                    this.translateService.instant('projects.error.not-found')
                );
                return;
            }

            this.project.set(project);

            // Subscribe to template assignments from the store (Tier 3 templates)
            this.subscribeToTemplateAssignments(projectId);

            // Update toolbar with favorites after project is loaded
            this.updateToolbarWithFavorites();

            // Breadcrumbs
            this.layoutService.setBreadcrumbs([
                { label: this.translateService.instant("nav.genai-projects"), route: '/genai-projects' },
                { label: project.name || "" },
            ]);

            this.loadProjectArtifacts(projectId);
            this.loadProjectSessions(projectId);
        } catch (err) {
            this.error.set(
                this.translateService.instant('projects.error.failed-to-load')
            );
            this.toast.showError(
                this.translateService.instant('projects.error.failed-to-load')
            );
            console.error('Failed to load project details:', err);
        } finally {
            this.loading.set(false);
        }
    }


    private updateToolbarWithFavorites(): void {
        const url = this.currentUrl();
        if (!url) return;

        const back: ToolbarAction = {
            id: 'back',
            icon: 'arrow_back',
            tooltip: this.translateService.instant("common.back"),
            class: "error",
            variant: "flat",
            label: this.translateService.instant("common.back"),
            click: () => this.router.navigate(['/genai-projects']),
        };

        const newSession: ToolbarAction = {
            id: 'new-session',
            icon: 'add',
            tooltip: this.translateService.instant("new-session"),
            class: "primary",
            variant: "flat",
            label: this.translateService.instant("new-session"),
            disabled$: this.loading$, // Use the pre-created observable
            click: async () => {
                const projectId = this.project()?.project_id;
                if (projectId) {
                    this.loading.set(true);
                    try {
                        const createdSession = await firstValueFrom(
                            this.projectsService.createProjectsSessions(projectId)
                        );
                        if (createdSession?.session_id) {
                            this.router.navigate([
                                '/genai-projects',
                                projectId,
                                'sessions',
                                createdSession.session_id
                            ]);
                        }
                    } catch (error) {
                        this.error.set(
                            this.translateService.instant('projects.error.failed-to-create-session')
                        );
                        this.toast.showError(
                            this.translateService.instant('projects.error.failed-to-create-session') +
                            (error instanceof Error ? `: ${error.message}` : '')
                        );
                    } finally {
                        this.loading.set(false);
                    }
                }
            },
        };

        this.favoritesFacade.loadFavorites();

        this.favoritesFacade.isFavorite(url).pipe(
            takeUntilDestroyed(this.destroyRef)
        ).subscribe(isFavorited => {
            const favoriteAction: ToolbarAction = isFavorited
                ? {
                    id: 'unfavorite',
                    icon: 'favorite',
                    tooltip: 'remove_favorite',
                    class: "error",
                    variant: "icon",
                    label: this.translateService.instant("remove_favorite"),
                    click: () => this.handleRemoveFavorite(),
                }
                : {
                    id: 'favorite',
                    icon: 'favorite_border',
                    tooltip: 'add_favorite',
                    class: "primary",
                    variant: "icon",
                    label: this.translateService.instant("add_favorite"),
                    click: () => this.handleAddFavorite(),
                };

            this.toolbarService.scope(this.destroyRef, [back, newSession, favoriteAction]);
        });
    }

    private setupToolbarActions(): void {
        const back: ToolbarAction = {
            id: 'back',
            icon: 'arrow_back',
            tooltip: this.translateService.instant("common.back"),
            class: "error",
            variant: "flat",
            label: this.translateService.instant("common.back"),
            click: () => this.router.navigate(['/genai-projects']),
        };

        const newSession: ToolbarAction = {
            id: 'new-session',
            icon: 'add',
            tooltip: this.translateService.instant("new-session"),
            class: "primary",
            variant: "flat",
            label: this.translateService.instant("new-session"),
            disabled$: this.loading$, // Use the pre-created observable
            click: async () => {
                const projectId = this.project()?.project_id;
                if (projectId) {
                    this.loading.set(true);
                    try {
                        const createdSession = await firstValueFrom(
                            this.projectsService.createProjectsSessions(projectId)
                        );
                        if (createdSession?.session_id) {
                            this.router.navigate([
                                '/genai-projects',
                                projectId,
                                'sessions',
                                createdSession.session_id
                            ]);
                        }
                    } catch (error) {
                        this.error.set(
                            this.translateService.instant('projects.error.failed-to-create-session')
                        );
                        this.toast.showError(
                            this.translateService.instant('projects.error.failed-to-create-session') +
                            (error instanceof Error ? `: ${error.message}` : '')
                        );
                    } finally {
                        this.loading.set(false);
                    }
                }
            },
        };

        // Initial toolbar setup
        this.toolbarService.scope(this.destroyRef, [back, newSession]);
    }

    private handleAddFavorite(): void {
        const url = this.currentUrl();
        const project = this.project();

        if (!url || !project) return;

        const title = project.name || project.project_id || this.translateService.instant('projects.untitled');

        this.favoritesFacade.addFavorite(url, title, FavoriteType.PROJECT);

        setTimeout(() => this.updateToolbarWithFavorites(), 100);
    }

    private handleRemoveFavorite(): void {
        const url = this.currentUrl();
        if (!url) return;

        firstValueFrom(this.favoritesFacade.favorites$).then(allFavorites => {
            const matchingFavorite = allFavorites.find(fav => fav.url === url);
            if (matchingFavorite) {
                this.favoritesFacade.removeFavorite(matchingFavorite.id);
                setTimeout(() => this.updateToolbarWithFavorites(), 100);
            }
        });
    }


    ngOnDestroy(): void {
        this.layoutService.clearBreadcrumbs();
    }

    private async loadProjectSessions(projectId: string): Promise<void> {
        this.loading.set(true);
        this.error.set(null);

        try {
            // Load sessions data
            const sessions = await firstValueFrom(this.projectsService.getProjectsSessions(projectId));
            this.sessionsHistory.set(this.mapToHistoryItems(sessions, this.project()!));

        } catch (error) {
            this.error.set(
                this.translateService.instant('projects.error.failed-to-load')
            );
            this.toast.showError(
                this.translateService.instant('projects.error.failed-to-load') + " " + (error instanceof Error ? `: ${error.message}` : ''),
            );
        } finally {
            this.loading.set(false);
        }
    }

    private async loadProjectArtifacts(projectId: string): Promise<void> {
        this.loading.set(true);
        this.error.set(null);

        try {
            // Load artifacts data
            const files = await firstValueFrom(this.projectsService.getProjectsFilesData(projectId));

            this.files.set(this.mapToFiles(files));

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
            extraInfo: e
        }));
    }

    mapToHistoryItems(sessions: ProjectSessionDto[], project: ProjectDto): HistoryItem[] {
        if (!sessions) { return []; }
        return sessions.map((s) => ({
            id: s.session_id,
            title: s.session_name || s.session_id || 'Untitled Session',
            createdAt: DateTime.fromJSDate(new Date(s.created_on)),
            updatedAt: DateTime.fromJSDate(new Date(s.updated_on)),
            projectId: project.project_id,
            meta: { ...s },
        })).sort(
            (a, b) => b.updatedAt.toMillis() - a.updatedAt.toMillis()
        );
    }

    // File operations
    addFiles(input: HTMLInputElement): void {
        const list = input.files;
        if (!list || list.length === 0) return;

        const newFiles: FileItem[] = Array.from(list).map((f, idx) => ({
            id: `tmp-${DateTime.now().toMillis()}-${idx}`,
            name: f.name,
            size: f.size,
            type: f.type,
            uploadedAt: DateTime.now(),
        }));

        this.files.update((arr) => [...newFiles, ...arr]);
        input.value = '';
    }

    removeFile(file: FileItem): void {
        this.files.update((arr) => arr.filter((x) => x.id !== file.id));
    }

    downloadFile(file: FileItem): void {
        console.log('Download file:', file.id);
    }

    prettySize(bytes: number): string {
        if (bytes < 1024) return `${bytes} B`;
        const kb = bytes / 1024;
        if (kb < 1024) return `${kb.toFixed(1)} KB`;
        const mb = kb / 1024;
        return `${mb.toFixed(1)} MB`;
    }

    fileIcon(type?: string): string {
        const ext = type;
        if (ext === 'pdf' || ext === 'application/pdf') return 'picture_as_pdf';
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
        if (['mp4', 'avi', 'mov', 'wmv', 'mkv', 'video'].includes(ext ?? ''))
            return 'movie';
        if (['mp3', 'wav', 'flac', 'aac', 'audio'].includes(ext ?? '')) return 'audiotrack';
        if (['rar', 'zip', '7z', 'tar', 'gz', 'bz2', 'xz', 'tar.gz', 'tgz', 'tar.bz2'].includes(ext ?? ''))
            return 'folder_zip';
        if (['xml', 'html', 'htm', 'css', 'js', 'ts', 'jsx', 'tsx', 'vue', 'php', 'py', 'java', 'cpp', 'c', 'h'].includes(ext ?? ''))
            return 'code';
        if (['exe', 'msi', 'dmg', 'pkg', 'deb', 'rpm', 'appimage'].includes(ext ?? ''))
            return 'launch';
        if (['ttf', 'otf', 'woff', 'woff2', 'eot'].includes(ext ?? ''))
            return 'font_download';

        return 'attach_file';
    }

    // History operations
    viewItem(
        kind: 'chat' | 'summary' | 'extract' | 'compare' | 'session',
        item: HistoryItem
    ): void {
        this.router.navigate(['/genai-projects', this.project()?.project_id, "sessions", item.id]);
    }

    editItem(
        kind: 'chat' | 'summary' | 'extract' | 'compare' | 'session',
        item: HistoryItem
    ): void {
        this.editingSessionId.set(item.id);
        this.originalTitle.set(item.title); // Store original title
        // Focus the input after DOM update
        setTimeout(() => {
            const input = document.querySelector('.inline-edit-field input') as HTMLInputElement;
            if (input) {
                input.focus();
                input.select();
            }
        }, 100);
    }

    async saveTitle(
        type: 'chat' | 'summary' | 'extract' | 'compare' | 'session',
        item: HistoryItem,
        newTitle: string
    ): Promise<void> {
        const trimmedTitle = newTitle?.trim();

        // Check if title actually changed
        if (!trimmedTitle || trimmedTitle === item.title) {
            this.editingSessionId.set(null);
            this.originalTitle.set(null);
            return;
        }

        // Show confirmation dialog
        const confirmed = await firstValueFrom(
            this.dialog.open<ConfirmDialogComponent, ConfirmDialogData, boolean>(
                ConfirmDialogComponent,
                {
                    data: {
                        title: this.translateService.instant('projects.details.confirm-rename-title'),
                        message: this.translateService.instant('projects.details.confirm-rename-message', {
                            oldTitle: item.title,
                            newTitle: trimmedTitle
                        }),
                        context: { item },
                    }
                }
            ).afterClosed()
        );

        if (!confirmed) {
            // User cancelled, revert to original title in the input
            const originalTitle = this.originalTitle();
            if (originalTitle) {
                item.title = originalTitle;
                this.sessionsHistory.update(sessions => [...sessions]);
            }
            this.editingSessionId.set(null);
            this.originalTitle.set(null);
            return;
        }

        // Store the original title in case we need to revert
        const originalTitle = this.originalTitle() || item.title;

        // Optimistically update the UI
        item.title = trimmedTitle;

        switch (type) {
            case 'session':
                this.projectsService.updateSessionName(item.id, { session_name: trimmedTitle, session_visibility: "none" }).subscribe({
                    next: () => {
                        this.toast.show(
                            this.translateService.instant('projects.details.title-updated')
                        );
                        this.editingSessionId.set(null);
                        this.originalTitle.set(null);
                    },
                    error: (err) => {
                        console.error('Error updating title:', err);

                        // Revert the title to original value
                        item.title = originalTitle;

                        // Update the signal to trigger UI refresh
                        // this.sessionsHistory.update(sessions => [...sessions]);

                        this.toast.showError(
                            this.translateService.instant('projects.error.failed-to-update-title') +
                            (err instanceof Error ? `: ${err.message}` : '')
                        );

                        // Keep edit mode open so user can retry
                        // Or close it: this.editingSessionId.set(null);
                    }
                });
                break;
        }
    }

    cancelEdit(): void {
        const itemId = this.editingSessionId();
        const originalValue = this.originalTitle();

        // Revert to original title if we have it
        if (itemId && originalValue) {
            const item = this.sessionsHistory().find(s => s.id === itemId);
            if (item && item.title !== originalValue) {
                item.title = originalValue;
                this.sessionsHistory.update(sessions => [...sessions]);
            }
        }

        this.editingSessionId.set(null);
        this.originalTitle.set(null);
    }


    async deleteItem(
        kind: 'chat' | 'summary' | 'extract' | 'compare' | 'session',
        item: HistoryItem
    ): Promise<void> {

        const confirmed = await firstValueFrom(this.dialog.open<
            ConfirmDialogComponent,
            ConfirmDialogData,
            boolean
        >(ConfirmDialogComponent, {
            data: {
                title: this.translateService.instant('delete'),
                message: this.translateService.instant('projects.details.confirm-delete', {
                    title: item.title,
                }),
                context: { item },
            }
        }).afterClosed())

        if (!confirmed) {
            return;
        }

        if (!confirmed) return;

        switch (kind) {
            case 'session':
                this.sessionsHistory.update((list) =>
                    list.filter((x) => x.id !== item.id)
                );

                this.projectsService.deleteSessionById(item.id).subscribe({
                    next: () => {
                        this.toast.show(
                            this.translateService.instant('projects.delete-success', { title: item.title })
                        );

                        // reload sessions and artifacts after deletion
                        this.loadProjectSessions(this.project()!.project_id);
                        this.loadProjectArtifacts(this.project()!.project_id);
                    },
                    error: (error: Error) => {
                        this.toast.showError(
                            this.translateService.instant('projects.error.delete-failed', { title: item.title }) + " " + (error ? `: ${error.message}` : ''),
                        );
                        console.error('Failed to delete session:', error);
                    }
                });
                break;
            /*case 'chat':
                this.chatHistory.update((list) => list.filter((x) => x.id !== item.id));
                break;
            case 'summary':
                this.summarizeHistory.update((list) =>
                    list.filter((x) => x.id !== item.id)
                );
                break;
            case 'extract':
                this.extractHistory.update((list) =>
                    list.filter((x) => x.id !== item.id)
                );
                break;
            case 'compare':
                this.compareHistory.update((list) =>
                    list.filter((x) => x.id !== item.id)
                );
                break; */
        }
    }

    /* 
        // Workflow operations
        onWfPage(e: PageEvent): void {
            this.wfPageIndex.set(e.pageIndex);
            this.wfPageSize.set(e.pageSize);
        }
    
        openWorkflow(w: WorkflowItem): void {
            console.log('Open workflow:', w.id);
            this.router.navigate(['/workflows', w.id]);
        }
    
        publishWorkflow(w: WorkflowItem): void {
            this.workflows.update((list) =>
                list.map((x) => (x.id === w.id ? { ...x, published: true } : x))
            );
        }
    
        // Member operations
        inviteMember(): void {
            const email = this.inviteEmail().trim();
            if (!email) return;
    
            const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
            if (!emailRegex.test(email)) return;
    
            const nameSeed = email.split('@')[0].replace(/\./g, ' ');
            const newMember: Member = {
                id: `inv-${Date.now()}`,
                name: nameSeed
                    ? nameSeed.charAt(0).toUpperCase() + nameSeed.slice(1)
                    : email,
                email,
                role: 'member',
                joinedAt: new Date(),
            };
    
            this.members.update((arr) => [newMember, ...arr]);
            this.inviteEmail.set('');
        }
    
        setRole(m: Member, role: Role): void {
            if (m.role === role) return;
            this.members.update((arr) =>
                arr.map((x) => (x.id === m.id ? { ...x, role } : x))
            );
        }
    
        removeMember(m: Member): void {
            const confirmed = confirm(
                this.translateService.instant('projects.details.confirm-remove-member', {
                    name: m.name,
                })
            );
            if (!confirmed) return;
            this.members.update((arr) => arr.filter((x) => x.id !== m.id));
        }
     */

    // Check if a session is favorited
    isFavoriteSession(sessionId: string): boolean {
        const projectId = this.project()?.project_id;
        if (!projectId) return false;

        const sessionUrl = `/genai-projects/${projectId}/sessions/${sessionId}`;
        return this.favoriteSessionUrls().some(fav => fav.url === sessionUrl);
    }

    // Toggle session favorite
    async toggleSessionFavorite(session: HistoryItem): Promise<void> {
        const projectId = this.project()?.project_id;
        if (!projectId) return;

        const sessionUrl = `/genai-projects/${projectId}/sessions/${session.id}`;
        const isFavorited = this.isFavoriteSession(session.id);

        if (isFavorited) {
            // Remove from favorites
            const favorite = this.favoriteSessionUrls().find(fav => fav.url === sessionUrl);
            if (favorite) {
                const confirmed = await firstValueFrom(
                    this.dialog.open<ConfirmDialogComponent, ConfirmDialogData, boolean>(
                        ConfirmDialogComponent,
                        {
                            data: {
                                title: this.translateService.instant('favorites.confirm-remove-title'),
                                message: this.translateService.instant('favorites.confirm-remove-message', {
                                    title: session.title
                                }),
                                context: { session },
                            }
                        }
                    ).afterClosed()
                );

                if (!confirmed) return;

                this.favoritesFacade.removeFavorite(favorite.id);
            }
        } else {
            // Add to favorites
            const title = session.title || session.id || this.translateService.instant('new-session');
            this.favoritesFacade.addFavorite(sessionUrl, title, FavoriteType.CHAT);
        }
    }

    // Batch operations for favorites
    async addAllSessionsToFavorites(): Promise<void> {
        const projectId = this.project()?.project_id;
        if (!projectId) return;

        const confirmed = await firstValueFrom(
            this.dialog.open<ConfirmDialogComponent, ConfirmDialogData, boolean>(
                ConfirmDialogComponent,
                {
                    data: {
                        title: this.translateService.instant('favorites.add-all-sessions'),
                        message: this.translateService.instant('favorites.add-all-sessions-message', {
                            count: this.sessionsCount()
                        }),
                    }
                }
            ).afterClosed()
        );

        if (!confirmed) return;

        this.sessionsHistory().forEach(session => {
            if (!this.isFavoriteSession(session.id)) {
                const sessionUrl = `/genai-projects/${projectId}/sessions/${session.id}`;
                const title = session.title || session.id || this.translateService.instant('new-session');
                this.favoritesFacade.addFavorite(sessionUrl, title, FavoriteType.CHAT);
            }
        });

        this.toast.show(this.translateService.instant('favorites.added'));
    }

    onTitleChange(title: string): void {
        // Handle title change if needed
        this.layoutService.setTitle(title);
    }

    // ======== WORKFLOW MANAGEMENT (Admin only) ========

    private subscribeToTemplates(): void {
        this.templateWorkflowsStore.templates$
            .pipe(takeUntilDestroyed(this.destroyRef))
            .subscribe(templates => {
                const map = new Map<string, TemplateWorkflow>();
                templates.forEach(template => map.set(template.id, template));
                this.templatesByIdFromStore.set(map);
            });
    }

    // Subscribe to template assignments from the store
    private subscribeToTemplateAssignments(projectId: string): void {
        this.templateWorkflowsStore.selectAssignmentsByProject(projectId)
            .pipe(takeUntilDestroyed(this.destroyRef))
            .subscribe(assignments => {
                const hydratedAssignments = assignments.map(a => ({
                    ...a,
                    assignedAt: typeof a.assignedAt === 'string'
                        ? DateTime.fromISO(a.assignedAt)
                        : a.assignedAt,
                    updatedAt: a.updatedAt && typeof a.updatedAt === 'string'
                        ? DateTime.fromISO(a.updatedAt)
                        : a.updatedAt,
                })) as unknown as ProjectTemplateAssignment[];

                this.templateAssignmentsFromStore.set(hydratedAssignments);
                hydratedAssignments.forEach(assignment => this.subscribeToTemplateSessionCount(assignment.id));
            });
    }

    private subscribeToTemplateSessionCount(assignmentId: string): void {
        if (this.templateSessionCountSubscriptions.has(assignmentId)) {
            return;
        }

        this.templateSessionCountSubscriptions.add(assignmentId);
        this.templateWorkflowsStore.selectSessionsByAssignment(assignmentId)
            .pipe(takeUntilDestroyed(this.destroyRef))
            .subscribe(sessions => {
                this.templateSessionCounts.update(counts => ({
                    ...counts,
                    [assignmentId]: sessions.length,
                }));
            });
    }

    getTemplateById(templateId: string): TemplateWorkflow | null {
        return this.templatesByIdFromStore().get(templateId) ?? null;
    }

    getTemplateSessionCount(assignmentId: string): number {
        return this.templateSessionCounts()[assignmentId] ?? 0;
    }

    getTemplateExecutionConfig(
        assignment: ProjectTemplateAssignment,
        template: TemplateWorkflow
    ): TemplateExecutionConfig {
        return {
            projectId: this.project()?.project_id ?? '',
            assignment,
            template,
        };
    }

    getTemplateIcon(assignment: ProjectTemplateAssignment): string {
        const template = this.getTemplateById(assignment.templateId);
        if (!template) return 'hub';

        const assignmentConfig = assignment.configuration as Record<string, unknown> | undefined;
        const overrideTemplate = assignmentConfig?.['uiTemplate'] as Record<string, unknown> | undefined;
        const overrideComponents = Array.isArray(overrideTemplate?.['components'])
            ? overrideTemplate['components'] as Record<string, unknown>[]
            : [];
        const componentTypes = overrideComponents.length
            ? overrideComponents
                .map(component => typeof component['type'] === 'string' ? component['type'] : null)
                .filter((type): type is string => !!type)
            : template.uiTemplate.components.map(component => component.type);
        const layout = typeof overrideTemplate?.['layout'] === 'string'
            ? overrideTemplate['layout']
            : template.uiTemplate.layout;

        if (componentTypes.includes('chat')) {
            if (componentTypes.includes('file-uploader') || componentTypes.includes('file-upload')) {
                return 'smart_toy';
            }
            return 'chat';
        }
        if (componentTypes.includes('file-uploader') || componentTypes.includes('file-upload')) {
            return 'upload_file';
        }
        if (componentTypes.includes('comparison-panel') || componentTypes.includes('compare')) {
            return 'compare';
        }

        switch (layout) {
            case 'chat-with-files':
                return 'smart_toy';
            case 'comparison-view':
                return 'compare';
            case 'dashboard':
                return 'dashboard';
            default:
                return 'hub';
        }
    }

    // Trackers
    trackFile = (_: number, f: FileItem) => f.id;
    trackMem = (_: number, m: Member) => m.id;
    trackHist = (_: number, h: HistoryItem) => h.id;
    trackTemplateAssignment = (_: number, assignment: ProjectTemplateAssignment) => assignment.id;
}
