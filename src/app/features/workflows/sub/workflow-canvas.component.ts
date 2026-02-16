
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
  DrawFlowApi,
  RunNodePayload,
  WorkflowPorts,
} from '../templates/utils/workflow.interface';
import {
  PortsMap,
  ActionDefinitionLite,
  Binary,
  BinaryPlaceholder,
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
import { FieldConfig } from '@cadai/pxs-ng-core/interfaces';
import { Subscription, combineLatest, debounceTime, distinctUntilChanged } from 'rxjs';
import { OverlayModule } from '@angular/cdk/overlay';
import { MatMenuModule } from '@angular/material/menu';
import { MatSidenavModule } from '@angular/material/sidenav';
import { ActionFormSpec } from '../templates/utils/action-forms';
import { WfDetailsNodeComponent } from './details-node/detail-node.component';
import { WfPreviewNodeComponent } from './preview-node/preview-node.compoennt';
import { WorkflowValidationState, WorkflowsStore, ensurePorts as storeEnsurePorts } from '../data/workflows.store';
import {
  portCountsFor as sharedPortCountsFor,
  minEditCountsFor as sharedMinEditCountsFor,
  computeConnectivity as sharedComputeConnectivity,
  computeValidation as sharedComputeValidation,
  inferPortTypeFromReference,
  sanitizeGraph as sharedSanitizeGraph,
} from '../templates/utils/workflow-graph.utils';


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
      minZoom: 0.1,
      maxZoom: 3,
      zoomStep: 0.1,
    }),
    provideNgDrawFlowConfigs({
      nodes: {
        chat: WfNodeComponent,
        trigger_chat: WfNodeComponent,
        trigger_file_upload: WfNodeComponent,
        trigger_webhook: WfNodeComponent,
        trigger_manual: WfNodeComponent,
        embed: WfNodeComponent,
        retrieve: WfNodeComponent,
        convert_and_chunk: WfNodeComponent,
        embed_langchain_documents: WfNodeComponent,
        store_embedded_langchain_documents: WfNodeComponent,
        jira: WfNodeComponent,
        composite: WfNodeComponent,
        details: WfDetailsNodeComponent,
        preview: WfPreviewNodeComponent,
      },
      connection: {
        type: DfConnectionType.SmoothStep,
        arrowhead: { type: DfArrowhead.ArrowClosed, height: 8, width: 8 },
        curvature: 10,
      }
    }),
  ],
  templateUrl: './workflow-canvas-df.component.html',
  styleUrls: ['./workflow-canvas-df.component.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
/**
 * Workflow Canvas Component using DrawFlow library.
 * Handles rendering, editing, and validation of workflow graphs.
 * Manages nodes, edges, connectivity, and user interactions.
 */
export class WorkflowCanvasDfComponent implements OnInit, OnDestroy, AfterViewInit {
  @ViewChild('flow', { static: false }) flow?: NgDrawFlowComponent;
  @ViewChild('flowEl', { static: false, read: ElementRef })
  private flowElementRef?: ElementRef<HTMLElement>;

  /** Host listener for escape key to deselect node */
  @HostListener('document:keydown.escape')
  onEsc(): void {
    this.setSelectedNode(null);
  }

  // Inputs

  private suppressExternal = false;
  private translate = inject(TranslateService);

  /** Track node ids deleted locally to ignore any brief upstream echoes */
  private recentlyDeleted = new Map<string, number>();
  private readonly deletionWindowMs = 800;
  private lastWorkflowId: string | null | undefined = undefined;
  private workflowChangeCounter = signal(0);
  private workflowSwitchInProgress = false;
  private switchNodesApplied = false;
  private switchEdgesApplied = false;
  private centerScheduled = false;
  private centerRetryCount = 0;
  private readonly maxCenterRetryCount = 20;
  private pendingCenterAfterSwitch = false;
  private acceptExternalOnce = false;
  private refreshAfterRenderScheduled = false;

  /** Setter for workflow ID - clears state on change */
  @Input() set workflowId(value: string | null | undefined) {
    if (value !== this.lastWorkflowId) {
      this.beginWorkflowSwitch();
      this.pendingCenterAfterSwitch = this.autoCenterEnabled;
      this.acceptExternalOnce = true;
      queueMicrotask(() => (this.acceptExternalOnce = false));
      this.suppressExternal = false;

      // Workflow switched - keep current graph until next one is hydrated
      // to avoid empty-canvas flashing during route/store transitions.
      this.lastWorkflowId = value;
      this.lastIncomingSig = '';
      this.lastTopoSig = '';
      this.pendingEdgesRaw = [];
      this.selectedNodeId.set(null);
      this.quickAddOpen = false;
      this.recentlyDeleted.clear();
      this.formInvalidByNode.clear();
      this.workflowChangeCounter.update(c => c + 1);
      this.refreshValidationAndConnectivityAfterRender();
    }
  }

  /** Setter for nodes - processes incoming nodes, derives ports, and updates state */
  @Input({ required: true })
  set nodes(value: WorkflowNode[] | null | undefined) {

    if (this.suppressExternal && !this.acceptExternalOnce) return;
    if (this.workflowSwitchInProgress) this.switchNodesApplied = true;

    const now = Date.now();
    // prune old tombstones
    for (const [id, ts] of [...this.recentlyDeleted]) {
      if (now - ts > this.deletionWindowMs) this.recentlyDeleted.delete(id);
    }

    const allIncoming = (value ?? []);
    // Drop any nodes that were just deleted locally (avoid re-creation)
    const derivePortsFromMap = (type: string, portsMap: Record<string, { required?: boolean; readonly?: boolean }>): WorkflowNode['ports'] => {
      const base = this.ensurePorts(type, undefined);
      const baseIds = new Set(base.inputs.map(p => p.id).concat(base.outputs.map(p => p.id)));
      const inputs = base.inputs.map(p => ({ ...p, required: !!portsMap[p.id]?.required, readonly: !!portsMap[p.id]?.readonly }));
      const outputs = base.outputs.map(p => ({ ...p, required: !!portsMap[p.id]?.required, readonly: !!portsMap[p.id]?.readonly }));
      for (const [id, meta] of Object.entries(portsMap)) {
        if (!baseIds.has(id)) {
          const inferredType = inferPortTypeFromReference(id) ?? 'json';
          outputs.push({ id, label: id, type: inferredType, artifact_type: inferredType, required: !!meta.required, readonly: !!meta.readonly });
        }
      }
      return { inputs, outputs };
    };

    let incoming = allIncoming
      .map(n => this.normalizeCompositeNode(n))
      .filter(n => this.isExecutableNode(n))
      .filter(n => !this.recentlyDeleted.has(n.id))
      .map(n => {
        const params = (n.data?.params ?? {}) as Record<string, unknown> | undefined;
        const portsFromParams = params?.['ports'] as WorkflowNode['ports'] | undefined;
        const portsMap = params?.['ports_map'] as Record<string, { required?: boolean; readonly?: boolean }> | undefined;
        let portsCandidate = n.ports ?? portsFromParams;
        if (!portsCandidate && portsMap && typeof portsMap === 'object') {
          portsCandidate = derivePortsFromMap(n.type, portsMap);
        }
        return { ...n, ports: this.ensurePorts(n.type, portsCandidate) };
      });

    // During a workflow switch, never merge in-memory node coordinates from the
    // previous workflow. The incoming graph is the persisted source of truth.
    if (this.workflowSwitchInProgress) {
      this.execNodes.set(incoming);
      this.uiNodes.set([]);
      this.applyEdges(this.pendingEdgesRaw, { skipIfSame: true });
      this.finalizeWorkflowSwitchIfReady();
      return;
    }

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
    if (sigNew === this.lastIncomingSig || sigNew === this.lastTopoSig) {
      this.finalizeWorkflowSwitchIfReady();
      return;
    }
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
      this.finalizeWorkflowSwitchIfReady();
      return;
    }

    // merge-only: update existing IDs, do NOT add new ones from parent unless not racing a local change
    const justChangedLocally = Date.now() - this.lastLocalChangeAt < 300;
    const currentBase = justChangedLocally ? current : current.filter(n => incomingById.has(n.id));
    const currentBaseById = new Set(currentBase.map(n => n.id));
    const mergedExec = currentBase.map(n => {
      const inc = incomingById.get(n.id);
      if (!inc) return n;
      return { ...inc, x: n.x, y: n.y, ports: this.ensurePorts(inc.type, inc.ports) };
    });

    if (!justChangedLocally) {
      for (const [id, inc] of incomingById) {
        if (!currentBaseById.has(id)) mergedExec.push({ ...inc, ports: this.ensurePorts(inc.type, inc.ports) });
      }
    }

    this.execNodes.set(mergedExec);
    this.schedulePublishGraphValidity();
    this.applyEdges(this.pendingEdgesRaw);
    this.finalizeWorkflowSwitchIfReady();
  }

  /** Setter for edges - sanitizes and applies incoming edges */
  @Input({ required: true })
  set edges(value: WorkflowEdge[] | null | undefined) {
    if (this.suppressExternal && !this.acceptExternalOnce) return;
    if (this.workflowSwitchInProgress) this.switchEdgesApplied = true;
    const incomingRaw = value ?? [];
    const incoming = this.sanitizeGraph(this.allNodes(), incomingRaw).edges;
    this.pendingEdgesRaw = value ?? [];
    this.applyEdges(this.pendingEdgesRaw, { skipIfSame: true });

    const cur = this._edges();
    if (incoming.length === cur.length && incoming.every((e, i) => e.id === cur[i].id)) {
      this.finalizeWorkflowSwitchIfReady();
      return;
    }

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
    this.schedulePublishGraphValidity();
    this.finalizeWorkflowSwitchIfReady();
  }

  private beginWorkflowSwitch(): void {
    this.workflowSwitchInProgress = true;
    this.switchNodesApplied = false;
    this.switchEdgesApplied = false;
  }

  private finalizeWorkflowSwitchIfReady(): void {
    if (!this.workflowSwitchInProgress) return;
    if (!this.switchNodesApplied || !this.switchEdgesApplied) return;
    this.workflowSwitchInProgress = false;
    this.switchNodesApplied = false;
    this.switchEdgesApplied = false;
    if (this.autoCenterEnabled && this.allNodes().length > 0) {
      this.pendingCenterAfterSwitch = true;
      this.scheduleCenterOnNodes();
    }
  }

  /** Action specs for nodes */
  @Input({ required: true }) actionsNodes!: Record<string, ActionFormSpec>;
  /** Setter for executable node types */
  @Input({ required: true })
  set executableNodes(value: Set<PaletteType>) {
    this.executableNodesSig.set(value)
  };

  /** Setter for disabled state */
  @Input() set disabled(value: boolean) {
    this.disabledSig.set(!!value);
    this.applyReadOnlyState();
  }
  
  /** Auto-center flag - when true, centers the view on nodes after loading */
  @Input() set autoCenter(value: boolean) {
    this.autoCenterEnabled = !!value;
    if (this.autoCenterEnabled && this.allNodes().length > 0) {
      this.pendingCenterAfterSwitch = true;
      this.scheduleCenterOnNodes();
    }
  }
  private autoCenterEnabled = false;

  private scheduleCenterOnNodes(): void {
    if (this.centerScheduled) return;
    this.centerScheduled = true;
    const run = () => {
      const centered = this.centerOnNodes();
      if (!centered && this.centerRetryCount < this.maxCenterRetryCount) {
        this.centerRetryCount += 1;
        setTimeout(() => requestAnimationFrame(run), 60);
        return;
      }
      this.centerRetryCount = 0;
      this.centerScheduled = false;
    };

    requestAnimationFrame(() => requestAnimationFrame(run));
  }
  
  /** Setter for available actions */
  @Input() set availableActions(value: ActionDefinitionLite[]) {
    this.availableActionsSig.set(value ?? []);
    this.rebuildCompatibilityIndex();
  }
  /** Setter for workflow name */
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

  /** Emits changes to nodes and edges */
  @Output() OnCanvasChange = new EventEmitter<{ nodes: WorkflowNode[]; edges: WorkflowEdge[] }>();
  /** Emits selection changes */
  @Output() selectionChange = new EventEmitter<{ nodeIds: string[]; edgeIds: string[] }>();
  /** Emits validation state changes */
  @Output() validationChange = new EventEmitter<WorkflowValidationState>();
  /** Emits workflow name changes */
  @Output() workflowNameChange = new EventEmitter<string>();

  /** Signal for disabled state */
  disabledSig = signal<boolean>(false);
  /** Signal for available actions */
  availableActionsSig = signal<ActionDefinitionLite[]>([]);
  /** Signal for executable node types */
  executableNodesSig = signal<Set<PaletteType>>(new Set());
  /** Signal for graph validity */
  graphValidSig = signal<boolean>(true);
  /** Signal for palette dragging state */
  isPaletteDragging = signal<boolean>(false);
  /** Signal for palette visibility */
  showPalette = signal(false);
  /** Signal for palette filter query */
  paletteFilter = signal<string>('');
  /** Computed filtered actions based on palette filter */
  readonly filteredActions = computed<ActionDefinitionLite[]>(() => {
    const q = this.paletteFilter().trim().toLowerCase();
    const all = this.availableActionsSig();
    if (!q) return all;
    return all.filter(a => (a.type ?? '').toString().toLowerCase().includes(q));
  });
  /** Computed filtered reusable actions */
  readonly filteredReusableActions = computed<ActionDefinitionLite[]>(() =>
    this.filteredActions().filter(a => this.isCompositeAction(a))
  );
  /** Computed filtered node actions */
  readonly filteredNodeActions = computed<ActionDefinitionLite[]>(() =>
    this.filteredActions().filter(a => !this.isCompositeAction(a))
  );

  /** Computed DrawFlow data model from nodes and edges */
  readonly dfModel = computed<DfDataModel>(() => {
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

      const needsIn = (ports.inputs?.length ?? 0) > 0;
      const needsOut = (ports.outputs?.length ?? 0) > 0;
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

        const hasSourcePort = (sp.outputs ?? []).some(p => p.id === e.sourcePort);
        const hasTargetPort = (tp.inputs ?? []).some(p => p.id === e.targetPort);
        
        if (!hasSourcePort || !hasTargetPort) {
          return false;
        }

        // Validate port type compatibility
        const sourcePort = (sp.outputs ?? []).find(p => p.id === e.sourcePort);
        const targetPort = (tp.inputs ?? []).find(p => p.id === e.targetPort);
        
        if (sourcePort && targetPort) {
          const sourceType = sourcePort.type || sourcePort.artifact_type;
          const targetType = targetPort.type || targetPort.artifact_type;
          const compatible = this.arePortTypesCompatible(sourceType, targetType);
          return compatible;
        }
        
        return true;
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

  /** Form for palette */
  paletteForm!: FormGroup;
  /** Field config for palette */
  paletteFieldConfig: FieldConfig[] = [];

  /** Private signal for executable nodes */
  private execNodes = signal<WorkflowNode[]>([]);
  /** Private signal for UI nodes */
  private uiNodes = signal<WorkflowNode[]>([]);
  /** Computed all nodes (exec + ui) */
  private readonly allNodes = computed(() => [...this.execNodes(), ...this.uiNodes()]);

  /** Private signal for edges */
  private _edges = signal<WorkflowEdge[]>([]);
  /** Private signal for zoom level */
  private zoom = signal<number>(1);

  /** Pending raw edges for processing */
  private pendingEdgesRaw: WorkflowEdge[] = [];

  /** Main form for the component */
  public form!: FormGroup;
  /** Field config for the main form */
  public fieldConfig: FieldConfig[] = [];
  /** Pending workflow name */
  private pendingWorkflowName: string | null | undefined = null;
  /** Flag to suppress name emit */
  private suppressNameEmit = false;

  /** Signal for selected node ID */
  private selectedNodeId = signal<string | null>(null);

  /** Signal for pipeline DTO */
  private pipelineDto = signal<PipelineWorkflowDTO | null>(null);
  /** Signal for run state by node */
  private runState = signal<Record<string, Status>>({});

  /** Map of simulation contexts */
  private sims = new Map<string, SimCtx>();
  /** Current run ID */
  private currentRunId: string | null = null;
  /** Signal for runs */
  private runs = signal<RunEntry[]>([]);

  /** Last incoming topology signature */
  private lastIncomingSig = '';
  /** Last topology signature */
  private lastTopoSig = '';
   /** Timestamp of last local change */
  private lastLocalChangeAt = 0;

  /** Flag indicating a local change is in progress */
  private localChangeInProgress = false;
  /** Timeout handle for local change window */
  private localChangeTimeout: ReturnType<typeof setTimeout> | null = null;
  /** Subscription collection */
  private subs = new Subscription();

  /** Flag for scheduled validation */
  private validationScheduled = false;
  /** Schedule graph validity publication */
  private schedulePublishGraphValidity(): void {
    if (this.validationScheduled) return;
    this.validationScheduled = true;
    this.validationScheduled = false;
    this.publishGraphValidity();
  }

  /**
   * Mark that a local change is in progress.
   * During this window, external updates from parent will be ignored
   * to prevent race conditions and stale data overwrites.
   */
  private markLocalChange(durationMs = 1200): void {
    this.localChangeInProgress = true;
    this.suppressExternal = true;

    if (this.localChangeTimeout) {
      clearTimeout(this.localChangeTimeout);
    }
    this.localChangeTimeout = setTimeout(() => {
      this.localChangeInProgress = false;
      this.suppressExternal = false;
      this.localChangeTimeout = null;
    }, durationMs);
  }

  /** Cache for binary files */
  private fileCache = new Map<string, Record<string, Binary | Binary[]>>();

  /** Map of form invalidity by node */
  private formInvalidByNode = new Map<string, { invalid: boolean; fields?: string[] }>();

  /** Flag for quick add open */
  quickAddOpen = false;
  /** Context for quick add */
  quickAddCtx:
    | {
      sourceNodeId: string;
      sourcePortId: string;
      sourcePortType?: string;
      anchorRect?: DOMRect;
      replaceMode?: boolean;
    }
    | null = null;

  /** Items for quick add */
  quickAddItems: { type: string; icon?: string; label: string }[] = [];
  /** Quick add client position */
  qaClient: { x: number; y: number } | null = null;
  /** Existing targets for quick add */
  existingTargets: { id: string; label: string; icon: string; type: PaletteType }[] = [];

  /** ID sequence counter */
  private idSeq = 0;
  /** Generate unique ID */
  private genId(prefix = 'n'): string { return `${prefix}_${Date.now().toString(36)}_${++this.idSeq}`; }

  /** Compatibility index for actions */
  private compatibleIndex = new Map<string, { type: string; icon?: string; label: string }[]>();
  /** Injected workflows store */
  private workflowsStore = inject(WorkflowsStore);
  /** Simulation states */
  private simStates = new Map<string, Record<string, Status>>();

  /** Constructor */
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
        if (!replaceMode) this.buildExistingTargets(nodeId, portType);
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
          snapshotNodes: r.snapshotNodes,
          snapshotEdges: r.snapshotEdges,
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

    /** Effect to publish graph validity on nodes/edges changes */
    effect(() => {
      this.execNodes();
      this._edges();
      queueMicrotask(() => {
        this.publishGraphValidity();
      });
    });

    /** Effect to apply connection styling based on execution status */
    effect(() => {
      const runStateData = this.runState();
      const edges = this._edges();
      
      // Wait for next render cycle
      setTimeout(() => {
        this.applyConnectionStyles(runStateData, edges);
      }, 0);
    });
  }

  /** After view init lifecycle */
  ngAfterViewInit() {
    const el = this.flowElementRef?.nativeElement;
    if (!el) {
      this.refreshValidationAndConnectivityAfterRender();
      return;
    }

    // Deselect only when clicking actual canvas background.
    // Do not treat generic SVG paths as scene clicks because node icons/connectors
    // are often rendered as <path>, which breaks node interactions.
    this.subs.add(this.renderer.listen(el, 'click', (ev: MouseEvent) => {
      const target = ev.target as HTMLElement | null;
      const tag = target?.tagName?.toUpperCase() ?? '';
      const isScene = target === el || tag === 'DF-SCENE';
      const insideNode = !!target?.closest('[data-node-id], .wf-node, .node-label');
      const insideOverlay = !!target?.closest('.cdk-overlay-pane, .mat-mdc-dialog-container, .quick-add');

      if (isScene && !insideNode && !insideOverlay) {
        this.setSelectedNode(null);
      }
    }));

    // Apply pending workflow name if it was set before form control was ready
    if (this.pendingWorkflowName !== null && this.form.get('workflowName')) {
      if (this.form.get('workflowName')?.value !== this.pendingWorkflowName) {
        this.form.patchValue({ workflowName: this.pendingWorkflowName }, { emitEvent: false });
      }
    }

    this.refreshValidationAndConnectivityAfterRender();
  }

  /**
   * Apply inline styles to connection SVG elements based on node execution status
   * Connection shows success when SOURCE node succeeds (data flowed out)
   * Priority: running (either end) > error (either end) > success (source only) > queued > skipped
   */
  private applyConnectionStyles(runStateData: Record<string, Status>, edges: WorkflowEdge[]): void {
    if (!this.flowElementRef?.nativeElement) return;

    // Get all connection SVG paths
    const allPaths = this.flowElementRef.nativeElement.querySelectorAll('df-connection svg .main-path');
    
    if (allPaths.length === 0) {
      // Elements not ready yet, retry
      setTimeout(() => this.applyConnectionStyles(runStateData, edges), 50);
      return;
    }

    // Reset all paths first
    allPaths.forEach((path: Element) => {
      const svgPath = path as SVGPathElement;
      this.renderer.removeStyle(svgPath, 'stroke');
      this.renderer.removeStyle(svgPath, 'stroke-width');
      this.renderer.removeStyle(svgPath, 'opacity');
      this.renderer.removeStyle(svgPath, 'stroke-dasharray');
      this.renderer.removeStyle(svgPath, 'filter');
      this.renderer.removeStyle(svgPath, 'animation');
    });

    // Build a map of edge keys to their source status (only if source has status)
    const edgeStatusMap = new Map<string, Status>();
    edges.forEach(edge => {
      const key = `${edge.source}:${edge.target}`;
      const sourceStatus = runStateData[edge.source];
      // Only add to map if source has a status - this prevents styling unrelated connections
      if (sourceStatus) {
        edgeStatusMap.set(key, sourceStatus);
      }
    });

    // Get connections from dfModel to match DOM order
    const dfConnections = this.dfModel().connections || [];
    
    // Apply styles based on dfModel connections order (matches DOM order)
    dfConnections.forEach((dfConn: DfDataConnection, index: number) => {
      if (index >= allPaths.length) return;
      
      const key = `${dfConn.source.nodeId}:${dfConn.target.nodeId}`;
      const sourceStatus = edgeStatusMap.get(key);
      
      // Skip if source wasn't executed (not in the current run path)
      if (!sourceStatus) return;
      
      const path = allPaths[index] as SVGPathElement;
      
      // Apply styles based on source status
      if (sourceStatus === 'error') {
        this.renderer.setStyle(path, 'stroke', 'var(--mat-error)');
        this.renderer.setStyle(path, 'stroke-width', '3');
        this.renderer.setStyle(path, 'stroke-linecap', 'round');
        this.renderer.setStyle(path, 'filter', 'drop-shadow(0 0 8px color-mix(in srgb, var(--mat-error) 70%, transparent)) drop-shadow(0 0 4px color-mix(in srgb, var(--mat-error) 90%, transparent))');
        this.renderer.setStyle(path, 'animation', 'connection-error-pulse 1.5s ease-in-out infinite');
      } else if (sourceStatus === 'success') {
        this.renderer.setStyle(path, 'stroke', 'var(--mat-success)');
        this.renderer.setStyle(path, 'stroke-width', '2.5');
        this.renderer.setStyle(path, 'stroke-linecap', 'round');
        this.renderer.setStyle(path, 'filter', 'drop-shadow(0 0 6px color-mix(in srgb, var(--mat-success) 60%, transparent)) drop-shadow(0 0 2px color-mix(in srgb, var(--mat-success) 90%, transparent))');
        this.renderer.setStyle(path, 'animation', 'connection-success-glow 2s ease-in-out forwards');
      } else if (sourceStatus === 'running') {
        this.renderer.setStyle(path, 'stroke', 'var(--mat-primary)');
        this.renderer.setStyle(path, 'stroke-width', '3');
        this.renderer.setStyle(path, 'stroke-linecap', 'round');
        this.renderer.setStyle(path, 'filter', 'drop-shadow(0 0 8px color-mix(in srgb, var(--mat-primary) 60%, transparent)) drop-shadow(0 0 3px color-mix(in srgb, var(--mat-primary) 80%, transparent))');
        this.renderer.setStyle(path, 'animation', 'connection-running-flow 2s ease-in-out infinite');
      } else if (sourceStatus === 'queued') {
        this.renderer.setStyle(path, 'stroke', 'var(--mat-warn)');
        this.renderer.setStyle(path, 'stroke-width', '2.5');
        this.renderer.setStyle(path, 'stroke-linecap', 'round');
        this.renderer.setStyle(path, 'opacity', '0.85');
        this.renderer.setStyle(path, 'filter', 'drop-shadow(0 0 6px color-mix(in srgb, var(--mat-warn) 50%, transparent))');
        this.renderer.setStyle(path, 'animation', 'connection-queued-pulse 2s ease-in-out infinite');
      } else if (sourceStatus === 'skipped') {
        this.renderer.setStyle(path, 'stroke', 'var(--mat-neutral)');
        this.renderer.setStyle(path, 'stroke-width', '2');
        this.renderer.setStyle(path, 'stroke-linecap', 'round');
        this.renderer.setStyle(path, 'opacity', '0.5');
      }
    });
  }

  /** On init lifecycle */
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
    this.refreshValidationAndConnectivityAfterRender();
  }

  /** On destroy lifecycle */
  ngOnDestroy(): void {
    this.subs.unsubscribe();
    if (this.localChangeTimeout) {
      clearTimeout(this.localChangeTimeout);
      this.localChangeTimeout = null;
    }
  }

  /** Convert to run node payload map */
  private toRunNodePayloadMap(v: unknown): Record<string, RunNodePayload> {
    if (!v || typeof v !== 'object') return {};
    return v as Record<string, RunNodePayload>;
  }

  /** Build existing targets for quick add */
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

  /** Handle node params changed event */
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

  /** Toggle run panel */
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

  /** Toggle details panel */
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

  /** Toggle preview panel */
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

  /** Get human readable label for palette type */
  private humanLabelFor(t: PaletteType): string {
    return t.toLocaleLowerCase();
  }

  /** Publish graph validity to bus and output */
  private publishGraphValidity(): void {
    const nodes = this.execNodes();
    const edges = this._edges();
    const validation = this.computeValidation(nodes, edges);
    this.graphValidSig.set(!!validation.valid);
    this.bus.graphValid$.next(validation.valid);
    this.validationChange.emit(validation);
  }

  /** Normalize nodes and edges */
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

  /** Add UI connectivity flags to nodes */
  private withUiConnectivity(nodes: WorkflowNode[], edges: WorkflowEdge[]) {
    const map = sharedComputeConnectivity(nodes, edges);
    return nodes.map(n => {
      const c = map.get(n.id);
      const nextParams = {
        ...(n.data?.params ?? {}),
        __missingIn: !!c?.missingIn,
        __missingOut: !!c?.missingOut,
      };
      return { ...n, data: { ...n.data, params: nextParams } } as WorkflowNode;
    });
  }

  /** Handle scale change */
  onScale(z: number): void {
    this.zoom.set(z);
  }
  /** Handle drop event for adding nodes */
  onDrop(ev: CdkDragDrop<unknown, unknown, unknown>): void {
    if (this.disabledSig()) return;
    const action = ev.item?.data as ActionDefinitionLite | undefined;
    if (!action) return;

    const actionPorts = action.params?.['ports'] as WorkflowNode['ports'] | undefined;
    const actionPortsMap = action.params?.['ports_map'] as Record<string, { required?: boolean; readonly?: boolean }> | undefined;
    const id = crypto?.randomUUID() ?? this.genId('n');
    const isComposite = this.isCompositeAction(action);
    const nodeType = isComposite ? 'composite' : action.type;
    const aiType = action.type;

    const actionParams = { ...(action.params ?? {}) } as Record<string, unknown>;
    delete actionParams['ports'];
    delete actionParams['label'];
    delete actionParams['class'];
    delete actionParams['workflowId'];

    const ports = this.ensurePorts(nodeType, actionPorts, { portsMap: actionPortsMap });

    const node: WorkflowNode = {
      id,
      type: nodeType,
      data: {
        label: (action.params?.['label'] as string | undefined) ?? this.humanLabelFor(action.type),
        aiType: aiType as InspectorActionType,
        params: {
          ...actionParams,
          ui: { expanded: true },
          __workflowId: isComposite ? (action.params?.['workflowId'] as string | undefined) : undefined,

          // ✅ IMPORTANT: persist ports here too (see section 2)
          ports,
        },
      },
      ports,
    };

    if (action.type === 'run-panel') {
      if (this.uiNodes().some(n => n.type === 'run-panel')) return;
      this.uiNodes.set([...this.uiNodes(), node]);
      return;
    }

    const execNext = [...this.execNodes(), node];
    const edgesNow = this._edges();

    // Update connectivity flags (__missingIn/__missingOut) for all nodes after drop
    const withUi = this.withUiConnectivity([...execNext, ...this.uiNodes()], edgesNow);
    this.execNodes.set(withUi.filter(n => this.isExecutableNode(n)));
    this.uiNodes.set(withUi.filter(n => !this.isExecutableNode(n)));

    // Recompute connectivity and validation using the updated nodes
    // This ensures the dropped node's required inputs are checked immediately
    this.emitConnectivity(withUi, edgesNow);
    this.publishGraphValidity();

    this.emitGraphChange(this.execNodes(), edgesNow);
  }

  /** Handle model change from DrawFlow */
  onModelChange = (m: DfDataModel): void => {
    // During workflow switch/re-hydration, DrawFlow can briefly emit stale/empty models.
    // Ignore these events to avoid pushing wrong graphs back to the store.
    if (this.workflowSwitchInProgress) return;

    const prevExec = this.execNodes();
    const prevUi = this.uiNodes();
    const noNodes = !m?.nodes || m.nodes.length === 0;
    const noConns = !m?.connections || m.connections.length === 0;

    // Check if we're in a local change window - if so, preserve our local edges
    let nextEdges: WorkflowEdge[];
    if (noConns) {
      nextEdges = this._edges();
    } else if (this.localChangeInProgress) {
      // Merge: keep local edges that aren't in DrawFlow yet, add DrawFlow's edges
      const dfEdges = m.connections.map(c => ({
        id: this.makeEdgeId(c.source.nodeId, c.source.connectorId, c.target.nodeId, c.target.connectorId),
        source: c.source.nodeId,
        target: c.target.nodeId,
        sourcePort: c.source.connectorId,
        targetPort: c.target.connectorId,
        label: '',
      }));
      const dfEdgeIds = new Set(dfEdges.map(e => e.id));
      const localEdges = this._edges().filter(e => !dfEdgeIds.has(e.id));
      nextEdges = [...dfEdges, ...localEdges];
    } else {
      nextEdges = m.connections.map(c => ({
        id: this.makeEdgeId(c.source.nodeId, c.source.connectorId, c.target.nodeId, c.target.connectorId),
        source: c.source.nodeId,
        target: c.target.nodeId,
        sourcePort: c.source.connectorId,
        targetPort: c.target.connectorId,
        label: '',
      }));
    }
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
      let portsCandidate = (rawData as Record<string, unknown>)?.['ports'] as WorkflowNode['ports'] | undefined ?? prev?.ports;
      if (!portsCandidate) {
        const params = (rawData as Record<string, unknown>)?.['params'] as Record<string, unknown> | undefined ?? (prev?.data?.params as Record<string, unknown> | undefined);
        const portsMap = params?.['ports_map'] as Record<string, { required?: boolean; readonly?: boolean }> | undefined;
        if (portsMap && typeof portsMap === 'object') {
          const base = this.ensurePorts(type, undefined);
          const baseIds = new Set(base.inputs.map(p => p.id).concat(base.outputs.map(p => p.id)));
          const inputs = base.inputs.map(p => ({ ...p, required: !!portsMap[p.id]?.required, readonly: !!portsMap[p.id]?.readonly }));
          const outputs = base.outputs.map(p => ({ ...p, required: !!portsMap[p.id]?.required, readonly: !!portsMap[p.id]?.readonly }));
          for (const [id, meta] of Object.entries(portsMap)) {
            if (!baseIds.has(id)) {
              const inferredType = inferPortTypeFromReference(id) ?? 'json';
              outputs.push({ id, label: id, type: inferredType, artifact_type: inferredType, required: !!meta.required, readonly: !!meta.readonly });
            }
          }
          portsCandidate = { inputs, outputs };
        }
      }
      const ports = this.ensurePorts(type, portsCandidate);
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
      
      // Only set suppression if not already active (respect existing suppression window)
      if (!this.localChangeInProgress) {
        this.suppressExternal = true;
        this.emitExecOnly(nextExec, nextEdges);
        queueMicrotask(() => (this.suppressExternal = false));
      } else {
        this.emitExecOnly(nextExec, nextEdges);
      }
    }

    if (
      this.pendingCenterAfterSwitch &&
      !this.workflowSwitchInProgress &&
      (m?.nodes?.length ?? 0) > 0
    ) {
      this.pendingCenterAfterSwitch = false;
      this.scheduleCenterOnNodes();
    }

    if (
      this.pendingCenterAfterSwitch &&
      !this.workflowSwitchInProgress &&
      (m?.nodes?.length ?? 0) > 0
    ) {
      this.pendingCenterAfterSwitch = false;
      this.scheduleCenterOnNodes();
    }
  };

  /** Handle node selection event */
  onNodeSelected(e: unknown): void {
    const nodeId = (e as { id?: string; nodeId?: string }).id ?? (e as { nodeId?: string }).nodeId ?? null;
    this.setSelectedNode(nodeId);
  }

  /** Handle canvas click */
  onCanvasCLick() {
    this.setSelectedNode(null);
  }

  /** Handle node moved event */
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
    return evt;
  }

  /** Handle connection created event */
  onConnectionCreated(evt: DfEvent<DfDataConnection>): void {
    const t = evt?.target?.target, s = evt?.target?.source;
    if (!s || !t) return;

    const id = this.makeEdgeId(s.nodeId, s.connectorId, t.nodeId, t.connectorId);
    if (this._edges().some(e => e.id === id)) return;

    // Validate port type compatibility (n8n-inspired)
    const sourceNode = this.allNodes().find(n => n.id === s.nodeId);
    const targetNode = this.allNodes().find(n => n.id === t.nodeId);
    
    if (sourceNode && targetNode) {
      const sourcePort = sourceNode.ports?.outputs?.find(p => p.id === s.connectorId);
      const targetPort = targetNode.ports?.inputs?.find(p => p.id === t.connectorId);
      
      if (sourcePort && targetPort) {
        const sourceType = sourcePort.type || sourcePort.artifact_type;
        const targetType = targetPort.type || targetPort.artifact_type;

        const isCompatible = this.arePortTypesCompatible(sourceType, targetType);
        
        if (!isCompatible) {
          const sourceTypeDisplay = sourceType || 'any';
          const targetTypeDisplay = targetType || 'any';
          
          this.toast.showError(
            this.translate.instant('workflow.errors.incompatible_port_types', {
              sourceNode: sourceNode.data?.label || sourceNode.type,
              sourcePort: sourcePort.label || sourcePort.id,
              sourceType: sourceTypeDisplay,
              targetNode: targetNode.data?.label || targetNode.type,
              targetPort: targetPort.label || targetPort.id,
              targetType: targetTypeDisplay
            })
          );
          
          // Don't add to edges - dfModel will filter it out from rendering
          return;
        }
      }
    }
    
    const nextEdge: WorkflowEdge = {
      id,
      source: s.nodeId,
      target: t.nodeId,
      sourcePort: s.connectorId,
      targetPort: t.connectorId,
      label: '',
    };

    // CRITICAL: Mark local change BEFORE updating _edges signal
    // This prevents parent's change detection from overwriting during the update
    this.markLocalChange();

    const after = [...this._edges(), nextEdge];
    this._edges.set(after);
    
    const combined = [...this.execNodes(), ...this.uiNodes()];
    const withUi = this.withUiConnectivity(combined, after);

    this.emitConnectivity(withUi, after);
    this.publishGraphValidity();
    this.schedulePublishGraphValidity();

    // Emit change to parent (markLocalChange already handles suppression timeout)
    this.emitGraphChange(this.execNodes(), after);
  }

  /**
   * Check if two port types are compatible for connection
   * Uses generic pattern matching based on port type attributes
   */
  private arePortTypesCompatible(sourceType?: string, targetType?: string): boolean {
    // If either type is undefined or 'any', allow connection
    if (!sourceType || !targetType || sourceType === 'any' || targetType === 'any') {
      return true;
    }

    // Normalize types to lowercase for comparison
    const source = sourceType.toLowerCase().trim();
    const target = targetType.toLowerCase().trim();

    // Exact match
    if (source === target) {
      return true;
    }

    // Array/List pattern matching
    const sourceIsArray = source.startsWith('list[') || source.includes('[]');
    const targetIsArray = target.startsWith('list[') || target.includes('[]');
    
    if (sourceIsArray && targetIsArray) {
      // Both are arrays - extract and compare base types
      const sourceBase = source.replace(/^list\[|\]$|^\[|\]$/g, '');
      const targetBase = target.replace(/^list\[|\]$|^\[|\]$/g, '');
      return this.arePortTypesCompatible(sourceBase, targetBase);
    }

    // No match found - types are incompatible
    return false;
  }

  /** Handle connection deleted event */
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

  /** Set selected node */
  setSelectedNode(id: string | null): void {
    this.selectedNodeId.set(id);
  }

  /** Handle delete node */
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

    this.markLocalChange();
    this.lastTopoSig = this.makeTopoSig(nextExec, nextEdges);

    this.execNodes.set(nextExec);
    this._edges.set(nextEdges);

    const withUi = this.withUiConnectivity([...nextExec, ...this.uiNodes()], nextEdges);
    this.emitConnectivity(withUi, nextEdges);
    this.publishGraphValidity();

    if (this.selectedNodeId() === id) this.setSelectedNode(null);
    this.emitGraphChange(nextExec, nextEdges);
  };

  /** Submit the workflow */
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

  /** Emit connectivity events for nodes */
  private emitConnectivity(nodes: WorkflowNode[], edges: WorkflowEdge[]): void {
    const map = sharedComputeConnectivity(nodes, edges);
    for (const n of nodes) {
      const c = map.get(n.id);
      if (!c) continue;
      this.bus.nodeConnectivity$.next({ nodeId: n.id, missingIn: c.missingIn, missingOut: c.missingOut });
      this.bus.nodePortStatus$.next({ nodeId: n.id, missingInputs: c.missingInputs, missingOutputs: c.missingOutputs });
    }
  }

  /** Check if run panel is shown */
  showRunPanel(): boolean {
    const RUN_PANEL_ID = 'run-panel-node';
    const ui = this.uiNodes();
    const idx = ui.findIndex(n => n.id === RUN_PANEL_ID || n.type === 'run-panel');

    return idx >= 0
  }

  /** Run starting from node */
  runStartingFrom(nodeId: string): void {
    const node = this.execNodes().find(n => n.id === nodeId);
    if (!node) {
      this.toast.showError(this.translate.instant('workflow.errors.nodeNotFound'));
      return;
    }

    // simple check: node must have inputs satisfied or pinned data exists (stored in fileCache as placeholder for now)
    const incoming = this._edges().filter(e => e.target === nodeId);
    const ports = this.ensurePorts(node.type, node.ports);
    const needsIn = (ports.inputs?.length ?? 0) > 0;
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

  private emitGraphChange(nodes: WorkflowNode[], edges: WorkflowEdge[]): void {
    const sanitizedEdges = this.sanitizeEdges([...nodes, ...this.uiNodes()], edges);

    this.lastTopoSig = this.makeTopoSig(nodes, sanitizedEdges);
    
    // Only manage suppression if not already in a local change window
    if (!this.localChangeInProgress) {
      this.suppressExternal = true;
      this.OnCanvasChange.emit({ nodes, edges: sanitizedEdges });
      queueMicrotask(() => (this.suppressExternal = false));
    } else {
      // Respect existing suppression window, just emit
      this.OnCanvasChange.emit({ nodes, edges: sanitizedEdges });
    }
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

    const workWithNode = (existingNode: WorkflowNode) => {
      const minEdit = this.minEditCountsFor(existingNode.type);
      const nextPorts = this.ensurePorts(
        existingNode.type,
        { inputs, outputs },
        { padToMinimum: true, minInputs: minEdit.inputs, minOutputs: minEdit.outputs }
      );
      const nextData = {
        ...(existingNode.data ?? {}),
        // store ports both at data.ports (used by coerceModel/safeModel) and inside params.ports
        ports: nextPorts,
        params: {
          ...((existingNode.data && existingNode.data.params) ?? {}),
          ports: nextPorts,
        }
      } as typeof existingNode.data;

      return { nextPorts, nextData } as const;
    };

    if (iExec >= 0) {
      const existing = exec[iExec];
      const { nextPorts, nextData } = workWithNode(existing);

      const nextExec = exec.slice();
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

      const withUi = this.withUiConnectivity([...this.execNodes()], nextEdges);
      this.emitConnectivity(withUi, nextEdges);
      this.publishGraphValidity();
      this.emitGraphChange(nextExec, nextEdges);
      return;
    }

    // not found in exec nodes -> try ui nodes
    const ui = this.uiNodes();
    const iUi = ui.findIndex(n => n.id === nodeId);
    if (iUi >= 0) {
      const existing = ui[iUi];
      const { nextPorts, nextData } = workWithNode(existing);

      const nextUi = ui.slice();
      nextUi[iUi] = { ...existing, ports: nextPorts, data: nextData };
      this.uiNodes.set(nextUi);

      const validIn = new Set(nextPorts.inputs.map(p => p.id));
      const validOut = new Set(nextPorts.outputs.map(p => p.id));
      const nextEdges = this._edges().filter(e => {
        if (e.source === nodeId && !validOut.has(e.sourcePort)) return false;
        if (e.target === nodeId && !validIn.has(e.targetPort)) return false;
        return true;
      });
      this._edges.set(nextEdges);

      const withUi = this.withUiConnectivity([...this.execNodes(), ...nextUi], nextEdges);
      this.execNodes.set(withUi.filter(n => this.isExecutableNode(n)));
      this.uiNodes.set(withUi.filter(n => !this.isExecutableNode(n)));
      this.emitConnectivity(withUi, nextEdges);
      this.publishGraphValidity();
      this.emitGraphChange(this.execNodes(), nextEdges);
      return;
    }
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

  private refreshConnectivityAndValidity(): void {
    const edges = this._edges();
    const withUi = this.withUiConnectivity(this.allNodes(), edges);

    this.execNodes.set(withUi.filter(n => this.isExecutableNode(n)));
    this.uiNodes.set(withUi.filter(n => !this.isExecutableNode(n)));

    // ✅ missing in your current version
    this.emitConnectivity(withUi, edges);

    this.publishGraphValidity();

    // ✅ also do the render-safe pass when needed
    this.refreshValidationAndConnectivityAfterRender();
  }

  private pushExecToParent(): void {
    // Only manage suppression if not already in a local change window
    if (!this.localChangeInProgress) {
      this.suppressExternal = true;
      this.emitExecOnly(this.execNodes(), this._edges());
      queueMicrotask(() => (this.suppressExternal = false));
    } else {
      // Respect existing suppression window, just emit
      this.emitExecOnly(this.execNodes(), this._edges());
    }
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

  private isExecutableNode(n: WorkflowNode): boolean {
    const nodeType = this.normalizeNodeTypeToken(n.type);
    const aiTypeRaw = (n.data?.aiType ?? '').toString();
    const aiType = this.normalizeNodeTypeToken(aiTypeRaw);

    if (nodeType === 'composite' || aiTypeRaw.startsWith('wf:') || !!n.data?.params?.['__workflowId']) {
      return true;
    }

    if (nodeType === 'run_panel' || nodeType === 'details' || nodeType === 'preview') {
      return false;
    }

    if (this.executableNodesSig().size === 0) return true;

    const normalizedExecutableTypes = new Set<string>(
      Array.from(this.executableNodesSig()).map(type => this.normalizeNodeTypeToken(type))
    );

    const matchesCatalog =
      normalizedExecutableTypes.has(nodeType) ||
      (aiType.length > 0 && normalizedExecutableTypes.has(aiType));

    // Be permissive for persisted workflows: unknown node types should remain visible
    // instead of disappearing when catalog/executable types drift.
    if (!matchesCatalog && nodeType.length > 0) {
      return true;
    }
    return matchesCatalog;
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
    return type === "composite" || !!a.params?.['workflowId'];
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

    const normalized = this.normalizeNodeTypeToken(candidate);
    const renderTypeByNormalized: Record<string, string> = {
      chat: 'chat',
      trigger_chat: 'trigger_chat',
      trigger_file_upload: 'trigger_file_upload',
      trigger_webhook: 'trigger_webhook',
      trigger_manual: 'trigger_manual',
      embed: 'embed',
      retrieve: 'retrieve',
      convert_and_chunk: 'convert_and_chunk',
      embed_langchain_documents: 'embed_langchain_documents',
      store_embedded_langchain_documents: 'store_embedded_langchain_documents',
      composite: 'composite',
      run_panel: 'run-panel',
      details: 'details',
      preview: 'preview',
    };

    if (renderTypeByNormalized[normalized]) {
      return renderTypeByNormalized[normalized];
    }

    return 'composite';
  }

  private normalizeNodeTypeToken(type: unknown): string {
    return (type ?? '').toString().trim().toLowerCase().replace(/-/g, '_');
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

  /**
   * Centers viewport on current graph without mutating node coordinates.
   * This only adjusts DrawFlow pan/zoom state.
   */
  centerOnNodes(): boolean {
    const hasFinitePosition = (n: WorkflowNode): boolean =>
      typeof n.x === 'number' &&
      Number.isFinite(n.x) &&
      typeof n.y === 'number' &&
      Number.isFinite(n.y);

    const positionedExec = (this.execNodes() ?? []).filter(hasFinitePosition);
    const positionedAll = (this.allNodes() ?? []).filter(hasFinitePosition);
    const nodes = positionedExec.length > 0
      ? positionedExec
      : positionedAll;

    if (!nodes.length) return false;
    const flow = this.flow as unknown as {
      resetPosition?: () => void;
      panzoom?: unknown;
    } | undefined;
    if (!flow) return false;

    const panzoom = flow.panzoom as {
      panZoomService?: { panzoomModel?: { zoom?: number } };
      panZoomOptions?: { minZoom?: number; maxZoom?: number };
      setZoom?: (zoom: number) => void;
      getGuardedCoordinates?: (x: number, y: number) => { x: number; y: number };
      coordinates$?: { next: (value: { x: number; y: number }) => void };
    } | undefined;
    if (!panzoom) return false;

    // Calculate graph bounds in node-space
    let minX = Infinity, maxX = -Infinity;
    let minY = Infinity, maxY = -Infinity;
    const approxNodeWidth = 280;
    const approxNodeHeight = 180;

    nodes.forEach(n => {
      const x = n.x ?? 0;
      const y = n.y ?? 0;
      minX = Math.min(minX, x);
      maxX = Math.max(maxX, x + approxNodeWidth);
      minY = Math.min(minY, y);
      maxY = Math.max(maxY, y + approxNodeHeight);
    });

    const viewport = this.flowElementRef?.nativeElement;
    const viewportWidth = viewport?.clientWidth ?? 0;
    const viewportHeight = viewport?.clientHeight ?? 0;
    if (viewportWidth < 32 || viewportHeight < 32) {
      return false;
    }
    const contentWidth = Math.max(1, maxX - minX);
    const contentHeight = Math.max(1, maxY - minY);

    // Fit-to-view with focus: allow zoom-in when graph is small.
    const padding = nodes.length <= 2 ? 80 : 120;
    const fitScaleX = viewportWidth > 0 ? (viewportWidth - padding) / contentWidth : 1;
    const fitScaleY = viewportHeight > 0 ? (viewportHeight - padding) / contentHeight : 1;
    const fitScale = Math.max(0.05, Math.min(fitScaleX, fitScaleY));
    const focusFactor = 0.92;
    const minZoom = panzoom.panZoomOptions?.minZoom ?? 0.1;
    const maxZoom = panzoom.panZoomOptions?.maxZoom ?? 3;
    const targetZoom = Math.max(minZoom, Math.min(maxZoom, fitScale * focusFactor));
    panzoom.setZoom?.(targetZoom);

    const effectiveZoom = panzoom.panZoomService?.panzoomModel?.zoom ?? (targetZoom || 1);
    const centerX = (minX + maxX) / 2;
    const centerY = (minY + maxY) / 2;
    const desiredPanX = viewportWidth > 0
      ? (viewportWidth / 2) - (centerX * effectiveZoom)
      : -centerX * effectiveZoom;
    const desiredPanY = viewportHeight > 0
      ? (viewportHeight / 2) - (centerY * effectiveZoom)
      : -centerY * effectiveZoom;
    const guardedPan = panzoom.getGuardedCoordinates
      ? panzoom.getGuardedCoordinates(desiredPanX, desiredPanY)
      : { x: desiredPanX, y: desiredPanY };
    panzoom.coordinates$?.next(guardedPan);
    return true;
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

    if ((opts?.mode ?? 'connect') === 'connect') {
      return base.filter(a => this.portCountsFor(a.type).inputs > 0);
    }
    return base;
  }


  pickQuickAction(a: { type: string; icon?: string }): void {
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
    const actionPortsMap = (def?.params?.['ports_map'] as Record<string, { required?: boolean; readonly?: boolean }> | undefined);
    const actionParams = { ...(def?.params ?? {}) } as Record<string, unknown>;
    delete actionParams['ports'];
    delete actionParams['label'];
    delete actionParams['class'];
    delete actionParams['workflowId'];
    const isComposite = actionType.startsWith('wf:') || !!def?.params?.['workflowId'];
    const nodeType = isComposite ? 'composite' : (actionType as PaletteType);

    // ✅ REPLACE mode: replace source node by removing old completely (new id)
    if (replaceMode && sourceNode) {
      const oldId = sourceNodeId;

      // mark oldId as recently replaced (avoid brief upstream echo)
      this.recentlyDeleted.set(oldId, Date.now());

      const newId = crypto?.randomUUID?.() ?? this.genId('n');
      const ports = this.ensurePorts(nodeType, actionPorts, { portsMap: actionPortsMap });

      const updatedNode: WorkflowNode = {
        ...sourceNode,
        id: newId,
        type: nodeType as PaletteType,
        x: sourceNode.x,
        y: sourceNode.y,
        data: {
          ...(sourceNode.data ?? {}),
          label: actionLabel,
          aiType: actionType as InspectorActionType,
          params: {
            ...(sourceNode.data?.params ?? {}), // keep existing params if you want
            ...actionParams,
            ui: { expanded: true },
            icon: icon || (def?.params?.['icon'] as string | undefined),
            __workflowId: isComposite ? (def?.params?.['workflowId'] as string | undefined) : undefined,

            // ✅ critical: persist ports where other parts of your app might read them
            ports,
          },
        },
        ports,
      };

      const pickPort = (prevPortId: string | undefined, side: 'in' | 'out'): string | null => {
        const list = side === 'in' ? (ports.inputs ?? []) : (ports.outputs ?? []);
        if (!list.length) return null;
        if (prevPortId && list.some(p => p.id === prevPortId)) return prevPortId;
        return list[0]!.id;
      };

      // VISUAL cleanup: remove old connections + old node from DF immediately (best-effort)
      try {
        const api = this.flow as DrawFlowApi;
        const touching = this._edges().filter(e => e.source === oldId || e.target === oldId);
        for (const e of touching) {
          api?.removeConnection?.({
            source: { nodeId: e.source, connectorType: DfConnectionPoint.Output, connectorId: e.sourcePort },
            target: { nodeId: e.target, connectorType: DfConnectionPoint.Input, connectorId: e.targetPort },
          });
        }
        api?.removeNode?.(oldId);
      } catch {
        // ignore
      }

      // Rewire edges in ONE pass (handles self-loop too)
      const rewired = this._edges()
        .map(e => {
          const affectsSource = e.source === oldId;
          const affectsTarget = e.target === oldId;
          if (!affectsSource && !affectsTarget) return e;

          const src = affectsSource ? newId : e.source;
          const tgt = affectsTarget ? newId : e.target;

          const srcPort = affectsSource ? pickPort(e.sourcePort, 'out') : e.sourcePort;
          const tgtPort = affectsTarget ? pickPort(e.targetPort, 'in') : e.targetPort;

          if (affectsSource && !srcPort) return null;
          if (affectsTarget && !tgtPort) return null;

          return {
            ...e,
            source: src,
            target: tgt,
            sourcePort: srcPort!,
            targetPort: tgtPort!,
            id: this.makeEdgeId(src, srcPort!, tgt, tgtPort!),
          } satisfies WorkflowEdge;
        })
        .filter((x): x is WorkflowEdge => !!x);

      // Remove old node completely + add new node
      const execPrev = this.execNodes();
      const execNext = [...execPrev.filter(n => n.id !== oldId), updatedNode];

      // sanitize + dedup edges
      const sanitized = this.sanitizeEdges([...execNext, ...this.uiNodes()], rewired);
      const dedup = new Map<string, WorkflowEdge>();
      for (const e of sanitized) dedup.set(e.id, e);
      const finalEdges = [...dedup.values()];

      // Commit state
      this.execNodes.set(execNext);
      this._edges.set(finalEdges);

      this.forceGraphRecalc();

      // update selection if needed
      if (this.selectedNodeId() === oldId) {
        this.selectedNodeId.set(newId);
      }

      // Update topo + local change marker
      this.markLocalChange();
      this.lastTopoSig = this.makeTopoSig(execNext, finalEdges);

      // Commit connectivity flags into node params + broadcast
      const withUi = this.withUiConnectivity([...execNext, ...this.uiNodes()], finalEdges);
      this.execNodes.set(withUi.filter(n => this.isExecutableNode(n)));
      this.uiNodes.set(withUi.filter(n => !this.isExecutableNode(n)));

      this.emitConnectivity(withUi, finalEdges);
      this.publishGraphValidity();

      // Render-safe second pass
      requestAnimationFrame(() => {
        const edgesNow = this._edges();
        const nodesNow = [...this.execNodes(), ...this.uiNodes()];
        const withUi2 = this.withUiConnectivity(nodesNow, edgesNow);
        this.emitConnectivity(withUi2, edgesNow);
        this.publishGraphValidity();
      });

      // Tell parent/store (old removed, new added)
      this.emitGraphChange(this.execNodes(), finalEdges);

      this.quickAddOpen = false;
      return;
    }

    // ✅ Normal mode: spawn picked action node and link it
    const id = crypto?.randomUUID?.() ?? this.genId('n');
    const ports = this.ensurePorts(nodeType, actionPorts, { portsMap: actionPortsMap });

    if (!replaceMode && (ports.inputs?.length ?? 0) === 0) {
      this.quickAddOpen = false;
      return;
    }

    const node: WorkflowNode = {
      id,
      type: nodeType as PaletteType,
      x: (sourceNode?.x ?? 0) + 650,
      y: (sourceNode?.y ?? 0),
      data: {
        label: actionLabel,
        aiType: actionType as InspectorActionType,
        params: {
          ...actionParams,
          ui: { expanded: true },
          icon: icon || (def?.params?.['icon'] as string | undefined),
          __workflowId: isComposite ? (def?.params?.['workflowId'] as string | undefined) : undefined,
          ports,
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
    const sanitizedEdges = this.sanitizeEdges([...execNext, ...this.uiNodes()], nextEdges);
    this._edges.set(sanitizedEdges);

    const withUi = this.withUiConnectivity([...execNext, ...this.uiNodes()], sanitizedEdges);
    this.execNodes.set(withUi.filter(n => this.isExecutableNode(n)));
    this.uiNodes.set(withUi.filter(n => !this.isExecutableNode(n)));

    this.emitConnectivity(withUi, sanitizedEdges);
    this.publishGraphValidity();
    this.emitGraphChange(this.execNodes(), sanitizedEdges);

    this.quickAddOpen = false;
  }

  private forceGraphRecalc(): void {
    // 1) sanitize edges against CURRENT ports (important after replace)
    const nodesNow = this.allNodes();
    const edgesNow = this.sanitizeEdges(nodesNow, this._edges());

    // ensure edges state matches sanitization
    this._edges.set(edgesNow);

    // 2) compute + broadcast connectivity immediately
    const withUi = this.withUiConnectivity(nodesNow, edgesNow);
    this.execNodes.set(withUi.filter(n => this.isExecutableNode(n)));
    this.uiNodes.set(withUi.filter(n => !this.isExecutableNode(n)));

    this.emitConnectivity(withUi, edgesNow);
    this.publishGraphValidity();

    // 3) render-safe second pass: nodes subscribe after DF creates components
    this.refreshValidationAndConnectivityAfterRender();
  }

  linkToExisting(targetId: string): void {
    if (!this.quickAddCtx) return;
    const { sourceNodeId, sourcePortId } = this.quickAddCtx;

    if (sourceNodeId === targetId) return;

    const all = this.allNodes();
    const srcNode = all.find(n => n.id === sourceNodeId);
    const tgtNode = all.find(n => n.id === targetId);
    if (!srcNode || !tgtNode) return;

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

  /** Get port counts for type */
  private portCountsFor(type: string) { return sharedPortCountsFor(type); }
  /** Get min edit counts for type */
  private minEditCountsFor(type: string) { return sharedMinEditCountsFor(type); }

  /** Ensure ports for node type, normalizing and applying overrides */
  private ensurePorts(type: string, ports?: WorkflowNode['ports'], opts?: { padToMinimum?: boolean; minInputs?: number; minOutputs?: number; portsMap?: PortsMap }): WorkflowNode['ports'] {
    return storeEnsurePorts(type, ports, opts);
  }

  /** Sanitize graph edges */
  private sanitizeGraph(nodesArg: WorkflowNode[] | null | undefined, edgesArg: WorkflowEdge[] | null | undefined) {
    return sharedSanitizeGraph(nodesArg, edgesArg);
  }

  /** Compute validation state */
  private computeValidation(nodesArg: WorkflowNode[] | null | undefined, edgesArg: WorkflowEdge[] | null | undefined): WorkflowValidationState {
    return sharedComputeValidation(nodesArg, edgesArg, {
      includeNode: (n) => this.isExecutableNode(n) && !n.data?.params?.['__disabled'],
      formInvalidByNode: this.formInvalidByNode,
    });
  }
}
