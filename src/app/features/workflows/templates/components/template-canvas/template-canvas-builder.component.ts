/**
 * Template Canvas Builder Component
 * 
 * A visual canvas-based builder for Template Workflows (Tier 3).
 * Uses ng-draw-flow library for professional node-based editing.
 * Uses ToolbarActionsService for consistent header actions.
 * 
 * Features:
 * - Drag composite workflows from palette onto canvas
 * - Visual nodes for composites, session/project context, and UI components
 * - Connection mode for linking ports between nodes
 * - Session/Project storage nodes for persisting data
 * - UI component nodes (chat, file-upload, summarize, extract, compare, result-viewer)
 */

import {
    Component,
    OnInit,
    OnDestroy,
    inject,
    signal,
    computed,
    ChangeDetectionStrategy,
    ViewChild,
    DestroyRef,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule, ReactiveFormsModule, FormBuilder, FormGroup, Validators } from '@angular/forms';
import { Router, ActivatedRoute } from '@angular/router';
import { Subject, takeUntil, debounceTime, filter, take, combineLatest, interval, merge, fromEvent } from 'rxjs';
import { toObservable } from '@angular/core/rxjs-interop';

// Angular Material
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatTooltipModule } from '@angular/material/tooltip';
import { MatSnackBarModule } from '@angular/material/snack-bar';
import { MatSidenavModule } from '@angular/material/sidenav';

import { TranslateModule, TranslateService } from '@ngx-translate/core';
import { CdkDragDrop, CdkDropList, DragDropModule } from '@angular/cdk/drag-drop';

// ng-draw-flow
import {
    DfArrowhead,
    DfConnectionType,
    DfDataConnection,
    DfDataInitialNode,
    DfDataNode,
    DfDataModel,
    DfEvent,
    dfPanZoomOptionsProvider,
    NgDrawFlowComponent,
    provideNgDrawFlowConfigs,
    DfConnectionPoint,
} from '@ng-draw-flow/core';

// Store and interfaces
import { TemplateWorkflowsStore } from '../../data/template-workflows.store';
import {
    TemplateWorkflow,
    TemplateWorkflowNode,
    TemplateWorkflowEdge,
    CompositeWorkflow,
    TemplatePresentationPattern,
    TemplateLayoutType,
    UIComponentConfig,
    WorkflowStatus,
    DataPortScopeConfig,
    TemplateDataFlowConfig,
    ExposedHandle,
} from '../../interfaces/template-workflow.interface';
import { DynamicFormComponent, SeoComponent } from '@cadai/pxs-ng-core/shared';
import { FieldConfigService, ToolbarActionsService, ToastService, LayoutService } from '@cadai/pxs-ng-core/services';
import { FieldConfig, ToolbarAction } from '@cadai/pxs-ng-core/interfaces';
import { WorkflowSyncService } from '../../services/workflow-sync.service';

// WfCanvasBus for node events
import { WfCanvasBus } from '../../utils/wf-canvas-bus';

// Custom node components
import { TemplateCompositeDfNodeComponent } from './nodes/template-composite-node.component';
import {
    TemplateContextDfNodeComponent,
    StoredDataItem,
    TEMPLATE_CONTEXT_STORE_INPUT_PORT_ID,
    TEMPLATE_CONTEXT_STORE_INPUT_PORT_ID_LEGACY,
} from './nodes/template-context-node.component';
import { TemplateUiDfNodeComponent, UIComponentType } from './nodes/template-ui-node.component';

// ============================================================================
// INTERFACES
// ============================================================================

type DfNodeWithPosition = DfDataNode & { point?: { x: number; y: number } };

interface TierConsistencyReport {
    normalizedCompositeNodes: number;
    removedInvalidEdges: number;
    missingCompositeNodeIds: string[];
}

/** Node types in the template canvas */
export type TemplateCanvasNodeType = 'composite' | 'session-context' | 'project-context' | 'ui-component';

/** Canvas node internal representation */
export interface TemplateCanvasNode {
    id: string;
    type: TemplateCanvasNodeType;
    x: number;
    y: number;
    data: {
        label: string;
        icon: string;
        compositeId?: string;
        compositeConfig?: Record<string, unknown>;
        exposedInputs?: ExposedHandle[];
        exposedOutputs?: ExposedHandle[];
        contextType?: 'session' | 'project';
        storedItems?: StoredDataItem[];
        uiType?: UIComponentType;
        bindings?: { portId: string; targetPath: string }[];
        uiConfig?: Record<string, unknown>;
    };
}

/** Canvas edge internal representation */
export interface TemplateCanvasEdge {
    id: string;
    source: string;
    sourcePort: string;
    target: string;
    targetPort: string;
}

/** Palette item for drag-drop */
export interface PaletteItem {
    type: TemplateCanvasNodeType;
    label: string;
    icon: string;
    category: 'composites' | 'storage' | 'ui';
    compositeId?: string;
    uiType?: UIComponentType;
    description?: string;
    nodeRenderType?: string;
}

// ============================================================================
// COMPONENT DEFINITION
// ============================================================================

@Component({
    selector: 'app-template-canvas-builder',
    standalone: true,
    imports: [
        CommonModule,
        FormsModule,
        ReactiveFormsModule,
        TranslateModule,
        DragDropModule,
        // Material
        MatButtonModule,
        MatIconModule,
        MatTooltipModule,
        MatSnackBarModule,
        MatSidenavModule,
        // ng-draw-flow
        NgDrawFlowComponent,
        // Dynamic Form
        DynamicFormComponent,
        // SEO
        SeoComponent,
    ],
    providers: [
        dfPanZoomOptionsProvider({
            panSize: 20000,
        }),
        provideNgDrawFlowConfigs({
            nodes: {
                'template-composite': TemplateCompositeDfNodeComponent,
                'template-session-context': TemplateContextDfNodeComponent,
                'template-project-context': TemplateContextDfNodeComponent,
                'template-ui': TemplateUiDfNodeComponent,
            },
            connection: {
                type: DfConnectionType.SmoothStep,
                arrowhead: { type: DfArrowhead.ArrowClosed, height: 8, width: 8 },
                curvature: 10,
            }
        }),
        WfCanvasBus,
    ],
    templateUrl: './template-canvas-builder.component.html',
    styleUrls: ['./template-canvas-builder.component.scss'],
    changeDetection: ChangeDetectionStrategy.OnPush,
})
export class TemplateCanvasBuilderComponent implements OnInit, OnDestroy {
    @ViewChild('flow', { static: false }) flow?: NgDrawFlowComponent;
    @ViewChild('paletteList') paletteList!: CdkDropList;
    @ViewChild('canvasList') canvasList!: CdkDropList;
    
    private readonly store = inject(TemplateWorkflowsStore);
    private readonly fb = inject(FormBuilder);
    private readonly router = inject(Router);
    private readonly route = inject(ActivatedRoute);
    private readonly layoutService = inject(LayoutService);
    private readonly translate = inject(TranslateService);
    private readonly fieldsService = inject(FieldConfigService);
    private readonly toolbarService = inject(ToolbarActionsService);
    private readonly toast = inject(ToastService);
    private readonly destroyRef = inject(DestroyRef);
    private readonly bus = inject(WfCanvasBus);
    private readonly workflowSync = inject(WorkflowSyncService);
    private readonly destroy$ = new Subject<void>();
    private readonly contextOverlapThreshold = 80;
    private readonly autosaveTrigger$ = new Subject<void>();
    private readonly autosaveDebounceMs = 450;
    private readonly workflowsStorageKey = 'app_workflows_v1';
    private autosaveReady = false;
    private lastAutosaveFingerprint: string | null = null;
    private flowSyncScheduled = false;
    private flowSyncAfterRenderScheduled = false;
    private compositesFingerprint = '';
    private isDestroyed = false;
    private recenterTimeoutId: ReturnType<typeof setTimeout> | null = null;

    // ========================================================================
    // STATE
    // ========================================================================

    /** Template ID (for edit mode) */
    readonly templateId = signal<string | null>(null);
    
    /** Edit mode flag */
    readonly isEditMode = computed(() => !!this.templateId());
    
    /** Loading state */
    readonly isLoading = signal(true);
    
    /** Saving state */
    readonly isSaving = signal(false);
    private readonly saving$ = toObservable(this.isSaving);
    
    /** Palette visibility */
    readonly showPalette = signal(false);

    /** Palette filter */
    readonly paletteFilter = signal('');
    
    /** Canvas nodes internal state */
    private readonly _nodes = signal<TemplateCanvasNode[]>([]);
    readonly canvasNodes = this._nodes.asReadonly();
    
    /** Canvas edges internal state */
    private readonly _edges = signal<TemplateCanvasEdge[]>([]);
    readonly canvasEdges = this._edges.asReadonly();
    
    /** Available composites from store */
    readonly availableComposites = signal<CompositeWorkflow[]>([]);
    
    /** Observable for available composites (must be created in injection context) */
    private readonly availableComposites$ = toObservable(this.availableComposites);

    /** Palette dragging state */
    readonly isPaletteDragging = signal(false);

    /** Basic info form validity (reactive signal) */
    readonly isBasicInfoValid = signal(false);

    // ========================================================================
    // FORMS
    // ========================================================================

    /** Basic info form */
    basicInfoForm!: FormGroup;
    
    /** Basic info field config for dynamic form */
    basicInfoFields: FieldConfig[] = [];

    /** Palette search field config */
    paletteFieldConfig: FieldConfig[] = [];
    paletteForm!: FormGroup;

    /** ng-draw-flow model as signal for better reactivity */
    private readonly _flowModel = signal<DfDataModel>({ nodes: [], connections: [] });
    readonly flowModel = this._flowModel.asReadonly();
    
    /** Flow key to force ng-draw-flow recreation when model changes */
    private readonly _flowKey = signal(0);
    readonly flowKey = this._flowKey.asReadonly();

    // ========================================================================
    // PALETTE ITEMS
    // ========================================================================

    /** Storage palette items */
    readonly storageItems: PaletteItem[] = [
        {
            type: 'session-context',
            label: 'Session Context',
            icon: 'history',
            category: 'storage',
            description: 'Temporary data within a single session',
            nodeRenderType: 'template-session-context',
        },
        {
            type: 'project-context',
            label: 'Project Context',
            icon: 'folder_shared',
            category: 'storage',
            description: 'Persistent data across all sessions',
            nodeRenderType: 'template-project-context',
        },
    ];

    /** Composite palette items (derived from available composites) */
    readonly compositePaletteItems = computed<PaletteItem[]>(() => {
        return this.availableComposites().map(c => ({
            type: 'composite' as TemplateCanvasNodeType,
            label: c.name,
            icon: 'hub',
            category: 'composites' as const,
            compositeId: c.id,
            description: c.description,
            nodeRenderType: 'template-composite',
        }));
    });

    /** Filtered palette items */
    readonly filteredComposites = computed(() => {
        const q = this.paletteFilter().toLowerCase().trim();
        const items = this.compositePaletteItems();
        if (!q) return items;
        return items.filter(i => i.label.toLowerCase().includes(q) || i.description?.toLowerCase().includes(q));
    });

    /** Check if has composite nodes */
    readonly hasComposites = computed(() => this._nodes().some(n => n.type === 'composite'));

    /** Check if canvas is empty (no nodes at all) */
    readonly isCanvasEmpty = computed(() => this._nodes().length === 0);

    // ========================================================================
    // NG-DRAW-FLOW MODEL
    // ========================================================================

    /** Build DfDataModel from current state - called explicitly when needed */
    private buildDfModel(): DfDataModel {
        const nodes = this._nodes();
        const edges = this._edges();
        
        // Create a set of valid node IDs for quick lookup
        const nodeIds = new Set(nodes.map(n => n.id));
        const nodeById = new Map(nodes.map(n => [n.id, n] as const));

        const dfNodes: DfDataNode[] = nodes.map(n => {
            const renderType = this.getNodeRenderType(n);
            return {
                id: n.id,
                data: {
                    ...n.data,
                    type: renderType,
                },
                position: { x: n.x, y: n.y },
            };
        });

        // Filter edges to only include those referencing existing nodes
        const validEdges = edges.filter(e => 
            e.source && e.target && nodeIds.has(e.source) && nodeIds.has(e.target)
        );

        const dfConnections: DfDataConnection[] = validEdges.map(e => ({
            source: {
                nodeId: e.source,
                connectorType: DfConnectionPoint.Output,
                connectorId: this.encodeOutputConnectorId(e.source, e.sourcePort),
            },
            target: {
                nodeId: e.target,
                connectorType: DfConnectionPoint.Input,
                connectorId: this.encodeInputConnectorId(
                    e.target,
                    this.normalizeContextTargetPortForNode(nodeById.get(e.target), e.targetPort)
                ),
            },
        }));

        return {
            nodes: dfNodes,
            connections: dfConnections,
        };
    }

    /** Update flow control with current model state */
    private syncFlowControl(): void {
        this.remapAndPruneContextStoreEdges();
        const model = this.buildDfModel();
        const flow = this.flow;
        if (!flow) {
            this._flowModel.set(model);
            this._flowKey.update(k => k + 1); // Force ng-draw-flow recreation
            this.queueAutosave();
            return;
        }

        this.purgeRuntimeContextStoreInputConnections();
        this.forceRuntimeConnections(model.connections);

        // ng-draw-flow's writeValue path adds connections but does not prune removed ones.
        // Explicitly remove stale runtime connections before setting the canonical model.
        const current = this._flowModel()?.connections ?? [];
        const desiredKeys = new Set(model.connections.map(conn => this.connectionKey(conn)));
        const contextNodeIds = new Set(
            this._nodes()
                .filter(node => this.isContextNode(node))
                .map(node => node.id)
        );

        for (const conn of current) {
            const key = this.connectionKey(conn);
            const targetPortId = this.decodeConnectorId(conn.target.connectorId);
            const isStaticContextStoreConn =
                contextNodeIds.has(conn.target.nodeId) &&
                this.isContextStoreInputPort(targetPortId);

            if (isStaticContextStoreConn || !desiredKeys.has(key)) {
                flow.removeConnection(conn);
            }
        }

        this._flowModel.set(model);
        this._flowKey.update(k => k + 1); // Force ng-draw-flow recreation
        this.queueAutosave();
    }

    private remapAndPruneContextStoreEdges(): void {
        const nodes = this._nodes();
        if (nodes.length === 0) return;
        const nodeById = new Map(nodes.map(node => [node.id, node] as const));

        this._edges.update(edges => {
            let changed = false;
            const deduped: TemplateCanvasEdge[] = [];
            const seen = new Set<string>();

            for (const edge of edges) {
                const targetNode = nodeById.get(edge.target);
                if (!this.isContextNode(targetNode) || !this.isContextStoreInputPort(edge.targetPort)) {
                    const key = `${edge.source}|${edge.sourcePort}|${edge.target}|${edge.targetPort}`;
                    if (!seen.has(key)) {
                        seen.add(key);
                        deduped.push(edge);
                    }
                    continue;
                }

                const sourceNode = nodeById.get(edge.source);
                const matchedItem = this.findContextStoredItemForEdge(edge, targetNode, sourceNode);
                if (!matchedItem) {
                    // Never persist static drop-zone links on context nodes.
                    changed = true;
                    continue;
                }

                const canonicalEdge: TemplateCanvasEdge = {
                    ...edge,
                    targetPort: matchedItem.id,
                };
                if (canonicalEdge.targetPort !== edge.targetPort) {
                    changed = true;
                }

                const key = `${canonicalEdge.source}|${canonicalEdge.sourcePort}|${canonicalEdge.target}|${canonicalEdge.targetPort}`;
                if (!seen.has(key)) {
                    seen.add(key);
                    deduped.push(canonicalEdge);
                } else {
                    changed = true;
                }
            }

            return changed ? deduped : edges;
        });
    }

    private connectionKey(connection: DfDataConnection): string {
        return [
            connection.source.nodeId,
            connection.source.connectorType,
            connection.source.connectorId,
            connection.target.nodeId,
            connection.target.connectorType,
            connection.target.connectorId,
        ].join('|');
    }

    private removeRuntimeConnectionsByConnectorId(connectorId: string): void {
        if (!connectorId) return;
        const flowAny = this.flow as unknown as {
            connectionsService?: {
                removeConnectionsByConnectorId?: (connectorId: string) => void;
            };
        } | undefined;
        flowAny?.connectionsService?.removeConnectionsByConnectorId?.(connectorId);
    }

    private forceRuntimeConnections(connections: DfDataConnection[]): void {
        const flowAny = this.flow as unknown as {
            connectionsService?: {
                connections$?: { next?: (connections: DfDataConnection[]) => void };
                usedConnectors$?: { next?: (connectorIds: string[]) => void };
            };
        } | undefined;
        const service = flowAny?.connectionsService;
        if (!service?.connections$?.next || !service?.usedConnectors$?.next) return;

        const uniqueByKey = new Map<string, DfDataConnection>();
        for (const conn of connections) {
            const key = this.connectionKey(conn);
            if (!uniqueByKey.has(key)) {
                uniqueByKey.set(key, conn);
            }
        }
        const canonicalConnections = [...uniqueByKey.values()];
        const usedConnectorIds = [...new Set(
            canonicalConnections.flatMap(conn => [conn.source.connectorId, conn.target.connectorId])
        )];

        service.usedConnectors$.next(usedConnectorIds);
        service.connections$.next(canonicalConnections);
    }

    private purgeRuntimeContextStoreInputConnections(nodeId?: string): void {
        const contextNodeIds = nodeId
            ? [nodeId]
            : this._nodes()
                .filter(n => this.isContextNode(n))
                .map(n => n.id);
        if (contextNodeIds.length === 0) return;
        const contextNodeIdSet = new Set(contextNodeIds);
        const connectorIdsToPurge = new Set<string>();

        for (const ctxNodeId of contextNodeIds) {
            // Canonical and legacy scoped connector IDs.
            connectorIdsToPurge.add(
                this.encodeInputConnectorId(ctxNodeId, TEMPLATE_CONTEXT_STORE_INPUT_PORT_ID)
            );
            connectorIdsToPurge.add(
                this.encodeInputConnectorId(ctxNodeId, TEMPLATE_CONTEXT_STORE_INPUT_PORT_ID_LEGACY)
            );

            // Legacy unscoped connector IDs from earlier implementations.
            connectorIdsToPurge.add(TEMPLATE_CONTEXT_STORE_INPUT_PORT_ID);
            connectorIdsToPurge.add(TEMPLATE_CONTEXT_STORE_INPUT_PORT_ID_LEGACY);
        }

        const collectTransientContextStoreTargets = (connections: DfDataConnection[] | undefined): void => {
            if (!connections?.length) return;
            for (const conn of connections) {
                if (!contextNodeIdSet.has(conn.target.nodeId)) continue;
                const runtimeConnectorId = (conn.target.connectorId ?? '').toString();
                const decodedPort = this.decodeConnectorId(runtimeConnectorId);
                if (this.isContextStoreInputPort(decodedPort) || this.isContextStoreInputPort(runtimeConnectorId)) {
                    connectorIdsToPurge.add(runtimeConnectorId);
                }
            }
        };

        const flowAny = this.flow as unknown as {
            connectionsService?: {
                connections$?: { value?: DfDataConnection[] };
            };
        } | undefined;
        collectTransientContextStoreTargets(flowAny?.connectionsService?.connections$?.value);
        collectTransientContextStoreTargets(this._flowModel()?.connections);

        for (const connectorId of connectorIdsToPurge) {
            this.removeRuntimeConnectionsByConnectorId(connectorId);
        }
    }

    private encodeInputConnectorId(nodeId: string, portId: string): string {
        return `${nodeId}::in::${portId}`;
    }

    private encodeOutputConnectorId(nodeId: string, portId: string): string {
        return `${nodeId}::out::${portId}`;
    }

    private decodeConnectorId(connectorId: string): string {
        const raw = (connectorId ?? '').toString();
        if (!raw.includes('::')) return raw;

        const parts = raw.split('::');
        if (parts.length >= 3 && (parts[1] === 'in' || parts[1] === 'out')) {
            return parts.slice(2).join('::');
        }
        // Backward compatibility with prior "nodeId::portId" formatting.
        if (parts.length === 2) {
            const [maybeNodeId, maybePortId] = parts;
            if (this._nodes().some(node => node.id === maybeNodeId)) {
                return maybePortId;
            }
        }
        return raw;
    }

    private isContextNode(
        node: TemplateCanvasNode | undefined
    ): node is TemplateCanvasNode & { type: 'session-context' | 'project-context' } {
        return Boolean(node && (node.type === 'session-context' || node.type === 'project-context'));
    }

    private isContextStoreInputPort(portId: string): boolean {
        const normalized = (portId ?? '').toString();
        if (!normalized) return false;
        return (
            normalized === TEMPLATE_CONTEXT_STORE_INPUT_PORT_ID ||
            normalized === TEMPLATE_CONTEXT_STORE_INPUT_PORT_ID_LEGACY ||
            normalized.startsWith(`${TEMPLATE_CONTEXT_STORE_INPUT_PORT_ID}::`) ||
            normalized.startsWith(`${TEMPLATE_CONTEXT_STORE_INPUT_PORT_ID_LEGACY}::`)
        );
    }

    private normalizeContextStoreInputPort(portId: string): string {
        return this.isContextStoreInputPort(portId) ? TEMPLATE_CONTEXT_STORE_INPUT_PORT_ID : portId;
    }

    private normalizeContextTargetPortForNode(node: TemplateCanvasNode | undefined, targetPort: string): string {
        if (!this.isContextNode(node)) return targetPort;
        return this.normalizeContextStoreInputPort(targetPort);
    }

    private normalizeContextTargetPortByNodeId(nodeId: string, targetPort: string): string {
        const node = this._nodes().find(n => n.id === nodeId);
        return this.normalizeContextTargetPortForNode(node, targetPort);
    }

    private isReservedContextStoredItemId(itemId: string): boolean {
        return this.isContextStoreInputPort(itemId);
    }

    private findContextStoredItemForEdge(
        edge: Pick<TemplateCanvasEdge, 'source' | 'sourcePort' | 'target' | 'targetPort'>,
        targetNode: TemplateCanvasNode,
        sourceNode: TemplateCanvasNode | undefined
    ): StoredDataItem | null {
        const items = targetNode.data.storedItems || [];
        if (!items.length) return null;

        const sourceCompositeId = sourceNode?.data.compositeId || sourceNode?.id || edge.source;
        const strictMatches = items.filter(item =>
            item.sourcePortId === edge.sourcePort &&
            item.sourceCompositeId === sourceCompositeId
        );
        if (strictMatches.length > 0) return strictMatches[strictMatches.length - 1];

        const relaxedMatches = items.filter(item => item.sourcePortId === edge.sourcePort);
        if (relaxedMatches.length > 0) return relaxedMatches[relaxedMatches.length - 1];

        return null;
    }

    private resolveContextStoreTargetPortForEdge(
        edge: Pick<TemplateCanvasEdge, 'source' | 'sourcePort' | 'target' | 'targetPort'>,
        nodeById: Map<string, TemplateCanvasNode>
    ): string {
        const targetNode = nodeById.get(edge.target);
        if (!this.isContextNode(targetNode)) return edge.targetPort;

        if (!this.isContextStoreInputPort(edge.targetPort)) {
            return edge.targetPort;
        }

        const sourceNode = nodeById.get(edge.source);
        const matchedItem = this.findContextStoredItemForEdge(edge, targetNode, sourceNode);
        if (matchedItem) return matchedItem.id;

        return TEMPLATE_CONTEXT_STORE_INPUT_PORT_ID;
    }

    /**
     * Defer flow sync to the next microtask.
     * ng-draw-flow updates its internal form after emitting connection events,
     * so immediate writes from handlers can be overwritten in the same call stack.
     */
    private scheduleFlowSync(): void {
        if (this.flowSyncScheduled) return;
        this.flowSyncScheduled = true;
        queueMicrotask(() => {
            this.flowSyncScheduled = false;
            this.syncFlowControl();
        });
    }

    /**
     * Schedules a second-pass sync after the node view has rendered.
     * This avoids stale connector anchoring when context stored items are added/removed.
     */
    private scheduleFlowSyncAfterRender(): void {
        if (this.flowSyncAfterRenderScheduled) return;
        this.flowSyncAfterRenderScheduled = true;
        requestAnimationFrame(() => {
            requestAnimationFrame(() => {
                this.flowSyncAfterRenderScheduled = false;
                this.syncFlowControl();
            });
        });
    }

    private scheduleFlowSyncStabilization(): void {
        const delays = [0, 60, 180];
        for (const delayMs of delays) {
            setTimeout(() => this.syncFlowControl(), delayMs);
        }
    }

    private removeTransientStoreInputConnection(conn: DfDataConnection, edge: TemplateCanvasEdge): void {
        const flow = this.flow as unknown as {
            removeConnection?: (connection: DfDataConnection) => void;
        } | undefined;

        // Remove the emitted transient connection object.
        flow?.removeConnection?.(conn);

        // Also remove potential canonical/legacy static variants if they exist internally.
        const sourceConnectorId = this.encodeOutputConnectorId(edge.source, edge.sourcePort);
        const targetCandidates = [
            TEMPLATE_CONTEXT_STORE_INPUT_PORT_ID,
            TEMPLATE_CONTEXT_STORE_INPUT_PORT_ID_LEGACY,
        ];
        for (const targetPortId of targetCandidates) {
            flow?.removeConnection?.({
                source: {
                    nodeId: edge.source,
                    connectorType: DfConnectionPoint.Output,
                    connectorId: sourceConnectorId,
                },
                target: {
                    nodeId: edge.target,
                    connectorType: DfConnectionPoint.Input,
                    connectorId: this.encodeInputConnectorId(edge.target, targetPortId),
                },
            });
        }

        // Hard cleanup: remove any runtime connection targeting this context's static input.
        this.purgeRuntimeContextStoreInputConnections(edge.target);
    }

    private pruneContextStorePlaceholderEdges(): void {
        this._edges.update(edges => edges.filter(e => {
            if (!this.isContextStoreInputPort(e.targetPort)) return true;
            const targetNode = this._nodes().find(n => n.id === e.target);
            return !this.isContextNode(targetNode);
        }));
    }

    private tryResolveTransientContextDelete(
        edge: Pick<TemplateCanvasEdge, 'source' | 'sourcePort' | 'target' | 'targetPort'>
    ): boolean {
        if (!this.isContextStoreInputPort(edge.targetPort)) return false;

        const targetNode = this._nodes().find(n => n.id === edge.target);
        if (!this.isContextNode(targetNode)) return false;

        const sourceNode = this._nodes().find(n => n.id === edge.source);
        const matchedItem = this.findContextStoredItemForEdge(edge, targetNode, sourceNode);
        if (!matchedItem) return false;

        const canonicalEdge = {
            source: edge.source,
            sourcePort: edge.sourcePort,
            target: edge.target,
            targetPort: matchedItem.id,
        };
        const hasCanonicalEdge = this._edges().some(e =>
            e.source === canonicalEdge.source &&
            e.sourcePort === canonicalEdge.sourcePort &&
            e.target === canonicalEdge.target &&
            e.targetPort === canonicalEdge.targetPort
        );
        if (!hasCanonicalEdge) return false;

        this._edges.update(edges => edges.filter(e =>
            !(
                e.source === canonicalEdge.source &&
                e.sourcePort === canonicalEdge.sourcePort &&
                e.target === canonicalEdge.target &&
                e.targetPort === canonicalEdge.targetPort
            )
        ));

        this.handleContextStoreDisconnection(canonicalEdge);
        return true;
    }

    private isContextStoreDropEdge(edge: Pick<TemplateCanvasEdge, 'target' | 'targetPort'>): boolean {
        if (!this.isContextStoreInputPort(edge.targetPort)) return false;
        const targetNode = this._nodes().find(n => n.id === edge.target);
        return this.isContextNode(targetNode);
    }

    /** Fit viewport to all nodes after model updates. */
    private recenterCanvasView(): void {
        if (this.isDestroyed) return;
        if (this.recenterTimeoutId !== null) {
            clearTimeout(this.recenterTimeoutId);
        }
        this.recenterTimeoutId = setTimeout(() => {
            this.recenterTimeoutId = null;
            if (this.isDestroyed) return;
            this.fitViewportToCanvasNodes();
        }, 0);
    }

    private fitViewportToCanvasNodes(): void {
        if (this.isDestroyed) return;
        const flowAny = this.flow as unknown as { panzoom?: unknown } | undefined;
        const panzoom = flowAny?.panzoom as {
            resetPanzoom?: () => void;
            el?: { nativeElement?: HTMLElement };
            coordinates$?: { value?: { x: number; y: number }; next?: (coords: { x: number; y: number }) => void };
            panZoomOptions?: { minZoom?: number; maxZoom?: number; zoomStep?: number };
            setZoom?: (zoom: number) => void;
            getGuardedCoordinates?: (x: number, y: number) => { x: number; y: number };
        } | null;

        if (!panzoom) {
            this.flow?.resetPosition?.();
            return;
        }

        panzoom.resetPanzoom?.();

        const host = panzoom.el?.nativeElement;
        if (!host) return;

        requestAnimationFrame(() => {
            if (this.isDestroyed) return;
            const initialBounds = this.measureRenderedNodeBounds(host);
            if (!initialBounds) return;

            const viewportRect = host.getBoundingClientRect();
            const targetZoom = this.calculateFitZoom(initialBounds.width, initialBounds.height, viewportRect.width, viewportRect.height, 120, panzoom.panZoomOptions);
            this.applyPanZoomScale(panzoom, targetZoom);

            requestAnimationFrame(() => {
                if (this.isDestroyed) return;
                const renderedBounds = this.measureRenderedNodeBounds(host);
                if (!renderedBounds) return;

                const viewportCenterX = viewportRect.left + viewportRect.width / 2;
                const viewportCenterY = viewportRect.top + viewportRect.height / 2;
                const contentCenterX = renderedBounds.left + renderedBounds.width / 2;
                const contentCenterY = renderedBounds.top + renderedBounds.height / 2;
                const dx = viewportCenterX - contentCenterX;
                const dy = viewportCenterY - contentCenterY;

                const coords$ = panzoom.coordinates$;
                if (!coords$?.next) return;
                const current = coords$.value ?? { x: 0, y: 0 };
                const rawNext = { x: current.x + dx, y: current.y + dy };
                const next = typeof panzoom.getGuardedCoordinates === 'function'
                    ? panzoom.getGuardedCoordinates(rawNext.x, rawNext.y)
                    : rawNext;
                coords$.next(next);
            });
        });
    }

    private measureRenderedNodeBounds(host: HTMLElement): { left: number; top: number; width: number; height: number } | null {
        const nodes = Array.from(host.querySelectorAll<HTMLElement>('.draw-flow-node'));
        if (!nodes.length) return null;

        let minLeft = Number.POSITIVE_INFINITY;
        let minTop = Number.POSITIVE_INFINITY;
        let maxRight = Number.NEGATIVE_INFINITY;
        let maxBottom = Number.NEGATIVE_INFINITY;

        for (const node of nodes) {
            const rect = node.getBoundingClientRect();
            minLeft = Math.min(minLeft, rect.left);
            minTop = Math.min(minTop, rect.top);
            maxRight = Math.max(maxRight, rect.right);
            maxBottom = Math.max(maxBottom, rect.bottom);
        }

        if (!Number.isFinite(minLeft) || !Number.isFinite(minTop) || !Number.isFinite(maxRight) || !Number.isFinite(maxBottom)) {
            return null;
        }

        return {
            left: minLeft,
            top: minTop,
            width: Math.max(1, maxRight - minLeft),
            height: Math.max(1, maxBottom - minTop),
        };
    }

    private calculateFitZoom(
        contentWidth: number,
        contentHeight: number,
        viewportWidth: number,
        viewportHeight: number,
        padding: number,
        options?: { minZoom?: number; maxZoom?: number; zoomStep?: number }
    ): number {
        const availableWidth = Math.max(1, viewportWidth - padding);
        const availableHeight = Math.max(1, viewportHeight - padding);
        const rawZoom = Math.min(availableWidth / Math.max(1, contentWidth), availableHeight / Math.max(1, contentHeight));

        const minZoom = options?.minZoom ?? 0.25;
        const maxZoom = options?.maxZoom ?? 3;
        const zoomStep = options?.zoomStep ?? 0.25;
        const clamped = Math.min(maxZoom, Math.max(minZoom, rawZoom));
        const stepped = Math.round(clamped / zoomStep) * zoomStep;
        return Math.min(maxZoom, Math.max(minZoom, stepped));
    }

    private applyPanZoomScale(
        panzoom: {
            setZoom?: (zoom: number) => void;
            panZoomOptions?: { minZoom?: number; maxZoom?: number; zoomStep?: number };
            zoomIn?: () => void;
            zoomOut?: () => void;
        },
        zoom: number
    ): void {
        if (!Number.isFinite(zoom)) return;

        if (typeof panzoom.setZoom === 'function') {
            panzoom.setZoom(zoom);
            return;
        }

        const zoomStep = panzoom.panZoomOptions?.zoomStep ?? 0.25;
        let guard = 24;
        while (guard > 0) {
            guard -= 1;
            const current = this.getCurrentZoom(panzoom);
            if (Math.abs(current - zoom) <= zoomStep / 2) break;
            if (current < zoom) panzoom.zoomIn?.();
            if (current > zoom) panzoom.zoomOut?.();
        }
    }

    private getCurrentZoom(panzoom: unknown): number {
        const withModel = panzoom as {
            panZoomService?: { panzoomModel?: { zoom?: number } };
        };
        return withModel.panZoomService?.panzoomModel?.zoom ?? 1;
    }

    // ========================================================================
    // LIFECYCLE
    // ========================================================================

    ngOnInit(): void {
        this.initForms();
        this.loadComposites();
        this.setupToolbarActions();
        this.setupBusListeners();
        this.setupAutosave();
        
        // Check for edit mode
        const id = this.route.snapshot.paramMap.get('id');
        if (id) {
            this.templateId.set(id);
            this.loadTemplate(id);
        } else {
            this.isLoading.set(false);
            // Add initial context nodes
            this.addInitialContextNodes();
            this.armAutosave();
        }
    }

    ngOnDestroy(): void {
        this.isDestroyed = true;
        if (this.recenterTimeoutId !== null) {
            clearTimeout(this.recenterTimeoutId);
            this.recenterTimeoutId = null;
        }
        this.destroy$.next();
        this.destroy$.complete();
        this.autosaveTrigger$.complete();
    }

    // ========================================================================
    // INITIALIZATION
    // ========================================================================

    private initForms(): void {
        this.basicInfoFields = [
            this.fieldsService.getTextField({
                name: 'name',
                label: 'templates.builder.name',
                placeholder: 'templates.builder.name_placeholder',
                validators: [Validators.required, Validators.minLength(3), Validators.maxLength(80)],
                errorMessages: {
                    required: 'validation.required',
                    minlength: 'validation.min_length',
                },
                color: 'primary',
                layoutClass: 'primary',
                required: true,
            }),
            this.fieldsService.getTextAreaField({
                name: 'description',
                label: 'templates.builder.description',
                placeholder: 'templates.builder.description_placeholder',
                rows: 2,
                maxLength: 500,
                maxRows: 5,
                showCounter: true,
                color: 'primary',
                layoutClass: 'primary',
                required: false,
            }),
        ];

        this.basicInfoForm = this.fb.group({
            name: ['', [Validators.required, Validators.minLength(3), Validators.maxLength(80)]],
            description: [''],
        });

        // Track form validity reactively
        this.basicInfoForm.statusChanges.pipe(
            takeUntil(this.destroy$)
        ).subscribe(() => {
            this.isBasicInfoValid.set(this.basicInfoForm.valid);
        });

        // Palette search form
        this.paletteFieldConfig = [
            this.fieldsService.getTextField({
                name: 'search',
                label: 'common.search',
                placeholder: 'common.search',
                color: 'primary',
            }),
        ];

        this.paletteForm = this.fb.group({ search: [''] });

        this.paletteForm.get('search')?.valueChanges.pipe(
            debounceTime(200),
            takeUntil(this.destroy$)
        ).subscribe(value => {
            this.paletteFilter.set(value || '');
        });
    }

    private setupAutosave(): void {
        this.autosaveTrigger$.pipe(
            debounceTime(this.autosaveDebounceMs),
            takeUntil(this.destroy$)
        ).subscribe(() => {
            void this.persistAutosave();
        });

        this.basicInfoForm.valueChanges.pipe(
            debounceTime(250),
            takeUntil(this.destroy$)
        ).subscribe(() => {
            this.queueAutosave();
        });
    }

    private armAutosave(): void {
        this.autosaveReady = true;
        const status = this.resolveAutosaveStatus();
        this.lastAutosaveFingerprint = this.computeAutosaveFingerprint(status);
    }

    private queueAutosave(): void {
        if (!this.autosaveReady || this.isSaving()) return;
        this.autosaveTrigger$.next();
    }

    private resolveAutosaveStatus(): WorkflowStatus {
        if (!this.isEditMode()) return WorkflowStatus.DRAFT;
        return this.store.getTemplateById(this.templateId()!)?.status ?? WorkflowStatus.DRAFT;
    }

    private canAutosaveSnapshot(): boolean {
        if (!this.autosaveReady || this.isLoading() || this.isSaving()) return false;
        if (!this._nodes().length) return false;
        if (this.isEditMode()) return true;
        if (!this._nodes().some(node => node.type === 'composite')) return false;
        return this.isBasicInfoValid();
    }

    private computeAutosaveFingerprint(status: WorkflowStatus): string {
        const formValue = this.basicInfoForm.getRawValue();
        return JSON.stringify({
            status,
            name: formValue.name ?? '',
            description: formValue.description ?? '',
            nodes: this._nodes(),
            edges: this._edges(),
        });
    }

    private async persistAutosave(): Promise<void> {
        if (!this.canAutosaveSnapshot()) return;

        const consistency = this.applyTierConsistency();
        if (consistency.missingCompositeNodeIds.length > 0) {
            return;
        }

        const status = this.resolveAutosaveStatus();
        const fingerprint = this.computeAutosaveFingerprint(status);
        if (this.lastAutosaveFingerprint === fingerprint) return;

        const template = this.buildTemplate(status);
        if (this.isEditMode()) {
            this.store.updateTemplate({ id: template.id, changes: template });
        } else {
            this.store.addTemplate(template);
            this.templateId.set(template.id);
        }

        this.lastAutosaveFingerprint = fingerprint;
    }

    private loadComposites(): void {
        const refresh = (): void => {
            const composites = this.workflowSync.getPublishedWorkflowsAsComposites();
            const fingerprint = JSON.stringify(composites);
            if (fingerprint === this.compositesFingerprint) return;
            this.compositesFingerprint = fingerprint;
            this.availableComposites.set(composites);
            if (this._nodes().length) {
                this.applyTierConsistency();
            }
        };

        // Initial immediate hydration for builder palette + contract checks.
        refresh();

        const storageEvents$ = fromEvent<StorageEvent>(window, 'storage').pipe(
            filter(event => event.key === this.workflowsStorageKey || event.key === null)
        );

        // Polling covers same-tab editor updates (storage event fires only across tabs).
        merge(interval(2000), storageEvents$)
            .pipe(takeUntil(this.destroy$))
            .subscribe(() => refresh());
    }

    private loadTemplate(id: string): void {
        // Wait for both the template and available composites to be loaded
        combineLatest([
            this.store.selectTemplateById(id).pipe(
                filter((template): template is TemplateWorkflow => template !== null),
                take(1)
            ),
            this.availableComposites$.pipe(
                take(1)
            )
        ]).pipe(
            takeUntil(this.destroy$)
        ).subscribe(([template, composites]) => {
            // Populate basic info form
            this.basicInfoForm.patchValue({
                name: template.name,
                description: template.description,
            });
            this.isBasicInfoValid.set(this.basicInfoForm.valid);

            // Convert TemplateWorkflowNode[] to TemplateCanvasNode[] (context + composite nodes)
            const nodes: TemplateCanvasNode[] = [
                ...(template.contextNodes?.map(ctx => ({
                    id: ctx.id,
                    type: ctx.type,
                    x: ctx.x,
                    y: ctx.y,
                    data: {
                        label: ctx.data.label,
                        icon: ctx.data.icon,
                        contextType: ctx.data.contextType,
                        storedItems: ctx.data.storedItems ? JSON.parse(JSON.stringify(ctx.data.storedItems)) : [],
                    },
                })) ?? []),
                ...template.compositeWorkflows.map(wfNode => {
                    const composite = composites.find(c => c.id === wfNode.compositeWorkflowId);
                    const inferredInputs = this.extractExposedHandlesFromTemplate(template, wfNode.id, 'input');
                    const inferredOutputs = this.extractExposedHandlesFromTemplate(template, wfNode.id, 'output');
                    return {
                        id: wfNode.id,
                        type: 'composite' as TemplateCanvasNodeType,
                        x: wfNode.position.x,
                        y: wfNode.position.y,
                        data: {
                            label: wfNode.label,
                            icon: 'hub',
                            compositeId: wfNode.compositeWorkflowId,
                            compositeConfig: this.cloneRecord(wfNode.configuration),
                            exposedInputs: this.mergeExposedHandles(composite?.exposedInputs, inferredInputs),
                            exposedOutputs: this.mergeExposedHandles(composite?.exposedOutputs, inferredOutputs),
                        },
                    };
                }),
            ];

            // Add UI component nodes from uiTemplate
            if (template.uiTemplate?.components) {
                let uiY = 100;
                for (const uiComp of template.uiTemplate.components) {
                    const uiConfig = (uiComp.config as Record<string, unknown> | undefined) || {};
                    const storedX = this.toFiniteNumber(uiConfig['__canvasX']);
                    const storedY = this.toFiniteNumber(uiConfig['__canvasY']);
                    const nextY = storedY ?? uiY;

                    nodes.push({
                        id: uiComp.id,
                        type: 'ui-component' as TemplateCanvasNodeType,
                        x: storedX ?? 600,
                        y: nextY,
                        data: {
                            label: uiComp.label || uiComp.type,
                            icon: this.getUiComponentIcon(uiComp.type),
                            uiType: uiComp.type as UIComponentType,
                            bindings: uiComp.bindings?.map(b => ({
                                portId: b.componentProperty,
                                targetPath: b.workflowPath,
                            })),
                            uiConfig,
                        },
                    });
                    uiY = Math.max(uiY + 150, nextY + 150);
                }
            }

            // Set nodes
            this._nodes.set(this.ensureDistinctContextPositions(nodes));

            // Convert TemplateWorkflowEdge[] to TemplateCanvasEdge[]
            const nodeById = new Map(nodes.map(node => [node.id, node] as const));
            const edges: TemplateCanvasEdge[] = template.edges.map(e => {
                const edge: TemplateCanvasEdge = {
                    id: e.id,
                    source: e.source,
                    sourcePort: e.sourcePort,
                    target: e.target,
                    targetPort: e.targetPort,
                };
                return {
                    ...edge,
                    targetPort: this.resolveContextStoreTargetPortForEdge(edge, nodeById),
                };
            });

            // Set edges
            this._edges.set(edges);

            // Normalize Tier-3 node contracts against current Tier-2 composites.
            this.applyTierConsistency();

            // Sync to ng-draw-flow
            this.syncFlowControl();

            this.isLoading.set(false);
            this.recenterCanvasView();
            this.armAutosave();
        });

        // Handle case where template is not found
        this.store.selectTemplateById(id).pipe(
            take(1),
            takeUntil(this.destroy$)
        ).subscribe(template => {
            if (!template) {
                this.toast.showError(this.translate.instant('templates.builder.template_not_found'));
                this.isLoading.set(false);
                this.router.navigate(['/genai-workflows/templates']);
            }
        });
    }

    /** Get icon for UI component type */
    private getUiComponentIcon(type: string): string {
        const iconMap: Record<string, string> = {
            'chat': 'chat',
            'file-uploader': 'upload_file',
            'summarize': 'summarize',
            'extract': 'format_list_bulleted',
            'compare': 'compare',
            'result-viewer': 'visibility',
        };
        return iconMap[type] || 'widgets';
    }

    private mergeExposedHandles(
        primary: ExposedHandle[] | undefined,
        fallback: ExposedHandle[] | undefined
    ): ExposedHandle[] {
        const source = (primary && primary.length > 0) ? primary : (fallback ?? []);
        const byId = new Map<string, ExposedHandle>();
        for (const handle of source) {
            byId.set(handle.id, handle);
        }
        return [...byId.values()].map(handle => ({ ...handle }));
    }

    private cloneRecord(
        value: Record<string, unknown> | undefined
    ): Record<string, unknown> | undefined {
        if (!value || typeof value !== 'object') {
            return undefined;
        }
        try {
            return JSON.parse(JSON.stringify(value)) as Record<string, unknown>;
        } catch {
            return { ...value };
        }
    }

    private extractExposedHandlesFromTemplate(
        template: TemplateWorkflow,
        nodeId: string,
        direction: 'input' | 'output'
    ): ExposedHandle[] {
        const source = direction === 'input'
            ? template.dataFlowConfig?.inputs ?? []
            : template.dataFlowConfig?.outputs ?? [];
        const prefix = `${nodeId}:`;

        return source
            .filter(port => port.portPath.startsWith(prefix))
            .map(port => {
                const sourcePortId = port.portPath.slice(prefix.length);
                return {
                    id: sourcePortId,
                    sourceNodeId: nodeId,
                    sourcePortId,
                    artifactType: port.dataType,
                    dataReference: sourcePortId,
                    label: port.label,
                    required: false,
                    description: `${direction} port`,
                } as ExposedHandle;
            });
    }

    private setupToolbarActions(): void {
        const back: ToolbarAction = {
            id: 'back',
            icon: 'arrow_back',
            tooltip: this.translate.instant('common.back'),
            class: 'error',
            variant: 'icon',
            label: this.translate.instant('common.back'),
            click: () => this.cancel(),
        };

        const saveDraft: ToolbarAction = {
            id: 'save-draft',
            icon: 'save',
            tooltip: this.translate.instant('templates.builder.save_draft'),
            class: 'primary',
            variant: 'stroked',
            label: this.translate.instant('templates.builder.save_draft'),
            disabled$: this.saving$,
            click: () => this.saveAsDraft(),
        };

        const publish: ToolbarAction = {
            id: 'publish',
            icon: 'publish',
            tooltip: this.translate.instant('templates.builder.publish'),
            class: 'primary',
            variant: 'flat',
            label: this.translate.instant('templates.builder.publish'),
            disabled$: this.saving$,
            click: () => this.saveAndPublish(),
        };

        this.toolbarService.scope(this.destroyRef, [back, saveDraft, publish]);
    }

    private setupBusListeners(): void {
        this.bus.onNodeDelete$.pipe(
            takeUntil(this.destroy$)
        ).subscribe(event => {
            if (event.nodeId) {
                this.deleteNode(event.nodeId);
            }
        });

        this.bus.contextItemDelete$.pipe(
            takeUntil(this.destroy$)
        ).subscribe(event => {
            if (event.nodeId && event.itemId) {
                this.removeContextStoredItem(event.nodeId, event.itemId);
            }
        });

        this.bus.contextItemRename$.pipe(
            takeUntil(this.destroy$)
        ).subscribe(event => {
            if (event.nodeId && event.itemId && event.newItemId) {
                this.renameContextStoredItem(event.nodeId, event.itemId, event.newItemId, event.label);
            }
        });
    }

    // ========================================================================
    // CANVAS OPERATIONS
    // ========================================================================

    /** Add initial context nodes */
    private addInitialContextNodes(): void {
        const sessionPosition = { x: 180, y: 180 };
        const projectPosition = { x: 620, y: 180 };

        const sessionNode: TemplateCanvasNode = {
            id: 'session-ctx-' + crypto.randomUUID().substring(0, 8),
            type: 'session-context',
            x: sessionPosition.x,
            y: sessionPosition.y,
            data: {
                label: 'Session Context',
                icon: 'history',
                contextType: 'session',
                storedItems: [],
            },
        };
        const projectNode: TemplateCanvasNode = {
            id: 'project-ctx-' + crypto.randomUUID().substring(0, 8),
            type: 'project-context',
            x: projectPosition.x,
            y: projectPosition.y,
            data: {
                label: 'Project Context',
                icon: 'folder_shared',
                contextType: 'project',
                storedItems: [],
            },
        };
        this._nodes.set(this.ensureDistinctContextPositions([sessionNode, projectNode]));
        this.syncFlowControl();
    }

    /** Get node render type for ng-draw-flow */
    private getNodeRenderType(node: TemplateCanvasNode): string {
        switch (node.type) {
            case 'composite': return 'template-composite';
            case 'session-context': return 'template-session-context';
            case 'project-context': return 'template-project-context';
            case 'ui-component': return 'template-ui';
            default: return 'template-composite';
        }
    }

    /** Handle drop from palette */
    onDrop(event: CdkDragDrop<unknown, unknown, PaletteItem>): void {
        const item = event.item.data as PaletteItem;
        if (!item) return;

        // Calculate drop position (approximate center of canvas if no drop position)
        const dropX = 200 + (this._nodes().length % 3) * 350;
        const dropY = 100 + Math.floor(this._nodes().length / 3) * 200;

        if (item.type === 'composite' && item.compositeId) {
            this.addCompositeNode(item.compositeId, dropX, dropY);
        } else if (item.type === 'session-context') {
            if (this._nodes().some(n => n.type === 'session-context')) {
                this.toast.show(this.translate.instant('templates.canvas.context_exists'));
                return;
            }
            this.addContextNode('session', dropX, dropY);
        } else if (item.type === 'project-context') {
            if (this._nodes().some(n => n.type === 'project-context')) {
                this.toast.show(this.translate.instant('templates.canvas.context_exists'));
                return;
            }
            this.addContextNode('project', dropX, dropY);
        }
    }

    /** Add composite workflow node */
    private addCompositeNode(compositeId: string, x: number, y: number): void {
        const composite = this.availableComposites().find(c => c.id === compositeId);
        if (!composite) return;

        const node: TemplateCanvasNode = {
            id: 'comp-' + crypto.randomUUID().substring(0, 8),
            type: 'composite',
            x,
            y,
            data: {
                label: composite.name,
                icon: 'hub',
                compositeId: composite.id,
                compositeConfig: {
                    sourceWorkflowId: (composite as CompositeWorkflow & { sourceWorkflowId?: string }).sourceWorkflowId,
                },
                exposedInputs: this.cloneExposedHandles(composite.exposedInputs),
                exposedOutputs: this.cloneExposedHandles(composite.exposedOutputs),
            },
        };

        this._nodes.update(nodes => [...nodes, node]);
        this.syncFlowControl();
    }

    /** Add context node */
    private addContextNode(contextType: 'session' | 'project', x: number, y: number): void {
        const otherContext = this._nodes().find(n =>
            n.type === (contextType === 'session' ? 'project-context' : 'session-context')
        );

        let nextX = x;
        let nextY = y;
        if (
            otherContext &&
            Math.abs(otherContext.x - x) < this.contextOverlapThreshold &&
            Math.abs(otherContext.y - y) < this.contextOverlapThreshold
        ) {
            nextX = otherContext.x + 360;
            nextY = otherContext.y;
        }

        const node: TemplateCanvasNode = {
            id: `${contextType}-ctx-` + crypto.randomUUID().substring(0, 8),
            type: contextType === 'session' ? 'session-context' : 'project-context',
            x: nextX,
            y: nextY,
            data: {
                label: contextType === 'session' ? 'Session Context' : 'Project Context',
                icon: contextType === 'session' ? 'history' : 'folder_shared',
                contextType,
                storedItems: [],
            },
        };
        this._nodes.update(nodes => this.ensureDistinctContextPositions([...nodes, node]));
        this.syncFlowControl();
    }

    /** Delete a node */
    deleteNode(nodeId: string): void {
        const node = this._nodes().find(n => n.id === nodeId);
        if (!node) return;

        // Don't delete context nodes via this method (they're permanent)
        if (node.type === 'session-context' || node.type === 'project-context') {
            this.toast.show(this.translate.instant('templates.canvas.cannot_delete_context'));
            return;
        }

        this._nodes.update(nodes => nodes.filter(n => n.id !== nodeId));
        this._edges.update(edges => edges.filter(e => e.source !== nodeId && e.target !== nodeId));
        this.syncFlowControl();
    }

    // ========================================================================
    // NG-DRAW-FLOW EVENT HANDLERS
    // ========================================================================

    /** Handle connection created */
    onConnectionCreated(event: DfEvent<DfDataConnection>): void {
        const conn = event.target as DfDataConnection;
        if (!conn) return;

        const edge: TemplateCanvasEdge = {
            id: `edge-${crypto.randomUUID().substring(0, 8)}`,
            source: conn.source.nodeId,
            sourcePort: this.decodeConnectorId(conn.source.connectorId),
            target: conn.target.nodeId,
            targetPort: this.normalizeContextTargetPortByNodeId(
                conn.target.nodeId,
                this.decodeConnectorId(conn.target.connectorId)
            ),
        };

        // Context-store drops are canonicalized directly to the generated stored-item port.
        if (this.isContextStoreDropEdge(edge)) {
            const storedItemPortId = this.handleContextStoreConnection(edge);
            if (storedItemPortId) {
                const canonicalEdge: TemplateCanvasEdge = {
                    ...edge,
                    targetPort: storedItemPortId,
                };
                this.removeTransientStoreInputConnection(conn, edge);
                this.pruneContextStorePlaceholderEdges();
                this.rewireRuntimeContextConnection(canonicalEdge);
                this.scheduleRuntimeContextConnectionRewire(canonicalEdge);
                this.scheduleFlowSyncAfterRender();
                this.scheduleFlowSyncStabilization();
                return;
            }
            this.scheduleFlowSync();
            return;
        }

        // Check if edge already exists
        const exists = this._edges().some(e =>
            e.source === edge.source &&
            e.sourcePort === edge.sourcePort &&
            e.target === edge.target &&
            e.targetPort === edge.targetPort
        );

        if (!exists) {
            this._edges.update(edges => [...edges, edge]);
            this.scheduleFlowSync();
        }
    }

    /** Handle connection to context node - creates stored data item */
    private handleContextStoreConnection(edge: TemplateCanvasEdge): string | null {
        // Check if target is a context node with the static store input.
        if (!this.isContextStoreInputPort(edge.targetPort)) return null;

        const targetNode = this._nodes().find(n => n.id === edge.target);
        if (!targetNode || (targetNode.type !== 'session-context' && targetNode.type !== 'project-context')) {
            return null;
        }

        // Get source node info
        const sourceNode = this._nodes().find(n => n.id === edge.source);
        if (!sourceNode) return null;

        let portLabel = edge.sourcePort;
        let dataType = 'data';

        // Resolve richer metadata when source is a composite output.
        if (sourceNode.type === 'composite') {
            const outputPort = sourceNode.data.exposedOutputs?.find(p => p.id === edge.sourcePort);
            if (outputPort) {
                portLabel = outputPort.customLabel || outputPort.label || edge.sourcePort;
                dataType = outputPort.artifactType || dataType;
            }
        }

        const itemId = this.generateContextItemId(targetNode.id, portLabel);

        // Create a stored data item
        const storedItem: StoredDataItem = {
            id: itemId,
            label: portLabel,
            sourceCompositeId: sourceNode.data.compositeId || sourceNode.id,
            sourcePortId: edge.sourcePort,
            dataType,
        };

        // Update the context node with the new stored item
        let updatedItems: StoredDataItem[] = [];
        this._nodes.update(nodes => nodes.map(n => {
            if (n.id === targetNode.id) {
                const existingItems = n.data.storedItems || [];
                updatedItems = [...existingItems, storedItem];
                return {
                    ...n,
                    data: {
                        ...n.data,
                        storedItems: updatedItems,
                    },
                };
            }
            return n;
        }));
        this.bus.contextItemsSync$.next({ nodeId: targetNode.id, items: updatedItems });

        // Persist only the canonical edge targeting the generated stored-item input.
        this._edges.update(edges => {
            const withoutStaticPlaceholder = edges.filter(e =>
                !(
                    e.target === edge.target &&
                    e.source === edge.source &&
                    e.sourcePort === edge.sourcePort &&
                    this.isContextStoreInputPort(e.targetPort)
                )
            );

            const canonicalEdge: TemplateCanvasEdge = {
                ...edge,
                targetPort: storedItem.id,
            };
            const canonicalExists = withoutStaticPlaceholder.some(e =>
                e.source === canonicalEdge.source &&
                e.sourcePort === canonicalEdge.sourcePort &&
                e.target === canonicalEdge.target &&
                e.targetPort === canonicalEdge.targetPort
            );
            if (canonicalExists) {
                return withoutStaticPlaceholder;
            }

            return [...withoutStaticPlaceholder, canonicalEdge];
        });

        return storedItem.id;
    }

    private rewireRuntimeContextConnection(
        edge: Pick<TemplateCanvasEdge, 'source' | 'sourcePort' | 'target' | 'targetPort'>
    ): void {
        const flowAny = this.flow as unknown as {
            connectionsService?: {
                connections$?: {
                    value?: DfDataConnection[];
                    next?: (connections: DfDataConnection[]) => void;
                };
                usedConnectors$?: {
                    next?: (connectorIds: string[]) => void;
                };
            };
        } | undefined;
        const service = flowAny?.connectionsService;
        if (!service?.connections$?.next || !service?.usedConnectors$?.next) return;

        const sourceConnectorId = this.encodeOutputConnectorId(edge.source, edge.sourcePort);
        const targetConnectorId = this.encodeInputConnectorId(edge.target, edge.targetPort);

        const canonical: DfDataConnection = {
            source: {
                nodeId: edge.source,
                connectorType: DfConnectionPoint.Output,
                connectorId: sourceConnectorId,
            },
            target: {
                nodeId: edge.target,
                connectorType: DfConnectionPoint.Input,
                connectorId: targetConnectorId,
            },
        };

        const current = service.connections$?.value ?? [];
        const rewritten = current.filter(conn => {
            const sameSource =
                conn.source.nodeId === edge.source &&
                conn.source.connectorId === sourceConnectorId;
            if (!sameSource) return true;

            if (conn.target.nodeId !== edge.target) return true;

            const decodedTargetPort = this.decodeConnectorId(conn.target.connectorId);
            const targetsStaticStore = this.isContextStoreInputPort(decodedTargetPort);
            const targetsCanonical = conn.target.connectorId === targetConnectorId;

            // Replace any transient/static target and ensure a single canonical edge.
            return !(targetsStaticStore || targetsCanonical);
        });
        rewritten.push(canonical);

        const uniqueByKey = new Map<string, DfDataConnection>();
        for (const conn of rewritten) {
            const key = this.connectionKey(conn);
            if (!uniqueByKey.has(key)) {
                uniqueByKey.set(key, conn);
            }
        }
        const finalConnections = [...uniqueByKey.values()];
        const usedConnectorIds = [...new Set(
            finalConnections.flatMap(conn => [conn.source.connectorId, conn.target.connectorId])
        )];

        service.usedConnectors$.next(usedConnectorIds);
        service.connections$.next(finalConnections);
    }

    private scheduleRuntimeContextConnectionRewire(
        edge: Pick<TemplateCanvasEdge, 'source' | 'sourcePort' | 'target' | 'targetPort'>
    ): void {
        // Re-anchor after the generated stored-item connector is rendered.
        requestAnimationFrame(() => {
            requestAnimationFrame(() => {
                this.rewireRuntimeContextConnection(edge);
                this.syncFlowControl();
            });
        });
    }

    /** Handle connection deleted */
    onConnectionDeleted(event: DfEvent<DfDataConnection>): void {
        const conn = event.target as DfDataConnection;
        if (!conn) return;

        // Build edge info for removal
        const edgeToRemove = {
            source: conn.source.nodeId,
            sourcePort: this.decodeConnectorId(conn.source.connectorId),
            target: conn.target.nodeId,
            targetPort: this.normalizeContextTargetPortByNodeId(
                conn.target.nodeId,
                this.decodeConnectorId(conn.target.connectorId)
            ),
        };

        const hasMatchingEdge = this._edges().some(e =>
            e.source === edgeToRemove.source &&
            e.sourcePort === edgeToRemove.sourcePort &&
            e.target === edgeToRemove.target &&
            e.targetPort === edgeToRemove.targetPort
        );
        if (!hasMatchingEdge) {
            // If the user deleted a transient/static context arrow, map it to the canonical stored-item edge.
            const resolvedTransientDelete = this.tryResolveTransientContextDelete(edgeToRemove);
            this.pruneContextStorePlaceholderEdges();
            if (resolvedTransientDelete) {
                this.scheduleFlowSyncAfterRender();
                this.scheduleFlowSyncStabilization();
                return;
            }

            // Ignore unrelated transient visual deletes.
            this.scheduleFlowSync();
            return;
        }

        // Filter out the deleted edge
        this._edges.update(edges => edges.filter(e => 
            !(e.source === edgeToRemove.source && 
              e.sourcePort === edgeToRemove.sourcePort &&
              e.target === edgeToRemove.target &&
              e.targetPort === edgeToRemove.targetPort)
        ));

        // Handle context node stored item removal
        this.handleContextStoreDisconnection(edgeToRemove);
        this.pruneContextStorePlaceholderEdges();
        this.scheduleFlowSync();
        this.scheduleFlowSyncStabilization();
    }

    /** Handle disconnection from context node - removes stored data item */
    private handleContextStoreDisconnection(edge: Pick<TemplateCanvasEdge, 'source' | 'sourcePort' | 'target' | 'targetPort'>): boolean {
        const targetNode = this._nodes().find(n => n.id === edge.target);
        if (!targetNode || (targetNode.type !== 'session-context' && targetNode.type !== 'project-context')) {
            return false;
        }

        const existingItems = targetNode.data.storedItems || [];
        let removedItemIds = new Set<string>();
        if (this.isContextStoreInputPort(edge.targetPort)) {
            removedItemIds = new Set(
                existingItems
                    .filter(item => item.sourcePortId === edge.sourcePort)
                    .map(item => item.id)
            );
        } else if (existingItems.some(item => item.id === edge.targetPort)) {
            removedItemIds = new Set([edge.targetPort]);
        } else {
            return false;
        }

        let nextItems: StoredDataItem[] = [];
        this._nodes.update(nodes => nodes.map(n => {
            if (n.id === targetNode.id) {
                const filteredItems = (n.data.storedItems || []).filter(item => !removedItemIds.has(item.id));
                nextItems = filteredItems;
                return {
                    ...n,
                    data: {
                        ...n.data,
                        storedItems: filteredItems,
                    },
                };
            }
            return n;
        }));
        this.bus.contextItemsSync$.next({ nodeId: targetNode.id, items: nextItems });

        this._edges.update(edges => edges.filter(e =>
            !(
                (e.source === targetNode.id && removedItemIds.has(e.sourcePort)) ||
                (e.target === targetNode.id && removedItemIds.has(e.targetPort))
            )
        ));

        return true;
    }

    private removeContextStoredItem(nodeId: string, itemId: string): void {
        let nextItems: StoredDataItem[] = [];
        this._nodes.update(nodes => nodes.map(n => {
            if (n.id !== nodeId) return n;
            const items = n.data.storedItems || [];
            nextItems = items.filter(item => item.id !== itemId);
            return {
                ...n,
                data: {
                    ...n.data,
                    storedItems: nextItems,
                },
            };
        }));
        this.bus.contextItemsSync$.next({ nodeId, items: nextItems });

        this._edges.update(edges => edges.filter(e =>
            !(
                (e.source === nodeId && e.sourcePort === itemId) ||
                (e.target === nodeId && e.targetPort === itemId)
            )
        ));

        this.syncFlowControl();
    }

    private renameContextStoredItem(nodeId: string, itemId: string, nextItemIdRaw: string, nextLabel?: string): void {
        const nextItemId = this.normalizeContextItemId(nextItemIdRaw);
        if (!nextItemId) return;
        if (this.isReservedContextStoredItemId(nextItemId)) {
            this.toast.show('Context item ID is reserved');
            return;
        }

        const contextNode = this._nodes().find(n => n.id === nodeId);
        if (!contextNode) return;
        const existingItems = contextNode.data.storedItems || [];
        const hasIdCollision = existingItems.some(item => item.id === nextItemId && item.id !== itemId);
        if (hasIdCollision) {
            this.toast.show('Context item ID already exists');
            return;
        }

        this._nodes.update(nodes => nodes.map(n => {
            if (n.id !== nodeId) return n;
            const items = n.data.storedItems || [];
            const renamedItems = items.map(item => {
                if (item.id !== itemId) return item;
                return {
                    ...item,
                    id: nextItemId,
                    label: (nextLabel ?? item.label).trim() || item.label,
                };
            });
            return {
                ...n,
                data: {
                    ...n.data,
                    storedItems: renamedItems,
                },
            };
        }));
        const contextNodeAfterRename = this._nodes().find(n => n.id === nodeId);
        this.bus.contextItemsSync$.next({ nodeId, items: contextNodeAfterRename?.data.storedItems || [] });

        if (nextItemId !== itemId) {
            this._edges.update(edges => edges.map(e => {
                const sourcePort = e.source === nodeId && e.sourcePort === itemId ? nextItemId : e.sourcePort;
                const targetPort = e.target === nodeId && e.targetPort === itemId ? nextItemId : e.targetPort;
                return (sourcePort !== e.sourcePort || targetPort !== e.targetPort)
                    ? { ...e, sourcePort, targetPort }
                    : e;
            }));
        }

        this.syncFlowControl();
    }

    private generateContextItemId(nodeId: string, sourceLabel: string): string {
        const requestedBase = this.normalizeContextItemId(sourceLabel) || 'data';
        const base = this.isReservedContextStoredItemId(requestedBase) ? 'data' : requestedBase;
        const node = this._nodes().find(n => n.id === nodeId);
        const existing = new Set<string>([
            ...(node?.data.storedItems || []).map(item => item.id),
            TEMPLATE_CONTEXT_STORE_INPUT_PORT_ID,
            TEMPLATE_CONTEXT_STORE_INPUT_PORT_ID_LEGACY,
        ]);
        if (!existing.has(base)) return base;
        let idx = 2;
        let candidate = `${base}_${idx}`;
        while (existing.has(candidate)) {
            idx += 1;
            candidate = `${base}_${idx}`;
        }
        return candidate;
    }

    private normalizeContextItemId(value: string): string {
        return (value || '')
            .trim()
            .toLowerCase()
            .replace(/[^a-z0-9_-]/g, '_')
            .replace(/_+/g, '_')
            .replace(/^_+|_+$/g, '');
    }

    private toFiniteNumber(value: unknown): number | null {
        if (typeof value === 'number' && Number.isFinite(value)) return value;
        return null;
    }

    private cloneExposedHandles(handles: ExposedHandle[] | undefined): ExposedHandle[] {
        return (handles ?? []).map(handle => ({ ...handle }));
    }

    private areHandleContractsEqual(
        left: ExposedHandle[] | undefined,
        right: ExposedHandle[] | undefined
    ): boolean {
        const a = left ?? [];
        const b = right ?? [];
        if (a.length !== b.length) return false;
        for (let i = 0; i < a.length; i += 1) {
            const x = a[i];
            const y = b[i];
            if (
                x.id !== y.id ||
                x.sourceNodeId !== y.sourceNodeId ||
                x.sourcePortId !== y.sourcePortId ||
                x.artifactType !== y.artifactType ||
                x.dataReference !== y.dataReference ||
                x.label !== y.label ||
                x.customLabel !== y.customLabel ||
                Boolean(x.required) !== Boolean(y.required)
            ) {
                return false;
            }
        }
        return true;
    }

    private getUiNodeInputPorts(uiType: string | undefined): string[] {
        switch (uiType) {
            case 'chat': return ['response'];
            case 'summarize': return ['summary'];
            case 'extract': return ['result'];
            case 'compare': return ['result'];
            case 'result-viewer': return ['data'];
            default: return [];
        }
    }

    private getUiNodeOutputPorts(uiType: string | undefined): string[] {
        switch (uiType) {
            case 'chat': return ['message', 'files'];
            case 'file-upload':
            case 'file-uploader':
                return ['files'];
            case 'summarize':
            case 'extract':
                return ['file'];
            case 'compare':
                return ['file1', 'file2'];
            default:
                return [];
        }
    }

    private getNodeInputPortIds(node: TemplateCanvasNode): Set<string> | null {
        if (node.type === 'composite') {
            return new Set((node.data.exposedInputs ?? []).map(port => port.id));
        }
        if (node.type === 'session-context' || node.type === 'project-context') {
            const ids = [
                TEMPLATE_CONTEXT_STORE_INPUT_PORT_ID,
                TEMPLATE_CONTEXT_STORE_INPUT_PORT_ID_LEGACY,
                ...(node.data.storedItems ?? []).map(item => item.id),
            ];
            return new Set(ids);
        }
        if (node.type === 'ui-component') {
            return new Set(this.getUiNodeInputPorts(node.data.uiType));
        }
        return null;
    }

    private getNodeOutputPortIds(node: TemplateCanvasNode): Set<string> | null {
        if (node.type === 'composite') {
            return new Set((node.data.exposedOutputs ?? []).map(port => port.id));
        }
        if (node.type === 'session-context' || node.type === 'project-context') {
            return new Set((node.data.storedItems ?? []).map(item => item.id));
        }
        if (node.type === 'ui-component') {
            return new Set(this.getUiNodeOutputPorts(node.data.uiType));
        }
        return null;
    }

    private applyTierConsistency(options?: { showToast?: boolean }): TierConsistencyReport {
        const currentNodes = this._nodes();
        const currentEdges = this._edges();
        const compositesById = new Map(this.availableComposites().map(c => [c.id, c]));

        let normalizedCompositeNodes = 0;
        const missingCompositeNodeIds: string[] = [];

        const nextNodes = currentNodes.map(node => {
            if (node.type !== 'composite') return node;

            const compositeId = node.data.compositeId;
            if (!compositeId) {
                missingCompositeNodeIds.push(node.id);
                return node;
            }

            const composite = compositesById.get(compositeId);
            if (!composite) {
                missingCompositeNodeIds.push(node.id);
                return node;
            }

            const normalizedInputs = composite.exposedInputs.length > 0
                ? this.cloneExposedHandles(composite.exposedInputs)
                : this.cloneExposedHandles(node.data.exposedInputs);
            const normalizedOutputs = composite.exposedOutputs.length > 0
                ? this.cloneExposedHandles(composite.exposedOutputs)
                : this.cloneExposedHandles(node.data.exposedOutputs);

            const inputsChanged = !this.areHandleContractsEqual(node.data.exposedInputs, normalizedInputs);
            const outputsChanged = !this.areHandleContractsEqual(node.data.exposedOutputs, normalizedOutputs);
            const labelChanged = !node.data.label && composite.name !== node.data.label;

            if (!inputsChanged && !outputsChanged && !labelChanged) {
                return node;
            }

            normalizedCompositeNodes += 1;
            return {
                ...node,
                data: {
                    ...node.data,
                    label: node.data.label || composite.name,
                    exposedInputs: normalizedInputs,
                    exposedOutputs: normalizedOutputs,
                },
            };
        });

        const nodeById = new Map(nextNodes.map(node => [node.id, node]));
        let removedInvalidEdges = 0;
        let normalizedEdgePorts = 0;
        const nextEdges: TemplateCanvasEdge[] = [];

        for (const edge of currentEdges) {
            const sourceNode = nodeById.get(edge.source);
            const targetNode = nodeById.get(edge.target);
            if (!sourceNode || !targetNode) {
                removedInvalidEdges += 1;
                continue;
            }

            const sourcePorts = this.getNodeOutputPortIds(sourceNode);
            const targetPorts = this.getNodeInputPortIds(targetNode);
            const resolvedTargetPort = this.resolveContextStoreTargetPortForEdge(edge, nodeById);
            const normalizedEdge = resolvedTargetPort !== edge.targetPort
                ? { ...edge, targetPort: resolvedTargetPort }
                : edge;
            if (normalizedEdge !== edge) normalizedEdgePorts += 1;

            // Context static store-input is only a drop zone, never a persisted connection target.
            if (this.isContextNode(targetNode) && this.isContextStoreInputPort(normalizedEdge.targetPort)) {
                removedInvalidEdges += 1;
                continue;
            }

            const sourceValid = sourcePorts ? sourcePorts.has(normalizedEdge.sourcePort) : true;
            const targetValid = targetPorts ? targetPorts.has(normalizedEdge.targetPort) : true;

            if (!sourceValid || !targetValid) {
                removedInvalidEdges += 1;
                continue;
            }

            nextEdges.push(normalizedEdge);
        }

        const nodesChanged = nextNodes.some((node, index) => node !== currentNodes[index]);
        const edgesChanged = nextEdges.length !== currentEdges.length || normalizedEdgePorts > 0;

        if (nodesChanged) {
            this._nodes.set(nextNodes);
        }
        if (edgesChanged) {
            this._edges.set(nextEdges);
        }
        if (nodesChanged || edgesChanged) {
            this.syncFlowControl();
        }

        const report: TierConsistencyReport = {
            normalizedCompositeNodes,
            removedInvalidEdges,
            missingCompositeNodeIds,
        };

        if (options?.showToast) {
            if (report.missingCompositeNodeIds.length > 0) {
                this.toast.showError('Some reusable workflow references are missing. Please re-add those composites.');
            } else if (report.normalizedCompositeNodes > 0 || report.removedInvalidEdges > 0) {
                this.toast.show(`Workflow contract updated (${report.normalizedCompositeNodes} node(s), ${report.removedInvalidEdges} invalid link(s) removed).`);
            }
        }

        return report;
    }

    private ensureDistinctContextPositions(nodes: TemplateCanvasNode[]): TemplateCanvasNode[] {
        const sessionIndex = nodes.findIndex(n => n.type === 'session-context');
        const projectIndex = nodes.findIndex(n => n.type === 'project-context');
        if (sessionIndex < 0 || projectIndex < 0) return nodes;

        const session = nodes[sessionIndex];
        const project = nodes[projectIndex];
        const overlap =
            Math.abs(session.x - project.x) < this.contextOverlapThreshold &&
            Math.abs(session.y - project.y) < this.contextOverlapThreshold;
        if (!overlap) return nodes;

        const updated = [...nodes];
        updated[projectIndex] = {
            ...project,
            x: session.x + 360,
            y: session.y,
        };
        return updated;
    }

    /** Handle node moved */
    onNodeMoved(event: DfEvent<DfNodeWithPosition>): void {
        const target = event.target;
        const position = target?.position ?? target?.point;
        if (!target?.id || !position) return;

        this._nodes.update(nodes =>
            nodes.map(n => n.id === target.id ? { ...n, x: position.x, y: position.y } : n)
        );
        this.queueAutosave();
    }

    /** Handle node deleted */
    onNodeDeleted(event: DfEvent<DfDataInitialNode>): void {
        const nodeId = event.target?.id;
        if (nodeId) {
            this.deleteNode(nodeId);
        }
    }

    // ========================================================================
    // SAVE & PUBLISH
    // ========================================================================

    /** Check if template can be saved */
    readonly canSave = computed(() => {
            return this.isBasicInfoValid() &&
                   this._nodes().some(n => n.type === 'composite') &&
                   !this.isSaving();
    });

    /** Validation message */
    readonly validationMessage = computed(() => {
            if (!this.isBasicInfoValid()) {
                return this.translate.instant('templates.builder.fill_basic_info');
            }
            if (!this._nodes().some(n => n.type === 'composite')) {
                return this.translate.instant('templates.canvas.add_composite');
            }
        return '';
    });

    /** Save as draft */
    async saveAsDraft(): Promise<void> {
        if (!this.canSave()) {
            this.toast.show(this.validationMessage());
            return;
        }
        await this.save(WorkflowStatus.DRAFT);
    }

    /** Save and publish */
    async saveAndPublish(): Promise<void> {
        if (!this.canSave()) {
            this.toast.show(this.validationMessage());
            return;
        }
        await this.save(WorkflowStatus.PUBLISHED);
    }

    /** Save template */
    private async save(status: WorkflowStatus): Promise<void> {
        this.isSaving.set(true);

        try {
            const consistency = this.applyTierConsistency({ showToast: true });
            if (consistency.missingCompositeNodeIds.length > 0) {
                return;
            }

            const template = this.buildTemplate(status);
            
            if (this.isEditMode()) {
                this.store.updateTemplate({ id: template.id, changes: template });
            } else {
                this.store.addTemplate(template);
            }

            this.lastAutosaveFingerprint = this.computeAutosaveFingerprint(status);

            this.toast.show(
                this.translate.instant(
                    status === WorkflowStatus.PUBLISHED
                        ? 'templates.builder.published_success'
                        : 'templates.builder.saved_success'
                )
            );

            this.router.navigate(['/genai-workflows/templates']);
        } catch {
            this.toast.showError(this.translate.instant('templates.builder.save_error'));
        } finally {
            this.isSaving.set(false);
        }
    }

    /** Build template from canvas state */
    private buildTemplate(status: WorkflowStatus): TemplateWorkflow {
        const formValue = this.basicInfoForm.value;
        const compositeNodes = this._nodes().filter(n => n.type === 'composite');

        // Build composite workflow nodes
        const compositeWorkflows: TemplateWorkflowNode[] = compositeNodes.map(n => ({
            id: n.id,
            compositeWorkflowId: n.data.compositeId!,
            label: n.data.label,
            position: { x: n.x, y: n.y },
            configuration: this.cloneRecord(n.data.compositeConfig),
        }));

        // Build edges
        const edges: TemplateWorkflowEdge[] = this._edges().map(e => ({
            id: e.id,
            source: e.source,
            sourcePort: e.sourcePort,
            target: e.target,
            targetPort: e.targetPort,
        }));

        // UI components from canvas
        const uiNodes = this._nodes().filter(n => n.type === 'ui-component');
        const uiComponents: UIComponentConfig[] = uiNodes.map(n => {
            const persistedConfig = {
                ...(n.data.uiConfig || {}),
                __canvasX: n.x,
                __canvasY: n.y,
            } as Record<string, unknown>;

            return {
                id: n.id,
                type: n.data.uiType as UIComponentConfig['type'],
                label: n.data.label,
                bindings: (n.data.bindings || []).map(b => ({
                    componentProperty: b.portId,
                    workflowPath: b.targetPath,
                })),
                config: persistedConfig,
            };
        });

        // Context nodes (session/project)
        const contextNodes = this._nodes().filter(n => n.type === 'session-context' || n.type === 'project-context')
            .map(n => ({
                id: n.id,
                type: n.type as 'session-context' | 'project-context',
                x: n.x,
                y: n.y,
                data: {
                    label: n.data.label,
                    icon: n.data.icon,
                    contextType: n.data.contextType!,
                    storedItems: n.data.storedItems ? JSON.parse(JSON.stringify(n.data.storedItems)) : [],
                },
            }));

        // Build data flow config from context connections
        const dataFlowConfig: TemplateDataFlowConfig = this.buildDataFlowConfig();

        return {
            id: this.templateId() || crypto.randomUUID(),
            name: formValue.name,
            description: formValue.description || '',
            status,
            presentationPattern: this.determinePresentationPattern(compositeNodes),
            compositeWorkflows,
            edges,
            uiTemplate: {
                layout: this.determineLayoutType(),
                components: uiComponents,
            },
            dataFlowConfig,
            permissions: {
                viewers: ['user', 'admin'],
                executors: ['user', 'admin'],
                editors: ['admin'],
            },
            metadata: {
                createdAt: new Date().toISOString(),
                updatedAt: new Date().toISOString(),
                createdBy: 'current-user',
                version: 1,
            },
            contextNodes,
        };
    }

    /** Build data flow config from context connections */
    private buildDataFlowConfig(): TemplateDataFlowConfig {
        const nodes = this._nodes();
        const edges = this._edges();
        const compositeNodes = nodes.filter(n => n.type === 'composite');
        const contextNodes = nodes.filter(n =>
            n.type === 'session-context' || n.type === 'project-context'
        );

        const inputByPath = new Map<string, DataPortScopeConfig>();
        const outputByPath = new Map<string, DataPortScopeConfig>();
        const intermediateByPath = new Map<string, DataPortScopeConfig>();

        const upsert = (map: Map<string, DataPortScopeConfig>, entry: DataPortScopeConfig): void => {
            const existing = map.get(entry.portPath);
            map.set(entry.portPath, existing ? { ...existing, ...entry } : entry);
        };

        // Always expose all composite IO so Tier-3 keeps the full reusable workflow contract.
        for (const node of compositeNodes) {
            for (const input of node.data.exposedInputs ?? []) {
                upsert(inputByPath, {
                    portPath: `${node.id}:${input.id}`,
                    label: input.customLabel || input.label || input.id,
                    dataType: input.artifactType || 'any',
                    scope: 'session',
                    shareable: false,
                });
            }
            for (const output of node.data.exposedOutputs ?? []) {
                upsert(outputByPath, {
                    portPath: `${node.id}:${output.id}`,
                    label: output.customLabel || output.label || output.id,
                    dataType: output.artifactType || 'any',
                    scope: 'session',
                    shareable: false,
                });
            }
        }

        // Composite-to-composite links are intermediate data flow.
        for (const edge of edges) {
            const sourceNode = nodes.find(n => n.id === edge.source);
            const targetNode = nodes.find(n => n.id === edge.target);
            if (sourceNode?.type !== 'composite' || targetNode?.type !== 'composite') continue;

            const sourcePort = sourceNode.data.exposedOutputs?.find(o => o.id === edge.sourcePort);
            const targetPort = targetNode.data.exposedInputs?.find(i => i.id === edge.targetPort);
            const sourceLabel = sourcePort?.customLabel || sourcePort?.label || edge.sourcePort;
            const targetLabel = targetPort?.customLabel || targetPort?.label || edge.targetPort;

            upsert(intermediateByPath, {
                portPath: `${edge.source}:${edge.sourcePort}->${edge.target}:${edge.targetPort}`,
                label: `${sourceLabel} -> ${targetLabel}`,
                dataType: sourcePort?.artifactType || targetPort?.artifactType || 'any',
                scope: 'session',
                shareable: false,
            });
        }

        // Context links override default scope for mapped ports.
        for (const ctxNode of contextNodes) {
            const scope = ctxNode.type === 'session-context' ? 'session' : 'project';

            const toContext = edges.filter(e => e.target === ctxNode.id);
            for (const edge of toContext) {
                const sourceNode = nodes.find(n => n.id === edge.source);
                if (sourceNode?.type !== 'composite') continue;
                const output = sourceNode.data.exposedOutputs?.find(o => o.id === edge.sourcePort);
                upsert(outputByPath, {
                    portPath: `${edge.source}:${edge.sourcePort}`,
                    label: output?.customLabel || output?.label || edge.sourcePort,
                    dataType: output?.artifactType || 'any',
                    scope,
                    shareable: scope === 'project',
                });
            }

            const fromContext = edges.filter(e => e.source === ctxNode.id);
            for (const edge of fromContext) {
                const targetNode = nodes.find(n => n.id === edge.target);
                if (targetNode?.type !== 'composite') continue;
                const input = targetNode.data.exposedInputs?.find(i => i.id === edge.targetPort);
                upsert(inputByPath, {
                    portPath: `${edge.target}:${edge.targetPort}`,
                    label: input?.customLabel || input?.label || edge.targetPort,
                    dataType: input?.artifactType || 'any',
                    scope,
                    shareable: scope === 'project',
                });
            }
        }

        return {
            inputs: [...inputByPath.values()],
            outputs: [...outputByPath.values()],
            intermediates: [...intermediateByPath.values()],
            defaultScope: 'session',
            showDataFlowVisualization: true,
        };
    }

    /** Determine presentation pattern */
    private determinePresentationPattern(compositeNodes: TemplateCanvasNode[]): TemplatePresentationPattern {
        if (compositeNodes.length === 1) return 'standalone-single';
        const hasConnections = this._edges().some(e => {
            const src = this._nodes().find(n => n.id === e.source);
            const tgt = this._nodes().find(n => n.id === e.target);
            return src?.type === 'composite' && tgt?.type === 'composite';
        });
        return hasConnections ? 'linked-integrated' : 'standalone-tabs';
    }

    /** Determine layout type */
    private determineLayoutType(): TemplateLayoutType {
        const uiNodes = this._nodes().filter(n => n.type === 'ui-component');
        if (uiNodes.length === 0) return 'standalone-single';
        if (uiNodes.some(n => n.data.uiType === 'chat')) return 'chat-with-files';
        if (uiNodes.length === 1) return 'standalone-single';
        return 'linked-horizontal';
    }

    /** Cancel and go back */
    cancel(): void {
        this.router.navigate(['/genai-workflows/templates']);
    }

    /** Toggle palette */
    togglePalette(): void {
        this.showPalette.update(v => !v);
    }

    /** Handle title change from SEO component */
    onTitleChange(title: string): void {
        this.layoutService.setTitle(title);
    }
}
