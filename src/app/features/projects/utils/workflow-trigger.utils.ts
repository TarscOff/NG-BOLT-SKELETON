import { WorkflowDraft } from '@features/workflows/data/workflows.store';
import { WorkflowNode } from '@features/workflows/templates/utils/workflow.interface';

/**
 * Types of triggers that can be present in a workflow
 */
export type WorkflowTriggerType = 'chat' | 'file_upload' | 'webhook' | 'manual';

/**
 * Detected triggers in a workflow with their configurations
 */
export interface WorkflowTriggers {
    hasChat: boolean;
    hasFileUpload: boolean;
    hasWebhook: boolean;
    hasManual: boolean;
    /** Combined UI mode based on triggers */
    uiMode: WorkflowUIMode;
    /** File upload config if trigger_file_upload is present */
    fileUploadConfig?: FileUploadConfig;
    /** All trigger types found */
    triggerTypes: WorkflowTriggerType[];
}

/**
 * UI mode to render based on workflow triggers
 */
export type WorkflowUIMode = 
    | 'chat'           // Only chat trigger
    | 'file-upload'    // Only file upload trigger
    | 'chat-with-file' // Both chat and file upload
    | 'results-only'   // Webhook or manual (no input UI)
    | 'none';          // No triggers found

/**
 * Configuration extracted from file upload trigger node
 */
export interface FileUploadConfig {
    /** Accepted MIME types */
    acceptedTypes: string[];
    /** Max file size in bytes */
    maxFileSize?: number;
    /** Max number of files */
    maxFiles?: number;
    /** Whether multiple files are allowed */
    multiple?: boolean;
}

/**
 * Trigger node type mapping
 */
const TRIGGER_TYPE_MAP: Record<string, WorkflowTriggerType> = {
    'trigger_chat': 'chat',
    'trigger-chat': 'chat',
    'trigger_file_upload': 'file_upload',
    'trigger-file-upload': 'file_upload',
    'trigger_webhook': 'webhook',
    'trigger-webhook': 'webhook',
    'trigger_manual': 'manual',
    'trigger-manual': 'manual',
};

/**
 * Check if a node type is a trigger
 */
export function isTriggerNode(nodeType: string): boolean {
    const normalized = nodeType.toLowerCase().replace(/[\s_]+/g, '-');
    return normalized.startsWith('trigger-') || nodeType.toLowerCase().startsWith('trigger_');
}

/**
 * Get the trigger type from a node type string
 */
export function getTriggerType(nodeType: string): WorkflowTriggerType | null {
    const normalized = nodeType.toLowerCase().replace(/[\s]+/g, '_');
    return TRIGGER_TYPE_MAP[normalized] ?? TRIGGER_TYPE_MAP[nodeType] ?? null;
}

/**
 * Extract file upload configuration from a trigger_file_upload node
 */
export function extractFileUploadConfig(node: WorkflowNode): FileUploadConfig {
    const params = (node.data?.params ?? {}) as Record<string, unknown>;
    
    // Extract accepted types from node configuration
    let acceptedTypes: string[] = [];
    if (Array.isArray(params['accepted_types'])) {
        acceptedTypes = params['accepted_types'] as string[];
    } else if (typeof params['accepted_types'] === 'string') {
        acceptedTypes = (params['accepted_types'] as string).split(',').map(t => t.trim());
    } else {
        // Default accepted types
        acceptedTypes = [
            'application/pdf',
            'text/plain',
            'application/msword',
            'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
            'text/csv',
            'application/json',
        ];
    }
    
    return {
        acceptedTypes,
        maxFileSize: typeof params['max_file_size'] === 'number' 
            ? params['max_file_size'] 
            : 10 * 1024 * 1024, // Default 10MB
        maxFiles: typeof params['max_files'] === 'number' 
            ? params['max_files'] 
            : 1,
        multiple: params['multiple'] === true,
    };
}

/**
 * Detect all triggers present in a workflow and determine the UI mode
 */
export function detectWorkflowTriggers(workflow: WorkflowDraft): WorkflowTriggers {
    const nodes = workflow.nodes ?? [];
    const triggerNodes = nodes.filter(n => isTriggerNode(n.type));
    
    const triggers: WorkflowTriggers = {
        hasChat: false,
        hasFileUpload: false,
        hasWebhook: false,
        hasManual: false,
        uiMode: 'none',
        triggerTypes: [],
    };
    
    for (const node of triggerNodes) {
        const triggerType = getTriggerType(node.type);
        if (!triggerType) continue;
        
        if (!triggers.triggerTypes.includes(triggerType)) {
            triggers.triggerTypes.push(triggerType);
        }
        
        switch (triggerType) {
            case 'chat':
                triggers.hasChat = true;
                break;
            case 'file_upload':
                triggers.hasFileUpload = true;
                triggers.fileUploadConfig = extractFileUploadConfig(node);
                break;
            case 'webhook':
                triggers.hasWebhook = true;
                break;
            case 'manual':
                triggers.hasManual = true;
                break;
        }
    }
    
    // Determine UI mode based on triggers
    triggers.uiMode = determineUIMode(triggers);
    
    return triggers;
}

/**
 * Determine the UI mode based on detected triggers
 */
function determineUIMode(triggers: WorkflowTriggers): WorkflowUIMode {
    const { hasChat, hasFileUpload, hasWebhook, hasManual } = triggers;
    
    // Both chat and file upload
    if (hasChat && hasFileUpload) {
        return 'chat-with-file';
    }
    
    // Only chat
    if (hasChat) {
        return 'chat';
    }
    
    // Only file upload
    if (hasFileUpload) {
        return 'file-upload';
    }
    
    // Webhook or manual - results only
    if (hasWebhook || hasManual) {
        return 'results-only';
    }
    
    return 'none';
}

/**
 * Get a human-readable description of the UI mode
 */
export function getUIModeDescription(mode: WorkflowUIMode): string {
    switch (mode) {
        case 'chat':
            return 'Chat interface for conversational interactions';
        case 'file-upload':
            return 'File upload interface for document processing';
        case 'chat-with-file':
            return 'Chat interface with file upload capabilities';
        case 'results-only':
            return 'View execution results (triggered externally)';
        case 'none':
            return 'No interactive triggers configured';
    }
}
