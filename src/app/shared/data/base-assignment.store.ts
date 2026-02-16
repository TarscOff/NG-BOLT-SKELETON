/**
 * Base Assignment Store
 *
 * Abstract base class for stores that manage assignments and sessions.
 * Both ProjectWorkflowsStore and TemplateWorkflowsStore should extend this
 * to eliminate duplicate code.
 *
 * BACKEND INTEGRATION:
 * When the backend is ready, update this base class to use WorkflowApiService
 * instead of localStorage. All child stores will automatically use the API.
 */

import { inject } from '@angular/core';
import { ComponentStore } from '@ngrx/component-store';
import { Observable, tap, pipe } from 'rxjs';
import { DateTime } from 'luxon';

import { WorkflowApiService } from '@shared/services/workflow-api.service';
import {
    BaseAssignment,
    ExecutionSession,
    hydrateDates,
} from '@shared/types/workflow.types';

// ============================================================================
// BASE STATE INTERFACE
// ============================================================================

export interface BaseAssignmentState<A extends BaseAssignment> {
    /** Assignments by project ID */
    assignmentsByProject: Record<string, A[]>;
    /** Sessions by assignment ID */
    sessionsByAssignment: Record<string, ExecutionSession[]>;
    /** Currently selected assignment ID */
    selectedAssignmentId: string | null;
    /** Currently selected session ID */
    selectedSessionId: string | null;
    /** Loading states */
    loading: {
        assignments: boolean;
        sessions: boolean;
    };
    /** Error states */
    errors: {
        assignments: string | null;
        sessions: string | null;
    };
}

// ============================================================================
// BASE STORE
// ============================================================================

export abstract class BaseAssignmentStore<
    A extends BaseAssignment,
    S extends BaseAssignmentState<A> = BaseAssignmentState<A>
> extends ComponentStore<S> {
    protected readonly apiService = inject(WorkflowApiService);

    // ========================================================================
    // ABSTRACT METHODS (Must be implemented by child classes)
    // ========================================================================

    /** LocalStorage key for assignments */
    protected abstract readonly assignmentsStorageKey: string;

    /** LocalStorage key for sessions */
    protected abstract readonly sessionsStorageKey: string;

    /** Create a new assignment with type-specific fields */
    protected abstract createAssignment(params: {
        projectId: string;
        [key: string]: unknown;
    }): A;

    // ========================================================================
    // COMMON SELECTORS
    // ========================================================================

    /** Select assignments by project ID */
    selectAssignmentsByProject(projectId: string): Observable<A[]> {
        return this.select(state => state.assignmentsByProject[projectId] ?? []);
    }

    /** Select sessions by assignment ID */
    selectSessionsByAssignment(assignmentId: string): Observable<ExecutionSession[]> {
        return this.select(state => state.sessionsByAssignment[assignmentId] ?? []);
    }

    /** Select the currently selected assignment */
    readonly selectedAssignment$ = this.select(state => {
        if (!state.selectedAssignmentId) return null;
        for (const assignments of Object.values(state.assignmentsByProject)) {
            const found = assignments.find(a => a.id === state.selectedAssignmentId);
            if (found) return found;
        }
        return null;
    });

    /** Select the currently selected session */
    readonly selectedSession$ = this.select(state => {
        if (!state.selectedSessionId) return null;
        for (const sessions of Object.values(state.sessionsByAssignment)) {
            const found = sessions.find(s => s.id === state.selectedSessionId);
            if (found) return found;
        }
        return null;
    });

    /** Select loading states */
    readonly isLoading$ = this.select(state =>
        state.loading.assignments || state.loading.sessions
    );

    // ========================================================================
    // COMMON UPDATERS
    // ========================================================================

    /** Set assignments for a project */
    readonly setAssignmentsForProject = this.updater(
        (state, params: { projectId: string; assignments: A[] }) => ({
            ...state,
            assignmentsByProject: {
                ...state.assignmentsByProject,
                [params.projectId]: params.assignments,
            },
        })
    );

    /** Add a single assignment */
    readonly addAssignment = this.updater((state, assignment: A) => {
        const projectAssignments = state.assignmentsByProject[assignment.projectId] ?? [];
        return {
            ...state,
            assignmentsByProject: {
                ...state.assignmentsByProject,
                [assignment.projectId]: [...projectAssignments, assignment],
            },
        };
    });

    /** Remove an assignment */
    readonly removeAssignmentFromState = this.updater(
        (state, params: { projectId: string; assignmentId: string }) => {
            const projectAssignments = state.assignmentsByProject[params.projectId] ?? [];
            return {
                ...state,
                assignmentsByProject: {
                    ...state.assignmentsByProject,
                    [params.projectId]: projectAssignments.filter(a => a.id !== params.assignmentId),
                },
            };
        }
    );

    /** Toggle assignment enabled state */
    readonly toggleAssignmentEnabledState = this.updater(
        (state, params: { projectId: string; assignmentId: string }) => {
            const projectAssignments = state.assignmentsByProject[params.projectId] ?? [];
            return {
                ...state,
                assignmentsByProject: {
                    ...state.assignmentsByProject,
                    [params.projectId]: projectAssignments.map(a =>
                        a.id === params.assignmentId
                            ? { ...a, enabled: !a.enabled, updatedAt: DateTime.now().toISO() }
                            : a
                    ),
                },
            };
        }
    );

    /** Set sessions for an assignment */
    readonly setSessionsForAssignment = this.updater(
        (state, params: { assignmentId: string; sessions: ExecutionSession[] }) => ({
            ...state,
            sessionsByAssignment: {
                ...state.sessionsByAssignment,
                [params.assignmentId]: params.sessions,
            },
        })
    );

    /** Add a session */
    readonly addSession = this.updater((state, session: ExecutionSession) => {
        const assignmentSessions = state.sessionsByAssignment[session.assignmentId] ?? [];
        return {
            ...state,
            sessionsByAssignment: {
                ...state.sessionsByAssignment,
                [session.assignmentId]: [...assignmentSessions, session],
            },
            selectedSessionId: session.id,
        };
    });

    /** Update a session */
    readonly updateSessionInState = this.updater(
        (state, params: { assignmentId: string; sessionId: string; changes: Partial<ExecutionSession> }) => {
            const sessions = state.sessionsByAssignment[params.assignmentId] ?? [];
            return {
                ...state,
                sessionsByAssignment: {
                    ...state.sessionsByAssignment,
                    [params.assignmentId]: sessions.map(s =>
                        s.id === params.sessionId
                            ? { ...s, ...params.changes, updatedAt: DateTime.now().toISO() }
                            : s
                    ),
                },
            };
        }
    );

    /** Remove a session */
    readonly removeSessionFromState = this.updater(
        (state, params: { assignmentId: string; sessionId: string }) => {
            const sessions = state.sessionsByAssignment[params.assignmentId] ?? [];
            return {
                ...state,
                sessionsByAssignment: {
                    ...state.sessionsByAssignment,
                    [params.assignmentId]: sessions.filter(s => s.id !== params.sessionId),
                },
                selectedSessionId:
                    state.selectedSessionId === params.sessionId ? null : state.selectedSessionId,
            };
        }
    );

    /** Select an assignment */
    readonly selectAssignment = this.updater((state, assignmentId: string | null) => ({
        ...state,
        selectedAssignmentId: assignmentId,
    }));

    /** Select a session */
    readonly selectSession = this.updater((state, sessionId: string | null) => ({
        ...state,
        selectedSessionId: sessionId,
    }));

    /** Set loading state */
    readonly setLoading = this.updater(
        (state, params: { key: 'assignments' | 'sessions'; loading: boolean }) => ({
            ...state,
            loading: {
                ...state.loading,
                [params.key]: params.loading,
            },
        })
    );

    /** Set error state */
    readonly setError = this.updater(
        (state, params: { key: 'assignments' | 'sessions'; error: string | null }) => ({
            ...state,
            errors: {
                ...state.errors,
                [params.key]: params.error,
            },
        })
    );

    // ========================================================================
    // COMMON EFFECTS
    // ========================================================================

    /** Effect: Toggle assignment enabled and persist */
    readonly toggleAssignmentEnabled = this.effect<{ projectId: string; assignmentId: string }>(
        pipe(
            tap(params => {
                this.toggleAssignmentEnabledState(params);
                this.persistAssignments();
            })
        )
    );

    /** Effect: Remove assignment and persist */
    readonly removeAssignment = this.effect<{ projectId: string; assignmentId: string }>(
        pipe(
            tap(params => {
                this.removeAssignmentFromState(params);
                this.persistAssignments();
            })
        )
    );

    /** Effect: Create a new session */
    readonly createSession = this.effect<{
        assignmentId: string;
        projectId: string;
        name: string;
        userId?: string;
    }>(
        pipe(
            tap(params => {
                const now = DateTime.now().toISO()!;
                const session: ExecutionSession = {
                    id: crypto.randomUUID(),
                    assignmentId: params.assignmentId,
                    name: params.name,
                    status: 'idle',
                    context: {
                        projectId: params.projectId,
                        sessionId: '',
                        assignmentId: params.assignmentId,
                        userId: params.userId || 'anonymous',
                        inputs: {},
                        outputs: {},
                    },
                    createdAt: now,
                    updatedAt: now,
                };
                session.context.sessionId = session.id;

                this.addSession(session);
                this.persistSessions();
            })
        )
    );

    /** Effect: Update a session */
    readonly updateSession = this.effect<{
        assignmentId: string;
        sessionId: string;
        changes: Partial<ExecutionSession>;
    }>(
        pipe(
            tap(params => {
                this.updateSessionInState(params);
                this.persistSessions();
            })
        )
    );

    /** Effect: Remove a session */
    readonly removeSession = this.effect<{ assignmentId: string; sessionId: string }>(
        pipe(
            tap(params => {
                this.removeSessionFromState(params);
                this.persistSessions();
            })
        )
    );

    // ========================================================================
    // PERSISTENCE METHODS
    // ========================================================================

    /** Persist assignments to localStorage */
    protected persistAssignments(): void {
        const state = this.get();
        localStorage.setItem(
            this.assignmentsStorageKey,
            JSON.stringify(state.assignmentsByProject)
        );
    }

    /** Persist sessions to localStorage */
    protected persistSessions(): void {
        const state = this.get();
        localStorage.setItem(
            this.sessionsStorageKey,
            JSON.stringify(state.sessionsByAssignment)
        );
    }

    /** Load assignments from localStorage */
    protected loadAssignmentsFromStorage(): Record<string, A[]> {
        try {
            const stored = localStorage.getItem(this.assignmentsStorageKey);
            if (!stored) return {};

            const parsed = JSON.parse(stored) as Record<string, A[]>;

            // Hydrate date fields
            for (const projectId of Object.keys(parsed)) {
                parsed[projectId] = parsed[projectId].map(a => {
                    const obj = a as unknown as Record<string, unknown>;
                    return hydrateDates(obj, ['assignedAt', 'updatedAt']) as unknown as A;
                });
            }

            return parsed;
        } catch {
            return {};
        }
    }

    /** Load sessions from localStorage */
    protected loadSessionsFromStorage(): Record<string, ExecutionSession[]> {
        try {
            const stored = localStorage.getItem(this.sessionsStorageKey);
            if (!stored) return {};

            const parsed = JSON.parse(stored) as Record<string, ExecutionSession[]>;

            // Hydrate date fields
            for (const assignmentId of Object.keys(parsed)) {
                parsed[assignmentId] = parsed[assignmentId].map(s => {
                    const obj = s as unknown as Record<string, unknown>;
                    return hydrateDates(obj, ['createdAt', 'updatedAt']) as unknown as ExecutionSession;
                });
            }

            return parsed;
        } catch {
            return {};
        }
    }

    // ========================================================================
    // UTILITY METHODS
    // ========================================================================

    /** Get assignment by ID */
    getAssignmentById(assignmentId: string): A | null {
        const state = this.get();
        for (const assignments of Object.values(state.assignmentsByProject)) {
            const found = assignments.find(a => a.id === assignmentId);
            if (found) return found;
        }
        return null;
    }

    /** Get session by ID */
    getSessionById(sessionId: string): ExecutionSession | null {
        const state = this.get();
        for (const sessions of Object.values(state.sessionsByAssignment)) {
            const found = sessions.find(s => s.id === sessionId);
            if (found) return found;
        }
        return null;
    }

    /** Get session count for an assignment */
    getSessionCount(assignmentId: string): number {
        const state = this.get();
        return state.sessionsByAssignment[assignmentId]?.length ?? 0;
    }
}

// ============================================================================
// HELPER FUNCTION TO CREATE INITIAL STATE
// ============================================================================

export function createBaseAssignmentState<A extends BaseAssignment>(): BaseAssignmentState<A> {
    return {
        assignmentsByProject: {},
        sessionsByAssignment: {},
        selectedAssignmentId: null,
        selectedSessionId: null,
        loading: {
            assignments: false,
            sessions: false,
        },
        errors: {
            assignments: null,
            sessions: null,
        },
    };
}
