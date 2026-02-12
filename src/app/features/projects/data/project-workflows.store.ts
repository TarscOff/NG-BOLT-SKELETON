import { Injectable } from '@angular/core';
import { ComponentStore } from '@ngrx/component-store';
import { Observable, tap } from 'rxjs';
import { DateTime } from 'luxon';
import { ProjectWorkflowAssignment, WorkflowOutputScope, WorkflowExecutionSession } from '../interfaces/project.model';

/**
 * State shape for project-workflow assignments
 */
export interface ProjectWorkflowsState {
    /** Map of projectId -> array of workflow assignments */
    assignmentsByProject: Record<string, ProjectWorkflowAssignment[]>;
    /** Map of assignmentId -> array of workflow execution sessions */
    sessionsByAssignment: Record<string, WorkflowExecutionSession[]>;
    /** Currently selected assignment ID */
    selectedAssignmentId: string | null;
    /** Currently selected session ID */
    selectedSessionId: string | null;
    /** Loading state per project */
    loadingByProject: Record<string, boolean>;
    /** Error state per project */
    errorByProject: Record<string, string | null>;
}

const initialState: ProjectWorkflowsState = {
    assignmentsByProject: {},
    sessionsByAssignment: {},
    selectedAssignmentId: null,
    selectedSessionId: null,
    loadingByProject: {},
    errorByProject: {},
};

/**
 * NGRX ComponentStore for managing project-workflow assignments.
 * This store persists assignments to localStorage for PoC mode.
 * Will be replaced with backend API calls later.
 */
@Injectable({ providedIn: 'root' })
export class ProjectWorkflowsStore extends ComponentStore<ProjectWorkflowsState> {
    private readonly STORAGE_KEY = 'project_workflow_assignments';

    constructor() {
        super(initialState);
        this.loadFromStorage();
    }

    // ========== SELECTORS ==========

    /** Get all assignments for a specific project */
    readonly selectAssignmentsByProject = (projectId: string): Observable<ProjectWorkflowAssignment[]> =>
        this.select(state => state.assignmentsByProject[projectId] ?? []);

    /** Get loading state for a project */
    readonly selectLoadingByProject = (projectId: string): Observable<boolean> =>
        this.select(state => state.loadingByProject[projectId] ?? false);

    /** Get error state for a project */
    readonly selectErrorByProject = (projectId: string): Observable<string | null> =>
        this.select(state => state.errorByProject[projectId] ?? null);

    /** Get assignment count for a project */
    readonly selectAssignmentCount = (projectId: string): Observable<number> =>
        this.select(state => (state.assignmentsByProject[projectId] ?? []).length);

    /** Get all projects with assignments */
    readonly allAssignments$ = this.select(state => state.assignmentsByProject);

    /** Get sessions for a specific assignment */
    readonly selectSessionsByAssignment = (assignmentId: string): Observable<WorkflowExecutionSession[]> =>
        this.select(state => state.sessionsByAssignment[assignmentId] ?? []);

    /** Get currently selected assignment ID */
    readonly selectedAssignmentId$ = this.select(state => state.selectedAssignmentId);

    /** Get currently selected session ID */
    readonly selectedSessionId$ = this.select(state => state.selectedSessionId);

    /** Get all sessions by assignment */
    readonly allSessions$ = this.select(state => state.sessionsByAssignment);

    /** Get the currently selected assignment */
    readonly selectedAssignment$ = this.select(
        this.allAssignments$,
        this.selectedAssignmentId$,
        (assignments, selectedId) => {
            if (!selectedId) return null;
            for (const projectAssignments of Object.values(assignments)) {
                const found = projectAssignments.find(a => a.id === selectedId);
                if (found) return found;
            }
            return null;
        }
    );

    /** Get the currently selected session */
    readonly selectedSession$ = this.select(
        this.allSessions$,
        this.selectedSessionId$,
        (sessionsByAssignment, selectedId) => {
            if (!selectedId) return null;
            for (const sessions of Object.values(sessionsByAssignment)) {
                const found = sessions.find(s => s.id === selectedId);
                if (found) return found;
            }
            return null;
        }
    );

    // ========== UPDATERS ==========

    /** Set loading state for a project */
    readonly setLoading = this.updater((state, { projectId, loading }: { projectId: string; loading: boolean }) => ({
        ...state,
        loadingByProject: {
            ...state.loadingByProject,
            [projectId]: loading,
        },
    }));

    /** Set error state for a project */
    readonly setError = this.updater((state, { projectId, error }: { projectId: string; error: string | null }) => ({
        ...state,
        errorByProject: {
            ...state.errorByProject,
            [projectId]: error,
        },
    }));

    /** Set assignments for a project (replaces existing) */
    readonly setAssignments = this.updater((state, { projectId, assignments }: { projectId: string; assignments: ProjectWorkflowAssignment[] }) => {
        const newState = {
            ...state,
            assignmentsByProject: {
                ...state.assignmentsByProject,
                [projectId]: assignments,
            },
        };
        this.persistToStorage(newState);
        return newState;
    });

    /** Add a new assignment to a project */
    readonly addAssignment = this.updater((state, { projectId, assignment }: { projectId: string; assignment: ProjectWorkflowAssignment }) => {
        const existing = state.assignmentsByProject[projectId] ?? [];
        const newState = {
            ...state,
            assignmentsByProject: {
                ...state.assignmentsByProject,
                [projectId]: [...existing, assignment],
            },
        };
        this.persistToStorage(newState);
        return newState;
    });

    /** Update an existing assignment */
    readonly updateAssignment = this.updater((state, { projectId, assignmentId, changes }: {
        projectId: string;
        assignmentId: string;
        changes: Partial<Omit<ProjectWorkflowAssignment, 'id'>>;
    }) => {
        const existing = state.assignmentsByProject[projectId] ?? [];
        const updated = existing.map(a =>
            a.id === assignmentId ? { ...a, ...changes } : a
        );
        const newState = {
            ...state,
            assignmentsByProject: {
                ...state.assignmentsByProject,
                [projectId]: updated,
            },
        };
        this.persistToStorage(newState);
        return newState;
    });

    /** Remove an assignment from a project */
    readonly removeAssignment = this.updater((state, { projectId, assignmentId }: { projectId: string; assignmentId: string }) => {
        const existing = state.assignmentsByProject[projectId] ?? [];
        const filtered = existing.filter(a => a.id !== assignmentId);
        const newState = {
            ...state,
            assignmentsByProject: {
                ...state.assignmentsByProject,
                [projectId]: filtered,
            },
        };
        this.persistToStorage(newState);
        return newState;
    });

    /** Toggle enabled state of an assignment */
    readonly toggleAssignmentEnabled = this.updater((state, { projectId, assignmentId }: { projectId: string; assignmentId: string }) => {
        const existing = state.assignmentsByProject[projectId] ?? [];
        const updated = existing.map(a =>
            a.id === assignmentId ? { ...a, enabled: !a.enabled } : a
        );
        const newState = {
            ...state,
            assignmentsByProject: {
                ...state.assignmentsByProject,
                [projectId]: updated,
            },
        };
        this.persistToStorage(newState);
        return newState;
    });

    /** Clear all assignments for a project */
    readonly clearProjectAssignments = this.updater((state, projectId: string) => {
        const rest = { ...state.assignmentsByProject };
        delete rest[projectId];
        const newState = {
            ...state,
            assignmentsByProject: rest,
        };
        this.persistToStorage(newState);
        return newState;
    });

    // ========== SESSION UPDATERS ==========

    /** Select an assignment */
    readonly selectAssignment = this.updater((state, assignmentId: string | null) => ({
        ...state,
        selectedAssignmentId: assignmentId,
        selectedSessionId: null, // Reset session when assignment changes
    }));

    /** Select a session */
    readonly selectSession = this.updater((state, sessionId: string | null) => ({
        ...state,
        selectedSessionId: sessionId,
    }));

    /** Add a new session to an assignment */
    readonly addSession = this.updater((state, { assignmentId, session }: { assignmentId: string; session: WorkflowExecutionSession }) => {
        const existing = state.sessionsByAssignment[assignmentId] ?? [];
        const newState = {
            ...state,
            sessionsByAssignment: {
                ...state.sessionsByAssignment,
                [assignmentId]: [...existing, session],
            },
        };
        this.persistSessionsToStorage(newState);
        return newState;
    });

    /** Update an existing session */
    readonly updateSession = this.updater((state, { assignmentId, sessionId, changes }: {
        assignmentId: string;
        sessionId: string;
        changes: Partial<Omit<WorkflowExecutionSession, 'id'>>;
    }) => {
        const existing = state.sessionsByAssignment[assignmentId] ?? [];
        const updated = existing.map(s =>
            s.id === sessionId ? { ...s, ...changes, updatedAt: DateTime.now() } : s
        );
        const newState = {
            ...state,
            sessionsByAssignment: {
                ...state.sessionsByAssignment,
                [assignmentId]: updated,
            },
        };
        this.persistSessionsToStorage(newState);
        return newState;
    });

    /** Remove a session from an assignment */
    readonly removeSession = this.updater((state, { assignmentId, sessionId }: { assignmentId: string; sessionId: string }) => {
        const existing = state.sessionsByAssignment[assignmentId] ?? [];
        const filtered = existing.filter(s => s.id !== sessionId);
        const newState = {
            ...state,
            sessionsByAssignment: {
                ...state.sessionsByAssignment,
                [assignmentId]: filtered,
            },
            // Clear selection if removing selected session
            selectedSessionId: state.selectedSessionId === sessionId ? null : state.selectedSessionId,
        };
        this.persistSessionsToStorage(newState);
        return newState;
    });

    /** Clear all sessions for an assignment */
    readonly clearAssignmentSessions = this.updater((state, assignmentId: string) => {
        const rest = { ...state.sessionsByAssignment };
        delete rest[assignmentId];
        const newState = {
            ...state,
            sessionsByAssignment: rest,
        };
        this.persistSessionsToStorage(newState);
        return newState;
    });

    // ========== EFFECTS ==========

    /** 
     * Assign a workflow to a project 
     * Creates a new assignment with a unique ID
     */
    readonly assignWorkflow = this.effect<{
        projectId: string;
        workflowId: string;
        workflowName: string;
        workflowDescription?: string;
        outputScope: WorkflowOutputScope;
        assignedBy?: string;
    }>(params$ =>
        params$.pipe(
            tap(({ projectId, workflowId, workflowName, workflowDescription, outputScope, assignedBy }) => {
                const assignment: ProjectWorkflowAssignment = {
                    id: `assign-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`,
                    workflowId,
                    workflowName,
                    workflowDescription,
                    outputScope,
                    enabled: true,
                    assignedAt: DateTime.now(),
                    assignedBy,
                };
                this.addAssignment({ projectId, assignment });
            })
        )
    );

    /** 
     * Update the output scope of an assignment 
     */
    readonly updateOutputScope = this.effect<{
        projectId: string;
        assignmentId: string;
        outputScope: WorkflowOutputScope;
    }>(params$ =>
        params$.pipe(
            tap(({ projectId, assignmentId, outputScope }) => {
                this.updateAssignment({ projectId, assignmentId, changes: { outputScope } });
            })
        )
    );

    /** 
     * Create a new session for an assignment 
     */
    readonly createSession = this.effect<{
        assignmentId: string;
        projectId: string;
        workflowId: string;
        name?: string;
        createdBy?: string;
    }>(params$ =>
        params$.pipe(
            tap(({ assignmentId, projectId, workflowId, name, createdBy }) => {
                const now = DateTime.now();
                const session: WorkflowExecutionSession = {
                    id: `session-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`,
                    assignmentId,
                    projectId,
                    workflowId,
                    name: name ?? `Session ${now.toFormat('yyyy-MM-dd HH:mm')}`,
                    createdAt: now,
                    updatedAt: now,
                    createdBy,
                    status: 'idle',
                };
                this.addSession({ assignmentId, session });
                // Auto-select the new session
                this.selectSession(session.id);
            })
        )
    );

    // ========== PERSISTENCE (LocalStorage for PoC) ==========

    private readonly SESSIONS_STORAGE_KEY = 'project_workflow_sessions';

    private loadFromStorage(): void {
        try {
            // Load assignments
            const stored = localStorage.getItem(this.STORAGE_KEY);
            if (stored) {
                const parsed = JSON.parse(stored) as Record<string, ProjectWorkflowAssignment[]>;
                // Convert ISO date strings back to DateTime objects
                const hydrated: Record<string, ProjectWorkflowAssignment[]> = {};
                for (const [projectId, assignments] of Object.entries(parsed)) {
                    hydrated[projectId] = assignments.map(a => ({
                        ...a,
                        assignedAt: typeof a.assignedAt === 'string'
                            ? DateTime.fromISO(a.assignedAt as unknown as string)
                            : a.assignedAt,
                    }));
                }
                this.patchState({ assignmentsByProject: hydrated });
            }

            // Load sessions
            const storedSessions = localStorage.getItem(this.SESSIONS_STORAGE_KEY);
            if (storedSessions) {
                const parsed = JSON.parse(storedSessions) as Record<string, WorkflowExecutionSession[]>;
                const hydrated: Record<string, WorkflowExecutionSession[]> = {};
                for (const [assignmentId, sessions] of Object.entries(parsed)) {
                    hydrated[assignmentId] = sessions.map(s => ({
                        ...s,
                        createdAt: typeof s.createdAt === 'string'
                            ? DateTime.fromISO(s.createdAt as unknown as string)
                            : s.createdAt,
                        updatedAt: typeof s.updatedAt === 'string'
                            ? DateTime.fromISO(s.updatedAt as unknown as string)
                            : s.updatedAt,
                        lastResult: s.lastResult ? {
                            ...s.lastResult,
                            startedAt: typeof s.lastResult.startedAt === 'string'
                                ? DateTime.fromISO(s.lastResult.startedAt as unknown as string)
                                : s.lastResult.startedAt,
                            completedAt: s.lastResult.completedAt && typeof s.lastResult.completedAt === 'string'
                                ? DateTime.fromISO(s.lastResult.completedAt as unknown as string)
                                : s.lastResult.completedAt,
                        } : undefined,
                    }));
                }
                this.patchState({ sessionsByAssignment: hydrated });
            }
        } catch (e) {
            console.warn('Failed to load project-workflow assignments from storage:', e);
        }
    }

    private persistToStorage(state: ProjectWorkflowsState): void {
        try {
            // Convert DateTime objects to ISO strings for storage
            const serializable: Record<string, unknown[]> = {};
            for (const [projectId, assignments] of Object.entries(state.assignmentsByProject)) {
                serializable[projectId] = assignments.map(a => ({
                    ...a,
                    assignedAt: a.assignedAt.toISO(),
                }));
            }
            localStorage.setItem(this.STORAGE_KEY, JSON.stringify(serializable));
        } catch (e) {
            console.warn('Failed to persist project-workflow assignments to storage:', e);
        }
    }

    private persistSessionsToStorage(state: ProjectWorkflowsState): void {
        try {
            const serializable: Record<string, unknown[]> = {};
            for (const [assignmentId, sessions] of Object.entries(state.sessionsByAssignment)) {
                serializable[assignmentId] = sessions.map(s => ({
                    ...s,
                    createdAt: s.createdAt.toISO(),
                    updatedAt: s.updatedAt.toISO(),
                    lastResult: s.lastResult ? {
                        ...s.lastResult,
                        startedAt: s.lastResult.startedAt.toISO(),
                        completedAt: s.lastResult.completedAt?.toISO(),
                    } : undefined,
                }));
            }
            localStorage.setItem(this.SESSIONS_STORAGE_KEY, JSON.stringify(serializable));
        } catch (e) {
            console.warn('Failed to persist workflow sessions to storage:', e);
        }
    }

    // ========== HELPER METHODS ==========

    /** Get assignments for a project synchronously (snapshot) */
    getAssignmentsSnapshot(projectId: string): ProjectWorkflowAssignment[] {
        return this.get().assignmentsByProject[projectId] ?? [];
    }

    /** Check if a workflow is assigned to a project */
    isWorkflowAssigned(projectId: string, workflowId: string): boolean {
        const assignments = this.getAssignmentsSnapshot(projectId);
        return assignments.some(a => a.workflowId === workflowId);
    }

    /** Get count of times a workflow is assigned to a project */
    getWorkflowAssignmentCount(projectId: string, workflowId: string): number {
        const assignments = this.getAssignmentsSnapshot(projectId);
        return assignments.filter(a => a.workflowId === workflowId).length;
    }

    /** Get sessions for an assignment synchronously (snapshot) */
    getSessionsSnapshot(assignmentId: string): WorkflowExecutionSession[] {
        return this.get().sessionsByAssignment[assignmentId] ?? [];
    }

    /** Get session count for an assignment */
    getSessionCount(assignmentId: string): number {
        return this.getSessionsSnapshot(assignmentId).length;
    }

    /** Get a specific session by ID */
    getSessionById(sessionId: string): WorkflowExecutionSession | null {
        const state = this.get();
        for (const sessions of Object.values(state.sessionsByAssignment)) {
            const found = sessions.find(s => s.id === sessionId);
            if (found) return found;
        }
        return null;
    }
}
