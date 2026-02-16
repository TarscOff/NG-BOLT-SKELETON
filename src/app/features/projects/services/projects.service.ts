import { Inject, Injectable } from "@angular/core";
import { CoreOptions } from "@cadai/pxs-ng-core/interfaces";
import { CORE_OPTIONS } from "@cadai/pxs-ng-core/tokens";
import {
    FileItem,
    HistoryItem,
    Member,
    ProjectDto,
    ProjectArtifactsTypesDto,
    WorkflowItem,
    ProjectSessionDto,
    ProjectTemplateDto,
    ProjectTemplateConfigDto,
    SessionChatHistoryDto,
    SessionChatHistoryContentDto,
    ChatMessageDto,
    ProjectSessionStatusDto,
    ProjectSessionVisibility,
    UpdateSessionNameDto,
    ArtifactsDataDto,
    ChatMessageResponseDto
} from "../interfaces/project.model";
import { catchError, map, Observable, of, throwError } from "rxjs";
import { HttpClient } from "@angular/common/http";
import { DateTime } from "luxon";

@Injectable({
    providedIn: 'root',
})
export class ProjectsService {
    private readonly localProjectsStorageKey = 'local_projects_v1';
    private readonly localProjectSessionsStorageKey = 'local_project_sessions_v1';
    private readonly localProjectArtifactsStorageKey = 'local_project_artifacts_v1';

    constructor(
        private http: HttpClient,
        @Inject(CORE_OPTIONS) private readonly coreOpts: Required<CoreOptions>,
    ) { }

    /**
     * Get base API URL for templates
     */
    private get base(): string {
        const apiUrl = this.coreOpts.environments.apiUrl;
        if (!apiUrl) throw new Error('Runtime config missing: apiUrl');
        return `${apiUrl}`;
    }

    getProjectsList(): Observable<ProjectDto[]> {
        const url = `${this.base}/projects`;
        return this.http.get<ProjectDto[]>(url).pipe(
            map(remoteProjects => this.mergeWithLocalProjects(remoteProjects)),
            catchError(() => of(this.getLocalProjects()))
        );
    }

    deleteProject(projectId: string): Observable<void> {
        if (this.removeLocalProject(projectId)) {
            return of(void 0);
        }
        const url = `${this.base}/projects/${projectId}`;
        return this.http.delete<void>(url);
    }

    createProject(payload: {
        name: string;
        description?: string;
        metadata?: Record<string, unknown>;
    }): Observable<ProjectDto> {
        const url = `${this.base}/projects`;
        const requestPayload: Record<string, unknown> = {
            name: payload.name,
        };
        if (payload.description) requestPayload['description'] = payload.description;
        if (payload.metadata) requestPayload['metadata'] = payload.metadata;

        return this.http.post<ProjectDto>(url, requestPayload).pipe(
            map(project => {
                this.upsertLocalProject(project);
                return project;
            }),
            catchError(() => {
                const localProject = this.createLocalProject(payload);
                this.upsertLocalProject(localProject);
                return of(localProject);
            })
        );
    }

    getProjectTemplates(projectId: string): Observable<ProjectTemplateDto[]> {
        const url = `${this.base}/projects/${projectId}/templates`;
        return this.http.get<ProjectTemplateDto[]>(url);
    }

    getTemplateConfiguration(projectId: string, templateId: string): Observable<ProjectTemplateConfigDto> {
        const url = `${this.base}/projects/${projectId}/templates/${templateId}`;
        return this.http.get(url, {
            responseType: 'text'
        }).pipe(
            map((response: string) => {
                const parts = this.parseMultipartFormData(response);
                return {
                    template_metadata: JSON.parse(parts['template_metadata']),
                    workflow_configuration: JSON.parse(parts['workflow_configuration']),
                    workflow_structure: JSON.parse(parts['workflow_structure'])
                } as ProjectTemplateConfigDto;
            })
        );
    }

    private parseMultipartFormData(text: string): Record<string, string> {
        const parts: Record<string, string> = {};
        const boundary = text.split('\r\n')[0];
        const sections = text.split(boundary).filter(s => s.trim() && !s.includes('--'));

        sections.forEach(section => {
            const nameMatch = section.match(/name="([^"]+)"/);
            const contentMatch = section.split('\r\n\r\n')[1]?.trim();

            if (nameMatch && contentMatch) {
                parts[nameMatch[1]] = contentMatch.replace(/\r\n--.*$/, '');
            }
        });

        return parts;
    }

    getProjectsFilesInfo(projectId: string): Observable<ProjectArtifactsTypesDto[]> {
        const localArtifacts = this.getLocalProjectArtifacts(projectId);
        if (this.isLocalProjectId(projectId)) {
            return of(this.buildLocalArtifactsTypes(localArtifacts));
        }

        const url = `${this.base}/projects/${projectId}/artifacts/types`;
        return this.http.get<ProjectArtifactsTypesDto[]>(url).pipe(
            catchError(() => of(this.buildLocalArtifactsTypes(localArtifacts)))
        );
    }

    getProjectsFilesData(projectId: string): Observable<ArtifactsDataDto[]> {
        const localArtifacts = this.getLocalProjectArtifacts(projectId);
        if (this.isLocalProjectId(projectId)) {
            return of(localArtifacts);
        }

        const url = `${this.base}/projects/${projectId}/artifacts`;
        return this.http.get<ArtifactsDataDto[]>(url).pipe(
            catchError(() => of(localArtifacts))
        );
    }

    getProjectsSessions(projectId: string): Observable<ProjectSessionDto[]> {
        const localSessions = this.getLocalProjectSessions(projectId);
        if (this.isLocalProjectId(projectId)) {
            return of(localSessions);
        }

        const url = `${this.base}/projects/${projectId}/sessions`;
        return this.http.get<ProjectSessionDto[]>(url).pipe(
            catchError(() => of(localSessions))
        );
    }

    createProjectsSessions(projectId: string): Observable<ProjectSessionDto> {
        if (this.isLocalProjectId(projectId)) {
            return of(this.createAndStoreLocalSession(projectId));
        }

        const url = `${this.base}/projects/${projectId}/session`;
        return this.http.post<ProjectSessionDto>(url, {
            "session_visibility": "none"
        }).pipe(
            map(session => {
                this.upsertLocalProjectSession(projectId, session);
                return session;
            }),
            catchError(() => of(this.createAndStoreLocalSession(projectId)))
        );
    }

    getSessionById(sessionId: string): Observable<ProjectSessionDto> {
        const localSession = this.findLocalSessionById(sessionId);
        if (localSession) {
            return of(localSession);
        }

        const url = `${this.base}/sessions/${sessionId}`;
        return this.http.get<ProjectSessionDto>(url).pipe(
            catchError(() => {
                const fallback = this.findLocalSessionById(sessionId);
                return fallback ? of(fallback) : throwError(() => new Error('Session not found'));
            })
        );
    }

    getSessionArtifacts(sessionId: string): Observable<ArtifactsDataDto[]> {
        const localArtifacts = this.getLocalSessionArtifacts(sessionId);
        const localSession = this.findLocalSessionById(sessionId);
        if (localSession) {
            return of(localArtifacts);
        }

        const url = `${this.base}/sessions/${sessionId}/artifacts`;
        return this.http.get<ArtifactsDataDto[]>(url).pipe(
            catchError(() => of(localArtifacts))
        );
    }

    getSessionStatusById(sessionId: string): Observable<ProjectSessionStatusDto> {
        const localSession = this.findLocalSessionById(sessionId);
        if (localSession) {
            return of(this.buildLocalSessionStatus(localSession));
        }

        const url = `${this.base}/sessions/${sessionId}/status`;
        return this.http.get<ProjectSessionStatusDto>(url).pipe(
            map(status => this.normalizeSessionStatus(status, sessionId)),
            catchError(() => {
                const fallback = this.findLocalSessionById(sessionId);
                return fallback
                    ? of(this.buildLocalSessionStatus(fallback))
                    : of(this.buildUnavailableSessionStatus(sessionId));
            })
        );
    }

    updateSessionName(sessionId: string, payload: { session_name: string, session_visibility: "none" | string }): Observable<UpdateSessionNameDto> {
        const localUpdated = this.updateLocalSessionName(sessionId, payload.session_name, payload.session_visibility);
        if (localUpdated) {
            return of(localUpdated);
        }

        const url = `${this.base}/sessions/${sessionId}`;
        return this.http.patch<UpdateSessionNameDto>(url, payload).pipe(
            catchError(() => {
                const fallback = this.updateLocalSessionName(sessionId, payload.session_name, payload.session_visibility);
                return fallback
                    ? of(fallback)
                    : throwError(() => new Error('Failed to update session name'));
            })
        );
    }

    deleteSessionById(sessionId: string): Observable<void> {
        if (this.removeLocalSessionById(sessionId)) {
            return of(void 0);
        }

        const url = `${this.base}/sessions/${sessionId}`;
        return this.http.delete<void>(url).pipe(
            catchError(() => {
                if (this.removeLocalSessionById(sessionId)) {
                    return of(void 0);
                }
                return throwError(() => new Error('Failed to delete session'));
            })
        );
    }

    getChatHistory(sessionId: string): Observable<SessionChatHistoryDto[]> {
        const localSession = this.findLocalSessionById(sessionId);
        if (localSession) {
            return of([]);
        }

        const url = `${this.base}/sessions/${sessionId}/artifacts/chat_history`;
        return this.http.get<SessionChatHistoryDto[]>(url).pipe(
            catchError(() => of([]))
        );
    }

    getChatHistoryDataContent(artifactId: string): Observable<ChatMessageDto[]> {
        return this.getArtifactContent(artifactId).pipe(
            map(content => content.messages),
            catchError(() => of([]))
        );
    }

    getArtifactContent(artifactId: string): Observable<SessionChatHistoryContentDto> {
        const url = `${this.base}/artifacts/${artifactId}/data`;
        return this.http.get<SessionChatHistoryContentDto>(url).pipe(
            catchError(() => of({ messages: [] }))
        );
    }

    sendMessage(
        projectId: string,
        sessionId: string,
        templateId: string,
        content: string
    ): Observable<ChatMessageResponseDto> {
        if (!content.trim()) {
            return throwError(() => new Error('No content to send'));
        }

        if (this.isLocalProjectId(projectId) || !!this.findLocalSessionById(sessionId)) {
            return of(this.buildMockChatMessageResponse(templateId));
        }

        // TODO. this is hardcoded, should be removed in the future and only handled on BE side
        const messageInputId = "6c34cfd1-ac55-492c-b730-4f3815a2309d";
        const userPromptId = "c9d2e9dd-77c8-4c72-8157-cc079498994b";

        const textFormData = new FormData();
        textFormData.append(messageInputId, content);
        textFormData.append(userPromptId, content);

        const textEndpoint = `${this.base}/sessions/${sessionId}/execute/${templateId}`;
        return this.http.post<ChatMessageResponseDto>(textEndpoint, textFormData).pipe(
            catchError(() => of(this.buildMockChatMessageResponse(templateId)))
        );
    }

    submitArtifacts(
        sessionId: string,
        fileTemplateId: string,
        files: File[]
    ): Observable<ChatMessageResponseDto> {
        if (!files || files.length === 0) {
            return throwError(() => new Error('No files to upload'));
        }

        if (this.findLocalSessionById(sessionId)) {
            return of(this.buildMockChatMessageResponse(fileTemplateId));
        }

        // TODO. this is hardcoded, should be removed in the future and only handled on BE side
        const fileInputId = "442f052c-f371-4b30-8f97-89109cc61fb2";

        const fileFormData = new FormData();
        files.forEach((file) => {
            fileFormData.append(fileInputId, file);
        });
        const fileEndpoint = `${this.base}/sessions/${sessionId}/execute/${fileTemplateId}`;
        return this.http.post<ChatMessageResponseDto>(fileEndpoint, fileFormData).pipe(
            catchError(() => of(this.buildMockChatMessageResponse(fileTemplateId)))
        );
    }

    private mergeWithLocalProjects(remoteProjects: ProjectDto[]): ProjectDto[] {
        const mergedById = new Map<string, ProjectDto>();
        for (const project of remoteProjects ?? []) {
            mergedById.set(project.project_id, project);
        }
        for (const project of this.getLocalProjects()) {
            if (!mergedById.has(project.project_id)) {
                mergedById.set(project.project_id, project);
            }
        }
        return [...mergedById.values()];
    }

    private getLocalProjects(): ProjectDto[] {
        try {
            const raw = localStorage.getItem(this.localProjectsStorageKey);
            if (!raw) return [];
            const parsed = JSON.parse(raw);
            if (!Array.isArray(parsed)) return [];
            return parsed.filter(project =>
                !!project &&
                typeof project === 'object' &&
                typeof project.project_id === 'string' &&
                typeof project.name === 'string'
            ) as ProjectDto[];
        } catch {
            return [];
        }
    }

    private setLocalProjects(projects: ProjectDto[]): void {
        try {
            localStorage.setItem(this.localProjectsStorageKey, JSON.stringify(projects));
        } catch {
            // Ignore localStorage errors
        }
    }

    private upsertLocalProject(project: ProjectDto): void {
        const current = this.getLocalProjects();
        const next = [
            project,
            ...current.filter(existing => existing.project_id !== project.project_id),
        ];
        this.setLocalProjects(next);
    }

    private removeLocalProject(projectId: string): boolean {
        const current = this.getLocalProjects();
        const next = current.filter(project => project.project_id !== projectId);
        if (next.length === current.length) {
            return false;
        }
        this.setLocalProjects(next);
        this.removeLocalProjectSessions(projectId);
        this.removeLocalProjectArtifacts(projectId);
        return true;
    }

    private createLocalProject(payload: {
        name: string;
        description?: string;
    }): ProjectDto {
        const now = new Date().toISOString();
        return {
            project_id: `local-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
            name: payload.name.trim(),
            owner: 'local-user',
            client_id: 'local',
            roles: [],
            created_on: now,
        };
    }

    private isLocalProjectId(projectId: string): boolean {
        return projectId.startsWith('local-');
    }

    private getLocalSessionsByProjectMap(): Record<string, ProjectSessionDto[]> {
        try {
            const raw = localStorage.getItem(this.localProjectSessionsStorageKey);
            if (!raw) return {};
            const parsed = JSON.parse(raw);
            if (!parsed || typeof parsed !== 'object') return {};
            return parsed as Record<string, ProjectSessionDto[]>;
        } catch {
            return {};
        }
    }

    private setLocalSessionsByProjectMap(map: Record<string, ProjectSessionDto[]>): void {
        try {
            localStorage.setItem(this.localProjectSessionsStorageKey, JSON.stringify(map));
        } catch {
            // Ignore localStorage errors
        }
    }

    private getLocalProjectSessions(projectId: string): ProjectSessionDto[] {
        return this.getLocalSessionsByProjectMap()[projectId] ?? [];
    }

    private upsertLocalProjectSession(projectId: string, session: ProjectSessionDto): void {
        const map = this.getLocalSessionsByProjectMap();
        const existing = map[projectId] ?? [];
        map[projectId] = [
            session,
            ...existing.filter(item => item.session_id !== session.session_id),
        ];
        this.setLocalSessionsByProjectMap(map);
    }

    private createAndStoreLocalSession(projectId: string): ProjectSessionDto {
        const now = new Date().toISOString();
        const session: ProjectSessionDto = {
            created_on: now,
            updated_on: now,
            session_id: `local-session-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
            session_name: `Session ${new Date().toLocaleString()}`,
            session_owner_id: 'local-user',
            session_visibility: ProjectSessionVisibility.SESSION_OWNER,
            user_role: 'owner',
        };
        this.upsertLocalProjectSession(projectId, session);
        return session;
    }

    private removeLocalProjectSessions(projectId: string): void {
        const map = this.getLocalSessionsByProjectMap();
        if (!(projectId in map)) return;
        delete map[projectId];
        this.setLocalSessionsByProjectMap(map);
    }

    private findLocalSessionById(sessionId: string): ProjectSessionDto | null {
        const map = this.getLocalSessionsByProjectMap();
        for (const sessions of Object.values(map)) {
            const found = sessions.find(session => session.session_id === sessionId);
            if (found) return found;
        }
        return null;
    }

    private updateLocalSessionName(
        sessionId: string,
        sessionName: string,
        sessionVisibility: "none" | string
    ): UpdateSessionNameDto | null {
        const map = this.getLocalSessionsByProjectMap();
        for (const [projectId, sessions] of Object.entries(map)) {
            const index = sessions.findIndex(session => session.session_id === sessionId);
            if (index < 0) continue;

            const now = new Date().toISOString();
            const updated: ProjectSessionDto = {
                ...sessions[index],
                session_name: sessionName,
                updated_on: now,
                session_visibility: (sessionVisibility === 'none'
                    ? sessions[index].session_visibility
                    : sessionVisibility) as ProjectSessionVisibility,
            };
            map[projectId] = [
                updated,
                ...sessions.filter(session => session.session_id !== sessionId),
            ];
            this.setLocalSessionsByProjectMap(map);

            return {
                created_on: updated.created_on,
                updated_on: updated.updated_on,
                session_id: updated.session_id,
                session_name: updated.session_name,
                session_owner_id: updated.session_owner_id,
                session_visibility: updated.session_visibility,
                user_role: updated.user_role,
            };
        }
        return null;
    }

    private removeLocalSessionById(sessionId: string): boolean {
        const map = this.getLocalSessionsByProjectMap();
        let updated = false;
        for (const [projectId, sessions] of Object.entries(map)) {
            const next = sessions.filter(session => session.session_id !== sessionId);
            if (next.length === sessions.length) continue;
            map[projectId] = next;
            updated = true;
        }
        if (updated) {
            this.setLocalSessionsByProjectMap(map);
        }
        return updated;
    }

    private getLocalArtifactsByProjectMap(): Record<string, ArtifactsDataDto[]> {
        try {
            const raw = localStorage.getItem(this.localProjectArtifactsStorageKey);
            if (!raw) return {};
            const parsed = JSON.parse(raw);
            if (!parsed || typeof parsed !== 'object') return {};
            return parsed as Record<string, ArtifactsDataDto[]>;
        } catch {
            return {};
        }
    }

    private setLocalArtifactsByProjectMap(map: Record<string, ArtifactsDataDto[]>): void {
        try {
            localStorage.setItem(this.localProjectArtifactsStorageKey, JSON.stringify(map));
        } catch {
            // Ignore localStorage errors
        }
    }

    private getLocalProjectArtifacts(projectId: string): ArtifactsDataDto[] {
        return this.getLocalArtifactsByProjectMap()[projectId] ?? [];
    }

    private getLocalSessionArtifacts(sessionId: string): ArtifactsDataDto[] {
        const localProject = this.findLocalProjectBySessionId(sessionId);
        if (!localProject) return [];
        return this.getLocalProjectArtifacts(localProject);
    }

    private findLocalProjectBySessionId(sessionId: string): string | null {
        const map = this.getLocalSessionsByProjectMap();
        for (const [projectId, sessions] of Object.entries(map)) {
            if (sessions.some(session => session.session_id === sessionId)) {
                return projectId;
            }
        }
        return null;
    }

    private removeLocalProjectArtifacts(projectId: string): void {
        const map = this.getLocalArtifactsByProjectMap();
        if (!(projectId in map)) return;
        delete map[projectId];
        this.setLocalArtifactsByProjectMap(map);
    }

    private buildLocalArtifactsTypes(artifacts: ArtifactsDataDto[]): ProjectArtifactsTypesDto[] {
        if (!artifacts.length) return [];

        const byReference = new Map<string, { total: number; byType: Map<string, number> }>();
        for (const artifact of artifacts) {
            const referenceKey = artifact.data_reference;
            const typeKey = artifact.artifact_type;
            const existing = byReference.get(referenceKey) ?? {
                total: 0,
                byType: new Map<string, number>(),
            };
            existing.total += 1;
            existing.byType.set(typeKey, (existing.byType.get(typeKey) ?? 0) + 1);
            byReference.set(referenceKey, existing);
        }

        return [...byReference.entries()].map(([reference, info]) => ({
            data_reference: reference as never,
            total: info.total,
            artifact_types: [...info.byType.entries()].map(([artifactType, count]) => ({
                artifact_type: artifactType as never,
                type_total: count,
            })),
        }));
    }

    private buildLocalSessionStatus(session: ProjectSessionDto): ProjectSessionStatusDto {
        return {
            session_id: session.session_id,
            updated_on: session.updated_on,
            status: 'not_started',
            workflow_executions: [],
        };
    }

    private buildUnavailableSessionStatus(sessionId: string): ProjectSessionStatusDto {
        return {
            session_id: sessionId,
            updated_on: new Date().toISOString(),
            status: 'not_started',
            workflow_executions: [],
        };
    }

    private normalizeSessionStatus(
        status: ProjectSessionStatusDto | null | undefined,
        sessionId: string
    ): ProjectSessionStatusDto {
        if (!status) {
            return this.buildUnavailableSessionStatus(sessionId);
        }

        return {
            session_id: status.session_id || sessionId,
            updated_on: status.updated_on || new Date().toISOString(),
            status: status.status || 'not_started',
            workflow_executions: Array.isArray(status.workflow_executions)
                ? status.workflow_executions
                : [],
        };
    }

    private buildMockChatMessageResponse(templateId: string): ChatMessageResponseDto {
        const now = DateTime.now();
        return {
            completed_on: now,
            created_on: now,
            updated_on: now,
            workflow_instance_id: `local-workflow-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
            workflow_name: `Local Execution (${templateId})`,
            workflow_status: 'completed',
            tasks: [],
        };
    }


    /*     // TODO: remove this mocked data when API is ready
        private getMockedProjects(): ProjectDto[] {
            return [
                {
                    id: '1',
                    name: 'Lawsuit Analysis',
                    description: 'Description for Lawsuit Analysis project',
                    createdAt: new Date().toISOString(),
                    updatedAt: new Date().toISOString(),
                    createdBy: 'system',
                    filesCount: 10,
                },
                {
                    id: '2',
                    name: 'Contract Review',
                    description: 'Description for Contract Review project',
                    createdAt: new Date().toISOString(),
                    updatedAt: new Date().toISOString(),
                    createdBy: 'system',
                    filesCount: 5,
                },
                {
                    id: '3',
                    name: 'Market Research',
                    description: 'Description for Market Research project',
                    createdAt: new Date().toISOString(),
                    updatedAt: new Date().toISOString(),
                    createdBy: 'system',
                    filesCount: 3,
                },
                {
                    id: '4',
                    name: 'Product Launch',
                    description: 'Description for Product Launch project',
                    createdAt: new Date().toISOString(),
                    updatedAt: new Date().toISOString(),
                    createdBy: 'system',
                    filesCount: 8,
                },
                {
                    id: '5',
                    name: 'Customer Feedback',
                    description: 'Description for Customer Feedback project',
                    createdAt: new Date().toISOString(),
                    updatedAt: new Date().toISOString(),
                    createdBy: 'system',
                    filesCount: 12,
                },
                {
                    id: '6',
                    name: 'Sales Analysis',
                    description: 'Description for Sales Analysis project',
                    createdAt: new Date().toISOString(),
                    updatedAt: new Date().toISOString(),
                    createdBy: 'system',
                    filesCount: 7,
                },
                {
                    id: '7',
                    name: 'Financial Report',
                    description: 'Description for Financial Report project',
                    createdAt: new Date().toISOString(),
                    updatedAt: new Date().toISOString(),
                    createdBy: 'system',
                    filesCount: 4,
                },
                {
                    id: '8',
                    name: 'Employee Training',
                    description: 'Description for Employee Training project',
                    createdAt: new Date().toISOString(),
                    updatedAt: new Date().toISOString(),
                    createdBy: 'system',
                    filesCount: 6,
                },
                {
                    id: '9',
                    name: 'Risk Assessment',
                    description: 'Description for Risk Assessment project',
                    createdAt: new Date().toISOString(),
                    updatedAt: new Date().toISOString(),
                    createdBy: 'system',
                    filesCount: 9,
                },
                {
                    id: '10',
                    name: 'Budget Planning',
                    description: 'Description for Budget Planning project',
                    createdAt: new Date().toISOString(),
                    updatedAt: new Date().toISOString(),
                    createdBy: 'system',
                    filesCount: 11,
                },
                {
                    id: '11',
                    name: 'Quality Assurance',
                    description: 'Description for Quality Assurance project',
                    createdAt: new Date().toISOString(),
                    updatedAt: new Date().toISOString(),
                    createdBy: 'system',
                    filesCount: 14,
                },
                {
                    id: '12',
                    name: 'Competitor Analysis',
                    description: 'Description for Competitor Analysis project',
                    createdAt: new Date().toISOString(),
                    updatedAt: new Date().toISOString(),
                    createdBy: 'system',
                    filesCount: 6,
                },
                {
                    id: '13',
                    name: 'User Experience Study',
                    description: 'Description for User Experience Study project',
                    createdAt: new Date().toISOString(),
                    updatedAt: new Date().toISOString(),
                    createdBy: 'system',
                    filesCount: 13,
                },
                {
                    id: '14',
                    name: 'Security Audit',
                    description: 'Description for Security Audit project',
                    createdAt: new Date().toISOString(),
                    updatedAt: new Date().toISOString(),
                    createdBy: 'system',
                    filesCount: 8,
                },
                {
                    id: '15',
                    name: 'Data Migration',
                    description: 'Description for Data Migration project',
                    createdAt: new Date().toISOString(),
                    updatedAt: new Date().toISOString(),
                    createdBy: 'system',
                    filesCount: 15,
                },
                {
                    id: '16',
                    name: 'Performance Testing',
                    description: 'Description for Performance Testing project',
                    createdAt: new Date().toISOString(),
                    updatedAt: new Date().toISOString(),
                    createdBy: 'system',
                    filesCount: 7,
                },
                {
                    id: '17',
                    name: 'Brand Identity',
                    description: 'Description for Brand Identity project',
                    createdAt: new Date().toISOString(),
                    updatedAt: new Date().toISOString(),
                    createdBy: 'system',
                    filesCount: 10,
                },
                {
                    id: '18',
                    name: 'Compliance Review',
                    description: 'Description for Compliance Review project',
                    createdAt: new Date().toISOString(),
                    updatedAt: new Date().toISOString(),
                    createdBy: 'system',
                    filesCount: 12,
                },
                {
                    id: '19',
                    name: 'Infrastructure Upgrade',
                    description: 'Description for Infrastructure Upgrade project',
                    createdAt: new Date().toISOString(),
                    updatedAt: new Date().toISOString(),
                    createdBy: 'system',
                    filesCount: 9,
                },
                {
                    id: '20',
                    name: 'Process Optimization',
                    description: 'Description for Process Optimization project',
                    createdAt: new Date().toISOString(),
                    updatedAt: new Date().toISOString(),
                    createdBy: 'system',
                    filesCount: 11,
                },
                {
                    id: '21',
                    name: 'Digital Transformation',
                    description: 'Description for Digital Transformation project',
                    createdAt: new Date().toISOString(),
                    updatedAt: new Date().toISOString(),
                    createdBy: 'system',
                    filesCount: 16,
                },
                {
                    id: '22',
                    name: 'Customer Support',
                    description: 'Description for Customer Support project',
                    createdAt: new Date().toISOString(),
                    updatedAt: new Date().toISOString(),
                    createdBy: 'system',
                    filesCount: 8,
                },
                {
                    id: '23',
                    name: 'Mobile App Development',
                    description: 'Description for Mobile App Development project',
                    createdAt: new Date().toISOString(),
                    updatedAt: new Date().toISOString(),
                    createdBy: 'system',
                    filesCount: 13,
                },
                {
                    id: '24',
                    name: 'Social Media Campaign',
                    description: 'Description for Social Media Campaign project',
                    createdAt: new Date().toISOString(),
                    updatedAt: new Date().toISOString(),
                    createdBy: 'system',
                    filesCount: 5,
                }
            ];
        } */

    loadMockData(): {
        files: FileItem[],
        chatHistory: HistoryItem[],
        sessionsHistory: HistoryItem[],
        compareHistory: HistoryItem[],
        summarizeHistory: HistoryItem[],
        extractHistory: HistoryItem[],
        workflows: WorkflowItem[],
        members: Member[],
    } {
        return {
            "files": [
                {
                    id: 'f1',
                    name: 'KYC-specs.pdf',
                    size: 532188,
                    type: 'application/pdf',
                    uploadedAt: DateTime.now(),
                },
                {
                    id: 'f2',
                    name: 'clients.csv',
                    size: 88492,
                    type: 'text/csv',
                    uploadedAt: DateTime.now(),
                },
                {
                    id: 'f3',
                    name: 'logo.png',
                    size: 24100,
                    type: 'image/png',
                    uploadedAt: DateTime.now(),
                },
                {
                    id: 'f4',
                    name: 'presentation.pptx',
                    size: 1256892,
                    type: 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
                    uploadedAt: DateTime.now(),
                },
                {
                    id: 'f5',
                    name: 'report.docx',
                    size: 456123,
                    type: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
                    uploadedAt: DateTime.now(),
                },
                {
                    id: 'f6',
                    name: 'data.xlsx',
                    size: 789456,
                    type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
                    uploadedAt: DateTime.now(),
                },
                {
                    id: 'f7',
                    name: 'summary.txt',
                    size: 12345,
                    type: 'text/plain',
                    uploadedAt: DateTime.now(),
                },
                {
                    id: 'f8',
                    name: 'diagram.svg',
                    size: 67890,
                    type: 'image/svg+xml',
                    uploadedAt: DateTime.now(),
                },
                {
                    id: 'f9',
                    name: 'archive.zip',
                    size: 2345678,
                    type: 'application/zip',
                    uploadedAt: DateTime.now(),
                },
                {
                    id: 'f10',
                    name: 'video.mp4',
                    size: 3456789,
                    type: 'video/mp4',
                    uploadedAt: DateTime.now(),
                },
                {
                    id: 'f11',
                    name: 'audio.mp3',
                    size: 456789,
                    type: 'audio/mpeg',
                    uploadedAt: DateTime.now(),
                },
                {
                    id: 'f12',
                    name: 'script.js',
                    size: 56789,
                    type: 'application/javascript',
                    uploadedAt: DateTime.now(),
                },
                {
                    id: 'f13',
                    name: 'styles.css',
                    size: 67890,
                    type: 'text/css',
                    uploadedAt: DateTime.now(),
                },
                {
                    id: 'f14',
                    name: 'index.html',
                    size: 78901,
                    type: 'text/html',
                    uploadedAt: DateTime.now(),
                },
                {
                    id: 'f15',
                    name: 'presentation2.pptx',
                    size: 1356892,
                    type: 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
                    uploadedAt: DateTime.now(),
                }

            ],
            "chatHistory": [
                {
                    id: 'c-101',
                    title: 'Chat: onboarding policy clarifications',
                    createdAt: DateTime.now().minus({ days: 2 }),
                    updatedAt: DateTime.now().minus({ hours: 1 }),
                    progress: 65,
                    projectId: crypto.randomUUID(),
                },
                {
                    id: 'c-099',
                    title: 'Chat: KYC edge cases',
                    createdAt: DateTime.now().minus({ days: 5 }),
                    progress: 30,
                    projectId: crypto.randomUUID(),
                },
            ],
            "sessionsHistory": [
                {
                    id: 'ss-410',
                    title: 'Session 1',
                    createdAt: DateTime.now().minus({ days: 9 }),
                    projectId: crypto.randomUUID(),
                },
                {
                    id: 'ss-405',
                    title: 'Session 2',
                    createdAt: DateTime.now().minus({ days: 6 }),
                    projectId: crypto.randomUUID(),
                },
                {
                    id: 'ss-398',
                    title: 'Session 3',
                    createdAt: DateTime.now().minus({ days: 13 }),
                    projectId: crypto.randomUUID(),
                },
                {
                    id: 'ss-393',
                    title: 'Session 4',
                    createdAt: DateTime.now().minus({ days: 21 }),
                    projectId: crypto.randomUUID(),
                },
                {
                    id: 'ss-389',
                    title: 'Session 5',
                    createdAt: DateTime.now().minus({ days: 30 }),
                    projectId: crypto.randomUUID(),
                }, {
                    id: 'ss-385',
                    title: 'Session 6',
                    createdAt: DateTime.now().minus({ days: 35 }),
                    projectId: crypto.randomUUID(),
                }
                // generate 10 more object by object
                ,
                {
                    id: 'ss-380',
                    title: 'Session 7',
                    createdAt: DateTime.now().minus({ days: 40 }),
                    projectId: crypto.randomUUID(),
                },
                {
                    id: 'ss-375',
                    title: 'Session 8',
                    createdAt: DateTime.now().minus({ days: 45 }),
                    projectId: crypto.randomUUID(),
                },
                {
                    id: 'ss-370',
                    title: 'Session 9',
                    createdAt: DateTime.now().minus({ days: 50 }),
                    projectId: crypto.randomUUID(),
                },
                {
                    id: 'ss-365',
                    title: 'Session 10',
                    createdAt: DateTime.now().minus({ days: 55 }),
                    projectId: crypto.randomUUID(),
                },
                {
                    id: 'ss-360',
                    title: 'Session 11',
                    createdAt: DateTime.now().minus({ days: 60 }),
                    projectId: crypto.randomUUID(),
                },
                {
                    id: 'ss-355',
                    title: 'Session 12',
                    createdAt: DateTime.now().minus({ days: 65 }),
                    projectId: crypto.randomUUID(),
                },
                {
                    id: 'ss-350',
                    title: 'Session 13',
                    createdAt: DateTime.now().minus({ days: 70 }),
                    projectId: crypto.randomUUID(),
                },




            ],
            "compareHistory": [
                {
                    id: 'p-410',
                    title: 'Compare: v1 vs v2 KYC schema',
                    createdAt: DateTime.now().minus({ days: 9 }),
                    progress: 55,
                    projectId: crypto.randomUUID(),
                },
            ],
            "summarizeHistory": [
                {
                    id: 's-210',
                    title: 'Summary: 2025-10-OKR deck.pdf',
                    createdAt: DateTime.now().minus({ days: 3 }),
                    progress: 100,
                    projectId: crypto.randomUUID(),
                },
            ],
            "extractHistory": [
                {
                    id: 'e-310',
                    title: 'Extract: client.csv → emails',
                    createdAt: DateTime.now().minus({ days: 7 }),
                    progress: 70,
                    projectId: crypto.randomUUID(),
                },
            ],
            "workflows": Array.from({ length: 13 }).map((_, i) => ({
                id: `w-${i + 1}`,
                name: `Workflow #${i + 1}`,
                designedSteps: Math.floor(Math.random() * 12) + 3,
                published: Math.random() > 0.45,
                lastUpdated: DateTime.now().minus({ days: Math.floor(Math.random() * 30) + 1 }),
            })),
            "members": [
                {
                    id: 'u1',
                    name: 'Alice Martin',
                    email: 'alice@example.com',
                    role: 'owner',
                    joinedAt: DateTime.fromISO('2025-08-01'),
                },
                {
                    id: 'u2',
                    name: 'Bob Keller',
                    email: 'bob@example.com',
                    role: 'member',
                    joinedAt: DateTime.fromISO('2025-09-12'),
                },
            ]
        }
    }
}
