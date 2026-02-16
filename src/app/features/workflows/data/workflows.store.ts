import { Injectable } from '@angular/core';
import { ComponentStore } from '@ngrx/component-store';
import { tap } from 'rxjs/operators';
import { ActionDefinitionLite, PipelineWorkflowDTO, PortsMap, Status, WorkflowEdge, WorkflowNode } from '../templates/utils/workflow.interface';
import {
    WorkflowPorts,
} from '../templates/utils/workflow.interface';
import {
    ensurePorts as sharedEnsurePorts,
    computeValidation as sharedComputeValidation,
    sanitizeGraph as sharedSanitizeGraph,
} from '../templates/utils/workflow-graph.utils';
import { WorkflowStatus, visibilityToStatus } from '@shared/types/workflow.types';

/**
 * Legacy visibility type - use WorkflowStatus enum for new code
 * @deprecated Use WorkflowStatus enum instead
 */
export type WorkflowVisibility = 'public' | 'draft';

export interface WorkflowDraft {
    id: string;
    name: string;
    description?: string;
    /** @deprecated Use status field with WorkflowStatus enum */
    visibility?: WorkflowVisibility;
    /** Workflow status - preferred over visibility */
    status?: WorkflowStatus;
    kind?: 'standard' | 'reusable';
    nodes: WorkflowNode[];
    edges: WorkflowEdge[];
    createdAt: string;
    updatedAt: string;
    version: number;
    needsRepublish?: boolean; // Flag for modified public workflows
}

export interface PortTypeOption {
    value: string;
    label: string;
}

export interface WorkflowExecutionLog {
    id: string;
    workflowId: string;
    workflowName: string;
    workflowVersion: number;
    startedAt: string;
    finishedAt?: string;
    status: Status;
    logs: string[];
    nodeStatuses: Record<string, Status>;
    pinnedData?: Record<string, unknown>;
    snapshotNodes: WorkflowNode[];
    snapshotEdges: WorkflowEdge[];
    workflowSnapshot?: PipelineWorkflowDTO;
    nodeData?: Record<string, unknown>;
    edgeData?: Record<string, unknown>;
    fromNodeId?: string;
}

export interface WorkflowSelectionState {
    nodeIds: string[];
    edgeIds: string[];
}

export interface WorkflowValidationState {
    valid: boolean;
    nodeValidity: Record<string, boolean>;
}

export interface WorkflowState {
    workflows: WorkflowDraft[];
    selectedWorkflowId: string | null;
    dirty: boolean;
    dirtyById: Record<string, boolean>;
    savedSigById: Record<string, string>;
    portTypes: PortTypeOption[];
    validation: WorkflowValidationState;
    selection: WorkflowSelectionState;
    executionHistory: WorkflowExecutionLog[];
    currentExecutionId: string | null;
    viewingExecutionId: string | null;
    catalog: ActionDefinitionLite[];
    catalogLoaded: boolean;
}

const STORAGE_KEY = 'app_workflows_v1';
const DEFAULT_PORT_TYPES: PortTypeOption[] = [
    { value: 'string', label: 'workflow.dialog.port_type_options.string' },
    { value: 'json', label: 'workflow.dialog.port_type_options.json' },
    { value: 'file', label: 'workflow.dialog.port_type_options.file' },
    { value: 'boolean', label: 'workflow.dialog.port_type_options.boolean' },
    { value: 'collection', label: 'workflow.dialog.port_type_options.collection' },
    { value: 'embeddings', label: 'workflow.dialog.port_type_options.embeddings' },
    { value: 'query_string', label: 'workflow.dialog.port_type_options.query_string' },
];

@Injectable()
export class WorkflowsStore extends ComponentStore<WorkflowState> {
    readonly workflows$ = this.select((s) => s.workflows);
    readonly selectedWorkflowId$ = this.select((s) => s.selectedWorkflowId);
    readonly selectedWorkflow$ = this.select(this.workflows$, this.selectedWorkflowId$, (list, id) =>
        list.find((w) => w.id === id) ?? null
    );
    readonly selection$ = this.select((s) => s.selection);
    readonly validation$ = this.select((s) => s.validation);
    readonly executionHistory$ = this.select((s) => s.executionHistory);
    readonly currentExecution$ = this.select(this.executionHistory$, this.select((s) => s.currentExecutionId), (runs, id) =>
        runs.find((r) => r.id === id) ?? null
    );
    readonly viewingExecution$ = this.select(this.executionHistory$, this.select((s) => s.viewingExecutionId), (runs, id) =>
        runs.find((r) => r.id === id) ?? null
    );
    readonly catalog$ = this.select((s) => s.catalog);
    readonly dirty$ = this.select((s) => s.dirty);
    readonly dirtyById$ = this.select((s) => s.dirtyById);
    readonly validityById$ = this.select(this.workflows$, (list) =>
        list.reduce<Record<string, boolean>>((acc, wf) => {
            const cleaned = sanitizeGraph(wf.nodes, wf.edges);
            acc[wf.id] = sharedComputeValidation(cleaned.nodes, cleaned.edges).valid;
            return acc;
        }, {})
    );
    readonly canDraftById$ = this.select(
        this.workflows$,
        this.dirtyById$,
        (list, dirtyById) => {
            const acc: Record<string, boolean> = {};
            for (const wf of list) {
                acc[wf.id] = !!dirtyById[wf.id];
            }
            return acc;
        }
    );
    readonly canPublishById$ = this.select(
        this.workflows$,
        this.dirtyById$,
        this.validityById$,
        (list, dirtyById, validById) => {
            const acc: Record<string, boolean> = {};
            for (const wf of list) {
                const dirty = !!dirtyById[wf.id];
                const valid = !!validById[wf.id];
                acc[wf.id] = valid && (wf.visibility === 'draft' || dirty || !!wf.needsRepublish);
            }
            return acc;
        }
    );
    readonly canDraft$ = this.select(
        this.selectedWorkflow$,
        this.dirty$,
        (wf, dirty) => {
            if (!wf) return false;
            return dirty;
        }
    );
    readonly canPublish$ = this.select(
        this.selectedWorkflow$,
        this.validation$,
        this.dirty$,
        (wf, v, dirty) => {
            if (!wf) return false;
            if (!v.valid) return false;
            if (wf.visibility === 'draft') return true;
            return dirty || !!wf.needsRepublish;
        }
    );
    readonly portTypes$ = this.select((s) => s.portTypes);

    constructor() {
        super({
            workflows: [],
            selectedWorkflowId: null,
            dirty: false,
            dirtyById: {},
            savedSigById: {},
            portTypes: DEFAULT_PORT_TYPES,
            validation: { valid: true, nodeValidity: {} },
            selection: { nodeIds: [], edgeIds: [] },
            executionHistory: [],
            currentExecutionId: null,
            viewingExecutionId: null,
            catalog: [],
            catalogLoaded: false,
        });
        this.restoreFromStorage();
        this.state$.subscribe(() => this.persistToStorage());
    }

    readonly loadWorkflow = this.updater((state, payload: { workflow: WorkflowDraft }) => {
        const cleaned = sanitizeGraph(payload.workflow.nodes, payload.workflow.edges);
        const wf = {
            ...payload.workflow,
            nodes: stripTransientNodeFields(cleaned.nodes),
            edges: cleaned.edges,
        };
        const sig = workflowSig(wf);
        const dirtyById = { ...state.dirtyById, [payload.workflow.id]: false };
        const savedSigById = { ...state.savedSigById, [payload.workflow.id]: sig };

        return {
            ...state,
            workflows: upsertById(state.workflows, wf),
            selectedWorkflowId: payload.workflow.id,
            validation: sharedComputeValidation(wf.nodes, wf.edges),
            dirtyById,
            savedSigById,
            dirty: getDirtyFor(dirtyById, payload.workflow.id),
            viewingExecutionId: null,
        };
    });

    readonly updateGraph = this.updater((state, payload: { nodes: WorkflowNode[]; edges: WorkflowEdge[] }) => {
        const wf = state.workflows.find((w) => w.id === state.selectedWorkflowId);
        if (!wf) return state;
        const cleaned = sanitizeGraph(payload.nodes, payload.edges);
        const cleanedNodes = stripTransientNodeFields(cleaned.nodes);
        const currentClean = sanitizeGraph(wf.nodes, wf.edges);
        if (graphSig(cleanedNodes, cleaned.edges) === graphSig(currentClean.nodes, currentClean.edges)) {
            return state;
        }
        let updated: WorkflowDraft;
        // When a published workflow is modified, it goes back to draft state
        const wasPublished = wf.visibility === 'public' || wf.status === WorkflowStatus.PUBLISHED;
        if (wasPublished) {
            updated = {
                ...wf,
                nodes: cleanedNodes,
                edges: cleaned.edges,
                updatedAt: new Date().toISOString(),
                version: wf.version + 1,
                needsRepublish: true,
                visibility: 'draft',
                status: WorkflowStatus.UNPUBLISHED, // Mark as unpublished (was published but now modified)
            };
        } else {
            updated = {
                ...wf,
                nodes: cleanedNodes,
                edges: cleaned.edges,
                updatedAt: new Date().toISOString(),
                version: wf.version + 1,
                needsRepublish: true,
            };
        }
        const sig = workflowSig(updated);
        const savedSig = state.savedSigById[wf.id] ?? '';
        const isDirty = sig !== savedSig;
        const dirtyById = { ...state.dirtyById, [wf.id]: isDirty };
        return {
            ...state,
            workflows: upsertById(state.workflows, updated),
            dirtyById,
            dirty: getDirtyFor(dirtyById, state.selectedWorkflowId),
            validation: sharedComputeValidation(updated.nodes, updated.edges),
        };
    });

    readonly updateWorkflowMeta = this.updater((state, payload: { id?: string; name?: string; description?: string; visibility?: 'public' | 'draft'; kind?: 'standard' | 'reusable' }) => {
        const id = payload.id ?? state.selectedWorkflowId;
        if (!id) return state;
        const wf = state.workflows.find((w) => w.id === id);
        if (!wf) return state;

        const changes: Partial<WorkflowDraft> = {};
        if (payload.name !== undefined && payload.name !== wf.name) changes.name = payload.name;
        if (payload.description !== undefined && payload.description !== wf.description) changes.description = payload.description;
        if (payload.visibility !== undefined && payload.visibility !== wf.visibility) changes.visibility = payload.visibility;
        if (payload.kind !== undefined && payload.kind !== wf.kind) changes.kind = payload.kind;

        if (Object.keys(changes).length === 0) return state;

        const forceDraftOnKind = payload.kind === 'standard' && wf.kind === 'reusable';

        let updated: WorkflowDraft;
        // When a published workflow is modified, it goes back to draft state
        const wasPublished = wf.visibility === 'public' || wf.status === WorkflowStatus.PUBLISHED;
        if (wasPublished) {
            updated = {
                ...wf,
                ...changes,
                updatedAt: new Date().toISOString(),
                version: wf.version + 1,
                needsRepublish: true,
                visibility: 'draft',
                status: WorkflowStatus.UNPUBLISHED, // Mark as unpublished (was published but now modified)
            };
        } else {
            updated = {
                ...wf,
                ...changes,
                updatedAt: new Date().toISOString(),
                version: wf.version + 1,
                needsRepublish: true,
            };
        }
        if (forceDraftOnKind && updated.visibility !== 'draft') {
            updated = { ...updated, visibility: 'draft', status: WorkflowStatus.DRAFT };
        }

        const sig = workflowSig(updated);
        const savedSig = state.savedSigById[wf.id] ?? '';
        const isUnpublishToDraft = payload.visibility === 'draft' && wf.visibility === 'public';
        const isAutoSave = isUnpublishToDraft || forceDraftOnKind || payload.visibility !== undefined || payload.kind !== undefined;
        const nextSavedSigById = isAutoSave ? { ...state.savedSigById, [wf.id]: sig } : state.savedSigById;
        const isDirty = isAutoSave ? false : sig !== savedSig;
        const dirtyById = { ...state.dirtyById, [wf.id]: isDirty };
        return {
            ...state,
            workflows: upsertById(state.workflows, updated),
            dirtyById,
            savedSigById: nextSavedSigById,
            dirty: getDirtyFor(dirtyById, state.selectedWorkflowId),
            validation: sharedComputeValidation(updated.nodes, updated.edges),
        };
    });

    readonly createWorkflow = this.updater((state, payload: { name?: string; description?: string; visibility?: WorkflowVisibility; kind?: 'standard' | 'reusable' }) => {
        const now = new Date().toISOString();
        const visibility = payload.visibility ?? 'draft';
        const workflow: WorkflowDraft = {
            id: newId(),
            name: payload.name || 'Untitled workflow',
            description: payload.description,
            visibility,
            status: visibilityToStatus(visibility), // Sync status field
            kind: payload.kind ?? 'standard',
            nodes: [],
            edges: [],
            createdAt: now,
            updatedAt: now,
            version: 1,
        };
        const workflows = [...state.workflows, workflow];
        const sig = workflowSig(workflow);
        const dirtyById = { ...state.dirtyById, [workflow.id]: false };
        const savedSigById = { ...state.savedSigById, [workflow.id]: sig };
        return {
            ...state,
            workflows,
            selectedWorkflowId: workflow.id,
            dirtyById,
            savedSigById,
            dirty: getDirtyFor(dirtyById, workflow.id),
            validation: sharedComputeValidation(workflow.nodes, workflow.edges),
        };
    });

    readonly createWorkflowWithGraph = this.updater((state, payload: { name?: string; description?: string; visibility?: WorkflowVisibility; kind?: 'standard' | 'reusable'; nodes: WorkflowNode[]; edges: WorkflowEdge[] }) => {
        const now = new Date().toISOString();
        const visibility = payload.visibility ?? 'draft';
        const cleaned = sanitizeGraph(payload.nodes, payload.edges);
        const workflow: WorkflowDraft = {
            id: newId(),
            name: payload.name || 'Untitled workflow',
            description: payload.description,
            visibility,
            status: visibilityToStatus(visibility), // Sync status field
            kind: payload.kind ?? 'standard',
            nodes: stripTransientNodeFields(cleaned.nodes),
            edges: cleaned.edges,
            createdAt: now,
            updatedAt: now,
            version: 1,
        };
        const sig = workflowSig(workflow);
        const dirtyById = { ...state.dirtyById, [workflow.id]: false };
        const savedSigById = { ...state.savedSigById, [workflow.id]: sig };
        return {
            ...state,
            workflows: [...state.workflows, workflow],
            selectedWorkflowId: workflow.id,
            dirtyById,
            savedSigById,
            dirty: getDirtyFor(dirtyById, workflow.id),
            validation: sharedComputeValidation(workflow.nodes, workflow.edges),
        };
    });

    readonly selectWorkflow = this.updater((state, payload: { id: string }) => {
        const wf = state.workflows.find(w => w.id === payload.id) ?? null;
        const savedSig = wf ? (state.savedSigById[wf.id] ?? '') : '';
        const isDirty = wf ? workflowSig(wf) !== savedSig : false;
        const dirtyById = wf ? { ...state.dirtyById, [wf.id]: isDirty } : state.dirtyById;
        const cleaned = wf ? sanitizeGraph(wf.nodes, wf.edges) : { nodes: [], edges: [] };
        const validation = wf ? sharedComputeValidation(cleaned.nodes, cleaned.edges) : { valid: false, nodeValidity: {} };

        return {
            ...state,
            selectedWorkflowId: payload.id,
            dirtyById,
            dirty: getDirtyFor(dirtyById, payload.id),
            validation: validation,
            selection: { nodeIds: [], edgeIds: [] },
            viewingExecutionId: null,
        };
    });

    readonly revalidateSelected = this.updater((state) => {
        const wf = state.workflows.find((w) => w.id === state.selectedWorkflowId);
        if (!wf) return state;
        const cleaned = sanitizeGraph(wf.nodes, wf.edges);
        return {
            ...state,
            validation: sharedComputeValidation(cleaned.nodes, cleaned.edges),
        };
    });

    readonly deleteWorkflow = this.updater((state, payload: { id: string }) => {
        const workflows = state.workflows.filter((w) => w.id !== payload.id);
        const selectedWorkflowId = state.selectedWorkflowId === payload.id ? workflows.at(-1)?.id ?? null : state.selectedWorkflowId;
        const dirtyById = removeDirty(state.dirtyById, payload.id);
        const savedSigById = removeDirty(state.savedSigById, payload.id);

        return {
            ...state,
            workflows,
            selectedWorkflowId,
            dirtyById,
            savedSigById,
            dirty: getDirtyFor(dirtyById, selectedWorkflowId),
            viewingExecutionId: null,
        };
    });

    readonly duplicateWorkflow = this.updater((state, payload: { id: string }) => {
        const original = state.workflows.find((w) => w.id === payload.id);
        if (!original) return state;

        const now = new Date().toISOString();
        const duplicate: WorkflowDraft = {
            ...original,
            id: newId(),
            name: `${original.name} (Copy)`,
            createdAt: now,
            updatedAt: now,
            version: 1,
        };

        const sig = workflowSig(duplicate);
        const dirtyById = { ...state.dirtyById, [duplicate.id]: false };
        const savedSigById = { ...state.savedSigById, [duplicate.id]: sig };

        return {
            ...state,
            workflows: [...state.workflows, duplicate],
            selectedWorkflowId: duplicate.id,
            dirtyById,
            savedSigById,
            dirty: getDirtyFor(dirtyById, duplicate.id),
        };
    });

    readonly updateWorkflow = this.updater((state, payload: { workflow: WorkflowDraft }) => {
        const cleaned = sanitizeGraph(payload.workflow.nodes, payload.workflow.edges);
        const normalizedWorkflow: WorkflowDraft = {
            ...payload.workflow,
            nodes: stripTransientNodeFields(cleaned.nodes),
            edges: cleaned.edges,
        };
        const sig = workflowSig(normalizedWorkflow);
        const dirtyById = { ...state.dirtyById, [payload.workflow.id]: false };
        const savedSigById = { ...state.savedSigById, [normalizedWorkflow.id]: sig };

        return {
            ...state,
            workflows: upsertById(state.workflows, normalizedWorkflow),
            dirtyById,
            savedSigById,
            dirty: getDirtyFor(dirtyById, state.selectedWorkflowId),
        };
    });

    readonly setSelection = this.updater((state, payload: WorkflowSelectionState) => ({
        ...state,
        selection: payload,
    }));

    readonly setValidation = this.updater((state, payload: WorkflowValidationState) => ({
        ...state,
        validation: payload,
    }));

    readonly startExecution = this.updater((state) => this.createRun(state, undefined));

    readonly startExecutionFromNode = this.updater((state, payload: { nodeId: string }) => this.createRun(state, payload.nodeId));

    readonly startExecutionWithPayload = this.updater((state, payload: { runId: string; workflow: PipelineWorkflowDTO; nodeStatuses: Record<string, Status>; fromNodeId?: string }) => {
        const wf = state.workflows.find((w) => w.id === state.selectedWorkflowId);
        if (!wf) return state;
        const now = new Date().toISOString();
        const snapshotNodes = clone(wf.nodes);
        const snapshotEdges = clone(wf.edges);
        const run: WorkflowExecutionLog = {
            id: payload.runId,
            workflowId: wf.id,
            workflowName: wf.name,
            workflowVersion: wf.version,
            startedAt: now,
            status: 'running',
            logs: payload.fromNodeId ? [`Run from ${payload.fromNodeId}`] : [],
            nodeStatuses: payload.nodeStatuses ?? {},
            snapshotNodes,
            snapshotEdges,
            workflowSnapshot: payload.workflow,
            fromNodeId: payload.fromNodeId,
            nodeData: {},
            edgeData: {},
        };

        return {
            ...state,
            executionHistory: [run, ...state.executionHistory].slice(0, 20),
            currentExecutionId: run.id,
            viewingExecutionId: payload.fromNodeId ? run.id : state.viewingExecutionId,
        };
    });

    readonly appendLog = this.updater((state, payload: { executionId: string; message: string }) => {
        const updated = state.executionHistory.map((r) =>
            r.id === payload.executionId ? { ...r, logs: [...r.logs, payload.message] } : r
        );
        return { ...state, executionHistory: updated };
    });

    readonly updateNodeStatus = this.updater((state, payload: { executionId: string; nodeId: string; status: Status }) => {
        const updated = state.executionHistory.map((r) => {
            if (r.id !== payload.executionId) return r;
            const nodeStatuses = { ...r.nodeStatuses, [payload.nodeId]: payload.status };
            return { ...r, nodeStatuses };
        });
        return { ...state, executionHistory: updated };
    });

    readonly mergeExecutionData = this.updater((state, payload: { executionId: string; nodeData?: Record<string, unknown>; edgeData?: Record<string, unknown> }) => {
        const updated = state.executionHistory.map((r) => {
            if (r.id !== payload.executionId) return r;
            return {
                ...r,
                nodeData: { ...(r.nodeData ?? {}), ...(payload.nodeData ?? {}) },
                edgeData: { ...(r.edgeData ?? {}), ...(payload.edgeData ?? {}) },
            };
        });
        return { ...state, executionHistory: updated };
    });

    readonly completeExecution = this.updater((state, payload: { executionId: string; status: Status }) => {
        const updated = state.executionHistory.map((r) =>
            r.id === payload.executionId
                ? { ...r, status: payload.status, finishedAt: new Date().toISOString() }
                : r
        );
        return { ...state, executionHistory: updated, currentExecutionId: null };
    });

    readonly clearHistory = this.updater((state) => ({
        ...state,
        executionHistory: [],
        currentExecutionId: null,
        viewingExecutionId: null,
    }));



    readonly setCatalog = this.updater((state, payload: { catalog: ActionDefinitionLite[] }) => ({
        ...state,
        catalog: (payload.catalog ?? []).map(a => {
            const copy = { ...a, params: { ...(a.params ?? {}) } } as ActionDefinitionLite & { params: PortsMap };
            try {
                // If the catalog provides a ports array, build a ports_map for quick lookup
                const ports = copy.params['ports'] as WorkflowPorts | undefined;
                if (Array.isArray(ports)) {
                    const map: PortsMap = {};
                    for (const p of ports) {
                        if (p && typeof p === 'object' && 'id' in p) {
                            map[p.id] = p;
                        }
                    }
                    copy.params['ports_map'] = map;
                }

                // If a ports_map already exists, ensure values are normalized to objects
                const existingMap = copy.params['ports_map'] as PortsMap | undefined;
                if (existingMap && typeof existingMap === 'object' && !Array.isArray(existingMap)) {
                    const normalized: PortsMap = {};
                    for (const [k, v] of Object.entries(existingMap)) {
                        if (typeof v === 'boolean') {
                            normalized[k] = { required: v, readonly: false };
                        } else if (v && typeof v === 'object') {
                            normalized[k] = v;
                        }
                    }
                    copy.params['ports_map'] = normalized;
                }
            } catch {
                // ignore
            }
            return copy;
        }),
        catalogLoaded: true,
    }));

    readonly setPortTypes = this.updater((state, payload: { portTypes: PortTypeOption[] }) => ({
        ...state,
        portTypes: payload.portTypes ?? [],
    }));

    readonly persist = this.effect((trigger$) =>
        trigger$.pipe(tap(() => this.persistToStorage()))
    );

    readonly restore = this.effect((trigger$) =>
        trigger$.pipe(tap(() => this.restoreFromStorage()))
    );

    private persistToStorage(): void {
        try {
            const snapshot = this.get();
            const {
                workflows,
                selectedWorkflowId,
                executionHistory,
                catalog,
                catalogLoaded,
                dirtyById,
                savedSigById,
                portTypes
            } = snapshot;
            localStorage.setItem(
                STORAGE_KEY,
                JSON.stringify({
                    workflows,
                    selectedWorkflowId,
                    executionHistory,
                    catalog,
                    catalogLoaded,
                    dirtyById,
                    savedSigById,
                    portTypes
                })
            );
        } catch (err) {
            console.error('Failed to persist workflows', err);
        }
    }

    private restoreFromStorage(): void {
        try {
            const raw = localStorage.getItem(STORAGE_KEY);
            if (!raw) return;
            const parsed = JSON.parse(raw) as Partial<WorkflowState>;
            const savedSigById = parsed.savedSigById ?? {};
            const workflows = parsed.workflows ?? [];
            const portTypes = parsed.portTypes ?? DEFAULT_PORT_TYPES;
            const seededSavedSigById = { ...savedSigById };
            for (const wf of workflows) {
                if (!seededSavedSigById[wf.id]) {
                    seededSavedSigById[wf.id] = workflowSig(wf);
                }
            }
            const parsedSelectedWorkflowId = typeof parsed.selectedWorkflowId === 'string'
                ? parsed.selectedWorkflowId
                : null;
            const selectedWorkflowId = parsedSelectedWorkflowId && workflows.some(wf => wf.id === parsedSelectedWorkflowId)
                ? parsedSelectedWorkflowId
                : workflows.at(-1)?.id ?? null;
            const dirtyById = workflows.reduce<Record<string, boolean>>((acc, wf) => {
                acc[wf.id] = workflowSig(wf) !== (seededSavedSigById[wf.id] ?? '');
                return acc;
            }, {});
            const selectedWorkflow = selectedWorkflowId
                ? workflows.find(wf => wf.id === selectedWorkflowId) ?? null
                : null;
            const selectedValidation = selectedWorkflow
                ? sharedComputeValidation(selectedWorkflow.nodes, selectedWorkflow.edges)
                : { valid: true, nodeValidity: {} };
            this.patchState({
                workflows,
                selectedWorkflowId,
                dirtyById,
                savedSigById: seededSavedSigById,
                dirty: getDirtyFor(dirtyById, selectedWorkflowId),
                validation: selectedValidation,
                executionHistory: parsed.executionHistory ?? [],
                catalog: parsed.catalog ?? [],
                catalogLoaded: parsed.catalogLoaded ?? false,
                portTypes,
            });
        } catch (err) {
            console.error('Failed to restore workflows', err);
        }
    }

    private createRun(state: WorkflowState, fromNodeId?: string): WorkflowState {
        const wf = state.workflows.find((w) => w.id === state.selectedWorkflowId);
        if (!wf) return state;
        const snapshotNodes = clone(wf.nodes);
        const snapshotEdges = clone(wf.edges);
        const workflowSnapshot: PipelineWorkflowDTO = {
            name: wf.name,
            nodes: clone(wf.nodes) as unknown as PipelineWorkflowDTO['nodes'],
            edges: clone(wf.edges) as unknown as PipelineWorkflowDTO['edges'],
            meta: {
                createdAt: new Date().toISOString(),
                version: `${wf.version}`,
                filesByNode: {},
            },
        };
        const run: WorkflowExecutionLog = {
            id: newId(),
            workflowId: wf.id,
            workflowName: wf.name,
            workflowVersion: wf.version,
            startedAt: new Date().toISOString(),
            status: 'queued',
            logs: fromNodeId ? [`Run from ${fromNodeId}`] : [],
            nodeStatuses: {},
            snapshotNodes,
            snapshotEdges,
            workflowSnapshot,
            fromNodeId,
            nodeData: {},
            edgeData: {},
        };
        return {
            ...state,
            executionHistory: [run, ...state.executionHistory].slice(0, 20),
            currentExecutionId: run.id,
            viewingExecutionId: fromNodeId ? run.id : state.viewingExecutionId,
        };
    }

    readonly saveSelected = this.updater((state) => {
        const id = state.selectedWorkflowId;
        if (!id) return state;

        const wf = state.workflows.find(w => w.id === id);
        if (!wf) return state;

        // mark current workflow signature as saved
        const sig = workflowSig(wf);

        const dirtyById = { ...state.dirtyById, [id]: false };
        const savedSigById = { ...state.savedSigById, [id]: sig };

        return {
            ...state,
            dirtyById,
            savedSigById,
            dirty: false,
        };
    });
}

function newId(): string {
    return (globalThis.crypto?.randomUUID?.() ?? `wf_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`);
}

function upsertById(list: WorkflowDraft[], incoming: WorkflowDraft): WorkflowDraft[] {
    const idx = list.findIndex((w) => w.id === incoming.id);
    if (idx === -1) return [...list, incoming];
    const next = [...list];
    next[idx] = incoming;
    return next;
}

function graphSig(nodes: WorkflowNode[], edges: WorkflowEdge[]): string {
    const ns = [...nodes]
        .map(n => ({
            id: n.id,
            type: n.type,
            x: Math.round(n.x ?? 0),
            y: Math.round(n.y ?? 0),
            data: {
                label: n.data?.label ?? '',
                aiType: n.data?.aiType ?? '',
                params: stripTransientParams(n.data?.params),
            },
            ports: canonicalizePorts(n.ports),
        }))
        .sort((a, b) => a.id.localeCompare(b.id));
    const es = [...edges]
        .map(e => ({
            id: e.id,
            s: e.source,
            t: e.target,
            sp: e.sourcePort,
            tp: e.targetPort,
            label: e.label ?? '',
        }))
        .sort((a, b) => a.id.localeCompare(b.id));
    return JSON.stringify({ ns, es });
}

function workflowSig(wf: WorkflowDraft): string {
    return JSON.stringify({
        graph: graphSig(wf.nodes, wf.edges),
        name: wf.name ?? '',
        description: wf.description ?? '',
        visibility: wf.visibility ?? '',
        kind: wf.kind ?? '',
    });
}

function getDirtyFor(dirtyById: Record<string, boolean>, id: string | null | undefined): boolean {
    if (!id) return false;
    return !!dirtyById[id];
}

function removeDirty<T>(dirtyById: Record<string, T>, id: string): Record<string, T> {
    if (!dirtyById[id]) return dirtyById;
    const next = { ...dirtyById };
    delete next[id];
    return next;
}

function clone<T>(v: T): T {
    return JSON.parse(JSON.stringify(v)) as T;
}

function stripTransientNodeFields(nodes: WorkflowNode[]): WorkflowNode[] {
    return nodes.map((node) => ({
        ...node,
        data: {
            ...node.data,
            params: stripTransientParams(node.data?.params),
        },
    }));
}

function stripTransientParams(params: unknown): Record<string, unknown> {
    if (!params || typeof params !== 'object') return {};
    const source = params as Record<string, unknown>;
    const out: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(source)) {
        // Canvas/runtime-only flags should not participate in persistence dirty checks
        if (key === 'ui' || key === '__missingIn' || key === '__missingOut' || key === '__formInvalid') {
            continue;
        }
        out[key] = value;
    }
    return out;
}

function canonicalizePorts(ports: WorkflowNode['ports'] | undefined): WorkflowNode['ports'] {
    const normalize = (list: WorkflowNode['ports']['inputs']) =>
        [...(list ?? [])]
            .map((port) => ({
                id: port.id,
                label: port.label ?? '',
                type: port.type ?? 'json',
                required: !!port.required,
                readonly: !!port.readonly,
                data_reference: port.data_reference ?? '',
                artifact_type: port.artifact_type ?? '',
            }))
            .sort((a, b) => a.id.localeCompare(b.id));

    return {
        inputs: normalize(ports?.inputs ?? []),
        outputs: normalize(ports?.outputs ?? []),
    };
}

// delegate ensurePorts
export function ensurePorts(type: string, ports?: WorkflowNode['ports'], opts?: { padToMinimum?: boolean; minInputs?: number; minOutputs?: number; portsMap?: PortsMap }): WorkflowNode['ports'] {
    return sharedEnsurePorts(type, ports, opts);
}

// delegate graph validation
export function computeValidation(nodesArg: WorkflowNode[] | null | undefined, edgesArg: WorkflowEdge[] | null | undefined): WorkflowValidationState {
    return sharedComputeValidation(nodesArg, edgesArg);
}

// delegate graph sanitisation
export function sanitizeGraph(nodesArg: WorkflowNode[] | null | undefined, edgesArg: WorkflowEdge[] | null | undefined) {
    return sharedSanitizeGraph(nodesArg, edgesArg);
}
