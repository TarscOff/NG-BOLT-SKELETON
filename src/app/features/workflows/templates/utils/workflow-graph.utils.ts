import { ActionDefinitionLite, PortsMap, PortsMapValue, WorkflowEdge, WorkflowNode, WorkflowPort, WorkflowPorts } from './workflow.interface';

/** ---------- Ports helpers (single source) ---------- */

const PORT_TYPE_BY_REFERENCE: Record<string, string> = {
  user_prompt: 'string',
  system_prompt: 'string',
  query_string: 'string',
  message: 'string',
  payload_text: 'string',
  filter_document_publication_datetime: 'string',
  llm_response: 'string',
  trigger: 'boolean',
  file: 'file',
  source_file: 'file',
  payload_file: 'file',
  files: 'file[]',
  collection: 'collection',
  collection_out: 'collection',
  embeddings: 'list[float]',
  chat_history: 'json',
  context: 'string',
  langchain_documents: 'langchain_documents',
  embedded_langchain_documents: 'embedded_langchain_documents',
};

function normalizeReferenceKey(value: string): string {
  return value.trim().toLowerCase().replace(/[^a-z0-9]+/g, '_');
}

export function inferPortTypeFromReference(reference: string | undefined): string | undefined {
  if (!reference) return undefined;
  const normalized = normalizeReferenceKey(reference);
  if (!normalized) return undefined;
  if (PORT_TYPE_BY_REFERENCE[normalized]) return PORT_TYPE_BY_REFERENCE[normalized];
  if (normalized.endsWith('_file') || normalized.startsWith('file_')) return 'file';
  if (normalized.includes('chat_history')) return 'json';
  return undefined;
}

export function portCountsFor(type: string): { inputs: number; outputs: number } {
  const t = (type ?? '').toString().toLowerCase().replace(/-/g, '_');
  if (t === 'composite') return { inputs: 1, outputs: 1 };
  if (t === 'run_panel' || t === 'details' || t === 'preview') return { inputs: 0, outputs: 0 };
  const triggers = new Set(['trigger_chat', 'trigger_file_upload', 'trigger_webhook', 'trigger_manual']);
  if (triggers.has(t)) return { inputs: 0, outputs: 1 };
  return { inputs: 1, outputs: 1 };
}

export function minEditCountsFor(type: string): { inputs: number; outputs: number } {
  const defaults = portCountsFor(type);
  return {
    inputs: defaults.inputs > 0 ? 1 : 0,
    outputs: defaults.outputs > 0 ? 1 : 0,
  };
}

export function defaultPortsFor(type: string): WorkflowPorts {
  const { inputs: inputCount, outputs: outputCount } = portCountsFor(type);
  return {
    inputs: Array.from({ length: inputCount }, (_, i) => ({
      id: `in-${i + 1}`,
      label: `in ${i + 1}`,
      type: 'json',
      required: false,
      readonly: false,
    })),
    outputs: Array.from({ length: outputCount }, (_, i) => ({
      id: `out-${i + 1}`,
      label: `out ${i + 1}`,
      type: 'json',
      required: false,
      readonly: false,
    })),
  };
}

function pickString(obj: unknown, keys: string[]): string | undefined {
  const rec = (obj && typeof obj === 'object') ? (obj as Record<string, unknown>) : {};
  for (const k of keys) {
    const val = rec[k];
    if (typeof val === 'string') return val;
  }
  return undefined;
}

function asMapObj(
  v: PortsMapValue | undefined
): { required?: boolean; readonly?: boolean } | undefined {
  if (!v || v === true) return undefined;
  return v;
}

export function applyPortsMapToPorts(ports: WorkflowPorts, portsMap?: PortsMap): WorkflowPorts {
  if (!portsMap) return ports;

  const patch = (p: WorkflowPort): WorkflowPort => {
    const key = p.id ?? p.data_reference;
    const raw = key ? portsMap[key] : undefined;
    const m = asMapObj(raw);

    return {
      ...p,
      required: p.required ?? m?.required,
      readonly: p.readonly ?? m?.readonly,
    };
  };

  return {
    inputs: (ports.inputs ?? []).map(patch),
    outputs: (ports.outputs ?? []).map(patch),
  };
}

export function ensurePorts(
  type: string,
  ports?: WorkflowPorts,
  opts?: { padToMinimum?: boolean; minInputs?: number; minOutputs?: number; portsMap?: PortsMap }
): WorkflowPorts {
  const base = ports ?? defaultPortsFor(type);
  const defaults = portCountsFor(type);
  const minInputs = opts?.minInputs ?? defaults.inputs;
  const minOutputs = opts?.minOutputs ?? defaults.outputs;

  const norm = (p: WorkflowPort, idx: number, prefix: 'in' | 'out'): WorkflowPort => {
    const dataRef = pickString(p, ['data_reference', 'dataReference']);
    const artifact = pickString(p, ['artifact_type', 'artifactType']);
    const explicitType = typeof p.type === 'string' ? p.type : undefined;
    const inferredType = inferPortTypeFromReference(dataRef ?? p.id ?? p.label);
    const resolvedType = artifact
      ?? ((explicitType && explicitType !== 'json' && explicitType !== 'any') ? explicitType : undefined)
      ?? inferredType
      ?? explicitType
      ?? 'json';

    const normalized: WorkflowPort = {
      ...p,
      id: p.id ?? `${prefix}-${idx + 1}`,
      label: dataRef ?? p.label ?? `${prefix} ${idx + 1}`,
      type: resolvedType,
      required: p.required,
      readonly: p.readonly,
    };

    if (dataRef) normalized.data_reference = dataRef;
    if (artifact) {
      normalized.artifact_type = artifact;
    } else if (inferredType) {
      normalized.artifact_type = inferredType;
    }
    return normalized;
  };

  let inputs = (base.inputs ?? []).map((p, i) => norm(p, i, 'in'));
  let outputs = (base.outputs ?? []).map((p, i) => norm(p, i, 'out'));

  // Apply ports_map AFTER normalization so ids exist
  ({ inputs, outputs } = applyPortsMapToPorts({ inputs, outputs }, opts?.portsMap));

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
      inputs.push({ id, label: `in ${inputs.length + 1}`, type: 'json', required: true, readonly: false });
    }

    const existingOut = new Set(outputs.map(p => p.id));
    while (outputs.length < minOutputs) {
      const id = ensureUnique('out', existingOut);
      existingOut.add(id);
      outputs.push({ id, label: `out ${outputs.length + 1}`, type: 'json', required: false, readonly: false });
    }
  }

  return { inputs, outputs };
}

export function portsFromHandles(node: WorkflowNode): WorkflowPorts | null {
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

  const toPort = (handle: unknown, idx: number, prefix: 'in' | 'out'): WorkflowPort => {
    const rec = (handle && typeof handle === 'object') ? (handle as Record<string, unknown>) : {};
    const dataRef = pickString(rec, ['data_reference', 'dataReference']);
    const artifact = pickString(rec, ['artifact_type', 'artifactType']);
    const id = (typeof rec['id'] === 'string' ? (rec['id'] as string) : `${prefix}-${idx + 1}`);
    const label = (dataRef ?? (typeof rec['label'] === 'string' ? (rec['label'] as string) : undefined) ?? `${prefix} ${idx + 1}`);
    const explicitType = typeof rec['type'] === 'string' ? (rec['type'] as string) : undefined;
    const inferredType = inferPortTypeFromReference(dataRef ?? id ?? label);
    const type = artifact
      ?? ((explicitType && explicitType !== 'json' && explicitType !== 'any') ? explicitType : undefined)
      ?? inferredType
      ?? explicitType
      ?? 'json';
    const required = (typeof rec['required'] === 'boolean' ? (rec['required'] as boolean) : undefined);
    const readonly = (typeof rec['readonly'] === 'boolean' ? (rec['readonly'] as boolean) : undefined);

    const port: WorkflowPort = { id, label, type, required, readonly };
    if (dataRef) port.data_reference = dataRef;
    if (artifact) {
      port.artifact_type = artifact;
    } else if (inferredType) {
      port.artifact_type = inferredType;
    }
    return port;
  };

  return {
    inputs: (inputsRaw ?? []).map((h, i) => toPort(h, i, 'in')),
    outputs: (outputsRaw ?? []).map((h, i) => toPort(h, i, 'out')),
  };
}

/** ---------- Graph sanitize ---------- */

export function sanitizeGraph(nodesArg: WorkflowNode[] | null | undefined, edgesArg: WorkflowEdge[] | null | undefined) {
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

    // keep your rule: can't connect to nodes with no inputs
    if ((tgtPorts.inputs?.length ?? 0) === 0) return false;

    const srcOk = (srcPorts.outputs ?? []).some(p => p.id === e.sourcePort);
    const tgtOk = (tgtPorts.inputs ?? []).some(p => p.id === e.targetPort);
    return srcOk && tgtOk;
  });

  const uniq = new Map<string, WorkflowEdge>();
  for (const e of edges) uniq.set(e.id, e);

  return { nodes, edges: [...uniq.values()] };
}

/** ---------- Connectivity + Validation (shared) ---------- */

export interface NodeConnectivity {
  missingInputs: string[];
  missingOutputs: string[];
  missingIn: boolean;
  missingOut: boolean;
}

export function computeConnectivity(nodes: WorkflowNode[], edges: WorkflowEdge[]): Map<string, NodeConnectivity> {
  const inByPort = new Map<string, number>();
  const outByPort = new Map<string, number>();

  for (const e of edges) {
    inByPort.set(`${e.target}::${e.targetPort}`, (inByPort.get(`${e.target}::${e.targetPort}`) ?? 0) + 1);
    outByPort.set(`${e.source}::${e.sourcePort}`, (outByPort.get(`${e.source}::${e.sourcePort}`) ?? 0) + 1);
  }

  const out = new Map<string, NodeConnectivity>();
  for (const n of nodes) {
    const ports = ensurePorts(n.type, n.ports);
    const requiredInputs = (ports.inputs ?? []).filter(p => p.required === true);
    const requiredOutputs = (ports.outputs ?? []).filter(p => p.required === true);

    const missingInputs = requiredInputs
      .filter(p => (inByPort.get(`${n.id}::${p.id}`) ?? 0) === 0)
      .map(p => p.id);

    const missingOutputs = requiredOutputs
      .filter(p => (outByPort.get(`${n.id}::${p.id}`) ?? 0) === 0)
      .map(p => p.id);

    out.set(n.id, {
      missingInputs,
      missingOutputs,
      missingIn: missingInputs.length > 0,
      missingOut: missingOutputs.length > 0,
    });
  }

  return out;
}

export interface WorkflowValidationState {
  valid: boolean;
  nodeValidity: Record<string, boolean>;
}

export function computeValidation(
  nodesArg: WorkflowNode[] | null | undefined,
  edgesArg: WorkflowEdge[] | null | undefined,
  opts?: {
    includeNode?: (n: WorkflowNode) => boolean;
    formInvalidByNode?: Map<string, { invalid: boolean }> | Record<string, boolean>;
  }
): WorkflowValidationState {
  const nodes = (nodesArg ?? []).filter(n => (opts?.includeNode ? opts.includeNode(n) : true));
  const nodeIds = new Set(nodes.map(n => n.id));
  const edges = (edgesArg ?? []).filter(e => nodeIds.has(e.source) && nodeIds.has(e.target));

  const nodeValidity: Record<string, boolean> = {};
  if (nodes.length === 0) return { valid: true, nodeValidity };

  const connectivity = computeConnectivity(nodes, edges);

  // form invalid lookup
  const isFormInvalid = (id: string): boolean => {
    const src = opts?.formInvalidByNode;
    if (!src) return false;
    if (src instanceof Map) return !!src.get(id)?.invalid;
    return !!src[id];
  };

  let valid = true;
  for (const n of nodes) {
    const c = connectivity.get(n.id) ?? { missingIn: false, missingOut: false, missingInputs: [], missingOutputs: [] };
    const good = !c.missingIn && !c.missingOut && !isFormInvalid(n.id);
    nodeValidity[n.id] = good;
    valid = valid && good;
  }

  // cycle check (Kahn)
  const outMap = new Map<string, WorkflowEdge[]>();
  const indeg = new Map<string, number>();
  for (const n of nodes) { outMap.set(n.id, []); indeg.set(n.id, 0); }
  for (const e of edges) {
    outMap.get(e.source)!.push(e);
    indeg.set(e.target, (indeg.get(e.target) ?? 0) + 1);
  }
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

/** ---------- Catalog normalization (ports_map -> ports) ---------- */
export function normalizeCatalogAction(action: ActionDefinitionLite): ActionDefinitionLite {
  const p = action.params;
  const ports: WorkflowPorts | undefined = p?.ports;
  const portsMap = p?.ports_map;
  if (!ports && !portsMap) return action;

  const basePorts = ports ?? defaultPortsFor(action.type);
  const mergedPorts = ensurePorts(action.type, basePorts, { portsMap });
  return { ...action, params: { ...p, ports: mergedPorts, icon: p?.icon?? "" } };
}
