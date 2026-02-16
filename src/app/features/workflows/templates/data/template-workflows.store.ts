import { Injectable } from '@angular/core';
import { ComponentStore } from '@ngrx/component-store';
import { tap } from 'rxjs/operators';
import { Observable } from 'rxjs';
import {
    TemplateWorkflow,
    TemplateAssignment,
    TemplateExecutionSession,
    WorkflowStatus,
    TemplateWorkflowSummary,
    CompositeWorkflow,
    MicroWorkflow,
    PortDataScopeConfig,
} from '../interfaces/template-workflow.interface';

// ============================================================================
// STATE INTERFACE
// ============================================================================

export interface TemplateWorkflowsState {
    /** All template workflows */
    templates: TemplateWorkflow[];
    /** Composite workflows (Tier 2) */
    composites: CompositeWorkflow[];
    /** Micro workflows (Tier 1) */
    micros: MicroWorkflow[];
    /** Template assignments by project ID */
    assignmentsByProject: Record<string, TemplateAssignment[]>;
    /** Execution sessions by assignment ID */
    sessionsByAssignment: Record<string, TemplateExecutionSession[]>;
    /** Currently selected template ID */
    selectedTemplateId: string | null;
    /** Currently selected assignment ID */
    selectedAssignmentId: string | null;
    /** Currently selected session ID */
    selectedSessionId: string | null;
    /** Loading states */
    loading: {
        templates: boolean;
        assignments: boolean;
        sessions: boolean;
    };
    /** Error states */
    errors: {
        templates: string | null;
        assignments: string | null;
        sessions: string | null;
    };
}

const initialState: TemplateWorkflowsState = {
    templates: [],
    composites: [],
    micros: [],
    assignmentsByProject: {},
    sessionsByAssignment: {},
    selectedTemplateId: null,
    selectedAssignmentId: null,
    selectedSessionId: null,
    loading: {
        templates: false,
        assignments: false,
        sessions: false,
    },
    errors: {
        templates: null,
        assignments: null,
        sessions: null,
    },
};

// ============================================================================
// STORAGE KEYS
// ============================================================================

const TEMPLATES_STORAGE_KEY = 'template_workflows_v1';
const ASSIGNMENTS_STORAGE_KEY = 'template_assignments_v1';
const SESSIONS_STORAGE_KEY = 'template_sessions_v1';
const COMPOSITES_STORAGE_KEY = 'composite_workflows_v1';
const MICROS_STORAGE_KEY = 'micro_workflows_v1';

// ============================================================================
// STORE
// ============================================================================

@Injectable({ providedIn: 'root' })
export class TemplateWorkflowsStore extends ComponentStore<TemplateWorkflowsState> {
    constructor() {
        super(initialState);
        this.loadFromStorage();
    }

    // ========================================================================
    // SELECTORS
    // ========================================================================

    // Templates
    readonly templates$ = this.select(state => state.templates);
    readonly publishedTemplates$ = this.select(state => 
        state.templates.filter(t => t.status === WorkflowStatus.PUBLISHED)
    );
    readonly selectedTemplateId$ = this.select(state => state.selectedTemplateId);
    readonly selectedTemplate$ = this.select(
        this.templates$,
        this.selectedTemplateId$,
        (templates, id) => templates.find(t => t.id === id) ?? null
    );

    // Composites
    readonly composites$ = this.select(state => state.composites);
    readonly publishedComposites$ = this.select(state =>
        state.composites.filter(c => c.status === WorkflowStatus.PUBLISHED)
    );

    // Micros
    readonly micros$ = this.select(state => state.micros);
    readonly publishedMicros$ = this.select(state =>
        state.micros.filter(m => m.status === WorkflowStatus.PUBLISHED)
    );

    // Assignments
    readonly allAssignments$ = this.select(state => state.assignmentsByProject);
    readonly selectedAssignmentId$ = this.select(state => state.selectedAssignmentId);

    // Sessions
    readonly allSessions$ = this.select(state => state.sessionsByAssignment);
    readonly selectedSessionId$ = this.select(state => state.selectedSessionId);
    readonly selectedSession$ = this.select(
        this.allSessions$,
        this.selectedSessionId$,
        (sessionsByAssignment, id) => {
            if (!id) return null;
            for (const sessions of Object.values(sessionsByAssignment)) {
                const found = sessions.find(s => s.id === id);
                if (found) return found;
            }
            return null;
        }
    );

    // Loading
    readonly loadingTemplates$ = this.select(state => state.loading.templates);
    readonly loadingAssignments$ = this.select(state => state.loading.assignments);
    readonly loadingSessions$ = this.select(state => state.loading.sessions);

    // Errors
    readonly errorsTemplates$ = this.select(state => state.errors.templates);
    readonly errorsAssignments$ = this.select(state => state.errors.assignments);

    // ========================================================================
    // PARAMETERIZED SELECTORS
    // ========================================================================

    selectAssignmentsByProject(projectId: string): Observable<TemplateAssignment[]> {
        return this.select(state => state.assignmentsByProject[projectId] ?? []);
    }

    selectEnabledAssignmentsByProject(projectId: string): Observable<TemplateAssignment[]> {
        return this.select(state => 
            (state.assignmentsByProject[projectId] ?? []).filter(a => a.enabled)
        );
    }

    selectSessionsByAssignment(assignmentId: string): Observable<TemplateExecutionSession[]> {
        return this.select(state => state.sessionsByAssignment[assignmentId] ?? []);
    }

    selectTemplateById(templateId: string): Observable<TemplateWorkflow | null> {
        return this.select(state => state.templates.find(t => t.id === templateId) ?? null);
    }

    selectCompositeById(compositeId: string): Observable<CompositeWorkflow | null> {
        return this.select(state => state.composites.find(c => c.id === compositeId) ?? null);
    }

    selectMicroById(microId: string): Observable<MicroWorkflow | null> {
        return this.select(state => state.micros.find(m => m.id === microId) ?? null);
    }

    // ========================================================================
    // TEMPLATE UPDATERS
    // ========================================================================

    readonly setTemplates = this.updater((state, templates: TemplateWorkflow[]) => {
        const newState = { ...state, templates };
        this.persistTemplates(newState);
        return newState;
    });

    readonly addTemplate = this.updater((state, template: TemplateWorkflow) => {
        const newState = {
            ...state,
            templates: [...state.templates, template],
        };
        this.persistTemplates(newState);
        return newState;
    });

    readonly updateTemplate = this.updater((state, { id, changes }: { id: string; changes: Partial<TemplateWorkflow> }) => {
        const newState = {
            ...state,
            templates: state.templates.map(t =>
                t.id === id ? { ...t, ...changes, metadata: { ...t.metadata, updatedAt: new Date().toISOString() } } : t
            ),
        };
        this.persistTemplates(newState);
        return newState;
    });

    readonly removeTemplate = this.updater((state, id: string) => {
        const newState = {
            ...state,
            templates: state.templates.filter(t => t.id !== id),
        };
        this.persistTemplates(newState);
        return newState;
    });

    readonly selectTemplate = this.updater((state, id: string | null) => ({
        ...state,
        selectedTemplateId: id,
    }));

    // ========================================================================
    // COMPOSITE UPDATERS
    // ========================================================================

    readonly setComposites = this.updater((state, composites: CompositeWorkflow[]) => {
        const newState = { ...state, composites };
        this.persistComposites(newState);
        return newState;
    });

    readonly addComposite = this.updater((state, composite: CompositeWorkflow) => {
        const newState = {
            ...state,
            composites: [...state.composites, composite],
        };
        this.persistComposites(newState);
        return newState;
    });

    readonly updateComposite = this.updater((state, { id, changes }: { id: string; changes: Partial<CompositeWorkflow> }) => {
        const newState = {
            ...state,
            composites: state.composites.map(c =>
                c.id === id ? { ...c, ...changes, metadata: { ...c.metadata, updatedAt: new Date().toISOString() } } : c
            ),
        };
        this.persistComposites(newState);
        return newState;
    });

    readonly removeComposite = this.updater((state, id: string) => {
        const newState = {
            ...state,
            composites: state.composites.filter(c => c.id !== id),
        };
        this.persistComposites(newState);
        return newState;
    });

    // ========================================================================
    // MICRO UPDATERS
    // ========================================================================

    readonly setMicros = this.updater((state, micros: MicroWorkflow[]) => {
        const newState = { ...state, micros };
        this.persistMicros(newState);
        return newState;
    });

    readonly addMicro = this.updater((state, micro: MicroWorkflow) => {
        const newState = {
            ...state,
            micros: [...state.micros, micro],
        };
        this.persistMicros(newState);
        return newState;
    });

    readonly updateMicro = this.updater((state, { id, changes }: { id: string; changes: Partial<MicroWorkflow> }) => {
        const newState = {
            ...state,
            micros: state.micros.map(m =>
                m.id === id ? { ...m, ...changes, metadata: { ...m.metadata, updatedAt: new Date().toISOString() } } : m
            ),
        };
        this.persistMicros(newState);
        return newState;
    });

    readonly removeMicro = this.updater((state, id: string) => {
        const newState = {
            ...state,
            micros: state.micros.filter(m => m.id !== id),
        };
        this.persistMicros(newState);
        return newState;
    });

    // ========================================================================
    // ASSIGNMENT UPDATERS
    // ========================================================================

    readonly setAssignments = this.updater((state, { projectId, assignments }: { projectId: string; assignments: TemplateAssignment[] }) => {
        const newState = {
            ...state,
            assignmentsByProject: {
                ...state.assignmentsByProject,
                [projectId]: assignments,
            },
        };
        this.persistAssignments(newState);
        return newState;
    });

    readonly addAssignment = this.updater((state, assignment: TemplateAssignment) => {
        const existing = state.assignmentsByProject[assignment.projectId] ?? [];
        const newState = {
            ...state,
            assignmentsByProject: {
                ...state.assignmentsByProject,
                [assignment.projectId]: [...existing, assignment],
            },
        };
        this.persistAssignments(newState);
        return newState;
    });

    readonly updateAssignment = this.updater((state, { projectId, assignmentId, changes }: {
        projectId: string;
        assignmentId: string;
        changes: Partial<TemplateAssignment>;
    }) => {
        const existing = state.assignmentsByProject[projectId] ?? [];
        const newState = {
            ...state,
            assignmentsByProject: {
                ...state.assignmentsByProject,
                [projectId]: existing.map(a =>
                    a.id === assignmentId ? { ...a, ...changes, updatedAt: new Date().toISOString() } : a
                ),
            },
        };
        this.persistAssignments(newState);
        return newState;
    });

    readonly removeAssignment = this.updater((state, { projectId, assignmentId }: { projectId: string; assignmentId: string }) => {
        const existing = state.assignmentsByProject[projectId] ?? [];
        const newState = {
            ...state,
            assignmentsByProject: {
                ...state.assignmentsByProject,
                [projectId]: existing.filter(a => a.id !== assignmentId),
            },
        };
        this.persistAssignments(newState);
        return newState;
    });

    readonly toggleAssignmentEnabled = this.updater((state, { projectId, assignmentId }: { projectId: string; assignmentId: string }) => {
        const existing = state.assignmentsByProject[projectId] ?? [];
        const newState = {
            ...state,
            assignmentsByProject: {
                ...state.assignmentsByProject,
                [projectId]: existing.map(a =>
                    a.id === assignmentId ? { ...a, enabled: !a.enabled, updatedAt: new Date().toISOString() } : a
                ),
            },
        };
        this.persistAssignments(newState);
        return newState;
    });

    readonly updateAssignmentScopes = this.updater((state, { projectId, assignmentId, portDataScopes }: { 
        projectId: string; 
        assignmentId: string; 
        portDataScopes: PortDataScopeConfig[];
    }) => {
        const existing = state.assignmentsByProject[projectId] ?? [];
        const newState = {
            ...state,
            assignmentsByProject: {
                ...state.assignmentsByProject,
                [projectId]: existing.map(a =>
                    a.id === assignmentId ? { ...a, portDataScopes, updatedAt: new Date().toISOString() } : a
                ),
            },
        };
        this.persistAssignments(newState);
        return newState;
    });

    readonly selectAssignment = this.updater((state, id: string | null) => ({
        ...state,
        selectedAssignmentId: id,
        selectedSessionId: null,
    }));

    // ========================================================================
    // SESSION UPDATERS
    // ========================================================================

    readonly addSession = this.updater((state, session: TemplateExecutionSession) => {
        const existing = state.sessionsByAssignment[session.assignmentId] ?? [];
        const newState = {
            ...state,
            sessionsByAssignment: {
                ...state.sessionsByAssignment,
                [session.assignmentId]: [...existing, session],
            },
        };
        this.persistSessions(newState);
        return newState;
    });

    readonly updateSession = this.updater((state, { assignmentId, sessionId, changes }: {
        assignmentId: string;
        sessionId: string;
        changes: Partial<TemplateExecutionSession>;
    }) => {
        const existing = state.sessionsByAssignment[assignmentId] ?? [];
        const newState = {
            ...state,
            sessionsByAssignment: {
                ...state.sessionsByAssignment,
                [assignmentId]: existing.map(s =>
                    s.id === sessionId ? { ...s, ...changes, updatedAt: new Date().toISOString() } : s
                ),
            },
        };
        this.persistSessions(newState);
        return newState;
    });

    readonly removeSession = this.updater((state, { assignmentId, sessionId }: { assignmentId: string; sessionId: string }) => {
        const existing = state.sessionsByAssignment[assignmentId] ?? [];
        const newState = {
            ...state,
            sessionsByAssignment: {
                ...state.sessionsByAssignment,
                [assignmentId]: existing.filter(s => s.id !== sessionId),
            },
            selectedSessionId: state.selectedSessionId === sessionId ? null : state.selectedSessionId,
        };
        this.persistSessions(newState);
        return newState;
    });

    readonly selectSession = this.updater((state, id: string | null) => ({
        ...state,
        selectedSessionId: id,
    }));

    // ========================================================================
    // EFFECTS
    // ========================================================================

    readonly assignTemplate = this.effect<{
        projectId: string;
        templateId: string;
        templateName: string;
        portDataScopes?: PortDataScopeConfig[];
        assignedBy?: string;
        configuration?: Record<string, unknown>;
    }>(params$ =>
        params$.pipe(
            tap(({ projectId, templateId, templateName, portDataScopes, assignedBy, configuration }) => {
                const assignment: TemplateAssignment = {
                    id: `tpl-assign-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`,
                    projectId,
                    templateId,
                    templateName,
                    enabled: true,
                    portDataScopes: portDataScopes ?? [],
                    configuration,
                    assignedAt: new Date().toISOString(),
                    assignedBy,
                };
                this.addAssignment(assignment);
            })
        )
    );

    readonly createSession = this.effect<{
        assignmentId: string;
        projectId: string;
        name?: string;
        createdBy?: string;
    }>(params$ =>
        params$.pipe(
            tap(({ assignmentId, projectId, name, createdBy }) => {
                const now = new Date().toISOString();
                const session: TemplateExecutionSession = {
                    id: `tpl-session-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`,
                    assignmentId,
                    projectId,
                    name: name ?? `Session ${new Date().toLocaleString()}`,
                    status: 'idle',
                    context: {
                        projectId,
                        sessionId: '',
                        assignmentId,
                        userId: createdBy ?? '',
                        inputs: {},
                        outputs: {},
                    },
                    createdAt: now,
                    updatedAt: now,
                    createdBy,
                };
                session.context.sessionId = session.id;
                this.addSession(session);
                this.selectSession(session.id);
            })
        )
    );

    // ========================================================================
    // LOADING STATE UPDATERS
    // ========================================================================

    readonly setLoadingTemplates = this.updater((state, loading: boolean) => ({
        ...state,
        loading: { ...state.loading, templates: loading },
    }));

    readonly setLoadingAssignments = this.updater((state, loading: boolean) => ({
        ...state,
        loading: { ...state.loading, assignments: loading },
    }));

    readonly setLoadingSessions = this.updater((state, loading: boolean) => ({
        ...state,
        loading: { ...state.loading, sessions: loading },
    }));

    readonly setErrorTemplates = this.updater((state, error: string | null) => ({
        ...state,
        errors: { ...state.errors, templates: error },
    }));

    readonly setErrorAssignments = this.updater((state, error: string | null) => ({
        ...state,
        errors: { ...state.errors, assignments: error },
    }));

    // ========================================================================
    // HELPER METHODS
    // ========================================================================

    /** Get all templates synchronously */
    getTemplates(): TemplateWorkflow[] {
        return this.get().templates;
    }

    /** Get all composites synchronously */
    getComposites(): CompositeWorkflow[] {
        return this.get().composites;
    }

    /** Get all micros synchronously */
    getMicros(): MicroWorkflow[] {
        return this.get().micros;
    }

    getTemplateById(id: string): TemplateWorkflow | null {
        return this.get().templates.find(t => t.id === id) ?? null;
    }

    getCompositeById(id: string): CompositeWorkflow | null {
        return this.get().composites.find(c => c.id === id) ?? null;
    }

    getMicroById(id: string): MicroWorkflow | null {
        return this.get().micros.find(m => m.id === id) ?? null;
    }

    getAssignmentsForProject(projectId: string): TemplateAssignment[] {
        return this.get().assignmentsByProject[projectId] ?? [];
    }

    getSessionsForAssignment(assignmentId: string): TemplateExecutionSession[] {
        return this.get().sessionsByAssignment[assignmentId] ?? [];
    }

    /** Get template summaries for selection dialogs */
    getTemplateSummaries(): TemplateWorkflowSummary[] {
        return this.get().templates
            .filter(t => t.status === WorkflowStatus.PUBLISHED)
            .map(t => ({
                id: t.id,
                name: t.name,
                description: t.description,
                status: t.status,
                presentationPattern: t.presentationPattern,
                layout: t.uiTemplate.layout,
                componentTypes: t.uiTemplate.components.map(c => c.type),
                updatedAt: t.metadata.updatedAt,
            }));
    }

    // ========================================================================
    // PERSISTENCE
    // ========================================================================

    private loadFromStorage(): void {
        try {
            // Load templates
            const storedTemplates = localStorage.getItem(TEMPLATES_STORAGE_KEY);
            if (storedTemplates) {
                const templates = JSON.parse(storedTemplates) as TemplateWorkflow[];
                this.patchState({ templates });
            }

            // Load composites
            const storedComposites = localStorage.getItem(COMPOSITES_STORAGE_KEY);
            if (storedComposites) {
                const composites = JSON.parse(storedComposites) as CompositeWorkflow[];
                this.patchState({ composites });
            }

            // Load micros
            const storedMicros = localStorage.getItem(MICROS_STORAGE_KEY);
            if (storedMicros) {
                const micros = JSON.parse(storedMicros) as MicroWorkflow[];
                this.patchState({ micros });
            }

            // Load assignments
            const storedAssignments = localStorage.getItem(ASSIGNMENTS_STORAGE_KEY);
            if (storedAssignments) {
                const assignmentsByProject = JSON.parse(storedAssignments) as Record<string, TemplateAssignment[]>;
                this.patchState({ assignmentsByProject });
            }

            // Load sessions
            const storedSessions = localStorage.getItem(SESSIONS_STORAGE_KEY);
            if (storedSessions) {
                const sessionsByAssignment = JSON.parse(storedSessions) as Record<string, TemplateExecutionSession[]>;
                this.patchState({ sessionsByAssignment });
            }
        } catch (e) {
            console.warn('Failed to load template workflows from storage:', e);
        }
    }

    private persistTemplates(state: TemplateWorkflowsState): void {
        try {
            localStorage.setItem(TEMPLATES_STORAGE_KEY, JSON.stringify(state.templates));
        } catch (e) {
            console.warn('Failed to persist templates:', e);
        }
    }

    private persistComposites(state: TemplateWorkflowsState): void {
        try {
            localStorage.setItem(COMPOSITES_STORAGE_KEY, JSON.stringify(state.composites));
        } catch (e) {
            console.warn('Failed to persist composites:', e);
        }
    }

    private persistMicros(state: TemplateWorkflowsState): void {
        try {
            localStorage.setItem(MICROS_STORAGE_KEY, JSON.stringify(state.micros));
        } catch (e) {
            console.warn('Failed to persist micros:', e);
        }
    }

    private persistAssignments(state: TemplateWorkflowsState): void {
        try {
            localStorage.setItem(ASSIGNMENTS_STORAGE_KEY, JSON.stringify(state.assignmentsByProject));
        } catch (e) {
            console.warn('Failed to persist assignments:', e);
        }
    }

    private persistSessions(state: TemplateWorkflowsState): void {
        try {
            localStorage.setItem(SESSIONS_STORAGE_KEY, JSON.stringify(state.sessionsByAssignment));
        } catch (e) {
            console.warn('Failed to persist sessions:', e);
        }
    }
}
