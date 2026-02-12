# Workflow Canvas Documentation

_Last updated: 2026-02-12_

This document describes the current canvas implementations across the workflow tiers.

## Canvas Matrix

| Canvas | File | Route/Screen | Tier |
|---|---|---|---|
| Workflow Canvas | `src/app/features/workflows/sub/workflow-canvas.component.ts` | `/genai-workflows` | Tier-1 |
| Template Canvas Builder | `src/app/features/workflows/templates/components/template-canvas/template-canvas-builder.component.ts` | `/genai-workflows/templates/builder/:id?` | Tier-3 contract |
| Project Template Canvas | `src/app/features/projects/components/project-template-canvas/project-template-canvas.component.ts` | project wizard + details configuration tab | Tier-3 project runtime design |

All canvases use `@ng-draw-flow/core`.

## Tier-1 Workflow Canvas

### Implemented Behavior

- drag/drop workflow actions from catalog
- create/remove connections
- inspector/edit interactions through node details
- workflow validation and connectivity checks
- run state nodes and execution visualization hooks
- robust workflow switching logic to avoid empty-canvas flashing
- preserved node coordinates on save/load
- auto-center and fit on existing nodes after load

### State Integration

Main store:
- `src/app/features/workflows/data/workflows.store.ts`

Important state mechanics:
- `dirtyById` and `savedSigById` for change detection
- graph sanitization before persistence
- publish/unpublish republish logic tied to actual changes

### Persistence

Storage key:
- `app_workflows_v1`

Saved graph includes:
- node id/type/position/data/ports
- edge source/target/ports
- workflow metadata (name, status, timestamps, version)

## Template Canvas Builder

### Purpose

- design template-level composite graph
- map template ports to session/project context
- emit template data scope configuration

### Implemented Behavior

- new template starts with Session Context and Project Context nodes
- composites are sourced from published Tier-1 workflows via sync service
- supports context storage mapping and stored-data generation
- autosave with debounce
- save builds:
  - `compositeWorkflows`
  - `edges`
  - `contextNodes`
  - `dataFlowConfig`

### Notes

- legacy UI nodes are still loadable/savable for compatibility
- active project runtime UI composition is handled in the project canvas, not here

## Project Template Canvas

### Purpose

- assign templates to project
- connect template exposed ports to runtime UI components
- choose runtime presentation mode (`single` vs `tabs`)

### Implemented Behavior

- template assignment node + UI node connection model
- current default UI palette:
  - `chat`
  - `compare` (Two Files)
  - `summarize` (One File Upload)
  - `result-view`
  - `markdown`
- assignment config persistence:
  - `configuration.projectCanvas` (ui nodes + connections + viewMode)
  - `configuration.uiTemplate` (layout + component bindings)
- merges and repairs assignment `portDataScopes` from template data-flow contract
- disable cascade for linked UI nodes (single-parent disabled logic)

## Connection and Port Conventions

Tier-1:
- connector ids derive from action ports and node ids

Template builder:
- composite connectors use `in::` / `out::` semantics
- context drop-zone input is internal helper and not persisted as final target

Project canvas:
- UI input connectors use `ui-in::`
- UI output connectors use `ui-out::`
- template connectors map to `<templateNodeId>:<portId>` workflow paths

## Runtime Coupling

Canvas output feeds runtime through assignment config:

1. Project canvas writes `configuration.uiTemplate`
2. Runtime panel reads assignment override first
3. Runtime resolves binding paths to session context data
4. Trigger constraints are resolved back through template/composite graph

## Troubleshooting Checklist

If canvas reload looks wrong:
- verify workflow/template id switch logic is not interrupted
- verify saved graph exists in localStorage key for that canvas/store
- verify node ids in edges still exist after normalization
- verify port ids still exist after contract sync (Tier-2 to Tier-3)

If centering looks wrong:
- verify node list is non-empty before fit
- verify viewport element exists and has width/height
- verify pan/zoom service is available before apply

If publish/discard looks wrong:
- compare current graph signature to `savedSigById`
- ensure metadata-only edits are handled intentionally

## Related Files

- `src/app/features/workflows/sub/workflow-canvas.component.ts`
- `src/app/features/workflows/data/workflows.store.ts`
- `src/app/features/workflows/data/workflows-catalog.service.ts`
- `src/app/features/workflows/templates/services/workflow-sync.service.ts`
- `src/app/features/workflows/templates/components/template-canvas/template-canvas-builder.component.ts`
- `src/app/features/projects/components/project-template-canvas/project-template-canvas.component.ts`
- `src/app/features/projects/components/project-template-canvas/project-template-node.component.ts`
- `src/app/features/projects/components/project-template-canvas/project-ui-node.component.ts`
