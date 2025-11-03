import { inject, Inject, Injectable, Type } from '@angular/core';
import { Observable, map, catchError, of } from 'rxjs';

import { CoreOptions } from '@cadai/pxs-ng-core/interfaces';
import { HttpService } from '@cadai/pxs-ng-core/services';
import { CORE_OPTIONS } from '@cadai/pxs-ng-core/tokens';

import { 
  TemplateType, 
  TemplatePageResponse 
} from '../../utils/template-config.interface';
import { ChatComponent } from '../components/chat/chat.component';
import { CompareComponent } from '../components/compare/compare.component';
import { SummarizeComponent } from '../components/summarize/summarize.component';
import { ChatEndpoints, ChatMessage } from '@features/workflows/utils/chatTpl.interface';
import { CompareEndpoints, ComparisonResult } from '@features/workflows/utils/compareTpl.interface';
import { SummarizeEndpoints, SummaryResult } from '@features/workflows/utils/summarizeTpl.interface';
import { ChatService } from './chat.service';


@Injectable({
  providedIn: 'root',
})
export class TemplatingService {
    chatService = inject(ChatService)
  private readonly componentRegistry = new Map<TemplateType, Type<unknown>>([
    ['chat', ChatComponent],
    ['compare', CompareComponent],
    ['summarize', SummarizeComponent],
  ]);

  constructor(
    private http: HttpService,
    @Inject(CORE_OPTIONS) private readonly coreOpts: Required<CoreOptions>,
  ) {}

  /**
   * Get base API URL for templates
   */
  private get base(): string {
    const apiUrl = this.coreOpts.environments.apiUrl;
    if (!apiUrl) throw new Error('Runtime config missing: apiUrl');
    return `${apiUrl}`;
  }

  /**
   * Get component class for template type
   */
  getComponent(type: TemplateType): Type<unknown> | undefined {
    return this.componentRegistry.get(type);
  }

  /**
   * Fetch template configuration from API
   * @param pageId Optional page identifier (defaults to 'default')
   */
  fetchTemplateConfig(pageId = 'default'): Observable<TemplatePageResponse> {
    return this.http.get<TemplatePageResponse>(`${this.base}/page/${pageId}`).pipe(
      map(response => this.validateAndTransform(response)),
      catchError(error => {
        console.error('Failed to fetch template config:', error);
        return of(this.getDefaultConfig());
      })
    );
  }

  /**
   * Validate and transform API response
   */
  private validateAndTransform(response: TemplatePageResponse): TemplatePageResponse {
    // Validate required fields
    if (!response.templates || !Array.isArray(response.templates)) {
      throw new Error('Invalid template configuration: missing templates array');
    }

    // Transform endpoints for each template type
    response.templates.forEach((template) => {
      if (template.type === 'chat' && template.endpoints) {
        template.endpoints = this.transformChatEndpoints(template.endpoints);
      } else if (template.type === 'compare' && template.endpoints) {
        template.endpoints = this.transformCompareEndpoints(template.endpoints);
      } else if (template.type === 'summarize' && template.endpoints) {
        template.endpoints = this.transformSummarizeEndpoints(template.endpoints);
      }
    });

    // Transform metadata dates
    if (response.metadata?.lastUpdated) {
      response.metadata.lastUpdated = new Date(response.metadata.lastUpdated);
    }

    return response as TemplatePageResponse;
  }

  /**
   * Transform Chat endpoints to absolute URLs
   */
  private transformChatEndpoints(endpoints: Partial<ChatEndpoints>): Partial<ChatEndpoints> {
    return {
      sendMessage: endpoints.sendMessage ? this.ensureAbsoluteUrl(endpoints.sendMessage) : undefined,
      getMessages: endpoints.getMessages ? this.ensureAbsoluteUrl(endpoints.getMessages) : undefined,
      deleteMessage: endpoints.deleteMessage ? this.ensureAbsoluteUrl(endpoints.deleteMessage) : undefined,
      editMessage: endpoints.editMessage ? this.ensureAbsoluteUrl(endpoints.editMessage) : undefined,
      clearChat: endpoints.clearChat ? this.ensureAbsoluteUrl(endpoints.clearChat) : undefined,
    };
  }

  /**
   * Transform Compare endpoints to absolute URLs
   */
  private transformCompareEndpoints(endpoints: Partial<CompareEndpoints>): Partial<CompareEndpoints> {
    return {
      uploadFiles: endpoints.uploadFiles ? this.ensureAbsoluteUrl(endpoints.uploadFiles) : undefined,
      startComparison: endpoints.startComparison ? this.ensureAbsoluteUrl(endpoints.startComparison) : undefined,
      getComparison: endpoints.getComparison ? this.ensureAbsoluteUrl(endpoints.getComparison) : undefined,
      cancelComparison: endpoints.cancelComparison ? this.ensureAbsoluteUrl(endpoints.cancelComparison) : undefined,
      exportComparison: endpoints.exportComparison ? this.ensureAbsoluteUrl(endpoints.exportComparison) : undefined,
    };
  }

  /**
   * Transform Summarize endpoints to absolute URLs
   */
  private transformSummarizeEndpoints(endpoints: Partial<SummarizeEndpoints>): Partial<SummarizeEndpoints> {
    return {
      uploadFile: endpoints.uploadFile ? this.ensureAbsoluteUrl(endpoints.uploadFile) : undefined,
      startSummarization: endpoints.startSummarization ? this.ensureAbsoluteUrl(endpoints.startSummarization) : undefined,
      getSummary: endpoints.getSummary ? this.ensureAbsoluteUrl(endpoints.getSummary) : undefined,
      cancelSummary: endpoints.cancelSummary ? this.ensureAbsoluteUrl(endpoints.cancelSummary) : undefined,
      exportSummary: endpoints.exportSummary ? this.ensureAbsoluteUrl(endpoints.exportSummary) : undefined,
    };
  }

  /**
   * Ensure URL is absolute using the configured API URL
   */
  private ensureAbsoluteUrl(url: string): string {
    if (url.startsWith('http://') || url.startsWith('https://')) {
      return url;
    }
    
    // Use configured API URL from core options
    const apiUrl = this.coreOpts.environments.apiUrl;
    if (!apiUrl) {
      console.warn('API URL not configured, using relative URL');
      return url;
    }
    
    return `${apiUrl}${url.startsWith('/') ? '' : '/'}${url}`;
  }

  /**
   * Get default/fallback configuration with new endpoint structure
   */
  private getDefaultConfig(): TemplatePageResponse {
    return {
      pageTitle: 'AI Tools',
      pageDescription: 'Choose a tool to get started',
      templates: [
        {
          type: 'chat',
          initialMessages: this.getMockChatMessages(),
          currentUser: {
            id: 'user-1',
            name: 'You',
            type: 'user',
          },
          endpoints: {
            sendMessage: '/api/chat/send',
            getMessages: '/api/chat/messages',
            deleteMessage: '/api/chat/message',
            editMessage: '/api/chat/message',
            clearChat: '/api/chat/clear',
          },
          config: {
            showTimestamps: true,
            showAvatars: true,
            allowMarkdown: true,
            allowEdit: true,
            allowDelete: true,
            maxLength: 4000,
            placeholder: 'Type your message...',
            enableAttachments: false,
            autoScroll: true,
          },
        },
        {
          type: 'compare',
          mode: 'upload',
          endpoints: {
            uploadFiles: '/api/compare/upload',
            startComparison: '/api/compare/start',
            getComparison: '/api/compare/result',
            cancelComparison: '/api/compare/cancel',
            exportComparison: '/api/compare/export',
          },
          result:this.getMockComparisonResult(),
          config: {
            allowedFileTypes: ['.pdf', '.docx', '.txt'],
            maxFileSize: 10 * 1024 * 1024,
          },
        },
        {
          type: 'summarize',
          mode: 'upload',
          endpoints: {
            uploadFile: '/api/summarize/upload',
            startSummarization: '/api/summarize/start',
            getSummary: '/api/summarize/result',
            cancelSummary: '/api/summarize/cancel',
            exportSummary: '/api/summarize/export',
          },
          result:this.getMockSummaryResult(),
          config: {
            allowedFileTypes: ['.pdf', '.docx', '.txt', '.md'],
            maxFileSize: 10 * 1024 * 1024,
            maxFiles: 5,
            defaultLength: 'medium',
            defaultStyle: 'paragraph',
            defaultLanguage: 'en',
            availableLanguages: [
              { label: 'English', value: 'en' },
              { label: 'French', value: 'fr' },
              { label: 'Dutch', value: 'nl' },
            ],
          },
        },
      ],
      metadata: {
        version: '2.0.0',
        lastUpdated: new Date(),
        environment: 'development',
      },
    };
  }


  
  /**
   * Mock data generators
   */
  getMockComparisonResult(): ComparisonResult {
    return {
      id: 'comp-123',
      file1: {
        key: 'file-1-key',
        name: 'contract_v1.pdf',
        size: 2048576,
        ext: 'pdf',
        mime: 'application/pdf',
        url: 'https://storage.example.com/files/contract_v1.pdf',
        uploadDate: new Date('2025-01-15')
      },
      file2: {
        key: 'file-2-key',
        name: 'contract_v2.pdf',
        size: 2156789,
        ext: 'pdf',
        mime: 'application/pdf',
        url: 'https://storage.example.com/files/contract_v2.pdf',
        uploadDate: new Date('2025-01-20')
      },
      differences: [
        {
          id: 'diff-1',
          type: 'modified',
          section: 'Section 3: Payment Terms',
          file1Content: 'Payment due within 30 days',
          file2Content: 'Payment due within 45 days',
          lineNumber: 42,
          description: 'Payment term duration changed from 30 to 45 days'
        },
        {
          id: 'diff-2',
          type: 'added',
          section: 'Section 5: Confidentiality',
          file2Content: 'All information shall remain confidential for 5 years',
          lineNumber: 78,
          description: 'New confidentiality clause added'
        },
        {
          id: 'diff-3',
          type: 'removed',
          section: 'Section 2: Delivery Terms',
          file1Content: 'Delivery within 14 business days',
          lineNumber: 28,
          description: 'Delivery terms section removed'
        }
      ],
      similarity: 87.5,
      status: 'completed',
      createdAt: new Date('2025-01-20T10:30:00'),
      completedAt: new Date('2025-01-20T10:30:45')
    };
  }

  getMockSummaryResult(): SummaryResult {
    return {
      id: 'summary-123',
      files: [
        {
          key: 'file-1',
          name: 'quarterly-report.pdf',
          size: 2048576,
          ext: 'pdf',
          mime: 'application/pdf',
          url: 'https://storage.example.com/files/report.pdf',
          uploadDate: new Date('2025-10-15')
        }
      ],
      summary: `This quarterly report highlights significant growth across all departments. 
                Revenue increased by 25% compared to Q3. Key achievements include successful 
                product launches and market expansion in European markets.`,
      keyPoints: [
        'Revenue increased by 25% quarter-over-quarter',
        'Successful launch of 3 new products',
        'Market expansion into 5 European countries',
        'Customer satisfaction rating improved to 4.8/5',
        'Operating costs reduced by 12%'
      ],
      wordCount: {
        original: 5420,
        summary: 456,
        reduction: 91.6
      },
      style: 'executive',
      length: 'medium',
      language: 'en',
      status: 'completed',
      createdAt: new Date('2025-10-20T10:30:00'),
      completedAt: new Date('2025-10-20T10:31:15')
    };
  }

  getMockChatMessages(): ChatMessage[] {
  return [
    {
      id: 'msg-1',
      content: 'Hello! I need help with document analysis.',
      sender: {
        id: 'user-1',
        name: 'John Doe',
        type: 'user',
      },
      timestamp: new Date('2025-11-03T10:00:00'),
    },
    {
      id: 'msg-2',
      content: 'Hello! I\'d be happy to help you with document analysis. What would you like to know?',
      sender: {
        id: 'assistant',
        name: 'AI Assistant',
        type: 'assistant',
      },
      timestamp: new Date('2025-11-03T10:00:15'),
    },
    {
      id: 'msg-3',
      content: 'Can you help me compare two contracts and identify the key differences?',
      sender: {
        id: 'user-1',
        name: 'John Doe',
        type: 'user',
      },
      timestamp: new Date('2025-11-03T10:01:00'),
    },
    {
      id: 'msg-4',
      content: 'Certainly! I can help you compare contracts. Please upload the two contract documents you\'d like to compare, and I\'ll identify the key differences for you.',
      sender: {
        id: 'assistant',
        name: 'AI Assistant',
        type: 'assistant',
      },
      timestamp: new Date('2025-11-03T10:01:20'),
    },
  ];
}
}