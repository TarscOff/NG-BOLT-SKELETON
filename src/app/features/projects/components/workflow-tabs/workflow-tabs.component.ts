import {
    Component,
    ChangeDetectionStrategy,
    Input,
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
import { MatTooltipModule } from '@angular/material/tooltip';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatChipsModule } from '@angular/material/chips';
import { Subject, takeUntil } from 'rxjs';
import { DateTime } from 'luxon';

import { 
    TemplateExecutionPanelComponent, 
    TemplateExecutionConfig 
} from '../template-execution-panel/template-execution-panel.component';
import { TemplateWorkflowsStore } from '@features/workflows/templates/data/template-workflows.store';
import { 
    TemplateWorkflow,
} from '@features/workflows/templates/interfaces/template-workflow.interface';
import { 
    ProjectTemplateAssignment, 
    TemplateExecutionSession 
} from '../../interfaces/project.model';

// Keep legacy imports for backward compatibility
import { WorkflowExecutionPanelConfig } from '../workflow-execution-panel/workflow-execution-panel.component';
import { ProjectWorkflowsStore } from '../../data/project-workflows.store';
import { ProjectWorkflowAssignment } from '../../interfaces/project.model';
import { WorkflowDraft, WorkflowsStore } from '@features/workflows/data/workflows.store';

@Component({
    selector: 'app-workflow-tabs',
    standalone: true,
    imports: [
        CommonModule,
        TranslateModule,
        MatButtonModule,
        MatIconModule,
        MatTabsModule,
        MatTooltipModule,
        MatProgressSpinnerModule,
        MatChipsModule,
        TemplateExecutionPanelComponent,
    ],
    template: `
        <div class="workflow-tabs-container">
            @if (isLoading()) {
                <div class="loading-templates">
                    <mat-spinner diameter="40"></mat-spinner>
                    <span>{{ 'templates.loading' | translate }}</span>
                </div>
            } @else if (enabledTemplateAssignments().length > 0) {
                <!-- Template-based workflow execution (Tier 3) -->
                <mat-tab-group 
                    [selectedIndex]="selectedTabIndex()"
                    (selectedIndexChange)="onTabChange($event)"
                    class="workflow-tabs"
                    animationDuration="200ms">
                    @for (assignment of enabledTemplateAssignments(); track assignment.id) {
                        <mat-tab>
                            <ng-template mat-tab-label>
                                <div class="tab-label-content">
                                    <mat-icon class="tab-icon">{{ getTemplateIcon(assignment) }}</mat-icon>
                                    <span class="tab-label">{{ assignment.templateName }}</span>
                                    @if (getSessionCount(assignment.id) > 0) {
                                        <span class="session-badge">{{ getSessionCount(assignment.id) }}</span>
                                    }
                                </div>
                            </ng-template>

                            <ng-template matTabContent>
                                @if (getTemplate(assignment.templateId); as template) {
                                    <app-template-execution-panel
                                        [config]="getTemplateExecutionConfig(assignment, template)"
                                        (sessionCreated)="onTemplateSessionCreated($event)"
                                        (sessionDeleted)="onTemplateSessionDeleted($event)"
                                        (executionStarted)="onTemplateExecutionStarted($event)">
                                    </app-template-execution-panel>
                                } @else {
                                    <div class="loading-workflow">
                                        <mat-spinner diameter="32"></mat-spinner>
                                        <span>{{ 'templates.loading_template' | translate }}</span>
                                    </div>
                                }
                            </ng-template>
                        </mat-tab>
                    }
                </mat-tab-group>
            } @else {
                <div class="no-workflows">
                    <mat-icon>hub</mat-icon>
                    <h3>{{ 'templates.no_enabled' | translate }}</h3>
                    <p>{{ 'templates.enable_hint' | translate }}</p>
                </div>
            }
        </div>
    `,
    styles: [`
        .workflow-tabs-container {
            height: 100%;
            min-height: 600px;
        }

        .loading-templates {
            display: flex;
            flex-direction: column;
            align-items: center;
            justify-content: center;
            height: 100%;
            min-height: 400px;
            gap: 16px;
            color: var(--mat-sys-on-surface-variant);
        }

        .no-workflows {
            display: flex;
            flex-direction: column;
            align-items: center;
            justify-content: center;
            height: 100%;
            min-height: 400px;
            gap: 16px;
            color: var(--mat-sys-on-surface-variant);
            text-align: center;
            padding: 24px;

            mat-icon {
                font-size: 64px;
                width: 64px;
                height: 64px;
            }

            h3 {
                margin: 0;
                color: var(--mat-sys-on-surface);
            }

            p {
                max-width: 400px;
            }
        }

        .workflow-tabs {
            height: 100%;

            ::ng-deep .mat-mdc-tab-body-wrapper {
                flex: 1;
            }
        }

        .tab-label-content {
            display: flex;
            align-items: center;
            gap: 8px;
        }

        .tab-icon {
            font-size: 20px;
            width: 20px;
            height: 20px;
            margin-right: 8px;
        }

        .tab-label {
            font-weight: 500;
        }

        .session-badge {
            display: flex;
            align-items: center;
            justify-content: center;
            min-width: 20px;
            height: 20px;
            padding: 0 6px;
            border-radius: 10px;
            background: var(--mat-sys-primary);
            color: var(--mat-sys-on-primary);
            font-size: 11px;
            font-weight: 600;
        }

        .loading-workflow {
            display: flex;
            flex-direction: column;
            align-items: center;
            justify-content: center;
            height: 400px;
            gap: 16px;
            color: var(--mat-sys-on-surface-variant);
        }
    `],
    changeDetection: ChangeDetectionStrategy.OnPush,
})
export class WorkflowTabsComponent implements OnInit, OnDestroy {
    // Template-based stores (Tier 3)
    private readonly templateStore = inject(TemplateWorkflowsStore);
    
    // Legacy stores (for backward compatibility)
    private readonly workflowsStore = inject(WorkflowsStore);
    private readonly projectWorkflowsStore = inject(ProjectWorkflowsStore);
    
    private readonly translate = inject(TranslateService);
    private readonly destroy$ = new Subject<void>();

    @Input({ required: true }) projectId!: string;

    // State signals - Legacy
    readonly assignments = signal<ProjectWorkflowAssignment[]>([]);
    readonly workflows = signal<Map<string, WorkflowDraft>>(new Map());
    
    // State signals - Template-based
    readonly templateAssignments = signal<ProjectTemplateAssignment[]>([]);
    readonly templates = signal<Map<string, TemplateWorkflow>>(new Map());
    readonly sessionCounts = signal<Record<string, number>>({});
    
    // Shared state
    readonly selectedTabIndex = signal(0);
    readonly isLoading = signal(true);

    // Computed signals - Legacy
    readonly enabledAssignments = computed(() => 
        this.assignments().filter(a => a.enabled)
    );
    
    // Computed signals - Template-based
    readonly enabledTemplateAssignments = computed(() =>
        this.templateAssignments().filter(a => a.enabled)
    );
    
    // Use template mode if we have template assignments
    readonly useTemplateMode = computed(() =>
        true
    );

    ngOnInit(): void {
        this.loadData();
    }

    ngOnDestroy(): void {
        this.destroy$.next();
        this.destroy$.complete();
    }

    private loadData(): void {
        // Load template assignments (Tier 3)
        this.templateStore.selectAssignmentsByProject(this.projectId)
            .pipe(takeUntil(this.destroy$))
            .subscribe(assignments => {
                // Hydrate DateTime objects
                const hydratedAssignments = assignments.map(a => ({
                    ...a,
                    assignedAt: typeof a.assignedAt === 'string'
                        ? DateTime.fromISO(a.assignedAt)
                        : a.assignedAt,
                    updatedAt: a.updatedAt && typeof a.updatedAt === 'string'
                        ? DateTime.fromISO(a.updatedAt)
                        : a.updatedAt,
                })) as unknown as ProjectTemplateAssignment[];

                this.templateAssignments.set(hydratedAssignments);
                this.isLoading.set(false);
                this.ensureSelectedTabInRange();

                // Load session counts
                hydratedAssignments.forEach(a => this.loadSessionCount(a.id));
            });

        // Load templates
        this.templateStore.templates$
            .pipe(takeUntil(this.destroy$))
            .subscribe(templates => {
                const map = new Map<string, TemplateWorkflow>();
                templates.forEach(t => map.set(t.id, t));
                this.templates.set(map);
                this.ensureSelectedTabInRange();
            });

        // Legacy: Subscribe to workflow assignments
        this.projectWorkflowsStore.selectAssignmentsByProject(this.projectId)
            .pipe(takeUntil(this.destroy$))
            .subscribe((assignments: ProjectWorkflowAssignment[]) => {
                this.assignments.set(assignments);
                this.ensureSelectedTabInRange();
                assignments.forEach(() => this.loadWorkflow());
            });

        // Legacy: Subscribe to workflows
        this.workflowsStore.workflows$
            .pipe(takeUntil(this.destroy$))
            .subscribe((workflows: WorkflowDraft[]) => {
                const map = new Map<string, WorkflowDraft>();
                workflows.forEach(w => map.set(w.id, w));
                this.workflows.set(map);
                this.ensureSelectedTabInRange();
            });
    }

    private ensureSelectedTabInRange(): void {
        const activeCount = this.enabledTemplateAssignments().length;

        if (activeCount === 0) {
            this.selectedTabIndex.set(0);
            return;
        }

        if (this.selectedTabIndex() >= activeCount) {
            this.selectedTabIndex.set(activeCount - 1);
        }
    }

    private loadSessionCount(assignmentId: string): void {
        this.templateStore.selectSessionsByAssignment(assignmentId)
            .pipe(takeUntil(this.destroy$))
            .subscribe(sessions => {
                this.sessionCounts.update(counts => ({
                    ...counts,
                    [assignmentId]: sessions.length,
                }));
            });
    }

    private loadWorkflow(): void {
        // Workflow should already be in the store
    }

    // Template methods
    getTemplate(templateId: string): TemplateWorkflow | undefined {
        return this.templates().get(templateId);
    }

    getSessionCount(assignmentId: string): number {
        return this.sessionCounts()[assignmentId] ?? 0;
    }

    getTemplateExecutionConfig(
        assignment: ProjectTemplateAssignment,
        template: TemplateWorkflow
    ): TemplateExecutionConfig {
        return {
            projectId: this.projectId,
            assignment,
            template,
        };
    }

    getTemplateIcon(assignment: ProjectTemplateAssignment): string {
        const template = this.getTemplate(assignment.templateId);
        if (!template) return 'hub';

        const assignmentConfig = assignment.configuration as Record<string, unknown> | undefined;
        const overrideTemplate = assignmentConfig?.['uiTemplate'] as Record<string, unknown> | undefined;
        const overrideComponents = Array.isArray(overrideTemplate?.['components'])
            ? overrideTemplate!['components'] as Record<string, unknown>[]
            : [];
        const componentTypes = overrideComponents.length
            ? overrideComponents
                .map(component => typeof component['type'] === 'string' ? component['type'] : null)
                .filter((type): type is string => !!type)
            : template.uiTemplate.components.map(c => c.type);
        const layout = typeof overrideTemplate?.['layout'] === 'string'
            ? overrideTemplate['layout'] as string
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
            case 'chat-with-files': return 'smart_toy';
            case 'comparison-view': return 'compare';
            case 'dashboard': return 'dashboard';
            default: return 'hub';
        }
    }

    // Legacy methods
    getWorkflow(workflowId: string): WorkflowDraft | undefined {
        return this.workflows().get(workflowId);
    }

    getExecutionConfig(assignment: ProjectWorkflowAssignment, workflow: WorkflowDraft): WorkflowExecutionPanelConfig {
        return {
            projectId: this.projectId,
            assignment,
            workflow,
        };
    }

    getWorkflowIcon(assignment: ProjectWorkflowAssignment): string {
        const workflow = this.getWorkflow(assignment.workflowId);
        if (!workflow) return 'hub';

        const hasChatTrigger = workflow.nodes?.some(n => n.type === 'trigger_chat');
        const hasFileTrigger = workflow.nodes?.some(n => n.type === 'trigger_file_upload');
        const hasWebhook = workflow.nodes?.some(n => n.type === 'trigger_webhook');

        if (hasChatTrigger && hasFileTrigger) return 'smart_toy';
        if (hasChatTrigger) return 'chat';
        if (hasFileTrigger) return 'upload_file';
        if (hasWebhook) return 'webhook';
        return 'hub';
    }

    // Event handlers
    onTabChange(index: number): void {
        this.selectedTabIndex.set(index);

        const enabled = this.enabledTemplateAssignments();
        if (enabled[index]) {
            this.templateStore.selectAssignment(enabled[index].id);
        }
    }

    // Template event handlers
    onTemplateSessionCreated(session: TemplateExecutionSession): void {
        console.log('Template session created:', session);
        this.sessionCounts.update(counts => ({
            ...counts,
            [session.assignmentId]: (counts[session.assignmentId] ?? 0) + 1,
        }));
    }

    onTemplateSessionDeleted(sessionId: string): void {
        console.log('Template session deleted:', sessionId);
    }

    onTemplateExecutionStarted(event: { sessionId: string; data?: unknown }): void {
        console.log('Template execution started:', event);
    }

    // Legacy event handlers
    onSessionCreated(session: unknown): void {
        console.log('Session created:', session);
    }

    onSessionDeleted(sessionId: string): void {
        console.log('Session deleted:', sessionId);
    }

    onExecutionStarted(event: { sessionId: string; files?: File[] }): void {
        console.log('Execution started:', event);
    }
}
