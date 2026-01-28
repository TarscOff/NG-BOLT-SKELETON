import { Injectable, Inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable, catchError, map, of } from 'rxjs';
import { ActionDefinitionLite, WorkflowPorts, WorkflowPort } from '../templates/utils/workflow.interface';
import { CoreOptions } from '@cadai/pxs-ng-core/interfaces';
import { CORE_OPTIONS } from '@cadai/pxs-ng-core/tokens';
import { normalizeCatalogAction } from '../templates/utils/workflow-graph.utils';

@Injectable({ providedIn: 'root' })
export class WorkflowsCatalogService {
  private fallback: ActionDefinitionLite[] = [
    { type: 'chat', params: { icon: 'chat', ports: { inputs: [{ id: 'in', data_reference: 'in', artifact_type: 'json' }], outputs: [{ id: 'out', data_reference: 'out', artifact_type: 'json' }] }, ports_map: { in: { required: true, readonly: false }, out: { required: false, readonly: false } } } },
    { type: 'embed', params: { icon: 'scatter_plot', ports: { inputs: [{ id: 'in', data_reference: 'in', artifact_type: 'json' }], outputs: [{ id: 'out', data_reference: 'out', artifact_type: 'json' }] }, ports_map: { in: { required: true, readonly: false }, out: { required: false, readonly: false } } } },
    { type: 'retrieve', params: { icon: 'travel_explore', ports: { inputs: [{ id: 'in', data_reference: 'in', artifact_type: 'json' }], outputs: [{ id: 'out', data_reference: 'out', artifact_type: 'json' }] }, ports_map: { in: { required: true, readonly: false }, out: { required: false, readonly: false } } } },
    { type: 'convert_and_chunk', params: { icon: 'description', ports: { inputs: [{ id: 'in', data_reference: 'in', artifact_type: 'json' }], outputs: [{ id: 'out', data_reference: 'out', artifact_type: 'json' }] }, ports_map: { in: { required: true, readonly: false }, out: { required: false, readonly: false } } } },
    { type: 'embed_langchain_documents', params: { icon: 'hive', ports: { inputs: [{ id: 'in', data_reference: 'in', artifact_type: 'json' }], outputs: [{ id: 'out', data_reference: 'out', artifact_type: 'json' }] }, ports_map: { in: { required: true, readonly: false }, out: { required: false, readonly: false } } } },
    { type: 'store_embedded_langchain_documents', params: { icon: 'inventory_2', ports: { inputs: [{ id: 'in', data_reference: 'in', artifact_type: 'json' }], outputs: [{ id: 'out', data_reference: 'out', artifact_type: 'json' }] }, ports_map: { in: { required: true, readonly: false }, out: { required: false, readonly: false } } } },
    { type: 'trigger_chat', params: { class: "accent", icon: 'forum', ports: { inputs: [], outputs: [{ id: 'message', data_reference: 'message', artifact_type: 'string' }] }, ports_map: { message: { required: false, readonly: false } } } },
    { type: 'trigger_file_upload', params: { class: "accent", icon: 'file_upload', ports: { inputs: [], outputs: [{ id: 'file', data_reference: 'file', artifact_type: 'file' }] }, ports_map: { file: { required: false, readonly: false } } } },
    { type: 'trigger_webhook', params: { class: "accent", icon: 'cloud', ports: { inputs: [], outputs: [{ id: 'payload_text', data_reference: 'payload_text', artifact_type: 'string' }, { id: 'payload_file', data_reference: 'payload_file', artifact_type: 'file' }] }, ports_map: { payload_text: { required: false, readonly: false }, payload_file: { required: false, readonly: false } } } },
  ];

  constructor(
    private http: HttpClient,
    @Inject(CORE_OPTIONS) private readonly coreOpts: Required<CoreOptions>,
  ) { }

  loadCatalog(): Observable<ActionDefinitionLite[]> {
    const apiUrl = this.coreOpts.environments.apiUrl;
    if (!apiUrl) return of(this.fallback);
    const url = `${apiUrl}/workflows/catalog`;
    return this.http.get<ActionDefinitionLite[]>(url).pipe(
      map((list: unknown[]) => {
        if (!Array.isArray(list)) return this.fallback;

        const normalizeNode = (raw: unknown): ActionDefinitionLite => {
          const rawRec = (raw && typeof raw === 'object' && !Array.isArray(raw)) ? raw as Record<string, unknown> : {};
          const type = (typeof rawRec['type'] === 'string' ? rawRec['type'] : (typeof rawRec['name'] === 'string' ? rawRec['name'] : '')) as string;
          const params = (rawRec['params'] && typeof rawRec['params'] === 'object') ? { ...(rawRec['params'] as Record<string, unknown>) } : {} as Record<string, unknown>;

          const pickHandles = (src: unknown, key: string): unknown[] | null => {
            if (!src || typeof src !== 'object') return null;
            const rec = src as Record<string, unknown>;
            const val = rec[key];
            return Array.isArray(val) ? val as unknown[] : null;
          };

          const inputsRaw = pickHandles(rawRec, 'input_handles') ?? pickHandles(params, 'input_handles') ?? pickHandles(rawRec, 'inputHandles') ?? pickHandles(params, 'inputHandles') ?? (rawRec['task'] && typeof rawRec['task'] === 'object' ? (pickHandles((rawRec['task'] as Record<string, unknown>), 'input_handles') ?? pickHandles((rawRec['task'] as Record<string, unknown>), 'inputHandles')) : null);
          const outputsRaw = pickHandles(rawRec, 'output_handles') ?? pickHandles(params, 'output_handles') ?? pickHandles(rawRec, 'output_handles') ?? pickHandles(params, 'outputHandles') ?? (rawRec['task'] && typeof rawRec['task'] === 'object' ? (pickHandles((rawRec['task'] as Record<string, unknown>), 'output_handles') ?? pickHandles((rawRec['task'] as Record<string, unknown>), 'outputHandles')) : null);

          const toPort = (handle: unknown, idx: number, prefix: 'in' | 'out'): WorkflowPort => {
            const rec = (handle && typeof handle === 'object') ? handle as Record<string, unknown> : {};
            const id = typeof rec['id'] === 'string' ? rec['id'] as string : `${prefix}-${idx + 1}`;
            const data_reference = typeof rec['data_reference'] === 'string' ? rec['data_reference'] as string : (typeof rec['dataReference'] === 'string' ? rec['dataReference'] as string : undefined);
            const artifact_type = typeof rec['artifact_type'] === 'string' ? rec['artifact_type'] as string : (typeof rec['artifactType'] === 'string' ? rec['artifactType'] as string : undefined);
            const label = (data_reference ?? (typeof rec['label'] === 'string' ? rec['label'] as string : undefined) ?? id).toString();
            const required = typeof rec['required'] === 'boolean' ? rec['required'] as boolean : undefined;
            const readonly = typeof rec['readonly'] === 'boolean' ? rec['readonly'] as boolean : undefined;
            const port: WorkflowPort = { id, label, type: artifact_type ?? 'json' };
            if (required !== undefined) port.required = required;
            if (readonly !== undefined) port.readonly = readonly;
            if (data_reference) port.data_reference = data_reference;
            if (artifact_type) port.artifact_type = artifact_type;
            return port;
          };

          if (inputsRaw || outputsRaw) {
            const ports: WorkflowPorts = {
              inputs: (inputsRaw ?? []).map((h, i) => toPort(h, i, 'in')),
              outputs: (outputsRaw ?? []).map((h, i) => toPort(h, i, 'out')),
            };
            params['ports'] = ports as unknown as Record<string, unknown>['ports'];
            const ports_map: Record<string, { required: boolean; readonly: boolean }> = {};
            for (const p of ports.inputs) ports_map[p.id] = { required: !!p.required, readonly: !!p.readonly };
            for (const p of ports.outputs) ports_map[p.id] = { required: !!p.required, readonly: !!p.readonly };
            params['ports_map'] = ports_map as unknown as Record<string, unknown>['ports_map'];
          }

          return { type, params } as ActionDefinitionLite;
        };

        // Merge API list with fallback to guarantee baseline nodes (no duplicates by type)
        const mergedByType = new Map<string, ActionDefinitionLite>();
        for (const item of this.fallback) mergedByType.set(item.type, item);
        for (const raw of list) {
          const node = normalizeNode(raw);
          mergedByType.set(node.type, node);
        }
        return Array.from(mergedByType.values()).map(normalizeCatalogAction);
      }),
      catchError(() => of(this.fallback)),
    );
  }
}
