
import { CdkDragDrop, DragDropModule } from '@angular/cdk/drag-drop';
import { CommonModule } from '@angular/common';
import {
  ChangeDetectionStrategy,
  Component,
  computed,
  DestroyRef,
  ElementRef,
  EventEmitter,
  HostListener,
  inject,
  Input,
  OnDestroy,
  OnInit,
  Output,
  signal,
  ViewChild,
} from '@angular/core';
import { FormBuilder, FormGroup, FormsModule, ReactiveFormsModule, Validators } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import {
  DfArrowhead,
  DfConnectionPoint,
  DfConnectionType,
  DfDataConnection,
  DfDataInitialNode,
  DfDataModel,
  DfDataNode,
  DfEvent,
  dfPanZoomOptionsProvider,
  NgDrawFlowComponent,
  provideNgDrawFlowConfigs,
} from '@ng-draw-flow/core';
import { TranslateModule, TranslateService } from '@ngx-translate/core';

import {
  ActionDefinitionLite,
  Binary,
  BinaryPlaceholder,
  EXEC_TYPES,
  InspectorActionType,
  NodeParamsChangedEvent,
  PaletteType,
  PipelineWorkflowDTO,
  ReplaceBinary,
  ReservedKeys,
  RunEntry,
  Sanitized,
  SimCtx,
  Status,
  WithFiles,
  WithParams,
  WorkflowEdge,
  WorkflowNode,
  WorkflowNodeDataBase,
} from './utils/workflow.interface';
import { FieldConfigService, ToastService, ToolbarActionsService } from '@cadai/pxs-ng-core/services';
import { MatTooltipModule } from '@angular/material/tooltip';

import { WfNodeComponent } from './action-node/action-node.component';
import { DynamicFormComponent } from '@cadai/pxs-ng-core/shared';
import { WfCanvasBus } from './utils/wf-canvas-bus';
import { MatIconModule } from '@angular/material/icon';
import { WfRunPanelNodeComponent } from './run-panel/run-panel-node.component';
import { FieldConfig, ToolbarAction, WorkflowNodeDataBaseParams } from '@cadai/pxs-ng-core/interfaces';
import { map, Subscription } from 'rxjs';
import { OverlayModule } from '@angular/cdk/overlay';
import { MatMenuModule } from '@angular/material/menu';
import { ActionFormSpec } from './utils/action-forms';

@Component({
  selector: 'app-workflow-canvas-df',
  standalone: true,
  imports: [
    CommonModule,
    FormsModule,
    ReactiveFormsModule,
    DragDropModule,
    MatButtonModule,
    NgDrawFlowComponent,
    DynamicFormComponent,
    TranslateModule,
    MatTooltipModule,
    MatIconModule,
    OverlayModule,
    MatMenuModule
  ],
  providers: [
    dfPanZoomOptionsProvider({
      leftPosition: 350,
    }),
    provideNgDrawFlowConfigs({
      nodes: {
        input: WfNodeComponent,
        result: WfNodeComponent,
        'chat': WfNodeComponent,
        compare: WfNodeComponent,
        summarize: WfNodeComponent,
        extract: WfNodeComponent,
        jira: WfNodeComponent,
        'run-panel': WfRunPanelNodeComponent,
      },
      connection: {
        type: DfConnectionType.SmoothStep,
        arrowhead: { type: DfArrowhead.None, height: 15, width: 15 },
        curvature: 10,
      }
    }),
  ],
  templateUrl: './workflow-canvas-df.component.html',
  styleUrls: ['./workflow-canvas-df.component.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class WorkflowCanvasDfComponent implements OnInit, OnDestroy {
  @ViewChild('flow', { static: true }) flow!: NgDrawFlowComponent;
  @ViewChild('flowEl', { static: true, read: ElementRef })
  private flowElementRef!: ElementRef<HTMLElement>;

  private suppressExternal = false;
  translate = inject(TranslateService);

  @Input({ required: true })
  set nodes(value: WorkflowNode[] | null | undefined) {

    if (this.suppressExternal) return;

    const incoming = (value ?? []).filter(n => this.isExecutableNode(n));

    // ignore accidental clears
    if (incoming.length === 0 && this.execNodes().length > 0) return;

    // if parent is sending exactly what we already have (topology-wise), ignore
    const sigNew = this.makeTopoSig(incoming, this._edges());
    if (sigNew === this.lastIncomingSig || sigNew === this.lastTopoSig) return;
    this.lastIncomingSig = sigNew;

    const current = this.execNodes();
    const currentById = new Map(current.map(n => [n.id, n]));
    const incomingById = new Map(incoming.map(n => [n.id, n]));

    // initial load: accept all
    if (current.length === 0) {
      const mergedExec = incoming.map(v => {
        const existing = currentById.get(v.id);
        return existing ? { ...v, x: existing.x, y: existing.y } : v;
      });
      this.execNodes.set(mergedExec);
      this.publishGraphValidity();
      return;
    }

    // merge-only: update existing IDs, do NOT add new ones from parent unless not racing a local change
    const mergedExec = current.map(n => {
      const inc = incomingById.get(n.id);
      if (!inc) return n;
      return { ...inc, x: n.x, y: n.y }; // keep our layout
    });

    const justChangedLocally = Date.now() - this.lastLocalChangeAt < 300;
    if (!justChangedLocally) {
      for (const [id, inc] of incomingById) {
        if (!currentById.has(id)) mergedExec.push({ ...inc });
      }
    }

    this.execNodes.set(mergedExec);
    this.publishGraphValidity();
  }

  @Input({ required: true })
  set edges(value: WorkflowEdge[] | null | undefined) {
    if (this.suppressExternal) return;
    const incoming = value ?? [];

    if (incoming.length === 0 && this._edges().length > 0) return;
    const cur = this._edges();
    if (incoming.length === cur.length && incoming.every((e, i) => e.id === cur[i].id)) return;

    this._edges.set(incoming);

    // recompute UI flags using *all* nodes:
    const nodesWithUi = this.withUiConnectivity(this.allNodes(), incoming);
    const nextExec = nodesWithUi.filter(n => this.isExecutableNode(n));
    const nextUi = nodesWithUi.filter(n => !this.isExecutableNode(n));
    this.execNodes.set(nextExec);
    this.uiNodes.set(nextUi);

    this.emitConnectivity(nodesWithUi, incoming);
    this.publishGraphValidity();
  }

  @Input({ required: true }) actionsNodes!: Record<string, ActionFormSpec>;
  @Input({ required: true })
  set executableNodes(value: Set<PaletteType>) {
    this.executableNodesSig.set(value)
  };

  @Input() set disabled(value: boolean) {
    this.disabledSig.set(!!value);
  }
  @Input() set availableActions(value: ActionDefinitionLite[]) {
    this.availableActionsSig.set(value ?? []);
    this.rebuildCompatibilityIndex();
  }

  @Output() OnCanvasChange = new EventEmitter<{ nodes: WorkflowNode[]; edges: WorkflowEdge[] }>();

  disabledSig = signal<boolean>(false);
  availableActionsSig = signal<ActionDefinitionLite[]>([]);
  executableNodesSig = signal<Set<PaletteType>>(new Set());
  isPaletteDragging = signal<boolean>(false);
  showPalette = signal(false);

  private execNodes = signal<WorkflowNode[]>([]);
  private uiNodes = signal<WorkflowNode[]>([]);
  private allNodes = computed(() => [...this.execNodes(), ...this.uiNodes()]);

  private _edges = signal<WorkflowEdge[]>([]);
  private zoom = signal<number>(1);

  public form!: FormGroup;
  public fieldConfig: FieldConfig[] = [];
  private toolbar = inject(ToolbarActionsService);
  private destroyRef = inject(DestroyRef);

  selectedNodeId = signal<string | null>(null);

  pipelineDto = signal<PipelineWorkflowDTO | null>(null);
  runState = signal<Record<string,Status>>({});

  private sims = new Map<string, SimCtx>();
  private currentRunId: string | null = null;
  runs = signal<RunEntry[]>([]);

  private lastIncomingSig = '';
  private lastTopoSig = '';
  private lastLocalChangeAt = 0;
  private subs = new Subscription();

  @HostListener('document:keydown.escape')
  onEsc(): void {
    this.setSelectedNode(null);
  }

  dfModel = computed<DfDataModel>(() => {
    const nodes = this.allNodes() ?? [];
    const edges = this._edges() ?? [];
    const outDeg = new Map<string, number>(), inDeg = new Map<string, number>();
    
    nodes.forEach(n => { outDeg.set(n.id, 0); inDeg.set(n.id, 0); });
    edges.forEach(e => {
      outDeg.set(e.source, (outDeg.get(e.source) ?? 0) + 1);
      inDeg.set(e.target, (inDeg.get(e.target) ?? 0) + 1);
    });

    const nodesArr: DfDataInitialNode[] = nodes.map((n) => {
      const ports = n.ports ?? this.defaultPortsFor(n.type);

      const needsIn = (ports.inputs?.length ?? 0) > 0 && n.type !== 'input';
      const needsOut = (ports.outputs?.length ?? 0) > 0 && n.type !== 'result';
      const hasIn = (inDeg.get(n.id) ?? 0) > 0;
      const hasOut = (outDeg.get(n.id) ?? 0) > 0;

      const paramsUi = n.data?.params?.ui ?? {};

      const dataForDf = { ...n.data, actionsNodes: this.actionsNodes };

      return {
        id: n.id,
        data: {
          type: n.type,
          ...dataForDf,
          ui: paramsUi,
          ports,
          __missingIn: needsIn && !hasIn,
          __missingOut: needsOut && !hasOut,
        },
        position: { x: n.x, y: n.y },
        /*  startNode: n.type === 'input',
         endNode: n.type === 'result', */
      };
    });

    const conns: DfDataConnection[] = edges.map((e) => ({
      source: { nodeId: e.source, connectorType: DfConnectionPoint.Output, connectorId: e.sourcePort },
      target: { nodeId: e.target, connectorType: DfConnectionPoint.Input, connectorId: e.targetPort },
      label: { content: e.label }
    }));

    return { nodes: nodesArr, connections: conns };
  });
  private fileCache = new Map<string, Record<string, Binary | Binary[]>>();

  private formInvalidByNode = new Map<string, { invalid: boolean; fields?: string[] }>();

  quickAddOpen = false;
  quickAddCtx: { sourceNodeId: string; sourcePortId: string; sourcePortType?: string; anchorRect?: DOMRect } | null = null;
  quickAddItems: { type: string; icon?: string; label: string }[] = [];

  private idSeq = 0;
  private genId(prefix = 'n') { return `${prefix}_${Date.now().toString(36)}_${++this.idSeq}`; }

  private compatibleIndex = new Map<string, { type: string; icon?: string; label: string }[]>();
  qaClient: { x: number; y: number } | null = null;

  existingTargets: { id: string; label: string; icon: string; type: PaletteType }[] = [];

  constructor(
    private bus: WfCanvasBus,
    private readonly fb: FormBuilder,
    private readonly fields: FieldConfigService,
    private toast: ToastService,
  ) {
    this.subs.add(
      this.bus.nodeParamsChanged$.subscribe((e) =>
        this.handleNodeParamsChanged(e as NodeParamsChangedEvent<WithFiles>)
      )
    );
    this.subs.add(
      this.bus.nodeToggleExpand$.subscribe(({ nodeId, expanded }) => {
        this.updateNodeById(
          nodeId,
          (n) => {
            return {
              ...n,
              data: {
                ...n.data,
                // write to params.ui.expanded (that's what the node reads)
                params: {
                  ...(n.data?.params ?? {}),
                  ui: {
                    ...(n.data?.params?.ui ?? {}),
                    expanded,
                  },
                },
              },
            }
          },
          { emitToParentIfExec: false }
        );
      })
    );
    this.subs.add(
      this.bus.runRequested$.subscribe(() => this.startPipelineFromCurrent())
    );
    this.subs.add(
      this.bus.toggleRunPanel$.subscribe(({ anchorNodeId }) => this.toggleRunPanel(anchorNodeId))
    );
    this.subs.add(
      this.bus.stageCancel$.subscribe(e => this.handleStageCancel(e))
    );
    this.subs.add(
      this.bus.pipelineCancel$.subscribe(() => this.handlePipelineCancel())
    );
    this.subs.add(
      this.bus.nodeFormStatus$.subscribe(({ nodeId, invalid, invalidFields }) => {
        this.formInvalidByNode.set(nodeId, { invalid, fields: invalidFields });
        // (optional) reflect a UI flag back into the node model
        this.bus.nodeFlagsPatch$.next({ nodeId, flags: { __formInvalid: invalid } });
        this.publishGraphValidity();
      })
    );
    this.subs.add(
      this.bus.openQuickAdd$.subscribe(({ nodeId, portId, portType, anchorEl }) => {
        const r = anchorEl.getBoundingClientRect();
        this.qaClient = { x: r.right + 8, y: r.top + r.height / 2 };

        this.quickAddCtx = {
          sourceNodeId: nodeId,
          sourcePortId: portId,
          sourcePortType: portType,
          anchorRect: anchorEl.getBoundingClientRect(),
        };
        this.quickAddItems = this.compatibleFor(portType);
        this.buildExistingTargets(nodeId, portType);
        this.quickAddOpen = true;
      })
    );
    this.subs.add(
      this.bus.quickAddPick$.subscribe(pick => this.handleQuickAddPick(pick))
    );

    const saveWorkflow: ToolbarAction = {
      id: 'save_workflow',
      icon: 'save',
      tooltip: 'save_workflow',
      click: () => this.submit(),
      variant: 'flat',
      label: 'SAVE',
      class: 'primary',
      disabled$: this.bus.graphValid$.pipe(map((c) => !c))
    };
    const draftWorkflow: ToolbarAction = {
      id: 'draft_workflow',
      icon: 'edit_document',
      tooltip: 'draft_workflow',
      click: () => this.submit(),
      variant: 'flat',
      label: 'Draft',
      class: 'accent'
    };
    const publishWorkflow: ToolbarAction = {
      id: 'publish_workflow',
      icon: 'publish',
      tooltip: 'publish_workflow',
      click: () => this.submit(),
      variant: 'flat',
      label: 'Publish',
      class: 'success',
      disabled$: this.bus.graphValid$.pipe(map((c) => !c))
    };
    this.toolbar.scope(this.destroyRef, [saveWorkflow, draftWorkflow, publishWorkflow]);
  }

  ngOnInit(): void {
    this.form = this.fb.group({});
    this.fieldConfig = [
      this.fields.getTextField({
        name: 'workflowName',
        label: 'form.labels.name',
        placeholder: 'form.placeholders.name',
        validators: [Validators.required, Validators.minLength(2), Validators.maxLength(80)],
        errorMessages: {
          required: 'form.errors.input.required',
          minlength: 'form.errors.input.minlength',
          maxlength: 'form.errors.input.maxlength',
        },
        color: 'primary',
        layoutClass: 'primary',
        helperText: ''
      }),
    ];

    queueMicrotask(() => this.publishGraphValidity());
  }

  ngOnDestroy(): void {
    this.subs.unsubscribe();
  }

  private buildExistingTargets(sourceNodeId: string, sourcePortType?: string) {
    const t = (x?: string) => x ?? 'any';

    this.existingTargets = this.execNodes()
      .filter(n => n.id !== sourceNodeId)
      .filter(n => (n.ports?.inputs?.length ?? 0) > 0)
      .filter(n => n.type !== "result")
      .filter(n => {
        const ins = n.ports?.inputs ?? [];
        return ins.length === 0 || ins.some(ip => t(ip.type) === t(sourcePortType) || t(ip.type) === 'any' || t(sourcePortType) === 'any');
      })
      .map(n => ({
        id: n.id,
        type: n.type as PaletteType,
        label: (n.data?.label as string) || this.humanLabelFor(n.type as PaletteType),
        icon: n.data?.params?.['icon'] || ""
      }));
  }

  private handleNodeParamsChanged = <T extends WithFiles | undefined>(
    { nodeId, params }: NodeParamsChangedEvent<T>
  ): void => {
    let safeParams: Sanitized<T>;
    if (params === undefined) {
      safeParams = undefined as Sanitized<T>;
    } else {
      const p = params as NonNullable<T>;
      const sanitized = this.extractFiles(nodeId, p) as ReplaceBinary<NonNullable<T>>;
      safeParams = sanitized as Sanitized<T>;
    }

    this.updateNodeById(
      nodeId,
      (n) => {
        const prev = (n.data ?? {}) as WithParams<unknown>;
        const merged = {
          ...(prev.params ?? {}),
          ...(safeParams as object ?? {})
        };
        const next: WithParams<typeof merged> = { ...prev, params: merged };
        return { ...n, data: next as WorkflowNodeDataBase };
      },
      { emitToParentIfExec: true }
    );
  };

  private toggleRunPanel(anchorNodeId?: string) {
    const RUN_PANEL_ID = 'run-panel-node';
    const ui = this.uiNodes();
    const idx = ui.findIndex(n => n.id === RUN_PANEL_ID || n.type === 'run-panel');

    if (idx >= 0) {
      const nextUi = ui.slice();
      nextUi.splice(idx, 1);
      this.uiNodes.set(nextUi);

      const withUi = this.withUiConnectivity(this.allNodes(), this._edges());
      this.execNodes.set(withUi.filter(n => this.isExecutableNode(n)));
      this.uiNodes.set(withUi.filter(n => !this.isExecutableNode(n)));
      return;
    }

    const all = this.allNodes();
    const anchor = all.find(n => n.id === anchorNodeId) || all.find(n => n.type === 'result');
    const rp: WorkflowNode = {
      id: RUN_PANEL_ID,
      type: 'run-panel',
      x: anchor?.x ?? 460, y: anchor?.y ? anchor.y + 160 : 100,
      data: { label: 'Run' },
      ports: { inputs: [], outputs: [] },
    };

    this.uiNodes.set([...ui, rp]);

    const withUi = this.withUiConnectivity(this.allNodes(), this._edges());
    this.execNodes.set(withUi.filter(n => this.isExecutableNode(n)));
    this.uiNodes.set(withUi.filter(n => !this.isExecutableNode(n)));
  }

  private humanLabelFor(t: PaletteType): string {
    if (t === 'input' || t === 'result') return t.charAt(0).toUpperCase() + t.slice(1);
    return t.toLocaleLowerCase();
  }

  private publishGraphValidity(): void {
    const nodes = this.execNodes();
    const edges = this._edges();
    const err = this.validateGraph(nodes, edges);
    this.bus.graphValid$.next(!err);
  }

  private validateGraph(
    nodesArg: WorkflowNode[] | null | undefined,
    edgesArg: WorkflowEdge[] | null | undefined
  ): string | null {
    const nodes = (nodesArg ?? []).filter(n => this.isExecutableNode(n));
    const edges = (edgesArg ?? []).filter(e =>
      nodes.some(n => n.id === e.source) && nodes.some(n => n.id === e.target)
    );

    const inputs = nodes.filter(n => n.type === 'input');
    const results = nodes.filter(n => n.type === 'result');
    if (inputs.length !== 1) return this.translate.instant('workflow.errors.exactlyOneInput');
    if (results.length !== 1) return this.translate.instant('workflow.errors.exactlyOneResult');

    const outMap = new Map<string, WorkflowEdge[]>(), inMap = new Map<string, WorkflowEdge[]>();
    for (const n of nodes) { outMap.set(n.id, []); inMap.set(n.id, []); }
    for (const e of edges) { outMap.get(e.source)!.push(e); inMap.get(e.target)!.push(e); }

    for (const n of nodes) {
      const ports = n.ports ?? this.defaultPortsFor(n.type);
      const hasIn = (inMap.get(n.id)?.length ?? 0) > 0;
      const hasOut = (outMap.get(n.id)?.length ?? 0) > 0;
      const needsIn = (ports.inputs?.length ?? 0) > 0 && n.type !== 'input';
      const needsOut = (ports.outputs?.length ?? 0) > 0 && n.type !== 'result';
      if (needsIn && !hasIn) return this.translate.instant('workflow.errors.nodeMissingInput', { id: n.data?.label ?? n.id });
      if (needsOut && !hasOut) return this.translate.instant('workflow.errors.nodeMissingOutput', { id: n.data?.label ?? n.id });
    }

    for (const n of nodes) {
      const fv = this.formInvalidByNode.get(n.id);
      if (fv?.invalid) {
        return this.translate.instant('workflow.errors.invalid_fields', {
          id: n.data?.label ?? n.id,
        });
      }
    }

    const indeg = new Map<string, number>();
    nodes.forEach(n => indeg.set(n.id, 0));
    edges.forEach(e => indeg.set(e.target, (indeg.get(e.target) ?? 0) + 1));
    const q: string[] = []; indeg.forEach((d, id) => { if (d === 0) q.push(id); });
    let visited = 0;
    while (q.length) {
      const id = q.shift()!;
      visited++;
      for (const e of outMap.get(id) ?? []) {
        const t = e.target;
        indeg.set(t, (indeg.get(t) ?? 0) - 1);
        if ((indeg.get(t) ?? 0) === 0) q.push(t);
      }
    }
    if (visited !== nodes.length) return this.translate.instant('workflow.errors.cycleDetected');

    return null;
  }

  private normalize(nodes: WorkflowNode[], edges: WorkflowEdge[]) {
    const cleanNodes: WorkflowNode[] = nodes.map(n => ({
      id: n.id,
      type: n.type,
      x: Math.round(n.x ?? 0),
      y: Math.round(n.y ?? 0),
      data: {
        label: n.data?.label ?? '',
        aiType: n.data?.aiType,
        params: n.data?.params ?? {},
        ui: undefined,
      },
      ports: n.ports ?? this.defaultPortsFor(n.type),
    }));

    const cleanEdges = edges.map(e => ({
      id: e.id,
      source: e.source,
      target: e.target,
      sourcePort: e.sourcePort,
      targetPort: e.targetPort,
      label: e.label ?? '',
    }));

    return { cleanNodes, cleanEdges };
  }

  private withUiConnectivity(nodes: WorkflowNode[], edges: WorkflowEdge[]) {
    const outMap = new Map<string, number>(), inMap = new Map<string, number>();
    nodes.forEach(n => { outMap.set(n.id, 0); inMap.set(n.id, 0); });
    edges.forEach(e => {
      outMap.set(e.source, (outMap.get(e.source) ?? 0) + 1);
      inMap.set(e.target, (inMap.get(e.target) ?? 0) + 1);
    });

    return nodes.map(n => {
      const ports = n.ports ?? this.defaultPortsFor(n.type);
      const needsIn = (ports.inputs?.length ?? 0) > 0 && n.type !== 'input';
      const needsOut = (ports.outputs?.length ?? 0) > 0 && n.type !== 'result';
      const hasIn = (inMap.get(n.id) ?? 0) > 0;
      const hasOut = (outMap.get(n.id) ?? 0) > 0;

      const nextParams = {
        ...(n.data?.params ?? {}),
        __missingIn: needsIn && !hasIn,
        __missingOut: needsOut && !hasOut,
      };

      return { ...n, data: { ...n.data, params: nextParams } } as WorkflowNode;
    });
  }

  onScale(z: number): void {
    this.zoom.set(z);
  }

  onDrop(ev: CdkDragDrop<unknown, unknown, unknown>): void {
    if (this.disabledSig()) return;
    const action = ev.item?.data as ActionDefinitionLite | undefined;
    if (!action) return;
    const client: MouseEvent = ev.event as MouseEvent;
    const { x, y } = client
    const id = crypto?.randomUUID?.() ?? 'node-' + Math.random().toString(36).slice(2, 9);
    const node: WorkflowNode = {
      id,
      type: action.type,
      x, y,
      data: {
        label: this.humanLabelFor(action.type),
        aiType: action.type as InspectorActionType,
        params: { ...action.params, ui: { expanded: true } },
      },
      ports: this.defaultPortsFor(action.type),
    };

    if (action.type === 'run-panel') {
      if (this.uiNodes().some(n => n.type === 'run-panel')) return;
      const uiNext = [...this.uiNodes(), node];
      this.uiNodes.set(uiNext);
      return;
    }

    const execNext = [...this.execNodes(), node];
    const withUi = this.withUiConnectivity([...execNext, ...this.uiNodes()], this._edges());
    this.execNodes.set(execNext);

    this.suppressExternal = true;
    this.OnCanvasChange.emit({ nodes: execNext, edges: this._edges() });
    queueMicrotask(() => (this.suppressExternal = false));

    this.emitConnectivity(withUi, this._edges());

    this.publishGraphValidity();
  }

  onModelChange = (m: DfDataModel): void => {
    const prevExec = this.execNodes();
    const prevUi = this.uiNodes();
    const noNodes = !m?.nodes || m.nodes.length === 0;
    const noConns = !m?.connections || m.connections.length === 0;

    const nextEdges: WorkflowEdge[] = noConns
      ? this._edges()
      : m.connections.map(c => ({
        id: this.makeEdgeId(c.source.nodeId, c.source.connectorId, c.target.nodeId, c.target.connectorId),
        source: c.source.nodeId,
        target: c.target.nodeId,
        sourcePort: c.source.connectorId,
        targetPort: c.target.connectorId,
        label: '',
      }));
    this.upsertEdges(nextEdges);

    const prevById = new Map<string, WorkflowNode>([...prevExec, ...prevUi].map(n => [n.id, n]));
    const fromDf: WorkflowNode[] = noNodes ? [] : m.nodes!.map(raw => {
      const prev = prevById.get(raw.id);
      const rawData = raw.data ?? {};
      const pos = (raw as DfDataNode).position ?? { x: prev?.x ?? 0, y: prev?.y ?? 0 };
      const type = (rawData.type as PaletteType) ?? prev?.type;
      const ports = rawData?.['ports'] ?? prev?.ports ?? this.defaultPortsFor(type);
      const prevParams = (prev?.data?.params ?? {}) as Record<string, unknown>;
      const rawParams = (rawData?.['params'] ?? {}) as Record<string, unknown>;

      const mergedUi = {
        ...(prevParams?.['ui'] as Record<string, unknown> ?? {}),
        ...(rawParams?.['ui'] as Record<string, unknown> ?? {})
      };

      const params = { ...prevParams, ...rawParams, ui: mergedUi };
      const data = { ...(prev?.data ?? {}), ...rawData, params, type };

      return { id: raw.id, type, x: pos.x, y: pos.y, data, ports };
    });
    const dfExec = fromDf.filter(n => this.isExecutableNode(n));
    const mergeMap = new Map<string, WorkflowNode>(fromDf.map(n => [n.id, n] as [string, WorkflowNode]));
    const mergeById = (list: WorkflowNode[]) => list.map(n => mergeMap.get(n.id) ?? n);
    let nextExec = mergeById(prevExec);
    let nextUi = mergeById(prevUi);

    for (const n of dfExec) {
      if (!prevById.has(n.id)) nextExec = [...nextExec, n];
    }

    const union = [...nextExec, ...nextUi];
    const withUi = this.withUiConnectivity(union, nextEdges);
    const byId = new Map(withUi.map(n => [n.id, n]));
    nextExec = nextExec.map(n => byId.get(n.id) ?? n);
    nextUi = nextUi.map(n => byId.get(n.id) ?? n);
    this.execNodes.set(nextExec);
    this.uiNodes.set(nextUi);
    this.emitConnectivity(withUi, nextEdges);
    this.publishGraphValidity();

    const sig = this.makeTopoSig(nextExec, nextEdges);
    if (sig !== this.lastTopoSig) {
      this.lastTopoSig = sig;
      this.suppressExternal = true;
      this.emitExecOnly(nextExec, nextEdges);
      queueMicrotask(() => (this.suppressExternal = false));
    }
  };

  onNodeSelected(e: unknown): void {
    const nodeId = (e as { id?: string; nodeId?: string }).id ?? (e as { nodeId?: string }).nodeId ?? null;
    this.setSelectedNode(nodeId);
  }

  onNodeMoved(_evt: unknown): unknown {
    const event = _evt;
    return event;
  }

  onConnectionSelected(_evt: unknown): unknown {
    const event = _evt;
    return event;
  }

  private tryRemoveDfConnection(
    s: { nodeId: string; connectorId: string, connectorType: DfConnectionPoint },
    t: { nodeId: string; connectorId: string, connectorType: DfConnectionPoint }
  ): void {
    const api = this.flow;
    try { api?.removeConnection({ source: s, target: t, }); return; } catch (e) { console.log("tryRemoveDfConnection error", e) }

    queueMicrotask(() => this._edges.set([...this._edges()]));
  }

  onConnectionCreated(evt: DfEvent<DfDataConnection>): void {
    const t = evt?.target?.target, s = evt?.target?.source;
    if (!s || !t) return;

    const all = this.allNodes();
    const srcNode = all.find(n => n.id === s.nodeId);
    const tgtNode = all.find(n => n.id === t.nodeId);

    const isInputResultPair =
      srcNode && tgtNode &&
      (
        (srcNode.type === 'input' && tgtNode.type === 'result') ||
        (srcNode.type === 'result' && tgtNode.type === 'input')
      );

    if (isInputResultPair) {
      this.toast.show(
        this.translate.instant('workflow.errors.noDirectInputToResult') ||
        'You cannot connect Input directly to Result.',
      );
      this.tryRemoveDfConnection(s, t);
      this.publishGraphValidity();
      return;
    }

    const id = this.makeEdgeId(s.nodeId, s.connectorId, t.nodeId, t.connectorId);
    if (this._edges().some(e => e.id === id)) return;

    const nextEdge: WorkflowEdge = {
      id,
      source: s.nodeId,
      target: t.nodeId,
      sourcePort: s.connectorId,
      targetPort: t.connectorId,
      label: '',
    };

    const after = [...this._edges(), nextEdge];
    this._edges.set(after);

    const combined = [...this.execNodes(), ...this.uiNodes()];
    const withUi = this.withUiConnectivity(combined, after);

    this.emitConnectivity(withUi, after);
    this.publishGraphValidity();

    this.suppressExternal = true;
    this.OnCanvasChange.emit({ nodes: this.execNodes(), edges: after });
    queueMicrotask(() => (this.suppressExternal = false));
  }

  onConnectionDeleted(evt: DfEvent<DfDataConnection>): void {
    const t = evt?.target?.target, s = evt?.target?.source;
    if (!s || !t) return;
    const id = this.makeEdgeId(s.nodeId, s.connectorId, t.nodeId, t.connectorId);

    const after = this._edges().filter(e => e.id !== id);
    this._edges.set(after);

    const combined = [...this.execNodes(), ...this.uiNodes()];
    const withUi = this.withUiConnectivity(combined, after);

    this.emitConnectivity(withUi, after);
    this.publishGraphValidity();

    this.suppressExternal = true;
    this.OnCanvasChange.emit({ nodes: this.execNodes(), edges: after });
    queueMicrotask(() => (this.suppressExternal = false));
  }

  setSelectedNode(id: string | null): void {
    const host = this.flowElementRef?.nativeElement;
    if (!host) {
      this.selectedNodeId.set(id);
      return;
    }

    const prev = this.selectedNodeId();
    if (prev) {
      const prevEl = host.querySelector(`[data-node-id="${prev}"]`) as HTMLElement | null;
      prevEl?.classList.remove('is-selected');
    }

    this.selectedNodeId.set(id);
    if (id) {
      const el = host.querySelector(`[data-node-id="${id}"]`) as HTMLElement | null;
      el?.classList.add('is-selected');
    }
  }

  onDeleteNode(evt: DfEvent<DfDataNode>): void {
    const id = evt?.target.id;

    if (!id) return;

    const ui = this.uiNodes();
    const uiIdx = ui.findIndex(n => n.id === id);
    if (uiIdx >= 0) {
      const nextUi = ui.slice();
      nextUi.splice(uiIdx, 1);
      this.uiNodes.set(nextUi);

      const combined = [...this.execNodes(), ...nextUi];
      const withUi = this.withUiConnectivity(combined, this._edges());
      this.emitConnectivity(withUi, this._edges());

      if (this.selectedNodeId() === id) this.setSelectedNode(null);
      return;
    }

    const exec = this.execNodes();
    const node = exec.find(n => n.id === id);
    if (!node) return;
    if (this.isTerminal(id)) return;

    const nextExec = exec.filter(n => n.id !== id);
    const nextEdges = this._edges().filter(e => e.source !== id && e.target !== id);

    this.execNodes.set(nextExec);
    this._edges.set(nextEdges);

    const combined = [...nextExec, ...this.uiNodes()];
    const withUi = this.withUiConnectivity(combined, nextEdges);
    this.emitConnectivity(withUi, nextEdges);
    this.publishGraphValidity();

    this.lastLocalChangeAt = Date.now();
    this.lastTopoSig = this.makeTopoSig(nextExec, nextEdges);

    if (this.selectedNodeId() === id) this.setSelectedNode(null);

    this.suppressExternal = true;
    this.OnCanvasChange.emit({ nodes: nextExec, edges: nextEdges });
    queueMicrotask(() => (this.suppressExternal = false));
  }

  isTerminal(id: string | null): boolean {
    if (!id) return false;
    const n = this.execNodes().find(x => x.id === id);
    return !!n && (n.type === 'input' || n.type === 'result');
  }

  submit() {
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      this.toast.show(this.translate.instant('form.errors.fixFields'));
      return;
    }

    const nodes = this.execNodes();
    const edges = this._edges();
    const graphErr = this.validateGraph(nodes, edges);
    if (graphErr) {
      this.toast.show(graphErr);
      return;
    }

    const dto = this.buildWorkflowDTO(nodes, edges);
    console.log("dto---------->",dto)
  }

  private emitConnectivity(nodes: WorkflowNode[], edges: WorkflowEdge[]): void {
    const out = new Map<string, number>(), inn = new Map<string, number>();
    nodes.forEach(n => { out.set(n.id, 0); inn.set(n.id, 0); });
    edges.forEach(e => {
      out.set(e.source, (out.get(e.source) ?? 0) + 1);
      inn.set(e.target, (inn.get(e.target) ?? 0) + 1);
    });

    for (const n of nodes) {
      const ports = n.ports ?? this.defaultPortsFor(n.type);
      const needsIn = (ports.inputs?.length ?? 0) > 0 && n.type !== 'input';
      const needsOut = (ports.outputs?.length ?? 0) > 0 && n.type !== 'result';
      const missingIn = needsIn && ((inn.get(n.id) ?? 0) === 0);
      const missingOut = needsOut && ((out.get(n.id) ?? 0) === 0);
      this.bus.nodeConnectivity$.next({ nodeId: n.id, missingIn, missingOut });
    }
  }


  private updateRunState(runId: string, mut: (s: Record<string, Status>) => void) {
    const runs = this.runs();
    const idx = runs.findIndex(r => r.id === runId);
    if (idx < 0) return;
    const cur = { ...runs[idx].state };
    mut(cur);
    const next = runs.slice();
    next[idx] = { ...runs[idx], state: cur };
    this.runs.set(next);
    this.emitRuns();

    // keep old single-run bindings in sync for the latest run only
    if (this.currentRunId === runId) {
      this.runState.set(cur);
      this.bus.runState$.next(cur);
    }
  }


  private simulateRun(runId: string, wf: PipelineWorkflowDTO): void {
    const sim = this.sims.get(runId);
    if (!sim) return;

    sim.running = true;
    sim.indeg.clear();
    sim.ready.length = 0;
    sim.timers.forEach(id => clearTimeout(id));
    sim.timers.clear();
    sim.cancelled.clear();
    sim.pipelineCancelled = false;

    wf.nodes.forEach(n => sim.indeg.set(n.id, 0));
    wf.edges.forEach(e => sim.indeg.set(e.target, (sim.indeg.get(e.target) ?? 0) + 1));
    sim.ready.push(...wf.nodes.filter(n => (sim.indeg.get(n.id) ?? 0) === 0).map(n => n.id));

    const unlockChildren = (u: string) => {
      for (const e of wf.edges) {
        if (e.source === u) {
          const d = (sim.indeg.get(e.target) ?? 0) - 1;
          sim.indeg.set(e.target, d);
          if (d === 0) sim.ready.push(e.target);
        }
      }
    };

    const step = () => {
      if (!sim.running || sim.pipelineCancelled) return;
      if (sim.ready.length === 0) { sim.running = false; return; }

      const id = sim.ready.shift()!;

      if (sim.cancelled.has(id)) {
        this.updateRunState(runId, s => s[id] = 'skipped');
        unlockChildren(id);
        queueMicrotask(step);
        return;
      }

      this.updateRunState(runId, s => s[id] = 'running');

      const to = window.setTimeout(() => {
        sim.timers.delete(id);
        if (sim.pipelineCancelled || sim.cancelled.has(id)) {
          this.updateRunState(runId, s => s[id] = 'skipped');
        } else {
          this.updateRunState(runId, s => s[id] = 'success'); // or randomize success/error
        }
        unlockChildren(id);
        step();
      }, 1400);

      sim.timers.set(id, to);
    };

    step();
  }

  handleStageCancel(e: { index: number; nodeIds: string[]; runId?: string }) {
    const runId = e.runId ?? this.currentRunId; if (!runId) return;
    const sim = this.sims.get(runId); if (!sim) return;

    const wf = this.runs().find(r => r.id === runId)?.workflow; if (!wf) return;

    const removeFromReady = (id: string) => {
      const idx = sim.ready.indexOf(id);
      if (idx >= 0) sim.ready.splice(idx, 1);
    };
    const unlockChildren = (u: string) => {
      for (const edge of wf.edges) {
        if (edge.source === u) {
          const d = (sim.indeg.get(edge.target) ?? 0) - 1;
          sim.indeg.set(edge.target, d);
          if (d === 0) sim.ready.push(edge.target);
        }
      }
    };

    this.updateRunState(runId, state => {
      for (const id of e.nodeIds) {
        sim.cancelled.add(id);
        const to = sim.timers.get(id);
        if (to) { clearTimeout(to); sim.timers.delete(id); }
        removeFromReady(id);
        if (state[id] === 'queued' || state[id] === 'running') {
          state[id] = 'skipped';
          unlockChildren(id);
        }
      }
    });
  }

  handlePipelineCancel(runId?: string) {
    const rid = runId ?? this.currentRunId; if (!rid) return;
    const sim = this.sims.get(rid); if (!sim) return;

    sim.pipelineCancelled = true;
    sim.timers.forEach(id => clearTimeout(id));
    sim.timers.clear();

    this.updateRunState(rid, state => {
      Object.keys(state).forEach(id => {
        if (state[id] === 'queued' || state[id] === 'running') state[id] = 'skipped';
      });
    });

    sim.running = false;
  }

  private startPipelineFromCurrent() {
    const filtered = this.filterForRuntime(this.execNodes(), this._edges());
    const { cleanNodes } = this.normalize(filtered.nodes, filtered.edges);

    const dto = this.buildWorkflowDTO(filtered.nodes, filtered.edges);
    const runId = crypto?.randomUUID?.() ?? `run_${Date.now()}`;
    this.currentRunId = runId;

    const initial: Record<string, Status> = {};
    for (const n of cleanNodes) initial[n.id] = 'queued';

    const run: RunEntry = { id: runId, startedAt: Date.now(), workflow: dto, state: initial };
    this.runs.set([run, ...this.runs()]);
    this.emitRuns();

    this.pipelineDto.set(dto);
    this.bus.pipeline$.next(dto);
    this.runState.set(initial);
    this.bus.runState$.next(initial);

    this.sims.set(runId, this.newSim());
    this.simulateRun(runId, dto);
    queueMicrotask(() => this.bus.formsReset$.next({ includeInputs: true }));
  }

  private emitRuns() {
    this.bus.runs$.next(this.runs());
  }
  private makeEdgeId(srcNode: string, srcPort: string, tgtNode: string, tgtPort: string) {
    return `e-${srcNode}__${srcPort}--${tgtNode}__${tgtPort}`;
  }

  private upsertEdges(edges: WorkflowEdge[]) {
    const map = new Map<string, WorkflowEdge>();
    for (const e of edges) map.set(e.id, e);
    this._edges.set([...map.values()]);
  }

  private emitExecOnly(nodes: WorkflowNode[], edges: WorkflowEdge[]) {
    const { nodes: outNodes, edges: outEdges } = this.filterForRuntime(nodes, edges);
    this.suppressExternal = true;
    this.OnCanvasChange.emit({ nodes: outNodes, edges: outEdges });
    queueMicrotask(() => (this.suppressExternal = false));
  }

  private updateNodeById(nodeId: string, updater: (n: WorkflowNode) => WorkflowNode, opts?: { emitToParentIfExec?: boolean }) {
    const exec = this.execNodes();
    const iExec = exec.findIndex(n => n.id === nodeId);
    if (iExec >= 0) {
      const nextExec = exec.slice();
      nextExec[iExec] = updater(nextExec[iExec]);
      this.execNodes.set(nextExec);
      this.refreshConnectivityAndValidity();
      if (opts?.emitToParentIfExec !== false) this.pushExecToParent();
      return;
    }

    const ui = this.uiNodes();
    const iUi = ui.findIndex(n => n.id === nodeId);
    if (iUi >= 0) {
      const nextUi = ui.slice();
      nextUi[iUi] = updater(nextUi[iUi]);
      this.uiNodes.set(nextUi);
      this.refreshConnectivityAndValidity();
    }
  }

  private refreshConnectivityAndValidity() {
    const withUi = this.withUiConnectivity(this.allNodes(), this._edges());
    this.execNodes.set(withUi.filter(n => this.isExecutableNode(n)));
    this.uiNodes.set(withUi.filter(n => !this.isExecutableNode(n)));
    this.publishGraphValidity();
  }

  private pushExecToParent() {
    this.suppressExternal = true;
    this.emitExecOnly(this.execNodes(), this._edges());
    queueMicrotask(() => (this.suppressExternal = false));
  }

  private stripBinary(v: Binary | Binary[]): BinaryPlaceholder | BinaryPlaceholder[] {
    if (Array.isArray(v)) {
      return (v as Binary[]).map(f => this.stripBinary(f) as BinaryPlaceholder);
    }
    if (v instanceof File) {
      return { __file: true, name: v.name, size: v.size, type: v.type };
    }
    return { __blob: true, size: v.size, type: v.type };
  }

  private extractFiles<T extends WithFiles | undefined>(nodeId: string, params: T): ReplaceBinary<NonNullable<T>> | undefined {
    if (params === undefined || params === null || typeof params !== 'object') {
      return params as ReplaceBinary<NonNullable<T>>;
    }

    const files: Record<string, Binary | Binary[]> = {};
    const walk = (obj: unknown, path: string[] = []): unknown => {
      if (this.isFile(obj) || this.isBlob(obj) || this.isArrayOfFiles(obj)) {
        const key = path.join('.');
        files[key] = obj as Binary | Binary[];
        return this.stripBinary(obj as Binary | Binary[]);
      }
      if (Array.isArray(obj)) return obj.map((x, i) => walk(x, [...path, i.toString()]));
      if (obj !== null && typeof obj === 'object') {
        const out: Record<string, unknown> = {};
        for (const k of Object.keys(obj as Record<string, unknown>)) {
          out[k] = walk((obj as Record<string, unknown>)[k], [...path, k]);
        }
        return out;
      }
      return obj;
    };

    const sanitized = walk(params) as ReplaceBinary<NonNullable<T>>;

    if (Object.keys(files).length) this.fileCache.set(nodeId, files);
    return sanitized;
  }

  private makeTopoSig(nodes: WorkflowNode[], edges: WorkflowEdge[]) {
    const ns = [...nodes]
      .map(n => ({ id: n.id, t: n.type, x: n.x || 0, y: n.y || 0 }))
      .sort((a, b) => a.id.localeCompare(b.id));
    const es = [...edges]
      .map(e => ({ id: e.id, s: e.source, sp: e.sourcePort, t: e.target, tp: e.targetPort }))
      .sort((a, b) => a.id.localeCompare(b.id));
    return JSON.stringify({ ns, es });
  }

  private defaultPortsFor(type: string): WorkflowNode['ports'] {
    const inputRandomKey = crypto?.randomUUID?.() ?? 'input-' + Math.random().toString(36).slice(2, 9);
    const resultRandomKey = crypto?.randomUUID?.() ?? 'result-' + Math.random().toString(36).slice(2, 9);
    const nodeInRandomKey = crypto?.randomUUID?.() ?? 'node-in-' + Math.random().toString(36).slice(2, 9);
    const nodeOutRandomKey = crypto?.randomUUID?.() ?? 'node-out-' + Math.random().toString(36).slice(2, 9);
    if (type === 'input') return { inputs: [], outputs: [{ id: inputRandomKey, label: 'out', type: 'json' }] };
    if (type === 'result') return { inputs: [{ id: resultRandomKey, label: 'in', type: 'json' }], outputs: [] };
    if (type === 'run-panel') return { inputs: [], outputs: [] };
    return {
      inputs: [{ id: nodeInRandomKey, label: 'in', type: 'json' }],
      outputs: [{ id: nodeOutRandomKey, label: 'out', type: 'json' }],
    };
  }

  private isExecutableNode(n: WorkflowNode): boolean {
    const groupedSets = new Set<PaletteType>([
      ...EXEC_TYPES,
      ...this.executableNodesSig()
    ]);

    return groupedSets.has(n.type as PaletteType);
  }

  private filterForRuntime(
    nodes: WorkflowNode[],
    edges: WorkflowEdge[]
  ): { nodes: WorkflowNode[]; edges: WorkflowEdge[] } {
    const keptNodes = nodes.filter(n => this.isExecutableNode(n));
    const keepIds = new Set(keptNodes.map(n => n.id));
    const keptEdges = edges.filter(e => keepIds.has(e.source) && keepIds.has(e.target));
    return { nodes: keptNodes, edges: keptEdges };
  }
  private isFile(v: unknown): v is File {
    return typeof File !== 'undefined' && v instanceof File;
  }
  private isBlob(v: unknown): v is Blob {
    return typeof Blob !== 'undefined' && v instanceof Blob;
  }
  private isArrayOfFiles(v: unknown): v is File[] {
    return Array.isArray(v) && v.length > 0 && this.isFile(v[0]);
  }

  private rebuildCompatibilityIndex(): void {
    const actions = this.availableActionsSig() ?? [];
    this.compatibleIndex.clear();

    const push = (k: string, a: ActionDefinitionLite) => {
      if (!this.compatibleIndex.has(k)) this.compatibleIndex.set(k, []);
      this.compatibleIndex.get(k)!.push({
        type: a.type,
        icon: a.params?.['icon'],
        label: a.type
      });
    };

    for (const a of actions) {
      push('any', a)
    }
  }

  private compatibleFor(outType?: string): {
    type: string;
    icon?: string | undefined;
    label: string;
  }[] {
    const t = outType ?? 'any';
    const base = [
      ...(this.compatibleIndex.get(t) ?? []),
      ...(t !== 'any' ? (this.compatibleIndex.get('any') ?? []) : []),
    ];

    const hasResult = base.some(i => i.type === 'result');
    if (!hasResult) {
      base.push({ type: 'result', icon: 'forward', label: 'result' });
    }
    return base;
  }

  private clientToWorld(client: { x: number; y: number }) {
    const root = this.flowElementRef.nativeElement as HTMLElement;
    const style = getComputedStyle(root);
    const t = style.transform === 'none' ? undefined : style.transform;
    const [ox, oy] = style.transformOrigin.split(' ').map(v => parseFloat(v)) as [number, number];

    const M = new DOMMatrixReadOnly(t);
    const pre = new DOMMatrixReadOnly().translate(ox, oy);
    const post = new DOMMatrixReadOnly().translate(-ox, -oy);
    const inv = post.multiply(M).multiply(pre).inverse();

    const world = new DOMPoint(client.x, client.y).matrixTransform(inv);
    return { x: world.x, y: world.y };
  }

  pickQuickAction(a: { type: string, icon?: string }) {
    if (!this.quickAddCtx) return;
    const { sourceNodeId, sourcePortId } = this.quickAddCtx;
    this.bus.quickAddPick$.next({ sourceNodeId, sourcePortId, actionType: a.type, icon: a.icon || "" });
    this.quickAddOpen = false;
  }

  private handleQuickAddPick({
    sourceNodeId,
    sourcePortId,
    actionType,
    icon
  }: { sourceNodeId: string; sourcePortId: string; actionType: string, icon: string }) {

    const sourceNode = this.allNodes().find(n => n.id === sourceNodeId);

    if (actionType === 'result' && sourceNode?.type === 'input') {
      this.toast.show(
        this.translate.instant('workflow.errors.noDirectInputToResult') ||
        'You cannot connect Input directly to Result.',
      );
      this.quickAddOpen = false;
      return;
    }

    const r = this.quickAddCtx?.anchorRect;
    const client = { x: (r?.right || 0) + 12, y: (r?.top || 0) + (r?.height || 0) / 2 };
    const world = this.clientToWorld(client);
    const pos = { x: world.x + 160, y: world.y - 12 };

    if (actionType === 'result') {
      let target = this.execNodes().find(n => n.type === 'result');
      if (!target) {
        const id = crypto?.randomUUID?.() ?? this.genId('n');
        const ports = this.defaultPortsFor('result');
        target = {
          id,
          type: 'result',
          x: pos.x,
          y: pos.y,
          data: { label: this.humanLabelFor('result' as PaletteType), params: { ui: { expanded: true } } },
          ports,
        };
        this.execNodes.set([...this.execNodes(), target]);
      }

      const targetIn = (target.ports?.inputs ?? [])[0]?.id ?? 'in';
      const edgeId = this.makeEdgeId(sourceNodeId, sourcePortId, target.id, targetIn);
      if (!this._edges().some(e => e.id === edgeId)) {
        const edge: WorkflowEdge = {
          id: edgeId,
          source: sourceNodeId,
          sourcePort: sourcePortId,
          target: target.id,
          targetPort: targetIn,
          label: '',
        };
        this._edges.set([...this._edges(), edge]);
      }

      const withUi = this.withUiConnectivity([...this.execNodes(), ...this.uiNodes()], this._edges());
      this.emitConnectivity(withUi, this._edges());
      this.publishGraphValidity();

      this.suppressExternal = true;
      this.OnCanvasChange.emit({ nodes: this.execNodes(), edges: this._edges() });
      queueMicrotask(() => (this.suppressExternal = false));
      this.quickAddOpen = false;
      return;
    }

    // Default path: spawn picked action node and link it
    const id = crypto?.randomUUID?.() ?? this.genId('n');
    const ports = this.defaultPortsFor(actionType);
    const node: WorkflowNode = {
      id,
      type: actionType as PaletteType,
      x: pos.x,
      y: pos.y,
      data: {
        label: this.humanLabelFor(actionType as PaletteType),
        aiType: actionType as InspectorActionType,
        params: { ui: { expanded: true }, icon: icon },
      },
      ports,
    };
    const execNext = [...this.execNodes(), node];
    this.execNodes.set(execNext);

    const targetIn = (ports.inputs ?? [])[0]?.id ?? 'in';
    const edge: WorkflowEdge = {
      id: this.makeEdgeId(sourceNodeId, sourcePortId, id, targetIn),
      source: sourceNodeId,
      sourcePort: sourcePortId,
      target: id,
      targetPort: targetIn,
      label: '',
    };
    this._edges.set([...this._edges(), edge]);

    const withUi = this.withUiConnectivity([...execNext, ...this.uiNodes()], this._edges());
    this.emitConnectivity(withUi, this._edges());
    this.publishGraphValidity();

    this.suppressExternal = true;
    this.OnCanvasChange.emit({ nodes: execNext, edges: this._edges() });
    queueMicrotask(() => (this.suppressExternal = false));
    this.quickAddOpen = false;
  }

  linkToExisting(targetId: string) {
    if (!this.quickAddCtx) return;
    const { sourceNodeId, sourcePortId } = this.quickAddCtx;

    if (sourceNodeId === targetId) return;

    const all = this.allNodes();
    const srcNode = all.find(n => n.id === sourceNodeId);
    const tgtNode = all.find(n => n.id === targetId);
    if (!srcNode || !tgtNode) return;

    // Rule: cannot connect Input directly to Result
    const isInputResultPair =
      (srcNode.type === 'input' && tgtNode.type === 'result') ||
      (srcNode.type === 'result' && tgtNode.type === 'input');

    if (isInputResultPair) {
      this.toast.show(
        this.translate.instant('workflow.errors.noDirectInputToResult') ||
        'You cannot connect Input directly to Result.',
      );
      return;
    }

    const targetIn = (tgtNode.ports?.inputs ?? [])[0]?.id ?? 'in';
    const edgeId = this.makeEdgeId(sourceNodeId, sourcePortId, targetId, targetIn);
    if (this._edges().some(e => e.id === edgeId)) {
      this.quickAddOpen = false;
      return;
    }

    const nextEdges = {
      id: edgeId,
      source: sourceNodeId,
      sourcePort: sourcePortId,
      target: targetId,
      targetPort: targetIn,
      label: '',
    } satisfies WorkflowEdge;

    const after = [...this._edges(), nextEdges];
    this._edges.set(after);

    const combined = [...this.execNodes(), ...this.uiNodes()];
    const withUi = this.withUiConnectivity(combined, after);

    this.emitConnectivity(withUi, after);
    this.publishGraphValidity();

    this.suppressExternal = true;
    this.OnCanvasChange.emit({ nodes: this.execNodes(), edges: after });
    queueMicrotask(() => (this.suppressExternal = false));

    this.quickAddOpen = false;
  }

  private newSim(): SimCtx {
    return {
      running: true,
      indeg: new Map<string, number>(),
      ready: [],
      timers: new Map<string, number>(),
      cancelled: new Set<string>(),
      pipelineCancelled: false,
    };
  }

  private stripReservedDTO(obj:  WorkflowNodeDataBaseParams | undefined): WorkflowNodeDataBaseParams | undefined {
    if (!obj || typeof obj !== 'object') return obj;
    const RESERVED = new Set<ReservedKeys>(["ui",'__missingIn', '__missingOut']);
    const out : WorkflowNodeDataBaseParams = {};
    for (const [k, v] of Object.entries(obj)) {
      if (RESERVED.has(k as ReservedKeys)) continue;
      out[k] = v;
    }
    return out;
  }

  private buildWorkflowDTO(fromNodes: WorkflowNode[], fromEdges: WorkflowEdge[]): PipelineWorkflowDTO {
    const { cleanNodes, cleanEdges } = this.normalize(fromNodes, fromEdges);

    const nodesSansReserved = cleanNodes.map(n => ({
      ...n,
      data: {
        ...n.data,
        params: this.stripReservedDTO(n.data?.params)
      }
    }));

    const filesByNode: Record<string, Record<string, Binary | Binary[]>> = {};
    for (const n of nodesSansReserved) {
      const files = this.fileCache.get(n.id);
      if (files && Object.keys(files).length) filesByNode[n.id] = files;
    }
    const dto: PipelineWorkflowDTO = {
      name: (this.form?.value?.workflowName as string) || 'Untitled workflow',
      nodes: nodesSansReserved,
      edges: cleanEdges,
      meta: {
        createdAt: new Date().toISOString(),
        version: "1",
        filesByNode,
      }
    };
    return dto;
  }
}
