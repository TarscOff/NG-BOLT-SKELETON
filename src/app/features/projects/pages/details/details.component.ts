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
import { toObservable } from '@angular/core/rxjs-interop';
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
import { ProjectsService } from '../../services/projects.service';
import { FileItem, HistoryItem, Member, ProjectArtifactsDataDto, ProjectDto, ProjectSessionDto, WorkflowItem } from '../../interfaces/project.model';
import { ConfirmDialogComponent, SeoComponent } from '@cadai/pxs-ng-core/shared';
import { KeycloakService, LayoutService, ToastService, ToolbarActionsService } from '@cadai/pxs-ng-core/services';
import { ConfirmDialogData, ToolbarAction } from '@cadai/pxs-ng-core/interfaces';
import { firstValueFrom } from 'rxjs';
import { UserRole } from '@cadai/pxs-ng-core/enums';
import { MatDialog } from '@angular/material/dialog';
import { DateTime } from 'luxon';
import { MatExpansionModule } from '@angular/material/expansion';

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
        SeoComponent,
        MatChipsModule,
        MatExpansionModule,
        TranslateModule
    ],
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
    private readonly keycloak = inject(KeycloakService);
    private readonly toast = inject(ToastService);

    // State
    readonly loading = signal(false);
    readonly error = signal<string | null>(null);
    readonly project = signal<ProjectDto | null>(null);

    // User type
    readonly userType = signal<'admin' | 'user'>('admin');
    readonly isAdmin = computed(() => this.userType() === 'admin');
    readonly isUser = computed(() => this.userType() === 'user');

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

    expandedGroups = signal({
        today: true,
        yesterday: true,
        pastWeek: false,
        older: false
    });

    toggleGroup(group: 'today' | 'yesterday' | 'pastWeek' | 'older') {
        this.expandedGroups.update(state => ({
            ...state,
            [group]: !state[group]
        }));
    }

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
    constructor(
        private dialog: MatDialog,
    ) {
        // Toolbar actions
        const back: ToolbarAction = {
            id: 'back',
            icon: 'arrow_back',
            tooltip: this.translateService.instant("common.back"),
            class: "accent",
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
            disabled$: toObservable(computed(() => this.loading())),
            click: async () => {
                const projectId = this.project()?.project_id;
                if (projectId) {
                    this.loading.set(true);
                    try {
                        const createdSession = await firstValueFrom(this.projectsService.createProjectsSessions(projectId));
                        if (createdSession && createdSession.session_id) {
                            this.router.navigate(['/genai-projects', projectId, 'sessions', createdSession.session_id]);
                            return;
                        }
                    } catch (error) {
                        this.error.set(
                            this.translateService.instant('projects.error.failed-to-create-session')
                        );
                        this.toast.showError(
                            this.translateService.instant('projects.error.failed-to-create-session') + " " + (error instanceof Error ? `: ${error.message}` : ''),
                        );
                    } finally {
                        this.loading.set(false);
                    }
                }
            },
        };
        this.toolbarService.scope(this.destroyRef, [back, newSession]);
    }

    ngOnInit(): void {
        const projectId = this.route.snapshot.paramMap.get('id');
        if (!projectId) {
            this.router.navigate(['/projects']);
            return;
        }
        this.loadProjectDetails(projectId);

        // Getting user informations
        const { roles } = this.keycloak.getUserCtx();
        if (roles.includes(UserRole.ROLE_admin)) {
            this.userType.set('admin');
        } else {
            this.userType.set('user');
        }
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
            const projects = await firstValueFrom(this.projectsService.getProjectsFilesData(projectId));
            this.files.set(this.mapToFiles(projects));

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

    mapToFiles(artifacts: ProjectArtifactsDataDto[]): FileItem[] {
        if (!artifacts) { return []; }
        return artifacts.map((e) => ({
            id: e.artifact_id,
            name: e.artifact_name || 'Untitled File',
            size: e.artifact_size,
            type: e.artifact_type,
            uploadedAt: DateTime.fromJSDate(new Date(e.created_on)),
        }));
    }

    mapToHistoryItems(sessions: ProjectSessionDto[], project: ProjectDto): HistoryItem[] {
        if (!sessions) { return []; }
        return sessions.map((s) => ({
            id: s.session_id,
            title: s.session_name || 'Untitled Session',
            createdAt: DateTime.fromJSDate(new Date(s.created_on)),
            projectId: project.project_id,
            meta: { ...s },
        })).sort(
            (a, b) => b.createdAt.toMillis() - a.createdAt.toMillis()
        );
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

            // Breadcrumbs items
            this.layoutService.setBreadcrumbs([
                { label: this.translateService.instant("nav.genai-projects"), route: '/genai-projects' },
                { label: project.name || "" }, // Current page, no route
            ]);

            // Load mock data - replace with actual API calls
            this.loadProjectArtifacts(projectId);
            this.loadProjectSessions(projectId);
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

    private loadMockData(): void {

        // Mock chat history
        /* 
        this.chatHistory.set(this.projectsService.loadMockData().chatHistory);
                // Mock compare history
                this.compareHistory.set([
                    {
                        id: 'p-410',
                        title: 'Compare: v1 vs v2 KYC schema',
                        createdAt: this.daysAgo(9),
                        progress: 55,
                    },
                ]);
        
                // Mock summarize history
                this.summarizeHistory.set([
                    {
                        id: 's-210',
                        title: 'Summary: 2025-10-OKR deck.pdf',
                        createdAt: this.daysAgo(3),
                        progress: 100,
                    },
                ]);
        
                // Mock extract history
                this.extractHistory.set([
                    {
                        id: 'e-310',
                        title: 'Extract: client.csv → emails',
                        createdAt: this.daysAgo(7),
                        progress: 70,
                    },
                ]);
        
                // Mock workflows
                this.workflows.set(
                    Array.from({ length: 13 }).map((_, i) => ({
                        id: `w-${i + 1}`,
                        name: `Workflow #${i + 1}`,
                        designedSteps: Math.floor(Math.random() * 12) + 3,
                        published: Math.random() > 0.45,
                        lastUpdated: new Date(
                            Date.now() - Math.floor(Math.random() * 10) * 86400000
                        ),
                    }))
                );
        
                // Mock members
                this.members.set([
                    {
                        id: 'u1',
                        name: 'Alice Martin',
                        email: 'alice@example.com',
                        role: 'owner',
                        joinedAt: new Date('2025-08-01'),
                    },
                    {
                        id: 'u2',
                        name: 'Bob Keller',
                        email: 'bob@example.com',
                        role: 'member',
                        joinedAt: new Date('2025-09-12'),
                    },
                ]); */
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

    fileIcon(name: string, type?: string): string {
        const ext = name.split('.').pop()?.toLowerCase();
        if (type?.includes('pdf') || ext === 'pdf') return 'picture_as_pdf';
        if (
            type?.startsWith('image/') ||
            ['png', 'jpg', 'jpeg', 'gif', 'webp', 'svg'].includes(ext ?? '')
        )
            return 'image';
        if (['csv', 'xls', 'xlsx'].includes(ext ?? '')) return 'table_chart';
        if (['ppt', 'pptx', 'key'].includes(ext ?? '')) return 'slideshow';
        if (['doc', 'docx', 'rtf', 'odt', 'txt', 'md'].includes(ext ?? ''))
            return 'description';
        if (['zip', 'rar', '7z', 'tar', 'gz'].includes(ext ?? ''))
            return 'folder_zip';
        return 'attach_file';
    }

    // History operations
    viewItem(
        kind: 'chat' | 'summary' | 'extract' | 'compare' | 'session',
        item: HistoryItem
    ): void {
        this.router.navigate(['/genai-projects', this.project()?.project_id, "sessions", item.id]);
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

    onTitleChange(title: string): void {
        // Handle title change if needed
        this.layoutService.setTitle(title);
    }

    // Trackers
    trackFile = (_: number, f: FileItem) => f.id;
    trackWf = (_: number, w: WorkflowItem) => w.id;
    trackMem = (_: number, m: Member) => m.id;
    trackHist = (_: number, h: HistoryItem) => h.id;
}