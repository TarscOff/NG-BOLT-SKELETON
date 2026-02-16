import {
    Component,
    ChangeDetectionStrategy,
    Input,
    Output,
    EventEmitter,
    signal,
    computed,
    inject,
    OnInit,
    OnDestroy,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { TranslateModule, TranslateService } from '@ngx-translate/core';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatTabsModule } from '@angular/material/tabs';
import { MatMenuModule } from '@angular/material/menu';
import { MatTooltipModule } from '@angular/material/tooltip';
import { MatDividerModule } from '@angular/material/divider';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatListModule } from '@angular/material/list';
import { Subject, takeUntil } from 'rxjs';
import { DateTime } from 'luxon';

import { ChatComponent } from '@features/workflows/templates/components/chat/chat.component';
import { FileUploadPanelComponent } from '../file-upload-panel/file-upload-panel.component';
import { 
    detectWorkflowTriggers, 
    WorkflowTriggers, 
    WorkflowUIMode,
    FileUploadConfig,
    extractFileUploadConfig 
} from '../../utils/workflow-trigger.utils';
import { ProjectWorkflowsStore } from '../../data/project-workflows.store';
import { 
    ProjectWorkflowAssignment, 
    WorkflowExecutionSession 
} from '../../interfaces/project.model';
import { WorkflowDraft } from '@features/workflows/data/workflows.store';
import { WorkflowNode } from '@features/workflows/templates/utils/workflow.interface';
import { ChatSender } from '@features/workflows/templates/utils/tplsInterfaces/chatTpl.interface';

export interface WorkflowExecutionPanelConfig {
    projectId: string;
    assignment: ProjectWorkflowAssignment;
    workflow: WorkflowDraft;
}

@Component({
    selector: 'app-workflow-execution-panel',
    standalone: true,
    imports: [
        CommonModule,
        TranslateModule,
        MatButtonModule,
        MatIconModule,
        MatTabsModule,
        MatMenuModule,
        MatTooltipModule,
        MatDividerModule,
        MatProgressSpinnerModule,
        MatListModule,
        ChatComponent,
        FileUploadPanelComponent,
    ],
    template: `
        <div class="workflow-execution-panel">
            <!-- Session Sidebar -->
            <div class="session-sidebar">
                <div class="sidebar-header">
                    <h3>{{ 'projects.workflows.sessions' | translate }}</h3>
                    <button mat-icon-button 
                            color="primary" 
                            (click)="createNewSession()"
                            [matTooltip]="'projects.workflows.new_session' | translate">
                        <mat-icon>add</mat-icon>
                    </button>
                </div>
                
                <mat-divider></mat-divider>
                
                <div class="session-list">
                    @if (isLoadingSessions()) {
                        <div class="loading-sessions">
                            <mat-spinner diameter="24"></mat-spinner>
                        </div>
                    } @else if (sessions().length === 0) {
                        <div class="empty-sessions">
                            <mat-icon>chat_bubble_outline</mat-icon>
                            <span>{{ 'projects.workflows.no_sessions' | translate }}</span>
                            <button mat-stroked-button color="primary" (click)="createNewSession()">
                                {{ 'projects.workflows.start_first_session' | translate }}
                            </button>
                        </div>
                    } @else {
                        @for (session of sessions(); track session.id) {
                            <div class="session-item" 
                                 role="button"
                                 tabindex="0"
                                 [class.active]="selectedSessionId() === session.id"
                                 (click)="selectSession(session)"
                                 (keydown)="onSessionItemKeydown($event, session)">
                                <div class="session-info">
                                    <span class="session-name">{{ session.name }}</span>
                                    <span class="session-date">{{ formatDate(session.createdAt) }}</span>
                                </div>
                                <div class="session-status">
                                    <mat-icon [class]="'status-' + session.status">
                                        {{ getStatusIcon(session.status) }}
                                    </mat-icon>
                                </div>
                                <button mat-icon-button 
                                        [matMenuTriggerFor]="sessionMenu"
                                        (click)="$event.stopPropagation()">
                                    <mat-icon>more_vert</mat-icon>
                                </button>
                                <mat-menu #sessionMenu="matMenu">
                                    <button mat-menu-item (click)="renameSession(session)">
                                        <mat-icon>edit</mat-icon>
                                        {{ 'common.rename' | translate }}
                                    </button>
                                    <button mat-menu-item color="warn" (click)="deleteSession(session)">
                                        <mat-icon>delete</mat-icon>
                                        {{ 'common.delete' | translate }}
                                    </button>
                                </mat-menu>
                            </div>
                        }
                    }
                </div>
            </div>

            <!-- Main Content Area -->
            <div class="execution-content">
                @if (!selectedSession()) {
                    <div class="no-session-selected">
                        <mat-icon>play_circle_outline</mat-icon>
                        <h2>{{ 'projects.workflows.select_or_create_session' | translate }}</h2>
                        <p>{{ 'projects.workflows.session_description' | translate }}</p>
                        <button mat-flat-button color="primary" (click)="createNewSession()">
                            <mat-icon>add</mat-icon>
                            {{ 'projects.workflows.new_session' | translate }}
                        </button>
                    </div>
                } @else {
                    <div class="session-header">
                        <h2>{{ selectedSession()?.name }}</h2>
                        <span class="session-meta">
                            {{ 'projects.workflows.created' | translate }}: 
                            {{ formatDate(selectedSession()?.createdAt) }}
                        </span>
                    </div>

                    <div class="execution-area">
                        <!-- Chat Mode -->
                        @switch (uiMode()) {
                            @case ('chat') {
                                <app-chat-tpl
                                    [projectId]="config.projectId"
                                    [sessionId]="selectedSessionId() ?? ''"
                                    [currentUser]="currentUser()"
                                    [chatTemplateId]="getChatTemplateId()"
                                    [mode]="{ mode: 'interactive' }"
                                    [config]="chatConfig()"
                                    (messageSent)="onMessageSent()"
                                    (errorEmitter)="onChatError($event)">
                                </app-chat-tpl>
                            }

                            @case ('file-upload') {
                                <div class="file-upload-container">
                                    <app-file-upload-panel
                                        [config]="fileUploadConfig()"
                                        (filesSubmitted)="onFilesSubmitted($event)">
                                    </app-file-upload-panel>
                                    
                                    @if (lastResult()) {
                                        <div class="execution-results">
                                            <h3>{{ 'projects.workflows.results' | translate }}</h3>
                                            <pre>{{ lastResult() | json }}</pre>
                                        </div>
                                    }
                                </div>
                            }

                            @case ('chat-with-file') {
                                <app-chat-tpl
                                    [projectId]="config.projectId"
                                    [sessionId]="selectedSessionId() ?? ''"
                                    [currentUser]="currentUser()"
                                    [chatTemplateId]="getChatTemplateId()"
                                    [fileTemplateId]="getFileTemplateId()"
                                    [mode]="{ mode: 'interactive' }"
                                    [config]="chatWithFileConfig()"
                                    (messageSent)="onMessageSent()"
                                    (attachmentUploaded)="onAttachmentUploaded($event)"
                                    (errorEmitter)="onChatError($event)">
                                </app-chat-tpl>
                            }

                            @case ('results-only') {
                                <div class="results-only-container">
                                    <div class="trigger-info">
                                        <mat-icon>webhook</mat-icon>
                                        <h3>{{ 'projects.workflows.external_trigger' | translate }}</h3>
                                        <p>{{ 'projects.workflows.external_trigger_description' | translate }}</p>
                                    </div>
                                    
                                    @if (isExecuting()) {
                                        <div class="executing-indicator">
                                            <mat-spinner diameter="32"></mat-spinner>
                                            <span>{{ 'projects.workflows.executing' | translate }}</span>
                                        </div>
                                    }

                                    @if (lastResult()) {
                                        <div class="execution-results">
                                            <h3>{{ 'projects.workflows.last_result' | translate }}</h3>
                                            <div class="result-meta">
                                                <span>{{ 'projects.workflows.executed_at' | translate }}: 
                                                    {{ formatDate(lastResult()?.startedAt) }}
                                                </span>
                                                <span class="result-status" [class]="lastResult()?.status">
                                                    {{ lastResult()?.status }}
                                                </span>
                                            </div>
                                            <pre class="result-output">{{ lastResult()?.outputs | json }}</pre>
                                            @if (lastResult()?.error) {
                                                <div class="result-error">
                                                    <mat-icon>error</mat-icon>
                                                    <span>{{ lastResult()?.error }}</span>
                                                </div>
                                            }
                                        </div>
                                    }
                                </div>
                            }

                            @default {
                                <div class="no-triggers">
                                    <mat-icon>warning</mat-icon>
                                    <h3>{{ 'projects.workflows.no_triggers' | translate }}</h3>
                                    <p>{{ 'projects.workflows.no_triggers_description' | translate }}</p>
                                </div>
                            }
                        }
                    </div>
                }
            </div>
        </div>
    `,
    styles: [`
        .workflow-execution-panel {
            display: flex;
            height: 100%;
            min-height: 500px;
            background: var(--mat-sys-surface);
            border-radius: 12px;
            overflow: hidden;
        }

        .session-sidebar {
            width: 280px;
            min-width: 280px;
            border-right: 1px solid var(--mat-sys-outline-variant);
            display: flex;
            flex-direction: column;
            background: var(--mat-sys-surface-container);
        }

        .sidebar-header {
            display: flex;
            align-items: center;
            justify-content: space-between;
            padding: 16px;
            
            h3 {
                margin: 0;
                font-size: 16px;
                font-weight: 500;
            }
        }

        .session-list {
            flex: 1;
            overflow-y: auto;
            padding: 8px;
        }

        .loading-sessions {
            display: flex;
            justify-content: center;
            padding: 24px;
        }

        .empty-sessions {
            display: flex;
            flex-direction: column;
            align-items: center;
            gap: 12px;
            padding: 24px;
            text-align: center;
            color: var(--mat-sys-on-surface-variant);

            mat-icon {
                font-size: 48px;
                width: 48px;
                height: 48px;
            }
        }

        .session-item {
            display: flex;
            align-items: center;
            gap: 8px;
            padding: 12px;
            border-radius: 8px;
            cursor: pointer;
            transition: background 0.2s ease;

            &:hover {
                background: var(--mat-sys-surface-container-high);
            }

            &.active {
                background: color-mix(in srgb, var(--mat-sys-primary) 15%, transparent);
            }
        }

        .session-info {
            flex: 1;
            min-width: 0;
            display: flex;
            flex-direction: column;
            gap: 2px;
        }

        .session-name {
            font-weight: 500;
            white-space: nowrap;
            overflow: hidden;
            text-overflow: ellipsis;
        }

        .session-date {
            font-size: 12px;
            color: var(--mat-sys-on-surface-variant);
        }

        .session-status {
            mat-icon {
                font-size: 18px;
                width: 18px;
                height: 18px;
                
                &.status-idle { color: var(--mat-sys-on-surface-variant); }
                &.status-running { color: var(--mat-sys-tertiary); }
                &.status-completed { color: var(--mat-sys-primary); }
                &.status-error { color: var(--mat-sys-error); }
            }
        }

        .execution-content {
            flex: 1;
            display: flex;
            flex-direction: column;
            overflow: hidden;
        }

        .no-session-selected {
            flex: 1;
            display: flex;
            flex-direction: column;
            align-items: center;
            justify-content: center;
            gap: 16px;
            color: var(--mat-sys-on-surface-variant);
            text-align: center;
            padding: 24px;

            mat-icon {
                font-size: 64px;
                width: 64px;
                height: 64px;
            }

            h2 {
                margin: 0;
                color: var(--mat-sys-on-surface);
            }

            p {
                max-width: 400px;
            }
        }

        .session-header {
            padding: 16px 24px;
            border-bottom: 1px solid var(--mat-sys-outline-variant);
            
            h2 {
                margin: 0 0 4px 0;
                font-size: 18px;
            }

            .session-meta {
                font-size: 12px;
                color: var(--mat-sys-on-surface-variant);
            }
        }

        .execution-area {
            flex: 1;
            overflow: hidden;
            display: flex;
            flex-direction: column;
        }

        .file-upload-container,
        .results-only-container {
            flex: 1;
            padding: 24px;
            overflow-y: auto;
        }

        .trigger-info {
            display: flex;
            flex-direction: column;
            align-items: center;
            gap: 12px;
            padding: 24px;
            text-align: center;
            background: var(--mat-sys-surface-container);
            border-radius: 12px;
            margin-bottom: 24px;

            mat-icon {
                font-size: 48px;
                width: 48px;
                height: 48px;
                color: var(--mat-sys-tertiary);
            }

            h3 { margin: 0; }
            p { 
                margin: 0;
                color: var(--mat-sys-on-surface-variant);
            }
        }

        .executing-indicator {
            display: flex;
            align-items: center;
            justify-content: center;
            gap: 12px;
            padding: 24px;
            background: var(--mat-sys-surface-container);
            border-radius: 8px;
            margin-bottom: 16px;
        }

        .execution-results {
            background: var(--mat-sys-surface-container);
            border-radius: 12px;
            padding: 16px;
            margin-top: 16px;

            h3 {
                margin: 0 0 12px 0;
                font-size: 16px;
            }

            pre {
                background: var(--mat-sys-surface-container-highest);
                padding: 12px;
                border-radius: 8px;
                overflow-x: auto;
                font-size: 12px;
                margin: 0;
            }
        }

        .result-meta {
            display: flex;
            align-items: center;
            gap: 16px;
            margin-bottom: 12px;
            font-size: 14px;

            .result-status {
                padding: 4px 8px;
                border-radius: 4px;
                font-weight: 500;

                &.success { 
                    background: color-mix(in srgb, var(--mat-sys-primary) 15%, transparent);
                    color: var(--mat-sys-primary);
                }
                &.error { 
                    background: color-mix(in srgb, var(--mat-sys-error) 15%, transparent);
                    color: var(--mat-sys-error);
                }
            }
        }

        .result-error {
            display: flex;
            align-items: center;
            gap: 8px;
            padding: 12px;
            background: color-mix(in srgb, var(--mat-sys-error) 10%, transparent);
            border-radius: 8px;
            color: var(--mat-sys-error);
            margin-top: 12px;
        }

        .no-triggers {
            flex: 1;
            display: flex;
            flex-direction: column;
            align-items: center;
            justify-content: center;
            gap: 12px;
            color: var(--mat-sys-on-surface-variant);
            text-align: center;

            mat-icon {
                font-size: 48px;
                width: 48px;
                height: 48px;
                color: var(--mat-sys-tertiary);
            }
        }
    `],
    changeDetection: ChangeDetectionStrategy.OnPush,
})
export class WorkflowExecutionPanelComponent implements OnInit, OnDestroy {
    private readonly workflowsStore = inject(ProjectWorkflowsStore);
    private readonly translate = inject(TranslateService);
    private readonly destroy$ = new Subject<void>();

    @Input({ required: true }) config!: WorkflowExecutionPanelConfig;

    @Output() sessionCreated = new EventEmitter<WorkflowExecutionSession>();
    @Output() sessionDeleted = new EventEmitter<string>();
    @Output() executionStarted = new EventEmitter<{ sessionId: string; files?: File[] }>();

    // Derived signals
    readonly triggers = computed<WorkflowTriggers>(() => 
        detectWorkflowTriggers(this.config.workflow)
    );

    readonly uiMode = computed<WorkflowUIMode>(() => this.triggers().uiMode);

    readonly sessions = signal<WorkflowExecutionSession[]>([]);
    readonly selectedSessionId = signal<string | null>(null);
    readonly selectedSession = computed(() => 
        this.sessions().find(s => s.id === this.selectedSessionId())
    );

    readonly isLoadingSessions = signal(false);
    readonly isExecuting = signal(false);

    readonly lastResult = computed(() => this.selectedSession()?.lastResult);

    readonly fileUploadConfig = computed<FileUploadConfig | null>(() => {
        const workflow = this.config.workflow;
        const fileNode = workflow.nodes?.find((n: WorkflowNode) => n.type === 'trigger_file_upload');
        if (!fileNode) return null;
        return extractFileUploadConfig(fileNode);
    });

    readonly chatConfig = computed(() => ({
        showTimestamps: true,
        allowEdit: false,
        allowDelete: false,
        maxMessageLength: 4000,
        showAvatars: true,
    }));

    readonly chatWithFileConfig = computed(() => ({
        ...this.chatConfig(),
        enableAttachments: true,
        maxFileSize: this.fileUploadConfig()?.maxFileSize ?? 10 * 1024 * 1024,
    }));

    readonly currentUser = signal<ChatSender>({
        id: '',
        name: '',
        type: 'user',
        avatar: '',
    });

    ngOnInit(): void {
        // Set default user (will be updated if user info is available)
        this.currentUser.set({
            id: 'current-user',
            name: 'User',
            avatar: '',
            type: 'user',
        });

        // Subscribe to sessions from store
        this.workflowsStore.selectSessionsByAssignment(this.config.assignment.id)
            .pipe(takeUntil(this.destroy$))
            .subscribe((sessions: WorkflowExecutionSession[]) => {
                this.sessions.set(sessions);
                // Auto-select first session if none selected
                if (sessions.length > 0 && !this.selectedSessionId()) {
                    this.selectedSessionId.set(sessions[0].id);
                }
            });

        // Subscribe to selected session from store
        this.workflowsStore.selectedSession$
            .pipe(takeUntil(this.destroy$))
            .subscribe((session: WorkflowExecutionSession | null) => {
                if (session && session.assignmentId === this.config.assignment.id) {
                    this.selectedSessionId.set(session.id);
                }
            });
    }

    ngOnDestroy(): void {
        this.destroy$.next();
        this.destroy$.complete();
    }

    createNewSession(): void {
        const sessionNumber = this.sessions().length + 1;
        this.workflowsStore.createSession({
            assignmentId: this.config.assignment.id,
            projectId: this.config.projectId,
            workflowId: this.config.workflow.id,
            name: `${this.translate.instant('projects.workflows.session')} #${sessionNumber}`,
        });
    }

    selectSession(session: WorkflowExecutionSession): void {
        this.workflowsStore.selectSession(session.id);
        this.selectedSessionId.set(session.id);
    }

    onSessionItemKeydown(event: KeyboardEvent, session: WorkflowExecutionSession): void {
        if (event.key === 'Enter' || event.key === ' ') {
            event.preventDefault();
            this.selectSession(session);
        }
    }

    renameSession(session: WorkflowExecutionSession): void {
        // TODO: Implement rename dialog
        const newName = prompt(this.translate.instant('projects.workflows.enter_session_name'), session.name);
        if (newName && newName !== session.name) {
            this.workflowsStore.updateSession({
                assignmentId: session.assignmentId,
                sessionId: session.id,
                changes: { name: newName },
            });
        }
    }

    deleteSession(session: WorkflowExecutionSession): void {
        if (confirm(this.translate.instant('projects.workflows.confirm_delete_session'))) {
            this.workflowsStore.removeSession({
                assignmentId: session.assignmentId,
                sessionId: session.id,
            });
            this.sessionDeleted.emit(session.id);
            
            // Select another session if this was selected
            if (this.selectedSessionId() === session.id) {
                const remaining = this.sessions().filter(s => s.id !== session.id);
                this.selectedSessionId.set(remaining.length > 0 ? remaining[0].id : null);
            }
        }
    }

    onMessageSent(): void {
        // Update session status
        const session = this.selectedSession();
        if (session) {
            this.workflowsStore.updateSession({
                assignmentId: session.assignmentId,
                sessionId: session.id,
                changes: { status: 'running' },
            });
        }
    }

    onFilesSubmitted(files: File[]): void {
        const session = this.selectedSession();
        if (session) {
            this.executionStarted.emit({ sessionId: session.id, files });
            this.workflowsStore.updateSession({
                assignmentId: session.assignmentId,
                sessionId: session.id,
                changes: { status: 'running' },
            });
        }
    }

    onAttachmentUploaded(attachment: { url: string; filename: string }): void {
        console.log('Attachment uploaded:', attachment);
    }

    onChatError(error: Error): void {
        console.error('Workflow chat error:', error);
        const session = this.selectedSession();
        if (session) {
            this.workflowsStore.updateSession({
                assignmentId: session.assignmentId,
                sessionId: session.id,
                changes: { status: 'error' },
            });
        }
    }

    getChatTemplateId(): string {
        const chatNode = this.config.workflow.nodes?.find((n: WorkflowNode) => n.type === 'trigger_chat');
        return chatNode?.id ?? '';
    }

    getFileTemplateId(): string {
        const fileNode = this.config.workflow.nodes?.find((n: WorkflowNode) => n.type === 'trigger_file_upload');
        return fileNode?.id ?? '';
    }

    formatDate(date: DateTime | string | undefined): string {
        if (!date) return '';
        const dt = typeof date === 'string' ? DateTime.fromISO(date) : date;
        return dt.toLocaleString(DateTime.DATETIME_SHORT);
    }

    getStatusIcon(status: WorkflowExecutionSession['status']): string {
        switch (status) {
            case 'idle': return 'radio_button_unchecked';
            case 'running': return 'sync';
            case 'completed': return 'check_circle';
            case 'error': return 'error';
            default: return 'help';
        }
    }
}
