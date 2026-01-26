import { CommonModule } from '@angular/common';
import { Component, Inject } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatDialogModule, MatDialogRef, MAT_DIALOG_DATA } from '@angular/material/dialog';
import { MatIconModule } from '@angular/material/icon';
import { MatTooltipModule } from '@angular/material/tooltip';
import { TranslateModule } from '@ngx-translate/core';
import { WorkflowCanvasDfComponent } from '../workflow-canvas.component';
import { ActionDefinitionLite, PaletteType, RunEntry, WorkflowEdge, WorkflowNode } from '../../templates/utils/workflow.interface';
import { ActionFormSpec } from '../../templates/utils/action-forms';

export interface RunViewDialogData {
  run: RunEntry;
  actionsNodes?: Record<string, ActionFormSpec>;
  availableActions?: ActionDefinitionLite[];
  executableNodes?: Set<PaletteType>;
}

@Component({
  selector: 'app-run-view-dialog',
  standalone: true,
  imports: [CommonModule, MatDialogModule, MatButtonModule, MatIconModule, MatTooltipModule, TranslateModule, WorkflowCanvasDfComponent],
  templateUrl: './run-view-dialog.component.html',
  styleUrls: ['./run-view-dialog.component.scss'],
})
export class RunViewDialogComponent {
  readonly run: RunEntry;
  readonly nodes: WorkflowNode[];
  readonly edges: WorkflowEdge[];
  readonly workflowName: string;
  readonly actionsNodes: Record<string, ActionFormSpec>;
  readonly availableActions: ActionDefinitionLite[];
  readonly executableNodes: Set<PaletteType>;

  constructor(
    private dialogRef: MatDialogRef<RunViewDialogComponent>,
    @Inject(MAT_DIALOG_DATA) public data: RunViewDialogData,
  ) {
    this.run = data.run;
    this.nodes = (this.run.workflow?.nodes as WorkflowNode[] | undefined) ?? [];
    this.edges = (this.run.workflow?.edges as WorkflowEdge[] | undefined) ?? [];
    this.workflowName = this.run.workflow?.name ?? 'Workflow run';
    this.actionsNodes = data.actionsNodes ?? {};
    this.availableActions = data.availableActions ?? [];
    this.executableNodes = data.executableNodes ?? new Set<PaletteType>();
  }

  close(): void {
    this.dialogRef.close();
  }
}
