/**
 * 3-Tier Workflow System Interfaces
 * 
 * This file defines the core interfaces for the hierarchical workflow system:
 * - Tier 1: Micro Workflows (atomic tasks corresponding to backend workers)
 * - Tier 2: Composite Workflows (combinations of micro workflows)
 * - Tier 3: Template Workflows (complete user applications with UI)
 */

import { WorkflowNode, WorkflowEdge } from '../utils/workflow.interface';

// Re-export from shared types for backward compatibility
export { WorkflowStatus } from '@shared/types/workflow.types';
export type { 
    DataScope, 
    PortDataScopeConfig, 
    TemplateAssignment 
} from '@shared/types/workflow.types';

// Import for internal use
import { WorkflowStatus, DataScope } from '@shared/types/workflow.types';

// ============================================================================
// STATUS & ENUMS
// ============================================================================

export enum ArtifactType {
    STRING = 'string',
    JSON = 'json',
    FILE = 'file',
    COLLECTION = 'collection',
    LIST_FLOAT = 'list[float]',
    LANGCHAIN_DOCUMENTS = 'langchain_documents',
    EMBEDDED_LANGCHAIN_DOCUMENTS = 'embedded_langchain_documents',
    CHAT_HISTORY = 'chat_history',
    USER_PROMPT = 'user_prompt',
    LLM_RESPONSE = 'llm_response',
    EMBEDDINGS = 'embeddings',
    CONTEXT = 'context'
}

export type WorkerType = 
    | 'worker-file-manipulation'
    | 'worker-llm'
    | 'worker-vectordb'
    | 'worker-embedding'
    | 'worker-chat'
    | string;

// ============================================================================
// COMMON INTERFACES
// ============================================================================

export interface WorkflowMetadata {
    createdAt: string;
    updatedAt: string;
    createdBy?: string;
    updatedBy?: string;
    version: number;
    tags?: string[];
}

export interface WorkflowHandle {
    id: string;
    artifactType: ArtifactType | string;
    dataReference: string;
    label?: string;
    required: boolean;
    description?: string;
}

export interface ExposedHandle extends WorkflowHandle {
    /** Original node ID this handle comes from */
    sourceNodeId: string;
    /** Original port ID on the source node */
    sourcePortId: string;
    /** Custom label for the exposed handle */
    customLabel?: string;
}

// ============================================================================
// TIER 1: MICRO WORKFLOWS
// ============================================================================

export interface MicroWorkflowConfig {
    /** Backend task identifier */
    task: string;
    /** Worker type for execution */
    worker: WorkerType;
    /** Configuration parameters for the task */
    parameters?: Record<string, unknown>;
    /** Retry configuration */
    retry?: {
        maxAttempts: number;
        backoffMs: number;
    };
}

export interface MicroWorkflow {
    id: string;
    name: string;
    description: string;
    status: WorkflowStatus;
    /** Backend worker type */
    worker: WorkerType;
    /** Backend task identifier */
    task: string;
    /** Input handles */
    inputHandles: WorkflowHandle[];
    /** Output handles */
    outputHandles: WorkflowHandle[];
    /** Internal workflow nodes */
    nodes: WorkflowNode[];
    /** Internal workflow edges */
    edges: WorkflowEdge[];
    /** Configuration */
    configuration: MicroWorkflowConfig;
    /** Metadata */
    metadata: WorkflowMetadata;
}

// ============================================================================
// TIER 2: COMPOSITE WORKFLOWS
// ============================================================================

export interface CompositeWorkflowNode {
    id: string;
    /** Reference to a Micro Workflow */
    microWorkflowId: string;
    /** Display label */
    label: string;
    /** Position in canvas */
    position: { x: number; y: number };
    /** Node-specific configuration overrides */
    configuration?: Record<string, unknown>;
}

export interface CompositeWorkflowEdge {
    id: string;
    source: string; // CompositeWorkflowNode ID
    sourcePort: string;
    target: string; // CompositeWorkflowNode ID
    targetPort: string;
}

export interface CompositeWorkflowConfig {
    /** Default parameter values */
    defaultParameters?: Record<string, unknown>;
    /** Execution timeout in ms */
    timeoutMs?: number;
    /** Error handling strategy */
    errorHandling?: 'fail-fast' | 'continue' | 'retry';
}

export interface CompositeWorkflow {
    id: string;
    name: string;
    description: string;
    status: WorkflowStatus;
    /** Nodes referencing Micro Workflows */
    nodes: CompositeWorkflowNode[];
    /** Edges connecting nodes */
    edges: CompositeWorkflowEdge[];
    /** Exposed input handles for top level */
    exposedInputs: ExposedHandle[];
    /** Exposed output handles for top level */
    exposedOutputs: ExposedHandle[];
    /** Configuration */
    configuration: CompositeWorkflowConfig;
    /** Metadata */
    metadata: WorkflowMetadata;
}

// ============================================================================
// TIER 3: TEMPLATE WORKFLOWS
// ============================================================================

export type TemplatePresentationPattern = 
    | 'standalone-single'   // Single composite as full page
    | 'standalone-tabs'     // Multiple composites as separate tabs
    | 'linked-integrated';  // Connected composites on same page

export type TemplateLayoutType = 
    | 'standalone-single'
    | 'standalone-tabs'
    | 'linked-horizontal'
    | 'linked-vertical'
    | 'chat-with-files'
    | 'comparison-view'
    | 'dashboard'
    | 'custom';

export type UIComponentType = 
    | 'chat'
    | 'compare'
    | 'extract'
    | 'summarize'
    | 'file-uploader'
    | 'file-upload'
    | 'result-viewer'
    | 'result-view'
    | 'markdown'
    | 'left-panel'
    | 'tab-container'
    | 'workflow-connector'
    | 'text-input'
    | 'document-list'
    | 'comparison-panel'
    | 'custom';

export interface DataTransformation {
    type: 'map' | 'filter' | 'format' | 'custom';
    config: Record<string, unknown>;
}

export interface WorkflowBinding {
    /** UI component property to bind */
    componentProperty: string;
    /** Workflow output/input path (format: nodeId:portId) */
    workflowPath: string;
    /** Data transformation if needed */
    transformation?: DataTransformation;
    /** Connection type */
    connectionType?: 'standalone' | 'linked';
}

export interface UIComponentConfig {
    id: string;
    type: UIComponentType;
    label?: string;
    /** Position in layout */
    position?: {
        row?: number;
        column?: number;
        width?: number;
        height?: number;
    };
    /** Data bindings to workflow ports */
    bindings: WorkflowBinding[];
    /** Component-specific configuration */
    config?: Record<string, unknown>;
    /** Visibility conditions */
    visibleWhen?: {
        port: string;
        operator: 'exists' | 'equals' | 'notEmpty';
        value?: unknown;
    };
}

export interface TabConfiguration {
    defaultTab: string;
    tabOrder: string[];
    allowTabSwitching: boolean;
    tabLabels?: Record<string, string>;
}

export interface ConnectionConfiguration {
    showDataFlow: boolean;
    animateConnections: boolean;
    connectionStyle: 'arrows' | 'lines' | 'pipes';
}

export interface TemplateStyles {
    theme?: 'light' | 'dark' | 'auto';
    primaryColor?: string;
    customCss?: string;
}

export interface UITemplateConfig {
    layout: TemplateLayoutType;
    components: UIComponentConfig[];
    styling?: TemplateStyles;
    tabConfiguration?: TabConfiguration;
    connectionConfiguration?: ConnectionConfiguration;
}

export interface TemplateWorkflowNode {
    id: string;
    /** Reference to a Composite Workflow */
    compositeWorkflowId: string;
    /** Display label */
    label: string;
    /** Position in canvas */
    position: { x: number; y: number };
    /** Node-specific configuration overrides */
    configuration?: Record<string, unknown>;
}

export interface TemplateWorkflowEdge {
    id: string;
    source: string; // TemplateWorkflowNode ID
    sourcePort: string;
    target: string; // TemplateWorkflowNode ID
    targetPort: string;
}

export interface WorkflowPermissions {
    /** User/role IDs that can view */
    viewers: string[];
    /** User/role IDs that can execute */
    executors: string[];
    /** User/role IDs that can edit */
    editors: string[];
}

export interface TemplateWorkflow {
    id: string;
    name: string;
    description: string;
    status: WorkflowStatus;
    /** Presentation pattern */
    presentationPattern: TemplatePresentationPattern;
    /** Nodes referencing Composite Workflows */
    compositeWorkflows: TemplateWorkflowNode[];
    /** Edges connecting composites (for linked patterns) */
    edges: TemplateWorkflowEdge[];
    /** UI template configuration */
    uiTemplate: UITemplateConfig;
    /** Data flow configuration - defines scope for each data port */
    dataFlowConfig: TemplateDataFlowConfig;
    /** Access permissions */
    permissions: WorkflowPermissions;
    /** Metadata */
    metadata: WorkflowMetadata;
    /** Context nodes (session/project) and their stored data */
    contextNodes?: {
        id: string;
        type: 'session-context' | 'project-context';
        x: number;
        y: number;
        data: {
            label: string;
            icon: string;
            contextType: 'session' | 'project';
            storedItems?: unknown[];
        };
    }[];
}

// ============================================================================
// DATA FLOW & SCOPE CONFIGURATION
// ============================================================================

/**
 * Defines the data scope for a specific port in the template
 * Session = ephemeral, only for current execution
 * Project = persisted, can be shared across sessions and projects
 */
export interface DataPortScopeConfig {
    /** Full port path: compositeNodeId:portId */
    portPath: string;
    /** Human-readable label */
    label: string;
    /** Data type for visualization */
    dataType: ArtifactType | string;
    /** Where the data lives */
    scope: DataScope;
    /** For project scope: collection/storage name */
    storageName?: string;
    /** Can this data be shared to other projects? */
    shareable: boolean;
    /** Visual color for data flow diagram */
    color?: string;
    /** Description of what this data is */
    description?: string;
}

/**
 * Configuration for all data flow in a template
 */
export interface TemplateDataFlowConfig {
    /** Input ports scope configuration */
    inputs: DataPortScopeConfig[];
    /** Output ports scope configuration */
    outputs: DataPortScopeConfig[];
    /** Intermediate data between composites */
    intermediates: DataPortScopeConfig[];
    /** Default scope for new ports */
    defaultScope: DataScope;
    /** Whether to show data flow visualization in UI */
    showDataFlowVisualization: boolean;
}

// ============================================================================
// PROJECT TEMPLATE ASSIGNMENT
// ============================================================================

// NOTE: DataScope, PortDataScopeConfig, and TemplateAssignment are now 
// imported and re-exported from @shared/types/workflow.types at the top of this file.
// This maintains backward compatibility for existing imports.

// ============================================================================
// EXECUTION CONTEXT
// ============================================================================

export interface TemplateExecutionContext {
    /** Project ID */
    projectId: string;
    /** Session ID */
    sessionId: string;
    /** Template assignment ID */
    assignmentId: string;
    /** User ID */
    userId: string;
    /** Current input values by port ID */
    inputs: Record<string, unknown>;
    /** Current output values by port ID */
    outputs: Record<string, unknown>;
}

export interface TemplateExecutionSession {
    id: string;
    assignmentId: string;
    projectId: string;
    name: string;
    status: 'idle' | 'running' | 'completed' | 'error';
    context: TemplateExecutionContext;
    createdAt: string;
    updatedAt: string;
    createdBy?: string;
}

// ============================================================================
// HELPER TYPES
// ============================================================================

export interface PortConnection {
    sourceNodeId: string;
    sourcePortId: string;
    targetNodeId: string;
    targetPortId: string;
}

export interface WorkflowHierarchy {
    template: TemplateWorkflow;
    composites: CompositeWorkflow[];
    micros: MicroWorkflow[];
}

/** Lightweight template info for selection dialogs */
export interface TemplateWorkflowSummary {
    id: string;
    name: string;
    description: string;
    status: WorkflowStatus;
    presentationPattern: TemplatePresentationPattern;
    layout: TemplateLayoutType;
    componentTypes: UIComponentType[];
    updatedAt: string;
}
