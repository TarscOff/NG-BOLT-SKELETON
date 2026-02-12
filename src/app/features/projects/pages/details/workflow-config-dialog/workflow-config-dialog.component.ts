import { Component, Inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormBuilder, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { MAT_DIALOG_DATA, MatDialogModule, MatDialogRef } from '@angular/material/dialog';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { TranslateModule, TranslateService } from '@ngx-translate/core';
import { DynamicFormComponent } from '@cadai/pxs-ng-core/shared';
import { FieldConfigService } from '@cadai/pxs-ng-core/services';
import { FieldConfig } from '@cadai/pxs-ng-core/interfaces';
import { WorkflowOutputScope } from '../../../interfaces/project.model';

export interface WorkflowConfigDialogData {
    workflowId: string;
    workflowName: string;
    workflowDescription?: string;
    outputScope?: WorkflowOutputScope;
    isEdit?: boolean;
}

export interface WorkflowConfigDialogResult {
    workflowId: string;
    workflowName: string;
    workflowDescription?: string;
    outputScope: WorkflowOutputScope;
}

@Component({
    selector: 'app-workflow-config-dialog',
    standalone: true,
    imports: [
        CommonModule,
        ReactiveFormsModule,
        MatDialogModule,
        MatButtonModule,
        MatIconModule,
        TranslateModule,
        DynamicFormComponent,
    ],
    template: `
        <h2 mat-dialog-title>
            <mat-icon class="dialog-icon">settings</mat-icon>
            {{ (data.isEdit ? 'projects.workflows.config.edit-title' : 'projects.workflows.config.title') | translate }}
        </h2>

        <mat-dialog-content>
            <div class="workflow-info">
                <div class="workflow-header">
                    <mat-icon class="workflow-icon">hub</mat-icon>
                    <div class="workflow-details">
                        <h3>{{ data.workflowName }}</h3>
                        @if (data.workflowDescription) {
                            <p class="workflow-description">{{ data.workflowDescription }}</p>
                        }
                    </div>
                </div>
            </div>

            <div class="config-section">
                <h4>{{ 'projects.workflows.config.output-scope-title' | translate }}</h4>
                <p class="section-description">{{ 'projects.workflows.config.output-scope-description' | translate }}</p>
                
                <form [formGroup]="form">
                    <app-dynamic-form [form]="form" [config]="config"></app-dynamic-form>
                </form>
            </div>

            <div class="scope-preview">
                @switch (form.get('outputScope')?.value) {
                    @case ('project') {
                        <div class="scope-info project-scope">
                            <mat-icon>folder</mat-icon>
                            <div>
                                <strong>{{ 'projects.workflows.config.scope.project.label' | translate }}</strong>
                                <p>{{ 'projects.workflows.config.scope.project.description' | translate }}</p>
                            </div>
                        </div>
                    }
                    @case ('session') {
                        <div class="scope-info session-scope">
                            <mat-icon>view_timeline</mat-icon>
                            <div>
                                <strong>{{ 'projects.workflows.config.scope.session.label' | translate }}</strong>
                                <p>{{ 'projects.workflows.config.scope.session.description' | translate }}</p>
                            </div>
                        </div>
                    }
                    @case ('both') {
                        <div class="scope-info both-scope">
                            <mat-icon>all_inclusive</mat-icon>
                            <div>
                                <strong>{{ 'projects.workflows.config.scope.both.label' | translate }}</strong>
                                <p>{{ 'projects.workflows.config.scope.both.description' | translate }}</p>
                            </div>
                        </div>
                    }
                }
            </div>
        </mat-dialog-content>

        <mat-dialog-actions align="end">
            <button mat-button mat-dialog-close>{{ 'common.cancel' | translate }}</button>
            <button mat-flat-button color="primary" [disabled]="form.invalid" (click)="submit()">
                {{ (data.isEdit ? 'common.update' : 'projects.workflows.config.assign') | translate }}
            </button>
        </mat-dialog-actions>
    `,
    styles: [`
        :host {
            display: block;
        }

        .dialog-icon {
            vertical-align: middle;
            margin-right: 0.5rem;
        }

        .workflow-info {
            background: color-mix(in srgb, var(--mat-primary) 8%, transparent);
            border-radius: 12px;
            padding: 1rem;
            margin-bottom: 1.5rem;
        }

        .workflow-header {
            display: flex;
            gap: 1rem;
            align-items: flex-start;
        }

        .workflow-icon {
            font-size: 2rem;
            width: 2rem;
            height: 2rem;
            color: var(--mat-primary);
        }

        .workflow-details {
            flex: 1;
            
            h3 {
                margin: 0 0 0.25rem;
                font-size: 1.125rem;
                font-weight: 600;
            }

            .workflow-description {
                margin: 0;
                opacity: 0.7;
                font-size: 0.875rem;
            }
        }

        .config-section {
            margin-bottom: 1.5rem;

            h4 {
                margin: 0 0 0.25rem;
                font-size: 1rem;
                font-weight: 600;
            }

            .section-description {
                margin: 0 0 1rem;
                opacity: 0.7;
                font-size: 0.875rem;
            }
        }

        .scope-preview {
            background: color-mix(in srgb, var(--mat-primary) 5%, transparent);
            border-radius: 8px;
            padding: 1rem;
        }

        .scope-info {
            display: flex;
            gap: 1rem;
            align-items: flex-start;

            mat-icon {
                font-size: 1.5rem;
                width: 1.5rem;
                height: 1.5rem;
            }

            strong {
                display: block;
                margin-bottom: 0.25rem;
            }

            p {
                margin: 0;
                opacity: 0.7;
                font-size: 0.875rem;
            }
        }

        .project-scope mat-icon,
        .session-scope mat-icon {
            color: var(--mat-primary);
        }

        .both-scope mat-icon {
            color: var(--mat-success, #4caf50);
        }
    `]
})
export class WorkflowConfigDialogComponent {
    config!: FieldConfig[];
    form!: FormGroup;

    constructor(
        private fb: FormBuilder,
        private dialogRef: MatDialogRef<WorkflowConfigDialogComponent>,
        private fields: FieldConfigService,
        private translate: TranslateService,
        @Inject(MAT_DIALOG_DATA) public data: WorkflowConfigDialogData,
    ) {
        this.config = [
            this.fields.getDropdownField({
                name: 'outputScope',
                label: this.translate.instant('projects.workflows.config.output-scope.label'),
                required: true,
                validators: [Validators.required],
                options: [
                    { value: 'project', label: this.translate.instant('projects.workflows.config.scope.project.label') },
                    { value: 'session', label: this.translate.instant('projects.workflows.config.scope.session.label') },
                    { value: 'both', label: this.translate.instant('projects.workflows.config.scope.both.label') },
                ],
                color: 'primary',
                layoutClass: 'primary',
                helperText: this.translate.instant('projects.workflows.config.output-scope.helper'),
            }),
        ];

        this.form = this.fb.group({
            outputScope: [this.data.outputScope ?? 'session', [Validators.required]],
        });
    }

    submit(): void {
        if (this.form.invalid) {
            this.form.markAllAsTouched();
            return;
        }

        const result: WorkflowConfigDialogResult = {
            workflowId: this.data.workflowId,
            workflowName: this.data.workflowName,
            workflowDescription: this.data.workflowDescription,
            outputScope: this.form.value.outputScope,
        };

        this.dialogRef.close(result);
    }
}
