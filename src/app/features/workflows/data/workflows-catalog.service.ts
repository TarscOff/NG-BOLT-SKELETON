import { Injectable, Inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable, catchError, map, of } from 'rxjs';
import { ActionDefinitionLite, WorkflowPorts, WorkflowPort } from '../templates/utils/workflow.interface';
import { CoreOptions } from '@cadai/pxs-ng-core/interfaces';
import { CORE_OPTIONS } from '@cadai/pxs-ng-core/tokens';
import { inferPortTypeFromReference, normalizeCatalogAction } from '../templates/utils/workflow-graph.utils';

@Injectable({ providedIn: 'root' })
export class WorkflowsCatalogService {
  private readonly defaultAcceptedUploadTypes = [
    'application/pdf',
    'text/plain',
    'application/msword',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'application/json',
    'text/markdown',
  ];

  private fallback: ActionDefinitionLite[] = [
    { type: 'chat', params: { icon: 'chat', ports: { inputs: [{ id: 'user_prompt', data_reference: 'user_prompt', artifact_type: 'string' }, { id: 'system_prompt', data_reference: 'system_prompt', artifact_type: 'string' }, { id: 'chat_history', data_reference: 'chat_history', artifact_type: 'json' }, { id: 'context', data_reference: 'context', artifact_type: 'string' }], outputs: [{ id: 'llm_response', data_reference: 'llm_response', artifact_type: 'string' }, { id: 'chat_history_out', data_reference: 'chat_history', artifact_type: 'json' }] }, ports_map: { user_prompt: { required: true, readonly: false }, system_prompt: { required: false, readonly: false }, chat_history: { required: false, readonly: false }, context: { required: false, readonly: false }, llm_response: { required: false, readonly: false }, chat_history_out: { required: false, readonly: false } } } },
    { type: 'embed', params: { icon: 'scatter_plot', ports: { inputs: [{ id: 'query_string', data_reference: 'query_string', artifact_type: 'string' }], outputs: [{ id: 'embeddings', data_reference: 'embeddings', artifact_type: 'list[float]' }] }, ports_map: { query_string: { required: true, readonly: false }, embeddings: { required: false, readonly: false } } } },
    { type: 'retrieve', params: { icon: 'travel_explore', ports: { inputs: [{ id: 'embeddings', data_reference: 'embeddings', artifact_type: 'list[float]' }, { id: 'collection', data_reference: 'collection', artifact_type: 'collection' }, { id: 'filter_document_publication_datetime', data_reference: 'filter_document_publication_datetime', artifact_type: 'string' }], outputs: [{ id: 'context', data_reference: 'context', artifact_type: 'string' }] }, ports_map: { embeddings: { required: true, readonly: false }, collection: { required: true, readonly: false }, filter_document_publication_datetime: { required: false, readonly: false }, context: { required: false, readonly: false } } } },
    { type: 'convert_and_chunk', params: { icon: 'description', ports: { inputs: [{ id: 'source_file', data_reference: 'source_file', artifact_type: 'file' }], outputs: [{ id: 'langchain_documents', data_reference: 'langchain_documents', artifact_type: 'langchain_documents' }] }, ports_map: { source_file: { required: true, readonly: false }, langchain_documents: { required: false, readonly: false } } } },
    { type: 'embed_langchain_documents', params: { icon: 'hive', ports: { inputs: [{ id: 'langchain_documents', data_reference: 'langchain_documents', artifact_type: 'langchain_documents' }], outputs: [{ id: 'embedded_langchain_documents', data_reference: 'embedded_langchain_documents', artifact_type: 'embedded_langchain_documents' }] }, ports_map: { langchain_documents: { required: true, readonly: false }, embedded_langchain_documents: { required: false, readonly: false } } } },
    { type: 'store_embedded_langchain_documents', params: { icon: 'inventory_2', ports: { inputs: [{ id: 'collection', data_reference: 'collection', artifact_type: 'collection' }, { id: 'embedded_langchain_documents', data_reference: 'embedded_langchain_documents', artifact_type: 'embedded_langchain_documents' }], outputs: [{ id: 'collection_out', data_reference: 'collection', artifact_type: 'collection' }] }, ports_map: { collection: { required: false, readonly: false }, embedded_langchain_documents: { required: false, readonly: false }, collection_out: { required: false, readonly: false } } } },
    {
      type: 'trigger_chat',
      params: {
        class: "accent",
        icon: 'forum',
        ports: { inputs: [], outputs: [{ id: 'message', data_reference: 'message', artifact_type: 'string' }] },
        ports_map: { message: { required: false, readonly: false } },
        max_chars: 4000,
        placeholder: 'Type your message...',
        enable_attachments: true,
        accepted_types: this.defaultAcceptedUploadTypes.join(','),
        max_file_size: 10 * 1024 * 1024,
        max_files: 5,
      }
    },
    {
      type: 'trigger_file_upload',
      params: {
        class: "accent",
        icon: 'file_upload',
        ports: { inputs: [], outputs: [{ id: 'file', data_reference: 'file', artifact_type: 'file' }] },
        ports_map: { file: { required: false, readonly: false } },
        accepted_types: this.defaultAcceptedUploadTypes.join(','),
        max_file_size: 10 * 1024 * 1024,
        max_files: 5,
        multiple: true,
      }
    },
    {
      type: 'trigger_webhook',
      params: {
        class: "accent",
        icon: 'cloud',
        ports: { inputs: [], outputs: [{ id: 'payload_text', data_reference: 'payload_text', artifact_type: 'string' }, { id: 'payload_file', data_reference: 'payload_file', artifact_type: 'file' }] },
        ports_map: { payload_text: { required: false, readonly: false }, payload_file: { required: false, readonly: false } },
        accept_content_types: 'application/json,text/plain,multipart/form-data',
        max_payload_size: 1024 * 1024,
        parse_json: true,
      }
    },
    {
      type: 'trigger_manual',
      params: {
        class: "accent",
        icon: 'touch_app',
        ports: { inputs: [], outputs: [{ id: 'trigger', data_reference: 'trigger', artifact_type: 'boolean' }] },
        ports_map: { trigger: { required: false, readonly: false } },
        label: 'Run now',
        require_confirmation: false,
      }
    },
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
            const raw_type = typeof rec['type'] === 'string' ? rec['type'] as string : undefined;
            const label = (data_reference ?? (typeof rec['label'] === 'string' ? rec['label'] as string : undefined) ?? id).toString();
            const required = typeof rec['required'] === 'boolean' ? rec['required'] as boolean : undefined;
            const readonly = typeof rec['readonly'] === 'boolean' ? rec['readonly'] as boolean : undefined;
            const inferred = inferPortTypeFromReference(data_reference ?? id);
            const type = artifact_type
              ?? ((raw_type && raw_type !== 'json' && raw_type !== 'any') ? raw_type : undefined)
              ?? inferred
              ?? raw_type
              ?? 'json';
            const port: WorkflowPort = { id, label, type };
            if (required !== undefined) port.required = required;
            if (readonly !== undefined) port.readonly = readonly;
            if (data_reference) port.data_reference = data_reference;
            if (artifact_type) {
              port.artifact_type = artifact_type;
            } else if (inferred) {
              port.artifact_type = inferred;
            }
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
        return Array.from(mergedByType.values())
          .map(normalizeCatalogAction)
          .map(action => this.applyTriggerDefaults(action));
      }),
      catchError(() => of(this.fallback)),
    );
  }

  private applyTriggerDefaults(action: ActionDefinitionLite): ActionDefinitionLite {
    const type = (action.type ?? '').toLowerCase().replace(/-/g, '_');
    const params: Record<string, unknown> = { ...(action.params ?? {}) };
    const icon = typeof params['icon'] === 'string' ? params['icon'] : '';

    if (type === 'trigger_chat') {
      return {
        ...action,
        params: {
          icon,
          ...params,
          max_chars: this.resolveNumber(params, ['max_chars', 'maxChars', 'max_length', 'maxLength']) ?? 4000,
          placeholder: this.resolveString(params, ['placeholder', 'inputPlaceholder']) ?? 'Type your message...',
          enable_attachments: this.resolveBoolean(params, ['enable_attachments', 'enableAttachments']) ?? true,
          accepted_types: this.resolveCsv(params, ['accepted_types', 'acceptedTypes', 'allowedFileTypes'])
            ?? this.defaultAcceptedUploadTypes.join(','),
          max_file_size: this.resolveNumber(params, ['max_file_size', 'maxFileSize']) ?? 10 * 1024 * 1024,
          max_files: this.resolveNumber(params, ['max_files', 'maxFiles']) ?? 5,
        },
      };
    }

    if (type === 'trigger_file_upload') {
      return {
        ...action,
        params: {
          icon,
          ...params,
          accepted_types: this.resolveCsv(params, ['accepted_types', 'acceptedTypes', 'allowedFileTypes'])
            ?? this.defaultAcceptedUploadTypes.join(','),
          max_file_size: this.resolveNumber(params, ['max_file_size', 'maxFileSize']) ?? 10 * 1024 * 1024,
          max_files: this.resolveNumber(params, ['max_files', 'maxFiles']) ?? 5,
          multiple: this.resolveBoolean(params, ['multiple']) ?? true,
        },
      };
    }

    if (type === 'trigger_webhook') {
      return {
        ...action,
        params: {
          icon,
          ...params,
          accept_content_types: this.resolveCsv(params, ['accept_content_types', 'acceptContentTypes'])
            ?? 'application/json,text/plain,multipart/form-data',
          max_payload_size: this.resolveNumber(params, ['max_payload_size', 'maxPayloadSize']) ?? 1024 * 1024,
          parse_json: this.resolveBoolean(params, ['parse_json', 'parseJson']) ?? true,
        },
      };
    }

    if (type === 'trigger_manual') {
      return {
        ...action,
        params: {
          icon,
          ...params,
          label: this.resolveString(params, ['label', 'buttonLabel']) ?? 'Run now',
          require_confirmation: this.resolveBoolean(params, ['require_confirmation', 'requireConfirmation']) ?? false,
        },
      };
    }

    return action;
  }

  private resolveNumber(
    params: Record<string, unknown>,
    keys: string[]
  ): number | undefined {
    for (const key of keys) {
      const value = params[key];
      if (typeof value === 'number' && Number.isFinite(value)) {
        return value;
      }
      if (typeof value === 'string') {
        const parsed = Number(value);
        if (Number.isFinite(parsed)) {
          return parsed;
        }
      }
    }
    return undefined;
  }

  private resolveBoolean(
    params: Record<string, unknown>,
    keys: string[]
  ): boolean | undefined {
    for (const key of keys) {
      const value = params[key];
      if (typeof value === 'boolean') {
        return value;
      }
      if (typeof value === 'string') {
        const lowered = value.trim().toLowerCase();
        if (lowered === 'true') return true;
        if (lowered === 'false') return false;
      }
    }
    return undefined;
  }

  private resolveString(
    params: Record<string, unknown>,
    keys: string[]
  ): string | undefined {
    for (const key of keys) {
      const value = params[key];
      if (typeof value === 'string' && value.trim().length > 0) {
        return value.trim();
      }
    }
    return undefined;
  }

  private resolveCsv(
    params: Record<string, unknown>,
    keys: string[]
  ): string | undefined {
    for (const key of keys) {
      const value = params[key];
      if (Array.isArray(value)) {
        const normalized = value
          .filter(item => typeof item === 'string')
          .map(item => item.trim())
          .filter(Boolean);
        if (normalized.length) {
          return normalized.join(',');
        }
      }
      if (typeof value === 'string' && value.trim().length > 0) {
        return value.trim();
      }
    }
    return undefined;
  }
}
