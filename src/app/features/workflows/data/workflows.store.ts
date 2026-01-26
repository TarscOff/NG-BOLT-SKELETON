import { Injectable } from '@angular/core';
import { ComponentStore } from '@ngrx/component-store';
import { tap } from 'rxjs/operators';
import { ActionDefinitionLite, PipelineWorkflowDTO, Status, WorkflowEdge, WorkflowNode, WorkflowPort } from '../templates/utils/workflow.interface';
import {
    WorkflowPorts,
} from '../templates/utils/workflow.interface';
export interface WorkflowDraft {
    id: string;
    name: string;
    description?: string;
    visibility?: 'public' | 'draft';
    kind?: 'standard' | 'reusable';
    nodes: WorkflowNode[];
    edges: WorkflowEdge[];
    createdAt: string;
    updatedAt: string;
    version: number;
    needsRepublish?: boolean; // Ajout du flag pour workflows publics modifiés
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
    { value: 'query_string', label: 'workflow.dialog.port_type_options.query_string' },
    { value: 'embeddings', label: 'workflow.dialog.port_type_options.embeddings' },
    { value: 'json', label: 'workflow.dialog.port_type_options.json' },
    { value: 'collection', label: 'workflow.dialog.port_type_options.collection' },
    { value: 'string', label: 'workflow.dialog.port_type_options.string' },
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
            acc[wf.id] = computeValidationFromGraph(cleaned.nodes, cleaned.edges).valid;
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
        const wf = { ...payload.workflow, nodes: cleaned.nodes, edges: cleaned.edges };
        const sig = workflowSig(wf);
        const dirtyById = { ...state.dirtyById, [payload.workflow.id]: false };
        const savedSigById = { ...state.savedSigById, [payload.workflow.id]: sig };

        return {
            ...state,
            workflows: upsertById(state.workflows, wf),
            selectedWorkflowId: payload.workflow.id,
            validation: computeValidationFromGraph(wf.nodes, wf.edges),
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
        const currentClean = sanitizeGraph(wf.nodes, wf.edges);
        if (graphSig(cleaned.nodes, cleaned.edges) === graphSig(currentClean.nodes, currentClean.edges)) {
            return state;
        }
        let updated: WorkflowDraft;
        if (wf.visibility === 'public') {
            updated = {
                ...wf,
                nodes: cleaned.nodes,
                edges: cleaned.edges,
                updatedAt: new Date().toISOString(),
                version: wf.version + 1,
                needsRepublish: true,
                visibility: 'draft',
            };
        } else {
            updated = {
                ...wf,
                nodes: cleaned.nodes,
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
            validation: computeValidationFromGraph(updated.nodes, updated.edges),
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
        if (wf.visibility === 'public') {
            updated = {
                ...wf,
                ...changes,
                updatedAt: new Date().toISOString(),
                version: wf.version + 1,
                needsRepublish: true,
                visibility: 'draft',
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
            updated = { ...updated, visibility: 'draft' };
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
            validation: computeValidationFromGraph(updated.nodes, updated.edges),
        };
    });

    readonly createWorkflow = this.updater((state, payload: { name?: string; description?: string; visibility?: 'public' | 'draft'; kind?: 'standard' | 'reusable' }) => {
        const now = new Date().toISOString();
        const workflow: WorkflowDraft = {
            id: newId(),
            name: payload.name || 'Untitled workflow',
            description: payload.description,
            visibility: payload.visibility ?? 'draft',
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
            validation: computeValidationFromGraph(workflow.nodes, workflow.edges),
        };
    });

    readonly createWorkflowWithGraph = this.updater((state, payload: { name?: string; description?: string; visibility?: 'public' | 'draft'; kind?: 'standard' | 'reusable'; nodes: WorkflowNode[]; edges: WorkflowEdge[] }) => {
        const now = new Date().toISOString();
        const workflow: WorkflowDraft = {
            id: newId(),
            name: payload.name || 'Untitled workflow',
            description: payload.description,
            visibility: payload.visibility ?? 'draft',
            kind: payload.kind ?? 'standard',
            nodes: payload.nodes,
            edges: payload.edges,
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
            validation: computeValidationFromGraph(workflow.nodes, workflow.edges),
        };
    });

    readonly selectWorkflow = this.updater((state, payload: { id: string }) => {
        const wf = state.workflows.find(w => w.id === payload.id) ?? null;
        const savedSig = wf ? (state.savedSigById[wf.id] ?? '') : '';
        const isDirty = wf ? workflowSig(wf) !== savedSig : false;
        const dirtyById = wf ? { ...state.dirtyById, [wf.id]: isDirty } : state.dirtyById;
        const cleaned = wf ? sanitizeGraph(wf.nodes, wf.edges) : { nodes: [], edges: [] };
        const validation = wf ? computeValidationFromGraph(cleaned.nodes, cleaned.edges) : { valid: false, nodeValidity: {} };

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
            validation: computeValidationFromGraph(cleaned.nodes, cleaned.edges),
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
        const sig = workflowSig(payload.workflow);
        const dirtyById = { ...state.dirtyById, [payload.workflow.id]: false };
        const savedSigById = { ...state.savedSigById, [payload.workflow.id]: sig };
        return {
            ...state,
            workflows: upsertById(state.workflows, payload.workflow),
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
        catalog: payload.catalog,
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
            const { workflows, executionHistory, catalog, catalogLoaded, dirtyById, savedSigById, portTypes } = snapshot;
            localStorage.setItem(STORAGE_KEY, JSON.stringify({ workflows, executionHistory, catalog, catalogLoaded, dirtyById, savedSigById, portTypes }));
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
            const dirtyById = workflows.reduce<Record<string, boolean>>((acc, wf) => {
                acc[wf.id] = workflowSig(wf) !== (seededSavedSigById[wf.id] ?? '');
                return acc;
            }, {});
            this.patchState({
                workflows,
                selectedWorkflowId: null,
                dirtyById,
                savedSigById: seededSavedSigById,
                dirty: false,
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
            x: n.x ?? 0,
            y: n.y ?? 0,
            data: {
                label: n.data?.label ?? '',
                aiType: n.data?.aiType ?? '',
                params: n.data?.params ?? {},
            },
            ports: n.ports ?? { inputs: [], outputs: [] },
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


// --- Validation helpers (kept in the store so selection instantly reflects real graph status) ---
// Mirrors the canvas validation rules (minus form field validation), so the UI can show graph
// status immediately when a workflow is selected.
function portCountsFor(type: string): { inputs: number; outputs: number } {
    const t = (type ?? '').toString().toLowerCase();
    if (t === 'composite') return { inputs: 1, outputs: 1 };
    if (t === 'run-panel' || t === 'details' || t === 'preview') return { inputs: 0, outputs: 0 };
    if (t === 'input') return { inputs: 0, outputs: 1 };
    if (t === 'result') return { inputs: 1, outputs: 0 };
    const triggers = new Set(['compare', 'extract', 'summarize']);
    if (triggers.has(t)) return { inputs: 0, outputs: 1 };
    return { inputs: 1, outputs: 1 };
}

function defaultPortsFor(type: string): WorkflowNode['ports'] {
    const { inputs: inputCount, outputs: outputCount } = portCountsFor(type);
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

function ensurePorts(type: string, ports?: WorkflowNode['ports']): WorkflowNode['ports'] {
    const base = ports ?? defaultPortsFor(type);

    const pickString = (obj: WorkflowPort, keys: string[]): string | undefined => {
        const rec = obj as unknown as Record<string, unknown>;
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
            required: p.required, // leave undefined unless backend sets it
        } as WorkflowPort & { data_reference?: string; artifact_type?: string };
        if (dataRef) port.data_reference = dataRef;
        if (artifact) port.artifact_type = artifact;
        return port as WorkflowPort;
    };
    const inputs = (base.inputs ?? []).map((p, i) => norm(p, i, 'in'));
    const outputs = (base.outputs ?? []).map((p, i) => norm(p, i, 'out'));
    return { inputs, outputs };
}

function portsFromHandles(node: WorkflowNode): WorkflowNode['ports'] | null {
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

    const toPort = (handle: unknown, idx: number, prefix: 'in' | 'out'): WorkflowPort => {
        const rec = (handle && typeof handle === 'object') ? (handle as Record<string, unknown>) : {};
        const dataRef = pickString(rec, ['data_reference', 'dataReference']);
        const artifact = pickString(rec, ['artifact_type', 'artifactType']);
        const id = (typeof rec['id'] === 'string' ? (rec['id'] as string) : `${prefix}-${idx + 1}`);
        const label = (dataRef ?? (typeof rec['label'] === 'string' ? (rec['label'] as string) : undefined) ?? `${prefix} ${idx + 1}`);
        const type = (typeof rec['type'] === 'string' ? (rec['type'] as string) : undefined) ?? artifact ?? 'json';
        const required = (typeof rec['required'] === 'boolean' ? (rec['required'] as boolean) : undefined);
        const port = { id, label, type, required } as WorkflowPort & { data_reference?: string; artifact_type?: string };
        if (dataRef) port.data_reference = dataRef;
        if (artifact) port.artifact_type = artifact;
        return port as WorkflowPort;
    };

    return {
        inputs: (inputsRaw ?? []).map((h, i) => toPort(h, i, 'in')),
        outputs: (outputsRaw ?? []).map((h, i) => toPort(h, i, 'out')),
    };
}

function computeValidationFromGraph(
    nodesArg: WorkflowNode[] | null | undefined,
    edgesArg: WorkflowEdge[] | null | undefined
): WorkflowValidationState {
    const nodes = (nodesArg ?? []).filter(n => n.type !== 'input' && n.type !== 'result');
    const nodeIds = new Set(nodes.map(n => n.id));
    const edges = (edgesArg ?? []).filter(e => nodeIds.has(e.source) && nodeIds.has(e.target));

    const nodeValidity: Record<string, boolean> = {};
    let valid = true;
    // Empty canvas should not show invalid badge; treat as valid until nodes exist.
    if (nodes.length === 0) return { valid: true, nodeValidity };

    const outMap = new Map<string, WorkflowEdge[]>();
    const inMap = new Map<string, WorkflowEdge[]>();
    for (const n of nodes) { outMap.set(n.id, []); inMap.set(n.id, []); }
    for (const e of edges) { outMap.get(e.source)!.push(e); inMap.get(e.target)!.push(e); }

    const inByPort = new Map<string, number>();
    const outByPort = new Map<string, number>();
    for (const e of edges) {
        inByPort.set(`${e.target}::${e.targetPort}`, (inByPort.get(`${e.target}::${e.targetPort}`) ?? 0) + 1);
        outByPort.set(`${e.source}::${e.sourcePort}`, (outByPort.get(`${e.source}::${e.sourcePort}`) ?? 0) + 1);
    }

    for (const n of nodes) {
        const ports = ensurePorts(n.type, n.ports);
        const requiredInputs = (ports.inputs ?? []).filter(p => p.required === true);
        const requiredOutputs = (ports.outputs ?? []).filter(p => p.required === true);
        const allRequiredInputsMet = requiredInputs.every(p => (inByPort.get(`${n.id}::${p.id}`) ?? 0) > 0);
        const allRequiredOutputsMet = requiredOutputs.every(p => (outByPort.get(`${n.id}::${p.id}`) ?? 0) > 0);
        const good = allRequiredInputsMet && allRequiredOutputsMet;
        nodeValidity[n.id] = good;
        valid = valid && good;
    }

    // cycle check
    const indeg = new Map<string, number>();
    nodes.forEach(n => indeg.set(n.id, 0));
    edges.forEach(e => indeg.set(e.target, (indeg.get(e.target) ?? 0) + 1));
    const q: string[] = [];
    indeg.forEach((d, id) => { if (d === 0) q.push(id); });
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


function sanitizeGraph(nodesArg: WorkflowNode[] | null | undefined, edgesArg: WorkflowEdge[] | null | undefined) {
    const nodes = (nodesArg ?? []).map(n => {
        const handlePorts = portsFromHandles(n);
        return { ...n, ports: ensurePorts(n.type, handlePorts ?? n.ports) };
    });
    const byId = new Map(nodes.map(n => [n.id, n] as const));

    const edges = (edgesArg ?? []).filter(e => {
        const src = byId.get(e.source);
        const tgt = byId.get(e.target);
        if (!src || !tgt) return false;

        const srcPorts = ensurePorts(src.type, src.ports);
        const tgtPorts = ensurePorts(tgt.type, tgt.ports);

        // <— YOUR RULE: don’t keep edges to nodes without inputs
        if ((tgtPorts.inputs?.length ?? 0) === 0) return false;

        const srcOk = (srcPorts.outputs ?? []).some(p => p.id === e.sourcePort);
        const tgtOk = (tgtPorts.inputs ?? []).some(p => p.id === e.targetPort);
        return srcOk && tgtOk;
    });

    // de-dupe
    const uniq = new Map<string, WorkflowEdge>();
    for (const e of edges) uniq.set(e.id, e);

    return { nodes, edges: [...uniq.values()] };
}
