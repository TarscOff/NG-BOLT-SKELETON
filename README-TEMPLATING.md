# Templating and Runtime Wiring

_Last updated: 2026-02-12_

This document describes the current Tier-3 template/runtime implementation.

## Scope

This README covers:

1. Template definition and assignment model
2. Project UI design canvas behavior
3. Session runtime rendering behavior
4. Binding contracts per UI component
5. Trigger constraint propagation to runtime config

## Key Source Files

- `src/app/features/workflows/templates/interfaces/template-workflow.interface.ts`
- `src/app/features/workflows/templates/data/template-workflows.store.ts`
- `src/app/features/projects/components/project-template-canvas/project-template-canvas.component.ts`
- `src/app/features/projects/components/project-template-canvas/project-ui-node.component.ts`
- `src/app/features/projects/components/template-execution-panel/template-execution-panel.component.ts`
- `src/app/features/workflows/templates/components/result/runtime-result/runtime-result.component.ts`

## Model: Template vs Assignment

Template (`TemplateWorkflow`):
- Tier-3 reusable contract
- Contains composite wiring, context nodes, and `dataFlowConfig`

Assignment (`ProjectTemplateAssignment`):
- Project-specific runtime config
- Stores:
  - enable/disable state
  - `portDataScopes`
  - `configuration.projectCanvas`
  - `configuration.uiTemplate` runtime override

Runtime always prefers assignment override when available:
- `assignment.configuration.uiTemplate` first
- fallback to `template.uiTemplate`

## Tier-3 Design Canvases

### Template Canvas Builder (`/genai-workflows/templates/builder/:id?`)

Purpose:
- define template contract and data scope
- connect composite ports with session/project context nodes

Notes:
- Session and Project context nodes are auto-present for new templates
- Saved output includes:
  - `compositeWorkflows`
  - `edges`
  - `contextNodes`
  - `dataFlowConfig`
- Legacy UI nodes can still be loaded from existing templates for compatibility

### Project Template Canvas (inside project wizard/details)

Purpose:
- design project runtime UI by connecting template ports to UI components

Current default UI palette:
- `chat`
- `compare` (Two Files)
- `summarize` (One File Upload)
- `result-view`
- `markdown`

View mode:
- `single` -> runtime `standalone-single`
- `tabs` -> runtime `standalone-tabs`

Disable cascade logic:
- UI node disables only when:
  - it is linked to exactly one template
  - that linked template is disabled
- Shared UI nodes remain active

## Runtime Session Panel

Implementation:
- `TemplateExecutionPanelComponent`

Main responsibilities:
- manage sessions (create/select/rename/delete)
- render runtime UI from assignment/template bindings
- propagate input/output context updates to `TemplateWorkflowsStore`
- surface admin data-map diagnostics

## UI Component Binding Contracts

### Chat

Ports (project UI node contract):
- Inputs: `history`, `assistant_response`, `files`
- Outputs: `user_query`, `uploaded_files`

Runtime behavior:
- history area shown only if `history` or `chat_history` binding exists
- input area shown only if `user_query` or `query` binding exists
- attachment UI shown only if `uploaded_files` / `files` / `file_upload` binding exists

### Compare (Two Files)

Ports:
- Inputs: `comparison_result`
- Outputs: `left_file`, `right_file`, `comparison_result`

Runtime requirement:
- both `left_file` and `right_file` must be bound

### Summarize (One File Upload)

Ports:
- Inputs: `summary_result`
- Outputs: `source_file`, `summary_result`

Runtime requirement:
- `source_file` must be bound

### Result View

Port:
- Input: `result` (or generic bound value path)

Rendering:
- uses `RuntimeResultComponent` (shared result surface)
- supports summary/compare/extract/generic payloads

### Markdown

Port:
- Input: `markdown`

Rendering:
- uses `RuntimeResultComponent` in markdown mode
- supports text/markdown and object fallbacks

## Trigger Constraint Propagation

Runtime resolves constraints by tracing binding workflow paths back to trigger nodes in the referenced composite graph.

Supported trigger node types:
- `trigger_chat`
- `trigger_file_upload`
- `trigger_webhook`
- `trigger_manual`

File constraint fields recognized from trigger params:
- `accepted_types`, `acceptedTypes`, `allowedFileTypes`, `accept_content_types`, `acceptContentTypes`
- `max_file_size`, `maxFileSize`, `max_payload_size`, `maxPayloadSize`
- `max_files`, `maxFiles`
- `multiple`

Constraint merge behavior:
- accepted types are intersected when possible, else union fallback
- numeric limits use stricter values (minimum)
- `multiple` is true only when all constraints allow it

## Runtime Data Map (Admin)

Admins can inspect binding diagnostics:
- binding property
- workflow path
- resolved data scope
- value type
- live value preview/full value

Scope labels are resolved from assignment `portDataScopes`:
- `session`
- `project`
- `both`
- `unscoped` (fallback when no match)

## Backward Compatibility Notes

Runtime still supports legacy component types in saved templates/assignments:
- `extract`
- `file-uploader` / `file-upload`
- `result-viewer`

These remain in rendering logic to avoid breaking existing saved configurations.

## Current Dev-Mode Persistence

Template data store keys:
- `template_workflows_v1`
- `composite_workflows_v1`
- `micro_workflows_v1`
- `template_assignments_v1`
- `template_sessions_v1`

Project local data keys:
- `local_projects_v1`
- `local_project_sessions_v1`
- `local_project_artifacts_v1`
