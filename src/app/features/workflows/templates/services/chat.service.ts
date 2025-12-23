import { inject, Injectable } from '@angular/core';
import { Observable, of, delay, throwError, firstValueFrom } from 'rxjs';
import { catchError } from 'rxjs/operators';
import {
    ChatMessage,
} from '../utils/tplsInterfaces/chatTpl.interface';
import { HttpService } from '@cadai/pxs-ng-core/services';
import { ProjectsService } from '@features/projects/services/projects.service';
import { ChatMessageDto, ChatMessageResponseDto, DataRefence, WorkflowStatusDto } from '@features/projects/interfaces/project.model';

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
    constructor(private http: HttpService) { }

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
        content: string,
        files?: File[]
    ): Observable<ChatMessageResponseDto> {
        const formData = new FormData();

        // TODO. this is hardcoded , should be removed in the future and only handled on BE side
        const messageInputId = "6c34cfd1-ac55-492c-b730-4f3815a2309d";
        const userPromptId = "c9d2e9dd-77c8-4c72-8157-cc079498994b";
        const fileInputId = "442f052c-f371-4b30-8f97-89109cc61fb2";
        // Add content as form field (using a generated ID or templateId as the key)
        if (content.trim() !== "") {
            formData.append(messageInputId, content);
        }
        if (content.trim() !== "") {
            formData.append(userPromptId, content);
        }
        // Add files if provided
        if (files && files.length > 0) {
            files.forEach((file) => {
            formData.append(fileInputId, file);
            });
        }

        const endpoint = `/api/sessions/${sessionId}/execute/${templateId}`;
        if (!endpoint) {
            return throwError(() => new Error('Send endpoint not configured'));
        }

        return this.http.post<ChatMessageResponseDto>(endpoint, formData)
    }

    getChatStatus(
        workflow_instance_id: string,
    ): Observable<WorkflowStatusDto> {
        const endpoint = `/api/workflow/${workflow_instance_id}/status`;
        if (!endpoint) {
            return throwError(() => new Error('Status endpoint not configured'));
        }

        return this.http.get<WorkflowStatusDto>(endpoint)
    }

    deleteMessage(
        messageId: string,
    ): Observable<DeleteMessageResponse> {

        const endpoint = "/api/chat/delete";
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

        const endpoint = "/api/chat/edit";
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

    uploadAttachment(
        file: File,
    ): Observable<UploadAttachmentResponse> {

        const endpoint = "/api/chat/uploadAttachment";
        if (!endpoint) {
            return throwError(() => new Error('Upload endpoint not configured'));
        }

        const formData = new FormData();
        formData.append('file', file);

        return this.http.post<UploadAttachmentResponse>(endpoint, formData).pipe(
            catchError(error => {
                console.error('Error uploading attachment:', error);
                throwError(() => error);
                return this.mockUploadAttachment(file);

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