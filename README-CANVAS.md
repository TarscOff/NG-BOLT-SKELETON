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
- **Type Validation**: Ports validate type compatibility when connecting (n8n-inspired)

### Port Type Compatibility

When creating connections, the canvas validates that output and input port types are compatible:

**Compatible Type Mappings:**
- `json` ↔ `object`, `array`, `collection`, `embeddings`
- `string` ↔ `text`, `message`, `prompt`
- `file` ↔ `binary`, `blob`, `document`
- `list[T]` ↔ `T[]` (array types with matching base types)
- `number` ↔ `int`, `integer`, `float`, `double`
- `any` ↔ any type (universal compatibility)

**Validation Behavior:**
- Incompatible connections are **rejected** with an error toast
- Error message shows source/target nodes, ports, and types
- Connection is not created in the graph
- User must connect compatible ports

**Example Error:**
```
Cannot connect Chat.llm_response (string) to Embed.embeddings (list[float]). 
Port types are incompatible.
```

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

## Developer Notes

### Run Panel Refactoring & Toolbar Count Display (Feb 2026)

**Files touched:**
- `src/app/features/workflows/workflows.component.ts`
- `src/app/features/workflows/workflows.component.html`
- `src/app/features/workflows/sub/run-panel/run-panel.component.ts` (new)
- `src/app/features/workflows/sub/run-panel/run-panel.component.html` (new)
- `src/app/features/workflows/sub/run-panel/run-panel.component.scss` (new)
- `src/app/features/workflows/sub/run-panel/run-panel-detail.component.ts` (new)
- `src/app/features/workflows/sub/run-panel/run-panel-detail.component.html` (new)
- `src/app/features/workflows/sub/run-panel/run-panel-detail.component.scss` (new)
- `src/app/features/workflows/sub/run-panel/run-panel-node.component.ts` (removed)
- `src/app/features/workflows/sub/run-panel/run-panel-node.component.html` (removed)
- `src/app/features/workflows/sub/run-panel/run-panel-node.component.scss` (removed)
- `src/app/features/workflows/sub/workflow-canvas-df.component.html`
- `src/app/features/workflows/sub/workflow-canvas.component.ts`
- `public/assets/i18n/en.json`
- `public/assets/i18n/fr.json`

**Changes:**

1. **Run Panel Architecture Refactoring**
   - Removed canvas-node-based run panel (WfRunPanelNodeComponent extending DrawFlowBaseNode)
   - Created standalone sidebar-based run panel components (RunPanelComponent, RunPanelDetailComponent)
   - Run panel now displays in dedicated mat-sidenav instead of workflow canvas node
   - Better UX with proper panel hierarchy: workflows list → run panel → run detail
   - Removed run panel button from canvas toolbar

2. **Dynamic Run Count in Toolbar**
   - Added reactive run count display to "Run panel" toolbar button
   - Toolbar label now shows "Run panel (N)" where N is dynamic count using translation interpolation
   - Uses `translate.instant('run-panel', { count: this.runs().length })` for synchronous string generation
   - Updates reactively via effect() when selectedWorkflow or runs signals change
   - Translation keys updated with `{{count}}` parameter in en.json and fr.json

3. **Component Structure Changes**
   - RunPanelComponent: Main panel showing list of runs
   - RunPanelDetailComponent: Detailed view for individual run inspection
   - Both components use signal-based architecture with computed values
   - Proper separation of concerns between list view and detail view

4. **Translation System Integration**
   - Added translation parameter support: `"run-panel": "Run panel ({{count}})"`
   - French translation: `"run-panel": "Panneau d'éxécutions ({{count}})"`
   - Added `workflow.runPanel.no_executions` key for empty state
   - Enables proper localization across multiple languages

**Technical Implementation:**

```typescript
// Toolbar update function with reactive run count
const updateToolbar = () => {
    const panelWorkflow: ToolbarAction = {
        label: this.translate.instant('run-panel', { count: this.runs().length })
        // ... other properties
    };
    // Recreate all toolbar actions with fresh state
    const workflow = this.selectedWorkflow();
    if (workflow) {
        this.toolbar.scope(this.destroyRef, [panelWorkflow, newWorkflow, saveWorkflow, publishWorkflow]);
    } else {
        this.toolbar.scope(this.destroyRef, [newWorkflow]);
    }
};

// Effect wrapper for reactive updates
runInInjectionContext(this.injector, () => {
    effect(() => {
        this.selectedWorkflow();
        this.runs();
        updateToolbar();
    });
});
```

### Connection Styling & Execution Visualization (Feb 2026)

**Files touched:**
- `src/app/features/workflows/sub/workflow-canvas.component.ts`
- `src/app/features/workflows/sub/workflow-canvas-df.component.scss`
- `src/app/features/workflows/sub/run-panel/run-view-dialog.component.ts`
- `src/app/features/workflows/templates/utils/workflow.interface.ts`

**Changes:**

1. **Source-only Connection Styling Logic**
   - Connections now style based exclusively on SOURCE node execution status
   - Prevents incorrect styling of unrelated connections (e.g., when A→B→C runs, E→B won't be styled even though B has a status)
   - Implementation uses edge key mapping (`${source}:${target}`) with source status check
   - Uses `dfModel().connections` to match DOM order for proper SVG path targeting

2. **Execution Animations**
   - Integrated smooth flowing animations for connection states:
     - **Running**: Pulsing glow effect (primary color)
     - **Success**: Flash and settle effect (success color)
     - **Error**: Strong pulsing (error color)
     - **Queued**: Gentle breathing effect (warning color)
     - **Skipped**: Dimmed appearance (neutral color)
   - All animations use project color variables (`--mat-primary`, `--mat-success`, `--mat-error`, `--mat-warn`, `--mat-neutral`)
   - Leverages CSS `color-mix()` for transparent variations instead of hardcoded RGBA values

3. **Historical Run Visualization**
   - Run view dialog now displays ONLY executed nodes (filters by `run.state` keys)
   - Shows ONLY ports that were actively used during execution:
     - Input ports shown if they received data from a connection
     - Output ports shown if they sent data through a connection
   - Provides clean "execution trace" view without unused elements
   - Added `snapshotNodes` and `snapshotEdges` to `RunEntry` interface for historical state preservation
   - Workflow execution logs capture full node/edge snapshots at execution start

**Technical Details:**

```typescript
// Connection styling logic (source-only approach)
private applyConnectionStyles(runStateData: Record<string, Status>, edges: WorkflowEdge[]): void {
  // Build edge status map - only includes edges where SOURCE has a status
  const edgeStatusMap = new Map<string, Status>();
  edges.forEach(edge => {
    const key = `${edge.source}:${edge.target}`;
    const sourceStatus = runStateData[edge.source];
    if (sourceStatus) {
      edgeStatusMap.set(key, sourceStatus);
    }
  });
  
  // Apply styles using dfModel connections order
  const dfConnections = this.dfModel().connections || [];
  dfConnections.forEach((dfConn, index) => {
    const key = `${dfConn.source.nodeId}:${dfConn.target.nodeId}`;
    const sourceStatus = edgeStatusMap.get(key);
    if (!sourceStatus) return; // Skip if source wasn't executed
    // ... apply styling based on sourceStatus
  });
}
```

```typescript
// Run view filtering (execution trace)
constructor() {
  // Get executed node IDs from run state
  const executedNodeIds = new Set(Object.keys(this.run.state || {}));
  
  // Filter to executed nodes only
  const executedNodes = snapshotNodes.filter(node => executedNodeIds.has(node.id));
  const executedEdges = snapshotEdges.filter(edge => 
    executedNodeIds.has(edge.source) && executedNodeIds.has(edge.target)
  );
  
  // Track used ports from connections
  const usedInputPorts = new Map<string, Set<string>>();
  const usedOutputPorts = new Map<string, Set<string>>();
  executedEdges.forEach(edge => {
    // Record which ports were actually used
  });
  
  // Filter ports to show only connected ones
  this.nodes = executedNodes.map(node => ({
    ...node,
    ports: {
      inputs: node.ports.inputs.filter(port => usedInputPorts.get(node.id)?.has(port.id)),
      outputs: node.ports.outputs.filter(port => usedOutputPorts.get(node.id)?.has(port.id))
    }
  }));
}
```

**Impact:**
- Accurate visual feedback during workflow execution
- Clear historical run visualization showing exact execution path
- Consistent styling using project design system
- Better UX for debugging workflow execution issues

### Port Type Validation (Feb 2026)

**Files touched:**
- `src/app/features/workflows/sub/workflow-canvas.component.ts`
- `public/assets/i18n/en.json`
- `public/assets/i18n/fr.json`

**Changes:**

1. **n8n-Inspired Type Validation**
   - Validates port type compatibility when creating connections
   - Rejects incompatible connections with descriptive error messages
   - Connection is prevented from being created if types don't match
   - Error toast displays source/target nodes, ports, and types

2. **Type Compatibility Rules**
   - Exact type matching (e.g., `string` matches `string`)
   - JSON compatibility with complex types (`json` ↔ `object`, `array`, `collection`)
   - String compatibility with text types (`string` ↔ `text`, `message`, `prompt`)
   - File compatibility (`file` ↔ `binary`, `blob`, `document`)
   - Array/List base type matching (`list[float]` ↔ `float[]`)
   - Number type compatibility (`number` ↔ `int`, `integer`, `float`, `double`)
   - Universal `any` type compatibility

**Technical Details:**

```typescript
// Port type validation in onConnectionCreated
onConnectionCreated(evt: DfEvent<DfDataConnection>): void {
  // ... get source and target nodes/ports
  
  const isCompatible = this.arePortTypesCompatible(
    sourcePort.type || sourcePort.artifact_type,
    targetPort.type || targetPort.artifact_type
  );
  
  if (!isCompatible) {
    this.toast.showError(
      this.translate.instant('workflow.errors.incompatible_port_types', {
        sourceNode, sourcePort, sourceType,
        targetNode, targetPort, targetType
      })
    );
    return; // Cancel connection creation
  }
  
  // ... proceed with connection creation
}

// Type compatibility checking
private arePortTypesCompatible(sourceType?: string, targetType?: string): boolean {
  // Handle undefined, 'any', exact matches
  // JSON ↔ complex types
  // String ↔ text types
  // File ↔ binary types
  // Array base type matching
  // Number type compatibility
  // Boolean matching
}
```

**User Experience:**
- Immediate feedback when attempting incompatible connections
- Clear error messages explaining why connection was rejected
- Prevents invalid workflow configurations at design time
- Reduces runtime errors from type mismatches

**Impact:**
- Prevents type-related execution errors
- Improves workflow design experience
- Provides clear feedback for debugging
- Aligns with industry standards (n8n-inspired)

### Node Details Dialog with Logs Panels (Feb 2026)

**Files touched:**
- `src/app/features/workflows/sub/action-node/node-details-dialog/node-details-dialog.component.ts`
- `src/app/features/workflows/sub/action-node/action-node.component.ts`

**Changes:**

1. **Logs Panel Integration**
   - Added dedicated logs expansion panels to node details dialog
   - Logs panels appear in both inputs and outputs sections (left and right columns)
   - Each section includes collapsible logs expansion panel with consistent styling
   - Logs styled to match their respective section colors (accent for inputs, error for outputs)

2. **Dialog Layout Enhancement**
   - Three-column layout: inputs (left) | tabs (center) | outputs (right)
   - Inputs section: Port list + logs panel with accent color theming
   - Outputs section: Port list + logs panel with error color theming
   - Both sections use `mat-expansion-panel` with custom styling
   - Empty state shows placeholder: "No logs available yet"

3. **Visual Design**
   - Color-coded expansion panels using `color-mix()` for transparency:
     - Inputs: Accent color variations (`--mat-accent`)
     - Outputs: Error color variations (`--mat-error`)
   - Monospace logs content area with rounded corners
   - Consistent spacing and padding throughout
   - Port count badges with matching color schemes

4. **Component Structure**
   - Logs sections integrated into main dialog template
   - Translation keys: `workflow.runPanel.logs`, `workflow.runPanel.no_logs`
   - Expansion panels default to expanded state for immediate visibility
   - Logs content area prepared for future real-time execution log streaming

**Technical Details:**

```typescript
// Logs panel structure (inputs section)
<mat-expansion-panel [expanded]="true" class="custom-expansion-panel">
  <mat-expansion-panel-header>
    <mat-panel-title>
      <div class="logs-header">{{ 'workflow.runPanel.logs' | translate }}</div>
    </mat-panel-title>
  </mat-expansion-panel-header>
  <div class="logs-content">
    <p class="logs-placeholder">{{ 'workflow.runPanel.no_logs' | translate }}</p>
  </div>
</mat-expansion-panel>
```

**Styling highlights:**
```scss
.node-inputs .custom-expansion-panel { 
  background: color-mix(in srgb, var(--mat-accent) 8%, var(--md-sys-color-surface-container)); 
  border: 1px solid color-mix(in srgb, var(--mat-accent) 30%, transparent);
}

.node-outputs .custom-expansion-panel { 
  background: color-mix(in srgb, var(--mat-error) 8%, var(--md-sys-color-surface-container)); 
  border: 1px solid color-mix(in srgb, var(--mat-error) 30%, transparent);
}
```

**Future Enhancements:**
- Real-time log streaming during workflow execution
- Log filtering and search functionality
- Log level indicators (info, warning, error)
- Export logs functionality
- Linkable log entries to execution timeline

### Port Editing Persistence (Jan 2026)

**Files touched:**
- `src/app/features/workflows/sub/action-node/node-details-dialog/node-details-dialog.component.ts`
- `src/app/features/workflows/sub/action-node/action-node.component.ts`
- `src/app/features/workflows/sub/workflow-canvas.component.ts`

**Summary:**
- The node details dialog emits `nodePortsChanged` events after port edits (debounced; flushed on close).
- The canvas listens for `nodePortsChanged` and writes the updated ports into the node model so runtime and persisted representations stay in sync (`data.ports` and `data.params.ports`).
- Temporary console logging used during debugging was removed to keep the console clean.


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
