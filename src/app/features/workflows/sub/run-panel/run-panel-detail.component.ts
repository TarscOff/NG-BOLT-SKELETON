import { Component, input, output, computed, inject, Injector, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatTooltipModule } from '@angular/material/tooltip';
import { TranslateModule } from '@ngx-translate/core';
import { MatDialog, MatDialogRef } from '@angular/material/dialog';
import { RunEntry, RunNodePayload } from '../../templates/utils/workflow.interface';

@Component({
    selector: 'app-run-panel-detail',
    standalone: true,
    imports: [
        CommonModule,
        MatButtonModule,
        MatIconModule,
        MatTooltipModule,
        TranslateModule
    ],
    templateUrl: './run-panel-detail.component.html',
    styleUrls: ['./run-panel-detail.component.scss']
})
export class RunPanelDetailComponent {
    private dialog = inject(MatDialog);
    private injector = inject(Injector);
    private runViewRef?: MatDialogRef<unknown>;
    
    run = input<RunEntry | null>(null);
    runIndex = input<number>(0);
    runViewOpen = signal(false);
    
    back = output<void>();
    stageCancel = output<{ index: number; nodeIds: string[] }>();
    pipelineCancel = output<void>();
    
    nodePayloads = computed(() => {
        const r = this.run();
        if (!r?.workflow?.nodes) return [];
        
        return r.workflow.nodes.map(node => ({
            id: node.id,
            label: node.data?.label || node.id,
            hasData: !!r.nodeData?.[node.id],
            payload: r.nodeData?.[node.id] as RunNodePayload | undefined
        }));
    });
    
    onBack(): void {
        this.back.emit();
    }
    
    onStageCancel(event: { index: number; nodeIds: string[] }): void {
        this.stageCancel.emit(event);
    }
    
    onPipelineCancel(): void {
        this.pipelineCancel.emit();
    }
    
    async viewRun(id: string): Promise<void> {
        const run = this.run();
        if (!run || run.id !== id) return;

        this.runViewRef?.close();

        const { RunViewDialogComponent } = await import('./run-view-dialog.component');

        this.runViewOpen.set(true);
        this.runViewRef = this.dialog.open(RunViewDialogComponent, {
            data: { run },
            injector: this.injector,
            panelClass: ['wf-run-view-dialog', 'accent'],
            width: '90vw',
            height: '90vh',
            maxWidth: '98vw',
            maxHeight: '98vh',
        });

        this.runViewRef.afterClosed().subscribe(() => {
            this.runViewRef = undefined;
            this.runViewOpen.set(false);
        });
    }
    
    formatSources(sources: { from?: string }[] | undefined): string {
        return sources?.map(s => s.from).filter(Boolean).join(', ') || '';
    }
    
    formatTargets(targets: { to?: string }[] | undefined): string {
        return targets?.map(t => t.to).filter(Boolean).join(', ') || '';
    }
}
