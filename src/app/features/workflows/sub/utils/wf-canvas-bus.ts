import { Injectable } from '@angular/core';
import { BehaviorSubject, Subject } from 'rxjs';
import { PipelineWorkflowDTO, RunEntry, WorkflowNodeDataBaseParams } from './workflow.interface';


@Injectable({ providedIn: 'root' })
export class WfCanvasBus {
  nodeParamsChanged$ = new Subject<{ nodeId: string; params?: WorkflowNodeDataBaseParams }>();
  nodeToggleExpand$ = new Subject<{ nodeId: string; expanded: boolean }>();
  nodeConnectivity$ = new Subject<{ nodeId: string; missingIn: boolean; missingOut: boolean }>();
  runRequested$ = new Subject<{ nodeId: string }>();
  graphValid$ = new BehaviorSubject<boolean>(false);
  pipeline$ = new BehaviorSubject<PipelineWorkflowDTO | null>(null);
  runState$ = new BehaviorSubject<Record<string, 'queued' | 'running' | 'success' | 'error' | 'skipped'>>({});
  stageCancel$ = new Subject<{ index: number; nodeIds: string[]; runId?: string }>();
  pipelineCancel$ = new Subject<{ runId?: string }>();
  toggleRunPanel$ = new Subject<{ anchorNodeId?: string }>();
  nodeFormStatus$ = new Subject<{ nodeId: string; invalid: boolean; invalidFields?: string[] }>();
  nodeFlagsPatch$ = new Subject<{ nodeId: string; flags: Record<string, unknown> }>();
  runs$ = new BehaviorSubject<RunEntry[]>([]);
  formsReset$ = new Subject<{ includeInputs?: boolean }>();
  openQuickAdd$ = new Subject<{
    nodeId: string;
    portId: string;
    portType?: string;
    anchorEl: HTMLElement;
  }>();
  quickAddPick$ = new Subject<{
    sourceNodeId: string;
    sourcePortId: string;
    actionType: string;
    icon: string;
  }>();
}
