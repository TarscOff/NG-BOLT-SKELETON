import { Component, inject, OnDestroy, OnInit, signal } from '@angular/core';
import { DrawFlowBaseNode } from '@ng-draw-flow/core';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { WfCanvasBus } from '../utils/wf-canvas-bus';
import { PipelineProgressComponent } from '../pipeline-progress/pipeline-progress.component';
import { TranslateModule } from '@ngx-translate/core';
import { CommonModule } from '@angular/common';
import { RunEntry } from '../utils/workflow.interface';
import { Observable, Subscription } from 'rxjs';
import { MatTooltipModule } from '@angular/material/tooltip';
import { Store } from '@ngrx/store';
import { AppSelectors } from '@cadai/pxs-ng-core/store';

@Component({
  selector: 'app-wf-run-panel-node',
  standalone: true,
  imports: [CommonModule, MatButtonModule, MatIconModule, TranslateModule, PipelineProgressComponent, MatTooltipModule],
  templateUrl: `run-panel-node.component.html`,
  styleUrls: ["./run-panel-node.component.scss"]
})
export class WfRunPanelNodeComponent extends DrawFlowBaseNode implements OnInit,OnDestroy {
  private bus = inject(WfCanvasBus);

  runs = signal<RunEntry[]>([]);
  collapsed = signal<boolean>(false);
  graphOk = signal<boolean>(false);
  private subs = new Subscription();
  public isDark$!: Observable<boolean>;
  store = inject(Store);

  constructor() {
    super();
    this.subs.add(this.bus.runs$.subscribe(rs => this.runs.set(rs ?? [])));
    this.subs.add(
      this.bus.graphValid$.subscribe(ok => this.graphOk.set(!!ok))
    );
  }

  ngOnInit(): void {
    this.isDark$ = this.store.select(AppSelectors.ThemeSelectors.selectIsDark);
  }
  ngOnDestroy(): void {
    this.subs.unsubscribe();
  }
  triggerRun(): void { this.bus.runRequested$.next({ nodeId: this.nodeId }); }
  stageCancel(runId: string, e: { index: number; nodeIds: string[] }) { this.bus.stageCancel$.next({ ...e, runId }); }
  pipelineCancel(runId: string) { this.bus.pipelineCancel$.next({ runId }); }

  closePanel() {
    this.bus.toggleRunPanel$.next({
      anchorNodeId: undefined
    });
  }
}