import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable, of, delay, throwError } from 'rxjs';
import { catchError } from 'rxjs/operators';
import {
    ChatMessage,
    ChatSender,
    ChatEndpoints,
    ChatConfig,
} from '../utils/chatTpl.interface';

interface SendMessageRequest {
    content: string;
    sender: ChatSender;
}

interface SendMessageResponse {
    success: boolean;
    userMessage: ChatMessage;
    assistantMessage: ChatMessage;
}

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
    private endpoints: Partial<ChatEndpoints> = {};
    private config: Partial<ChatConfig> = {};

    // Mock responses based on keywords
    private mockResponses: Record<string, string> = {
        hello: 'Hello! How can I assist you today?',
        help: 'I can help you with various tasks. What do you need assistance with?',
        thanks: 'You\'re welcome! Is there anything else I can help you with?',
        bye: 'Goodbye! Have a great day!',
        default: 'I understand. Could you please provide more details?',
    };

    constructor(private http: HttpClient) { }

    configure(options: {
        endpoints?: Partial<ChatEndpoints>;
        config?: Partial<ChatConfig>;
    }): void {
        if (options.endpoints) {
            this.endpoints = options.endpoints;
        }
        if (options.config) {
            this.config = options.config;
        }
    }

    sendMessage(
        request: SendMessageRequest,
        endpoints?: Partial<ChatEndpoints>
    ): Observable<SendMessageResponse> {


        const endpoint = endpoints?.sendMessage || this.endpoints.sendMessage;
        if (!endpoint) {
            return throwError(() => new Error('Send endpoint not configured'));
        }

        return this.http.post<SendMessageResponse>(endpoint, request).pipe(
            catchError(error => {
                console.error('Error sending message:', error);
                throwError(() => error);
                return this.mockSendMessage(request);
            })
        );
    }

    deleteMessage(
        messageId: string,
        endpoints?: Partial<ChatEndpoints>
    ): Observable<DeleteMessageResponse> {

        const endpoint = endpoints?.deleteMessage || this.endpoints.deleteMessage;
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
        endpoints?: Partial<ChatEndpoints>
    ): Observable<Partial<ChatMessage>> {

        const endpoint = endpoints?.editMessage || this.endpoints.editMessage;
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
        endpoints?: Partial<ChatEndpoints>
    ): Observable<UploadAttachmentResponse> {

        const endpoint = endpoints?.uploadAttachment || this.endpoints.uploadAttachment;
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

    // Mock implementations
    private mockSendMessage(request: SendMessageRequest): Observable<SendMessageResponse> {
        const userMessage: ChatMessage = {
            id: this.generateId(),
            content: request.content,
            sender: request.sender,
            timestamp: new Date(),
        };

        const assistantResponse = this.generateMockResponse(request.content);
        const assistantMessage: ChatMessage = {
            id: this.generateId(),
            content: assistantResponse,
            sender: {
                id: 'assistant',
                name: 'Assistant',
                type: 'assistant',
            },
            timestamp: new Date(Date.now() + 1000),
        };

        const response: SendMessageResponse = {
            success: true,
            userMessage,
            assistantMessage,
        };

        // Simulate network delay respecting maxLength config
        const delayTime = this.config.maxLength && request.content.length > this.config.maxLength / 2
            ? 2000
            : 1000;

        return of(response).pipe(delay(delayTime));
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

    private generateMockResponse(userMessage: string): string {
        const lowerMessage = userMessage.toLowerCase();

        // Check for keywords
        for (const [keyword, response] of Object.entries(this.mockResponses)) {
            if (lowerMessage.includes(keyword)) {
                return response;
            }
        }

        // Test markdown support if enabled
        if (this.config.allowMarkdown !== false && lowerMessage.includes('markdown')) {
            return `Sure! Here's an example with **bold**, *italic*, and \`code\`:
      
            \`\`\`javascript
            console.log('Hello, World!');
            \`\`\`

            - List item 1
            - List item 2`;
        }

        // Test long messages if maxLength is configured
        if (this.config.maxLength && lowerMessage.includes('long')) {
            return 'This is a longer response to test the character limit feature. '.repeat(10);
        }

        return this.mockResponses?.['default'];
    }

    private generateId(): string {
        return `msg-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    }
}