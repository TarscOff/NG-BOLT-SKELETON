# Workflow Templates System - Complete Guide

>_Last updated: 2025-12-23_

## 📚 Table of Contents

1. [Overview](#overview)
2. [Architecture](#architecture)
3. [Available Templates](#available-templates)
4. [Template Modes](#template-modes)
5. [Component APIs](#component-apis)
6. [Services](#services)
7. [Adding New Templates](#adding-new-templates)
8. [Best Practices](#best-practices)
9. [Export System](#export-system)
10. [Examples](#examples)

---

## Overview

The Workflow Templates System provides reusable, configurable components for common document processing workflows. Each template supports two operating modes:

- **Upload Mode**: Interactive mode where users upload files and trigger processing
- **Preloaded Mode**: Display mode for showing pre-computed results

### Key Features

✅ **Modular Architecture** - Each template is self-contained  
✅ **Dual Mode Support** - Upload (interactive) and Preloaded (display)  
✅ **Type-Safe** - Full TypeScript interfaces and type checking  
✅ **Configurable** - Extensive configuration options per template  
✅ **Export Support** - Built-in PDF/DOCX/TXT export capabilities  
✅ **Signal-Based** - Modern Angular signals for reactive state  
✅ **Service Layer** - Dedicated services with mock data support  
✅ **Extensible** - Easy to add new templates following patterns  

---

## Architecture

```
workflows/
├── templates/                      # Template system
│   ├── components/
│   │   ├── chat/                  # Chat template
│   │   │   ├── chat.component.ts
│   │   │   ├── chatInput/
│   │   │   └── chatMessage/
│   │   ├── compare/               # Document comparison
│   │   │   ├── compare.component.ts
│   │   │   └── comparison-result/
│   │   ├── extract/               # Data extraction
│   │   │   ├── extract.component.ts
│   │   │   └── extract-result/
│   │   ├── summarize/             # Document summarization
│   │   │   ├── summarize.component.ts
│   │   │   └── summarize-result/
│   │   ├── export-overlay/        # Shared export overlay
│   │   └── loader/                # Dynamic template loader
│   ├── services/
│   │   ├── chat.service.ts
│   │   ├── compare.service.ts
│   │   ├── extract.service.ts
│   │   ├── summarize.service.ts
│   │   ├── document-export.service.ts
│   │   └── templating.service.ts
│   └── utils/
│       ├── constants.ts           # Template constants (CHAT_CONFIG, COMPARE_CONFIG, etc.)
│       ├── fileIcon.ts            # File type icon mapping
│       ├── document-export.interface.ts
│       ├── comparison-export.adapter.ts
│       ├── summary-export.adapter.ts
│       ├── template-config.interface.ts
│       └── tplsInterfaces/
│           ├── chatTpl.interface.ts
│           ├── compareTpl.interface.ts
│           ├── extractTpl.interface.ts
│           └── summarizeTpl.interface.ts
```

### Service Pattern

Each template follows a consistent service pattern:

```typescript
@Injectable({ providedIn: 'root' })
export class TemplateService {
  private endpoints: Partial<TemplateEndpoints> = {};
  
  configure(options: { endpoints?: Partial<TemplateEndpoints> }): void {
    // Configure service behavior
  }
  
  // API methods with endpoint override support
  methodName(request: RequestType, endpoints?: Partial<TemplateEndpoints>): Observable<ResponseType> {
    const endpoint = endpoints?.specificEndpoint || this.endpoints.specificEndpoint;
    return endpoint 
      ? this.httpRequest(request, endpoint)
      : this.mockMethodName(request);
  }
  
  // Mock implementation
  private mockMethodName(request: RequestType): Observable<ResponseType> {
    // Return mock data with delay
  }
}
```

---

## Available Templates

### 1. 💬 Chat Template

**Purpose**: AI-powered conversational interface  
**Use Cases**: Customer support bots, AI assistants, Q&A systems, document chat

#### Features
- Real-time message sending and receiving
- Message editing and deletion
- Markdown support with code highlighting
- Code block rendering
- File attachments
- Typing indicators
- Read receipts
- Message history
- User avatars
- Auto-scroll functionality

#### Configuration

```typescript
export interface ChatConfig {
  placeholder?: string;
  maxLength?: number;
  enableAttachments?: boolean;
  allowMarkdown?: boolean;
  showTimestamps?: boolean;
  allowEdit?: boolean;
  allowDelete?: boolean;
  autoScroll?: boolean;
}
```

#### Endpoints

```typescript
export interface ChatEndpoints {
  sendEndpoint?: string;
  uploadEndpoint?: string;
  deleteEndpoint?: string;
  editEndpoint?: string;
}
```

#### Import Path
```typescript
import { ChatComponent } from '@features/workflows/templates/components/chat/chat.component';
import { ChatService } from '@features/workflows/templates/services/chat.service';
import { ChatConfig, ChatMessage, ChatSender } from '@features/workflows/templates/utils/tplsInterfaces/chatTpl.interface';
```

---

### 2. 🔄 Compare Template

**Purpose**: Document comparison with diff visualization  
**Use Cases**: Contract comparison, version control, legal document review, change tracking

#### Features
- Side-by-side file upload
- Multiple file format support (.pdf, .docx, .txt, .json, .md)
- Difference highlighting (additions, deletions, modifications)
- Similarity scoring
- Change categorization
- Section-by-section comparison
- Export comparison results (PDF/DOCX/TXT)
- Visual diff viewer

#### Configuration

```typescript
export interface CompareConfig {
  allowedFileTypes?: string[];
  maxFileSize?: number;
  autoCompare?: boolean;
  showSimilarity?: boolean;
  highlightDifferences?: boolean;
}
```

#### Endpoints

```typescript
export interface CompareEndpoints {
  uploadEndpoint?: string;
  startEndpoint?: string;
  statusEndpoint?: string;
  cancelEndpoint?: string;
}
```

#### Import Path
```typescript
import { CompareComponent } from '@features/workflows/templates/components/compare/compare.component';
import { CompareService } from '@features/workflows/templates/services/compare.service';
import { CompareConfig, ComparisonResult, CompareFile } from '@features/workflows/templates/utils/tplsInterfaces/compareTpl.interface';
```

---

### 3. 📤 Extract Template

**Purpose**: Structured data extraction from documents  
**Use Cases**: Form data extraction, invoice processing, receipt parsing, entity extraction

#### Features
- Multiple file upload support
- Configurable extraction schema
- Field-level extraction with confidence scores
- Table extraction support
- Entity recognition (names, dates, amounts, etc.)
- JSON output format
- Validation and error handling
- Export extracted data
- Visual field mapping

#### Configuration

```typescript
export interface ExtractConfig {
  allowedFileTypes?: string[];
  maxFileSize?: number;
  maxFiles?: number;
  showProgress?: boolean;
  extractionSchema?: ExtractField[];
  outputFormat?: 'json' | 'csv' | 'xlsx';
  enableTableExtraction?: boolean;
  enableEntityRecognition?: boolean;
}
```

#### Endpoints

```typescript
export interface ExtractEndpoints {
  uploadEndpoint?: string;
  startEndpoint?: string;
  statusEndpoint?: string;
  cancelEndpoint?: string;
  exportEndpoint?: string;
}
```

#### Data Structures

```typescript
export interface ExtractField {
  name: string;
  type: 'text' | 'number' | 'date' | 'boolean' | 'table' | 'entity';
  required?: boolean;
  description?: string;
}

export interface ExtractedData {
  [fieldName: string]: {
    value: any;
    confidence: number;
    location?: {
      page: number;
      x: number;
      y: number;
      width: number;
      height: number;
    };
  };
}

export interface ExtractResult {
  id: string;
  files: ExtractFile[];
  extractedData: ExtractedData;
  tables?: TableData[];
  entities?: Entity[];
  status: 'processing' | 'completed' | 'error';
  error?: string;
  createdAt: Date;
  completedAt?: Date;
}
```

#### Import Path
```typescript
import { ExtractComponent } from '@features/workflows/templates/components/extract/extract.component';
import { ExtractService } from '@features/workflows/templates/services/extract.service';
import { ExtractConfig, ExtractResult, ExtractField } from '@features/workflows/templates/utils/tplsInterfaces/extractTpl.interface';
```

**Note**: Extract template is currently in development. Basic structure exists but advanced features (CSV/XLSX export, table extraction, entity recognition) may not be fully implemented yet.

---

### 4. 📝 Summarize Template

**Purpose**: Multi-document summarization with customization  
**Use Cases**: Document summarization, content extraction, report generation, meeting notes

#### Features
- Multiple file upload (up to 5 files)
- Customizable summary length (short, medium, long)
- Multiple output styles (bullets, paragraph, executive)
- Multi-language support
- Key points extraction
- Word count statistics
- Progress tracking
- Export to PDF/DOCX/TXT

#### Configuration

```typescript
export interface SummarizeConfig {
  allowedFileTypes?: string[];
  maxFileSize?: number;
  maxFiles?: number;
  showProgress?: boolean;
  defaultLength?: SummaryLength; // 'short' | 'medium' | 'long'
  defaultStyle?: SummaryStyle;   // 'bullets' | 'paragraph' | 'executive'
  defaultLanguage?: string;
  availableLanguages?: { label: string; value: string }[];
}
```

#### Endpoints

```typescript
export interface SummarizeEndpoints {
  uploadEndpoint?: string;
  startEndpoint?: string;
  statusEndpoint?: string;
  cancelEndpoint?: string;
  exportEndpoint?: string;
}
```

#### Import Path
```typescript
import { SummarizeComponent } from '@features/workflows/templates/components/summarize/summarize.component';
import { SummarizeService } from '@features/workflows/templates/services/summarize.service';
import { SummarizeConfig, SummaryResult, SummarizeFile } from '@features/workflows/templates/utils/tplsInterfaces/summarizeTpl.interface';
```

---

## Template Modes

### Upload Mode (Interactive)

**When to Use:**
- Users need to upload files
- Real-time processing required
- Interactive workflows
- Event handling needed

**Characteristics:**
- File upload interface
- Progress indicators
- Event emitters
- Error handling
- User configuration

**Example:**
```typescript
@Component({
  template: `
    <app-extract-tpl
      [mode]="{ mode: 'upload' }"
      [config]="config"
      [endpoints]="endpoints"
      (fileUploaded)="onFileUploaded($event)"
      (extractCompleted)="onCompleted($event)"
      (extractError)="onError($event)"
    />
  `
})
export class InteractiveExtractComponent {
  config: ExtractConfig = {
    allowedFileTypes: ['.pdf', '.jpg', '.png'],
    maxFileSize: 10 * 1024 * 1024,
    maxFiles: 3,
    showProgress: true,
    extractionSchema: [
      { name: 'invoice_number', type: 'text', required: true },
      { name: 'date', type: 'date', required: true },
      { name: 'total_amount', type: 'number', required: true }
    ],
    enableTableExtraction: true
  };
  
  endpoints = {
    uploadEndpoint: '/api/upload',
    startEndpoint: '/api/extract/start',
    statusEndpoint: '/api/extract/status'
  };
}
```

---

### Preloaded Mode (Display)

**When to Use:**
- Displaying saved results
- Workflow node visualization
- Read-only viewing
- Backend pre-computed data
- Report embedding

**Characteristics:**
- No file upload
- Result display only
- Export functionality
- No event emitters
- Optimized for viewing

**Example:**
```typescript
@Component({
  template: `
    <app-extract-tpl
      [mode]="{ mode: 'preloaded', result: extractResult }"
    />
  `
})
export class PreloadedExtractComponent {
  extractResult: ExtractResult = {
    id: 'extract-123',
    files: [...],
    extractedData: {
      invoice_number: { value: 'INV-2024-001', confidence: 0.98 },
      date: { value: '2024-01-15', confidence: 0.95 },
      total_amount: { value: 1250.00, confidence: 0.99 }
    },
    status: 'completed',
    createdAt: new Date(),
    completedAt: new Date()
  };
}
```

---

## Component APIs

### Chat Component

#### Inputs
```typescript
@Input() messages: ChatMessage[] = [];
@Input() config: Partial<ChatConfig> = {};
@Input() endpoints: Partial<ChatEndpoints> = {};
@Input() currentUser!: ChatSender;
@Input() disabled = false;
@Input() useMockData = true;
```

#### Outputs
```typescript
@Output() messageSent = new EventEmitter<string>();
@Output() messageDeleted = new EventEmitter<string>();
@Output() messageEdited = new EventEmitter<{ id: string; content: string }>();
@Output() attachmentUploaded = new EventEmitter<{ url: string; filename: string }>();
@Output() chatCleared = new EventEmitter<void>();
@Output() errorEmitter = new EventEmitter<Error>();
```

---

### Compare Component

#### Inputs
```typescript
@Input() mode!: CompareMode;
@Input() config: Partial<CompareConfig> = {};
@Input() endpoints: Partial<CompareEndpoints> = {};
@Input() disabled = false;
```

#### Outputs (Upload Mode)
```typescript
@Output() fileUploaded = new EventEmitter<{ slot: 1 | 2; file: CompareFile }>();
@Output() compareStarted = new EventEmitter<void>();
@Output() compareCompleted = new EventEmitter<ComparisonResult>();
@Output() compareError = new EventEmitter<Error>();
```

---

### Extract Component

#### Inputs
```typescript
@Input() mode!: ExtractMode;
@Input() config: Partial<ExtractConfig> = {};
@Input() endpoints: Partial<ExtractEndpoints> = {};
@Input() disabled = false;
```

#### Outputs (Upload Mode)
```typescript
@Output() fileUploaded = new EventEmitter<ExtractFile>();
@Output() extractStarted = new EventEmitter<void>();
@Output() extractCompleted = new EventEmitter<ExtractResult>();
@Output() extractError = new EventEmitter<Error>();
```

---

### Summarize Component

#### Inputs
```typescript
@Input() mode!: SummarizeMode;
@Input() config: Partial<SummarizeConfig> = {};
@Input() endpoints: Partial<SummarizeEndpoints> = {};
@Input() disabled = false;
```

#### Outputs (Upload Mode)
```typescript
@Output() fileUploaded = new EventEmitter<SummarizeFile>();
@Output() summarizeStarted = new EventEmitter<void>();
@Output() summarizeCompleted = new EventEmitter<SummaryResult>();
@Output() summarizeError = new EventEmitter<Error>();
```

---

## Services

### Chat Service

```typescript
@Injectable({ providedIn: 'root' })
export class ChatService {
  configure(options: { endpoints?: Partial<ChatEndpoints> }): void
  
  sendMessage(request: SendMessageRequest, endpoints?: Partial<ChatEndpoints>): Observable<SendMessageResponse>
  
  deleteMessage(messageId: string, endpoints?: Partial<ChatEndpoints>): Observable<DeleteMessageResponse>
  
  editMessage(messageId: string, content: string, endpoints?: Partial<ChatEndpoints>): Observable<Partial<ChatMessage>>
  
  uploadAttachment(file: File, endpoints?: Partial<ChatEndpoints>): Observable<UploadAttachmentResponse>
}
```

---

### Compare Service

```typescript
@Injectable({ providedIn: 'root' })
export class CompareService {
  configure(config: { endpoints?: Partial<CompareEndpoints> }): void
  
  uploadFile(request: CompareUploadRequest, endpoints?: Partial<CompareEndpoints>): Observable<CompareUploadResponse>
  
  startComparison(request: CompareStartRequest, endpoints?: Partial<CompareEndpoints>): Observable<CompareStatusResponse>
  
  getComparison(comparisonId: string, endpoints?: Partial<CompareEndpoints>): Observable<ComparisonResult>
  
  cancelComparison(comparisonId: string, endpoints?: Partial<CompareEndpoints>): Observable<{ success: boolean }>
}
```

---

### Extract Service

```typescript
@Injectable({ providedIn: 'root' })
export class ExtractService {
  configure(config: { endpoints?: Partial<ExtractEndpoints> }): void
  
  uploadFile(request: ExtractUploadRequest, endpoints?: Partial<ExtractEndpoints>): Observable<ExtractUploadResponse>
  
  startExtraction(request: ExtractStartRequest, endpoints?: Partial<ExtractEndpoints>): Observable<ExtractStatusResponse>
  
  getExtraction(extractId: string, endpoints?: Partial<ExtractEndpoints>): Observable<ExtractResult>
  
  cancelExtraction(extractId: string, endpoints?: Partial<ExtractEndpoints>): Observable<{ success: boolean }>
}
```

**Configuration Example:**
```typescript
constructor(private extractService: ExtractService) {
  this.extractService.configure({
    endpoints: {
      uploadEndpoint: '/api/extract/upload',
      startEndpoint: '/api/extract/start',
      statusEndpoint: '/api/extract/status',
      cancelEndpoint: '/api/extract/cancel'
    }
  });
}
```

---

### Summarize Service

```typescript
@Injectable({ providedIn: 'root' })
export class SummarizeService {
  configure(config: { endpoints?: Partial<SummarizeEndpoints> }): void
  
  uploadFile(request: SummarizeUploadRequest, endpoints?: Partial<SummarizeEndpoints>): Observable<SummarizeUploadResponse>
  
  startSummarization(request: SummarizeStartRequest, endpoints?: Partial<SummarizeEndpoints>): Observable<SummarizeStatusResponse>
  
  getSummary(summaryId: string, endpoints?: Partial<SummarizeEndpoints>): Observable<SummaryResult>
  
  cancelSummary(summaryId: string, endpoints?: Partial<SummarizeEndpoints>): Observable<{ success: boolean }>
  
  exportSummary(summaryId: string, format: 'pdf' | 'docx' | 'html' | 'txt', endpoints?: Partial<SummarizeEndpoints>): Observable<Blob>
}
```

---

### Document Export Service

```typescript
@Injectable({ providedIn: 'root' })
export class DocumentExportService {
  isExporting$: Observable<boolean>
  
  export<T extends ExportableData>(
    adapter: ExportAdapter<T>,
    options: ExportOptions
  ): Promise<void>
}
```

**Supported Formats:**
- **PDF**: High-quality PDF generation with screenshots
- **DOCX**: Microsoft Word format with formatting
- **TXT**: Plain text export

**Available Export Adapters:**
- `ComparisonExportAdapter` - For comparison results
- `SummaryExportAdapter` - For summary results

---

### Templating Service

```typescript
@Injectable({ providedIn: 'root' })
export class TemplatingService {
  getComponent(type: TemplateType): Type<TemplateComponentInstance> | undefined
  
  fetchTemplateConfig(pageId = 'default'): Observable<TemplatePageResponse>
  
  getMockComparisonResult(): ComparisonResult
  getMockSummaryResult(): SummaryResult
  getMockExtractResult(): ExtractResult
  getMockChatMessages(): ChatMessage[]
}
```

**Template Types:**
```typescript
export type TemplateType = 'chat' | 'compare' | 'summarize' | 'extract';

export type TemplateComponentInstance = 
  | ChatComponent 
  | CompareComponent 
  | SummarizeComponent 
  | ExtractComponent;
```

---

## Adding New Templates

### Step-by-Step Guide

#### 1. Create Interface Definitions

Create `utils/tplsInterfaces/newTemplate.interface.ts`:

```typescript
// Mode definition
export type NewTemplateMode =
  | { mode: 'upload' }
  | { mode: 'preloaded'; result: NewTemplateResult };

// Configuration
export interface NewTemplateConfig {
  allowedFileTypes?: string[];
  maxFileSize?: number;
  customOption?: string;
}

// Endpoints
export interface NewTemplateEndpoints {
  uploadEndpoint?: string;
  processEndpoint?: string;
  statusEndpoint?: string;
  cancelEndpoint?: string;
}

// File interface
export interface NewTemplateFile {
  key: string;
  name: string;
  size: number;
  type: string;
  url: string;
  uploadDate: Date;
}

// Result interface
export interface NewTemplateResult {
  id: string;
  files: NewTemplateFile[];
  output: any;
  status: 'processing' | 'completed' | 'error';
  createdAt: Date;
  completedAt?: Date;
}
```

#### 2. Create Service

Create `services/newTemplate.service.ts` following the pattern in existing services:
- Implement endpoint configuration
- Provide API methods with endpoint override support
- Include mock data implementations
- Follow the service pattern from Chat/Compare/Summarize services

#### 3. Create Component

Create `components/newTemplate/newTemplate.component.ts` with:
- Signal-based state management
- Upload and preloaded modes
- Error handling
- Progress tracking
- Event emitters for upload mode

#### 4. Create Result Component

Create `components/newTemplate/newTemplate-result/` for displaying results.

#### 5. Add Constants

Update `utils/constants.ts`:

```typescript
export const NEW_TEMPLATE_CONFIG: NewTemplateConfig = {
  allowedFileTypes: ['.pdf', '.docx', '.txt'],
  maxFileSize: 10 * 1024 * 1024,
  // ... other defaults
};
```

#### 6. Create Export Adapter (Optional)

Create `utils/newTemplate-export.adapter.ts`:

```typescript
export class NewTemplateExportAdapter implements ExportAdapter<NewTemplateResult> {
  constructor(private result: NewTemplateResult) {}
  
  getTitle(): string {
    return `Result - ${this.result.id}`;
  }
  
  getContent(): string {
    // Format result for export
  }
  
  getMetadata(): Record<string, string> {
    // Return metadata
  }
  
  getData(): NewTemplateResult {
    return this.result;
  }
}
```

#### 7. Register in Templating Service

Update `services/templating.service.ts`:

```typescript
getComponent(type: TemplateType): Type<TemplateComponentInstance> | undefined {
  const components: Record<TemplateType, Type<TemplateComponentInstance>> = {
    chat: ChatComponent,
    compare: CompareComponent,
    summarize: SummarizeComponent,
    extract: ExtractComponent,
    newTemplate: NewTemplateComponent, // Add here
  };
  return components[type];
}
```

#### 8. Update Type Definitions

Update `utils/template-config.interface.ts`:

```typescript
export type TemplateType = 'chat' | 'compare' | 'summarize' | 'extract' | 'newTemplate';

export type TemplateComponentInstance = 
  | ChatComponent 
  | CompareComponent 
  | SummarizeComponent 
  | ExtractComponent
  | NewTemplateComponent; // Add here
```

---

## Best Practices

### 1. Use Signals for State Management

```typescript
private _isProcessing = signal<boolean>(false);
private _progress = signal<number>(0);

isProcessing$ = computed(() => this._isProcessing());
progress$ = computed(() => this._progress());
```

### 2. Endpoint Override Support

```typescript
uploadFile(request, endpoints?) {
  const endpoint = endpoints?.uploadEndpoint || this.endpoints.uploadEndpoint;
  return endpoint ? this.http.post(endpoint, data) : this.mockUpload(request);
}
```

### 3. Progress Tracking

```typescript
private pollResult(resultId: string): void {
  const interval = setInterval(() => {
    this.service.getResult(resultId).subscribe({
      next: (result) => {
        this._progress.update(p => Math.min(p + 10, 90));
        if (result.status === 'completed') {
          clearInterval(interval);
          this.handleComplete(result);
        }
      }
    });
  }, 2000);
}
```

### 4. File Validation

```typescript
private validateFile(file: File): boolean {
  const config = this._config();
  
  if (config.maxFileSize && file.size > config.maxFileSize) {
    this.errorEmitter.emit(new Error(`File too large: ${file.name}`));
    return false;
  }
  
  const ext = '.' + file.name.split('.').pop()?.toLowerCase();
  if (config.allowedFileTypes && !config.allowedFileTypes.includes(ext)) {
    this.errorEmitter.emit(new Error(`Invalid file type: ${ext}`));
    return false;
  }
  
  return true;
}
```

### 5. Cleanup

```typescript
private destroy$ = new Subject<void>();

ngOnDestroy(): void {
  this.destroy$.next();
  this.destroy$.complete();
}

// Use in subscriptions
.pipe(takeUntil(this.destroy$))
```

---

## Export System

### Document Export Service

Supports multiple export formats with adapters:

```typescript
async exportResult(result: any, format: ExportFormat): Promise<void> {
  const adapter = new ResultExportAdapter(result);
  
  await this.exportService.export(adapter, {
    format,
    filename: `result-${result.id}.${format}`,
    includeScreenshot: format === 'pdf',
    screenshotElement: this.resultContainer,
    metadata: {
      'Template': 'Summarize',
      'Status': result.status
    }
  });
}
```

### Available Export Adapters

- **ComparisonExportAdapter** (`comparison-export.adapter.ts`) - For document comparison results
- **SummaryExportAdapter** (`summary-export.adapter.ts`) - For summarization results

**Note**: Extract export adapter is planned but not yet fully implemented.

---

## Examples

### Complete Template Usage

```typescript
@Component({
  selector: 'app-document-processing',
  template: `
    <div class="template-container">
      <!-- Summarize Template Example -->
      <app-summarize-tpl
        [mode]="{ mode: 'upload' }"
        [config]="summarizeConfig"
        [endpoints]="summarizeEndpoints"
        (fileUploaded)="onFileUploaded($event)"
        (summarizeCompleted)="onSummaryComplete($event)"
        (summarizeError)="onError($event)"
      />
    </div>
  `
})
export class DocumentProcessingComponent {
  summarizeConfig: SummarizeConfig = {
    allowedFileTypes: ['.pdf', '.docx', '.txt'],
    maxFileSize: 10 * 1024 * 1024,
    maxFiles: 5,
    showProgress: true,
    defaultLength: 'medium',
    defaultStyle: 'bullets'
  };

  summarizeEndpoints: Partial<SummarizeEndpoints> = {
    uploadEndpoint: '/api/summarize/upload',
    startEndpoint: '/api/summarize/start',
    statusEndpoint: '/api/summarize/status'
  };

  onSummaryComplete(result: SummaryResult): void {
    console.log('Summary completed:', result);
  }
}
```

---

## Contributing

To add new templates:

1. Follow the step-by-step guide above
2. Create interfaces in `utils/tplsInterfaces/`
3. Create service in `services/`
4. Create component in `components/`
5. Add constants in `utils/constants.ts`
6. Create export adapter (optional) in `utils/`
7. Register in templating service
8. Update type definitions in `template-config.interface.ts`
9. Update documentation
10. Add unit tests
11. Submit PR

---

## 🧑‍💻 Author

**Angular Product Skeleton**  
Built by **Tarik Haddadi** using Angular 19 and modern best practices (2025).