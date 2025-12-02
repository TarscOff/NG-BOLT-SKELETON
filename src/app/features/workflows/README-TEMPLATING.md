# Workflow Templates System - Complete Guide

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
templates/
├── components/           # Template components
│   ├── chat/            # Chat template
│   │   ├── chat.component.ts
│   │   ├── chatInput/   # Message input component
│   │   └── chatMessage/ # Message display component
│   ├── compare/         # Document comparison template
│   │   ├── compare.component.ts
│   │   └── comparison-result/
│   ├── summarize/       # Document summarization template
│   │   ├── summarize.component.ts
│   │   └── summarize-result/
│   ├── export-overlay/  # Shared export overlay
│   └── loader/          # Dynamic template loader
├── services/            # Business logic services
│   ├── chat.service.ts
│   ├── compare.service.ts
│   ├── summarize.service.ts
│   ├── document-export.service.ts
│   └── templating.service.ts
└── utils/              # Interfaces, adapters, utilities
    ├── chatTpl.interface.ts
    ├── compareTpl.interface.ts
    ├── summarizeTpl.interface.ts
    ├── template-config.interface.ts
    ├── document-export.interface.ts
    ├── *-export.adapter.ts
    └── workflow.interface.ts
```

### Service Pattern

Each template follows a consistent service pattern:

```typescript
@Injectable({ providedIn: 'root' })
export class TemplateService {
  private useMockData = true;
  private endpoints: Partial<TemplateEndpoints> = {};
  
  configure(options: { useMockData?: boolean; endpoints?: Partial<TemplateEndpoints> }): void {
    // Configure service behavior
  }
  
  // API methods
  methodName(request: RequestType, endpoints?: Partial<TemplateEndpoints>): Observable<ResponseType> {
    return this.useMockData 
      ? this.mockMethodName(request)
      : this.httpRequest(request, endpoints);
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
- Markdown support
- Code block rendering
- File attachments
- Typing indicators
- Read receipts
- Message history
- User avatars

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
import { ChatConfig, ChatMessage, ChatSender } from '@features/workflows/templates/utils/chatTpl.interface';
```

---

### 2. 🔄 Compare Template

**Purpose**: Document comparison with diff visualization  
**Use Cases**: Contract comparison, version control, legal document review, change tracking

#### Features
- Side-by-side file upload
- Multiple file format support (.pdf, .docx, .txt, .json, .md)
- Difference highlighting
- Similarity scoring
- Change categorization (added, removed, modified)
- Section-by-section comparison
- Export comparison results

#### Configuration

```typescript
export interface CompareConfig {
  allowedFileTypes?: string[];
  maxFileSize?: number;
  autoCompare?: boolean;
  showSimilarity?: boolean;
  highlightDifferences?: boolean;
  compareEndpoint?: string;
  uploadEndpoint?: string;
  exportEndpoint?: string;
}
```

#### Import Path
```typescript
import { CompareComponent } from '@features/workflows/templates/components/compare/compare.component';
import { CompareService } from '@features/workflows/templates/services/compare.service';
import { CompareConfig, ComparisonResult, CompareFile } from '@features/workflows/templates/utils/compareTpl.interface';
```

---

### 3. 📝 Summarize Template

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

#### Import Path
```typescript
import { SummarizeComponent } from '@features/workflows/templates/components/summarize/summarize.component';
import { SummarizeService } from '@features/workflows/templates/services/summarize.service';
import { SummarizeConfig, SummaryResult, SummarizeFile } from '@features/workflows/templates/utils/summarizeTpl.interface';
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
    <app-summarize-tpl
      [mode]="{ mode: 'upload' }"
      [config]="config"
      [endpoints]="endpoints"
      (fileUploaded)="onFileUploaded($event)"
      (summarizeCompleted)="onCompleted($event)"
      (summarizeError)="onError($event)"
    />
  `
})
export class InteractiveSummarizeComponent {
  config: SummarizeConfig = {
    allowedFileTypes: ['.pdf', '.docx', '.txt'],
    maxFileSize: 10 * 1024 * 1024,
    maxFiles: 5,
    showProgress: true,
    defaultLength: 'medium',
    defaultStyle: 'paragraph',
    defaultLanguage: 'en'
  };
  
  endpoints = {
    uploadEndpoint: '/api/upload',
    startEndpoint: '/api/summarize/start',
    statusEndpoint: '/api/summarize/status'
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
    <app-summarize-tpl
      [mode]="{ mode: 'preloaded', result: summaryResult }"
    />
  `
})
export class PreloadedSummarizeComponent {
  summaryResult: SummaryResult = {
    id: 'summary-123',
    files: [...],
    summary: '...',
    keyPoints: [...],
    style: 'paragraph',
    length: 'medium',
    language: 'en',
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

#### Outputs (Upload Mode)
```typescript
@Output() messageSent = new EventEmitter<string>();
@Output() messageDeleted = new EventEmitter<string>();
@Output() messageEdited = new EventEmitter<{ id: string; content: string }>();
@Output() attachmentUploaded = new EventEmitter<{ url: string; filename: string }>();
@Output() chatCleared = new EventEmitter<void>();
@Output() errorEmitter = new EventEmitter<Error>();
```

#### Usage Example
```typescript
<app-chat-tpl
  [messages]="messages()"
  [config]="chatConfig"
  [endpoints]="chatEndpoints"
  [currentUser]="currentUser"
  [disabled]="isLoading()"
  [useMockData]="false"
  (messageSent)="handleMessage($event)"
  (messageDeleted)="handleDelete($event)"
  (messageEdited)="handleEdit($event)"
  (errorEmitter)="handleError($event)"
/>
```

---

### Compare Component

#### Inputs
```typescript
@Input() mode!: CompareMode; // { mode: 'upload' } | { mode: 'preloaded', result: ComparisonResult }
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

#### Usage Example
```typescript
<app-compare-tpl
  [mode]="compareMode()"
  [config]="compareConfig"
  [endpoints]="compareEndpoints"
  [disabled]="isProcessing()"
  (fileUploaded)="onFileUpload($event)"
  (compareCompleted)="onComparisonDone($event)"
  (compareError)="handleError($event)"
/>
```

---

### Summarize Component

#### Inputs
```typescript
@Input() mode!: SummarizeMode; // { mode: 'upload' } | { mode: 'preloaded', result: SummaryResult }
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

#### Usage Example
```typescript
<app-summarize-tpl
  [mode]="summarizeMode()"
  [config]="summarizeConfig"
  [endpoints]="summarizeEndpoints"
  [disabled]="isProcessing()"
  (fileUploaded)="onFileUpload($event)"
  (summarizeCompleted)="onSummaryDone($event)"
  (summarizeError)="handleError($event)"
/>
```

---

## Services

### Chat Service

```typescript
@Injectable({ providedIn: 'root' })
export class ChatService {
  configure(options: { useMockData?: boolean; endpoints?: Partial<ChatEndpoints> }): void
  
  sendMessage(request: SendMessageRequest, endpoints?: Partial<ChatEndpoints>): Observable<SendMessageResponse>
  
  deleteMessage(messageId: string, endpoints?: Partial<ChatEndpoints>): Observable<DeleteMessageResponse>
  
  editMessage(messageId: string, content: string, endpoints?: Partial<ChatEndpoints>): Observable<Partial<ChatMessage>>
  
  uploadAttachment(file: File, endpoints?: Partial<ChatEndpoints>): Observable<UploadAttachmentResponse>
}
```

**Configuration Example:**
```typescript
constructor(private chatService: ChatService) {
  this.chatService.configure({
    useMockData: false,
    endpoints: {
      sendEndpoint: '/api/chat/send',
      uploadEndpoint: '/api/chat/upload',
      deleteEndpoint: '/api/chat/delete',
      editEndpoint: '/api/chat/edit'
    }
  });
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

**Configuration Example:**
```typescript
constructor(private compareService: CompareService) {
  this.compareService.configure({
    endpoints: {
      uploadEndpoint: '/api/compare/upload',
      startEndpoint: '/api/compare/start',
      statusEndpoint: '/api/compare/status',
      cancelEndpoint: '/api/compare/cancel'
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

**Configuration Example:**
```typescript
constructor(private summarizeService: SummarizeService) {
  this.summarizeService.configure({
    endpoints: {
      uploadEndpoint: '/api/summarize/upload',
      startEndpoint: '/api/summarize/start',
      statusEndpoint: '/api/summarize/status',
      cancelEndpoint: '/api/summarize/cancel',
      exportEndpoint: '/api/summarize/export'
    }
  });
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

**Usage Example:**
```typescript
async exportSummary(result: SummaryResult): Promise<void> {
  const adapter = new SummaryExportAdapter(result);
  
  await this.exportService.export(adapter, {
    format: 'pdf',
    filename: `summary-${result.id}.pdf`,
    includeScreenshot: true,
    screenshotElement: this.summaryContainer,
    metadata: {
      'Style': result.style,
      'Length': result.length,
      'Language': result.language
    }
  });
}
```

---

### Templating Service

**Purpose**: Centralized service for fetching template configurations and managing template lifecycle.

```typescript
@Injectable({ providedIn: 'root' })
export class TemplatingService {
  chatService = inject(ChatService);
  
  getComponent(type: TemplateType): Type<unknown> | undefined
  
  fetchTemplateConfig(pageId = 'default'): Observable<TemplatePageResponse>
  
  getMockComparisonResult(): ComparisonResult
  getMockSummaryResult(): SummaryResult
  getMockChatMessages(): ChatMessage[]
}
```

**Usage Example:**
```typescript
constructor(private templatingService: TemplatingService) {
  this.templatingService.fetchTemplateConfig('dashboard')
    .subscribe(config => {
      this.templates = config.templates;
    });
}
```

---

## Adding New Templates

### Step-by-Step Guide

#### 1. Create Interface Definitions

Create `utils/newTemplate.interface.ts`:

```typescript
// filepath: c:\PROXIMUS_WORK\Skeleton Angular\src\app\features\workflows\templates\utils\newTemplate.interface.ts

// Mode definition
export type NewTemplateMode =
  | { mode: 'upload' }
  | { mode: 'preloaded'; result: NewTemplateResult };

// Configuration interface
export interface NewTemplateConfig {
  allowedFileTypes?: string[];
  maxFileSize?: number;
  customOption?: string;
  defaultValue?: any;
  // Add your config options
}

// Endpoints interface
export interface NewTemplateEndpoints {
  uploadEndpoint?: string;
  processEndpoint?: string;
  statusEndpoint?: string;
  cancelEndpoint?: string;
  exportEndpoint?: string;
}

// Input file interface
export interface NewTemplateFile {
  key: string;
  name: string;
  size: number;
  type: string;
  ext?: string;
  url: string;
  uploadDate: Date;
  file?: File; // Temporary storage
}

// Result interface
export interface NewTemplateResult {
  id: string;
  files: NewTemplateFile[];
  output: string; // Main result
  metadata?: Record<string, any>;
  status: 'processing' | 'completed' | 'error';
  error?: string;
  createdAt: Date;
  completedAt?: Date;
}

// Request/Response interfaces
export interface NewTemplateUploadRequest {
  files: File[];
}

export interface NewTemplateUploadResponse {
  success: boolean;
  files: NewTemplateFile[];
}

export interface NewTemplateStartRequest {
  fileKeys: string[];
  options?: {
    customOption?: string;
    // Add request options
  };
}

export interface NewTemplateStatusResponse {
  resultId: string;
  status: 'processing' | 'completed' | 'error';
  progress?: number;
  result?: NewTemplateResult;
}
```

---

#### 2. Create Service

Create `services/newTemplate.service.ts`:

```typescript
// filepath: c:\PROXIMUS_WORK\Skeleton Angular\src\app\features\workflows\templates\services\newTemplate.service.ts

import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable, of, throwError, delay } from 'rxjs';
import { catchError } from 'rxjs/operators';
import {
  NewTemplateEndpoints,
  NewTemplateUploadRequest,
  NewTemplateUploadResponse,
  NewTemplateStartRequest,
  NewTemplateStatusResponse,
  NewTemplateResult,
  NewTemplateFile
} from '../utils/newTemplate.interface';

@Injectable({
  providedIn: 'root',
})
export class NewTemplateService {
  private http = inject(HttpClient);
  private endpoints: Partial<NewTemplateEndpoints> = {};

  configure(config: { endpoints?: Partial<NewTemplateEndpoints> }): void {
    if (config.endpoints) {
      this.endpoints = config.endpoints;
    }
  }

  /**
   * Upload files
   */
  uploadFile(
    request: NewTemplateUploadRequest,
    endpoints?: Partial<NewTemplateEndpoints>
  ): Observable<NewTemplateUploadResponse> {
    const endpoint = endpoints?.uploadEndpoint || this.endpoints.uploadEndpoint;

    if (!endpoint) {
      // Use mock data
      return this.mockUploadFile(request);
    }

    const formData = new FormData();
    request.files.forEach((file) => formData.append('files', file));

    return this.http.post<NewTemplateUploadResponse>(endpoint, formData).pipe(
      catchError((error) => {
        console.error('Upload error:', error);
        return throwError(() => error);
      })
    );
  }

  /**
   * Start processing
   */
  startProcessing(
    request: NewTemplateStartRequest,
    endpoints?: Partial<NewTemplateEndpoints>
  ): Observable<NewTemplateStatusResponse> {
    const endpoint = endpoints?.processEndpoint || this.endpoints.processEndpoint;

    if (!endpoint) {
      return this.mockStartProcessing(request);
    }

    return this.http.post<NewTemplateStatusResponse>(endpoint, request).pipe(
      catchError((error) => {
        console.error('Process error:', error);
        return throwError(() => error);
      })
    );
  }

  /**
   * Get result
   */
  getResult(
    resultId: string,
    endpoints?: Partial<NewTemplateEndpoints>
  ): Observable<NewTemplateResult> {
    const endpoint = endpoints?.statusEndpoint || this.endpoints.statusEndpoint;

    if (!endpoint) {
      return this.mockGetResult(resultId);
    }

    return this.http.get<NewTemplateResult>(`${endpoint}/${resultId}`).pipe(
      catchError((error) => {
        console.error('Get result error:', error);
        return throwError(() => error);
      })
    );
  }

  /**
   * Cancel processing
   */
  cancelProcessing(
    resultId: string,
    endpoints?: Partial<NewTemplateEndpoints>
  ): Observable<{ success: boolean; resultId: string }> {
    const endpoint = endpoints?.cancelEndpoint || this.endpoints.cancelEndpoint;

    if (!endpoint) {
      return this.mockCancelProcessing(resultId);
    }

    return this.http.post<{ success: boolean; resultId: string }>(
      `${endpoint}/${resultId}`,
      {}
    ).pipe(
      catchError((error) => {
        console.error('Cancel error:', error);
        return throwError(() => error);
      })
    );
  }

  // ============================================================================
  // MOCK DATA METHODS
  // ============================================================================

  private mockUploadFile(
    request: NewTemplateUploadRequest
  ): Observable<NewTemplateUploadResponse> {
    const mockFiles: NewTemplateFile[] = request.files.map((file) => ({
      key: crypto.randomUUID(),
      name: file.name,
      size: file.size,
      type: file.type,
      ext: file.name.split('.').pop()?.toLowerCase(),
      url: `https://mock-storage.example.com/files/${file.name}`,
      uploadDate: new Date(),
    }));

    return of({
      success: true,
      files: mockFiles,
    }).pipe(delay(1000));
  }

  private mockStartProcessing(
    request: NewTemplateStartRequest
  ): Observable<NewTemplateStatusResponse> {
    const resultId = crypto.randomUUID();

    return of({
      resultId,
      status: 'processing',
      progress: 0,
    }).pipe(delay(500));
  }

  private mockGetResult(resultId: string): Observable<NewTemplateResult> {
    const mockResult: NewTemplateResult = {
      id: resultId,
      files: [],
      output: 'Mock processing result',
      metadata: {
        processedAt: new Date().toISOString(),
        version: '1.0.0',
      },
      status: 'completed',
      createdAt: new Date(),
      completedAt: new Date(),
    };

    return of(mockResult).pipe(delay(1000));
  }

  private mockCancelProcessing(
    resultId: string
  ): Observable<{ success: boolean; resultId: string }> {
    return of({
      success: true,
      resultId,
    }).pipe(delay(300));
  }
}
```

---

#### 3. Create Component

Create `components/newTemplate/newTemplate.component.ts`:

```typescript
// filepath: c:\PROXIMUS_WORK\Skeleton Angular\src\app\features\workflows\templates\components\newTemplate\newTemplate.component.ts

import {
  Component,
  ChangeDetectionStrategy,
  Input,
  Output,
  EventEmitter,
  signal,
  computed,
  inject,
  OnInit,
  OnDestroy,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormBuilder, FormGroup, ReactiveFormsModule } from '@angular/forms';
import { Subject, takeUntil } from 'rxjs';
import { Store } from '@ngrx/store';
import { Observable } from 'rxjs';
import { AppSelectors } from '@cadai/pxs-ng-core/store';
import { DynamicFormComponent } from '@cadai/pxs-ng-core/shared';
import { FieldConfig } from '@cadai/pxs-ng-core/interfaces';
import { FieldConfigService } from '@cadai/pxs-ng-core/services';

import { NewTemplateService } from '../../services/newTemplate.service';
import {
  NewTemplateMode,
  NewTemplateConfig,
  NewTemplateEndpoints,
  NewTemplateFile,
  NewTemplateResult,
} from '../../utils/newTemplate.interface';

@Component({
  selector: 'app-new-template-tpl',
  standalone: true,
  imports: [
    CommonModule,
    ReactiveFormsModule,
    DynamicFormComponent,
    // Add Material imports
  ],
  templateUrl: './newTemplate.component.html',
  styleUrls: ['./newTemplate.component.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class NewTemplateComponent implements OnInit, OnDestroy {
  private store = inject(Store);
  private service = inject(NewTemplateService);
  private fb = inject(FormBuilder);
  private fields = inject(FieldConfigService);
  private destroy$ = new Subject<void>();

  // Forms
  form!: FormGroup;
  config: FieldConfig[] = [];

  // Inputs
  @Input() set mode(value: NewTemplateMode) {
    this._mode.set(value);
    if (value.mode === 'preloaded' && value.result) {
      this._result.set(value.result);
      this._files.set(value.result.files);
    }
  }

  @Input() set config(value: Partial<NewTemplateConfig>) {
    this._config.set({ ...this.defaultConfig, ...value });
    this.initializeForm();
  }

  @Input() set endpoints(value: Partial<NewTemplateEndpoints>) {
    this._endpoints.set(value);
  }

  @Input() disabled = false;

  // Outputs
  @Output() fileUploaded = new EventEmitter<NewTemplateFile>();
  @Output() processingStarted = new EventEmitter<void>();
  @Output() processingCompleted = new EventEmitter<NewTemplateResult>();
  @Output() processingError = new EventEmitter<Error>();

  // Signals
  private _mode = signal<NewTemplateMode>({ mode: 'upload' });
  private _config = signal<NewTemplateConfig>(this.defaultConfig);
  private _endpoints = signal<Partial<NewTemplateEndpoints>>({});
  private _files = signal<NewTemplateFile[]>([]);
  private _result = signal<NewTemplateResult | null>(null);
  private _isUploading = signal<boolean>(false);
  private _isProcessing = signal<boolean>(false);
  private _progress = signal<number>(0);

  // Computed
  mode$ = computed(() => this._mode());
  config$ = computed(() => this._config());
  files$ = computed(() => this._files());
  result$ = computed(() => this._result());
  isUploading$ = computed(() => this._isUploading());
  isProcessing$ = computed(() => this._isProcessing());
  progress$ = computed(() => this._progress());

  isDark$!: Observable<boolean>;
  lang$!: Observable<string>;

  isPreloadedMode$ = computed(() => this._mode().mode === 'preloaded');

  private get defaultConfig(): NewTemplateConfig {
    return {
      allowedFileTypes: ['.pdf', '.docx', '.txt'],
      maxFileSize: 10 * 1024 * 1024,
      customOption: 'default',
    };
  }

  ngOnInit(): void {
    this.isDark$ = this.store.select(AppSelectors.ThemeSelectors.selectIsDark);
    this.lang$ = this.store.select(AppSelectors.LangSelectors.selectLang);

    this.service.configure({
      endpoints: this._endpoints(),
    });

    this.initializeForm();
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
  }

  private initializeForm(): void {
    const config = this._config();
    
    this.form = this.fb.group({});
    
    this.config = [
      this.fields.getFileField({
        name: 'files',
        label: 'Upload Files',
        multiple: true,
        accept: config.allowedFileTypes?.join(',') || '*',
        maxFileSize: config.maxFileSize,
        required: false,
        fileVariant: 'dropzone',
      }),
      // Add more fields as needed
    ];
  }

  triggerProcess(): void {
    // Implement processing logic
    const files = this._files();
    if (files.length === 0) return;

    this._isProcessing.set(true);
    this.processingStarted.emit();

    // Upload files first, then process
    this.service
      .uploadFile({ files: files.map(f => f.file!).filter(Boolean) }, this._endpoints())
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: (response) => {
          this._files.set(response.files);
          this.startProcessing(response.files);
        },
        error: (err) => {
          this._isProcessing.set(false);
          this.processingError.emit(err);
        },
      });
  }

  private startProcessing(files: NewTemplateFile[]): void {
    this.service
      .startProcessing(
        {
          fileKeys: files.map((f) => f.key),
          options: {},
        },
        this._endpoints()
      )
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: (response) => {
          if (response.status === 'processing') {
            this.pollResult(response.resultId);
          } else if (response.status === 'completed' && response.result) {
            this.handleComplete(response.result);
          }
        },
        error: (err) => {
          this._isProcessing.set(false);
          this.processingError.emit(err);
        },
      });
  }

  private pollResult(resultId: string): void {
    const interval = setInterval(() => {
      this.service
        .getResult(resultId, this._endpoints())
        .pipe(takeUntil(this.destroy$))
        .subscribe({
          next: (result) => {
            this._progress.update(p => Math.min(p + 10, 90));

            if (result.status === 'completed') {
              clearInterval(interval);
              this._progress.set(100);
              this.handleComplete(result);
            } else if (result.status === 'error') {
              clearInterval(interval);
              this._isProcessing.set(false);
              this.processingError.emit(new Error(result.error || 'Processing failed'));
            }
          },
          error: (err) => {
            clearInterval(interval);
            this._isProcessing.set(false);
            this.processingError.emit(err);
          },
        });
    }, 2000);
  }

  private handleComplete(result: NewTemplateResult): void {
    this._result.set(result);
    this._isProcessing.set(false);
    this.processingCompleted.emit(result);
  }

  clearAll(): void {
    this._files.set([]);
    this._result.set(null);
    this._progress.set(0);
    this.form.reset();
  }
}
```

---

#### 4. Create Result Component

Create `components/newTemplate/newTemplate-result/newTemplate-result.component.ts`:

```typescript
// filepath: c:\PROXIMUS_WORK\Skeleton Angular\src\app\features\workflows\templates\components\newTemplate\newTemplate-result\newTemplate-result.component.ts

import { Component, Input, ChangeDetectionStrategy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { MatCardModule } from '@angular/material/card';
import { MatIconModule } from '@angular/material/icon';
import { NewTemplateResult } from '../../../utils/newTemplate.interface';

@Component({
  selector: 'app-new-template-result-tpl',
  standalone: true,
  imports: [CommonModule, MatCardModule, MatIconModule],
  template: `
    <div class="result-container">
      <mat-card>
        <mat-card-header>
          <mat-icon>check_circle</mat-icon>
          <mat-card-title>Processing Complete</mat-card-title>
        </mat-card-header>
        <mat-card-content>
          <div class="result-output">
            {{ result.output }}
          </div>
          
          @if (result.metadata) {
            <div class="metadata">
              <h3>Metadata</h3>
              <pre>{{ result.metadata | json }}</pre>
            </div>
          }
        </mat-card-content>
      </mat-card>
    </div>
  `,
  styleUrls: ['./newTemplate-result.component.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class NewTemplateResultComponent {
  @Input({ required: true }) result!: NewTemplateResult;
}
```

---

#### 5. Create Export Adapter (Optional)

If you want export functionality:

```typescript
// filepath: c:\PROXIMUS_WORK\Skeleton Angular\src\app\features\workflows\templates\utils\newTemplate-export.adapter.ts

import { ExportAdapter, ExportableData } from './document-export.interface';
import { NewTemplateResult } from './newTemplate.interface';

export class NewTemplateExportAdapter implements ExportAdapter<NewTemplateResult> {
  constructor(private result: NewTemplateResult) {}

  getTitle(): string {
    return `New Template Result - ${this.result.id}`;
  }

  getContent(): string {
    return `
# ${this.getTitle()}

**Status**: ${this.result.status}
**Created**: ${new Date(this.result.createdAt).toLocaleString()}
**Completed**: ${this.result.completedAt ? new Date(this.result.completedAt).toLocaleString() : 'N/A'}

## Output

${this.result.output}

## Files Processed

${this.result.files.map((f, i) => `${i + 1}. ${f.name} (${this.formatFileSize(f.size)})`).join('\n')}

## Metadata

${JSON.stringify(this.result.metadata, null, 2)}
    `.trim();
  }

  getMetadata(): Record<string, string> {
    return {
      'Result ID': this.result.id,
      'Status': this.result.status,
      'Files': this.result.files.length.toString(),
      'Created': new Date(this.result.createdAt).toLocaleDateString(),
    };
  }

  getData(): NewTemplateResult {
    return this.result;
  }

  private formatFileSize(bytes: number): string {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return Math.round((bytes / Math.pow(k, i)) * 100) / 100 + ' ' + sizes[i];
  }
}
```

---

#### 6. Register in Templating Service

Update `services/templating.service.ts`:

```typescript
import { NewTemplateComponent } from '../components/newTemplate/newTemplate.component';

getComponent(type: TemplateType): Type<unknown> | undefined {
  const components: Record<TemplateType, Type<unknown>> = {
    chat: ChatComponent,
    compare: CompareComponent,
    summarize: SummarizeComponent,
    newTemplate: NewTemplateComponent, // Add your new template
  };

  return components[type];
}
```

---

#### 7. Update Template Type

Update `utils/template-config.interface.ts`:

```typescript
export type TemplateType = 'chat' | 'compare' | 'summarize' | 'newTemplate';
```

---

## Export System

### Document Export Service

The export system supports multiple formats:

- **PDF**: Via jsPDF with HTML rendering
- **DOCX**: Via docx library
- **TXT**: Plain text export

### Export Adapter Pattern

Each template implements an `ExportAdapter` to standardize export data:

```typescript
export interface ExportAdapter<T extends ExportableData> {
  getTitle(): string;
  getContent(): string;
  getMetadata(): Record<string, string>;
  getData(): T;
}
```

### Usage Example

```typescript
async handleExport(format: ExportFormat, result: SummaryResult): Promise<void> {
  const adapter = new SummaryExportAdapter(result);
  
  await this.exportService.export(adapter, {
    format,
    filename: `summary-${result.id}.${format}`,
    includeScreenshot: format === 'pdf',
    screenshotElement: this.resultContainer,
    metadata: {
      'Document Type': 'Summary',
      'Language': result.language,
    }
  });
}
```

---

## Best Practices

### 1. Configuration Management

✅ **DO**: Provide sensible defaults
```typescript
private get defaultConfig(): TemplateConfig {
  return {
    allowedFileTypes: ['.pdf', '.docx'],
    maxFileSize: 10 * 1024 * 1024,
    showProgress: true,
  };
}
```

❌ **DON'T**: Require all config options
```typescript
@Input({ required: true }) config!: TemplateConfig; // Bad
```

---

### 2. Service Configuration

✅ **DO**: Support both mock and real endpoints
```typescript
configure(options: { useMockData?: boolean; endpoints?: Partial<Endpoints> }): void {
  this.useMockData = options.useMockData ?? true;
  this.endpoints = options.endpoints ?? {};
}
```

❌ **DON'T**: Hard-code endpoints
```typescript
sendMessage() {
  return this.http.post('https://api.example.com/chat', data); // Bad
}
```

---

### 3. Error Handling

✅ **DO**: Emit errors and provide user feedback
```typescript
.subscribe({
  next: (result) => this.handleSuccess(result),
  error: (err) => {
    console.error('Operation failed:', err);
    this.errorEmitter.emit(err);
  }
});
```

❌ **DON'T**: Silently fail
```typescript
.subscribe({
  next: (result) => this.handleSuccess(result),
  // Missing error handler
});
```

---

### 4. Signal Usage

✅ **DO**: Use signals for reactive state
```typescript
private _isProcessing = signal<boolean>(false);
isProcessing$ = computed(() => this._isProcessing());
```

❌ **DON'T**: Use traditional observables for simple state
```typescript
private isProcessing = new BehaviorSubject<boolean>(false);
isProcessing$ = this.isProcessing.asObservable();
```

---

### 5. Mode Handling

✅ **DO**: Check mode before operations
```typescript
triggerProcess(): void {
  if (this.isPreloadedMode$()) {
    console.warn('Cannot process in preloaded mode');
    return;
  }
  // Process...
}
```

❌ **DON'T**: Allow operations in wrong mode
```typescript
triggerProcess(): void {
  // No mode check - can cause issues
}
```

---

### 6. File Validation

✅ **DO**: Validate file size and type
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

---

### 7. Progress Tracking

✅ **DO**: Show progress for long operations
```typescript
@if (showProgress$() && isProcessing$()) {
  <mat-progress-bar [value]="progress$()" mode="determinate" />
}
```

---

### 8. Cleanup

✅ **DO**: Clean up subscriptions
```typescript
ngOnDestroy(): void {
  this.destroy$.next();
  this.destroy$.complete();
}
```

---

## Examples

### Complete Integration Example

```typescript
@Component({
  selector: 'app-workflow-page',
  standalone: true,
  imports: [ChatComponent, CompareComponent, SummarizeComponent],
  template: `
    <div class="workflow-container">
      <!-- Chat Template -->
      <section>
        <h2>AI Chat</h2>
        <app-chat-tpl
          [messages]="chatMessages()"
          [config]="chatConfig"
          [currentUser]="currentUser"
          (messageSent)="onChatMessage($event)"
        />
      </section>

      <!-- Compare Template -->
      <section>
        <h2>Document Comparison</h2>
        <app-compare-tpl
          [mode]="compareMode()"
          [config]="compareConfig"
          (compareCompleted)="onCompareComplete($event)"
        />
      </section>

      <!-- Summarize Template -->
      <section>
        <h2>Document Summarization</h2>
        <app-summarize-tpl
          [mode]="summarizeMode()"
          [config]="summarizeConfig"
          (summarizeCompleted)="onSummaryComplete($event)"
        />
      </section>
    </div>
  `,
})
export class WorkflowPageComponent {
  chatMessages = signal<ChatMessage[]>([]);
  compareMode = signal<CompareMode>({ mode: 'upload' });
  summarizeMode = signal<SummarizeMode>({ mode: 'upload' });

  currentUser = {
    id: 'user-123',
    name: 'John Doe',
    avatar: ''
  };

  chatConfig: ChatConfig = {
    allowMarkdown: true,
    maxLength: 2000
  };

  compareConfig: CompareConfig = {
    allowedFileTypes: ['.pdf', '.docx'],
    autoCompare: true
  };

  summarizeConfig: SummarizeConfig = {
    maxFiles: 3,
    defaultLength: 'medium'
  };

  onChatMessage(content: string): void {
    // Handle chat message
  }

  onCompareComplete(result: ComparisonResult): void {
    // Handle comparison result
  }

  onSummaryComplete(result: SummaryResult): void {
    // Handle summary result
  }
}
```

---

## Troubleshooting

### Common Issues

**Issue**: Files not uploading
```typescript
// Check file validation
private validateFile(file: File): boolean {
  console.log('Validating file:', file.name, file.size, file.type);
  // Add validation logic
}
```

**Issue**: Service not configured
```typescript
ngOnInit(): void {
  // Ensure service is configured before use
  this.service.configure({
    endpoints: this._endpoints()
  });
}
```

**Issue**: Mock data not working
```typescript
// Verify mock flag
this.service.configure({
  useMockData: true // Enable mock data
});
```

---

## Version History

- **v1.0.0** (November 2025)
  - Initial release
  - Chat, Compare, Summarize templates
  - Export system
  - Mock data support
  - Dual mode system

---

## Contributing

To add new templates:

1. Follow the step-by-step guide above
2. Create interfaces, service, and component
3. Implement both upload and preloaded modes
4. Add export adapter if needed
5. Register in templating service
6. Update documentation
7. Add unit tests
8. Submit PR

---

**Module**: `@features/workflows/templates`  
**Maintained by**: Proximus Workflow Team  
**Last Updated**: November 2025