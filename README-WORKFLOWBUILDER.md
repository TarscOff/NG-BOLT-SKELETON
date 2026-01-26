
# Workflow Canvas — How to Use, Configure & Extend (`@ng-draw-flow/core`)

> _Last updated: 2026-01-24_

This guide documents **your current implementation** of the Workflow Canvas based on **`@ng-draw-flow/core`**, including:
- palette → canvas drag & drop,
- ports & connections,
- context menu from node → canvas,
- inspector dialog backed by `ACTION_FORMS` and your `DynamicFormComponent`,
- pan/zoom math (robust drop coordinates),
- auto-center/fit on load,
- how to add new **action types** safely,
- and a short troubleshooting section.

> New (v2.1+):
> - Workflows persisted in NGRX ComponentStore (`workflows.store.ts`) + `localStorage` (`app_workflows_v1`).
> - Reusable workflows exposed as **composite nodes** (`type: 'composite'`, `aiType: wf:<id>`) with ports inferred from first/last inner nodes.
> - Graph validity badge beside the name input; publish/draft buttons use single source of truth (`canPublish$`, `canDraft$`).
> - Run panel stores executions (runs) in store: workflow snapshot, node/edge payloads, logs. Run view dialog renders snapshot in read-only canvas.
> - Read-only mode closes palette, disables drops & inputs; palette/search/name inputs are disabled when viewing a run.

> Assumptions: Angular 17-19+, standalone components, strict TS. You already have `ConfirmDialogComponent`, `DynamicFormComponent`, and `FieldConfigService` in your Core SDK.


---

## 1) Install

```bash
npm i @ng-draw-flow/core
# if not already in the feature:
npm i @angular/cdk @angular/material
```

---

## 2) Project layout (suggested)

```
workflows/
  ├─ action-node.component.ts            # Node renderer (df-input/df-output + styling)
  ├─ action-forms.ts                     # Registry of inspector forms per aiType
  ├─ wf-canvas-bus.ts                    # Tiny event bus (node → canvas) for context menu
  └─ workflow-canvas-df.component.(ts|html|scss)  # Canvas: DnD, mapping, inspector
 
```

---

## 3) Core model & palette

```ts
// types
type InspectorActionType = string;
type PaletteType         = 'input' | 'result' | InspectorActionType;

// palette (what appears as draggable pills)
availableActions: ActionDefinitionLite[] = [
  // primitive blocks (kept)
  { type: 'embed',   params: { icon: 'scatter_plot' } },
  { type: 'retrieve', params: { icon: 'travel_explore' } },
  { type: 'convert_and_chunk', params: { icon: 'description' } },
  { type: 'embed_langchain_documents', params: { icon: 'hive' } },
  { type: 'store_embedded_langchain_documents', params: { icon: 'inventory_2' } },
  // reusable workflows arrive as type `wf:<id>` with params.workflowId + ports inferred
];
```

### Initial nodes (input/result)
```ts
    nodes: WorkflowNode[] = [{
        id: 'input-node',
        type: 'input',
        x: 60, y: 60,
        data: { label: 'Input' },
        ports: { inputs: [], outputs: [{ id: 'out', label: 'out', type: 'json' }] },
    },{
        id: 'result-node',
        type: 'result',
        x: 760, y: 60,
        data: { label: 'Result' },
        ports: { inputs: [{ id: 'in', label: 'in', type: 'json' }], outputs: [] },
    }];
    edges: WorkflowEdge[] = [];
    availableActions: ActionDefinitionLite[] = [
        { type: 'chat' },
        { type: 'compare' },
        { type: 'summarize' },
        { type: 'extract' },
    ];

```

---

## 4) DrawFlow configuration (single provider call)

> **Important:** use **one** `provideNgDrawFlowConfigs` call. The last call wins and overwrites previous settings.

```ts
providers: [
  provideNgDrawFlowConfigs({
    nodes: {
      input: WfNodeComponent,
      result: WfNodeComponent,
      embed: WfNodeComponent,
      retrieve: WfNodeComponent,
      convert_and_chunk: WfNodeComponent,
      embed_langchain_documents: WfNodeComponent,
      store_embedded_langchain_documents: WfNodeComponent,
      composite: WfNodeComponent,   // reusable workflows rendered like other nodes
      'run-panel': WfRunPanelNodeComponent,
      details: WfDetailsNodeComponent,
      preview: WfPreviewNodeComponent,
    },
    connection: {
      type: DfConnectionType.SmoothStep,
      arrowhead: { type: DfArrowhead.ArrowClosed, width: 5, height: 5 },
      // For SmoothStep, prefer radius over 'curvature' (curvature is for Bezier)
      // radius: 16,
    },
  }),
]
```

> Composites: any action whose type starts with `wf:` is normalized to `type: 'composite'` with `data.params.__workflowId` preserved for mapping inner inputs/outputs.

---

## 5) Node renderer (`WfNodeComponent`)

- Renders **inputs** on the left, **outputs** on the right.
- Uses `[single]="false"` (or `[maxConnections]`) to allow multiple edges per port.
- Uses a menu button that asks the canvas to open its **context menu** at the click point.

```html
<div class="wf-node"
     [attr.data-node-id]="nodeId"
     [class.input]="visualType()==='input'"
     [class.result]="visualType()==='result'"
     [class.action]="visualType()!=='input' && visualType()!=='result'">

  <div class="title">{{ displayLabel() }}</div>

  <!-- Inputs (left) -->
  <div class="ports left">
    <df-input  *ngFor="let p of inPorts(); trackBy: trackPort"
               [position]="positions.Left"
               [connectorData]="{ nodeId: nodeId, connectorId: p.id }"
               [single]="false">
    </df-input>
  </div>

  <!-- Outputs (right) -->
  <div class="ports right">
    <df-output *ngFor="let p of outPorts(); trackBy: trackPort"
               [position]="positions.Right"
               [connectorData]="{ nodeId: nodeId, connectorId: p.id }"
               [single]="false">
    </df-output>
  </div>

  <button *ngIf="visualType()!=='input' && visualType()!=='result'"
          mat-mini-fab class="neutral"
          (click)="onMenuClick($event)">
    <mat-icon>menu</mat-icon>
  </button>
</div>
```

---

## 6) Context menu from node → canvas

A minimal **event bus** lets nodes ask the canvas to show the shared menu at a given point.

```ts
// wf-canvas-bus.ts
@Injectable() export class WfCanvasBus {
  openMenu$ = new Subject<{ nodeId: string; clientX: number; clientY: number }>();
}
```

- Provide `WfCanvasBus` in the canvas.
- In canvas constructor: subscribe and translate `clientX/Y` to canvas-relative `{x,y}`, then open your menu and select the node.
- In node button click: `bus.openMenu$.next({ nodeId, clientX: ev.clientX, clientY: ev.clientY })`.

This reuses your existing context menu logic.


## 7) Linking rules & multiplicity

- Ensure **ports** exist for every node type:
  - `input`: outputs only (`out`), no inputs.
  - `result`: inputs only (`in`), no outputs.
  - action nodes: one `in`, one `out` by default.
- In the node template, set `[single]="false"` (or `[maxConnections]`) on `df-input` and `df-output` to allow multiple edges per port.
- Keep connector IDs consistent with your `WorkflowEdge` mapping (`sourcePort: 'out'`, `targetPort: 'in'`).


## 8) Adding new workers / nodes (contribution guide)

Use this checklist when a backend worker is added so the node shows up automatically:

1) **Backend contract**  
   - Each worker (task) exposes inputs/outputs with `data_reference` + `artifact_type`.  
   - Reusable workflows are delivered as `wf:<id>` with `data.nodes` + `data.edges` (see `DOCS/Workflow_*` examples).

2) **Catalog ingestion**  
   - Catalog comes from backend; fallback list is `fallbackCatalog` in `workflows.component.ts`.  
   - To add a new worker manually, append to `fallbackCatalog` with `type`, `icon`, optional `class`, and (ideally) `ports` if the backend hasn’t shipped them yet.

3) **Renderer registration**  
   - If it’s a primitive worker (not `wf:`), ensure `provideNgDrawFlowConfigs.nodes` has an entry; most map to `WfNodeComponent`.  
   - If it’s delivered as `wf:<id>`, no extra renderer is required; it is normalized to `type: 'composite'`.

4) **Ports**  
   - Port types supported: `query_string`, `embeddings`, `json`, `collection`, `string` (see `DEFAULT_PORT_TYPES` in `workflows.store.ts`).  
   - For composites, ports are inferred from inner graph: **inputs = first layer nodes**, **outputs = last layer nodes** (id/label from `data_reference`, type from `artifact_type`).

5) **Forms**  
   - Add an `ActionFormSpec` entry in `action-forms.ts` keyed by the worker `type` (or `wf:<id>` if you want a dedicated form).  
   - Use `DynamicFormComponent` fields; keep required/placeholder/helperText populated for validation.

6) **Validation & buttons**  
   - Graph validity recomputed on load/drop/connect/delete; badge appears beside the workflow name.  
   - Publish button: enabled when graph valid AND (workflow draft OR dirty OR needsRepublish).  
   - Draft button: enabled when dirty; disabled when workflow visibility is `public` and no changes.

7) **Execution records**  
   - Runs are stored in NGRX with workflow snapshot + node/edge payloads; run view dialog renders the snapshot in read-only mode.  
   - When wiring a new worker, make sure its params are serializable (files are stripped to placeholders).

8) **Styling**  
   - Ports/labels themed in `action-node.component.scss`; port badges use `--mat-error` for missing required links.

9) **Testing**  
   - Drop the new node from palette, connect required ports, ensure validation badge clears.  
   - Run from canvas → check run panel shows statuses and payloads.

### Minimal code touchpoints for a new worker
- `workflows.component.ts` → ensure it appears in `availableActions()` (catalog or fallback).  
- `workflow-canvas.component.ts` → nothing if renderer is `WfNodeComponent`; add to `provideNgDrawFlowConfigs.nodes` if you need a custom view.  
- `action-forms.ts` → form spec.  
- `i18n` → labels for type and form fields.

> Tip: If a worker arrives without explicit ports, the canvas falls back to one `in` / one `out` (`ensurePorts`). Provide `ports` in catalog to avoid surprises.

> Alternative for scalability: normalize all non-terminal nodes to a single `type: 'node'` and keep subtype in `data.aiType`. Then you only add palette + forms + label (no renderer/provider edits).


---

## 9) Troubleshooting

- **Edges don’t start at the bullet** → don’t offset the *rails*; center bullets with CSS transform on `.df-connector` or use connector `[offsetX]/[offsetY]` if available.
- **Drop position off by ~constant px** → subtract wrapper padding/border, or better: use the **inverse CSS transform** method (§7).
- **Only one link allowed** → ensure `[single]="false"` (or `[maxConnections]`) on connectors.
- **Can’t link input/result** → ensure those nodes have ports (`out` for input, `in` for result) and IDs match your edge mapping.
- **Input not draggable** → special flags like `startNode/endNode` can lock nodes; keep them off unless you need locking.
- **Bezier shows up instead of SmoothStep** → ensure only one `provideNgDrawFlowConfigs` is active; last call wins. For SmoothStep, use `radius` (not `curvature`).
- **Scale values look like 100/125** → normalize once (`percent / 100`) when storing/reading zoom.

---


## 🧑‍💻 Author

**Angular Product Skeleton**  
Built by **Tarik Haddadi** using Angular 19+ and modern best practices (2025).
