import {
    ChangeDetectionStrategy,
    Component,
    DestroyRef,
    OnDestroy,
    OnInit,
    computed,
    inject,
    signal,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { Router } from '@angular/router';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { takeUntilDestroyed, toObservable } from '@angular/core/rxjs-interop';
import { firstValueFrom, startWith } from 'rxjs';
import { TranslateModule, TranslateService } from '@ngx-translate/core';
import { MatButtonModule } from '@angular/material/button';
import { MatCardModule } from '@angular/material/card';
import { MatIconModule } from '@angular/material/icon';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatStepper, MatStepperModule } from '@angular/material/stepper';
import { StepperSelectionEvent } from '@angular/cdk/stepper';
import { DynamicFormComponent, SeoComponent } from '@cadai/pxs-ng-core/shared';
import { FieldConfigService, LayoutService, ToastService, ToolbarActionsService } from '@cadai/pxs-ng-core/services';
import { FieldConfig, ToolbarAction } from '@cadai/pxs-ng-core/interfaces';
import { TemplateAssignment } from '@shared/types/workflow.types';
import { TemplateWorkflowsStore } from '@features/workflows/templates/data/template-workflows.store';
import { ProjectsService } from '../../services/projects.service';
import { ProjectTemplateCanvasComponent } from '../../components/project-template-canvas/project-template-canvas.component';

@Component({
    selector: 'app-project-creation-wizard',
    standalone: true,
    imports: [
        CommonModule,
        ReactiveFormsModule,
        TranslateModule,
        MatButtonModule,
        MatCardModule,
        MatIconModule,
        MatProgressSpinnerModule,
        MatStepperModule,
        DynamicFormComponent,
        SeoComponent,
        ProjectTemplateCanvasComponent,
    ],
    template: `
        <app-seo
            [pageTitle]="'projects.wizard.title' | translate"
            [description]="'projects.wizard.subtitle' | translate"
            [keywords]="'projects, wizard, templates, design'"
            (titleChange)="onTitleChange($event)">
        </app-seo>

        <div class="wizard-page">
            <mat-card appearance="outlined" class="wizard-shell">
                <mat-stepper linear #stepper class="wizard-stepper" (selectionChange)="onStepChange($event)">
                    <mat-step [stepControl]="metadataForm">
                        <ng-template matStepLabel>
                            {{ 'projects.wizard.steps.metadata' | translate }}
                        </ng-template>

                        <div class="step-panel metadata-panel">
                            <div class="metadata-form">
                                <app-dynamic-form [form]="metadataForm" [config]="metadataFieldConfig"></app-dynamic-form>
                            </div>

                            <div class="step-actions">
                                <button mat-flat-button color="primary" (click)="nextFromMetadata(stepper)">
                                    {{ 'common.next' | translate }}
                                </button>
                            </div>
                        </div>
                    </mat-step>

                    <mat-step>
                        <ng-template matStepLabel>
                            {{ 'projects.wizard.steps.design' | translate }}
                        </ng-template>

                        <div class="step-panel design-panel">
                            <div class="design-step">
                                <div class="design-info">
                                    <h3>{{ metadataForm.controls.name.value || ('projects.wizard.preview_title' | translate) }}</h3>
                                    <p>{{ 'projects.wizard.design_help' | translate }}</p>
                                    <div class="assignment-count">
                                        <mat-icon>dashboard_customize</mat-icon>
                                        <span>
                                            {{ assignedTemplatesCount() }}
                                            {{ 'projects.wizard.assigned_templates' | translate }}
                                        </span>
                                    </div>
                                </div>

                                <div class="canvas-host">
                                    @if (activeStepIndex() === 1) {
                                        <app-project-template-canvas
                                            [projectId]="draftProjectId()"
                                            [projectName]="metadataForm.controls.name.value || undefined">
                                        </app-project-template-canvas>
                                    }
                                </div>
                            </div>

                            <div class="step-actions">
                                <div class="step-status" aria-live="polite">
                                    @if (!canFinish() && !isSaving()) {
                                        @for (issueKey of blockingIssueKeys(); track issueKey) {
                                            <span class="status-chip error">
                                                <mat-icon>error</mat-icon>
                                                <span>{{ issueKey | translate }}</span>
                                            </span>
                                        }
                                    }
                                </div>
                                <button mat-button matStepperPrevious [disabled]="isSaving()">
                                    {{ 'common.previous' | translate }}
                                </button>
                                <button
                                    mat-flat-button
                                    color="primary"
                                    (click)="finish()"
                                    [disabled]="!canFinish() || isSaving()">
                                    @if (isSaving()) {
                                        <mat-spinner diameter="18"></mat-spinner>
                                    } @else {
                                        <mat-icon>check</mat-icon>
                                    }
                                    {{ 'projects.wizard.create' | translate }}
                                </button>
                            </div>
                        </div>
                    </mat-step>
                </mat-stepper>
            </mat-card>
        </div>
    `,
    styles: [`
        :host {
            display: block;
            height: 100%;
        }

        .wizard-page {
            overflow: hidden;
        }

        .wizard-shell {
            height: 100%;
            border: none;

        }

        .wizard-stepper {
            flex: 1;
            min-height: 100%;
            display: block;
            overflow: visible;
            background: transparent;

            ::ng-deep .mat-horizontal-content-container {
                padding: 1rem;
                overflow: visible;
            }

            ::ng-deep .mat-horizontal-stepper-content {
                overflow: visible;
            }
        }

        .step-panel {
            min-height: 100%;
            display: flex;
            flex-direction: column;
            gap: 0.85rem;
        }

        .metadata-panel {
            align-items: stretch;
        }
        
        .design-panel {
            min-height: 100%;
        }

        .design-step {
            display: flex;
            flex-direction: column;
            gap: 0.75rem;
            flex: 1 1 auto;
            min-height: 0;
        }

        .design-info {
            h3 {
                margin: 0;
            }

            p {
                margin: 0.35rem 0;
                opacity: 0.8;
            }
        }

        .assignment-count {
            display: inline-flex;
            align-items: center;
            gap: 0.35rem;
            padding: 0.4rem 0.65rem;
            border-radius: 999px;
            background: color-mix(in srgb, var(--mat-primary) 14%, transparent);
            color: var(--mat-primary);
            font-weight: 500;
            font-size: 0.85rem;
        }

        .canvas-host {
            flex: 1;
            min-height: 520px;
            height: min(68vh, 820px);
            border-radius: 12px;
        }

        .step-actions {
            margin-top: auto;
            display: flex;
            justify-content: space-between;
            gap: 0.5rem;
            align-items: center;
            padding-bottom: 0.25rem;
            background: transparent;
        }

        .step-status {
            display: flex;
            align-items: center;
            gap: 0.45rem;
            flex-wrap: wrap;
            min-height: 32px;
        }

        .status-chip {
            display: inline-flex;
            align-items: center;
            gap: 0.35rem;
            border-radius: 999px;
            padding: 0.25rem 0.6rem;
            font-size: 0.78rem;
            font-weight: 500;

            mat-icon {
                font-size: 0.95rem;
                width: 0.95rem;
                height: 0.95rem;
            }
        }

        .status-chip.error {
            color: var(--mat-sys-error, #b3261e);
            border: 1px solid color-mix(in srgb, var(--mat-sys-error, #b3261e) 35%, transparent);
            background: color-mix(in srgb, var(--mat-sys-error, #b3261e) 12%, transparent);
        }

        @media (max-width: 900px) {
            .design-step {
                min-height: 420px;
            }

            .canvas-host {
                min-height: 420px;
                height: clamp(420px, 55vh, 680px);
            }
        }
    `],
    changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ProjectCreationWizardComponent implements OnInit, OnDestroy {
    private readonly projectsService = inject(ProjectsService);
    private readonly templateWorkflowsStore = inject(TemplateWorkflowsStore);
    private readonly router = inject(Router);
    private readonly toast = inject(ToastService);
    private readonly translateService = inject(TranslateService);
    private readonly layoutService = inject(LayoutService);
    private readonly toolbarService = inject(ToolbarActionsService);
    private readonly fieldsConfigService = inject(FieldConfigService);
    private readonly fb = inject(FormBuilder);
    private readonly destroyRef = inject(DestroyRef);

    readonly draftProjectId = signal(
        `draft-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
    );

    readonly isSaving = signal(false);
    private readonly isSaving$ = toObservable(this.isSaving);
    readonly activeStepIndex = signal(0);
    readonly assignedTemplates = signal<TemplateAssignment[]>([]);
    readonly assignedTemplatesCount = computed(() => this.assignedTemplates().length);
    readonly canFinish = computed(() =>
        this.isMetadataValid() && this.assignedTemplatesCount() > 0
    );
    readonly blockingIssueKeys = computed(() => {
        const issues: string[] = [];
        if (!this.isMetadataValid()) {
            issues.push('projects.wizard.requirements.metadata_invalid');
        }
        if (this.assignedTemplatesCount() < 1) {
            issues.push('projects.wizard.requirements.assign_template');
        }
        return issues;
    });
    metadataFieldConfig: FieldConfig[] = [];

    readonly metadataForm = this.fb.nonNullable.group({
        name: ['', [Validators.required, Validators.maxLength(120)]],
        description: ['', [Validators.maxLength(1000)]],
        metadataTags: [''],
    });
    readonly isMetadataValid = signal(this.metadataForm.valid);

    private finalized = false;

    ngOnInit(): void {
        this.metadataFieldConfig = this.buildMetadataFieldConfig();
        this.metadataForm.statusChanges
            .pipe(
                startWith(this.metadataForm.status),
                takeUntilDestroyed(this.destroyRef)
            )
            .subscribe(status => this.isMetadataValid.set(status === 'VALID'));

        this.layoutService.setBreadcrumbs([
            { label: this.translateService.instant('nav.genai-projects'), route: '/genai-projects' },
            { label: this.translateService.instant('projects.wizard.title') },
        ]);
        this.setupToolbarActions();

        this.templateWorkflowsStore
            .selectAssignmentsByProject(this.draftProjectId())
            .pipe(takeUntilDestroyed(this.destroyRef))
            .subscribe(assignments => {
                this.assignedTemplates.set(assignments);
            });
    }

    ngOnDestroy(): void {
        if (!this.finalized) {
            this.clearDraftAssignments();
        }
        this.layoutService.clearBreadcrumbs();
    }

    nextFromMetadata(stepper: MatStepper): void {
        if (this.metadataForm.invalid) {
            this.metadataForm.markAllAsTouched();
            return;
        }
        stepper.next();
    }

    async finish(): Promise<void> {
        if (this.metadataForm.invalid) {
            this.metadataForm.markAllAsTouched();
            return;
        }
        if (this.assignedTemplatesCount() < 1) {
            this.toast.showError(this.translateService.instant('projects.wizard.assign_required'));
            return;
        }
        if (this.isSaving()) {
            return;
        }

        this.isSaving.set(true);
        try {
            const metadataTags = this.metadataForm.controls.metadataTags.value
                .split(',')
                .map(tag => tag.trim())
                .filter(Boolean);

            const createdProject = await firstValueFrom(
                this.projectsService.createProject({
                    name: this.metadataForm.controls.name.value.trim(),
                    description: this.metadataForm.controls.description.value.trim(),
                    metadata: {
                        tags: metadataTags,
                    },
                })
            );

            this.migrateDraftAssignments(createdProject.project_id);
            this.finalized = true;
            this.toast.show(this.translateService.instant('projects.wizard.success'));
            this.router.navigate(['/genai-projects', createdProject.project_id]);
        } catch (error) {
            console.error('Failed to create project:', error);
            this.toast.showError(
                this.translateService.instant('projects.error.failed-to-create')
            );
        } finally {
            this.isSaving.set(false);
        }
    }

    cancel(): void {
        this.clearDraftAssignments();
        this.router.navigate(['/genai-projects']);
    }

    onTitleChange(title: string): void {
        this.layoutService.setTitle(title);
    }

    onStepChange(event: StepperSelectionEvent): void {
        this.activeStepIndex.set(event.selectedIndex);
        if (event.selectedIndex !== 1) {
            return;
        }

        // Ensure ng-draw-flow measures dimensions after step becomes visible.
        setTimeout(() => window.dispatchEvent(new Event('resize')), 50);
        setTimeout(() => window.dispatchEvent(new Event('resize')), 220);
    }

    private setupToolbarActions(): void {
        const cancelAction: ToolbarAction = {
            id: 'cancel-project-creation',
            icon: 'close',
            tooltip: this.translateService.instant('common.cancel'),
            class: 'error',
            variant: 'flat',
            label: this.translateService.instant('common.cancel'),
            disabled$: this.isSaving$,
            click: () => this.cancel(),
        };
        this.toolbarService.scope(this.destroyRef, [cancelAction]);
    }

    private buildMetadataFieldConfig(): FieldConfig[] {
        return [
            this.fieldsConfigService.getTextField({
                name: 'name',
                label: 'projects.wizard.form.name',
                placeholder: 'projects.wizard.form.name_placeholder',
                required: true,
                validators: [Validators.required, Validators.maxLength(120)],
                errorMessages: {
                    required: 'projects.wizard.form.name_required',
                    maxlength: 'form.errors.name.maxlength',
                },
                color: 'primary',
                layoutClass: 'primary',
            }),
            this.fieldsConfigService.getTextAreaField({
                name: 'description',
                label: 'projects.wizard.form.description',
                placeholder: 'projects.wizard.form.description_placeholder',
                rows: 4,
                maxRows: 8,
                autoResize: true,
                maxLength: 1000,
                showCounter: true,
                validators: [Validators.maxLength(1000)],
                errorMessages: {
                    maxlength: 'form.errors.textarea.maxlength',
                },
                color: 'primary',
                layoutClass: 'primary',
            }),
            this.fieldsConfigService.getTextField({
                name: 'metadataTags',
                label: 'projects.wizard.form.metadata',
                placeholder: 'projects.wizard.form.metadata_placeholder',
                helperText: 'projects.wizard.form.metadata_hint',
                color: 'primary',
                layoutClass: 'primary',
            }),
        ];
    }

    private migrateDraftAssignments(targetProjectId: string): void {
        const sourceProjectId = this.draftProjectId();
        const draftAssignments = this.templateWorkflowsStore.getAssignmentsForProject(sourceProjectId);
        if (!draftAssignments.length) return;

        const existingTargetAssignments = this.templateWorkflowsStore.getAssignmentsForProject(targetProjectId);
        const nowIso = new Date().toISOString();

        const migratedAssignments = draftAssignments.map(assignment => ({
            ...assignment,
            projectId: targetProjectId,
            assignedAt: nowIso,
            updatedAt: nowIso,
        }));

        this.templateWorkflowsStore.setAssignments({
            projectId: targetProjectId,
            assignments: [...existingTargetAssignments, ...migratedAssignments],
        });

        this.templateWorkflowsStore.setAssignments({
            projectId: sourceProjectId,
            assignments: [],
        });
    }

    private clearDraftAssignments(): void {
        const sourceProjectId = this.draftProjectId();
        if (!this.templateWorkflowsStore.getAssignmentsForProject(sourceProjectId).length) {
            return;
        }
        this.templateWorkflowsStore.setAssignments({
            projectId: sourceProjectId,
            assignments: [],
        });
    }
}
