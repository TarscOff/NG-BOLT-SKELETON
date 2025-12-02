import { DfDataInitialNode } from "@ng-draw-flow/core";

export interface ActionDefinition {
  type: string;
  params?: Record<string, unknown>;
}
export type FileRef = string;
export type RuntimeFile = File | Blob;
export type PersistableFile = FileRef | RuntimeFile;
export interface NodeData {
  label: string;
}
export type PortType = 'json' | string;
export interface WorkflowPort {
  id: string;
  label: string;
  type?: PortType;
}
export interface WorkflowPorts {
  inputs: WorkflowPort[];
  outputs: WorkflowPort[];
}
export type InspectorActionType = string;
export type PaletteType = 'input' | 'result' | InspectorActionType;
export interface ActionDefinitionLite {
  type: PaletteType;
  params?: {
    icon: string;
    [K: string]: unknown
  };
}
export interface WorkflowNodeDataBaseParams {
  icon?: string;
  ui?: { expanded?: boolean }
  __missingIn?: boolean;
  __missingOut?: boolean;
  [k: string]: unknown;
}
export interface WorkflowNode {
  id: string;
  type: PaletteType;
  x?: number;
  y?: number;
  data: RunNodeDTO;
  ports: WorkflowPorts;
}
export interface WorkflowEdge {
  id: string;
  source: string;
  target: string;
  sourcePort: string;
  targetPort: string;
  label: string;
}
export interface DfDataInitialNodeData extends DfDataInitialNode {
  __missingIn: boolean;
  __missingOut: boolean;
}

export type Status = 'queued' | 'running' | 'success' | 'error' | 'skipped';

export interface PipelineWorkflowDTO {
  name: string;
  nodes: { id: string; type: string; data?: RunNodeDTO }[];
  edges: { id: string; source: string; target: string }[];
  meta?: { createdAt: string, version: string; filesByNode: Record<string, Record<string, Binary | Binary[]>> };
}

export interface StageNode {
  id: string;
  label: string;
  type: string;
}


/** ===== Helpers & constants ===== */
export const EXEC_TYPES = new Set<PaletteType>([
  'input', 'result',
]);

// ---- Types ----
export type Primitive = string | number | boolean | null;
export type WithParams<P> = Omit<RunNodeDTO, 'params'> & { params?: P };

// Binary things we want to strip/cache
export type Binary = File | Blob;

// What params may contain: plain values, objects/arrays, binaries or arrays of binaries
export type WithFiles =
  | Primitive
  | Binary
  | Binary[]
  | { [k: string]: WithFiles }
  | WithFiles[];

// Placeholders used in sanitized output
export interface FilePlaceholder { __file: true; name: string; size: number; type: string };
export interface BlobPlaceholder { __blob: true; size: number; type: string };
export type BinaryPlaceholder =
  | { __file: true; name: string; size: number; type: string }
  | { __blob: true; size: number; type: string };
// Recursively replace File/Blob/(File[]) with placeholders
export type ReplaceBinary<T> =
  T extends File ? FilePlaceholder :
  T extends Blob ? BlobPlaceholder :
  T extends (infer U)[] ? ReplaceBinary<U>[] :
  T extends object ? { [K in keyof T]: ReplaceBinary<T[K]> } :
  T;

export type Sanitized<T> =
  ReplaceBinary<NonNullable<T>> |
  (undefined extends T ? undefined : never);

// Make the event type allow undefined for params
export interface NodeParamsChangedEvent<T extends WithFiles | undefined = WithFiles | undefined> {
  nodeId: string;
  params: T;
};

export interface SimCtx {
  running: boolean;
  indeg: Map<string, number>;
  ready: string[];
  timers: Map<string, number>;
  cancelled: Set<string>;
  pipelineCancelled: boolean;
};

export interface RunEntry {
  id: string;
  startedAt: number;
  workflow: PipelineWorkflowDTO;
  state: Record<string, Status>;
};


export const RESERVED_KEYS = ['icon','ui', '__missingIn', '__missingOut'] as const;
export type ReservedKeys = typeof RESERVED_KEYS[number];

export type StripReservedShallow<T> =
  T extends object
  ? { [K in keyof T as K extends ReservedKeys ? never : K]: T[K] }
  : T;

export const isObject = (v: unknown): v is Record<string, unknown> =>
  typeof v === 'object' && v !== null;

export const hasProp = <K extends string>(
  o: unknown,
  k: K
): o is Record<K, unknown> => isObject(o) && k in o;


export interface LogEntry { at: string; level: 'info' | 'warn' | 'error'; message: string };
export interface ArtifactEntry  {
    name: string;
    href?: string;
}
export interface RunNodeDTO {
  id?: string;
  result?: Record<string, unknown>; // TODO . Get back here when Backend is ready
  error?: Record<string, unknown>; // TODO . Get back here when Backend is ready
  logs?: LogEntry[];
  artifacts?: ArtifactEntry[];
  status?: Status;
  params?: WorkflowNodeDataBaseParams;
  label?: string;
  type?: PaletteType;
  aiType?: InspectorActionType;
  ports?: WorkflowPorts;
  preferredTab?:PreferredTab;
  [k: string]: unknown;
}

export type PreferredTab = 'auto' | 'params' | 'results' | 'error' | 'logs' | 'artifacts';

