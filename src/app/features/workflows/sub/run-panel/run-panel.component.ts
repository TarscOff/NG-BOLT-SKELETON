import { Component, input, output, computed, inject, signal, OnInit, OnDestroy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatTooltipModule } from '@angular/material/tooltip';
import { TranslateModule } from '@ngx-translate/core';
import { WorkflowEdge, WorkflowNode } from '@cadai/pxs-ng-core/interfaces';
import { WorkflowDraft, WorkflowExecutionLog } from '@features/workflows/data/workflows.store';
import { RunEntry, Status } from '@features/workflows/templates/utils/workflow.interface';
import { WfCanvasBus } from '@features/workflows/templates/utils/wf-canvas-bus';
import { Observable, Subscription } from 'rxjs';
import { DrawFlowBaseNode } from '@ng-draw-flow/core';
import { Store } from '@ngrx/store';
import { AppSelectors } from '@cadai/pxs-ng-core/store';

@Component({
    selector: 'app-run-panel',
    standalone: true,
    imports: [
        CommonModule,
        MatButtonModule,
        MatIconModule,
        MatTooltipModule,
        TranslateModule
    ],
    templateUrl: './run-panel.component.html',
    styleUrls: ['./run-panel.component.scss']
})
export class RunPanelComponent extends DrawFlowBaseNode implements OnInit, OnDestroy{
    private bus = inject(WfCanvasBus);
    private subs = new Subscription();

    store = inject(Store);
    
    workflow = input<WorkflowDraft | null>(null);
    nodes = input<WorkflowNode[]>([]);
    edges = input<WorkflowEdge[]>([]);
    executionHistory = input<WorkflowExecutionLog[]>([]);    
    
    closePanel = output<void>();
    runSelected = output<{ run: RunEntry; index: number }>();
    
    selectedRunId = signal<string | null>(null);
    runs = signal<RunEntry[]>([]);
    selectedRun = computed(() => {
        const runs = this.runs();
        if (!runs.length) return null;
        const id = this.selectedRunId();
        if (id) {
        const match = runs.find(r => r.id === id);
        if (match) return match;
        }
        return runs[0];
    });
    activeRunId = computed(() => this.selectedRun()?.id ?? null);

    public isDark$!: Observable<boolean>;

    constructor() {
        super();
        this.subs.add(this.bus.runs$.subscribe(rs => this.runs.set(rs ?? [])));
    }

    ngOnInit(): void {
    this.isDark$ = this.store.select(AppSelectors.ThemeSelectors.selectIsDark);
    }

    ngOnDestroy(): void {
        this.subs.unsubscribe();
    }

    onClose(): void {
        this.closePanel.emit();
    }
    
    formatStatus(status: string): string {
        return status?.toLowerCase() || 'unknown';
    }

    selectRun(id: string): void {
        this.selectedRunId.set(id);
        const run = this.runs().find(r => r.id === id);
        if (run) {
            const index = this.runs().length - this.runs().indexOf(run);
            this.runSelected.emit({ run, index });
        }
    }

    runStatus(r: RunEntry): Status {
        if (r.status) return r.status;
        const states = Object.values(r.state ?? {});
        if (states.some(s => s === 'running')) return 'running';
        if (states.some(s => s === 'error')) return 'error';
        if (states.every(s => s === 'success')) return 'success';
        if (states.every(s => s === 'skipped')) return 'skipped';
        return 'queued';
    }
}
