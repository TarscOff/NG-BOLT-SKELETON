# WorkflowPlus - 3-Tier Workflow System

_Last updated: 2026-02-12_

## Overview
WorkflowPlus is implemented as a 3-tier workflow architecture:

1. Tier-1: atomic workflow graphs (node editor)
2. Tier-2: composites derived from published Tier-1 workflows
3. Tier-3: template and project design that maps composite ports to runtime UI

This document reflects the current code implementation, storage behavior, and runtime wiring.

## Routes and Screens

| Route | Purpose | Tier |
|---|---|---|
| `/genai-workflows` | Workflow editor (node canvas) | Tier-1 |
| `/genai-workflows/composites` | Published workflows as composites | Tier-2 |
| `/genai-workflows/templates` | Template list | Tier-3 contract |
| `/genai-workflows/templates/builder/:id?` | Template canvas builder (composites + contexts) | Tier-3 contract |
| `/genai-projects/new` | Fullscreen project creation wizard (metadata + project design) | Tier-3 project design |
| `/genai-projects/:id` | Project details, configuration canvas, runtime tabs/sessions | Runtime |

## Tier Responsibilities

### Tier-1: Workflow Editor

Main implementation:
- `src/app/features/workflows/sub/workflow-canvas.component.ts`
- `src/app/features/workflows/data/workflows.store.ts`

Current behavior:
- Visual node editor using `@ng-draw-flow/core`
- Trigger + worker nodes, ports, validation, and connection checks
- Node coordinates are persisted and restored
- Auto-center/fit on existing nodes when loading a workflow
- Dirty tracking is signature-based (`savedSigById` / `dirtyById`)
- Publish/discard status is based on real graph/meta deltas

### Tier-2: Composite Workflows

Main implementation:
- `src/app/features/workflows/templates/services/workflow-sync.service.ts`
- `src/app/features/workflows/templates/pages/composites-list/composites-list.component.ts`

Current behavior:
- Published Tier-1 workflows are automatically exposed as Tier-2 composites
- No manual sync button/step is required
- Composite exposed handles are generated with these rules:
  - Trigger node outputs are exposed as composite **inputs**
  - Unconnected inputs remain exposed as inputs
  - Unconnected outputs remain exposed as outputs

### Tier-3A: Template Builder (Contract and Data Scope)

Main implementation:
- `src/app/features/workflows/templates/components/template-canvas/template-canvas-builder.component.ts`

Current behavior:
- Canvas starts with Session Context and Project Context nodes
- Admin drops composites and links composite ports to context storage flow
- Saves:
  - `compositeWorkflows` and `edges`
  - `contextNodes`
  - `dataFlowConfig` (inputs/outputs/intermediates + scope)
- Template UI nodes are still supported for backward compatibility in saved templates, but the active project UI design is handled in Tier-3B

### Tier-3B: Project Design Canvas (Runtime UI Design)

Main implementation:
- `src/app/features/projects/components/project-template-canvas/project-template-canvas.component.ts`
- `src/app/features/projects/components/project-template-canvas/project-ui-node.component.ts`

Current behavior:
- Assign published templates to the project
- Drop runtime UI nodes and connect template ports to UI ports
- View mode selection:
  - `single` -> `standalone-single`
  - `tabs` -> `standalone-tabs`
- Current default UI palette:
  - `chat`
  - `compare` (label: Two Files)
  - `summarize` (label: One File Upload)
  - `result-view`
  - `markdown`
- Disabled template cascade:
  - linked UI node is disabled when it has exactly one linked template and that template is disabled
  - shared UI nodes (linked to multiple templates) stay active

## Data Scope and Port Ownership

Scope model:
- `session`: ephemeral data for one session
- `project`: persistent project-level data
- `both`: hybrid/shared behavior

Primary types:
- `DataPortScopeConfig` and `TemplateDataFlowConfig` in  
  `src/app/features/workflows/templates/interfaces/template-workflow.interface.ts`
- `PortDataScopeConfig` / `DataScope` in  
  `src/app/shared/types/workflow.types.ts`

How scope flows today:
1. Template builder produces `dataFlowConfig`
2. Project assignment stores merged `portDataScopes`
3. Runtime admin data-map resolves binding source/scope from assignment scopes

## Runtime Execution (Sessions)

Main implementation:
- `src/app/features/projects/components/template-execution-panel/template-execution-panel.component.ts`

Runtime source of truth:
- If `assignment.configuration.uiTemplate` exists, runtime uses it
- Otherwise runtime falls back to `template.uiTemplate`

Layout behavior:
- Supports `standalone-single` and `standalone-tabs` as primary runtime modes
- Legacy modes/components are still handled for compatibility

Binding-driven behavior:
- Chat:
  - history area shown when `history` or `chat_history` is bound
  - input area shown when `user_query` or `query` is bound
  - attachment area shown when `uploaded_files` / `files` / `file_upload` is bound
- Compare:
  - requires `left_file` and `right_file`
- Summarize:
  - requires `source_file`
- Result/Markdown:
  - rendered through reusable runtime result renderer

Trigger constraints inheritance:
- Runtime resolves trigger constraints through Tier-3 workflow path back to Tier-2 trigger nodes
- Applies trigger config to runtime components (file and chat constraints), including:
  - accepted types
  - max file size
  - max files
  - multiple flag
  - max message length (chat)

Admin debug map:
- Admins get a Data Map view in runtime tab groups
- Shows each UI binding, workflow path, resolved scope, and live value preview

## Local Persistence Keys (Dev Mode)

Tier-1:
- `app_workflows_v1`

Tier-3 store:
- `template_workflows_v1`
- `composite_workflows_v1`
- `micro_workflows_v1`
- `template_assignments_v1`
- `template_sessions_v1`

Project assignment/session store:
- `project_workflow_assignments`
- `project_workflow_sessions`

Project list/session/artifacts service local caches:
- `local_projects_v1`
- `local_project_sessions_v1`
- `local_project_artifacts_v1`

## Core Files Map

```text
src/app/features/
├── workflows/
│   ├── sub/
│   │   └── workflow-canvas.component.ts
│   ├── data/
│   │   └── workflows.store.ts
│   └── templates/
│       ├── services/
│       │   └── workflow-sync.service.ts
│       ├── interfaces/
│       │   └── template-workflow.interface.ts
│       ├── data/
│       │   └── template-workflows.store.ts
│       ├── components/
│       │   ├── template-canvas/
│       │   │   └── template-canvas-builder.component.ts
│       │   ├── chat/
│       │   ├── compare/
│       │   ├── summarize/
│       │   ├── extract/
│       │   └── result/runtime-result/
│       └── pages/
│           ├── composites-list/
│           └── templates-list/
└── projects/
    ├── pages/new/
    │   └── project-creation-wizard.component.ts
    ├── pages/details/
    │   └── details.component.html
    └── components/
        ├── project-template-canvas/
        │   ├── project-template-canvas.component.ts
        │   └── project-ui-node.component.ts
        └── template-execution-panel/
            └── template-execution-panel.component.ts
```

## Backend Handoff Note

Current mode is local/poc-first with storage-backed state and compatibility fallbacks.  
When backend APIs are finalized, integration should plug into existing stores/services without changing Tier contracts:

1. Keep Tier-1 graph schema stable (`nodes`, `edges`, ports, metadata)
2. Keep Tier-2 exposed-handle generation rules stable
3. Keep Tier-3 assignment `configuration.uiTemplate` contract stable
4. Keep `portDataScopes` contract stable for runtime scope/debug mapping
