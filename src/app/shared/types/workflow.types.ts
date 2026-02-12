/**
 * Shared Workflow Types
 *
 * This file is the SINGLE SOURCE OF TRUTH for all workflow-related types
 * used across the application. Any duplicates in other files should import
 * from here to ensure consistency.
 *
 * BACKEND INTEGRATION:
 * When connecting to the backend, these types should match the API contracts.
 * Update this file to reflect any API changes, and all consumers will automatically
 * receive the updated types.
 */

import { DateTime } from 'luxon';

// ============================================================================
// WORKFLOW STATUS & VISIBILITY
// ============================================================================

/**
 * Unified workflow status enum - REPLACES 'visibility' string union
 *
 * Migration note:
 * - 'draft' → WorkflowStatus.DRAFT
 * - 'public' → WorkflowStatus.PUBLISHED
 *
 * @backend Maps to: workflow.status field in API
 */
export enum WorkflowStatus {
    /** Work in progress, not visible to others */
    DRAFT = 'draft',
    /** Published and visible, can be used in projects */
    PUBLISHED = 'published',
    /** Was published, now hidden but preserved */
    UNPUBLISHED = 'unpublished',
    /** Archived, read-only */
    ARCHIVED = 'archived',
}

/**
 * Legacy visibility type - DEPRECATED
 * Use WorkflowStatus enum instead
 * @deprecated Use WorkflowStatus enum
 */
export type WorkflowVisibility = 'draft' | 'public';

/**
 * Convert legacy visibility to WorkflowStatus
 */
export function visibilityToStatus(visibility: WorkflowVisibility): WorkflowStatus {
    return visibility === 'public' ? WorkflowStatus.PUBLISHED : WorkflowStatus.DRAFT;
}

/**
 * Convert WorkflowStatus to legacy visibility
 * @deprecated Only for backward compatibility
 */
export function statusToVisibility(status: WorkflowStatus): WorkflowVisibility {
    return status === WorkflowStatus.PUBLISHED ? 'public' : 'draft';
}

// ============================================================================
// DATA SCOPE - UNIFIED TYPE
// ============================================================================

/**
 * Defines where data is stored/accessible
 *
 * @backend Maps to: assignment.data_scope or port.scope in API
 */
export type DataScope = 'project' | 'session' | 'both';

/**
 * @deprecated Use DataScope instead
 */
export type TemplateDataScope = DataScope;

/**
 * @deprecated Use DataScope instead
 */
export type WorkflowOutputScope = DataScope;

// ============================================================================
// PORT DATA SCOPE CONFIGURATION
// ============================================================================

/**
 * Configuration for how a specific port's data should be scoped
 *
 * @backend Maps to: assignment.port_scopes[] in API
 */
export interface PortDataScopeConfig {
    /** Port identifier (format: compositeId:portId or just portId) */
    portId: string;
    /** Where to store/access the data */
    scope: DataScope;
    /** Collection name for project-scoped data (e.g., vectordb collection) */
    collectionName?: string;
    /** Custom display label for the data */
    customLabel?: string;
}

// ============================================================================
// ASSIGNMENT INTERFACES (BASE)
// ============================================================================

/**
 * Base interface for any workflow assignment to a project
 *
 * @backend Maps to: /api/projects/{projectId}/assignments
 */
export interface BaseAssignment {
    /** Unique assignment ID */
    id: string;
    /** Project this is assigned to */
    projectId: string;
    /** Whether the assignment is active */
    enabled: boolean;
    /** When the assignment was created */
    assignedAt: string;
    /** User who created the assignment */
    assignedBy?: string;
    /** Last update timestamp */
    updatedAt?: string;
}

/**
 * Template workflow assignment
 *
 * @backend Maps to: /api/projects/{projectId}/template-assignments
 */
export interface TemplateAssignment extends BaseAssignment {
    /** Template Workflow ID (Tier 3) */
    templateId: string;
    /** Template name (cached for display) */
    templateName: string;
    /** Data scope configuration for each output port */
    portDataScopes: PortDataScopeConfig[];
    /** Custom configuration overrides */
    configuration?: Record<string, unknown>;
}

/**
 * Legacy workflow assignment
 *
 * @backend Maps to: /api/projects/{projectId}/workflow-assignments
 */
export interface WorkflowAssignment extends BaseAssignment {
    /** Workflow ID */
    workflowId: string;
    /** Workflow name (cached) */
    workflowName: string;
    /** Workflow description (cached) */
    workflowDescription?: string;
    /** Output scope for this assignment */
    outputScope: DataScope;
}

// ============================================================================
// EXECUTION SESSION INTERFACES
// ============================================================================

/**
 * Session status for execution tracking
 */
export type ExecutionSessionStatus = 'idle' | 'running' | 'completed' | 'error';

/**
 * Execution context - holds the runtime state
 *
 * @backend Maps to: /api/sessions/{sessionId}/context
 */
export interface ExecutionContext {
    /** Project ID */
    projectId: string;
    /** Session ID */
    sessionId: string;
    /** Assignment ID (template or workflow) */
    assignmentId: string;
    /** User ID */
    userId: string;
    /** Current input values by port ID */
    inputs: Record<string, unknown>;
    /** Current output values by port ID */
    outputs: Record<string, unknown>;
}

/**
 * Execution session - a running or completed execution instance
 *
 * @backend Maps to: /api/sessions/{sessionId}
 */
export interface ExecutionSession {
    /** Unique session ID */
    id: string;
    /** Assignment this session belongs to */
    assignmentId: string;
    /** Display name */
    name: string;
    /** Current status */
    status: ExecutionSessionStatus;
    /** Runtime context */
    context: ExecutionContext;
    /** Creation timestamp */
    createdAt: string;
    /** Last update timestamp */
    updatedAt: string;
}

// ============================================================================
// API RESPONSE WRAPPERS
// ============================================================================

/**
 * Standard API response wrapper for lists
 *
 * @backend All list endpoints should return this format
 */
export interface ApiListResponse<T> {
    items: T[];
    total: number;
    page?: number;
    pageSize?: number;
    hasMore?: boolean;
}

/**
 * Standard API response wrapper for single items
 *
 * @backend All single-item endpoints should return this format
 */
export interface ApiResponse<T> {
    data: T;
    success: boolean;
    message?: string;
    errors?: Record<string, string[]>;
}

// ============================================================================
// WORKFLOW METADATA
// ============================================================================

/**
 * Common metadata for all workflow types
 *
 * @backend Maps to: workflow.metadata in API
 */
export interface WorkflowMetadata {
    createdAt: string;
    updatedAt: string;
    createdBy?: string;
    updatedBy?: string;
    version: number;
    tags?: string[];
}

// ============================================================================
// ARTIFACT TYPES
// ============================================================================

/**
 * Types of data that can flow between workflow nodes
 *
 * @backend Maps to: port.artifact_type in API
 */
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
    CONTEXT = 'context',
}

// ============================================================================
// WORKER TYPES
// ============================================================================

/**
 * Backend worker types for micro workflows
 *
 * @backend Maps to: worker.type in API
 */
export type WorkerType =
    | 'worker-file-manipulation'
    | 'worker-llm'
    | 'worker-vectordb'
    | 'worker-embedding'
    | 'worker-chat'
    | string;

// ============================================================================
// UI COMPONENT TYPES
// ============================================================================

/**
 * Types of UI components that can be rendered in templates
 */
export type UIComponentType =
    | 'chat'
    | 'file-uploader'
    | 'result-viewer'
    | 'text-input'
    | 'document-list'
    | 'comparison-panel'
    | 'data-table'
    | 'chart'
    | 'custom';

/**
 * Layout types for template rendering
 */
export type TemplateLayoutType =
    | 'chat-with-files'
    | 'standalone-single'
    | 'standalone-tabs'
    | 'comparison-view'
    | 'dashboard'
    | 'custom';

// ============================================================================
// HELPER FUNCTIONS FOR DATETIME HANDLING
// ============================================================================

/**
 * Convert ISO string to DateTime (for hydrating from localStorage/API)
 */
export function toDateTime(value: string | DateTime | undefined): DateTime | undefined {
    if (!value) return undefined;
    if (typeof value === 'string') {
        return DateTime.fromISO(value);
    }
    return value;
}

/**
 * Convert DateTime to ISO string (for serializing to localStorage/API)
 */
export function toISOString(value: DateTime | string | undefined): string | undefined {
    if (!value) return undefined;
    if (typeof value === 'string') return value;
    return value.toISO() ?? undefined;
}

/**
 * Hydrate date fields in an object from ISO strings to DateTime
 */
export function hydrateDates<T extends Record<string, unknown>>(
    obj: T,
    dateFields: (keyof T)[]
): T {
    const result = { ...obj };
    for (const field of dateFields) {
        const value = result[field];
        if (typeof value === 'string') {
            (result as Record<string, unknown>)[field as string] = DateTime.fromISO(value);
        }
    }
    return result;
}

/**
 * Serialize date fields in an object from DateTime to ISO strings
 */
export function serializeDates<T extends Record<string, unknown>>(
    obj: T,
    dateFields: (keyof T)[]
): T {
    const result = { ...obj };
    for (const field of dateFields) {
        const value = result[field];
        if (value instanceof DateTime) {
            (result as Record<string, unknown>)[field as string] = value.toISO();
        }
    }
    return result;
}
