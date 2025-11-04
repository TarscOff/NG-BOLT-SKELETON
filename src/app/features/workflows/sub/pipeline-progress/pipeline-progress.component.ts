import { ChangeDetectionStrategy, Component, EventEmitter, Input, Output, computed, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { MatIconModule } from '@angular/material/icon';
import { MatTooltipModule } from '@angular/material/tooltip';
import { MatButtonModule } from '@angular/material/button';
import { TranslateModule } from '@ngx-translate/core';
import { MatMenuModule } from '@angular/material/menu';
import { PipelineWorkflowDTO, PreferredTab, StageNode, Status, WorkflowNode } from '../../templates/utils/workflow.interface';
import { WfCanvasBus } from '../../templates/utils/wf-canvas-bus';
import {  DrawFlowBaseNode } from '@ng-draw-flow/core';

@Component({
  selector: 'app-pipeline-progress',
  standalone: true,
  imports: [CommonModule, MatIconModule, MatTooltipModule, MatButtonModule, TranslateModule, MatMenuModule],
  templateUrl: `./pipeline-progress.component.html`,
  styleUrls: [`./pipeline-progress.component.scss`],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class PipelineProgressComponent extends DrawFlowBaseNode {
  @Input() set workflow(v: PipelineWorkflowDTO | null | undefined) { this._wf.set(v ?? null); }
  @Input() set runState(v: Record<string, Status> | null | undefined) { this._run.set(v ?? {}); }
  @Input() compact = true;
  @Input() applyCancelLocally = true;

  @Output() pipelineCancel = new EventEmitter<void>();
  @Output() stageCancel = new EventEmitter<{ index: number; nodeIds: string[] }>();

  readonly outputPort = {
    id: crypto?.randomUUID?.() ?? `node-result-out-${Math.random().toString(36).slice(2)}`,
    label: 'out',
    type: 'json',
  };

  readonly ports: WorkflowNode['ports'] = {
    inputs: [],
    outputs: [this.outputPort],
  };
  private _wf = signal<PipelineWorkflowDTO | null>(null);
  private _run = signal<Record<string, Status>>({});

  private readonly EXCLUDED = new Set(['result']);
  private canvasBus = inject(WfCanvasBus);

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

  stageOutputId(stageId: string): string {
    return `pipe-${this.nodeId}-out-${stageId}`;
  }

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

  seeDetails(n: StageNode, preferredtab: PreferredTab) {
    const wf = this._wf(); if (!wf) return;
    const node = wf.nodes.find(x => x.id === n.id);

    if (!node) return;
    this.canvasBus.toggleDetailsPanel$.next({
      dto: node.data,
      title: node.data?.label,
      toggleOff: false,
      preferredTab: preferredtab
    });
  }

  previewNode(n: StageNode) {
    const wf = this._wf(); if (!wf) return;
    const node = wf.nodes.find(x => x.id === n.id);

    if (!node) return;
    
    this.canvasBus.togglePreviewPanel$.next({
      dto: node.data,
      title: node.data?.label,
      toggleOff: false,
    });
  }

}