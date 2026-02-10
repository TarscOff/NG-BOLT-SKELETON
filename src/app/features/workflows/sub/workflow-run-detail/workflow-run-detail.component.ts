import { Component, input, output, computed } from '@angular/core';
import { CommonModule } from '@angular/common';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatTooltipModule } from '@angular/material/tooltip';
import { TranslateModule } from '@ngx-translate/core';
import { RunEntry, RunNodePayload } from '../../templates/utils/workflow.interface';

@Component({
    selector: 'app-workflow-run-detail',
    standalone: true,
    imports: [
        CommonModule,
        MatButtonModule,
        MatIconModule,
        MatTooltipModule,
        TranslateModule
    ],
    templateUrl: './workflow-run-detail.component.html',
    styleUrls: ['./workflow-run-detail.component.scss']
})
export class WorkflowRunDetailComponent {
    run = input<RunEntry | null>(null);
    runIndex = input<number>(0);
    
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
    
    formatSources(sources: { from?: string }[] | undefined): string {
        return sources?.map(s => s.from).filter(Boolean).join(', ') || '';
    }
    
    formatTargets(targets: { to?: string }[] | undefined): string {
        return targets?.map(t => t.to).filter(Boolean).join(', ') || '';
    }
}
