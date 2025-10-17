import { ChangeDetectionStrategy, Component, EventEmitter, Input, Output, computed, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { MatIconModule } from '@angular/material/icon';
import { MatTooltipModule } from '@angular/material/tooltip';
import { MatButtonModule } from '@angular/material/button';
import { TranslateModule } from '@ngx-translate/core';
import { MatMenuModule } from '@angular/material/menu';
import { PipelineWorkflowDTO, StageNode, Status } from '../utils/workflow.interface';

@Component({
  selector: 'app-pipeline-progress',
  standalone: true,
  imports: [CommonModule, MatIconModule, MatTooltipModule, MatButtonModule, TranslateModule, MatMenuModule],
  templateUrl: `./pipeline-progress.component.html`,
  styleUrls: [`./pipeline-progress.component.scss`],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class PipelineProgressComponent {
  @Input() set workflow(v: PipelineWorkflowDTO | null | undefined) { this._wf.set(v ?? null); }
  @Input() set runState(v: Record<string, Status> | null | undefined) { this._run.set(v ?? {}); }
  @Input() compact = true;
  @Input() showLegend = true;
  @Input() applyCancelLocally = true;

  @Output() pipelineCancel = new EventEmitter<void>();
  @Output() stageCancel = new EventEmitter<{ index: number; nodeIds: string[] }>();

  private _wf = signal<PipelineWorkflowDTO | null>(null);
  private _run = signal<Record<string, Status>>({});

  private readonly EXCLUDED = new Set(['input']);

  private isActionable = (t: string) => !this.EXCLUDED.has(t);

  stages = computed<StageNode[][]>(() => {
    const wf = this._wf();
    if (!wf) return [];

    const allNodes = wf.nodes;
    const allEdges = wf.edges;

    const actions = allNodes;
    const actionIds = new Set(actions.map(n => n.id));

    const edges = allEdges.filter(e => actionIds.has(e.source) && actionIds.has(e.target));

    const indeg = new Map<string, number>();
    const adj = new Map<string, string[]>();
    actions.forEach(n => { indeg.set(n.id, 0); adj.set(n.id, []); });
    edges.forEach(e => {
      if (!adj.has(e.source)) adj.set(e.source, []);
      adj.get(e.source)!.push(e.target);
      indeg.set(e.target, (indeg.get(e.target) ?? 0) + 1);
    });

    const labelOf = (id: string) =>
      (allNodes.find(n => n.id === id)?.data?.label ?? allNodes.find(n => n.id === id)?.id ?? id);
    const typeOf = (id: string) => (allNodes.find(n => n.id === id)?.type ?? 'action');

    const layers: StageNode[][] = [];
    let frontier = actions.filter(n => (indeg.get(n.id) ?? 0) === 0).map(n => n.id);
    const remaining = new Set(actions.map(n => n.id));

    while (frontier.length) {
      const layer = frontier.slice();
      layers.push(layer.map(id => ({ id, label: labelOf(id), type: typeOf(id) })));
      frontier = [];
      for (const u of layer) {
        remaining.delete(u);
        for (const v of (adj.get(u) ?? [])) {
          indeg.set(v, (indeg.get(v) ?? 0) - 1);
          if ((indeg.get(v) ?? 0) === 0) frontier.push(v);
        }
      }
    }

    if (remaining.size) {
      layers.push([...remaining].map(id => ({ id, label: labelOf(id), type: typeOf(id) })));
    }

    return layers;
  });

  statusOf = (id: string): Status => {
    const wf = this._wf();
    if (!wf) return 'queued';
    const t = wf.nodes.find(n => n.id === id)?.type ?? 'action';
    if (!this.isActionable(t)) return 'skipped';
    return this._run()[id] ?? 'queued';
  };

  canCancelPipeline = (): boolean => {
    const wf = this._wf(); if (!wf) return false;
    return wf.nodes
      .filter(n => this.isActionable(n.type))
      .some(n => ['queued', 'running'].includes(this.statusOf(n.id)));
  };

  onCancelPipeline(): void {
    this.pipelineCancel.emit();

    if (!this.applyCancelLocally) return;

    const wf = this._wf(); if (!wf) return;
    const next = { ...this._run() };
    for (const n of wf.nodes) {
      if (!this.isActionable(n.type)) continue;
      if (['queued', 'running'].includes(next[n.id] ?? 'queued')) {
        next[n.id] = 'skipped';
      }
    }
    this._run.set(next);
  }

  seeDetails() {
    return;
  }
}