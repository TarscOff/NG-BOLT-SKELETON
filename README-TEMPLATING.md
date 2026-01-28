# Workflow System - Current Implementation

>_Last updated: 2026-01-28_

This document describes the current workflow system implementation in the Angular application, including basic workflow management, visual canvas editing, and template components.

## What's Actually Implemented

### ✅ Workflow Canvas System
- Visual drag-and-drop workflow editor using @ng-draw-flow/core
- Node-based workflow creation with connections
- Basic workflow execution and simulation
- Workflow validation and error checking

### ✅ Template Components
- **Chat Component**: AI-powered conversational interface
- **Compare Component**: Document comparison with diff visualization
- **Summarize Component**: Multi-document summarization
- **Extract Component**: Basic data extraction (structure exists, advanced features partial)

### ✅ Template Services
- HTTP services for each template type (Chat, Compare, Summarize, Extract)
- Mock data implementations for development
- Basic API integration patterns

### ✅ Export System
- Document export service with PDF/DOCX/TXT support
- Export adapters for comparison and summary results
- Screenshot-based PDF generation

### ✅ Basic Workflow Management
- Create, edit, save workflows
- Workflow catalog integration
- Execution history tracking
- Search and filtering

## 📚 Table of Contents

1. [Architecture](#architecture)
2. [Template Components](#template-components)
3. [Template Services](#template-services)
4. [Export System](#export-system)
5. [Workflow Canvas](#workflow-canvas)
6. [Current Limitations](#current-limitations)

---

## Architecture

```
workflows/
├── data/                          # Workflow state management
│   ├── workflows.store.ts         # NgRx Component Store
│   ├── workflows-catalog.service.ts # Action catalog loading
│   └── workflows.component.ts     # Main workflow component
├── sub/                           # Workflow canvas components
│   ├── workflow-canvas.component.ts
│   ├── action-node/
│   ├── details-node/
│   ├── run-panel/
│   └── new-workflow-dialog.component.ts
└── templates/                     # Template system
    ├── components/
    │   ├── chat/                  # Chat template
    │   ├── compare/               # Document comparison
    │   ├── extract/               # Data extraction
    │   ├── summarize/            # Document summarization
    │   ├── export-overlay/       # Shared export overlay
    │   └── loader/               # Dynamic template loader
    ├── services/
    │   ├── chat.service.ts
    │   ├── compare.service.ts
    │   ├── extract.service.ts
    │   ├── summarize.service.ts
    │   ├── document-export.service.ts
    │   └── templating.service.ts
    └── utils/
        ├── constants.ts          # Template constants
        ├── template-config.interface.ts
        ├── comparison-export.adapter.ts
        ├── summary-export.adapter.ts
        └── tplsInterfaces/       # Template interfaces

```
### Current Implementation Notes

- **Workflow Canvas**: Basic drag-and-drop editor with node connections
- **Template Components**: Four template types (Chat, Compare, Summarize, Extract)
- **Services**: HTTP services with mock data fallbacks
- **Export**: PDF/DOCX/TXT export for results
- **State Management**: NgRx Component Store for workflows
```

---

## Template Components

The system includes four template components that can be used independently or within workflows:

### 1. 💬 Chat Template

**Purpose**: AI-powered conversational interface with file attachments

**Features**:
- Real-time message sending and receiving
- File attachments support
- Message history
- Markdown rendering

**Import**:
```typescript
import { ChatComponent } from '@features/workflows/templates/components/chat/chat.component';
import { ChatService } from '@features/workflows/templates/services/chat.service';
```

### 2. 🔄 Compare Template

**Purpose**: Document comparison with diff visualization

**Features**:
- Side-by-side file upload
- Difference highlighting
- Export comparison results
- Visual diff viewer

**Import**:
```typescript
import { CompareComponent } from '@features/workflows/templates/components/compare/compare.component';
import { CompareService } from '@features/workflows/templates/services/compare.service';
```

### 3. 📝 Summarize Template

**Purpose**: Multi-document summarization

**Features**:
- Multiple file upload (up to 5 files)
- Customizable summary length and style
- Progress tracking
- Export to PDF/DOCX/TXT

**Import**:
```typescript
import { SummarizeComponent } from '@features/workflows/templates/components/summarize/summarize.component';
import { SummarizeService } from '@features/workflows/templates/services/summarize.service';
```

### 4. 📤 Extract Template

**Purpose**: Basic data extraction from documents

**Status**: Structure exists, advanced features are partial

**Features**:
- File upload support
- Basic extraction interface
- Result display

**Import**:
```typescript
import { ExtractComponent } from '@features/workflows/templates/components/extract/extract.component';
import { ExtractService } from '@features/workflows/templates/services/extract.service';
```

---

## Template Services

Each template has a corresponding service that handles API communication:

### Chat Service
```typescript
@Injectable({ providedIn: 'root' })
export class ChatService {
  sendMessage(request: SendMessageRequest): Observable<SendMessageResponse>
  uploadAttachment(file: File): Observable<UploadAttachmentResponse>
  // Mock implementations available for development
}
```

### Compare Service
```typescript
@Injectable({ providedIn: 'root' })
export class CompareService {
  uploadFile(request: CompareUploadRequest): Observable<CompareUploadResponse>
  startComparison(request: CompareStartRequest): Observable<CompareStatusResponse>
  getComparison(comparisonId: string): Observable<ComparisonResult>
}
```

### Summarize Service
```typescript
@Injectable({ providedIn: 'root' })
export class SummarizeService {
  uploadFile(request: SummarizeUploadRequest): Observable<SummarizeUploadResponse>
  startSummarization(request: SummarizeStartRequest): Observable<SummarizeStatusResponse>
  getSummary(summaryId: string): Observable<SummaryResult>
}
```

### Extract Service
```typescript
@Injectable({ providedIn: 'root' })
export class ExtractService {
  uploadFile(request: ExtractUploadRequest): Observable<ExtractUploadResponse>
  startExtraction(request: ExtractStartRequest): Observable<ExtractStatusResponse>
  getExtraction(extractId: string): Observable<ExtractResult>
}
```

### Templating Service
```typescript
@Injectable({ providedIn: 'root' })
export class TemplatingService {
  getComponent(type: TemplateType): Type<unknown> | undefined
  fetchTemplateConfig(): Observable<TemplatePageResponse>
}
```

---

## Export System

The system includes a document export service for exporting template results:

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

## Workflow Canvas

The workflow canvas provides a visual drag-and-drop interface for creating workflows:

- **Node-based editor** using @ng-draw-flow/core
- **Action catalog** integration for available workflow actions
- **Workflow execution** with progress tracking
- **Validation** and error checking
- **Execution history** and logging

See [README-CANVAS.md](README-CANVAS.md) for detailed canvas documentation.

---

## Current Limitations

### Partial Implementations

- **Extract Template**: Basic structure exists, advanced features incomplete
- **API Integration**: Services have mock fallbacks, live endpoints may need configuration
- **Export Adapters**: Only comparison and summary adapters implemented

### Development Notes

- Services include mock data implementations for development
- Template components are functional but may lack advanced features
- Workflow execution uses simulation rather than full backend integration
- Export system supports basic PDF/DOCX/TXT generation

---

## Usage Examples

### Using a Template Component

```typescript
@Component({
  template: `
    <app-chat-tpl
      [messages]="messages"
      [currentUser]="currentUser"
      (messageSent)="onMessageSent($event)"
    />
  `
})
export class ChatExampleComponent {
  messages: ChatMessage[] = [];
  currentUser: ChatSender = { id: 'user1', name: 'User' };

  onMessageSent(content: string): void {
    // Handle message
  }
}
```

### Using Template Service

```typescript
constructor(private chatService: ChatService) {}

sendMessage(content: string): void {
  this.chatService.sendMessage({ content })
    .subscribe(response => {
      // Handle response
    });
}
```

### Exporting Results

```typescript
exportResult(result: any): void {
  const adapter = new ComparisonExportAdapter(result);
  this.exportService.export(adapter, {
    format: 'pdf',
    filename: `result-${result.id}.pdf`
  });
}
```
