import { inject, Injectable, Type } from '@angular/core';
import { Observable, of, firstValueFrom } from 'rxjs';
import {
  TemplateType,
  TemplatePageResponse
} from '../utils/template-config.interface';
import { ChatComponent } from '../components/chat/chat.component';
import { CompareComponent } from '../components/compare/compare.component';
import { SummarizeComponent } from '../components/summarize/summarize.component';
import { ComparisonResult } from '@features/workflows/templates/utils/tplsInterfaces/compareTpl.interface';
import { SummaryResult } from '@features/workflows/templates/utils/tplsInterfaces/summarizeTpl.interface';
import { ChatService } from './chat.service';
import { CHAT_CONFIG, COMPARE_CONFIG, EXTRACT_CONFIG, SUMMARIZE_CONFIG } from '../utils/constants';
import { ExtractComponent } from '../components/extract/extract.component';
import { ProjectsService } from '@features/projects/services/projects.service';
import { ExtractionResult } from '../utils/tplsInterfaces/extractTpl.interface';

@Injectable({
  providedIn: 'root',
})
export class TemplatingService {
  chatService = inject(ChatService);
  projectService = inject(ProjectsService);
  private readonly componentRegistry = new Map<TemplateType, Type<unknown> | undefined>([
    ['add file', undefined], // TODO: add files template component when available
    ['chat', ChatComponent],
    ['compare', CompareComponent],
    ['summarize', SummarizeComponent],
    ['extract', ExtractComponent],
  ]);

  /**
   * Get component class for template type
   */
  getComponent(type: TemplateType | null): Type<unknown> | undefined {
    if (!type) return undefined;
    return this.componentRegistry.get(type);
  }

  /**
   * Fetch template configuration from API
   */
  async fetchTemplateConfig(projectId: string): Promise<Observable<TemplatePageResponse>> {
    const config = (await firstValueFrom(this.projectService.getProjectTemplates(projectId)))
    const add_file = config.find(t => (t.template_type?.toLowerCase() === 'add file' || t.template_name.toLowerCase() === 'add file'));

    const filteredFeatures= config.filter(t => (t.template_name.toLowerCase() !== "add file" && t.template_type?.toLowerCase() !== "add file")).filter(t => t);;
    const templates: TemplatePageResponse = {
      pageTitle: 'AI Tools - Session : ',
      pageDescription: 'Choose a tool to get started',
      templates: filteredFeatures.map(template => {
        switch (template.template_type?.toLocaleLowerCase() || template.template_name?.toLocaleLowerCase()) {
          case "chat":
            return {
              type: 'chat' as const,
              initialMessages: [],
              config: {
                ...CHAT_CONFIG,
                enableAttachments: add_file ? true : false,
              },
              templateId: template.template_id || '',
            };
          case 'compare':
            return {
              type: 'compare' as const,
              mode: 'upload' as const,
              result: this.getMockComparisonResult(),
              config: COMPARE_CONFIG,
              templateId: template.template_id || '',
            };
          case 'summarize':
            return {
              type: 'summarize' as const,
              mode: 'upload' as const,
              result: this.getMockSummaryResult(),
              config: SUMMARIZE_CONFIG,
              templateId: template.template_id || '',
            };
          case 'extract':
            return {
              type: 'extract' as const,
              mode: 'upload' as const,
              result: this.getMockExtractionResult(),
              config: EXTRACT_CONFIG,
              templateId: template.template_id || '',
            };
          default:
            return null
        }
      })
    };
    return of(templates);
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

  getMockExtractionResult(): ExtractionResult {
    return {
      id: crypto.randomUUID(),
      files: [
        {
          key: crypto.randomUUID(),
          name: 'business-proposal.pdf',
          size: 1024000,
          type: 'application/pdf',
          ext: 'pdf',
          url: 'https://example.com/files/business-proposal.pdf',
          uploadDate: new Date('2025-11-01'),
        },
        {
          key: crypto.randomUUID(),
          name: 'meeting-notes.docx',
          size: 512000,
          type: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
          ext: 'docx',
          url: 'https://example.com/files/meeting-notes.docx',
          uploadDate: new Date('2025-11-02'),
        },
      ],
      entities: [
        {
          type: 'person',
          value: 'John Doe',
          context: 'John Doe will lead the project management team.',
        },
        {
          type: 'person',
          value: 'Jane Smith',
          context: 'Jane Smith is the senior consultant for this engagement.',
        },
        {
          type: 'organization',
          value: 'Proximus',
          context: 'Proximus has been our strategic partner since 2020.',
        },
        {
          type: 'organization',
          value: 'Microsoft',
          context: 'The solution will be deployed on Microsoft Azure.',
        },
        {
          type: 'location',
          value: 'Brussels',
          context: 'The headquarters are located in Brussels, Belgium.',
        },
        {
          type: 'location',
          value: 'Antwerp',
          context: 'Regional office opening in Antwerp next quarter.',
        },
        {
          type: 'date',
          value: 'November 15, 2025',
          context: 'Project kickoff meeting scheduled for November 15, 2025.',
        },
        {
          type: 'email',
          value: 'contact@proximus.be',
          context: 'For inquiries, please contact contact@proximus.be.',
        },
      ],
      text: `This is a comprehensive business proposal outlining the digital transformation strategy for Proximus. 
    John Doe will lead the project management team, working closely with Jane Smith, our senior consultant. 
    The solution will be deployed on Microsoft Azure with headquarters in Brussels and a regional office in Antwerp. 
    Project kickoff is scheduled for November 15, 2025. For inquiries, contact contact@proximus.be.`,
      totalEntitiesFound: 8,
      status: 'completed',
    };
  }
}