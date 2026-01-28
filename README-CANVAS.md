# Workflow Canvas — How to Use, Configure & Extend

_Last updated: 2026-01-28_

This document focuses on the Workflow Canvas implementation based on `@ng-draw-flow/core` used in this repository. It covers palette → canvas drag & drop, ports & connections, inspector dialog integration, pan/zoom math, auto-fit behavior, and the recommended contribution checklist when adding new action types.

## Overview

The Workflow Canvas is a visual drag-and-drop interface for creating AI-powered workflows. It provides:

- **Node-based editing** with drag & drop from palette
- **Real-time validation** of graph structure and connections
- **Dynamic port management** with type-safe connections
- **Execution simulation** with progress tracking
- **Inspector dialogs** for node configuration

## Architecture

```
workflows/
├── data/
│   ├── workflows.store.ts              # State management (NgRx Component Store)
│   ├── workflows-catalog.service.ts    # Action catalog loading
│   └── workflows.component.ts          # Main workflow component
├── sub/
│   ├── workflow-canvas.component.ts    # Canvas implementation
│   ├── action-node.component.ts        # Node renderer
│   ├── action-forms.ts                 # Inspector forms registry
│   ├── wf-canvas-bus.ts                # Event bus for UI coordination
│   └── run-panel/                      # Execution monitoring
└── templates/
    └── utils/
        └── workflow-graph.utils.ts     # Graph validation & utilities
```

## Core Concepts

### Nodes & Ports

**Nodes** represent workflow actions (AI models, data processors, triggers).
**Ports** are connection points on nodes for data flow:

- **Input Ports**: Receive data from other nodes
- **Output Ports**: Send data to other nodes
- **Port Types**: `json`, `string`, `file`, `embeddings`, etc.
- **Required Ports**: Must be connected for workflow to be valid

### Graph Validation

The canvas validates workflows in real-time:

#### Validation Rules

1. **Required Connections**: All `required: true` ports must be connected
2. **No Cycles**: Graph must be a Directed Acyclic Graph (DAG)
3. **Port Compatibility**: Connected ports must have compatible types
4. **Node Validity**: Each node's parameters must be valid

#### Validation States

```typescript
interface WorkflowValidationState {
  valid: boolean;                    // Overall graph validity
  nodeValidity: Record<string, boolean>; // Per-node validity
}
```

#### Common Validation Errors

- **Missing Input**: Required input port not connected
- **Missing Output**: Required output port not connected
- **Cycle Detected**: Graph contains circular dependencies
- **Type Mismatch**: Incompatible port types connected
- **Invalid Parameters**: Node configuration is invalid

### Execution Flow

Workflows execute as pipelines:

1. **Start**: Trigger nodes or manual execution
2. **Traversal**: Topological sort of nodes
3. **Execution**: Each node processes inputs → outputs
4. **Monitoring**: Real-time status updates
5. **Results**: Final outputs and artifacts

## Configuration

### Provider Setup

```ts
providers: [
  provideNgDrawFlowConfigs({
    nodes: {
      chat: WfNodeComponent,
      embed: WfNodeComponent,
      retrieve: WfNodeComponent,
      embed_langchain_documents: WfNodeComponent,
      convert_and_chunk: WfNodeComponent,
      store_embedded_langchain_documents: WfNodeComponent,
      composite: WfNodeComponent,
      'run-panel': WfRunPanelNodeComponent,
    },
    connection: {
      type: DfConnectionType.SmoothStep,
      arrowhead: { type: DfArrowhead.ArrowClosed, width: 5, height: 5 },
    },
  }),
]
```

### Node Registration

Each node type needs:
- **Component**: Visual representation
- **Ports**: Input/output configuration
- **Forms**: Parameter configuration
- **Validation**: Custom validation logic

## Data Management

### Saved Workflows

Workflows are persisted locally using the browser's `localStorage` with automatic state synchronization:

#### Workflow Structure

```typescript
interface WorkflowDraft {
  id: string;                    // Unique identifier
  name: string;                  // Display name
  description?: string;          // Optional description
  visibility: 'public' | 'draft'; // Publication status
  kind: 'standard' | 'reusable';  // Workflow type
  nodes: WorkflowNode[];         // Canvas nodes
  edges: WorkflowEdge[];         // Node connections
  createdAt: string;             // ISO timestamp
  updatedAt: string;             // ISO timestamp
  version: number;               // Version counter
  needsRepublish?: boolean;      // Flag for modified public workflows
}
```

#### Persistence Behavior

- **Auto-save**: Workflows are automatically saved to `localStorage` on every state change
- **Dirty tracking**: Changes are tracked per workflow with signature-based comparison
- **Version management**: Public workflows become drafts when modified
- **Storage key**: `app_workflows_v1`

#### Workflow Operations

```typescript
// Create new workflow
store.createWorkflow({
  name: 'My Workflow',
  description: 'AI-powered document processor',
  visibility: 'draft',
  kind: 'standard'
});

// Load existing workflow
store.loadWorkflow({ workflow: savedWorkflow });

// Update workflow metadata
store.updateWorkflowMeta({
  name: 'Updated Name',
  visibility: 'public'
});

// Duplicate workflow
store.duplicateWorkflow({ id: 'workflow-id' });

// Delete workflow
store.deleteWorkflow({ id: 'workflow-id' });
```

### Workflows Store (NgRx Component Store)

The `WorkflowsStore` manages all workflow-related state using NgRx Component Store pattern:

#### State Structure

```typescript
interface WorkflowState {
  workflows: WorkflowDraft[];           // All saved workflows
  selectedWorkflowId: string | null;    // Currently active workflow
  dirty: boolean;                       // Current workflow has unsaved changes
  dirtyById: Record<string, boolean>;   // Dirty status per workflow
  savedSigById: Record<string, string>; // Saved signatures for change detection
  portTypes: PortTypeOption[];          // Available port types
  validation: WorkflowValidationState;  // Graph validation state
  selection: WorkflowSelectionState;    // Selected nodes/edges
  executionHistory: WorkflowExecutionLog[]; // Past executions
  currentExecutionId: string | null;    // Running execution
  viewingExecutionId: string | null;    // Execution being viewed
  catalog: ActionDefinitionLite[];      // Available actions
  catalogLoaded: boolean;               // Catalog load status
}
```

#### Key Selectors

```typescript
// Observable streams
readonly workflows$ = this.select((s) => s.workflows);
readonly selectedWorkflow$ = this.select(/* combined selector */);
readonly validation$ = this.select((s) => s.validation);
readonly executionHistory$ = this.select((s) => s.executionHistory);
readonly catalog$ = this.select((s) => s.catalog);
readonly dirty$ = this.select((s) => s.dirty);

// Computed selectors
readonly validityById$ = this.select(/* validation computation */);
readonly canPublishById$ = this.select(/* publish eligibility */);
readonly canDraft$ = this.select(/* draft eligibility */);
```

#### State Updaters

**Graph Management:**
```typescript
readonly updateGraph = this.updater((state, payload: { nodes: WorkflowNode[]; edges: WorkflowEdge[] }) => {
  // Updates nodes/edges, handles versioning, dirty tracking
});

readonly revalidateSelected = this.updater((state) => {
  // Recomputes validation for current workflow
});
```

**Workflow CRUD:**
```typescript
readonly createWorkflow = this.updater(/* creates new workflow */);
readonly loadWorkflow = this.updater(/* loads existing workflow */);
readonly updateWorkflow = this.updater(/* updates workflow data */);
readonly deleteWorkflow = this.updater(/* removes workflow */);
```

**Execution Management:**
```typescript
readonly startExecution = this.updater(/* creates execution run */);
readonly updateNodeStatus = this.updater(/* updates node execution status */);
readonly completeExecution = this.updater(/* finishes execution */);
readonly appendLog = this.updater(/* adds execution log message */);
```

#### Effects

```typescript
readonly persist = this.effect(/* triggers storage persistence */);
readonly restore = this.effect(/* triggers storage restoration */);
```

### Catalog Service

The `WorkflowsCatalogService` loads and normalizes action definitions from backend APIs:

#### Catalog Loading

```typescript
@Injectable({ providedIn: 'root' })
export class WorkflowsCatalogService {
  loadCatalog(): Observable<ActionDefinitionLite[]> {
    // Loads from API or falls back to hardcoded catalog
  }
}
```

#### Fallback Catalog

When backend is unavailable, uses hardcoded action definitions:

```typescript
private fallback: ActionDefinitionLite[] = [
  {
    type: 'chat',
    params: {
      icon: 'chat',
      ports: {
        inputs: [{ id: 'in', data_reference: 'in', artifact_type: 'json' }],
        outputs: [{ id: 'out', data_reference: 'out', artifact_type: 'json' }]
      },
      ports_map: {
        in: { required: true, readonly: false },
        out: { required: false, readonly: false }
      }
    }
  },
  // ... more actions
];
```

#### API Response Normalization

Handles various backend response formats and normalizes to consistent structure:

```typescript
private normalizeNode(raw: unknown): ActionDefinitionLite {
  // Extracts type, params, ports from different API formats
  // Handles input_handles, output_handles, inputHandles, etc.
  // Builds ports_map for quick lookups
}
```

#### Port Configuration

Actions define their inputs/outputs with data references and types:

```typescript
interface WorkflowPorts {
  inputs: WorkflowPort[];
  outputs: WorkflowPort[];
}

interface WorkflowPort {
  id: string;
  label?: string;
  type: string;              // 'json', 'string', 'file', etc.
  required?: boolean;
  readonly?: boolean;
  data_reference?: string;   // Backend data identifier
  artifact_type?: string;    // Data type
}
```

#### Integration with Store

```typescript
// Store loads catalog on initialization
readonly setCatalog = this.updater((state, payload: { catalog: ActionDefinitionLite[] }) => {
  // Processes catalog, builds ports_map, sets catalogLoaded: true
});
```

## API Integration Guide

### Current State

The canvas currently uses **simulation mode** for development:

- ✅ Mock execution with realistic delays
- ✅ Progress tracking and status updates
- ✅ Error handling and logging
- ❌ No real backend API calls

### Connecting to Backend APIs

#### Step 1: Environment Configuration

Set API endpoints in your environment:

```bash
# .env or docker-compose.yml
API_URL=https://your-api.example.com
WORKFLOW_API_BASE=/api/v1/workflows
EXECUTION_API_BASE=/api/v1/executions
```

#### Step 2: Update Service Endpoints

Replace simulation with real API calls in `workflows.store.ts`:

```typescript
// Before (simulation)
readonly startExecution = this.updater((state) => this.createRun(state, undefined));

// After (real API)
readonly startExecution = this.effect((payload$: Observable<void>) => {
  return payload$.pipe(
    withLatestFrom(this.selectedWorkflow$),
    switchMap(([_, workflow]) => {
      if (!workflow) return EMPTY;

      const endpoint = `${this.apiBase}/execute`;
      return this.http.post<ExecutionResponse>(endpoint, {
        workflowId: workflow.id,
        nodes: workflow.nodes,
        edges: workflow.edges
      }).pipe(
        tap(response => this.updateExecutionState(response)),
        catchError(error => this.handleExecutionError(error))
      );
    })
  );
});
```

#### Step 3: Required API Endpoints

Your backend must provide these endpoints:

```typescript
// Workflow Management
GET    /api/v1/workflows/catalog     // Get available actions
GET    /api/v1/workflows/{id}        // Get workflow definition
POST   /api/v1/workflows             // Create workflow
PUT    /api/v1/workflows/{id}        // Update workflow
DELETE /api/v1/workflows/{id}        // Delete workflow

// Execution
POST   /api/v1/executions            // Start execution
GET    /api/v1/executions/{id}/status// Get execution status
GET    /api/v1/executions/{id}/logs  // Get execution logs
DELETE /api/v1/executions/{id}       // Cancel execution

// Results
GET    /api/v1/executions/{id}/results     // Get final results
GET    /api/v1/executions/{id}/artifacts   // Get generated files
```

#### Step 4: Data Format Mapping

Map frontend workflow format to backend:

```typescript
// Frontend format
interface WorkflowNode {
  id: string;
  type: string;
  data: {
    params: Record<string, any>;
    ports: WorkflowPorts;
  };
}

// Backend format (example)
interface BackendWorkflowNode {
  node_id: string;
  action_type: string;
  parameters: Record<string, any>;
  inputs: PortDefinition[];
  outputs: PortDefinition[];
}
```

#### Step 5: Real-time Updates

Implement WebSocket or Server-Sent Events for live updates:

```typescript
// WebSocket connection for execution updates
private connectToExecution(executionId: string): void {
  const wsUrl = `ws://api.example.com/executions/${executionId}`;
  this.wsConnection = new WebSocket(wsUrl);

  this.wsConnection.onmessage = (event) => {
    const update: ExecutionUpdate = JSON.parse(event.data);
    this.store.updateExecutionStatus(update);
  };
}
```

#### Step 6: Error Handling

Implement comprehensive error handling:

```typescript
private handleExecutionError(error: HttpErrorResponse): Observable<never> {
  const executionError: ExecutionError = {
    type: 'EXECUTION_FAILED',
    message: error.message,
    details: error.error,
    nodeId: error.error?.failedNodeId,
    timestamp: new Date().toISOString()
  };

  this.store.addExecutionError(executionError);
  return throwError(() => executionError);
}
```

### Migration Checklist

- [ ] Configure API endpoints in environment
- [ ] Implement workflow CRUD operations
- [ ] Implement execution start/stop/status APIs
- [ ] Add real-time execution updates
- [ ] Implement artifact download endpoints
- [ ] Add comprehensive error handling
- [ ] Update UI to handle real API responses
- [ ] Add loading states and retry logic
- [ ] Implement execution history persistence
- [ ] Add execution cancellation support

## Adding New Node Types

### Quick Checklist

1. **Backend Contract**: Expose action in `/api/v1/workflows/catalog`
2. **Catalog Entry**: Add to `fallbackCatalog` in `workflows-catalog.service.ts`
3. **Component Registration**: Add to `provideNgDrawFlowConfigs`
4. **Port Configuration**: Define inputs/outputs in catalog
5. **Form Definition**: Add `ActionFormSpec` in `action-forms.ts`
6. **Validation**: Update `computeValidation` if needed
7. **Testing**: Test drag-drop, connections, execution
8. **Documentation**: Update this README

### Detailed Steps

#### 1. Backend Action Definition

Your backend should return actions like:

```json
{
  "type": "my_custom_action",
  "params": {
    "icon": "settings",
    "ports": {
      "inputs": [
        {
          "id": "input_data",
          "label": "Input Data",
          "type": "json",
          "required": true,
          "data_reference": "input_data"
        }
      ],
      "outputs": [
        {
          "id": "result",
          "label": "Result",
          "type": "json",
          "required": false,
          "data_reference": "result"
        }
      ]
    }
  }
}
```

#### 2. Fallback Catalog Entry

Add to `workflows-catalog.service.ts`:

```typescript
private fallback: ActionDefinitionLite[] = [
  // ... existing entries
  {
    type: 'my_custom_action',
    params: {
      icon: 'settings',
      ports: {
        inputs: [{ id: 'input_data', data_reference: 'input_data', artifact_type: 'json', required: true }],
        outputs: [{ id: 'result', data_reference: 'result', artifact_type: 'json' }]
      }
    }
  }
];
```

#### 3. Canvas Registration

Update `workflow-canvas.component.ts`:

```typescript
provideNgDrawFlowConfigs({
  nodes: {
    // ... existing
    my_custom_action: WfNodeComponent,
  },
  // ...
})
```

#### 4. Inspector Form

Add to `action-forms.ts`:

```typescript
export const ACTION_FORMS: Record<string, ActionFormSpec> = {
  // ... existing
  my_custom_action: {
    make: (F) => [
      F.getTextField({
        name: 'param1',
        label: 'Parameter 1',
        required: true
      }),
      F.getDropdownField({
        name: 'param2',
        label: 'Parameter 2',
        options: [
          { label: 'Option A', value: 'a' },
          { label: 'Option B', value: 'b' }
        ],
        required: true
      })
    ]
  }
};
```

#### 5. Execution Handler

Update execution logic to handle your action:

```typescript
// In execution simulation or real API
case 'my_custom_action':
  // Process node with custom logic
  result = await processMyCustomAction(node.params);
  break;
```

## Troubleshooting

### Common Issues

**Nodes don't appear in palette:**
- Check catalog service is loading actions
- Verify action type matches component registration
- Check browser console for errors

**Ports not showing:**
- Verify `ports` configuration in catalog
- Check `ensurePorts` function in `workflow-graph.utils.ts`
- Look for `ports_map` configuration

**Connections not working:**
- Check port IDs match between source/target
- Verify port types are compatible
- Check for validation errors blocking connections

**Validation errors:**
- Use browser dev tools to inspect `WorkflowValidationState`
- Check `computeValidation` function for logic
- Verify required ports are connected

**Execution fails:**
- Check simulation logic in `workflow-canvas.component.ts`
- Verify node parameters are valid
- Check for missing dependencies

### Debug Tools

```typescript
// Log current validation state
console.log('Validation:', this.store.validation$);

// Log current workflow
console.log('Workflow:', this.store.selectedWorkflow$);

// Log execution state
console.log('Execution:', this.store.currentExecution$);
```

## Performance Considerations

### Optimization Tips

1. **Lazy Loading**: Load node components on demand
2. **Virtual Scrolling**: For large workflows with many nodes
3. **Debounced Validation**: Don't validate on every keystroke
4. **Memoized Computations**: Cache expensive validation results
5. **Web Workers**: Move validation to background threads

### Memory Management

- Clean up subscriptions in `ngOnDestroy`
- Dispose of WebSocket connections
- Clear execution timers
- Remove event listeners

## References

- **Canvas Code**: [src/app/features/workflows/sub/workflow-canvas.component.ts](src/app/features/workflows/sub/workflow-canvas.component.ts#L1)
- **Node Renderer**: [src/app/features/workflows/sub/action-node/action-node.component.ts](src/app/features/workflows/sub/action-node/action-node.component.ts#L1)
- **State Management**: [src/app/features/workflows/data/workflows.store.ts](src/app/features/workflows/data/workflows.store.ts#L1)
- **Validation Logic**: [src/app/features/workflows/templates/utils/workflow-graph.utils.ts](src/app/features/workflows/templates/utils/workflow-graph.utils.ts#L1)
- **Catalog Service**: [src/app/features/workflows/data/workflows-catalog.service.ts](src/app/features/workflows/data/workflows-catalog.service.ts#L1)
