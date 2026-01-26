
import { CdkDragDrop, DragDropModule } from '@angular/cdk/drag-drop';
import { CommonModule } from '@angular/common';
import {
  AfterViewInit,
  ChangeDetectionStrategy,
  Component,
  computed,
  effect,
  ElementRef,
  EventEmitter,
  HostListener,
  inject,
  Input,
  OnDestroy,
  OnInit,
  Output,
  Renderer2,
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
  RunNodePayload,
  WorkflowPorts,
} from '../templates/utils/workflow.interface';
import {
  ActionDefinitionLite,
  Binary,
  BinaryPlaceholder,
  EXEC_TYPES,
  InspectorActionType,
  NodeParamsChangedEvent,
  PaletteType,
  PipelineWorkflowDTO,
  PreferredTab,
  ReplaceBinary,
  RESERVED_KEYS,
  ReservedKeys,
  RunEntry,
  Sanitized,
  SimCtx,
  Status,
  WithFiles,
  WithParams,
  WorkflowEdge,
  WorkflowNode,
  RunNodeDTO,
  WorkflowNodeDataBaseParams
} from '../templates/utils/workflow.interface';
import { FieldConfigService, ToastService } from '@cadai/pxs-ng-core/services';
import { MatTooltipModule } from '@angular/material/tooltip';

import { WfNodeComponent } from './action-node/action-node.component';
import { DynamicFormComponent } from '@cadai/pxs-ng-core/shared';
import { WfCanvasBus } from '../templates/utils/wf-canvas-bus';
import { MatIconModule } from '@angular/material/icon';
import { WfRunPanelNodeComponent } from './run-panel/run-panel-node.component';
import { FieldConfig } from '@cadai/pxs-ng-core/interfaces';
import { Subscription, combineLatest, debounceTime, distinctUntilChanged } from 'rxjs';
import { OverlayModule } from '@angular/cdk/overlay';
import { MatMenuModule } from '@angular/material/menu';
import { MatSidenavModule } from '@angular/material/sidenav';
import { ActionFormSpec } from '../templates/utils/action-forms';
import { WfDetailsNodeComponent } from './details-node/detail-node.component';
import { WfPreviewNodeComponent } from './preview-node/preview-node.compoennt';
import { WorkflowValidationState, WorkflowsStore } from '../data/workflows.store';

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
    MatMenuModule,
    MatSidenavModule
  ],
  providers: [
    dfPanZoomOptionsProvider({
      panSize: 20000,
    }),
    provideNgDrawFlowConfigs({
      nodes: {
        input: WfNodeComponent,
        result: WfNodeComponent,
        'chat': WfNodeComponent,
        compare: WfNodeComponent,
        summarize: WfNodeComponent,
        extract: WfNodeComponent,
        embed: WfNodeComponent,
        retrieve: WfNodeComponent,
        convert_and_chunk: WfNodeComponent,
        embed_langchain_documents: WfNodeComponent,
        store_embedded_langchain_documents: WfNodeComponent,
        jira: WfNodeComponent,
        composite: WfNodeComponent,
        'run-panel': WfRunPanelNodeComponent,
        details: WfDetailsNodeComponent,
        preview: WfPreviewNodeComponent,
      },
      connection: {
        type: DfConnectionType.SmoothStep,
        arrowhead: { type: DfArrowhead.ArrowClosed, height: 8, width: 8 },
        curvature: 10,
      }
    }),
    WfCanvasBus,
  ],
  templateUrl: './workflow-canvas-df.component.html',
  styleUrls: ['./workflow-canvas-df.component.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class WorkflowCanvasDfComponent implements OnInit, OnDestroy, AfterViewInit {
  @ViewChild('flow', { static: true }) flow!: NgDrawFlowComponent;
  @ViewChild('flowEl', { static: true, read: ElementRef })
  private flowElementRef!: ElementRef<HTMLElement>;

  private suppressExternal = false;
  translate = inject(TranslateService);

  /** Track node ids deleted locally to ignore any brief upstream echoes */
  private recentlyDeleted = new Map<string, number>();
  private readonly deletionWindowMs = 800;
  private lastWorkflowId: string | null | undefined = undefined;
  private workflowChangeCounter = signal(0);
  private acceptExternalOnce = false;
  private refreshAfterRenderScheduled = false;

  @Input() set workflowId(value: string | null | undefined) {
    if (value !== this.lastWorkflowId) {
      this.acceptExternalOnce = true;
      queueMicrotask(() => (this.acceptExternalOnce = false));
      this.suppressExternal = false;

      // Workflow switched - force clear and reload nodes
      this.lastWorkflowId = value;
      this.lastIncomingSig = '';
      this.lastTopoSig = '';
      this.execNodes.set([]);
      this.uiNodes.set([]);
      this._edges.set([]);
      this.selectedNodes.set(new Set());
      this.selectedEdges.set(new Set());
      this.selectedNodeId.set(null);
      this.edgeActionsOpen.set(false);
      this.edgeActionTarget = null;
      this.quickAddOpen = false;
      this.recentlyDeleted.clear();
      this.formInvalidByNode.clear();
      this.workflowChangeCounter.update(c => c + 1);
      this.refreshValidationAndConnectivityAfterRender();
    }
  }

  @Input({ required: true })
  set nodes(value: WorkflowNode[] | null | undefined) {

    if (this.suppressExternal && !this.acceptExternalOnce) return;

    const now = Date.now();
    // prune old tombstones
    for (const [id, ts] of [...this.recentlyDeleted]) {
      if (now - ts > this.deletionWindowMs) this.recentlyDeleted.delete(id);
    }

    const allIncoming = (value ?? []);
    // Drop any nodes that were just deleted locally (avoid re-creation)
    let incoming = allIncoming
      .map(n => this.normalizeCompositeNode(n))
      .filter(n => this.isExecutableNode(n))
      .filter(n => !this.recentlyDeleted.has(n.id))
      .filter(n => n.type !== 'input' && n.type !== 'result') // Filter out legacy input/result nodes
      .map(n => ({ ...n, ports: this.ensurePorts(n.type, n.ports) }));

    // enrichit les nodes avec les flags de connectivité dès le chargement initial
    if (incoming.length && this.execNodes().length === 0) {
      incoming = this.withUiConnectivity(incoming, this._edges());
    }

    // Force la diffusion de la connectivité pour chaque node même si la topologie n'a pas changé (ex: chargement d'un workflow existant)
    // Cela garantit que les events de validation sont toujours émis et reçus par les nodes
    queueMicrotask(() => {
      const allNodes = this.withUiConnectivity(this.allNodes(), this._edges());
      this.emitConnectivity(allNodes, this._edges());
    });

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
      this.lastTopoSig = this.makeTopoSig(mergedExec, this._edges());
      this.applyEdges(this.pendingEdgesRaw);
      // Force la diffusion de la connectivité pour chaque node dès le chargement
      this.emitConnectivity(mergedExec, this._edges());
      return;
    }

    // merge-only: update existing IDs, do NOT add new ones from parent unless not racing a local change
    const mergedExec = current.map(n => {
      const inc = incomingById.get(n.id);
      if (!inc) return n;
      return { ...inc, x: n.x, y: n.y, ports: this.ensurePorts(inc.type, inc.ports) };
    });

    const justChangedLocally = Date.now() - this.lastLocalChangeAt < 300;
    if (!justChangedLocally) {
      for (const [id, inc] of incomingById) {
        if (!currentById.has(id)) mergedExec.push({ ...inc, ports: this.ensurePorts(inc.type, inc.ports) });
      }
    }

    this.execNodes.set(mergedExec);
    this.schedulePublishGraphValidity();
    this.applyEdges(this.pendingEdgesRaw);
  }

  @Input({ required: true })
  set edges(value: WorkflowEdge[] | null | undefined) {
    if (this.suppressExternal && !this.acceptExternalOnce) return;
    const incomingRaw = value ?? [];
    const incoming = this.sanitizeGraph(this.allNodes(), incomingRaw).edges;
    this.pendingEdgesRaw = value ?? [];
    this.applyEdges(this.pendingEdgesRaw, { skipIfSame: true });

    const cur = this._edges();
    if (incoming.length === cur.length && incoming.every((e, i) => e.id === cur[i].id)) return;

    this._edges.set(incoming);

    queueMicrotask(() => {
      const nodesWithUi = this.withUiConnectivity(this.allNodes(), this._edges());
      this.emitConnectivity(nodesWithUi, this._edges());
      this.publishGraphValidity();
    });
    // recompute UI flags using *all* nodes:
    const nodesWithUi = this.withUiConnectivity(this.allNodes(), incoming);
    const nextExec = nodesWithUi.filter(n => this.isExecutableNode(n));
    const nextUi = nodesWithUi.filter(n => !this.isExecutableNode(n));
    this.execNodes.set(nextExec);
    this.uiNodes.set(nextUi);

    this.emitConnectivity(nodesWithUi, incoming);
    this.lastTopoSig = this.makeTopoSig(nextExec, incoming);
    this.schedulePublishGraphValidity()
  }

  @Input({ required: true }) actionsNodes!: Record<string, ActionFormSpec>;
  @Input({ required: true })
  set executableNodes(value: Set<PaletteType>) {
    this.executableNodesSig.set(value)
  };

  @Input() set disabled(value: boolean) {
    this.disabledSig.set(!!value);
    this.applyReadOnlyState();
  }
  @Input() set availableActions(value: ActionDefinitionLite[]) {
    this.availableActionsSig.set(value ?? []);
    this.rebuildCompatibilityIndex();
  }
  @Input() set workflowName(value: string | null | undefined) {
    const next = value ?? '';
    this.pendingWorkflowName = next;
    if (!this.form) return;

    const control = this.form.get('workflowName');
    if (control) {
      this.suppressNameEmit = true;
      if (control.value !== next) {
        this.form.patchValue({ workflowName: next }, { emitEvent: false });
      }
      queueMicrotask(() => (this.suppressNameEmit = false));
      return;
    }

    // Control not ready yet, will be applied in ngAfterViewInit
    setTimeout(() => {
      const c = this.form.get('workflowName');
      if (!c) return;
      this.suppressNameEmit = true;
      if (c.value !== this.pendingWorkflowName) {
        this.form.patchValue({ workflowName: this.pendingWorkflowName }, { emitEvent: false });
      }
      queueMicrotask(() => (this.suppressNameEmit = false));
    }, 0);
  }

  @Output() OnCanvasChange = new EventEmitter<{ nodes: WorkflowNode[]; edges: WorkflowEdge[] }>();
  @Output() selectionChange = new EventEmitter<{ nodeIds: string[]; edgeIds: string[] }>();
  @Output() validationChange = new EventEmitter<WorkflowValidationState>();
  @Output() workflowNameChange = new EventEmitter<string>();

  disabledSig = signal<boolean>(false);
  availableActionsSig = signal<ActionDefinitionLite[]>([]);
  executableNodesSig = signal<Set<PaletteType>>(new Set());
  graphValidSig = signal<boolean>(true);
  isPaletteDragging = signal<boolean>(false);
  showPalette = signal(false);
  paletteFilter = signal<string>('');
  filteredActions = computed<ActionDefinitionLite[]>(() => {
    const q = this.paletteFilter().trim().toLowerCase();
    const all = this.availableActionsSig();
    if (!q) return all;
    return all.filter(a => (a.type ?? '').toString().toLowerCase().includes(q));
  });
  filteredReusableActions = computed<ActionDefinitionLite[]>(() =>
    this.filteredActions().filter(a => this.isCompositeAction(a))
  );
  filteredNodeActions = computed<ActionDefinitionLite[]>(() =>
    this.filteredActions().filter(a => !this.isCompositeAction(a))
  );

  paletteForm!: FormGroup;
  paletteFieldConfig: FieldConfig[] = [];

  private execNodes = signal<WorkflowNode[]>([]);
  private uiNodes = signal<WorkflowNode[]>([]);
  private allNodes = computed(() => [...this.execNodes(), ...this.uiNodes()]);

  private _edges = signal<WorkflowEdge[]>([]);
  private zoom = signal<number>(1);
  private selectedEdges = signal<Set<string>>(new Set());
  private selectedNodes = signal<Set<string>>(new Set());
  private multiSelectMode = signal<boolean>(false);
  lastPointer = signal<{ x: number; y: number } | null>(null);
  edgeActionsOpen = signal<boolean>(false);
  edgeActionsHover = signal<boolean>(false);
  private edgeActionTarget: { edgeId: string; source: string; sourcePort: string; target: string; targetPort: string } | null = null;
  private edgeHoverCloseTimer: number | null = null;
  private tagConnectionsRaf: number | null = null;
  private pendingEdgesRaw: WorkflowEdge[] = [];

  public form!: FormGroup;
  public fieldConfig: FieldConfig[] = [];
  private pendingWorkflowName: string | null | undefined = null;
  private suppressNameEmit = false;

  selectedNodeId = signal<string | null>(null);

  pipelineDto = signal<PipelineWorkflowDTO | null>(null);
  runState = signal<Record<string, Status>>({});

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
    this.clearEdgeSelection();
  }

  @HostListener('document:keydown', ['$event'])
  onDocKeydown(e: KeyboardEvent): void {
    if (e.key === 'Shift' || e.metaKey || e.ctrlKey) {
      this.multiSelectMode.set(true);
    }
    if (e.key !== 'Delete' && e.key !== 'Backspace') return;
    if (this.isEditing(e)) return;
    const sel = this.selectedNodeId();
    if (!sel) return;
    e.preventDefault();
    e.stopPropagation();
    this.onDeleteNode(sel);
  }

  @HostListener('document:keyup', ['$event'])
  onDocKeyup(e: KeyboardEvent): void {
    if (e.key === 'Shift' || !e.metaKey) {
      this.multiSelectMode.set(false);
    }
  }

  @HostListener('document:mousemove', ['$event'])
  onPointerMove(e: MouseEvent): void {
    this.lastPointer.set({ x: e.clientX, y: e.clientY });
  }


  // Coalesce validation so workflow selection doesn't briefly show stale/incorrect state
  // when nodes/edges @Inputs arrive in separate setters.
  private validationScheduled = false;
  private schedulePublishGraphValidity(): void {
    if (this.validationScheduled) return;
    this.validationScheduled = true;
    queueMicrotask(() => {
      this.validationScheduled = false;
      this.publishGraphValidity();
    });
  }

  private sanitizeEdges(nodes: WorkflowNode[], edges: WorkflowEdge[]): WorkflowEdge[] {
    const byId = new Map(nodes.map(n => [n.id, n]));
    const hasInPort = (n: WorkflowNode, pid: string) => (n.ports?.inputs ?? []).some(p => p.id === pid);
    const hasOutPort = (n: WorkflowNode, pid: string) => (n.ports?.outputs ?? []).some(p => p.id === pid);

    return edges.filter(e => {
      const s = byId.get(e.source);
      const t = byId.get(e.target);
      if (!s || !t) return false;
      if ((t.ports?.inputs?.length ?? 0) === 0) return false;        // target has no inputs => drop
      if (!hasOutPort(s, e.sourcePort)) return false;                 // invalid port ids
      if (!hasInPort(t, e.targetPort)) return false;
      return true;
    });
  }

  private refreshValidationAndConnectivityAfterRender(): void {
    if (this.refreshAfterRenderScheduled) return;
    this.refreshAfterRenderScheduled = true;

    // 1 RAF is usually enough; 2 RAFs is extra-safe with dynamic component creation.
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        this.refreshAfterRenderScheduled = false;

        const edges = this._edges();
        const withUi = this.withUiConnectivity(this.allNodes(), edges);

        // Make every node receive its missing ports immediately
        this.emitConnectivity(withUi, edges);

        // Make header badge + any node-level validity reflect current state
        this.publishGraphValidity();
      });
    });
  }

  /** Apply edges deterministically (sanitize + connectivity + validation) */
  private applyEdges(raw: WorkflowEdge[], opts?: { skipIfSame?: boolean }): void {
    const nodes = this.allNodes();
    const incoming = this.sanitizeEdges(nodes, raw ?? []);

    const cur = this._edges();
    if (opts?.skipIfSame && incoming.length === cur.length && incoming.every((e, i) => e.id === cur[i]?.id)) {
      return;
    }

    this._edges.set(incoming);

    const nodesWithUi = this.withUiConnectivity(nodes, incoming);
    this.execNodes.set(nodesWithUi.filter(n => this.isExecutableNode(n)));
    this.uiNodes.set(nodesWithUi.filter(n => !this.isExecutableNode(n)));

    this.emitConnectivity(nodesWithUi, incoming);
    this.lastTopoSig = this.makeTopoSig(this.execNodes(), incoming);
    this.publishGraphValidity();
  }

  private isEditing(e: KeyboardEvent): boolean {
    // If any overlay/popup text control (e.g., mat-select panel) is open, bail.
    if (document.querySelector('.cdk-overlay-pane .mat-mdc-select-panel')) return true;

    const target = e.target as HTMLElement | null;
    if (!target) return false;

    // Walk up the composed path to catch shadow-DOM children (e.g. material inputs)
    const path = (e.composedPath?.() as EventTarget[]) ?? [target];
    const isTextInputLike = (el: EventTarget): boolean => {
      if (!(el instanceof HTMLElement)) return false;
      const tag = el.tagName?.toLowerCase();
      if (tag === 'input') {
        const type = (el as HTMLInputElement).type?.toLowerCase() || 'text';
        // treat all text-like inputs as editable
        return !['checkbox', 'radio', 'button', 'submit', 'reset', 'color', 'range', 'file'].includes(type);
      }
      if (tag === 'textarea' || tag === 'select') return true;
      // contenteditable (not "false")
      const ce = el.getAttribute?.('contenteditable');
      if (ce && ce.toLowerCase() !== 'false') return true;

      // common Angular Material / CDK text controls
      if (el.classList.contains('mat-mdc-input-element')) return true;
      if (el.getAttribute('role') === 'textbox') return true;

      return false;
    };

    for (const el of path) {
      if (isTextInputLike(el)) return true;
    }
    return false;
  }

  dfModel = computed<DfDataModel>(() => {
    // Include workflowChangeCounter to force recomputation on workflow switch
    this.workflowChangeCounter();
    const nodes = this.allNodes() ?? [];
    const edges = this._edges() ?? [];
    const outDeg = new Map<string, number>(), inDeg = new Map<string, number>();

    nodes.forEach(n => { outDeg.set(n.id, 0); inDeg.set(n.id, 0); });
    edges.forEach(e => {
      outDeg.set(e.source, (outDeg.get(e.source) ?? 0) + 1);
      inDeg.set(e.target, (inDeg.get(e.target) ?? 0) + 1);
    });

    const nodesArr: DfDataInitialNode[] = nodes.map((n) => {
      const renderType = this.resolveRenderType(n);
      const ports = this.ensurePorts(n.type, n.ports);

      const needsIn = (ports.inputs?.length ?? 0) > 0 && n.type !== 'input';
      const needsOut = (ports.outputs?.length ?? 0) > 0 && n.type !== 'result';
      const hasIn = (inDeg.get(n.id) ?? 0) > 0;
      const hasOut = (outDeg.get(n.id) ?? 0) > 0;

      const paramsUi = n.data?.params?.ui ?? {};

      const dataForDf = { ...n.data, actionsNodes: this.actionsNodes };
      const pos = n.x !== undefined || n.y !== undefined ? { position: { x: n.x, y: n.y } } : null;

      return {
        id: n.id,
        data: {
          ...dataForDf,
          type: renderType,
          ui: paramsUi,
          ports,
          __missingIn: needsIn && !hasIn,
          __missingOut: needsOut && !hasOut,
        },
        ...pos,
        //startNode: n.type === 'input',
        //endNode: n.type === 'result',
      };
    });

    const idSet = new Set(nodes.map(n => n.id));
    const nodeMap = new Map(nodes.map(n => [n.id, n]));
    const conns: DfDataConnection[] = edges
      .filter(e => idSet.has(e.source) && idSet.has(e.target))
      .filter(e => {
        const s = nodeMap.get(e.source);
        const t = nodeMap.get(e.target);
        if (!s || !t) return false;

        const sp = this.ensurePorts(s.type, s.ports);
        const tp = this.ensurePorts(t.type, t.ports);

        if ((tp.inputs?.length ?? 0) === 0) return false;

        return (sp.outputs ?? []).some(p => p.id === e.sourcePort)
          && (tp.inputs ?? []).some(p => p.id === e.targetPort);
      })
      .map(e => {
        const sourceNode = nodeMap.get(e.source);
        const targetNode = nodeMap.get(e.target);
        const isDisabled = sourceNode?.data?.params?.['__disabled'] || targetNode?.data?.params?.['__disabled'];

        return {
          id: e.id,
          source: {
            nodeId: e.source,
            connectorType: DfConnectionPoint.Output,
            connectorId: e.sourcePort,
          },
          target: {
            nodeId: e.target,
            connectorType: DfConnectionPoint.Input,
            connectorId: e.targetPort,
          },
          label: { content: e.label },
          style: isDisabled ? { opacity: 0.3, strokeDasharray: '5,5' } : undefined,
        };
      });

    return { nodes: nodesArr, connections: conns };
  });
  private fileCache = new Map<string, Record<string, Binary | Binary[]>>();

  private formInvalidByNode = new Map<string, { invalid: boolean; fields?: string[] }>();

  quickAddOpen = false;
  quickAddCtx:
    | {
      sourceNodeId: string;
      sourcePortId: string;
      sourcePortType?: string;
      anchorRect?: DOMRect;
      replaceMode?: boolean;
    }
    | null = null;

  quickAddItems: { type: string; icon?: string; label: string }[] = [];
  qaClient: { x: number; y: number } | null = null;
  existingTargets: { id: string; label: string; icon: string; type: PaletteType }[] = [];

  private idSeq = 0;
  private genId(prefix = 'n'): string { return `${prefix}_${Date.now().toString(36)}_${++this.idSeq}`; }

  private compatibleIndex = new Map<string, { type: string; icon?: string; label: string }[]>();
  private workflowsStore = inject(WorkflowsStore);
  private simStates = new Map<string, Record<string, Status>>();

  constructor(
    private bus: WfCanvasBus,
    private readonly fb: FormBuilder,
    private readonly fields: FieldConfigService,
    private toast: ToastService,
    private renderer: Renderer2
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
      this.bus.runFromNode$.subscribe(({ nodeId }) => this.runStartingFrom(nodeId))
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
        this.bus.nodeFlagsPatch$.next({ nodeId, flags: { __formInvalid: invalid } });
        this.publishGraphValidity();
      })
    );
    this.subs.add(
      this.bus.nodePortsChanged$.subscribe(({ nodeId, inputs, outputs }) =>
        this.updateNodePorts(nodeId, inputs, outputs)
      )
    );
    this.subs.add(
      this.bus.nodeLabelChanged$.subscribe(({ nodeId, label }) =>
        this.updateNodeLabel(nodeId, label)
      )
    );
    this.subs.add(
      this.bus.openQuickAdd$.subscribe(({ nodeId, portId, portType, anchorEl, replaceMode }) => {
        const r = anchorEl.getBoundingClientRect();

        this.qaClient = { x: r.right + 8, y: r.top + r.height / 2 };

        this.quickAddCtx = {
          sourceNodeId: nodeId,
          sourcePortId: portId,
          sourcePortType: portType,
          anchorRect: r,
          replaceMode: !!replaceMode,
        };

        this.quickAddItems = this.compatibleFor(portType, { mode: 'connect' });
        this.buildExistingTargets(nodeId, portType);
        this.quickAddOpen = true;

        const mode = replaceMode ? 'replace' : 'connect';
        this.quickAddItems = this.compatibleFor(portType, { mode });
      })
    );
    this.subs.add(
      this.bus.quickAddPick$.subscribe(pick => this.handleQuickAddPick(pick))
    );

    this.subs.add(
      this.bus.toggleDetailsPanel$.subscribe(({ dto, preferredTab, title, toggleOff }) =>
        this.toggleDetailsPanel(dto, preferredTab, title, toggleOff)
      )
    );

    this.subs.add(
      this.bus.togglePreviewPanel$.subscribe(({ dto, title, toggleOff }) =>
        this.togglePreviewPanel(dto, title, toggleOff)
      )
    );
    this.subs.add(
      this.bus.onNodeDelete$.subscribe(({ nodeId }) => this.onDeleteNode(nodeId))
    );

    this.subs.add(
      combineLatest([
        this.workflowsStore.executionHistory$,
        this.workflowsStore.selectedWorkflowId$
      ]).subscribe(([history, wfId]) => {
        const filtered = wfId ? history.filter(r => r.workflowId === wfId) : [];
        const runs = filtered.map(r => ({
          id: r.id,
          startedAt: new Date(r.startedAt).getTime(),
          workflow: r.workflowSnapshot ?? this.buildWorkflowDTOFromSnapshot(r.snapshotNodes, r.snapshotEdges, r.workflowName),
          state: r.nodeStatuses ?? {},
          logs: r.logs ?? [],
          nodeData: this.toRunNodePayloadMap(r.nodeData),
          edgeData: r.edgeData ?? {},
          status: r.status,
          finishedAt: r.finishedAt ? new Date(r.finishedAt).getTime() : undefined,
        }));
        this.runs.set(runs);
        this.bus.runs$.next(runs);
      })
    );

    this.subs.add(
      combineLatest([
        this.workflowsStore.viewingExecution$,
        this.workflowsStore.currentExecution$
      ]).subscribe(([viewing, current]) => {
        const run = viewing ?? current;
        const state = run?.nodeStatuses ?? {};
        this.currentRunId = run?.id ?? null;
        this.runState.set(state);
        this.bus.runState$.next(state);
      })
    );

    effect(() => {
      this.execNodes();
      this._edges();
      queueMicrotask(() => {
        this.publishGraphValidity();
        this.scheduleTagConnections();
      });
    });
  }


  ngAfterViewInit() {
    const el = this.flowElementRef.nativeElement;

    // Check if the selected Node is the scene to remove selected outline 
    this.subs.add(this.renderer.listen(el, 'click', (ev: MouseEvent) => {
      const target = ev.target as HTMLElement | null;
      const isScene =
        target === el || (target && target.tagName.toUpperCase() === 'DF-SCENE') || (target && target.tagName.toUpperCase() === 'PATH');

      if (isScene) {
        this.setSelectedNode(null);
      }
    }));

    // Apply pending workflow name if it was set before form control was ready
    if (this.pendingWorkflowName !== null && this.form.get('workflowName')) {
      if (this.form.get('workflowName')?.value !== this.pendingWorkflowName) {
        this.form.patchValue({ workflowName: this.pendingWorkflowName }, { emitEvent: false });
      }
    }

    this.scheduleTagConnections();
    this.refreshValidationAndConnectivityAfterRender();
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

    // Apply pending workflow name if form is ready
    if (this.pendingWorkflowName !== null) {
      setTimeout(() => {
        if (this.form.get('workflowName')) {
          this.suppressNameEmit = true;
          if (this.form.get('workflowName')?.value !== this.pendingWorkflowName) {
            this.form.patchValue({ workflowName: this.pendingWorkflowName }, { emitEvent: false });
          }
          queueMicrotask(() => (this.suppressNameEmit = false));
        }
      }, 100);
    }

    this.subs.add(
      this.form.valueChanges
        .pipe(
          debounceTime(150),
          distinctUntilChanged((a, b) => (a?.['workflowName'] ?? '') === (b?.['workflowName'] ?? ''))
        )
        .subscribe((v) => {
          if (this.suppressNameEmit) return;
          const name = (v?.['workflowName'] ?? '') as string;
          if (!name.trim()) return;
          this.workflowNameChange.emit(name);
        })
    );

    this.paletteForm = this.fb.group({});
    this.paletteFieldConfig = [
      this.fields.getTextField({
        name: 'search',
        label: this.translate.instant('workflow.palette.search'),
        placeholder: this.translate.instant('workflow.palette.search'),
        layoutClass: 'primary',
        required: false,
        helperText: this.translate.instant('workflow.palette.search'),
      }),
    ];
    this.subs.add(
      this.paletteForm.valueChanges.subscribe((values) => {
        this.paletteFilter.set(values.search || '');
      })
    );

    this.applyReadOnlyState();
    queueMicrotask(() => this.publishGraphValidity());
  }

  ngOnDestroy(): void {
    this.subs.unsubscribe();
  }

  private toRunNodePayloadMap(v: unknown): Record<string, RunNodePayload> {
    if (!v || typeof v !== 'object') return {};
    return v as Record<string, RunNodePayload>;
  }

  private findInPath<T extends Element = Element>(
    ev: Event,
    predicate: (el: Element) => boolean
  ): T | null {
    const path = (ev.composedPath?.() ?? []) as Element[];
    return (path.find(el => el instanceof Element && predicate(el)) as T) ?? null;
  }

  private scheduleTagConnections(): void {
    if (!this.flowElementRef?.nativeElement) return;
    if (this.tagConnectionsRaf) {
      cancelAnimationFrame(this.tagConnectionsRaf);
    }
    this.tagConnectionsRaf = requestAnimationFrame(() => {
      this.tagConnectionsRaf = null;
      this.tagConnectionElements();
    });
  }

  private tagConnectionElements(): void {
    const host = this.flowElementRef?.nativeElement as HTMLElement | undefined;
    if (!host) return;
    const conns = Array.from(host.querySelectorAll('df-connection')) as HTMLElement[];
    for (const el of conns) {
      const conn = this.extractConnectionFromElement(el);
      if (!conn) continue;
      const id = this.makeEdgeId(conn.source.nodeId, conn.source.connectorId, conn.target.nodeId, conn.target.connectorId);
      el.dataset['edgeId'] = id;
      const path = el.querySelector('path.selectable-area') as SVGPathElement | null;
      if (path) path.dataset['edgeId'] = id;
    }
  }

  private extractConnectionFromElement(el: HTMLElement): DfDataConnection | null {
    const direct = (el as unknown as { connection?: DfDataConnection }).connection;
    if (direct?.source && direct?.target) return direct;
    const ctx = (el as unknown as { __ngContext__?: unknown[] }).__ngContext__;
    if (!Array.isArray(ctx)) return null;
    for (const item of ctx) {
      if (!item || typeof item !== 'object') continue;
      const conn = (item as { connection?: DfDataConnection }).connection;
      if (conn?.source && conn?.target) return conn;
    }
    return null;
  }

  private resolveEdgeIdFromEvent(ev: PointerEvent): string | null {
    const tagged = this.findInPath<HTMLElement>(ev, el => el instanceof HTMLElement && el.hasAttribute('data-edge-id'));
    const attr = tagged?.getAttribute('data-edge-id');
    if (attr) return attr;

    const connEl = this.findInPath<HTMLElement>(ev, el => el.tagName?.toLowerCase() === 'df-connection');
    if (!connEl) return null;
    const conn = this.extractConnectionFromElement(connEl);
    if (!conn) return null;
    return this.makeEdgeId(conn.source.nodeId, conn.source.connectorId, conn.target.nodeId, conn.target.connectorId);
  }

  private buildExistingTargets(sourceNodeId: string, sourcePortType?: string): void {
    const t = (x?: string) => x ?? 'any';

    this.existingTargets = this.execNodes()
      .filter(n => n.id !== sourceNodeId)
      .filter(n => (n.ports?.inputs?.length ?? 0) > 0)
      // All nodes are runnable now
      .filter(n => {
        const ins = n.ports?.inputs ?? [];
        return ins.length === 0 || ins.some(ip => t(ip.type) === t(sourcePortType) || t(ip.type) === 'any' || t(sourcePortType) === 'any');
      })
      .map(n => ({
        id: n.id,
        type: n.type as PaletteType,
        label: (n.data?.label as string) || this.humanLabelFor(n.type as PaletteType),
        icon: (n.data?.params?.['icon'] as string) || ''
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
        return { ...n, data: next as RunNodeDTO };
      },
      { emitToParentIfExec: true }
    );
  };

  toggleRunPanel(anchorNodeId?: string): void {
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
    let anchor: WorkflowNode | undefined;

    if (anchorNodeId) {
      anchor = all.find(n => n.id === anchorNodeId);
      const rp: WorkflowNode = {
        id: RUN_PANEL_ID,
        type: 'run-panel',
        x: anchor?.x ? anchor?.x + 420 : 460,
        y: anchor?.y !== undefined ? anchor.y : 200,
        data: { label: 'Run' },
        ports: { inputs: [], outputs: [] },
      };

      this.uiNodes.set([...ui, rp]);
    } else {
      const rp: WorkflowNode = {
        id: RUN_PANEL_ID,
        type: 'run-panel',
        data: { label: 'Run' },
        ports: { inputs: [], outputs: [] },
      };

      this.uiNodes.set([...ui, rp]);
    }

    const withUi = this.withUiConnectivity(this.allNodes(), this._edges());
    this.execNodes.set(withUi.filter(n => this.isExecutableNode(n)));
    this.uiNodes.set(withUi.filter(n => !this.isExecutableNode(n)));
  }

  private toggleDetailsPanel(
    dto?: RunNodeDTO,
    preferredTab?: PreferredTab,
    title?: string,
    toggleOff?: boolean
  ): void {
    const DETAILS_ID = 'details-node' + '-' + title;
    const ui = this.uiNodes();

    const idx = ui.findIndex(n => n.id === DETAILS_ID);

    if (toggleOff || idx >= 0) {
      const nextUi = ui.slice();
      nextUi.splice(idx, 1);
      this.uiNodes.set(nextUi);

      const withUi = this.withUiConnectivity(this.allNodes(), this._edges());
      this.execNodes.set(withUi.filter(n => this.isExecutableNode(n)));
      this.uiNodes.set(withUi.filter(n => !this.isExecutableNode(n)));
      return;
    }

    const dn: WorkflowNode = {
      id: DETAILS_ID,
      type: 'details',
      data: {
        label: title ?? dto?.label ?? 'workflow.runPanel.details',
        title: title ?? dto?.label ?? 'workflow.runPanel.details',
        preferredTab,
        ...dto,
      },
      ports: { inputs: [], outputs: [] },
    };

    this.uiNodes.set([...ui, dn]);

    const withUi = this.withUiConnectivity(this.allNodes(), this._edges());
    this.execNodes.set(withUi.filter(n => this.isExecutableNode(n)));
    this.uiNodes.set(withUi.filter(n => !this.isExecutableNode(n)));
  }

  private togglePreviewPanel(
    dto?: RunNodeDTO,
    title?: string,
    toggleOff?: boolean
  ): void {
    const DETAILS_ID = 'preview-node' + '-' + title;
    const ui = this.uiNodes();

    const idx = ui.findIndex(n => n.id === DETAILS_ID);

    if (toggleOff || idx >= 0) {
      const nextUi = ui.slice();
      nextUi.splice(idx, 1);
      this.uiNodes.set(nextUi);

      const withUi = this.withUiConnectivity(this.allNodes(), this._edges());
      this.execNodes.set(withUi.filter(n => this.isExecutableNode(n)));
      this.uiNodes.set(withUi.filter(n => !this.isExecutableNode(n)));
      return;
    }

    const dn: WorkflowNode = {
      id: DETAILS_ID,
      type: 'preview',
      data: {
        label: title ?? dto?.label ?? 'workflow.runPanel.preview',
        title: title ?? dto?.label ?? 'workflow.runPanel.preview',
        ...dto,
      },
      ports: { inputs: [], outputs: [] },
    };

    this.uiNodes.set([...ui, dn]);

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
    const validation = this.computeValidation(nodes, edges);
    this.graphValidSig.set(!!validation.valid);
    this.bus.graphValid$.next(validation.valid);
    this.validationChange.emit(validation);
  }

  private computeValidation(
    nodesArg: WorkflowNode[] | null | undefined,
    edgesArg: WorkflowEdge[] | null | undefined
  ): WorkflowValidationState {

    const isDisabledNode = (n: WorkflowNode) => !!n.data?.params?.['__disabled'];

    const nodes = (nodesArg ?? [])
      .filter(n => this.isExecutableNode(n))
      .filter(n => !isDisabledNode(n));

    const nodeIdSet = new Set(nodes.map(n => n.id));

    const edges = (edgesArg ?? [])
      .filter(e => nodeIdSet.has(e.source) && nodeIdSet.has(e.target));

    const nodeValidity: Record<string, boolean> = {};
    let valid = true;

    // An empty canvas should not block the UI with a validation error.
    // Treat it as valid so the "invalid graph" badge only appears when there are nodes.
    if (nodes.length === 0) {
      return { valid: true, nodeValidity };
    }

    const outMap = new Map<string, WorkflowEdge[]>(), inMap = new Map<string, WorkflowEdge[]>();
    for (const n of nodes) { outMap.set(n.id, []); inMap.set(n.id, []); }
    for (const e of edges) { outMap.get(e.source)!.push(e); inMap.get(e.target)!.push(e); }
    const inByPort = new Map<string, number>();
    const outByPort = new Map<string, number>();
    for (const e of edges) {
      const inKey = `${e.target}::${e.targetPort}`;
      const outKey = `${e.source}::${e.sourcePort}`;
      inByPort.set(inKey, (inByPort.get(inKey) ?? 0) + 1);
      outByPort.set(outKey, (outByPort.get(outKey) ?? 0) + 1);
    }

    for (const n of nodes) {
      const ports = this.ensurePorts(n.type, n.ports);
      const requiredInputs = (ports.inputs ?? []).filter(p => p.required === true);
      const requiredOutputs = (ports.outputs ?? []).filter(p => p.required === true);
      const allRequiredInputsMet = requiredInputs.every(p => (inByPort.get(`${n.id}::${p.id}`) ?? 0) > 0);
      const allRequiredOutputsMet = requiredOutputs.every(p => (outByPort.get(`${n.id}::${p.id}`) ?? 0) > 0);
      const good =
        allRequiredInputsMet &&
        allRequiredOutputsMet &&
        !this.formInvalidByNode.get(n.id)?.invalid;
      nodeValidity[n.id] = good;
      valid = valid && good;
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
    if (visited !== nodes.length) valid = false;

    return { valid, nodeValidity };
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
      ports: this.ensurePorts(n.type, n.ports),
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
    return nodes.map(n => {
      const ports = this.ensurePorts(n.type, n.ports);
      const requiredInputs = (ports.inputs ?? []).filter(p => p.required === true);
      const requiredOutputs = (ports.outputs ?? []).filter(p => p.required === true);
      const missingInputs = requiredInputs
        .filter(p => !edges.some(e => e.target === n.id && e.targetPort === p.id))
        .map(p => p.id);
      const missingOutputs = requiredOutputs
        .filter(p => !edges.some(e => e.source === n.id && e.sourcePort === p.id))
        .map(p => p.id);

      const nextParams = {
        ...(n.data?.params ?? {}),
        __missingIn: missingInputs.length > 0,
        __missingOut: missingOutputs.length > 0,
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

    const host = this.flowElementRef?.nativeElement;
    const scene = host?.querySelector('df-scene') as HTMLElement | null;
    const hostRect = host?.getBoundingClientRect();
    const sceneRect = scene?.getBoundingClientRect() ?? hostRect;
    const point = (ev as unknown as { dropPoint?: { x: number; y: number } }).dropPoint
      ?? this.lastPointer()
      ?? { x: sceneRect?.left ?? 0, y: sceneRect?.top ?? 0 };
    const actionPorts = action.params?.['ports'] as WorkflowNode['ports'] | undefined;
    const { x: nodeOffsetX, y: nodeOffsetY } = this.estimateNodeOffset(action.type, actionPorts);
    const zoom = this.zoom() || 1;
    const x = sceneRect ? (point.x - sceneRect.left) / zoom - nodeOffsetX : 0;
    const y = sceneRect ? (point.y - sceneRect.top) / zoom - nodeOffsetY : 0;
    const id = crypto?.randomUUID() ?? this.genId('n');
    const isComposite = this.isCompositeAction(action);
    const nodeType = isComposite ? 'composite' : action.type;
    const aiType = action.type;
    const actionParams = { ...(action.params ?? {}) } as Record<string, unknown>;
    delete actionParams['ports'];
    delete actionParams['label'];
    delete actionParams['class'];
    delete actionParams['workflowId'];
    const node: WorkflowNode = {
      id,
      type: nodeType,
      x: Math.round(x),
      y: Math.round(y),
      data: {
        label: (action.params?.['label'] as string | undefined) ?? this.humanLabelFor(action.type),
        aiType: aiType as InspectorActionType,
        params: {
          ...actionParams,
          ui: { expanded: true },
          __workflowId: isComposite ? (action.params?.['workflowId'] as string | undefined) : undefined,
        },
      },
      ports: this.ensurePorts(nodeType, actionPorts),
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

    this.emitGraphChange(execNext, this._edges());

    this.emitConnectivity(withUi, this._edges());

    this.publishGraphValidity();
    this.schedulePostDropValidation();
  }

  private schedulePostDropValidation(): void {
    setTimeout(() => {
      const withUi = this.withUiConnectivity([...this.execNodes(), ...this.uiNodes()], this._edges());
      this.emitConnectivity(withUi, this._edges());
      this.publishGraphValidity();
    }, 0);
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

    const now = Date.now();
    for (const [id, ts] of [...this.recentlyDeleted]) {
      if (now - ts > this.deletionWindowMs) this.recentlyDeleted.delete(id);
    }

    const prevById = new Map<string, WorkflowNode>([...prevExec, ...prevUi].map(n => [n.id, n]));
    const fromDf: WorkflowNode[] = noNodes ? [] : m.nodes!.map(raw => {
      const prev = prevById.get(raw.id);
      const rawData = raw.data ?? {};
      const pos = (raw as DfDataNode).position ?? { x: prev?.x ?? 0, y: prev?.y ?? 0 };
      const type = (rawData.type as PaletteType) ?? prev?.type;
      const ports = this.ensurePorts(type, (rawData as Record<string, unknown>)?.['ports'] as WorkflowNode['ports'] ?? prev?.ports);
      const prevParams = (prev?.data?.params ?? {}) as Record<string, unknown>;
      const rawParams = (rawData as Record<string, unknown>)?.['params'] as Record<string, unknown> ?? {};

      const mergedUi = {
        ...(prevParams?.['ui'] as Record<string, unknown> ?? {}),
        ...(rawParams?.['ui'] as Record<string, unknown> ?? {})
      };

      const params = { ...prevParams, ...rawParams, ui: mergedUi };
      const data = { ...(prev?.data ?? {}), ...rawData, params, type };

      return { id: raw.id, type, x: pos.x, y: pos.y, data, ports };
    })
      // Do NOT resurrect nodes that were just deleted locally
      .filter(n => !this.recentlyDeleted.has(n.id));

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

  onCanvasCLick() {
    this.setSelectedNode(null);
  }

  onNodeMoved(_evt: unknown): unknown {
    const event = _evt as { nodeId?: string; id?: string };
    const id = event?.nodeId ?? event?.id;
    if (id) this.bus.nodeMoved$.next({ nodeId: id, at: Date.now() });
    return event;
  }

  onConnectionSelected(evt: unknown): unknown {
    const event = evt as {
      target?: {
        id?: string;
        source?: { nodeId: string; connectorId: string };
        target?: { nodeId: string; connectorId: string };
      };
    };
    const t = event?.target?.target;
    const s = event?.target?.source;

    const derivedId =
      s && t ? this.makeEdgeId(s.nodeId, s.connectorId, t.nodeId, t.connectorId) : null;

    const rawId =
      (event?.target && 'id' in event.target ? (event.target as { id?: string }).id : null) ??
      (event?.target?.target && 'id' in event.target.target ? (event.target.target as { id?: string }).id : null) ??
      null;

    const id = derivedId ?? rawId;
    if (!id) return evt;

    const next = new Set(this.selectedEdges());
    if (this.multiSelectMode()) {
      if (next.has(id)) next.delete(id); else next.add(id);
    } else {
      next.clear(); next.add(id);
    }
    this.selectedEdges.set(next);
    this.emitSelection();

    return evt;
  }

  onConnectionCreated(evt: DfEvent<DfDataConnection>): void {
    const t = evt?.target?.target, s = evt?.target?.source;
    if (!s || !t) return;

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
    this.schedulePublishGraphValidity();

    this.emitGraphChange(this.execNodes(), after);
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
    this.schedulePublishGraphValidity();

    this.emitGraphChange(this.execNodes(), after);
  }

  setSelectedNode(id: string | null): void {
    const host = this.flowElementRef?.nativeElement;
    if (!host) {
      this.selectedNodeId.set(id);
      return;
    }

    const prevSet = new Set(this.selectedNodes());
    let nextSet = new Set(prevSet);

    if (id === null) {
      nextSet.clear();
      this.selectedNodeId.set(null);
    } else if (this.multiSelectMode()) {
      if (nextSet.has(id)) {
        nextSet.delete(id);
      } else {
        nextSet.add(id);
      }
      this.selectedNodeId.set(id);
    } else {
      nextSet = new Set([id]);
      this.selectedNodeId.set(id);
    }

    // update DOM classes
    prevSet.forEach(pid => {
      if (!nextSet.has(pid)) {
        host.querySelector(`[data-node-id="${pid}"]`)?.classList.remove('is-selected');
      }
    });
    nextSet.forEach(nid => {
      host.querySelector(`[data-node-id="${nid}"]`)?.classList.add('is-selected');
    });

    this.selectedNodes.set(nextSet);

    if (!this.multiSelectMode()) {
      this.selectedEdges.set(new Set());
      this.edgeActionsOpen.set(false);
    }

    this.emitSelection(Array.from(nextSet));
  }

  onDeleteNode = (id: string): void => {
    if (!id) return;

    // Remember the deletion to ignore upstream echoes
    this.recentlyDeleted.set(id, Date.now());

    // UI node?
    const ui = this.uiNodes();
    const uiIdx = ui.findIndex(n => n.id === id);
    if (uiIdx >= 0) {
      const nextUi = ui.slice();
      nextUi.splice(uiIdx, 1);
      this.uiNodes.set(nextUi);

      const withUi = this.withUiConnectivity([...this.execNodes(), ...nextUi], this._edges());
      this.emitConnectivity(withUi, this._edges());

      if (this.selectedNodeId() === id) this.setSelectedNode(null);
      return;
    }


    // Exec node branch
    const exec = this.execNodes();
    const node = exec.find(n => n.id === id);
    if (!node) return;

    // Collect edges that touch this node
    const toRemove = this._edges().filter(e => e.source === id || e.target === id);

    // Tell DF to remove them right now (visual GC)
    try {
      const api = this.flow;
      for (const e of toRemove) {
        api?.removeConnection({
          source: {
            nodeId: e.source,
            connectorType: DfConnectionPoint.Output,
            connectorId: e.sourcePort,
          },
          target: {
            nodeId: e.target,
            connectorType: DfConnectionPoint.Input,
            connectorId: e.targetPort,
          },
        });
      }
    } catch { /* ignore */ }

    const nextExec = exec.filter(n => n.id !== id);
    const nextEdges = this._edges().filter(e => e.source !== id && e.target !== id);

    this.lastLocalChangeAt = Date.now();
    this.lastTopoSig = this.makeTopoSig(nextExec, nextEdges);

    this.execNodes.set(nextExec);
    this._edges.set(nextEdges);

    const withUi = this.withUiConnectivity([...nextExec, ...this.uiNodes()], nextEdges);
    this.emitConnectivity(withUi, nextEdges);
    this.publishGraphValidity();

    if (this.selectedNodeId() === id) this.setSelectedNode(null);
    const nextSel = new Set(this.selectedNodes());
    if (nextSel.delete(id)) {
      this.selectedNodes.set(nextSel);
      this.emitSelection(Array.from(nextSel));
    }
    this.clearEdgeSelection();

    this.emitGraphChange(nextExec, nextEdges);
  };

  submit(): void {
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      this.toast.showError(this.translate.instant('form.errors.fixFields'));
      return;
    }

    const nodes = this.execNodes();
    const edges = this._edges();
    const validation = this.computeValidation(nodes, edges);
    if (!validation.valid) {
      this.toast.showError(this.translate.instant('workflow.errors.invalid_graph'));
      return;
    }

    const dto = this.buildWorkflowDTO(nodes, edges);
    // TODO: handle dto submit to API
    void dto;
  }

  private emitConnectivity(nodes: WorkflowNode[], edges: WorkflowEdge[]): void {
    for (const n of nodes) {
      const ports = this.ensurePorts(n.type, n.ports);
      const requiredInputs = (ports.inputs ?? []).filter(p => p.required === true);
      const requiredOutputs = (ports.outputs ?? []).filter(p => p.required === true);
      const missingInputs = requiredInputs
        .filter(p => !edges.some(e => e.target === n.id && e.targetPort === p.id))
        .map(p => p.id);
      const missingOutputs = requiredOutputs
        .filter(p => !edges.some(e => e.source === n.id && e.sourcePort === p.id))
        .map(p => p.id);
      const missingIn = missingInputs.length > 0;
      const missingOut = missingOutputs.length > 0;
      this.bus.nodeConnectivity$.next({ nodeId: n.id, missingIn, missingOut });
      this.bus.nodePortStatus$.next({ nodeId: n.id, missingInputs, missingOutputs });
    }
  }

  showRunPanel(): boolean {
    const RUN_PANEL_ID = 'run-panel-node';
    const ui = this.uiNodes();
    const idx = ui.findIndex(n => n.id === RUN_PANEL_ID || n.type === 'run-panel');

    return idx >= 0
  }

  private emitSelection(nodeIdsOverride?: string[]): void {
    const nodeIds = nodeIdsOverride ?? Array.from(this.selectedNodes());
    const edgeIds = Array.from(this.selectedEdges());
    this.selectionChange.emit({ nodeIds, edgeIds });
  }

  private clearEdgeSelection(): void {
    if (this.selectedEdges().size === 0) return;
    this.selectedEdges.set(new Set());
    this.emitSelection();
    this.edgeActionsOpen.set(false);
    this.edgeActionTarget = null;
  }

  deleteSelectedEdge(): void {
    if (!this.edgeActionTarget) return;
    const id = this.edgeActionTarget.edgeId;
    const after = this._edges().filter(e => e.id !== id);
    this._edges.set(after);
    this.edgeActionsOpen.set(false);
    this.edgeActionTarget = null;
    this.clearEdgeSelection();

    const combined = [...this.execNodes(), ...this.uiNodes()];
    const withUi = this.withUiConnectivity(combined, after);
    this.emitConnectivity(withUi, after);
    this.publishGraphValidity();

    this.emitGraphChange(this.execNodes(), after);
  }

  insertNodeOnEdge(): void {
    if (!this.edgeActionTarget) return;
    const edge = this._edges().find(e => e.id === this.edgeActionTarget?.edgeId);
    if (!edge) return;

    const sourceNode = this.allNodes().find(n => n.id === edge.source);
    const srcPortType = sourceNode?.ports?.outputs?.find(p => p.id === edge.sourcePort)?.type;

    // remove edge and open quick-add from its source
    const after = this._edges().filter(e => e.id !== edge.id);
    this._edges.set(after);
    this.edgeActionsOpen.set(false);
    this.edgeActionTarget = null;
    this.clearEdgeSelection();

    const combined = [...this.execNodes(), ...this.uiNodes()];
    const withUi = this.withUiConnectivity(combined, after);
    this.emitConnectivity(withUi, after);
    this.publishGraphValidity();
    this.emitGraphChange(this.execNodes(), after);

    if (!sourceNode) return;
    this.quickAddCtx = {
      sourceNodeId: edge.source,
      sourcePortId: edge.sourcePort,
      sourcePortType: srcPortType,
      anchorRect: undefined,
    };
    this.quickAddItems = this.compatibleFor(srcPortType);
    this.buildExistingTargets(edge.source, srcPortType);
    this.quickAddOpen = true;
  }

  runStartingFrom(nodeId: string): void {
    const node = this.execNodes().find(n => n.id === nodeId);
    if (!node) {
      this.toast.showError(this.translate.instant('workflow.errors.nodeNotFound'));
      return;
    }

    // simple check: node must have inputs satisfied or pinned data exists (stored in fileCache as placeholder for now)
    const incoming = this._edges().filter(e => e.target === nodeId);
    const ports = this.ensurePorts(node.type, node.ports);
    const needsIn = (ports.inputs?.length ?? 0) > 0 && node.type !== 'input';
    const hasIn = incoming.length > 0;
    const hasPinned = !!this.fileCache.get(nodeId);
    if (needsIn && !hasIn && !hasPinned) {
      this.toast.showError(this.translate.instant('workflow.errors.missingPinnedData'));
      return;
    }

    const { nodes, edges } = this.subgraphFrom(nodeId);
    this.startRunWithGraph(nodes, edges, nodeId);
  }

  private updateRunState(runId: string, mut: (s: Record<string, Status>) => void): void {
    const prev = { ...(this.simStates.get(runId) ?? {}) };
    const cur = { ...prev };
    mut(cur);
    this.simStates.set(runId, cur);

    const changed = Object.keys(cur).filter(id => prev[id] !== cur[id]);
    for (const nodeId of changed) {
      const status = cur[nodeId];
      this.workflowsStore.updateNodeStatus({ executionId: runId, nodeId, status });
      this.workflowsStore.appendLog({
        executionId: runId,
        message: `${nodeId}: ${status}`
      });
      if (status === 'success') {
        this.recordNodeData(runId, nodeId);
      }
    }
  }

  private recordNodeData(runId: string, nodeId: string): void {
    const run = this.runs().find(r => r.id === runId);
    if (!run) return;

    const node = run.workflow.nodes.find(n => n.id === nodeId) as (WorkflowNode | undefined);
    const now = new Date().toISOString();
    const ports = node?.ports ?? { inputs: [], outputs: [] };
    const params = node?.data?.params ?? {};
    const incoming = run.workflow.edges.filter(e => e.target === nodeId);
    const outgoing = run.workflow.edges.filter(e => e.source === nodeId);

    const inputs = (ports.inputs ?? []).map(p => {
      const edges = incoming.filter(e => e.targetPort === p.id);
      return {
        id: p.id,
        label: p.label,
        type: p.type ?? 'json',
        required: p.required === true,
        connected: edges.length > 0,
        sources: edges.map(e => ({
          edgeId: e.id,
          from: e.source,
          sourcePort: e.sourcePort,
        })),
        value: edges.length ? { from: edges.map(e => e.source) } : null,
      };
    });

    const outputs = (ports.outputs ?? []).map(p => {
      const edges = outgoing.filter(e => e.sourcePort === p.id);
      return {
        id: p.id,
        label: p.label,
        type: p.type ?? 'json',
        required: p.required === true,
        connected: edges.length > 0,
        targets: edges.map(e => ({
          edgeId: e.id,
          to: e.target,
          targetPort: e.targetPort,
        })),
        value: { params },
      };
    });

    const payload = {
      nodeId,
      at: now,
      params,
      inputs,
      outputs,
    };

    const edgeData: Record<string, unknown> = {};
    for (const e of outgoing) {
      edgeData[e.id] = {
        from: e.source,
        to: e.target,
        sourcePort: e.sourcePort,
        targetPort: e.targetPort,
        payload: { params, fromNode: e.source, toNode: e.target },
      };
    }

    this.workflowsStore.mergeExecutionData({
      executionId: runId,
      nodeData: { [nodeId]: payload },
      edgeData,
    });
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

    const unlockChildren = (u: string): void => {
      for (const e of wf.edges) {
        if (e.source === u) {
          const d = (sim.indeg.get(e.target) ?? 0) - 1;
          sim.indeg.set(e.target, d);
          if (d === 0) sim.ready.push(e.target);
        }
      }
    };

    const step = (): void => {
      if (!sim.running || sim.pipelineCancelled) return;
      if (sim.ready.length === 0) {
        sim.running = false;
        this.workflowsStore.completeExecution({ executionId: runId, status: 'success' });
        this.workflowsStore.appendLog({ executionId: runId, message: 'Run completed' });
        return;
      }

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
          this.updateRunState(runId, s => s[id] = 'success');
        }
        unlockChildren(id);
        step();
      }, 3000);

      sim.timers.set(id, to);
    };

    step();
  }

  handleStageCancel(e: { index: number; nodeIds: string[]; runId?: string }): void {
    const runId = e.runId ?? this.currentRunId; if (!runId) return;
    const sim = this.sims.get(runId); if (!sim) return;

    const wf = this.runs().find(r => r.id === runId)?.workflow; if (!wf) return;

    const removeFromReady = (id: string): void => {
      const idx = sim.ready.indexOf(id);
      if (idx >= 0) sim.ready.splice(idx, 1);
    };

    const unlockChildren = (u: string): void => {
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

  handlePipelineCancel(runId?: string): void {
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
    this.workflowsStore.completeExecution({ executionId: rid, status: 'skipped' });
  }

  private startPipelineFromCurrent(): void {
    const filtered = this.filterForRuntime(this.execNodes(), this._edges());
    this.startRunWithGraph(filtered.nodes, filtered.edges);
  }

  private startRunWithGraph(nodes: WorkflowNode[], edges: WorkflowEdge[], fromNodeId?: string): void {
    const dto = this.buildWorkflowDTO(nodes, edges);
    const runId = crypto?.randomUUID?.() ?? `run_${Date.now()}`;
    this.currentRunId = runId;

    const initial: Record<string, Status> = {};
    for (const n of dto.nodes) initial[n.id] = 'queued';

    this.simStates.set(runId, { ...initial });
    this.pipelineDto.set(dto);
    this.bus.pipeline$.next(dto);
    this.workflowsStore.startExecutionWithPayload({ runId, workflow: dto, nodeStatuses: initial, fromNodeId });
    this.workflowsStore.appendLog({ executionId: runId, message: 'Run started' });

    this.sims.set(runId, this.newSim());
    this.simulateRun(runId, dto);
  }

  private subgraphFrom(startId: string): { nodes: WorkflowNode[]; edges: WorkflowEdge[] } {
    const nodes = this.execNodes();
    const edges = this._edges();
    const byId = new Map(nodes.map(n => [n.id, n]));
    const out = new Map<string, WorkflowEdge[]>();
    for (const e of edges) {
      if (!out.has(e.source)) out.set(e.source, []);
      out.get(e.source)!.push(e);
    }
    const visited = new Set<string>();
    const queue: string[] = [startId];
    const keepEdges: WorkflowEdge[] = [];

    while (queue.length) {
      const id = queue.shift()!;
      if (visited.has(id)) continue;
      visited.add(id);
      const outs = out.get(id) ?? [];
      for (const e of outs) {
        keepEdges.push(e);
        if (!visited.has(e.target)) queue.push(e.target);
      }
    }

    const keepNodes = [...visited]
      .map(id => byId.get(id))
      .filter((n): n is WorkflowNode => !!n);

    return { nodes: keepNodes, edges: keepEdges };
  }

  private emitRuns(): void {
    this.bus.runs$.next(this.runs());
  }

  private makeEdgeId(srcNode: string, srcPort: string, tgtNode: string, tgtPort: string): string {
    return `e-${srcNode}__${srcPort}--${tgtNode}__${tgtPort}`;
  }

  private upsertEdges(edges: WorkflowEdge[]): void {
    const map = new Map<string, WorkflowEdge>();
    for (const e of edges) map.set(e.id, e);
    this._edges.set([...map.values()]);
  }

  private emitExecOnly(nodes: WorkflowNode[], edges: WorkflowEdge[]): void {
    const { nodes: outNodes, edges: outEdges } = this.filterForRuntime(nodes, edges);
    this.emitGraphChange(outNodes, outEdges);
  }

  onEdgeActionsEnter(): void {
    this.edgeActionsHover.set(true);
    if (this.edgeHoverCloseTimer) {
      window.clearTimeout(this.edgeHoverCloseTimer);
      this.edgeHoverCloseTimer = null;
    }
  }

  onEdgeActionsLeave(): void {
    this.edgeActionsHover.set(false);
  }

  private sanitizeGraph(nodesArg: WorkflowNode[] | null | undefined, edgesArg: WorkflowEdge[] | null | undefined) {
    const nodes = (nodesArg ?? []).map(n => {
      const handlePorts = this.portsFromHandles(n);
      return { ...n, ports: this.ensurePorts(n.type, handlePorts ?? n.ports) };
    });
    const byId = new Map(nodes.map(n => [n.id, n] as const));

    const edges = (edgesArg ?? []).filter(e => {
      const src = byId.get(e.source);
      const tgt = byId.get(e.target);
      if (!src || !tgt) return false;

      const srcPorts = this.ensurePorts(src.type, src.ports);
      const tgtPorts = this.ensurePorts(tgt.type, tgt.ports);

      if ((tgtPorts.inputs?.length ?? 0) === 0) return false;

      const srcOk = (srcPorts.outputs ?? []).some(p => p.id === e.sourcePort);
      const tgtOk = (tgtPorts.inputs ?? []).some(p => p.id === e.targetPort);
      return srcOk && tgtOk;
    });

    const uniq = new Map<string, WorkflowEdge>();
    for (const e of edges) uniq.set(e.id, e);

    return { nodes, edges: [...uniq.values()] };
  }

  private emitGraphChange(nodes: WorkflowNode[], edges: WorkflowEdge[]): void {
    const sanitizedEdges = this.sanitizeEdges([...nodes, ...this.uiNodes()], edges);

    this.lastTopoSig = this.makeTopoSig(nodes, sanitizedEdges);
    this.suppressExternal = true;
    this.OnCanvasChange.emit({ nodes, edges: sanitizedEdges });
    queueMicrotask(() => (this.suppressExternal = false));
  }

  private updateNodeById(nodeId: string, updater: (n: WorkflowNode) => WorkflowNode, opts?: { emitToParentIfExec?: boolean }): void {
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

  private updateNodePorts(nodeId: string, inputs: WorkflowNode['ports']['inputs'], outputs: WorkflowNode['ports']['outputs']): void {
    const exec = this.execNodes();
    const iExec = exec.findIndex(n => n.id === nodeId);
    if (iExec < 0) return;

    const minEdit = this.minEditCountsFor(exec[iExec].type);
    const nextPorts = this.ensurePorts(
      exec[iExec].type,
      { inputs, outputs },
      { padToMinimum: true, minInputs: minEdit.inputs, minOutputs: minEdit.outputs }
    );
    const nextExec = exec.slice();
    // persist ports both at top-level and into node.data.params.ports immutably
    const existing = nextExec[iExec];
    const nextData = {
      ...(existing.data ?? {}),
      params: {
        ...((existing.data && existing.data.params) ?? {}),
        ports: nextPorts,
      }
    } as typeof existing.data;
    nextExec[iExec] = { ...existing, ports: nextPorts, data: nextData };
    this.execNodes.set(nextExec);

    const validIn = new Set(nextPorts.inputs.map(p => p.id));
    const validOut = new Set(nextPorts.outputs.map(p => p.id));
    const nextEdges = this._edges().filter(e => {
      if (e.source === nodeId && !validOut.has(e.sourcePort)) return false;
      if (e.target === nodeId && !validIn.has(e.targetPort)) return false;
      return true;
    });
    this._edges.set(nextEdges);

    const withUi = this.withUiConnectivity([...nextExec, ...this.uiNodes()], nextEdges);
    this.emitConnectivity(withUi, nextEdges);
    this.publishGraphValidity();
    this.emitGraphChange(nextExec, nextEdges);
  }

  private updateNodeLabel(nodeId: string, label: string): void {
    const nextLabel = label.trim();
    this.updateNodeById(
      nodeId,
      (n) => ({
        ...n,
        data: {
          ...(n.data ?? {}),
          label: nextLabel,
        }
      }),
      { emitToParentIfExec: true }
    );
  }

  private estimateNodeOffset(type: PaletteType, portsOverride?: WorkflowNode['ports']): { x: number; y: number } {
    const ports = this.ensurePorts(type, portsOverride);
    const portCount = Math.max(1, ports.inputs.length, ports.outputs.length);
    const baseSize = 70;
    const extra = Math.max(0, portCount - 2) * 18;
    const height = Math.max(baseSize, baseSize + extra);
    return { x: baseSize / 2, y: height / 2 };
  }

  private refreshConnectivityAndValidity(): void {
    const withUi = this.withUiConnectivity(this.allNodes(), this._edges());
    this.execNodes.set(withUi.filter(n => this.isExecutableNode(n)));
    this.uiNodes.set(withUi.filter(n => !this.isExecutableNode(n)));
    this.publishGraphValidity();
  }

  private pushExecToParent(): void {
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
      if (Array.isArray(obj)) return (obj as unknown[]).map((x, i) => walk(x, [...path, i.toString()]));
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

  private makeTopoSig(nodes: WorkflowNode[], edges: WorkflowEdge[]): string {
    const ns = [...nodes]
      .map(n => ({ id: n.id, t: n.type, x: n.x || 0, y: n.y || 0 }))
      .sort((a, b) => a.id.localeCompare(b.id));
    const es = [...edges]
      .map(e => ({ id: e.id, s: e.source, sp: e.sourcePort, t: e.target, tp: e.targetPort }))
      .sort((a, b) => a.id.localeCompare(b.id));
    return JSON.stringify({ ns, es });
  }

  private portCountsFor(type: string): { inputs: number; outputs: number } {
    const t = (type ?? '').toString().toLowerCase();
    if (t === 'composite') return { inputs: 1, outputs: 1 };
    if (t === 'run-panel' || t === 'details' || t === 'preview') return { inputs: 0, outputs: 0 };
    if (t === 'input') return { inputs: 0, outputs: 1 };
    if (t === 'result') return { inputs: 1, outputs: 0 };
    const triggers = new Set(['compare', 'extract', 'summarize']);
    if (triggers.has(t)) return { inputs: 0, outputs: 1 };
    return { inputs: 1, outputs: 1 };
  }

  private minEditCountsFor(type: string): { inputs: number; outputs: number } {
    const defaults = this.portCountsFor(type);
    return {
      inputs: defaults.inputs > 0 ? 1 : 0,
      outputs: defaults.outputs > 0 ? 1 : 0,
    };
  }

  private defaultPortsFor(type: string): WorkflowNode['ports'] {
    const { inputs: inputCount, outputs: outputCount } = this.portCountsFor(type);
    const inputs = Array.from({ length: inputCount }, (_, i) => ({
      id: `in-${i + 1}`,
      label: `in ${i + 1}`,
      type: 'json',
      required: false,
    }));
    const outputs = Array.from({ length: outputCount }, (_, i) => ({
      id: `out-${i + 1}`,
      label: `out ${i + 1}`,
      type: 'json',
      required: false,
    }));
    return { inputs, outputs };
  }

  private portsFromHandles(node: WorkflowNode): WorkflowNode['ports'] | null {
    const raw = node as unknown as { input_handles?: unknown; output_handles?: unknown; data?: { params?: Record<string, unknown> } };
    const params = (raw.data && typeof raw.data === 'object' ? raw.data.params : undefined) as Record<string, unknown> | undefined;
    const inputsRaw = Array.isArray(raw.input_handles)
      ? raw.input_handles
      : Array.isArray(params?.['input_handles'])
        ? params?.['input_handles']
        : Array.isArray(params?.['inputHandles'])
          ? params?.['inputHandles']
          : null;
    const outputsRaw = Array.isArray(raw.output_handles)
      ? raw.output_handles
      : Array.isArray(params?.['output_handles'])
        ? params?.['output_handles']
        : Array.isArray(params?.['outputHandles'])
          ? params?.['outputHandles']
          : null;
    if (!inputsRaw && !outputsRaw) return null;

    const pickString = (obj: Record<string, unknown>, keys: string[]): string | undefined => {
      for (const k of keys) {
        const val = obj[k];
        if (typeof val === 'string') return val;
      }
      return undefined;
    };

    const toPort = (handle: unknown, idx: number, prefix: 'in' | 'out'): WorkflowPorts['inputs'][number] => {
      const rec = (handle && typeof handle === 'object') ? (handle as Record<string, unknown>) : {};
      const dataRef = pickString(rec, ['data_reference', 'dataReference']);
      const artifact = pickString(rec, ['artifact_type', 'artifactType']);
      const id = (typeof rec['id'] === 'string' ? (rec['id'] as string) : `${prefix}-${idx + 1}`);
      const label = (dataRef ?? (typeof rec['label'] === 'string' ? (rec['label'] as string) : undefined) ?? `${prefix} ${idx + 1}`);
      const type = (typeof rec['type'] === 'string' ? (rec['type'] as string) : undefined) ?? artifact ?? 'json';
      const required = (typeof rec['required'] === 'boolean' ? (rec['required'] as boolean) : undefined);

      const port = { id, label, type, required } as WorkflowPorts['inputs'][number] & {
        data_reference?: string;
        artifact_type?: string;
      };
      if (dataRef) port.data_reference = dataRef;
      if (artifact) port.artifact_type = artifact;
      return port as WorkflowPorts['inputs'][number];
    };

    return {
      inputs: (inputsRaw ?? []).map((h, i) => toPort(h, i, 'in')),
      outputs: (outputsRaw ?? []).map((h, i) => toPort(h, i, 'out')),
    };
  }

  private ensurePorts(
    type: string,
    ports?: WorkflowNode['ports'],
    opts?: { padToMinimum?: boolean; minInputs?: number; minOutputs?: number }
  ): WorkflowNode['ports'] {
    const base = ports ?? this.defaultPortsFor(type);
    const defaults = this.portCountsFor(type);
    const minInputs = opts?.minInputs ?? defaults.inputs;
    const minOutputs = opts?.minOutputs ?? defaults.outputs;

    const pickString = (obj: unknown, keys: string[]): string | undefined => {
      if (!obj || typeof obj !== 'object') return undefined;
      const rec = obj as Record<string, unknown>;
      for (const k of keys) {
        const val = rec[k];
        if (typeof val === 'string') return val;
      }
      return undefined;
    };

    const norm = (p: WorkflowPorts['inputs'][number], idx: number, prefix: 'in' | 'out') => {
      const dataRef = pickString(p, ['data_reference', 'dataReference']);
      const artifact = pickString(p, ['artifact_type', 'artifactType']);
      const port = {
        id: p.id ?? `${prefix}-${idx + 1}`,
        label: dataRef ?? p.label ?? `${prefix} ${idx + 1}`,
        type: p.type ?? artifact ?? 'json',
        required: p.required, // let backend decide; leave undefined if not provided
      } as WorkflowPorts['inputs'][number] & { data_reference?: string; artifact_type?: string };
      if (dataRef) port.data_reference = dataRef;
      if (artifact) port.artifact_type = artifact;
      return port as WorkflowPorts['inputs'][number];
    };

    const inputs = (base.inputs ?? []).map((p, i) => norm(p, i, 'in'));
    const outputs = (base.outputs ?? []).map((p, i) => norm(p, i, 'out'));
    const padToMinimum = opts?.padToMinimum ?? (ports == null);

    const ensureUnique = (prefix: string, existing: Set<string>): string => {
      let i = existing.size + 1;
      let id = `${prefix}-${i}`;
      while (existing.has(id)) {
        i += 1;
        id = `${prefix}-${i}`;
      }
      return id;
    };

    if (padToMinimum) {
      const existingIn = new Set(inputs.map(p => p.id));
      while (inputs.length < minInputs) {
        const id = ensureUnique('in', existingIn);
        existingIn.add(id);
        inputs.push({ id, label: `in ${inputs.length + 1}`, type: 'json', required: true });
      }

      const existingOut = new Set(outputs.map(p => p.id));
      while (outputs.length < minOutputs) {
        const id = ensureUnique('out', existingOut);
        existingOut.add(id);
        outputs.push({ id, label: `out ${outputs.length + 1}`, type: 'json', required: false });
      }
    }

    return { inputs, outputs };
  }

  private isExecutableNode(n: WorkflowNode): boolean {
    const aiType = (n.data?.aiType ?? '').toString();
    if ((n.type ?? '').toString().toLowerCase() === 'composite' || aiType.startsWith('wf:')) {
      return true;
    }
    if (this.executableNodesSig().size === 0) return true;
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

  private isCompositeAction(a: ActionDefinitionLite): boolean {
    const type = (a.type ?? '').toString();
    return type.startsWith('wf:') || !!a.params?.['workflowId'];
  }

  private normalizeCompositeNode(node: WorkflowNode): WorkflowNode {
    const rawType = (node.type ?? '').toString();
    if (!rawType.startsWith('wf:')) return node;
    const workflowId = rawType.slice(3);
    const params = { ...(node.data?.params ?? {}) } as Record<string, unknown>;
    if (!params['__workflowId']) params['__workflowId'] = workflowId;
    return {
      ...node,
      type: 'composite' as PaletteType,
      data: {
        ...(node.data ?? {}),
        aiType: (node.data?.aiType ?? rawType) as InspectorActionType,
        params,
      },
    };
  }

  private resolveRenderType(node: WorkflowNode): string {
    const rawType = (node.type ?? '').toString();
    const aiType = (node.data?.aiType ?? '').toString();
    const candidate = rawType || aiType;
    if (!candidate) return 'composite';
    if (candidate.startsWith('wf:')) return 'composite';
    const known = new Set([
      'input',
      'result',
      'chat',
      'compare',
      'summarize',
      'extract',
      'embed',
      'retrieve',
      'convert_and_chunk',
      'embed_langchain_documents',
      'store_embedded_langchain_documents',
      'jira',
      'composite',
      'run-panel',
      'details',
      'preview',
    ]);
    if (known.has(candidate)) return candidate;
    return 'composite';
  }

  private applyReadOnlyState(): void {
    const disabled = this.disabledSig();
    if (disabled) {
      this.showPalette.set(false);
      this.paletteFilter.set('');
    }

    if (this.form) {
      if (disabled) {
        this.form.disable({ emitEvent: false });
      } else {
        this.form.enable({ emitEvent: false });
      }
    }

    if (this.paletteForm) {
      if (disabled) {
        this.paletteForm.disable({ emitEvent: false });
      } else {
        this.paletteForm.enable({ emitEvent: false });
      }
    }
  }

  private rebuildCompatibilityIndex(): void {
    const actions = this.availableActionsSig() ?? [];
    this.compatibleIndex.clear();

    const push = (k: string, a: ActionDefinitionLite): void => {
      if (!this.compatibleIndex.has(k)) this.compatibleIndex.set(k, []);
      this.compatibleIndex.get(k)!.push({
        type: a.type,
        icon: a.params?.['icon'] as string | undefined,
        label: (a.params?.['label'] as string | undefined) ?? a.type
      });
    };

    for (const a of actions) {
      push('any', a)
    }
  }

  private compatibleFor(
    outType?: string,
    opts?: { mode?: 'connect' | 'replace' }
  ): { type: string; icon?: string; label: string }[] {
    const t = outType ?? 'any';
    const base = [
      ...(this.compatibleIndex.get(t) ?? []),
      ...(t !== 'any' ? (this.compatibleIndex.get('any') ?? []) : []),
    ];

    // In "connect" mode we only show actions that can be a TARGET (must have inputs)
    if ((opts?.mode ?? 'connect') === 'connect') {
      return base.filter(a => this.portCountsFor(a.type).inputs > 0);
    }

    // In "replace" mode, you may allow anything (including 0-input nodes)
    return base;
  }
  pickQuickAction(a: { type: string; icon?: string }): void {
    console.log('pickQuickAction', a);

    const ctx = this.quickAddCtx;
    if (!ctx) return;

    const { sourceNodeId, sourcePortId, replaceMode } = ctx;

    this.bus.quickAddPick$.next({
      sourceNodeId,
      sourcePortId,
      actionType: a.type,
      icon: a.icon ?? '',
      replaceMode: !!replaceMode,
    });

    this.quickAddOpen = false;
    // optional cleanup to avoid stale ctx
    this.quickAddCtx = null;
  }

  private handleQuickAddPick({
    sourceNodeId,
    sourcePortId,
    actionType,
    icon,
    replaceMode,
  }: {
    sourceNodeId: string;
    sourcePortId: string;
    actionType: string;
    icon: string;
    replaceMode?: boolean;
  }): void {
    const sourceNode = this.allNodes().find(n => n.id === sourceNodeId);
    const def = this.availableActionsSig().find(a => a.type === actionType);
    const actionLabel = (def?.params?.['label'] as string | undefined) ?? this.humanLabelFor(actionType as PaletteType);
    const actionPorts = (def?.params?.['ports'] as WorkflowNode['ports'] | undefined);
    const actionParams = { ...(def?.params ?? {}) } as Record<string, unknown>;
    delete actionParams['ports'];
    delete actionParams['label'];
    delete actionParams['class'];
    delete actionParams['workflowId'];
    const isComposite = actionType.startsWith('wf:') || !!def?.params?.['workflowId'];
    const nodeType = isComposite ? 'composite' : (actionType as PaletteType);


    // ✅ 1) REPLACE mode: replace the source node with the new type
    if (replaceMode && sourceNode) {
      const ports = this.ensurePorts(nodeType, actionPorts);

      const updatedNode: WorkflowNode = {
        ...sourceNode,
        type: nodeType as PaletteType,
        data: {
          ...(sourceNode.data ?? {}),
          label: actionLabel,
          aiType: actionType as InspectorActionType,
          params: {
            ...actionParams,
            ui: { expanded: true },
            icon: icon || (def?.params?.['icon'] as string | undefined),
            __workflowId: isComposite ? (def?.params?.['workflowId'] as string | undefined) : undefined,
          },
        },
        ports,
      };

      const execNext = this.execNodes().map(n => (n.id === sourceNodeId ? updatedNode : n));
      this.execNodes.set(execNext);

      // Update existing edges ports to match the new primary ports
      const primaryIn = ports.inputs?.[0]?.id ?? null;
      const primaryOut = ports.outputs?.[0]?.id ?? null;

      const nextEdges = this._edges()
        .map(e => {
          if (e.source === sourceNodeId && primaryOut) return { ...e, sourcePort: primaryOut };
          if (e.target === sourceNodeId && primaryIn) return { ...e, targetPort: primaryIn };
          return e;
        })
        .filter(e => {
          if (e.source === sourceNodeId && !primaryOut) return false;
          if (e.target === sourceNodeId && !primaryIn) return false;
          return true;
        });

      this._edges.set(nextEdges);

      const withUi = this.withUiConnectivity([...execNext, ...this.uiNodes()], nextEdges);
      this.emitConnectivity(withUi, nextEdges);
      this.publishGraphValidity();
      this.emitGraphChange(execNext, nextEdges);

      this.quickAddOpen = false;
      return;
    }

    // ✅ 2) Normal mode: spawn picked action node and link it
    const id = crypto?.randomUUID?.() ?? this.genId('n');
    const ports = this.ensurePorts(nodeType, actionPorts);

    if (!replaceMode && (ports.inputs?.length ?? 0) === 0) {
      this.quickAddOpen = false;
      return;
    }

    const node: WorkflowNode = {
      id,
      type: nodeType as PaletteType,
      x: (sourceNode?.x ?? 0) + 650,
      y: (sourceNode?.y ?? 0), // ✅ FIX: don't force y=0
      data: {
        label: actionLabel,
        aiType: actionType as InspectorActionType,
        params: {
          ...actionParams,
          ui: { expanded: true },
          icon: icon || (def?.params?.['icon'] as string | undefined),
          __workflowId: isComposite ? (def?.params?.['workflowId'] as string | undefined) : undefined,
        },
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

    const nextEdges = [...this._edges(), edge];
    this._edges.set(nextEdges);

    const withUi = this.withUiConnectivity([...execNext, ...this.uiNodes()], nextEdges);
    this.emitConnectivity(withUi, nextEdges);
    this.publishGraphValidity();
    this.emitGraphChange(execNext, nextEdges);

    this.quickAddOpen = false;
  }

  linkToExisting(targetId: string): void {
    console.log("here", targetId)
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
      this.toast.showError(
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

    this.emitGraphChange(this.execNodes(), after);

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

  private stripReservedDTO(obj: WorkflowNodeDataBaseParams | undefined): WorkflowNodeDataBaseParams | undefined {
    if (!obj || typeof obj !== 'object') return obj;
    const RESERVED_SET: ReadonlySet<ReservedKeys> = new Set(RESERVED_KEYS);

    const out: WorkflowNodeDataBaseParams = {};
    for (const [k, v] of Object.entries(obj)) {
      if (RESERVED_SET.has(k as ReservedKeys)) continue;
      out[k] = v;
    }
    return out;
  }

  private buildWorkflowDTO(fromNodes: WorkflowNode[], fromEdges: WorkflowEdge[]): PipelineWorkflowDTO {
    const sanitizedEdges = this.sanitizeEdges(fromNodes, fromEdges);
    const { cleanNodes, cleanEdges } = this.normalize(fromNodes, sanitizedEdges);

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
        version: '1',
        filesByNode,
      }
    };
    return { ...dto, nodes: nodesSansReserved, edges: cleanEdges };
  }

  private buildWorkflowDTOFromSnapshot(
    fromNodes: WorkflowNode[],
    fromEdges: WorkflowEdge[],
    name?: string
  ): PipelineWorkflowDTO {
    const sanitizedEdges = this.sanitizeEdges(fromNodes, fromEdges);
    const { cleanNodes, cleanEdges } = this.normalize(fromNodes, sanitizedEdges);
    const dto: PipelineWorkflowDTO = {
      name: name ?? 'Workflow',
      nodes: cleanNodes,
      edges: cleanEdges,
      meta: {
        createdAt: new Date().toISOString(),
        version: '1',
        filesByNode: {},
      }
    };
    return dto;
  }
}
