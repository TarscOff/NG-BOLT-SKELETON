import { Component, computed, inject, Injector, OnDestroy, OnInit, signal } from '@angular/core';
import { DrawFlowBaseNode } from '@ng-draw-flow/core';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { WfCanvasBus } from '../../templates/utils/wf-canvas-bus';
import { PipelineProgressComponent } from '../pipeline-progress/pipeline-progress.component';
import { TranslateModule } from '@ngx-translate/core';
import { CommonModule } from '@angular/common';
import { RunEntry, RunNodePayload, Status } from '../../templates/utils/workflow.interface';
import { Observable, Subscription } from 'rxjs';
import { MatTooltipModule } from '@angular/material/tooltip';
import { MatDialog, MatDialogRef } from '@angular/material/dialog';
import { Store } from '@ngrx/store';
import { AppSelectors } from '@cadai/pxs-ng-core/store';

@Component({
  selector: 'app-wf-run-panel-node',
  standalone: true,
  imports: [CommonModule, MatButtonModule, MatIconModule, TranslateModule, PipelineProgressComponent, MatTooltipModule],
  templateUrl: `run-panel-node.component.html`,
  styleUrls: ["./run-panel-node.component.scss"]
})
export class WfRunPanelNodeComponent extends DrawFlowBaseNode implements OnInit, OnDestroy {
  private bus = inject(WfCanvasBus);
  private dialog = inject(MatDialog);
  private Injector = inject(Injector);
  store = inject(Store);

  runs = signal<RunEntry[]>([]);
  collapsed = signal<boolean>(false);
  graphOk = signal<boolean>(false);
  fullscreen = signal<boolean>(false);
  selectedRunId = signal<string | null>(null);
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
  private subs = new Subscription();
  public isDark$!: Observable<boolean>;
  private runViewRef?: MatDialogRef<unknown>;

  constructor() {
    super();
    this.subs.add(this.bus.runs$.subscribe(rs => this.runs.set(rs ?? [])));
    this.subs.add(
      this.bus.graphValid$.subscribe(ok => this.graphOk.set(!!ok))
    );
  }
  runViewOpen = signal(false);

  ngOnInit(): void {
    this.isDark$ = this.store.select(AppSelectors.ThemeSelectors.selectIsDark);
  }
  ngOnDestroy(): void {
    this.subs.unsubscribe();
  }
  triggerRun(): void { this.bus.runRequested$.next({ nodeId: this.nodeId }); }
  stageCancel(runId: string, e: { index: number; nodeIds: string[] }) { this.bus.stageCancel$.next({ ...e, runId }); }
  pipelineCancel(runId: string) { this.bus.pipelineCancel$.next({ runId }); }

  selectRun(id: string): void {
    this.selectedRunId.set(id);
  }

  async viewRun(id: string): Promise<void> {
    const run = this.runs().find(r => r.id === id);
    if (!run) return;

    this.runViewRef?.close();

    const { RunViewDialogComponent } = await import('./run-view-dialog.component');

    this.runViewRef = this.dialog.open(RunViewDialogComponent, {
      data: { run },
      injector: this.Injector,
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

  runStatus(r: RunEntry): Status {
    if (r.status) return r.status;
    const states = Object.values(r.state ?? {});
    if (states.some(s => s === 'running')) return 'running';
    if (states.some(s => s === 'error')) return 'error';
    if (states.every(s => s === 'success')) return 'success';
    if (states.every(s => s === 'skipped')) return 'skipped';
    return 'queued';
  }

  nodePayloads(run: RunEntry): { id: string; label: string; payload: RunNodePayload | null; hasData: boolean }[] {
    const nodes = run.workflow?.nodes ?? [];
    const payloads = run.nodeData ?? {};
    return nodes.map((n) => {
      const payload = payloads[n.id] ?? null;
      return {
        id: n.id,
        label: n.data?.label ?? n.id,
        payload,
        hasData: !!payload,
      };
    });
  }

  formatSources(sources: { from?: string }[] | undefined): string {
    return (sources ?? []).map(s => s.from).filter(Boolean).join(', ');
  }

  formatTargets(targets: { to?: string }[] | undefined): string {
    return (targets ?? []).map(t => t.to).filter(Boolean).join(', ');
  }

  closePanel() {
    this.bus.toggleRunPanel$.next({
      anchorNodeId: undefined
    });
  }

  toggleFullscreen(): void {
    this.fullscreen.set(!this.fullscreen());
  }
}
