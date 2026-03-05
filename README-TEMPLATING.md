# Templating and Runtime Wiring

_Last updated: 2026-03-05_

This document describes the current Tier-3 template/runtime implementation.

## Scope

This README covers:

1. Template definition and assignment model
2. Project UI design canvas behavior
3. Session runtime rendering behavior
4. Binding contracts per UI component
5. Trigger constraint propagation to runtime config
6. Template assignment file upload and validation

## Key Source Files

- `src/app/features/workflows/templates/interfaces/template-workflow.interface.ts`
- `src/app/features/workflows/templates/data/template-workflows.store.ts`
- `src/app/features/projects/components/project-template-canvas/project-template-canvas.component.ts`
- `src/app/features/projects/components/project-template-canvas/project-ui-node.component.ts`
- `src/app/features/projects/components/template-execution-panel/template-execution-panel.component.ts`
- `src/app/features/projects/components/template-code-editor/template-code-editor.component.ts`
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

## Template Assignment File Upload

### Code Editor Component (`TemplateCodeEditorComponent`)

Purpose:
- Import template assignments from JSON files
- Validate assignment structure and configuration
- Provide real-time validation feedback

Key features:
- Drag & drop or browse to upload `.json` files
- Real-time JSON parsing and validation
- Visual error/success indicators
- Supports array of template assignments

### Assignment Structure Requirements

Each template assignment must include:

```json
[
  {
    "templateId": "string (required)",
    "templateName": "string (required)",
    "portDataScopes": [
      {
        "portId": "string (required)",
        "scope": "session | project | both (required)"
      }
    ],
    "configuration": {
      "projectCanvas": {
        "uiNodes": [...],
        "connections": [...],
        "viewMode": "single | tabs"
      },
      "uiTemplate": {
        "layout": "standalone-single | standalone-tabs",
        "components": [...]
      }
    }
  }
]
```

### Validation Rules

**Assignment-level validation:**
- Root must be an array of template assignments
- At least one assignment required
- Each assignment must have `templateId`, `templateName`, `portDataScopes`, and `configuration`

**Port data scopes validation:**
- Each scope must have `portId` (string) and `scope` (string)
- Valid scope values: `session`, `project`, `both`

**Configuration validation:**
- `configuration` object required for each assignment

**Project Canvas validation (if present):**
- `uiNodes`: array with validated structure
  - Each node must have `id` (string), `type` (string), `position` (object with numeric `x` and `y`)
- `connections`: array with validated structure
  - Each connection must have `sourceNodeId`, `sourceConnectorId`, `targetNodeId`, `targetConnectorId` (all strings)
- `viewMode`: must be `single` or `tabs`

**UI Template validation (if present):**
- `layout`: must be `standalone-single` or `standalone-tabs`
- `components`: array with validated structure
  - Each component must have `id` (string) and `type` (string)
  - `bindings`: must be an array if present

### Usage in Project Wizard

The project wizard now supports two methods for template assignment:

1. **Visual Canvas** (default): Use drag-and-drop UI to design template connections
2. **Upload Files**: Import pre-configured template assignment JSON

Upload workflow:
- Select configuration and structure files
- Review and edit JSON in code editor
- Validate structure before project creation
- Assign validated template to project

### Error Messages

Validation provides detailed error messages with context:
- `Assignment [index]: field description` format for array-level errors
- Property path included for nested validation failures
- Type mismatches clearly identified
- Required field violations highlighted

### Integration Points

The code editor component integrates with:
- Project creation wizard (`ProjectWizardComponent`)
- Project details page (`ProjectDetailsComponent`)
- Template assignment store (`ProjectTemplateAssignmentsStore`)

Outputs:
- `assignmentParsed`: emits validated `TemplateAssignment[]` or `null`
- `assignmentStringChanged`: emits raw JSON string on every change
- `validationStateChange`: emits boolean validation status

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
