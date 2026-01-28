# WorkflowPlus - 3-Tier Hierarchical Workflow System

## Overview

WorkflowPlus is a comprehensive workflow management system that enables Super Admins to build complex, reusable workflows through a 3-tier hierarchical architecture. The system combines workflow logic with customizable UI templates to create complete user experiences.

### Layer Linkage Overview

The WorkflowPlus system creates a hierarchical abstraction where each tier builds upon the previous one, creating reusable components that can be composed into complex workflows.

```
┌─────────────────────────────────────────────────────────────────────┐
│                    TIER 3: FEATURE WORKFLOWS                       │
│                    (Complete User Applications View)                │
│  ┌─────────────────┐    ┌─────────────────┐    ┌─────────────────┐  │
│  │   CHAT          │--->│   SUMMARIZE     │--->│    COMPARE      │  │
│  │                 │    │                 │    │                 │  │
│  │ • Chat UI       │    │ • Result View   │    │ • Comparison UI │  │
│  │ • File Upload   │    │                 │    │ • Side-by-Side  │  │
│  │ • History Panel │    │ • Share Options │    │ • Diff Viewer   │  │
│  └─────────────────┘    └─────────────────┘    └─────────────────┘  │
│           │                       │                       │         │
│           ▼                       ▼                       ▼         │
└─────────────────────────────────────────────────────────────────────┘
           │                       │                       │
┌─────────────────────────────────────────────────────────────────────┐
│                    TIER 2: COMPOSITE WORKFLOWS                      │
│                    (Business Logic fOR fEATURE)                     │
│  ┌─────────────────┐    ┌─────────────────┐    ┌─────────────────┐  │
│  │         CHAT    │    │   SUMMARIZE     │    │    COMPARE      │  │
│  │                 │    │                 │    │                 │  │
│  │ Chat RAG        |    ┤ Add Files       │    │ Add Files A     │  │
│  │    +            │    │       +         │    │      +          │  │
│  │ Add Files       │    │ Extract & Sum   │    │ Add Files B     │  │
│  └─────────────────┘    └─────────────────┘    └─────────────────┘  │
│           │                       │                       │         │
│           ▼                       ▼                       ▼         │
└─────────────────────────────────────────────────────────────────────┘
           │                       │                       │
┌─────────────────────────────────────────────────────────────────────┐
│                    TIER 1: MICRO WORKFLOWS                          │
│                    (Atomic Operations)                              │
│  ┌─────────────────┐    ┌─────────────────┐    ┌─────────────────┐  │
│  │   Chat RAG      │    │   Add Files     │    │  Extract & Sum  │  │
│  │                 │    │                 │    │                 │  │
│  │ embed→retrieve  │    │ convert_chunk→  │    │ extract_text→   │  │
│  │   ↓             │    │ embed_docs→     │    │ summarize→      │  │
│  │ →chat           │    │ store_embedded  │    │ format_output   │  │
│  └─────────────────┘    └─────────────────┘    └─────────────────┘  │
│           │                       │                       │         │
│           ▼                       ▼                       ▼         │
└─────────────────────────────────────────────────────────────────────┘
           │                       │                       │
┌─────────────────────────────────────────────────────────────────────┐
│                    BACKEND WORKERS                                  │
│                    (Infrastructure Layer)                           │
│  ┌─────────────────┐    ┌─────────────────┐    ┌─────────────────┐  │
│  │   worker-chat   │    │worker-file      │    │worker-vectordb  │  │
│  │                 │    │                 │    │                 │  │
│  │ • vectorize     │    │ • convert_chunk │    │ • store_embedded│  │
│  │ • embed         │    │ • extract_text  │    │ • retrieve      │  │
│  │ • chat          │    │ • split_docs    │    │ • similarity    │  │
│  └─────────────────┘    └─────────────────┘    └─────────────────┘  │
└─────────────────────────────────────────────────────────────────────┘
```

## Architecture

### 3-Tier Hierarchy

```
Examples Templating Top LEVEL
Each template is a set of composite workflows linked together to provide a full user experience
EACH template HAS A STATUS PUBLISHED /UNPUBLISHED STATUS TO BE AVAILABLE FOR END USERS
Each OF THIS workflow steps are linked with inputs and outputs 
EACH TEMPLATE HAS A STATUS PUBLISHED /UNPUBLISHED STATUS TO BE AVAILABLE FOR END USERS
Each composite generate a custom config with inputs and outputs to be used in the top level

┌─────────────────────────────────────────────────────────────────┐
│ Example Tier 3: Template Workflows  (standalone each one a tab) │
│  ┌───────────────┐                                              │
│  │ SALES CHAT    │                                              │
│  └───────────────┘                                              │
└─────────────────────────────────────────────────────────────────┘
┌─────────────────────────────────────────────────────────────────┐
│ Example Tier 3: Template Workflows  (standalone each one a tab) │
│  ┌───────────────┐    ┌─────────────────┐                       │
│  │ SALES CHAT    │    │ summarize       │                       │
│  └───────────────┘    └─────────────────┘                       │
└─────────────────────────────────────────────────────────────────┘
┌─────────────────────────────────────────────────────────────────┐
│ Example Tier 3: Template Workflows (standalone each one a tab)  │
│  ┌───────────────┐    ┌─────────────────┐                       │
│  │ SALES CHAT    │    │ COMPARE         │                       │
│  └───────────────┘    └─────────────────┘                       │
└─────────────────────────────────────────────────────────────────┘
┌─────────────────────────────────────────────────────────────────┐
│ Example Tier 3: Template Workflows (linked in one same page)    │
│  ┌───────────────┐    ┌─────────────────┐                       │
│  │ SALES CHAT    │--> │ summarize       │                       │
│  └───────────────┘<-- └─────────────────┘                       │
└─────────────────────────────────────────────────────────────────┘
┌─────────────────────────────────────────────────────────────────┐
│ Example Tier 3: Template Workflows (linked in one same page)    │
│  ┌───────────────┐    ┌─────────────────┐                       │
│  │ SALES CHAT    │--> │ COMPARE         │                       │
│  └───────────────┘<-- └─────────────────┘                       │
└─────────────────────────────────────────────────────────────────┘

```

```
Examples COMPOSITE TASKS MID LEVEL
Each composite is a set of Micro tasks linked together to provide a medium level workflow
Each OF THIS workflow steps are linked with inputs and outputs 
EACH composite HAS A STATUS PUBLISHED /UNPUBLISHED STATUS TO BE AVAILABLE FOR END USERS
Each composite generate a custom config with inputs and outputs to be used in the top level
┌──────────────────────────────────────────────────────────────────────────┐
│          Example Tier 2: Composite Workflows (SALES CHAT)                │
│  ┌───────────────┐--> ┌─────────────────┐                                │
│  │   Chat Normal │    │  Add Files      │                                │
│  └───────────────┘<-- └─────────────────┘                                │
└──────────────────────────────────────────────────────────────────────────┘                                         
┌──────────────────────────────────────────────────────────────────────────┐
│          Example Tier 2: Composite Workflows (SOFTWARE CHAT)             │
│  ┌───────────────┐--->┌─────────────────┐                                │
│  │   Chat RAG    │    │  Add Files      │                                │
│  └───────────────┘<---└─────────────────┘                                │
└──────────────────────────────────────────────────────────────────────────┘
┌──────────────────────────────────────────────────────────────────────────┐
│          Example Tier 2: Composite Workflows (HR CHAT)                   │
│  ┌───────────────┐--->┌─────────────────┐                                │
│  │   Chat RAG    │    │  Add Files      │                                │
│  └───────────────┘<---└─────────────────┘                                │
└──────────────────────────────────────────────────────────────────────────┘
┌──────────────────────────────────────────────────────────────────────────┐
│          Example Tier 2: Composite Workflows (COMPARE)                   │
│  ┌───────────────┐--->┌─────────────────┐                                │
│  │   Add Files   │    │  Add Files      │                                │
│  └───────────────┘<---└─────────────────┘                                │
└──────────────────────────────────────────────────────────────────────────┘
┌──────────────────────────────────────────────────────────────────────────┐
│          Example Tier 2: Composite Workflows (summarize)                 │
│  ┌───────────────┐                                                       │
│  │   Add Files   │ --> May be connected to other Micro task                                                       │
│  └───────────────┘                                                       │
└──────────────────────────────────────────────────────────────────────────┘
```

```
Examples MICRO TASKS LOW LEVEL
Each micro task is a set of steps linked together to provide a low level atomic task
Each OF THIS workflow steps are linked with inputs and outputs 
EACH micro HAS A STATUS PUBLISHED /UNPUBLISHED STATUS TO BE AVAILABLE FOR END USERS
Each composite generate a custom config with inputs and outputs to be used in the top level

┌────────────────────────────────────────────────────────────────────────────────────────────────────────────────┐
│                    Example Tier 1: Micro Workflows (Add Files)                 
│  ┌─────────────────────┐-->┌──────────────────────────────────┐-->┌───────────────────────────────────────────┐  
│  │  convert_and_chunk  │   │  embed_langchain_documents       │   │  store_embedded_langchain_documents       │
│  └─────────────────────┘<--└──────────────────────────────────┘<--└───────────────────────────────────────────┘
└────────────────────────────────────────────────────────────────────────────────────────────────────────────────┘
┌─────────────────────────────────────────────────────────────────┐
│                    Example Tier 1: Micro Workflows (Chat Normal)        |         
│  ┌─────────┐-->┌─────────┐                                      |  
│  │  embed  │   │  chat   │                                      |
│  └─────────┘<--└─────────┘                                      |
└─────────────────────────────────────────────────────────────────┘
┌───────────────────────────────────────────────────────────────────┐
│                    Example Tier 1: Micro Workflows (Chat RAG)             |  
│  ┌─────────┐   ┌──────────┐   ┌─────────┐                         |  
│  │  embed  │-->│ retrieve │-->│  chat   │                         |
│  └─────────┘<--└──────────┘<--└─────────┘                         |
└───────────────────────────────────────────────────────────────────┘
```

### Tier 1: Micro Workflows (Atomic Tasks)
- **Purpose**: Individual atomic operations that correspond to backend workers
- **Examples**: `embed`, `retrieve`, `chat`, `convert_and_chunk`, `embed_langchain_documents`, `store_embedded_langchain_documents`
- **Characteristics**:
  - Map 1:1 with backend worker tasks
  - Have specific input/output handles
  - Configurable parameters
  - Custom naming (e.g., "Add Files", "Chat Normal", "Chat RAG", "toto")
  - PUBLISHED/UNPUBLISHED status - only published are available for end users

### Tier 2: Composite Workflows (Medium Level) 
- **Purpose**: Combine multiple micro workflows into meaningful units
- **Examples**: "SALES CHAT" (Chat Normal + Add Files), "HR CHAT" (Chat RAG + Add Files), "SOFTWARE CHAT" (Chat RAG + Add Files), "COMPARE" (Add Files + Add Files)
- **Characteristics**:
  - Built from Tier 1 workflows with linking inputs/outputs
  - Expose simplified input/output interface through custom config
  - Custom naming (e.g., "SALES CHAT", "SOFTWARE CHAT", "HR CHAT", "toto")
  - PUBLISHED/UNPUBLISHED status - only published are available for end users
  - Generate custom config with inputs and outputs for top level use

### Tier 3: Template Workflows (Top Level)
- **Purpose**: Complete user-facing applications with UI components
- **Examples**: "Sales Assistant", "Document Analyzer Pro"
- **Template Patterns**:
  - **Standalone Templates**: Each composite workflow appears as a separate tab/application
    - Single composite per template (e.g., SALES CHAT as standalone tab)
    - Multiple unconnected composites as separate tabs (e.g., SALES CHAT + summarize as separate tabs)
  - **Linked Templates**: Multiple composite workflows connected and working together on the same page
    - Connected composites with data flow (e.g., SALES CHAT → summarize with bidirectional connection)
    - Complex workflows (e.g., SALES CHAT → COMPARE with integrated UI)
- **Characteristics**:
  - Combine multiple Tier 2 workflows with workflow steps linked via inputs/outputs
  - Include comprehensive UI template configuration for full user experience
  - Define user permissions and access control
  - Custom naming (e.g., "Sales Knowledge Assistant", "HR Portal", "toto")
  - PUBLISHED/UNPUBLISHED status - only published are available for end users

## Core Interfaces

### Status Management
```typescript
enum WorkflowStatus {
  DRAFT = 'draft',
  PUBLISHED = 'published',
  UNPUBLISHED = 'unpublished',
  ARCHIVED = 'archived'
}
```

### Micro Workflow
```typescript
interface MicroWorkflow {
  id: string;
  name: string; // Custom name like "Add Files", "Chat Normal", "Chat RAG", "toto"
  description: string;
  status: WorkflowStatus; // PUBLISHED/UNPUBLISHED - only published are available for end users
  worker: WorkerType; // 'worker-file-manipulation', 'worker-llm', etc.
  task: string; // Backend task identifier
  inputHandles: WorkflowHandle[];
  outputHandles: WorkflowHandle[];
  configuration: MicroWorkflowConfig;
  metadata: WorkflowMetadata;
}
```

### Composite Workflow
```typescript
interface CompositeWorkflow {
  id: string;
  name: string; // Custom name like "SALES CHAT", "SOFTWARE CHAT", "HR CHAT", "COMPARE", "summarize", "toto"
  description: string;
  status: WorkflowStatus; // PUBLISHED/UNPUBLISHED - only published are available for end users
  nodes: CompositeWorkflowNode[]; // References to Micro Workflows
  edges: CompositeWorkflowEdge[];
  exposedInputs: ExposedHandle[]; // Custom config with inputs/outputs for top level
  exposedOutputs: ExposedHandle[]; // Custom config with inputs/outputs for top level
  configuration: CompositeWorkflowConfig;
  metadata: WorkflowMetadata;
}
```

### Template Workflow
```typescript
interface TemplateWorkflow {
  id: string;
  name: string; // Custom name like "Sales Assistant", "Document Analyzer", "toto"
  description: string;
  status: WorkflowStatus; // PUBLISHED/UNPUBLISHED - only published are available for end users
  presentationPattern: 'standalone-single' | 'standalone-tabs' | 'linked-integrated';
  compositeWorkflows: TemplateWorkflowNode[]; // References to Composite Workflows
  edges: TemplateWorkflowEdge[]; // Workflow steps linked with inputs and outputs (for linked patterns)
  uiTemplate: UITemplateConfig; // UI component configuration for full user experience
  permissions: WorkflowPermissions;
  metadata: WorkflowMetadata;
}

interface UITemplateConfig {
  layout: 'standalone-single' | 'standalone-tabs' | 'linked-horizontal' | 'linked-vertical' | 'chat-with-files' | 'comparison-view' | 'dashboard' | 'custom';
  components: UIComponentConfig[];
  styling: TemplateStyles;
  tabConfiguration?: TabConfiguration; // For standalone-tabs pattern
  connectionConfiguration?: ConnectionConfiguration; // For linked patterns
}

interface TabConfiguration {
  defaultTab: string;
  tabOrder: string[];
  allowTabSwitching: boolean;
}

interface ConnectionConfiguration {
  showDataFlow: boolean;
  animateConnections: boolean;
  connectionStyle: 'arrows' | 'lines' | 'pipes';
}
```

### Workflow Handle System
```typescript
interface WorkflowHandle {
  id: string;
  artifactType: ArtifactType; // 'string', 'json', 'file', 'collection', etc.
  dataReference: string;
  required: boolean;
  description?: string;
}

enum ArtifactType {
  STRING = 'string',
  JSON = 'json', 
  FILE = 'file',
  COLLECTION = 'collection',
  LIST_FLOAT = 'list[float]',
  LANGCHAIN_DOCUMENTS = 'langchain_documents',
  EMBEDDED_LANGCHAIN_DOCUMENTS = 'embedded_langchain_documents',
  CHAT_HISTORY = 'chat_history',
  USER_PROMPT = 'user_prompt',
  LLM_RESPONSE = 'llm_response',
  EMBEDDINGS = 'embeddings',
  CONTEXT = 'context'
}
```

## Form Configuration System

### Integration with ActionFormSpec
The system integrates with your existing form system using `FieldConfig`:

```typescript
// Convert API response to ActionFormSpec
function convertTemplateStepToActionFormSpec(step: TemplateStepDefinition): ActionFormSpec {
  return {
    make: (F) => step.step_config.map(config => {
      switch (config.type) {
        case 'textarea':
          return F.getTextAreaField(config);
        case 'dropdown':
          return F.getDropdownField(config);
        case 'range':
          return F.getRangeField(config);
        case 'file':
          return F.getFileField(config);
        case 'text':
          return F.getTextField(config);
        default:
          throw new Error(`Unsupported field type: ${config.type}`);
      }
    }),
    defaults: step.step_config.reduce((acc, config) => {
      if (config.defaultValue !== undefined) {
        acc[config.name] = config.defaultValue;
      }
      return acc;
    }, {} as Record<string, any>)
  };
}
```

### Example Form Configuration
```json
{
  "step": "chat",
  "step_id": "chat-rag-template-v1",
  "step_config": [
    {
      "type": "textarea",
      "name": "system_prompt",
      "label": "System Prompt",
      "placeholder": "System prompt…",
      "rows": 10,
      "required": true,
      "validators": ["required", "maxLength:500"],
      "maxLength": 500,
      "defaultValue": "You are a helpful AI assistant.",
      "helperText": "Define the AI's role and behavior"
    },
    {
      "type": "dropdown",
      "name": "temperature",
      "label": "Temperature",
      "options": [
        { "label": "0 – Deterministic", "value": 0 },
        { "label": "0.3 – Focused", "value": 0.3 },
        { "label": "0.7 – Balanced", "value": 0.7 },
        { "label": "1.0 – Creative", "value": 1 }
      ],
      "required": true,
      "defaultValue": 0.7
    }
  ]
}
```

## UI Template System

### Template Presentation Patterns

#### Standalone Templates (Tab-based)
- **Single Composite**: One composite workflow per template, rendered as individual application
  - Example: "SALES CHAT" standalone - displays only the chat + file upload interface
- **Multiple Composites as Tabs**: Multiple unconnected composites, each rendered as separate tab
  - Example: "SALES CHAT" + "summarize" as separate tabs in same application
  - User can switch between SALES CHAT tab and summarize tab independently

#### Linked Templates (Integrated Page)
- **Connected Composites**: Multiple composites working together on same page with data flow
  - Example: "SALES CHAT → summarize" - chat results automatically feed into summarization
  - Bidirectional connection allows summarized insights to enhance chat context
- **Complex Workflows**: Advanced integrations with multiple composite interactions
  - Example: "SALES CHAT → COMPARE" - chat generates content that feeds comparison workflows

### Available UI Components
- **chat**: Interactive chat interface with message history
- **file-uploader**: File upload component with drag-and-drop support
- **result-viewer**: Display workflow results, summaries, and analyses
- **left-panel**: Collapsible side panel for navigation/files/tools
- **tab-container**: Container for organizing multiple standalone composites as tabs
- **workflow-connector**: Visual connector showing data flow between linked composites
- **custom**: Custom components for specialized needs

### Component Binding System
```typescript
interface WorkflowBinding {
  componentProperty: string; // UI component property
  workflowOutput: string; // Workflow output path
  transformation?: DataTransformation; // Optional data transformation
  connectionType?: 'standalone' | 'linked'; // How the component connects to workflows
}
```

### Layout Types
- **standalone-single**: Single composite workflow as full-page application
- **standalone-tabs**: Multiple composites as separate tabs
- **linked-horizontal**: Connected composites arranged horizontally with data flow
- **linked-vertical**: Connected composites arranged vertically with data flow
- **chat-with-files**: Specialized chat interface with file upload panel
- **comparison-view**: Side-by-side comparison layout for COMPARE workflows
- **dashboard**: Multi-widget dashboard layout for complex integrations
- **custom**: Fully customizable layout for specialized use cases

## Workflow Builder Components

### Tier 1 Builder: Micro Workflow Designer
```typescript
@Component({
  selector: 'app-micro-workflow-builder',
  // Allows SuperAdmin to create micro workflows from available workers
})
export class MicroWorkflowBuilderComponent {
  availableWorkers: WorkerDefinition[];
  selectedWorker?: WorkerDefinition;
  microNodes: WorkflowNode[];
}
```

### Tier 2 Builder: Composite Workflow Designer
```typescript
@Component({
  selector: 'app-composite-workflow-builder',
  // Allows SuperAdmin to combine micro workflows
})
export class CompositeWorkflowBuilderComponent {
  availableMicroWorkflows: MicroWorkflow[];
  compositeNodes: WorkflowNode[];
  exposedInputs: ExposedHandle[];
  exposedOutputs: ExposedHandle[];
}
```

### Tier 3 Builder: Template Workflow Designer
```typescript
@Component({
  selector: 'app-template-workflow-builder',
  // Allows SuperAdmin to create complete applications
})
export class TemplateWorkflowBuilderComponent {
  availableComposites: CompositeWorkflow[];
  templateNodes: WorkflowNode[];
  uiTemplate: UITemplateConfig;
  availableUIComponents: UIComponentDefinition[];
}
```

## API Structure

### Workflow Management APIs
```typescript
// Tier 1: Micro Workflows
GET    /api/v1/workflows/micro?status=published        // Get published micro workflows
GET    /api/v1/workflows/micro?status=all             // SuperAdmin: Get all micro workflows
POST   /api/v1/workflows/micro                        // Create micro workflow (draft by default)
PUT    /api/v1/workflows/micro/{id}                   // Update micro workflow
DELETE /api/v1/workflows/micro/{id}                  // Delete micro workflow

// Tier 2: Composite Workflows  
GET    /api/v1/workflows/composite?status=published   // Get published composite workflows
GET    /api/v1/workflows/composite?status=all         // SuperAdmin: Get all composite workflows
POST   /api/v1/workflows/composite                    // Create composite workflow (draft by default)
PUT    /api/v1/workflows/composite/{id}               // Update composite workflow
DELETE /api/v1/workflows/composite/{id}              // Delete composite workflow

// Tier 3: Template Workflows
GET    /api/v1/workflows/template?status=published    // Get published template workflows (end users)
GET    /api/v1/workflows/template?status=all          // SuperAdmin: Get all template workflows
POST   /api/v1/workflows/template                     // Create template workflow (draft by default)
PUT    /api/v1/workflows/template/{id}                // Update template workflow
DELETE /api/v1/workflows/template/{id}               // Delete template workflow

// Status Management (SuperAdmin only)
POST   /api/v1/workflows/{type}/{id}/publish          // Publish workflow (make available to end users)
POST   /api/v1/workflows/{type}/{id}/unpublish        // Unpublish workflow
POST   /api/v1/workflows/{type}/{id}/archive          // Archive workflow

// Hierarchy Management
GET    /api/v1/workflows/template/{id}/hierarchy       // Get complete workflow hierarchy
POST   /api/v1/workflows/validate                     // Validate workflow configuration
GET    /api/v1/workflows/dependencies/{id}            // Get workflow dependencies

// Execution (End Users - Published Templates Only)
POST   /api/v1/workflows/template/{id}/execute        // Execute published template workflow
GET    /api/v1/executions/{id}/status                 // Get execution status
GET    /api/v1/executions/{id}/results                // Get execution results
POST   /api/v1/executions/{id}/cancel                 // Cancel running execution
```


## Getting Started

### Initial Setup
1. **Setup Azure Cosmos DB**: Configure containers with hierarchical partition keys
2. **Install Dependencies**: Add workflow builder components
3. **Configure Services**: Setup `WorkflowDataService` with Cosmos DB connection

### Building Your First Workflows

#### Step 1: Create Micro Workflows (Tier 1)
Start with atomic tasks that correspond to your backend workers:

```typescript
// Create "Add Files" micro workflow
const addFilesMicro = {
  name: "Add Files",
  description: "convert_and_chunk → embed_langchain_documents → store_embedded_langchain_documents",
  status: "draft", // Start as draft
  // ... workflow definition
};

// Create "Chat RAG" micro workflow  
const chatRagMicro = {
  name: "Chat RAG",
  description: "embed → retrieve → chat",
  status: "draft",
  // ... workflow definition
};

// Create "Chat Normal" micro workflow
const chatNormalMicro = {
  name: "Chat Normal", 
  description: "embed → chat",
  status: "draft",
  // ... workflow definition
};
```

#### Step 2: Test and Publish Micro Workflows
```typescript
// Test your micro workflows
await workflowService.validateWorkflow(addFilesMicro);

// Publish when ready
await workflowService.publishWorkflow(tenantId, addFilesMicro.id, 'micro');
await workflowService.publishWorkflow(tenantId, chatRagMicro.id, 'micro');
```

#### Step 3: Create Composite Workflows (Tier 2)
Combine published micro workflows into meaningful units:

```typescript
// Create "HR CHAT" composite
const hrChatComposite = {
  name: "HR CHAT",
  description: "Chat RAG + Add Files for HR domain",
  status: "draft",
  nodes: [
    { microWorkflowId: chatRagMicro.id, /* configuration */ },
    { microWorkflowId: addFilesMicro.id, /* configuration */ }
  ],
  edges: [/* connections between micro workflows */],
  exposedInputs: [/* simplified interface for top level */],
  exposedOutputs: [/* simplified interface for top level */]
};

// Create "SALES CHAT" composite
const salesChatComposite = {
  name: "SALES CHAT",
  description: "Chat Normal + Add Files for sales domain",
  status: "draft",
  nodes: [
    { microWorkflowId: chatNormalMicro.id },
    { microWorkflowId: addFilesMicro.id }
  ]
};
```

#### Step 4: Create Template Workflows (Tier 3)
Build complete user applications with UI components:

```typescript
// Create "Sales Assistant with Summarization" template
const salesTemplate = {
  name: "Sales Assistant Pro",
  description: "Complete sales workflow with chat and summarization",
  status: "draft",
  compositeWorkflows: [
    { compositeWorkflowId: salesChatComposite.id },
    { compositeWorkflowId: summarizeComposite.id }
  ],
  edges: [/* connections between composites */],
  uiTemplate: {
    layout: "chat-with-files",
    components: [
      { type: "chat", /* bindings to workflow outputs */ },
      { type: "file-uploader", /* bindings */ },
      { type: "result-viewer", /* bindings */ }
    ]
  }
};
```

#### Step 5: Publish and Deploy
```typescript
// Publish composite workflows (validates dependencies)
await workflowService.publishWorkflow(tenantId, hrChatComposite.id, 'composite');
await workflowService.publishWorkflow(tenantId, salesChatComposite.id, 'composite');

// Publish template workflows (validates all dependencies)
await workflowService.publishWorkflow(tenantId, salesTemplate.id, 'template');

// Now end users can access published templates
const publishedTemplates = await workflowService.getPublishedWorkflows(tenantId, 'template');
```

### Workflow Lifecycle
1. **Draft**: Create and test workflows
2. **Validate**: Ensure all dependencies are satisfied
3. **Publish**: Make available to end users
4. **Monitor**: Track usage and performance
5. **Update**: Create new versions while maintaining published versions
6. **Archive**: Remove old versions when no longer needed
