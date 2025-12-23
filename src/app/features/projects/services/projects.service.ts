import { Inject, Injectable } from "@angular/core";
import { CoreOptions } from "@cadai/pxs-ng-core/interfaces";
import { CORE_OPTIONS } from "@cadai/pxs-ng-core/tokens";
import {
    FileItem,
    HistoryItem,
    Member,
    ProjectDto,
    ProjectArtifactsTypesDto,
    ProjectArtifactsDataDto,
    WorkflowItem,
    ProjectSessionDto,
    ProjectTemplateDto,
    ProjectTemplateConfigDto,
    SessionChatHistoryDto,
    SessionChatHistoryContentDto,
    ChatMessageDto
} from "../interfaces/project.model";
import { map, Observable } from "rxjs";
import { HttpClient } from "@angular/common/http";

@Injectable({
    providedIn: 'root',
})
export class ProjectsService {

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
        return this.http.get<ProjectDto[]>(url);
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
        const url = `${this.base}/projects/${projectId}/artifacts/types`;
        return this.http.get<ProjectArtifactsTypesDto[]>(url);
    }

    getProjectsFilesData(projectId: string): Observable<ProjectArtifactsDataDto[]> {
        const url = `${this.base}/projects/${projectId}/artifacts`;
        return this.http.get<ProjectArtifactsDataDto[]>(url);
    }

    getProjectsSessions(projectId: string): Observable<ProjectSessionDto[]> {
        const url = `${this.base}/projects/${projectId}/sessions`;
        return this.http.get<ProjectSessionDto[]>(url);
    }

    createProjectsSessions(projectId: string): Observable<ProjectSessionDto> {
        const url = `${this.base}/projects/${projectId}/session`;
        return this.http.post<ProjectSessionDto>(url, {
            "session_visibility": "none"
        });
    }

    getSessionById(sessionId: string): Observable<ProjectSessionDto> {
        const url = `${this.base}/sessions/${sessionId}`;
        return this.http.get<ProjectSessionDto>(url);
    }

    deleteSessionById(sessionId: string): Observable<void> {
        const url = `${this.base}/sessions/${sessionId}`;
        return this.http.delete<void>(url);
    }

    getChatHistory(sessionId: string): Observable<SessionChatHistoryDto[]> {
        const url = `${this.base}/sessions/${sessionId}/artifacts/chat_history`;
        return this.http.get<SessionChatHistoryDto[]>(url);
    }

    getChatHistoryDataContent(artifactId: string): Observable<ChatMessageDto[]> {
        return this.getArtifactContent(artifactId).pipe(
            map(content => content.messages)
        );
    }

    getArtifactContent(artifactId: string): Observable<SessionChatHistoryContentDto> {
        const url = `${this.base}/artifacts/${artifactId}/data`;
        return this.http.get<SessionChatHistoryContentDto>(url);
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
                    uploadedAt: new Date(),
                },
                {
                    id: 'f2',
                    name: 'clients.csv',
                    size: 88492,
                    type: 'text/csv',
                    uploadedAt: new Date(),
                },
                {
                    id: 'f3',
                    name: 'logo.png',
                    size: 24100,
                    type: 'image/png',
                    uploadedAt: new Date(),
                },
                {
                    id: 'f4',
                    name: 'presentation.pptx',
                    size: 1256892,
                    type: 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
                    uploadedAt: new Date(),
                },
                {
                    id: 'f5',
                    name: 'report.docx',
                    size: 456123,
                    type: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
                    uploadedAt: new Date(),
                },
                {
                    id: 'f6',
                    name: 'data.xlsx',
                    size: 789456,
                    type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
                    uploadedAt: new Date(),
                },
                {
                    id: 'f7',
                    name: 'summary.txt',
                    size: 12345,
                    type: 'text/plain',
                    uploadedAt: new Date(),
                },
                {
                    id: 'f8',
                    name: 'diagram.svg',
                    size: 67890,
                    type: 'image/svg+xml',
                    uploadedAt: new Date(),
                },
                {
                    id: 'f9',
                    name: 'archive.zip',
                    size: 2345678,
                    type: 'application/zip',
                    uploadedAt: new Date(),
                },
                {
                    id: 'f10',
                    name: 'video.mp4',
                    size: 3456789,
                    type: 'video/mp4',
                    uploadedAt: new Date(),
                },
                {
                    id: 'f11',
                    name: 'audio.mp3',
                    size: 456789,
                    type: 'audio/mpeg',
                    uploadedAt: new Date(),
                },
                {
                    id: 'f12',
                    name: 'script.js',
                    size: 56789,
                    type: 'application/javascript',
                    uploadedAt: new Date(),
                },
                {
                    id: 'f13',
                    name: 'styles.css',
                    size: 67890,
                    type: 'text/css',
                    uploadedAt: new Date(),
                },
                {
                    id: 'f14',
                    name: 'index.html',
                    size: 78901,
                    type: 'text/html',
                    uploadedAt: new Date(),
                },
                {
                    id: 'f15',
                    name: 'presentation2.pptx',
                    size: 1356892,
                    type: 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
                    uploadedAt: new Date(),
                }

            ],
            "chatHistory": [
                {
                    id: 'c-101',
                    title: 'Chat: onboarding policy clarifications',
                    createdAt: this.daysAgo(2),
                    updatedAt: this.hoursAgo(1),
                    progress: 65,
                    projectId: crypto.randomUUID(),
                },
                {
                    id: 'c-099',
                    title: 'Chat: KYC edge cases',
                    createdAt: this.daysAgo(5),
                    progress: 30,
                    projectId: crypto.randomUUID(),
                },
            ],
            "sessionsHistory": [
                {
                    id: 'ss-410',
                    title: 'Session 1',
                    createdAt: this.daysAgo(9),
                    projectId: crypto.randomUUID(),
                },
                {
                    id: 'ss-405',
                    title: 'Session 2',
                    createdAt: this.daysAgo(6),
                    projectId: crypto.randomUUID(),
                },
                {
                    id: 'ss-398',
                    title: 'Session 3',
                    createdAt: this.daysAgo(13),
                    projectId: crypto.randomUUID(),
                },
                {
                    id: 'ss-393',
                    title: 'Session 4',
                    createdAt: this.daysAgo(21),
                    projectId: crypto.randomUUID(),
                },
                {
                    id: 'ss-389',
                    title: 'Session 5',
                    createdAt: this.daysAgo(30),
                    projectId: crypto.randomUUID(),
                }, {
                    id: 'ss-385',
                    title: 'Session 6',
                    createdAt: this.daysAgo(35),
                    projectId: crypto.randomUUID(),
                }
                // generate 10 more object by object
                ,
                {
                    id: 'ss-380',
                    title: 'Session 7',
                    createdAt: this.daysAgo(40),
                    projectId: crypto.randomUUID(),
                },
                {
                    id: 'ss-375',
                    title: 'Session 8',
                    createdAt: this.daysAgo(45),
                    projectId: crypto.randomUUID(),
                },
                {
                    id: 'ss-370',
                    title: 'Session 9',
                    createdAt: this.daysAgo(50),
                    projectId: crypto.randomUUID(),
                },
                {
                    id: 'ss-365',
                    title: 'Session 10',
                    createdAt: this.daysAgo(55),
                    projectId: crypto.randomUUID(),
                },
                {
                    id: 'ss-360',
                    title: 'Session 11',
                    createdAt: this.daysAgo(60),
                    projectId: crypto.randomUUID(),
                },
                {
                    id: 'ss-355',
                    title: 'Session 12',
                    createdAt: this.daysAgo(65),
                    projectId: crypto.randomUUID(),
                },
                {
                    id: 'ss-350',
                    title: 'Session 13',
                    createdAt: this.daysAgo(70),
                    projectId: crypto.randomUUID(),
                },




            ],
            "compareHistory": [
                {
                    id: 'p-410',
                    title: 'Compare: v1 vs v2 KYC schema',
                    createdAt: this.daysAgo(9),
                    progress: 55,
                    projectId: crypto.randomUUID(),
                },
            ],
            "summarizeHistory": [
                {
                    id: 's-210',
                    title: 'Summary: 2025-10-OKR deck.pdf',
                    createdAt: this.daysAgo(3),
                    progress: 100,
                    projectId: crypto.randomUUID(),
                },
            ],
            "extractHistory": [
                {
                    id: 'e-310',
                    title: 'Extract: client.csv → emails',
                    createdAt: this.daysAgo(7),
                    progress: 70,
                    projectId: crypto.randomUUID(),
                },
            ],
            "workflows": Array.from({ length: 13 }).map((_, i) => ({
                id: `w-${i + 1}`,
                name: `Workflow #${i + 1}`,
                designedSteps: Math.floor(Math.random() * 12) + 3,
                published: Math.random() > 0.45,
                lastUpdated: new Date(
                    Date.now() - Math.floor(Math.random() * 10) * 86400000
                ),
            })),
            "members": [
                {
                    id: 'u1',
                    name: 'Alice Martin',
                    email: 'alice@example.com',
                    role: 'owner',
                    joinedAt: new Date('2025-08-01'),
                },
                {
                    id: 'u2',
                    name: 'Bob Keller',
                    email: 'bob@example.com',
                    role: 'member',
                    joinedAt: new Date('2025-09-12'),
                },
            ]
        }
    }

    // Date helpers
    daysAgo(n: number): Date {
        return new Date(Date.now() - n * 86400000);
    }

    hoursAgo(n: number): Date {
        return new Date(Date.now() - n * 3600000);
    }
}
