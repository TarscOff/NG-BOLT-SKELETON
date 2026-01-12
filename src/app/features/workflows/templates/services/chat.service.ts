import { Inject, inject, Injectable } from '@angular/core';
import { Observable, of, delay, throwError, firstValueFrom } from 'rxjs';
import { catchError } from 'rxjs/operators';
import {
    ChatMessage,
} from '../utils/tplsInterfaces/chatTpl.interface';
import { ProjectsService } from '@features/projects/services/projects.service';
import { ChatMessageDto, ChatMessageResponseDto, DataRefence } from '@features/projects/interfaces/project.model';
import { HttpClient } from '@angular/common/http';
import { CoreOptions } from '@cadai/pxs-ng-core/interfaces';
import { CORE_OPTIONS } from '@cadai/pxs-ng-core/tokens';

interface DeleteMessageResponse {
    success: boolean;
    messageId: string;
}

interface UploadAttachmentResponse {
    url: string;
    filename: string;
}

@Injectable({
    providedIn: 'root',
})
export class ChatService {
    private readonly projectService = inject(ProjectsService);
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


    async getChatHistory(
        sessionId: string
    ): Promise<ChatMessage[]> {
        const session = await firstValueFrom(this.projectService.getChatHistory(sessionId));
        const sessionData = session.filter(item => item.data_reference === DataRefence.CHAT_HISTORY)[0];

        if (sessionData?.artifact_id) {
            const historyDataContent = await firstValueFrom(this.projectService.getChatHistoryDataContent(sessionData.artifact_id));

            const mappedItems = this.mapToChatTemplateData(historyDataContent);
            return mappedItems;
        } else {
            return [];
        }
    }

    private mapToChatTemplateData(items: ChatMessageDto[]): ChatMessage[] {
        return items.map(item => ({
            id: crypto.randomUUID(),
            content: item.content,
            sender: {
                name: item.role,
                type: item.role === 'user' ? 'user' : 'assistant',
            },
            type: "mixed"
            // TODO Add attachments when provided BE side
            // timestamp: new Date() // Add timestamp if required by ChatMessage interface
            // attachments: item.attachments,
        }));
    }

    sendMessage(
        projectId: string,
        sessionId: string,
        templateId: string,
        content: string
    ): Observable<ChatMessageResponseDto> {
        return this.projectService.sendMessage(projectId, sessionId, templateId, content);
    }

    submitArtifacts(
        sessionId: string,
        fileTemplateId: string,
        files: File[]
    ): Observable<ChatMessageResponseDto> {
        return this.projectService.submitArtifacts(sessionId, fileTemplateId, files);
    }
    
    deleteMessage(
        messageId: string,
    ): Observable<DeleteMessageResponse> {

        const endpoint = `${this.base}/chat/delete`;
        if (!endpoint) {
            return throwError(() => new Error('Delete endpoint not configured'));
        }

        return this.http.delete<DeleteMessageResponse>(`${endpoint}/${messageId}`).pipe(
            catchError(error => {
                console.error('Error deleting message:', error);
                throwError(() => error);
                return this.mockDeleteMessage(messageId);

            })
        );
    }

    editMessage(
        messageId: string,
        content: string,
    ): Observable<Partial<ChatMessage>> {

        const endpoint = `${this.base}/chat/edit`;
        if (!endpoint) {
            return throwError(() => new Error('Edit endpoint not configured'));
        }

        return this.http
            .put<Partial<ChatMessage>>(`${endpoint}/${messageId}`, { content })
            .pipe(
                catchError(error => {
                    console.error('Error editing message:', error);
                    throwError(() => error);
                    return this.mockEditMessage(messageId, content);

                })
            );
    }


    private mockDeleteMessage(messageId: string): Observable<DeleteMessageResponse> {
        return of({
            success: true,
            messageId,
        }).pipe(delay(300));
    }

    private mockEditMessage(
        messageId: string,
        content: string
    ): Observable<Partial<ChatMessage>> {
        return of({
            id: messageId,
            content,
            edited: true,
            timestamp: new Date(),
        }).pipe(delay(300));
    }

    private mockUploadAttachment(file: File): Observable<UploadAttachmentResponse> {
        // Simulate upload delay based on file size
        const uploadDelay = Math.min(1000 + (file.size / 10000), 3000);

        // Mock URL generation
        const mockUrl = `https://mock-storage.example.com/uploads/${Date.now()}-${file.name}`;

        return of({
            url: mockUrl,
            filename: file.name,
        }).pipe(delay(uploadDelay));
    }
}