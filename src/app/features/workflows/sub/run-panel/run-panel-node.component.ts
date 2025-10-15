import { Component, inject, OnDestroy, signal } from '@angular/core';
import { DrawFlowBaseNode } from '@ng-draw-flow/core';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { WfCanvasBus } from '../utils/wf-canvas-bus';
import { PipelineProgressComponent } from '../pipeline-progress/pipeline-progress.component';
import { TranslateModule } from '@ngx-translate/core';
import { CommonModule } from '@angular/common';
import { PipelineWorkflowDTO } from '../utils/workflow.interface';
import { Subscription } from 'rxjs';

@Component({
  selector: 'app-wf-run-panel-node',
  standalone: true,
  imports: [CommonModule, MatButtonModule, MatIconModule, TranslateModule, PipelineProgressComponent],
  templateUrl: `run-panel-node.component.html`,
  styleUrls: ["./run-panel-node.component.scss"]
})
export class WfRunPanelNodeComponent extends DrawFlowBaseNode implements OnDestroy {
  private bus = inject(WfCanvasBus);

  pipeline = signal<PipelineWorkflowDTO | null>(null);
  runState = signal<Record<string, 'queued' | 'running' | 'success' | 'error' | 'skipped'>>({});
  graphOk = signal<boolean>(false);
  private subs = new Subscription();

  constructor() {
    super();
    this.subs.add(
      this.bus.pipeline$.subscribe(v => this.pipeline.set(v))
    );
    this.subs.add(
      this.bus.runState$.subscribe(v => this.runState.set(v))
    );
    this.subs.add(
      this.bus.graphValid$.subscribe(ok => this.graphOk.set(!!ok))
    );
  }
  
  ngOnDestroy(): void {
    this.subs.unsubscribe();
  }
  triggerRun(): void { this.bus.runRequested$.next({ nodeId: this.nodeId }); }
  stageCancel(e: { index: number; nodeIds: string[] }) { this.bus.stageCancel$.next(e); }
  pipelineCancel() { this.bus.pipelineCancel$.next(); }
}