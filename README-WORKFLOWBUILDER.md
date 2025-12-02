
# Workflow Canvas — How to Use, Configure & Extend (`@ng-draw-flow/core`)

> _Last updated: 2025-10-07_

This guide documents **your current implementation** of the Workflow Canvas based on **`@ng-draw-flow/core`**, including:
- palette → canvas drag & drop,
- ports & connections,
- context menu from node → canvas,
- inspector dialog backed by `ACTION_FORMS` and your `DynamicFormComponent`,
- pan/zoom math (robust drop coordinates),
- auto-center/fit on load,
- how to add new **action types** safely,
- and a short troubleshooting section.

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
  { type: 'chat' },
  { type: 'compare' },
  { type: 'summarize' },
  { type: 'extract' },
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
      'chat': WfNodeComponent,
      compare: WfNodeComponent,
      summarize: WfNodeComponent,
      extract: WfNodeComponent,
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

> If you later prefer a **single visual type** for all actions (recommended for scalability), register `{ node: WfNodeComponent }` and normalize non-terminal nodes to `type: 'node'` while keeping their real subtype in `data.aiType`. (See §10 “Extending with new action types”.)

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


## 8) Contributing and Extending with new action types

### Your current approach (per-type registration) — **Confirmed**
When you add a new action (e.g., `'classify'`), do all of the following:

1) **Types & palette**
```ts
type InspectorActionType = /* … */ | 'classify';
type PaletteType = 'input' | 'result' | InspectorActionType;
availableActions = [..., {{ type: 'classify' }}];
```

2) **Renderer registration**
```ts
provideNgDrawFlowConfigs({
  nodes: {{ /* …existing… */, classify: WfNodeComponent }},
  connection: {{ /* unchanged */ }},
});
```

3) **Styling class**
```html
<div class="wf-node"
     [class.input]="visualType()==='input'"
     [class.result]="visualType()==='result'"
     [class.action]="visualType()!=='input' && visualType()!=='result'">
</div>
```

4) **Labels & forms**
- `displayLabel()` (or `humanLabelFor`) add `'classify'`.
- `ACTION_FORMS['classify'] = {{ make: (F) => [...], defaults?: {{...}} }};`

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
