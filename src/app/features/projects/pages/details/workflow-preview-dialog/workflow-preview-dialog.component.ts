import { ChangeDetectionStrategy, Component, computed, inject, OnInit, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { MAT_DIALOG_DATA, MatDialogModule, MatDialogRef } from '@angular/material/dialog';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { TranslateModule } from '@ngx-translate/core';
import { WorkflowDraft, WorkflowsStore } from '@features/workflows/data/workflows.store';
import { WorkflowCanvasDfComponent } from '@features/workflows/sub/workflow-canvas.component';
import { WorkflowsCatalogService } from '@features/workflows/data/workflows-catalog.service';
import { toSignal } from '@angular/core/rxjs-interop';
import { ActionDefinitionLite, PaletteType, WorkflowNode, WorkflowEdge } from '@features/workflows/templates/utils/workflow.interface';
import { ActionFormSpec } from '@features/workflows/templates/utils/action-forms';

export interface WorkflowPreviewDialogData {
    workflow: WorkflowDraft;
}

@Component({
    selector: 'app-workflow-preview-dialog',
    standalone: true,
    imports: [
        CommonModule,
        MatDialogModule,
        MatButtonModule,
        MatIconModule,
        TranslateModule,
        WorkflowCanvasDfComponent,
    ],
    providers: [WorkflowsStore],
    template: `
        <h2 mat-dialog-title class="dialog-header">
            <div class="header-content">
                <div class="workflow-icon-wrapper">
                    <mat-icon class="workflow-icon">hub</mat-icon>
                </div>
                <div class="header-text">
                    <span class="workflow-title">{{ workflow.name }}</span>
                    @if (workflow.description) {
                        <span class="workflow-description">{{ workflow.description }}</span>
                    }
                </div>
            </div>
            <button mat-icon-button mat-dialog-close [attr.aria-label]="'common.close' | translate">
                <mat-icon>close</mat-icon>
            </button>
        </h2>

        <mat-dialog-content class="preview-content">
            <div class="canvas-container">
                <app-workflow-canvas-df
                    [workflowId]="workflow.id"
                    [nodes]="nodes()"
                    [edges]="edges()"
                    [availableActions]="availableActions()"
                    [actionsNodes]="actionsNodes"
                    [executableNodes]="executableNodes()"
                    [disabled]="true"
                    [autoCenter]="true"
                    [workflowName]="workflow.name">
                </app-workflow-canvas-df>
            </div>
        </mat-dialog-content>

        <mat-dialog-actions align="end">
            <button mat-flat-button mat-dialog-close color="primary">
                {{ 'common.close' | translate }}
            </button>
        </mat-dialog-actions>
    `,
    styles: [`
        :host {
            display: block;
        }

        .dialog-header {
            display: flex;
            align-items: center;
            justify-content: space-between;
        }

        .header-content {
            display: flex;
            align-items: center;
            gap: 16px;
            min-width: 0;
            flex: 1;
        }

        .workflow-icon-wrapper {
            display: flex;
            align-items: center;
            justify-content: center;
            width: 48px;
            height: 48px;
            border-radius: 12px;
            background: color-mix(in srgb, var(--mat-primary) 10%, transparent);
            flex-shrink: 0;
        }

        .workflow-icon {
            font-size: 28px;
            width: 28px;
            height: 28px;
            color: var(--mat-primary);
        }

        .header-text {
            display: flex;
            flex-direction: column;
            gap: 4px;
            min-width: 0;
        }

        .workflow-title {
            font-size: 1.25rem;
            font-weight: 500;
            line-height: 1.4;
            overflow: hidden;
            text-overflow: ellipsis;
            white-space: nowrap;
        }

        .workflow-description {
            opacity: 0.7;
            font-size: 0.875rem;
            line-height: 1.4;
            overflow: hidden;
            text-overflow: ellipsis;
            white-space: nowrap;
        }

        .preview-content {
            min-height: 400px;
            height: 60vh;
            max-height: none !important;
            padding: 0 !important;
            overflow: hidden;
        }

        .canvas-container {
            position: relative;
            height: 100%;
            width: 100%;
            background: color-mix(in srgb, var(--mat-primary) 3%, transparent);
        }
    `],
    changeDetection: ChangeDetectionStrategy.OnPush,
})
export class WorkflowPreviewDialogComponent implements OnInit {
    private readonly dialogRef = inject(MatDialogRef<WorkflowPreviewDialogComponent>);
    private readonly data = inject<WorkflowPreviewDialogData>(MAT_DIALOG_DATA);
    private readonly catalogService = inject(WorkflowsCatalogService);

    readonly workflow: WorkflowDraft = this.data.workflow;
    
    // Empty actions nodes for preview (readonly mode doesn't need form specs)
    readonly actionsNodes: Record<string, ActionFormSpec> = {};
    
    // Signals for canvas inputs
    readonly nodes = signal<WorkflowNode[]>([]);
    readonly edges = signal<WorkflowEdge[]>([]);
    readonly availableActions = toSignal(this.catalogService.loadCatalog(), { initialValue: [] as ActionDefinitionLite[] });
    
    // Computed executable node types from available actions
    readonly executableNodes = computed<Set<PaletteType>>(() => {
        const types = this.availableActions().map(a => a.type as PaletteType);
        return new Set<PaletteType>([...types, 'composite' as PaletteType]);
    });

    ngOnInit(): void {
        // Initialize nodes and edges from workflow
        // The autoCenter input on the canvas component will handle centering
        this.nodes.set(this.workflow.nodes ?? []);
        this.edges.set(this.workflow.edges ?? []);
    }
}
