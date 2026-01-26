import { Injectable } from '@angular/core';
import { BehaviorSubject, Subject } from 'rxjs';
import { PipelineWorkflowDTO, PreferredTab, RunEntry, RunNodeDTO, WorkflowNodeDataBaseParams, WorkflowPorts } from './workflow.interface';

@Injectable({ providedIn: 'root' })
export class WfCanvasBus {
  nodeParamsChanged$ = new Subject<{ nodeId: string; params?: WorkflowNodeDataBaseParams }>();
  nodeToggleExpand$ = new Subject<{ nodeId: string; expanded: boolean }>();
  nodeConnectivity$ = new Subject<{ nodeId: string; missingIn: boolean; missingOut: boolean }>();
  runRequested$ = new Subject<{ nodeId: string }>();
  runFromNode$ = new Subject<{ nodeId: string }>();
  graphValid$ = new BehaviorSubject<boolean>(false);
  pipeline$ = new BehaviorSubject<PipelineWorkflowDTO | null>(null);
  runState$ = new BehaviorSubject<Record<string, 'queued' | 'running' | 'success' | 'error' | 'skipped'>>({});
  stageCancel$ = new Subject<{ index: number; nodeIds: string[]; runId?: string }>();
  pipelineCancel$ = new Subject<{ runId?: string }>();
  toggleRunPanel$ = new Subject<{ anchorNodeId?: string }>();
  onNodeDelete$ = new Subject<{ nodeId: string }>();
  nodeFormStatus$ = new Subject<{ nodeId: string; invalid: boolean; invalidFields?: string[] }>();
  nodeFlagsPatch$ = new Subject<{ nodeId: string; flags: Record<string, unknown> }>();
  nodePortsChanged$ = new Subject<{ nodeId: string; inputs: WorkflowPorts['inputs']; outputs: WorkflowPorts['outputs'] }>();
  nodePortStatus$ = new Subject<{ nodeId: string; missingInputs: string[]; missingOutputs: string[] }>();
  nodeLabelChanged$ = new Subject<{ nodeId: string; label: string }>();
  nodeMoved$ = new Subject<{ nodeId: string; at: number }>();
  runs$ = new BehaviorSubject<RunEntry[]>([]);
  openQuickAdd$ = new Subject<{
    nodeId: string;
    portId: string;
    portType?: string;
    anchorEl: HTMLElement;
    replaceMode?: boolean;
  }>();
  quickAddPick$ = new Subject<{
    sourceNodeId: string;
    sourcePortId: string;
    actionType: string;
    icon: string;
    replaceMode?: boolean;
  }>();
  toggleDetailsPanel$ = new Subject<{
    dto?: RunNodeDTO;
    preferredTab?: PreferredTab;
    title?: string;
    toggleOff?: boolean;
  }>();
  togglePreviewPanel$ = new Subject<{
    dto?: RunNodeDTO;
    title?: string;
    toggleOff?: boolean;
  }>();
}
