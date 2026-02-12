/**
 * Workflow Sync Service
 * 
 * This service bridges the gap between:
 * - Tier 1: Workflow Editor (WorkflowsStore with published workflows)
 * - Tier 2: Composite Workflows (TemplateWorkflowsStore)
 * 
 * IMPORTANT: Published workflows are automatically treated as composites.
 * No manual sync is required - if a workflow is published, it becomes a composite.
 */

import { Injectable, inject } from '@angular/core';
import { TemplateWorkflowsStore } from '../data/template-workflows.store';
import {
    CompositeWorkflow,
    CompositeWorkflowNode,
    CompositeWorkflowEdge,
    ExposedHandle,
    WorkflowStatus,
    ArtifactType,
} from '../interfaces/template-workflow.interface';
import { WorkflowNode, WorkflowEdge, WorkflowPorts } from '../utils/workflow.interface';
import { inferPortTypeFromReference } from '../utils/workflow-graph.utils';

// Storage key for the reusable workflows (from WorkflowsStore)
const WORKFLOWS_STORAGE_KEY = 'app_workflows_v1';

export interface WorkflowDraft {
    id: string;
    name: string;
    description?: string;
    visibility?: 'public' | 'draft';
    status?: WorkflowStatus;
    kind?: 'standard' | 'reusable';
    nodes: WorkflowNode[];
    edges: WorkflowEdge[];
    createdAt: string;
    updatedAt: string;
    version: number;
}

export interface SyncResult {
    synced: number;
    alreadySynced: number;
    errors: string[];
}

@Injectable({ providedIn: 'root' })
export class WorkflowSyncService {
    private readonly templateStore = inject(TemplateWorkflowsStore);

    /**
     * Get count of published workflows (all published workflows are composites)
     * This is kept for backward compatibility but always returns 0 since sync is automatic
     */
    getSyncableWorkflowsCount(): number {
        // No manual sync needed - published workflows ARE composites
        return 0;
    }

    /**
     * Get all published workflows from the workflow editor storage
     * These are automatically available as composites
     */
    getPublishedWorkflows(): WorkflowDraft[] {
        try {
            const stored = localStorage.getItem(WORKFLOWS_STORAGE_KEY);
            if (!stored) return [];

            const data = JSON.parse(stored);
            const workflows = data.workflows as WorkflowDraft[] || [];

            // Filter for published workflows (legacy visibility + unified status)
            // All published workflows are automatically composites
            return workflows.filter(w =>
                w.visibility === 'public' || w.status === WorkflowStatus.PUBLISHED
            );
        } catch (e) {
            console.warn('Failed to load workflows from storage:', e);
            return [];
        }
    }

    /**
     * Get all reusable workflows from the workflow editor storage
     * @deprecated Use getPublishedWorkflows instead - all published workflows are composites
     */
    getReusableWorkflows(): WorkflowDraft[] {
        return this.getPublishedWorkflows();
    }

    /**
     * Get composites directly from published workflows
     * This provides a live view of all published workflows as composites
     */
    getPublishedWorkflowsAsComposites(): CompositeWorkflow[] {
        const publishedWorkflows = this.getPublishedWorkflows();
        return publishedWorkflows.map(w => this.convertWorkflowToComposite(w));
    }

    /**
     * Sync all reusable workflows to composite workflows
     * @deprecated This method is kept for backward compatibility
     * Published workflows are now automatically available as composites
     */
    async syncReusableWorkflowsToComposites(): Promise<SyncResult> {
        // Sync is now automatic - this is a no-op
        const result: SyncResult = {
            synced: 0,
            alreadySynced: this.getPublishedWorkflows().length,
            errors: [],
        };
        return result;
    }

    /**
     * Convert a WorkflowDraft to a CompositeWorkflow
     * This transforms the flat workflow structure to the hierarchical composite structure
     */
    convertWorkflowToComposite(workflow: WorkflowDraft): CompositeWorkflow & { sourceWorkflowId: string } {
        const nodes = workflow.nodes || [];
        const edges = workflow.edges || [];
        const incomingConnections = new Set<string>();
        const outgoingConnections = new Set<string>();
        const incomingConnectionsNormalized = new Set<string>();
        const outgoingConnectionsNormalized = new Set<string>();
        const incomingNodeLevelConnections = new Set<string>();
        const outgoingNodeLevelConnections = new Set<string>();
        const inputById = new Map<string, ExposedHandle>();
        const outputById = new Map<string, ExposedHandle>();

        const normalizePortToken = (value: string | null | undefined): string =>
            (value ?? '')
                .toString()
                .trim()
                .toLowerCase()
                .replace(/[^a-z0-9]+/g, '_');

        const extractPortTokenCandidates = (value: string | null | undefined): string[] => {
            const raw = (value ?? '').toString().trim();
            if (!raw) return [];
            const candidates = new Set<string>([raw]);
            const delimiters = ['::', ':', '/', '.', '|', '->', '__', '--'];
            for (const delimiter of delimiters) {
                const parts = raw.split(delimiter).map(part => part.trim()).filter(Boolean);
                if (parts.length > 1) {
                    candidates.add(parts[parts.length - 1]);
                }
            }
            return Array.from(candidates);
        };

        const readStringField = (
            record: Record<string, unknown>,
            keys: string[]
        ): string | undefined => {
            for (const key of keys) {
                const value = record[key];
                if (typeof value === 'string' && value.trim().length > 0) {
                    return value.trim();
                }
            }
            return undefined;
        };

        const parsePortsFromEdgeId = (
            edgeIdRaw: unknown,
            sourceNodeId: string,
            targetNodeId: string
        ): { sourcePort?: string; targetPort?: string } => {
            const edgeId = edgeIdRaw;
            if (typeof edgeId !== 'string' || !edgeId.trim()) {
                return {};
            }

            const src = (sourceNodeId ?? '').toString();
            const tgt = (targetNodeId ?? '').toString();
            const prefix = `e-${src}__`;
            const middle = `--${tgt}__`;
            if (edgeId.startsWith(prefix)) {
                const middleIdx = edgeId.indexOf(middle, prefix.length);
                if (middleIdx > prefix.length) {
                    const sourcePort = edgeId.slice(prefix.length, middleIdx);
                    const targetPort = edgeId.slice(middleIdx + middle.length);
                    return {
                        sourcePort: sourcePort || undefined,
                        targetPort: targetPort || undefined,
                    };
                }
            }

            const fallback = edgeId.match(/^e-(.+?)__(.+?)--(.+?)__(.+)$/);
            if (fallback && fallback.length === 5) {
                return {
                    sourcePort: fallback[2] || undefined,
                    targetPort: fallback[4] || undefined,
                };
            }

            return {};
        };

        interface NormalizedEdge {
            id: string;
            source: string;
            target: string;
            sourcePort?: string;
            targetPort?: string;
        }

        const normalizedEdges: NormalizedEdge[] = edges.map((edge, index) => {
            const edgeRecord = edge as unknown as Record<string, unknown>;
            const sourceNodeId = readStringField(edgeRecord, [
                'source',
                'source_node_id',
                'sourceNodeId',
            ]) ?? '';
            const targetNodeId = readStringField(edgeRecord, [
                'target',
                'target_node_id',
                'targetNodeId',
            ]) ?? '';
            const parsedFromId = parsePortsFromEdgeId(edgeRecord['id'], sourceNodeId, targetNodeId);
            const sourcePort = readStringField(edgeRecord, [
                'sourcePort',
                'source_port',
                'source_handle_id',
                'sourceHandleId',
                'source_handle',
                'sourceHandle',
            ]) ?? parsedFromId.sourcePort;
            const targetPort = readStringField(edgeRecord, [
                'targetPort',
                'target_port',
                'target_handle_id',
                'targetHandleId',
                'target_handle',
                'targetHandle',
            ]) ?? parsedFromId.targetPort;
            const edgeId = typeof edge.id === 'string' && edge.id.trim().length > 0
                ? edge.id
                : `edge-${index}`;

            return {
                id: edgeId,
                source: sourceNodeId,
                target: targetNodeId,
                sourcePort,
                targetPort,
            };
        });

        for (const edge of normalizedEdges) {
            if (!edge.source || !edge.target) {
                continue;
            }
            const sourcePort = edge.sourcePort;
            const targetPort = edge.targetPort;

            if (typeof sourcePort === 'string' && sourcePort.trim().length > 0) {
                for (const candidate of extractPortTokenCandidates(sourcePort)) {
                    outgoingConnections.add(`${edge.source}:${candidate}`);
                    outgoingConnectionsNormalized.add(`${edge.source}:${normalizePortToken(candidate)}`);
                }
            } else {
                outgoingNodeLevelConnections.add(edge.source);
            }

            if (typeof targetPort === 'string' && targetPort.trim().length > 0) {
                for (const candidate of extractPortTokenCandidates(targetPort)) {
                    incomingConnections.add(`${edge.target}:${candidate}`);
                    incomingConnectionsNormalized.add(`${edge.target}:${normalizePortToken(candidate)}`);
                }
            } else {
                incomingNodeLevelConnections.add(edge.target);
            }
        }

        const isInputPortConnected = (nodeId: string, portId: string): boolean => {
            if (incomingNodeLevelConnections.has(nodeId)) return true;
            for (const candidate of extractPortTokenCandidates(portId)) {
                if (incomingConnections.has(`${nodeId}:${candidate}`)) return true;
                if (incomingConnectionsNormalized.has(`${nodeId}:${normalizePortToken(candidate)}`)) return true;
            }
            return false;
        };

        const isOutputPortConnected = (nodeId: string, portId: string): boolean => {
            if (outgoingNodeLevelConnections.has(nodeId)) return true;
            for (const candidate of extractPortTokenCandidates(portId)) {
                if (outgoingConnections.has(`${nodeId}:${candidate}`)) return true;
                if (outgoingConnectionsNormalized.has(`${nodeId}:${normalizePortToken(candidate)}`)) return true;
            }
            return false;
        };

        // Expose trigger outputs as entry inputs + only free/unplugged node inputs/outputs.
        for (const node of nodes) {
            const ports = this.getNodePorts(node);
            const nodeLabel = (node.data as { label?: string })?.label || node.type || 'node';
            const isTriggerNode = this.isTriggerNodeType(node.type);

            for (const port of ports.inputs) {
                if (isInputPortConnected(node.id, port.id)) continue;
                const id = `${node.id}:${port.id}`;
                if (inputById.has(id)) continue;
                inputById.set(id, {
                    id,
                    sourceNodeId: node.id,
                    sourcePortId: port.id,
                    artifactType: this.resolveArtifactType(port),
                    dataReference: this.resolveDataReference(port) || port.id,
                    label: port.label || port.id,
                    required: port.required ?? false,
                    description: `Input from ${nodeLabel}`,
                });
            }

            if (isTriggerNode) {
                // Trigger outputs are workflow entry points. Expose them as composite INPUT ports
                // even when wired internally, so templates can feed them explicitly.
                for (const port of ports.outputs) {
                    const id = `${node.id}:${port.id}`;
                    if (inputById.has(id)) continue;
                    inputById.set(id, {
                        id,
                        sourceNodeId: node.id,
                        sourcePortId: port.id,
                        artifactType: this.resolveArtifactType(port),
                        dataReference: this.resolveDataReference(port) || port.id,
                        label: port.label || port.id,
                        required: port.required ?? false,
                        description: `Trigger input from ${nodeLabel}`,
                    });
                }
                continue;
            }

            for (const port of ports.outputs) {
                if (isOutputPortConnected(node.id, port.id)) continue;
                const id = `${node.id}:${port.id}`;
                if (outputById.has(id)) continue;
                outputById.set(id, {
                    id,
                    sourceNodeId: node.id,
                    sourcePortId: port.id,
                    artifactType: this.resolveArtifactType(port),
                    dataReference: this.resolveDataReference(port) || port.id,
                    label: port.label || port.id,
                    required: false,
                    description: `Output from ${nodeLabel}`,
                });
            }
        }

        const exposedInputs = [...inputById.values()];
        const exposedOutputs = [...outputById.values()];

        // Convert workflow nodes to composite nodes
        // In a proper 3-tier system, each node would reference a MicroWorkflow
        // For now, we create synthetic micro workflow IDs based on node type
        const compositeNodes: CompositeWorkflowNode[] = nodes.map((node, index) => ({
            id: node.id,
            microWorkflowId: `micro-${node.type || 'unknown'}-${node.id}`,
            label: (node.data as { label?: string })?.label || node.type || `Node ${index + 1}`,
            position: { x: node.x ?? index * 200, y: node.y ?? 100 },
            configuration: this.normalizeNodeConfiguration(node),
        }));

        // Convert workflow edges to composite edges
        const compositeEdges: CompositeWorkflowEdge[] = normalizedEdges
            .filter(edge => !!edge.source && !!edge.target)
            .map(edge => ({
                id: edge.id,
                source: edge.source,
                sourcePort: edge.sourcePort ?? '',
                target: edge.target,
                targetPort: edge.targetPort ?? '',
            }));

        return {
            id: `composite-${workflow.id}`,
            sourceWorkflowId: workflow.id, // Keep reference to source for updates
            name: workflow.name,
            description: workflow.description || '',
            status: workflow.visibility === 'public' || workflow.status === WorkflowStatus.PUBLISHED
                ? WorkflowStatus.PUBLISHED
                : WorkflowStatus.DRAFT,
            nodes: compositeNodes,
            edges: compositeEdges,
            exposedInputs: exposedInputs.length > 0 ? exposedInputs : this.createDefaultInput(),
            exposedOutputs: exposedOutputs.length > 0 ? exposedOutputs : this.createDefaultOutput(),
            configuration: {
                timeoutMs: 30000,
                errorHandling: 'fail-fast',
            },
            metadata: {
                createdAt: workflow.createdAt || new Date().toISOString(),
                updatedAt: workflow.updatedAt || new Date().toISOString(),
                version: workflow.version || 1,
            },
        };
    }

    private isTriggerNodeType(type: string | undefined): boolean {
        const normalized = (type ?? '').toString().trim().toLowerCase().replace(/-/g, '_');
        return (
            normalized === 'trigger_chat' ||
            normalized === 'trigger_file_upload' ||
            normalized === 'trigger_webhook' ||
            normalized === 'trigger_manual'
        );
    }

    /**
     * Get ports from a workflow node
     */
    private getNodePorts(node: WorkflowNode): WorkflowPorts {
        // Check direct ports property
        if (node.ports) {
            return node.ports;
        }

        // Check params.ports
        const params = node.data?.params as Record<string, unknown> | undefined;
        if (params?.['ports']) {
            return params['ports'] as WorkflowPorts;
        }

        // Backward compatibility: check legacy handle arrays.
        const raw = node as unknown as {
            input_handles?: unknown;
            output_handles?: unknown;
            data?: { params?: Record<string, unknown> };
        };
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
        if (inputsRaw || outputsRaw) {
            const toPort = (handle: unknown, idx: number, prefix: 'in' | 'out'): WorkflowPorts['inputs'][number] => {
                const rec = (handle && typeof handle === 'object') ? (handle as Record<string, unknown>) : {};
                const id = typeof rec['id'] === 'string' ? rec['id'] as string : `${prefix}-${idx + 1}`;
                const dataReference =
                    (typeof rec['data_reference'] === 'string' ? rec['data_reference'] as string : undefined) ??
                    (typeof rec['dataReference'] === 'string' ? rec['dataReference'] as string : undefined);
                const artifactType =
                    (typeof rec['artifact_type'] === 'string' ? rec['artifact_type'] as string : undefined) ??
                    (typeof rec['artifactType'] === 'string' ? rec['artifactType'] as string : undefined);
                const rawType = typeof rec['type'] === 'string' ? rec['type'] as string : undefined;
                const label =
                    (typeof rec['label'] === 'string' ? rec['label'] as string : undefined) ??
                    dataReference ??
                    id;
                const required = typeof rec['required'] === 'boolean' ? rec['required'] as boolean : undefined;
                const inferredType = inferPortTypeFromReference(dataReference ?? id);
                const resolvedType = artifactType
                    ?? ((rawType && rawType !== 'json' && rawType !== 'any') ? rawType : undefined)
                    ?? inferredType
                    ?? rawType
                    ?? 'json';

                const port: WorkflowPorts['inputs'][number] = {
                    id,
                    label,
                    type: resolvedType,
                    required,
                };
                if (dataReference) {
                    (port as WorkflowPorts['inputs'][number] & { data_reference?: string }).data_reference = dataReference;
                }
                if (artifactType) {
                    (port as WorkflowPorts['inputs'][number] & { artifact_type?: string }).artifact_type = artifactType;
                } else if (inferredType) {
                    (port as WorkflowPorts['inputs'][number] & { artifact_type?: string }).artifact_type = inferredType;
                }
                return port;
            };

            return {
                inputs: (inputsRaw ?? []).map((handle, idx) => toPort(handle, idx, 'in')),
                outputs: (outputsRaw ?? []).map((handle, idx) => toPort(handle, idx, 'out')),
            };
        }

        // Return empty ports
        return { inputs: [], outputs: [] };
    }

    private normalizeNodeConfiguration(node: WorkflowNode): Record<string, unknown> {
        const rawParams = this.asRecord(node.data?.params);
        const configuration = this.cloneRecord(rawParams);
        const normalizedType = this.normalizeNodeType(node.type);
        const isTrigger = this.isTriggerNodeType(node.type);

        if (isTrigger) {
            Object.assign(configuration, this.normalizeTriggerConfiguration(normalizedType, configuration));
        }

        configuration['__nodeType'] = normalizedType;
        configuration['__isTrigger'] = isTrigger;

        return configuration;
    }

    private normalizeTriggerConfiguration(
        normalizedType: string,
        params: Record<string, unknown>
    ): Record<string, unknown> {
        const defaults: Record<string, unknown> = {};

        if (normalizedType === 'trigger_chat') {
            defaults['max_chars'] = this.readNumber(params, ['max_chars', 'maxChars', 'max_length', 'maxLength']) ?? 4000;
            defaults['placeholder'] = this.readString(params, ['placeholder', 'inputPlaceholder']) ?? 'Type your message...';
            defaults['enable_attachments'] = this.readBoolean(params, ['enable_attachments', 'enableAttachments']) ?? true;
            defaults['accepted_types'] = this.readCsv(params, ['accepted_types', 'acceptedTypes', 'allowedFileTypes'])
                ?? this.defaultAcceptedTypesCsv();
            defaults['max_file_size'] = this.readNumber(params, ['max_file_size', 'maxFileSize']) ?? 10 * 1024 * 1024;
            defaults['max_files'] = this.readNumber(params, ['max_files', 'maxFiles']) ?? 5;
            return defaults;
        }

        if (normalizedType === 'trigger_file_upload') {
            defaults['accepted_types'] = this.readCsv(params, ['accepted_types', 'acceptedTypes', 'allowedFileTypes'])
                ?? this.defaultAcceptedTypesCsv();
            defaults['max_file_size'] = this.readNumber(params, ['max_file_size', 'maxFileSize']) ?? 10 * 1024 * 1024;
            defaults['max_files'] = this.readNumber(params, ['max_files', 'maxFiles']) ?? 5;
            defaults['multiple'] = this.readBoolean(params, ['multiple']) ?? true;
            return defaults;
        }

        if (normalizedType === 'trigger_webhook') {
            defaults['accept_content_types'] = this.readCsv(params, ['accept_content_types', 'acceptContentTypes'])
                ?? 'application/json,text/plain,multipart/form-data';
            defaults['max_payload_size'] = this.readNumber(params, ['max_payload_size', 'maxPayloadSize']) ?? 1024 * 1024;
            defaults['parse_json'] = this.readBoolean(params, ['parse_json', 'parseJson']) ?? true;
            return defaults;
        }

        if (normalizedType === 'trigger_manual') {
            defaults['label'] = this.readString(params, ['label', 'buttonLabel']) ?? 'Run now';
            defaults['require_confirmation'] = this.readBoolean(params, ['require_confirmation', 'requireConfirmation']) ?? false;
            return defaults;
        }

        return defaults;
    }

    private normalizeNodeType(type: string | undefined): string {
        return (type ?? '').toString().trim().toLowerCase().replace(/-/g, '_');
    }

    private asRecord(value: unknown): Record<string, unknown> {
        if (!value || typeof value !== 'object' || Array.isArray(value)) {
            return {};
        }
        return value as Record<string, unknown>;
    }

    private cloneRecord(source: Record<string, unknown>): Record<string, unknown> {
        try {
            return JSON.parse(JSON.stringify(source)) as Record<string, unknown>;
        } catch {
            return { ...source };
        }
    }

    private readNumber(
        params: Record<string, unknown>,
        keys: string[]
    ): number | undefined {
        for (const key of keys) {
            const value = params[key];
            if (typeof value === 'number' && Number.isFinite(value)) {
                return value;
            }
            if (typeof value === 'string') {
                const parsed = Number(value);
                if (Number.isFinite(parsed)) {
                    return parsed;
                }
            }
        }
        return undefined;
    }

    private readBoolean(
        params: Record<string, unknown>,
        keys: string[]
    ): boolean | undefined {
        for (const key of keys) {
            const value = params[key];
            if (typeof value === 'boolean') {
                return value;
            }
            if (typeof value === 'string') {
                const lowered = value.trim().toLowerCase();
                if (lowered === 'true') return true;
                if (lowered === 'false') return false;
            }
        }
        return undefined;
    }

    private readString(
        params: Record<string, unknown>,
        keys: string[]
    ): string | undefined {
        for (const key of keys) {
            const value = params[key];
            if (typeof value === 'string' && value.trim().length > 0) {
                return value.trim();
            }
        }
        return undefined;
    }

    private readCsv(
        params: Record<string, unknown>,
        keys: string[]
    ): string | undefined {
        for (const key of keys) {
            const value = params[key];
            if (Array.isArray(value)) {
                const normalized = value
                    .filter(item => typeof item === 'string')
                    .map(item => item.trim())
                    .filter(Boolean);
                if (normalized.length) {
                    return normalized.join(',');
                }
            }
            if (typeof value === 'string' && value.trim().length > 0) {
                return value.trim();
            }
        }
        return undefined;
    }

    private defaultAcceptedTypesCsv(): string {
        return [
            'application/pdf',
            'text/plain',
            'application/msword',
            'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
            'application/json',
            'text/markdown',
        ].join(',');
    }

    /**
     * Resolve artifact type from port
     */
    private resolveArtifactType(port: WorkflowPorts['inputs'][number]): ArtifactType | string {
        const portAny = port as { artifact_type?: string; artifactType?: string; type?: string };
        const explicitArtifact = portAny.artifact_type || portAny.artifactType;
        if (explicitArtifact) return explicitArtifact;

        const explicitType = portAny.type;
        if (explicitType && explicitType !== 'json' && explicitType !== 'any') {
            return explicitType;
        }

        const inferred = inferPortTypeFromReference(this.resolveDataReference(port) || port.id);
        return inferred || explicitType || ArtifactType.JSON;
    }

    /**
     * Resolve data reference from port
     */
    private resolveDataReference(port: WorkflowPorts['inputs'][number]): string | undefined {
        const portAny = port as { data_reference?: string; dataReference?: string };
        return portAny.data_reference || portAny.dataReference;
    }

    /**
     * Create default input handle if none found
     */
    private createDefaultInput(): ExposedHandle[] {
        return [{
            id: 'default-input',
            sourceNodeId: 'composite',
            sourcePortId: 'input',
            artifactType: ArtifactType.JSON,
            dataReference: 'input',
            label: 'Input',
            required: false,
            description: 'Default composite input',
        }];
    }

    /**
     * Create default output handle if none found
     */
    private createDefaultOutput(): ExposedHandle[] {
        return [{
            id: 'default-output',
            sourceNodeId: 'composite',
            sourcePortId: 'output',
            artifactType: ArtifactType.JSON,
            dataReference: 'output',
            label: 'Output',
            required: false,
            description: 'Default composite output',
        }];
    }

    /**
     * Sync a single workflow by ID
     */
    async syncWorkflowById(workflowId: string): Promise<boolean> {
        const workflows = this.getReusableWorkflows();
        const workflow = workflows.find(w => w.id === workflowId);
        
        if (!workflow) {
            console.warn(`Workflow ${workflowId} not found or not reusable`);
            return false;
        }

        try {
            const composite = this.convertWorkflowToComposite(workflow);
            
            // Check if already exists
            const existingComposites = this.templateStore.getComposites();
            const existing = existingComposites.find(c => 
                (c as CompositeWorkflow & { sourceWorkflowId?: string }).sourceWorkflowId === workflowId
            );

            if (existing) {
                this.templateStore.updateComposite({
                    id: existing.id,
                    changes: {
                        ...composite,
                        id: existing.id,
                    },
                });
            } else {
                this.templateStore.addComposite(composite);
            }

            return true;
        } catch (error) {
            console.error(`Failed to sync workflow ${workflowId}:`, error);
            return false;
        }
    }
}
