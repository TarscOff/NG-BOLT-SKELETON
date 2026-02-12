/**
 * Workflow API Service
 *
 * SINGLE SOURCE OF TRUTH for all backend API connections.
 * This service is the ONLY place that should make HTTP calls to workflow-related endpoints.
 *
 * BACKEND INTEGRATION GUIDE:
 * 1. When backend is ready, update the API_BASE_URL
 * 2. Remove mock implementations in each method
 * 3. Uncomment the actual HTTP calls
 * 4. All consumers will automatically use the real API
 *
 * Current State: Using localStorage/mock data (PoC mode)
 * Target State: Full HTTP integration with backend
 */

import { Injectable, inject } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';
import { Observable, of, throwError, delay, map, catchError } from 'rxjs';
import { DateTime } from 'luxon';

import {
    WorkflowStatus,
    PortDataScopeConfig,
    TemplateAssignment,
    ExecutionSession,
    ApiListResponse,
    ApiResponse,
    WorkflowMetadata,
} from '@shared/types/workflow.types';

// ============================================================================
// CONFIGURATION
// ============================================================================

/**
 * API Configuration
 * TODO: Move to environment.ts when backend is ready
 */
const API_CONFIG = {
    /** Base URL for workflow API - UPDATE THIS FOR BACKEND */
    baseUrl: '/api/v1',
    /** Enable mock mode (localStorage fallback) */
    mockEnabled: true,
    /** Simulated network delay for mocks (ms) */
    mockDelay: 200,
    /** LocalStorage keys */
    storageKeys: {
        workflows: 'workflows_v1',
        templateWorkflows: 'template_workflows_v1',
        templateAssignments: 'template_assignments_v1',
        workflowAssignments: 'workflow_assignments_v1',
        sessions: 'workflow_sessions_v1',
    },
};

// ============================================================================
// DTOs (Data Transfer Objects) - Match Backend Contracts
// ============================================================================

/** Workflow draft as stored/transmitted */
export interface WorkflowDto {
    id: string;
    name: string;
    description?: string;
    status: WorkflowStatus;
    nodes: unknown[];
    edges: unknown[];
    viewport?: { x: number; y: number; zoom: number };
    metadata: WorkflowMetadata;
    needsRepublish?: boolean;
}

/** Template workflow as stored/transmitted */
export interface TemplateWorkflowDto {
    id: string;
    name: string;
    description: string;
    status: WorkflowStatus;
    uiTemplate: {
        layout: string;
        components: unknown[];
    };
    compositeWorkflows: unknown[];
    permissions?: unknown;
    metadata: WorkflowMetadata;
}

/** Create/Update workflow request */
export interface SaveWorkflowRequest {
    name: string;
    description?: string;
    status: WorkflowStatus;
    nodes: unknown[];
    edges: unknown[];
    viewport?: { x: number; y: number; zoom: number };
}

/** Assign template request */
export interface AssignTemplateRequest {
    projectId: string;
    templateId: string;
    templateName: string;
    portDataScopes?: PortDataScopeConfig[];
    assignedBy?: string;
}

/** Create session request */
export interface CreateSessionRequest {
    assignmentId: string;
    projectId: string;
    name: string;
    userId?: string;
}

// ============================================================================
// SERVICE
// ============================================================================

@Injectable({
    providedIn: 'root',
})
export class WorkflowApiService {
    private readonly http = inject(HttpClient);
    private readonly baseUrl = API_CONFIG.baseUrl;
    private readonly mockEnabled = API_CONFIG.mockEnabled;
    private readonly mockDelay = API_CONFIG.mockDelay;

    // ========================================================================
    // WORKFLOWS (Tier 1/2 - Micro/Composite)
    // ========================================================================

    /**
     * Get all workflows for the current user
     * @backend GET /api/v1/workflows
     */
    getWorkflows(): Observable<WorkflowDto[]> {
        if (this.mockEnabled) {
            return this.mockGetWorkflows();
        }
        return this.http.get<ApiListResponse<WorkflowDto>>(`${this.baseUrl}/workflows`).pipe(
            map(response => response.items)
        );
    }

    /**
     * Get a single workflow by ID
     * @backend GET /api/v1/workflows/{id}
     */
    getWorkflow(id: string): Observable<WorkflowDto | null> {
        if (this.mockEnabled) {
            return this.mockGetWorkflow(id);
        }
        return this.http.get<ApiResponse<WorkflowDto>>(`${this.baseUrl}/workflows/${id}`).pipe(
            map(response => response.data),
            catchError(() => of(null))
        );
    }

    /**
     * Save a workflow (create or update)
     * @backend POST /api/v1/workflows (create) or PUT /api/v1/workflows/{id} (update)
     */
    saveWorkflow(workflow: WorkflowDto): Observable<WorkflowDto> {
        if (this.mockEnabled) {
            return this.mockSaveWorkflow(workflow);
        }
        if (workflow.id) {
            return this.http.put<ApiResponse<WorkflowDto>>(
                `${this.baseUrl}/workflows/${workflow.id}`,
                workflow
            ).pipe(map(r => r.data));
        }
        return this.http.post<ApiResponse<WorkflowDto>>(
            `${this.baseUrl}/workflows`,
            workflow
        ).pipe(map(r => r.data));
    }

    /**
     * Delete a workflow
     * @backend DELETE /api/v1/workflows/{id}
     */
    deleteWorkflow(id: string): Observable<boolean> {
        if (this.mockEnabled) {
            return this.mockDeleteWorkflow(id);
        }
        return this.http.delete(`${this.baseUrl}/workflows/${id}`).pipe(
            map(() => true),
            catchError(() => of(false))
        );
    }

    /**
     * Publish a workflow (change status to PUBLISHED)
     * @backend POST /api/v1/workflows/{id}/publish
     */
    publishWorkflow(id: string): Observable<WorkflowDto> {
        if (this.mockEnabled) {
            return this.mockUpdateWorkflowStatus(id, WorkflowStatus.PUBLISHED);
        }
        return this.http.post<ApiResponse<WorkflowDto>>(
            `${this.baseUrl}/workflows/${id}/publish`,
            {}
        ).pipe(map(r => r.data));
    }

    /**
     * Unpublish a workflow (change status to DRAFT)
     * @backend POST /api/v1/workflows/{id}/unpublish
     */
    unpublishWorkflow(id: string): Observable<WorkflowDto> {
        if (this.mockEnabled) {
            return this.mockUpdateWorkflowStatus(id, WorkflowStatus.DRAFT);
        }
        return this.http.post<ApiResponse<WorkflowDto>>(
            `${this.baseUrl}/workflows/${id}/unpublish`,
            {}
        ).pipe(map(r => r.data));
    }

    // ========================================================================
    // TEMPLATE WORKFLOWS (Tier 3)
    // ========================================================================

    /**
     * Get all template workflows
     * @backend GET /api/v1/templates
     */
    getTemplates(): Observable<TemplateWorkflowDto[]> {
        if (this.mockEnabled) {
            return this.mockGetTemplates();
        }
        return this.http.get<ApiListResponse<TemplateWorkflowDto>>(
            `${this.baseUrl}/templates`
        ).pipe(map(r => r.items));
    }

    /**
     * Get a single template by ID
     * @backend GET /api/v1/templates/{id}
     */
    getTemplate(id: string): Observable<TemplateWorkflowDto | null> {
        if (this.mockEnabled) {
            return this.mockGetTemplate(id);
        }
        return this.http.get<ApiResponse<TemplateWorkflowDto>>(
            `${this.baseUrl}/templates/${id}`
        ).pipe(
            map(r => r.data),
            catchError(() => of(null))
        );
    }

    /**
     * Get published templates only
     * @backend GET /api/v1/templates?status=published
     */
    getPublishedTemplates(): Observable<TemplateWorkflowDto[]> {
        if (this.mockEnabled) {
            return this.mockGetTemplates().pipe(
                map(templates => templates.filter(t => t.status === WorkflowStatus.PUBLISHED))
            );
        }
        const params = new HttpParams().set('status', 'published');
        return this.http.get<ApiListResponse<TemplateWorkflowDto>>(
            `${this.baseUrl}/templates`,
            { params }
        ).pipe(map(r => r.items));
    }

    // ========================================================================
    // TEMPLATE ASSIGNMENTS
    // ========================================================================

    /**
     * Get template assignments for a project
     * @backend GET /api/v1/projects/{projectId}/template-assignments
     */
    getTemplateAssignments(projectId: string): Observable<TemplateAssignment[]> {
        if (this.mockEnabled) {
            return this.mockGetTemplateAssignments(projectId);
        }
        return this.http.get<ApiListResponse<TemplateAssignment>>(
            `${this.baseUrl}/projects/${projectId}/template-assignments`
        ).pipe(map(r => r.items));
    }

    /**
     * Assign a template to a project
     * @backend POST /api/v1/projects/{projectId}/template-assignments
     */
    assignTemplate(request: AssignTemplateRequest): Observable<TemplateAssignment> {
        if (this.mockEnabled) {
            return this.mockAssignTemplate(request);
        }
        return this.http.post<ApiResponse<TemplateAssignment>>(
            `${this.baseUrl}/projects/${request.projectId}/template-assignments`,
            request
        ).pipe(map(r => r.data));
    }

    /**
     * Remove a template assignment
     * @backend DELETE /api/v1/projects/{projectId}/template-assignments/{assignmentId}
     */
    removeTemplateAssignment(projectId: string, assignmentId: string): Observable<boolean> {
        if (this.mockEnabled) {
            return this.mockRemoveTemplateAssignment(projectId, assignmentId);
        }
        return this.http.delete(
            `${this.baseUrl}/projects/${projectId}/template-assignments/${assignmentId}`
        ).pipe(
            map(() => true),
            catchError(() => of(false))
        );
    }

    /**
     * Toggle template assignment enabled state
     * @backend PATCH /api/v1/projects/{projectId}/template-assignments/{assignmentId}
     */
    toggleTemplateAssignment(
        projectId: string,
        assignmentId: string,
        enabled: boolean
    ): Observable<TemplateAssignment> {
        if (this.mockEnabled) {
            return this.mockToggleTemplateAssignment(projectId, assignmentId, enabled);
        }
        return this.http.patch<ApiResponse<TemplateAssignment>>(
            `${this.baseUrl}/projects/${projectId}/template-assignments/${assignmentId}`,
            { enabled }
        ).pipe(map(r => r.data));
    }

    // ========================================================================
    // EXECUTION SESSIONS
    // ========================================================================

    /**
     * Get sessions for an assignment
     * @backend GET /api/v1/assignments/{assignmentId}/sessions
     */
    getSessions(assignmentId: string): Observable<ExecutionSession[]> {
        if (this.mockEnabled) {
            return this.mockGetSessions(assignmentId);
        }
        return this.http.get<ApiListResponse<ExecutionSession>>(
            `${this.baseUrl}/assignments/${assignmentId}/sessions`
        ).pipe(map(r => r.items));
    }

    /**
     * Create a new session
     * @backend POST /api/v1/assignments/{assignmentId}/sessions
     */
    createSession(request: CreateSessionRequest): Observable<ExecutionSession> {
        if (this.mockEnabled) {
            return this.mockCreateSession(request);
        }
        return this.http.post<ApiResponse<ExecutionSession>>(
            `${this.baseUrl}/assignments/${request.assignmentId}/sessions`,
            request
        ).pipe(map(r => r.data));
    }

    /**
     * Update a session
     * @backend PATCH /api/v1/sessions/{sessionId}
     */
    updateSession(
        sessionId: string,
        changes: Partial<ExecutionSession>
    ): Observable<ExecutionSession> {
        if (this.mockEnabled) {
            return this.mockUpdateSession(sessionId, changes);
        }
        return this.http.patch<ApiResponse<ExecutionSession>>(
            `${this.baseUrl}/sessions/${sessionId}`,
            changes
        ).pipe(map(r => r.data));
    }

    /**
     * Delete a session
     * @backend DELETE /api/v1/sessions/{sessionId}
     */
    deleteSession(sessionId: string): Observable<boolean> {
        if (this.mockEnabled) {
            return this.mockDeleteSession(sessionId);
        }
        return this.http.delete(`${this.baseUrl}/sessions/${sessionId}`).pipe(
            map(() => true),
            catchError(() => of(false))
        );
    }

    // ========================================================================
    // WORKFLOW EXECUTION
    // ========================================================================

    /**
     * Execute a workflow
     * @backend POST /api/v1/workflows/{workflowId}/execute
     */
    executeWorkflow(
        workflowId: string,
        inputs: Record<string, unknown>,
        sessionId?: string
    ): Observable<{ executionId: string; status: string }> {
        if (this.mockEnabled) {
            return of({
                executionId: crypto.randomUUID(),
                status: 'queued',
            }).pipe(delay(this.mockDelay));
        }
        return this.http.post<ApiResponse<{ executionId: string; status: string }>>(
            `${this.baseUrl}/workflows/${workflowId}/execute`,
            { inputs, sessionId }
        ).pipe(map(r => r.data));
    }

    /**
     * Get execution status
     * @backend GET /api/v1/executions/{executionId}
     */
    getExecutionStatus(executionId: string): Observable<{
        status: 'queued' | 'running' | 'completed' | 'failed';
        progress?: number;
        result?: unknown;
        error?: string;
    }> {
        if (this.mockEnabled) {
            return of({
                status: 'completed' as const,
                progress: 100,
                result: { message: 'Mock execution completed' },
            }).pipe(delay(this.mockDelay));
        }
        return this.http.get<ApiResponse<{
            status: 'queued' | 'running' | 'completed' | 'failed';
            progress?: number;
            result?: unknown;
            error?: string;
        }>>(`${this.baseUrl}/executions/${executionId}`).pipe(map(r => r.data));
    }

    // ========================================================================
    // MOCK IMPLEMENTATIONS (Remove when backend is ready)
    // ========================================================================

    private getFromStorage<T>(key: string, defaultValue: T): T {
        try {
            const stored = localStorage.getItem(API_CONFIG.storageKeys[key as keyof typeof API_CONFIG.storageKeys] || key);
            return stored ? JSON.parse(stored) : defaultValue;
        } catch {
            return defaultValue;
        }
    }

    private saveToStorage(key: string, data: unknown): void {
        localStorage.setItem(
            API_CONFIG.storageKeys[key as keyof typeof API_CONFIG.storageKeys] || key,
            JSON.stringify(data)
        );
    }

    private mockGetWorkflows(): Observable<WorkflowDto[]> {
        const workflows = this.getFromStorage<WorkflowDto[]>('workflows', []);
        return of(workflows).pipe(delay(this.mockDelay));
    }

    private mockGetWorkflow(id: string): Observable<WorkflowDto | null> {
        const workflows = this.getFromStorage<WorkflowDto[]>('workflows', []);
        const workflow = workflows.find(w => w.id === id) ?? null;
        return of(workflow).pipe(delay(this.mockDelay));
    }

    private mockSaveWorkflow(workflow: WorkflowDto): Observable<WorkflowDto> {
        const workflows = this.getFromStorage<WorkflowDto[]>('workflows', []);
        const index = workflows.findIndex(w => w.id === workflow.id);
        const now = DateTime.now().toISO()!;

        const saved: WorkflowDto = {
            ...workflow,
            id: workflow.id || crypto.randomUUID(),
            metadata: {
                ...workflow.metadata,
                updatedAt: now,
                createdAt: workflow.metadata?.createdAt || now,
                version: (workflow.metadata?.version || 0) + 1,
            },
        };

        if (index >= 0) {
            workflows[index] = saved;
        } else {
            workflows.push(saved);
        }

        this.saveToStorage('workflows', workflows);
        return of(saved).pipe(delay(this.mockDelay));
    }

    private mockDeleteWorkflow(id: string): Observable<boolean> {
        const workflows = this.getFromStorage<WorkflowDto[]>('workflows', []);
        const filtered = workflows.filter(w => w.id !== id);
        this.saveToStorage('workflows', filtered);
        return of(true).pipe(delay(this.mockDelay));
    }

    private mockUpdateWorkflowStatus(id: string, status: WorkflowStatus): Observable<WorkflowDto> {
        const workflows = this.getFromStorage<WorkflowDto[]>('workflows', []);
        const index = workflows.findIndex(w => w.id === id);

        if (index < 0) {
            return throwError(() => new Error('Workflow not found'));
        }

        workflows[index] = {
            ...workflows[index],
            status,
            needsRepublish: false,
            metadata: {
                ...workflows[index].metadata,
                updatedAt: DateTime.now().toISO()!,
            },
        };

        this.saveToStorage('workflows', workflows);
        return of(workflows[index]).pipe(delay(this.mockDelay));
    }

    private mockGetTemplates(): Observable<TemplateWorkflowDto[]> {
        const templates = this.getFromStorage<TemplateWorkflowDto[]>('templateWorkflows', []);
        return of(templates).pipe(delay(this.mockDelay));
    }

    private mockGetTemplate(id: string): Observable<TemplateWorkflowDto | null> {
        const templates = this.getFromStorage<TemplateWorkflowDto[]>('templateWorkflows', []);
        return of(templates.find(t => t.id === id) ?? null).pipe(delay(this.mockDelay));
    }

    private mockGetTemplateAssignments(projectId: string): Observable<TemplateAssignment[]> {
        const allAssignments = this.getFromStorage<Record<string, TemplateAssignment[]>>(
            'templateAssignments',
            {}
        );
        return of(allAssignments[projectId] || []).pipe(delay(this.mockDelay));
    }

    private mockAssignTemplate(request: AssignTemplateRequest): Observable<TemplateAssignment> {
        const allAssignments = this.getFromStorage<Record<string, TemplateAssignment[]>>(
            'templateAssignments',
            {}
        );

        const assignment: TemplateAssignment = {
            id: crypto.randomUUID(),
            projectId: request.projectId,
            templateId: request.templateId,
            templateName: request.templateName,
            enabled: true,
            portDataScopes: request.portDataScopes || [],
            assignedAt: DateTime.now().toISO()!,
            assignedBy: request.assignedBy,
        };

        if (!allAssignments[request.projectId]) {
            allAssignments[request.projectId] = [];
        }
        allAssignments[request.projectId].push(assignment);

        this.saveToStorage('templateAssignments', allAssignments);
        return of(assignment).pipe(delay(this.mockDelay));
    }

    private mockRemoveTemplateAssignment(projectId: string, assignmentId: string): Observable<boolean> {
        const allAssignments = this.getFromStorage<Record<string, TemplateAssignment[]>>(
            'templateAssignments',
            {}
        );

        if (allAssignments[projectId]) {
            allAssignments[projectId] = allAssignments[projectId].filter(a => a.id !== assignmentId);
            this.saveToStorage('templateAssignments', allAssignments);
        }

        return of(true).pipe(delay(this.mockDelay));
    }

    private mockToggleTemplateAssignment(
        projectId: string,
        assignmentId: string,
        enabled: boolean
    ): Observable<TemplateAssignment> {
        const allAssignments = this.getFromStorage<Record<string, TemplateAssignment[]>>(
            'templateAssignments',
            {}
        );

        const assignment = allAssignments[projectId]?.find(a => a.id === assignmentId);
        if (!assignment) {
            return throwError(() => new Error('Assignment not found'));
        }

        assignment.enabled = enabled;
        assignment.updatedAt = DateTime.now().toISO()!;
        this.saveToStorage('templateAssignments', allAssignments);

        return of(assignment).pipe(delay(this.mockDelay));
    }

    private mockGetSessions(assignmentId: string): Observable<ExecutionSession[]> {
        const allSessions = this.getFromStorage<Record<string, ExecutionSession[]>>('sessions', {});
        return of(allSessions[assignmentId] || []).pipe(delay(this.mockDelay));
    }

    private mockCreateSession(request: CreateSessionRequest): Observable<ExecutionSession> {
        const allSessions = this.getFromStorage<Record<string, ExecutionSession[]>>('sessions', {});
        const now = DateTime.now().toISO()!;

        const session: ExecutionSession = {
            id: crypto.randomUUID(),
            assignmentId: request.assignmentId,
            name: request.name,
            status: 'idle',
            context: {
                projectId: request.projectId,
                sessionId: '',
                assignmentId: request.assignmentId,
                userId: request.userId || 'anonymous',
                inputs: {},
                outputs: {},
            },
            createdAt: now,
            updatedAt: now,
        };
        session.context.sessionId = session.id;

        if (!allSessions[request.assignmentId]) {
            allSessions[request.assignmentId] = [];
        }
        allSessions[request.assignmentId].push(session);

        this.saveToStorage('sessions', allSessions);
        return of(session).pipe(delay(this.mockDelay));
    }

    private mockUpdateSession(
        sessionId: string,
        changes: Partial<ExecutionSession>
    ): Observable<ExecutionSession> {
        const allSessions = this.getFromStorage<Record<string, ExecutionSession[]>>('sessions', {});

        for (const assignmentId of Object.keys(allSessions)) {
            const sessions = allSessions[assignmentId];
            const index = sessions.findIndex(s => s.id === sessionId);
            if (index >= 0) {
                sessions[index] = {
                    ...sessions[index],
                    ...changes,
                    updatedAt: DateTime.now().toISO()!,
                };
                this.saveToStorage('sessions', allSessions);
                return of(sessions[index]).pipe(delay(this.mockDelay));
            }
        }

        return throwError(() => new Error('Session not found'));
    }

    private mockDeleteSession(sessionId: string): Observable<boolean> {
        const allSessions = this.getFromStorage<Record<string, ExecutionSession[]>>('sessions', {});

        for (const assignmentId of Object.keys(allSessions)) {
            const original = allSessions[assignmentId].length;
            allSessions[assignmentId] = allSessions[assignmentId].filter(s => s.id !== sessionId);
            if (allSessions[assignmentId].length < original) {
                this.saveToStorage('sessions', allSessions);
                return of(true).pipe(delay(this.mockDelay));
            }
        }

        return of(false).pipe(delay(this.mockDelay));
    }
}
