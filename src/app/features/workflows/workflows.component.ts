import { ChangeDetectionStrategy, Component, DestroyRef, Signal, computed, effect, inject, Injector, OnInit, runInInjectionContext, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Router } from '@angular/router';
import { SeoComponent, ConfirmDialogComponent, DynamicFormComponent } from '@cadai/pxs-ng-core/shared';
import { FieldConfigService, LayoutService, ToolbarActionsService, ToastService } from '@cadai/pxs-ng-core/services';
import { TranslateModule, TranslateService } from '@ngx-translate/core';
import { ToolbarAction, ConfirmDialogData, FieldConfig } from '@cadai/pxs-ng-core/interfaces';
import { MatButtonModule } from '@angular/material/button';
import { MatListModule } from '@angular/material/list';
import { MatIconModule } from '@angular/material/icon';
import { MatTooltipModule } from '@angular/material/tooltip';
import { MatDialog, MatDialogModule } from '@angular/material/dialog';
import { MatBadgeModule } from '@angular/material/badge';
import { MatChipsModule } from '@angular/material/chips';
import { MatSidenavModule } from '@angular/material/sidenav';
import { MatCheckboxModule } from '@angular/material/checkbox';
import { WorkflowCanvasDfComponent } from './sub/workflow-canvas.component';
import { RunPanelComponent } from './sub/run-panel/run-panel.component';
import { ActionDefinitionLite, PaletteType, RunEntry, WorkflowEdge, WorkflowNode, WorkflowPorts } from './templates/utils/workflow.interface';
import { WfCanvasBus } from './templates/utils/wf-canvas-bus';
import { ActionFormSpec } from './templates/utils/action-forms';
import { toSignal } from '@angular/core/rxjs-interop';
import { firstValueFrom } from 'rxjs';
import { map } from 'rxjs/operators';
import { WorkflowsStore, WorkflowDraft, WorkflowExecutionLog, WorkflowValidationState } from './data/workflows.store';
import { WorkflowsCatalogService } from './data/workflows-catalog.service';
import { NewWorkflowDialogComponent, NewWorkflowDialogData } from './sub/new-workflow-dialog.component';
import { FormBuilder, FormGroup, Validators } from '@angular/forms';
import {
    ensurePorts,
} from './data/workflows.store';
import { inferPortTypeFromReference } from './templates/utils/workflow-graph.utils';
type UnsavedChoice = 'save' | 'discard' | 'cancel';

@Component({
    selector: 'app-workflows',
    standalone: true,
    imports: [
        SeoComponent,
        CommonModule,
        TranslateModule,
        MatButtonModule,
        MatListModule,
        MatIconModule,
        MatTooltipModule,
        MatDialogModule,
        MatBadgeModule,
        MatChipsModule,
        MatSidenavModule,
        MatCheckboxModule,
        WorkflowCanvasDfComponent,
        RunPanelComponent,
        RunPanelDetailComponent,
        DynamicFormComponent
    ],
    templateUrl: './workflows.component.html',
    styleUrls: ['./workflows.component.scss'],
    changeDetection: ChangeDetectionStrategy.OnPush,
    providers: [WorkflowsStore]
})
export class WorkflowsComponent implements OnInit {
    private toolbar = inject(ToolbarActionsService);
    private destroyRef = inject(DestroyRef);
    private router = inject(Router);
    store = inject(WorkflowsStore);
    readonly dirty = toSignal(this.store.dirty$, { initialValue: false });
    private catalogService = inject(WorkflowsCatalogService);
    private dialog = inject(MatDialog);
    private translate = inject(TranslateService);
    private layoutService = inject(LayoutService);
    private toast = inject(ToastService);
    private injector = inject(Injector);
    private bus = inject(WfCanvasBus);
    private republishSeen = new Map<string, boolean>();
    private readonly defaultAcceptedUploadTypesCsv = [
        'application/pdf',
        'text/plain',
        'application/msword',
        'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
        'application/json',
        'text/markdown',
    ].join(',');

    readonly workflows: Signal<WorkflowDraft[]> = toSignal(this.store.workflows$, { initialValue: [] as WorkflowDraft[] }) as Signal<WorkflowDraft[]>;
    workflowFilter = signal<string>('');
    readonly filteredWorkflows = computed<WorkflowDraft[]>(() => {
        const q = this.workflowFilter().trim().toLowerCase();
        if (!q) return this.workflows();
        return this.workflows().filter(w =>
            (w.name ?? '').toLowerCase().includes(q) ||
            (w.description ?? '').toLowerCase().includes(q)
        );
    });

    private fb = inject(FormBuilder);
    private fieldsConfigService = inject(FieldConfigService);
    filterForm: FormGroup = this.fb.group({});
    filterFieldConfig: FieldConfig[] = [];

    ngOnInit(): void {
        this.initializeFilterForm();
        this.setupFilterListeners();
        this.setupRepublishToasts();
        this.catalogService.loadCatalog().subscribe((items) => this.store.setCatalog({ catalog: items }));
    }
    readonly selectedWorkflow: Signal<WorkflowDraft | null> = toSignal(this.store.selectedWorkflow$, { initialValue: null }) as Signal<WorkflowDraft | null>;
    readonly executionHistory: Signal<WorkflowExecutionLog[]> = toSignal(this.store.executionHistory$, { initialValue: [] as WorkflowExecutionLog[] }) as Signal<WorkflowExecutionLog[]>;
    readonly catalog: Signal<ActionDefinitionLite[]> = toSignal(this.store.catalog$, { initialValue: [] as ActionDefinitionLite[] }) as Signal<ActionDefinitionLite[]>;
    readonly validation: Signal<WorkflowValidationState> = toSignal(this.store.validation$, { initialValue: { valid: true, nodeValidity: {} } }) as Signal<WorkflowValidationState>;
    readonly validityById: Signal<Record<string, boolean>> = toSignal(this.store.validityById$, { initialValue: {} }) as Signal<Record<string, boolean>>;
    readonly canDraftById: Signal<Record<string, boolean>> = toSignal(this.store.canDraftById$, { initialValue: {} }) as Signal<Record<string, boolean>>;
    readonly canPublishById: Signal<Record<string, boolean>> = toSignal(this.store.canPublishById$, { initialValue: {} }) as Signal<Record<string, boolean>>;
    readonly canPublish: Signal<boolean> = toSignal(this.store.canPublish$, { initialValue: false }) as Signal<boolean>;

    nodes = computed<WorkflowNode[]>(() => {
        const all = this.selectedWorkflow()?.nodes ?? this.defaultNodes;
        return all.map(n => {
            const params = (n.data?.params ?? {}) as Record<string, unknown>;
            // pick candidate ports from existing node, from handles, or from params
            const portsCandidate =
                this.portsFromHandles(n) ??
                n.ports ??
                (params['ports'] as WorkflowPorts | undefined);
            // if the node has a ports_map on its params, pass it into ensurePorts
            const portsMap =
                params['ports_map'] as Record<string, { required?: boolean; readonly?: boolean }> | undefined;
            const normalizedPorts = ensurePorts(n.type, portsCandidate, { portsMap });
            return { ...n, ports: normalizedPorts };
        });
    });

    edges = computed<WorkflowEdge[]>(() => this.selectedWorkflow()?.edges ?? []);
    availableActions = computed<ActionDefinitionLite[]>(() => {
        const c = this.catalog();
        const base = c.length ? c : this.fallbackCatalog;
        const currentId = this.selectedWorkflow()?.id ?? null;
        const composites = this.buildCompositeActions(this.workflows(), currentId);
        return [...composites, ...base];
    });
    execTypes = computed<Set<PaletteType>>(() => {
        const mergedTypes = new Set<string>();

        for (const action of this.availableActions()) {
            const raw = (action.type ?? '').toString().trim();
            if (!raw) continue;
            mergedTypes.add(raw);
            mergedTypes.add(this.normalizeTypeToken(raw));
        }

        for (const node of this.selectedWorkflow()?.nodes ?? []) {
            const rawNodeType = (node.type ?? '').toString().trim();
            if (rawNodeType) {
                mergedTypes.add(rawNodeType);
                mergedTypes.add(this.normalizeTypeToken(rawNodeType));
            }

            const rawAiType = (node.data?.aiType ?? '').toString().trim();
            if (rawAiType) {
                mergedTypes.add(rawAiType);
                mergedTypes.add(this.normalizeTypeToken(rawAiType));
            }
        }

        mergedTypes.add('composite');
        return new Set<PaletteType>(Array.from(mergedTypes) as PaletteType[]);
    });
    canvasNodes = computed<WorkflowNode[]>(() => {
        const allNodes = this.nodes();
        return allNodes;
    });
    canvasEdges = computed<WorkflowEdge[]>(() => {
        return this.edges();
    });

    actionsNodes: Record<string, ActionFormSpec> = {

        chat: {
            make: () => [
                this.fieldsConfigService.getTextField({
                    name: 'llm_endpoint',
                    label: 'workflow.forms.common.llm_endpoint.label',
                    placeholder: 'workflow.forms.common.llm_endpoint.placeholder',
                    required: true,
                    validators: [Validators.required],
                    errorMessages: { required: 'workflow.forms.common.errors.llm_endpoint_required' },
                    defaultValue: 'http://ollama:11434/api',
                    helperText: 'workflow.forms.common.llm_endpoint.helper',
                }),
                this.fieldsConfigService.getTextField({
                    name: 'model',
                    label: 'workflow.forms.common.model.label',
                    placeholder: 'workflow.forms.common.model.placeholder',
                    required: true,
                    validators: [Validators.required],
                    errorMessages: { required: 'workflow.forms.common.errors.model_required' },
                    defaultValue: 'tinyllama',
                    helperText: 'workflow.forms.common.model.helper',
                }),
            ],
            defaults: {
                llm_endpoint: 'http://ollama:11434/api',
                model: 'tinyllama',
            },
            
        },
        // Trigger nodes: appear in toolbox as sources (only outputs)
        'trigger-chat': {
            make: () => [
                this.fieldsConfigService.getTextField({
                    name: 'max_chars',
                    label: 'workflow.forms.triggers.chat.max_chars.label',
                    placeholder: 'workflow.forms.triggers.chat.max_chars.placeholder',
                    required: true,
                    minLength: 1,
                    validators: [Validators.required, Validators.pattern(/^[1-9]\d*$/)],
                    errorMessages: {
                        required: 'workflow.forms.triggers.errors.max_chars_required',
                        pattern: 'workflow.forms.triggers.errors.positive_integer',
                    },
                    defaultValue: '4000',
                    helperText: 'workflow.forms.triggers.chat.max_chars.helper',
                }),
                this.fieldsConfigService.getTextField({
                    name: 'placeholder',
                    label: 'workflow.forms.triggers.chat.placeholder.label',
                    placeholder: 'workflow.forms.triggers.chat.placeholder.placeholder',
                    defaultValue: 'Type your message...',
                    helperText: 'workflow.forms.triggers.chat.placeholder.helper',
                }),
                this.fieldsConfigService.getToggleField({
                    name: 'enable_attachments',
                    label: 'workflow.forms.triggers.chat.enable_attachments.label',
                    helperText: 'workflow.forms.triggers.chat.enable_attachments.helper',
                    defaultValue: true,
                }),
                this.fieldsConfigService.getTextField({
                    name: 'accepted_types',
                    label: 'workflow.forms.triggers.common.accepted_types.label',
                    placeholder: 'workflow.forms.triggers.common.accepted_types.placeholder',
                    required: true,
                    minLength: 1,
                    maxLength: 500,
                    validators: [Validators.required, Validators.maxLength(500)],
                    errorMessages: {
                        required: 'form.errors.input.required',
                        maxlength: 'form.errors.input.maxlength',
                    },
                    defaultValue: this.defaultAcceptedUploadTypesCsv,
                    helperText: 'workflow.forms.triggers.common.accepted_types.helper',
                }),
                this.fieldsConfigService.getTextField({
                    name: 'max_file_size',
                    label: 'workflow.forms.triggers.common.max_file_size.label',
                    placeholder: 'workflow.forms.triggers.common.max_file_size.placeholder',
                    required: true,
                    minLength: 1,
                    validators: [Validators.required, Validators.pattern(/^[1-9]\d*$/)],
                    errorMessages: {
                        required: 'form.errors.input.required',
                        pattern: 'workflow.forms.triggers.errors.positive_integer',
                    },
                    defaultValue: String(10 * 1024 * 1024),
                    helperText: 'workflow.forms.triggers.common.max_file_size.helper',
                }),
                this.fieldsConfigService.getTextField({
                    name: 'max_files',
                    label: 'workflow.forms.triggers.common.max_files.label',
                    placeholder: 'workflow.forms.triggers.common.max_files.placeholder',
                    required: true,
                    minLength: 1,
                    validators: [Validators.required, Validators.pattern(/^[1-9]\d*$/)],
                    errorMessages: {
                        required: 'form.errors.input.required',
                        pattern: 'workflow.forms.triggers.errors.positive_integer',
                    },
                    defaultValue: '5',
                    helperText: 'workflow.forms.triggers.common.max_files.helper',
                }),
            ],
            defaults: {
                max_chars: 4000,
                placeholder: 'Type your message...',
                enable_attachments: true,
                accepted_types: this.defaultAcceptedUploadTypesCsv,
                max_file_size: 10 * 1024 * 1024,
                max_files: 5,
            },
        },

        'trigger-file-upload': {
            make: () => [
                this.fieldsConfigService.getTextField({
                    name: 'accepted_types',
                    label: 'workflow.forms.triggers.common.accepted_types.label',
                    placeholder: 'workflow.forms.triggers.common.accepted_types.placeholder',
                    required: true,
                    minLength: 1,
                    maxLength: 500,
                    validators: [Validators.required, Validators.maxLength(500)],
                    errorMessages: {
                        required: 'form.errors.input.required',
                        maxlength: 'form.errors.input.maxlength',
                    },
                    defaultValue: this.defaultAcceptedUploadTypesCsv,
                    helperText: 'workflow.forms.triggers.common.accepted_types.helper',
                }),
                this.fieldsConfigService.getTextField({
                    name: 'max_file_size',
                    label: 'workflow.forms.triggers.common.max_file_size.label',
                    placeholder: 'workflow.forms.triggers.common.max_file_size.placeholder',
                    required: true,
                    minLength: 1,
                    validators: [Validators.required, Validators.pattern(/^[1-9]\d*$/)],
                    errorMessages: {
                        required: 'form.errors.input.required',
                        pattern: 'workflow.forms.triggers.errors.positive_integer',
                    },
                    defaultValue: String(10 * 1024 * 1024),
                    helperText: 'workflow.forms.triggers.common.max_file_size.helper',
                }),
                this.fieldsConfigService.getTextField({
                    name: 'max_files',
                    label: 'workflow.forms.triggers.common.max_files.label',
                    placeholder: 'workflow.forms.triggers.common.max_files.placeholder',
                    required: true,
                    minLength: 1,
                    validators: [Validators.required, Validators.pattern(/^[1-9]\d*$/)],
                    errorMessages: {
                        required: 'form.errors.input.required',
                        pattern: 'workflow.forms.triggers.errors.positive_integer',
                    },
                    defaultValue: '5',
                    helperText: 'workflow.forms.triggers.common.max_files.helper',
                }),
                this.fieldsConfigService.getToggleField({
                    name: 'multiple',
                    label: 'workflow.forms.triggers.file_upload.multiple.label',
                    helperText: 'workflow.forms.triggers.file_upload.multiple.helper',
                    defaultValue: true,
                }),
            ],
            defaults: {
                accepted_types: this.defaultAcceptedUploadTypesCsv,
                max_file_size: 10 * 1024 * 1024,
                max_files: 5,
                multiple: true,
            },
        },

        'trigger-webhook': {
            make: () => [
                this.fieldsConfigService.getTextField({
                    name: 'accept_content_types',
                    label: 'workflow.forms.triggers.webhook.accept_content_types.label',
                    placeholder: 'workflow.forms.triggers.webhook.accept_content_types.placeholder',
                    required: true,
                    minLength: 1,
                    maxLength: 500,
                    validators: [Validators.required, Validators.maxLength(500)],
                    errorMessages: {
                        required: 'form.errors.input.required',
                        maxlength: 'form.errors.input.maxlength',
                    },
                    defaultValue: 'application/json,text/plain,multipart/form-data',
                    helperText: 'workflow.forms.triggers.webhook.accept_content_types.helper',
                }),
                this.fieldsConfigService.getTextField({
                    name: 'max_payload_size',
                    label: 'workflow.forms.triggers.webhook.max_payload_size.label',
                    placeholder: 'workflow.forms.triggers.webhook.max_payload_size.placeholder',
                    required: true,
                    minLength: 1,
                    validators: [Validators.required, Validators.pattern(/^[1-9]\d*$/)],
                    errorMessages: {
                        required: 'form.errors.input.required',
                        pattern: 'workflow.forms.triggers.errors.positive_integer',
                    },
                    defaultValue: String(1024 * 1024),
                    helperText: 'workflow.forms.triggers.webhook.max_payload_size.helper',
                }),
                this.fieldsConfigService.getToggleField({
                    name: 'parse_json',
                    label: 'workflow.forms.triggers.webhook.parse_json.label',
                    helperText: 'workflow.forms.triggers.webhook.parse_json.helper',
                    defaultValue: true,
                }),
            ],
            defaults: {
                accept_content_types: 'application/json,text/plain,multipart/form-data',
                max_payload_size: 1024 * 1024,
                parse_json: true,
            },
        },

        'trigger-manual': {
            make: () => [
                this.fieldsConfigService.getTextField({
                    name: 'label',
                    label: 'workflow.forms.triggers.manual.label.label',
                    placeholder: 'workflow.forms.triggers.manual.label.placeholder',
                    defaultValue: 'Run now',
                    helperText: 'workflow.forms.triggers.manual.label.helper',
                }),
                this.fieldsConfigService.getToggleField({
                    name: 'require_confirmation',
                    label: 'workflow.forms.triggers.manual.require_confirmation.label',
                    helperText: 'workflow.forms.triggers.manual.require_confirmation.helper',
                    defaultValue: false,
                }),
            ],
            defaults: {
                label: 'Run now',
                require_confirmation: false,
            },
        },
    
        embed: {
            make: () => [
                this.fieldsConfigService.getTextField({
                    name: 'llm_endpoint',
                    label: 'workflow.forms.common.llm_endpoint.label',
                    placeholder: 'workflow.forms.common.llm_endpoint.placeholder',
                    required: true,
                    validators: [Validators.required],
                    errorMessages: { required: 'workflow.forms.common.errors.llm_endpoint_required' },
                    defaultValue: 'http://ollama:11434/api',
                    helperText: 'workflow.forms.common.llm_endpoint.helper',
                }),
                this.fieldsConfigService.getTextField({
                    name: 'model',
                    label: 'workflow.forms.common.model.label',
                    placeholder: 'workflow.forms.common.model.placeholder',
                    required: true,
                    validators: [Validators.required],
                    errorMessages: { required: 'workflow.forms.common.errors.model_required' },
                    defaultValue: 'jeffh/intfloat-multilingual-e5-large-instruct:f16',
                    helperText: 'workflow.forms.common.model.helper',
                }),
            ],
            defaults: {
                llm_endpoint: 'http://ollama:11434/api',
                model: 'jeffh/intfloat-multilingual-e5-large-instruct:f16',
            },
        },

        retrieve: {
            make: () => [
                this.fieldsConfigService.getTextField({
                    name: 'chromadb_url',
                    label: 'workflow.forms.common.chromadb_url.label',
                    placeholder: 'workflow.forms.common.chromadb_url.placeholder',
                    required: true,
                    validators: [Validators.required],
                    errorMessages: { required: 'workflow.forms.common.errors.chromadb_url_required' },
                    defaultValue: 'chromadb:8000',
                    helperText: 'workflow.forms.common.chromadb_url.helper',
                }),
            ],
            defaults: {
                chromadb_url: 'chromadb:8000',
            },
        },

        'convert-and-chunk': {
            make: () => [],
            defaults: {},
        },

        'embed-langchain-documents': {
            make: () => [
                this.fieldsConfigService.getTextField({
                    name: 'llm_endpoint',
                    label: 'workflow.forms.common.llm_endpoint.label',
                    placeholder: 'workflow.forms.common.llm_endpoint.placeholder',
                    required: true,
                    validators: [Validators.required],
                    errorMessages: { required: 'workflow.forms.common.errors.llm_endpoint_required' },
                    defaultValue: 'http://ollama:11434/api',
                    helperText: 'workflow.forms.common.llm_endpoint.helper',
                }),
                this.fieldsConfigService.getTextField({
                    name: 'model',
                    label: 'workflow.forms.common.model.label',
                    placeholder: 'workflow.forms.common.model.placeholder',
                    required: true,
                    validators: [Validators.required],
                    errorMessages: { required: 'workflow.forms.common.errors.model_required' },
                    defaultValue: 'jeffh/intfloat-multilingual-e5-large-instruct:f16',
                    helperText: 'workflow.forms.common.model.helper',
                }),
            ],
            defaults: {
                llm_endpoint: 'http://ollama:11434/api',
                model: 'jeffh/intfloat-multilingual-e5-large-instruct:f16',
            },
        },

        'store-embedded-langchain-documents': {
            make: () => [
                this.fieldsConfigService.getTextField({
                    name: 'chromadb_url',
                    label: 'workflow.forms.common.chromadb_url.label',
                    placeholder: 'workflow.forms.common.chromadb_url.placeholder',
                    required: true,
                    validators: [Validators.required],
                    errorMessages: { required: 'workflow.forms.common.errors.chromadb_url_required' },
                    defaultValue: 'chromadb:8000',
                    helperText: 'workflow.forms.common.chromadb_url.helper',
                }),
            ],
            defaults: {
                chromadb_url: 'chromadb:8000',
            },
        },
    };

    fallbackCatalog: ActionDefinitionLite[] = [
        {
            type: 'embed',
            params: {
                icon: "scatter_plot",
                ports: {
                    inputs: [
                        { id: 'query_string', data_reference: 'query_string', artifact_type: 'string' },
                    ],
                    outputs: [
                        { id: 'embeddings', data_reference: 'embeddings', artifact_type: 'list[float]' },
                    ],
                },
                ports_map: {
                    query_string: { required: false, readonly: false },
                    embeddings: { required: false, readonly: false },
                },
            },
        },
        {
            type: 'retrieve',
            params: {
                icon: "travel_explore",
                ports: {
                    inputs: [
                        { id: 'embeddings', data_reference: 'embeddings', artifact_type: 'list[float]' },
                        { id: 'collection', data_reference: 'collection', artifact_type: 'collection' },
                        { id: 'filter_document_publication_datetime', data_reference: 'filter_document_publication_datetime', artifact_type: 'string' },
                    ],
                    outputs: [
                        { id: 'context', data_reference: 'context', artifact_type: 'string' },
                    ],
                },
                ports_map: {
                    embeddings: { required: false, readonly: false },
                    collection: { required: false, readonly: false },
                    filter_document_publication_datetime: { required: false, readonly: false },
                    context: { required: false, readonly: false },
                },
            },
        },
        {
            type: 'chat',
            params: {
                icon: "forum",
                ports: {
                    inputs: [
                        { id: 'user_prompt', data_reference: 'user_prompt', artifact_type: 'string' },
                        { id: 'system_prompt', data_reference: 'system_prompt', artifact_type: 'string' },
                        { id: 'chat_history', data_reference: 'chat_history', artifact_type: 'json' },
                        { id: 'context', data_reference: 'context', artifact_type: 'string' },
                    ],
                    outputs: [
                        { id: 'llm_response', data_reference: 'llm_response', artifact_type: 'string' },
                        { id: 'chat_history_out', data_reference: 'chat_history', artifact_type: 'json' },
                    ],
                },
                ports_map: {
                    user_prompt: { required: false, readonly: false },
                    system_prompt: { required: false, readonly: false },
                    chat_history: { required: false, readonly: false },
                    context: { required: false, readonly: false },
                    llm_response: { required: false, readonly: false },
                    chat_history_out: { required: false, readonly: false },
                },
            },
        },
        {
            type: 'convert_and_chunk',
            params: {
                icon: "description",
                ports: {
                    inputs: [
                        { id: 'source_file', data_reference: 'source_file', artifact_type: 'file' },
                    ],
                    outputs: [
                        { id: 'langchain_documents', data_reference: 'langchain_documents', artifact_type: 'langchain_documents' },
                    ],
                },
                ports_map: {
                    source_file: { required: false, readonly: false },
                    langchain_documents: { required: false, readonly: false },
                },
            },
        },
        {
            type: 'embed_langchain_documents',
            params: {
                icon: "hive",
                ports: {
                    inputs: [
                        { id: 'langchain_documents', data_reference: 'langchain_documents', artifact_type: 'langchain_documents' },
                    ],
                    outputs: [
                        { id: 'embedded_langchain_documents', data_reference: 'embedded_langchain_documents', artifact_type: 'embedded_langchain_documents' },
                    ],
                },
                ports_map: {
                    langchain_documents: { required: false, readonly: false },
                    embedded_langchain_documents: { required: false, readonly: false },
                },
            },
        },
        {
            type: 'store_embedded_langchain_documents',
            params: {
                icon: "inventory_2",
                ports: {
                    inputs: [
                        { id: 'collection', data_reference: 'collection', artifact_type: 'collection' },
                        { id: 'embedded_langchain_documents', data_reference: 'embedded_langchain_documents', artifact_type: 'embedded_langchain_documents' },
                    ],
                    outputs: [
                        { id: 'collection_out', data_reference: 'collection', artifact_type: 'collection' },
                    ],
                },
                ports_map: {
                    collection: { required: false, readonly: false },
                    embedded_langchain_documents: { required: false, readonly: false },
                    collection_out: { required: false, readonly: false },
                },
            },
        },
        {
            type: 'trigger_chat',
            params: {
                icon: 'forum',
                ports: {
                    inputs: [],
                    outputs: [
                        { id: 'message', data_reference: 'message', artifact_type: 'string' }
                    ]
                }
                ,
                ports_map: {
                    message: { required: false, readonly: false }
                }
            }
        },
        {
            type: 'trigger_file_upload',
            params: {
                icon: 'file_upload',
                ports: {
                    inputs: [],
                    outputs: [
                        { id: 'file', data_reference: 'file', artifact_type: 'file' }
                    ]
                }
                ,
                ports_map: {
                    file: { required: false, readonly: false }
                }
            }
        },
        {
            type: 'trigger_webhook',
            params: {
                icon: 'cloud',
                ports: {
                    inputs: [],
                    outputs: [
                        { id: 'payload_text', data_reference: 'payload_text', artifact_type: 'string' },
                        { id: 'payload_file', data_reference: 'payload_file', artifact_type: 'file' }
                    ]
                }
                ,
                ports_map: {
                    payload_text: { required: false, readonly: false },
                    payload_file: { required: false, readonly: false }
                }
            }
        },
        {
            type: 'trigger_manual',
            params: {
                icon: 'touch_app',
                ports: {
                    inputs: [],
                    outputs: [
                        { id: 'trigger', data_reference: 'trigger', artifact_type: 'boolean' }
                    ]
                },
                ports_map: {
                    trigger: { required: false, readonly: false }
                }
            }
        },
    ];

    defaultNodes: WorkflowNode[] = [];

    sidebarCollapsed = signal<boolean>(false);
    runPanelOpen = signal<boolean>(false);
    runDetailOpen = signal<boolean>(false);
    selectedRunForDetail = signal<{ run: RunEntry; index: number } | null>(null);
    runs = signal<RunEntry[]>([]);
    multiSelectMode = signal<boolean>(false);
    selectedWorkflowIds = signal<Set<string>>(new Set());
    selectedWorkflowCount = computed(() => this.selectedWorkflowIds().size);
    selectedWorkflowIdList = computed(() => Array.from(this.selectedWorkflowIds()));

    constructor() {
        // Subscribe to runs to update toolbar
        this.bus.runs$.subscribe(rs => this.runs.set(rs ?? []));

        const updateToolbar = () => {
            const panelWorkflow: ToolbarAction = {
                id: 'panel_workflow',
                icon:  this.runPanelOpen() ? 'visibility_off' : 'visibility',
                tooltip: 'run-panel',
                click: () => this.toggleRunPanelSideNav(),
                variant: "flat",
                label: this.translate.instant('run-panel', { count: this.runs().length }),
                class: "warn"
            };

            const newWorkflow: ToolbarAction = {
                id: 'new_workflow',
                icon: 'add',
                tooltip: 'new_workflow',
                click: () => this.openNewWorkflowDialog(),
                variant: "flat",
                label: 'new_workflow',
                class: "primary"
            };

            const saveWorkflow: ToolbarAction = {
                id: 'save_workflow',
                icon: 'edit_document',
                tooltip: 'workflow.draft',
                click: () => this.saveWorkflow(),
                variant: 'flat',
                label: 'workflow.draft',
                class: 'primary',
                disabled$: this.store.canDraft$.pipe(map(can => !can))
            };

            const publishWorkflow: ToolbarAction = {
                id: 'publish_workflow',
                icon: 'publish',
                tooltip: 'workflow.publish',
                click: () => this.publishWorkflow(),
                variant: 'flat',
                label: 'workflow.publish',
                class: 'success',
                disabled$: this.store.canPublish$.pipe(map(can => !can))
            };

            const workflow = this.selectedWorkflow();
            if (workflow) {
                this.toolbar.scope(this.destroyRef, [panelWorkflow, newWorkflow, saveWorkflow, publishWorkflow]);
            } else {
                this.toolbar.scope(this.destroyRef, [newWorkflow]);
            }
        };

        // Update toolbar when workflow selection or runs change
        runInInjectionContext(this.injector, () => {
            effect(() => {
                this.selectedWorkflow();
                this.runs();
                updateToolbar();
            });
        });
    }

    public onTitleChange(title: string): void {
        this.layoutService.setTitle(title);
    }

    onChange(e: { nodes: WorkflowNode[]; edges: WorkflowEdge[] }) {
        this.store.updateGraph({ nodes: e.nodes, edges: e.edges });
    }

    onWorkflowNameChange(name: string): void {
        const selected = this.selectedWorkflow();
        if (!selected) return;
        if (selected.name === name) return;
        this.store.updateWorkflowMeta({ id: selected.id, name });
    }

    onSelectionChange(sel: { nodeIds: string[]; edgeIds: string[] }): void {
        this.store.setSelection(sel);
    }

    private buildCompositeActions(workflows: WorkflowDraft[], currentId: string | null): ActionDefinitionLite[] {
        return workflows
            .filter(w =>
                w.kind === 'reusable' &&
                (w.visibility === 'public' || w.status === 'published') &&
                w.id !== currentId
            ).map(w => ({
                type: `composite`,
                params: {
                    icon: 'account_tree',
                    class: 'warn',
                    label: w.name,
                    workflowId: w.id,
                    ports: this.buildCompositePorts(w),
                }
            } as ActionDefinitionLite));
    }

    private buildCompositePorts(wf: WorkflowDraft): WorkflowPorts {
        const nodes = (wf.nodes ?? []).map(n => {
            const params = (n.data?.params ?? {}) as Record<string, unknown>;
            const portsCandidate =
                this.portsFromHandles(n) ??
                n.ports ??
                (params['ports'] as WorkflowPorts | undefined);
            const portsMap =
                params['ports_map'] as Record<string, { required?: boolean; readonly?: boolean }> | undefined;
            return {
                ...n,
                ports: ensurePorts(n.type, portsCandidate, { portsMap }),
            };
        });
        const edges = wf.edges ?? [];
        const incomingConnections = new Set<string>();
        const outgoingConnections = new Set<string>();
        const incomingConnectionsNormalized = new Set<string>();
        const outgoingConnectionsNormalized = new Set<string>();
        const incomingNodeLevelConnections = new Set<string>();
        const outgoingNodeLevelConnections = new Set<string>();
        const inputById = new Map<string, WorkflowPorts['inputs'][number]>();
        const outputById = new Map<string, WorkflowPorts['outputs'][number]>();

        const normalizePortToken = (value: string | null | undefined): string =>
            (value ?? '')
                .toString()
                .trim()
                .toLowerCase()
                .replace(/[^a-z0-9]+/g, '_');

        const extractPortTokenCandidates = (value: string | null | undefined): string[] => {
            const raw = (value ?? '').toString().trim();
            if (!raw) return [];
            const candidates = new Set<string>([raw]);
            const delimiters = ['::', ':', '/', '.', '|', '->', '__', '--'];
            for (const delimiter of delimiters) {
                const parts = raw.split(delimiter).map(part => part.trim()).filter(Boolean);
                if (parts.length > 1) {
                    candidates.add(parts[parts.length - 1]);
                }
            }
            return Array.from(candidates);
        };

        const readStringField = (
            record: Record<string, unknown>,
            keys: string[]
        ): string | undefined => {
            for (const key of keys) {
                const value = record[key];
                if (typeof value === 'string' && value.trim().length > 0) {
                    return value.trim();
                }
            }
            return undefined;
        };

        const parsePortsFromEdgeId = (
            edgeIdRaw: unknown,
            sourceNodeId: string,
            targetNodeId: string
        ): { sourcePort?: string; targetPort?: string } => {
            const edgeId = edgeIdRaw;
            if (typeof edgeId !== 'string' || !edgeId.trim()) {
                return {};
            }

            const src = (sourceNodeId ?? '').toString();
            const tgt = (targetNodeId ?? '').toString();
            const prefix = `e-${src}__`;
            const middle = `--${tgt}__`;
            if (edgeId.startsWith(prefix)) {
                const middleIdx = edgeId.indexOf(middle, prefix.length);
                if (middleIdx > prefix.length) {
                    const sourcePort = edgeId.slice(prefix.length, middleIdx);
                    const targetPort = edgeId.slice(middleIdx + middle.length);
                    return {
                        sourcePort: sourcePort || undefined,
                        targetPort: targetPort || undefined,
                    };
                }
            }

            const fallback = edgeId.match(/^e-(.+?)__(.+?)--(.+?)__(.+)$/);
            if (fallback && fallback.length === 5) {
                return {
                    sourcePort: fallback[2] || undefined,
                    targetPort: fallback[4] || undefined,
                };
            }

            return {};
        };

        interface NormalizedEdge {
            source: string;
            target: string;
            sourcePort?: string;
            targetPort?: string;
        }

        const normalizedEdges: NormalizedEdge[] = edges.map(edge => {
            const edgeRecord = edge as unknown as Record<string, unknown>;
            const sourceNodeId = readStringField(edgeRecord, [
                'source',
                'source_node_id',
                'sourceNodeId',
            ]) ?? '';
            const targetNodeId = readStringField(edgeRecord, [
                'target',
                'target_node_id',
                'targetNodeId',
            ]) ?? '';
            const parsedFromId = parsePortsFromEdgeId(edgeRecord['id'], sourceNodeId, targetNodeId);
            const sourcePort = readStringField(edgeRecord, [
                'sourcePort',
                'source_port',
                'source_handle_id',
                'sourceHandleId',
                'source_handle',
                'sourceHandle',
            ]) ?? parsedFromId.sourcePort;
            const targetPort = readStringField(edgeRecord, [
                'targetPort',
                'target_port',
                'target_handle_id',
                'targetHandleId',
                'target_handle',
                'targetHandle',
            ]) ?? parsedFromId.targetPort;

            return {
                source: sourceNodeId,
                target: targetNodeId,
                sourcePort,
                targetPort,
            };
        });

        for (const edge of normalizedEdges) {
            if (!edge.source || !edge.target) {
                continue;
            }
            const sourcePort = edge.sourcePort;
            const targetPort = edge.targetPort;

            if (typeof sourcePort === 'string' && sourcePort.trim().length > 0) {
                for (const candidate of extractPortTokenCandidates(sourcePort)) {
                    outgoingConnections.add(`${edge.source}:${candidate}`);
                    outgoingConnectionsNormalized.add(`${edge.source}:${normalizePortToken(candidate)}`);
                }
            } else {
                outgoingNodeLevelConnections.add(edge.source);
            }

            if (typeof targetPort === 'string' && targetPort.trim().length > 0) {
                for (const candidate of extractPortTokenCandidates(targetPort)) {
                    incomingConnections.add(`${edge.target}:${candidate}`);
                    incomingConnectionsNormalized.add(`${edge.target}:${normalizePortToken(candidate)}`);
                }
            } else {
                incomingNodeLevelConnections.add(edge.target);
            }
        }

        const isInputPortConnected = (nodeId: string, portId: string): boolean => {
            if (incomingNodeLevelConnections.has(nodeId)) return true;
            for (const candidate of extractPortTokenCandidates(portId)) {
                if (incomingConnections.has(`${nodeId}:${candidate}`)) return true;
                if (incomingConnectionsNormalized.has(`${nodeId}:${normalizePortToken(candidate)}`)) return true;
            }
            return false;
        };

        const isOutputPortConnected = (nodeId: string, portId: string): boolean => {
            if (outgoingNodeLevelConnections.has(nodeId)) return true;
            for (const candidate of extractPortTokenCandidates(portId)) {
                if (outgoingConnections.has(`${nodeId}:${candidate}`)) return true;
                if (outgoingConnectionsNormalized.has(`${nodeId}:${normalizePortToken(candidate)}`)) return true;
            }
            return false;
        };

        const isTriggerNodeType = (type: string | undefined): boolean => {
            const normalized = (type ?? '').toString().trim().toLowerCase().replace(/-/g, '_');
            return (
                normalized === 'trigger_chat' ||
                normalized === 'trigger_file_upload' ||
                normalized === 'trigger_webhook' ||
                normalized === 'trigger_manual'
            );
        };

        const resolveLabel = (n: WorkflowNode, p: WorkflowPorts['inputs'][number]) => {
            const ref =
                ('data_reference' in p && typeof (p as { data_reference?: unknown }).data_reference === 'string'
                    ? (p as { data_reference?: string }).data_reference
                    : undefined) ??
                ('dataReference' in p && typeof (p as { dataReference?: unknown }).dataReference === 'string'
                    ? (p as { dataReference?: string }).dataReference
                    : undefined);
            return (ref ?? p.label ?? p.id ?? n.id).toString();
        };
        const resolveType = (p: WorkflowPorts['inputs'][number]) => {
            const art =
                ('artifact_type' in p && typeof (p as { artifact_type?: unknown }).artifact_type === 'string'
                    ? (p as { artifact_type?: string }).artifact_type
                    : undefined) ??
                ('artifactType' in p && typeof (p as { artifactType?: unknown }).artifactType === 'string'
                    ? (p as { artifactType?: string }).artifactType
                    : undefined);
            const inferred = inferPortTypeFromReference(
                ('data_reference' in p && typeof (p as { data_reference?: unknown }).data_reference === 'string'
                    ? (p as { data_reference?: string }).data_reference
                    : undefined) ??
                ('dataReference' in p && typeof (p as { dataReference?: unknown }).dataReference === 'string'
                    ? (p as { dataReference?: string }).dataReference
                    : undefined) ??
                p.id
            );
            if (art) return art;
            if (p.type && p.type !== 'json' && p.type !== 'any') return p.type;
            return inferred ?? p.type ?? 'json';
        };

        for (const n of nodes) {
            const isTriggerNode = isTriggerNodeType(n.type);
            const ins = n.ports?.inputs ?? [];
            for (const p of ins) {
                if (isInputPortConnected(n.id, p.id)) continue;
                const id = `${n.id}:${p.id}`;
                if (inputById.has(id)) continue;
                inputById.set(id, {
                    id,
                    label: resolveLabel(n, p),
                    type: resolveType(p),
                    required: p.required,
                });
            }
            const outs = n.ports?.outputs ?? [];
            for (const p of outs) {
                if (!isTriggerNode && isOutputPortConnected(n.id, p.id)) continue;
                const id = `${n.id}:${p.id}`;
                if (isTriggerNode) {
                    if (inputById.has(id)) continue;
                    inputById.set(id, {
                        id,
                        label: resolveLabel(n, p),
                        type: resolveType(p),
                        required: p.required,
                    });
                } else {
                    if (outputById.has(id)) continue;
                    outputById.set(id, {
                        id,
                        label: resolveLabel(n, p),
                        type: resolveType(p),
                        required: p.required,
                    });
                }
            }
        }

        const inputs = [...inputById.values()];
        const outputs = [...outputById.values()];

        return {
            inputs: inputs.length ? inputs : [{ id: 'in-1', label: 'in 1', type: 'json', required: false }],
            outputs: outputs.length ? outputs : [{ id: 'out-1', label: 'out 1', type: 'json', required: false }],
        };
    }


    private portsFromHandles(node: WorkflowNode): WorkflowNode['ports'] | null {
        const raw = node as unknown as { input_handles?: unknown; output_handles?: unknown; data?: { params?: Record<string, unknown> } };
        const params = (raw.data && typeof raw.data === 'object' ? raw.data.params : undefined) as Record<string, unknown> | undefined;
        const inputsRaw = Array.isArray(raw.input_handles)
            ? raw.input_handles
            : Array.isArray(params?.['input_handles'])
                ? params?.['input_handles']
                : Array.isArray(params?.['inputHandles'])
                    ? params?.['inputHandles']
                    : null;
        const outputsRaw = Array.isArray(raw.output_handles)
            ? raw.output_handles
            : Array.isArray(params?.['output_handles'])
                ? params?.['output_handles']
                : Array.isArray(params?.['outputHandles'])
                    ? params?.['outputHandles']
                    : null;
        if (!inputsRaw && !outputsRaw) return null;

        const pickString = (obj: Record<string, unknown>, keys: string[]): string | undefined => {
            for (const k of keys) {
                const val = obj[k];
                if (typeof val === 'string') return val;
            }
            return undefined;
        };

        const toPort = (handle: unknown, idx: number, prefix: 'in' | 'out'): WorkflowPorts['inputs'][number] => {
            const rec = (handle && typeof handle === 'object') ? (handle as Record<string, unknown>) : {};
            const dataRef = pickString(rec, ['data_reference', 'dataReference']);
            const artifact = pickString(rec, ['artifact_type', 'artifactType']);
            const id = (typeof rec['id'] === 'string' ? (rec['id'] as string) : `${prefix}-${idx + 1}`);
            const label = (dataRef ?? (typeof rec['label'] === 'string' ? (rec['label'] as string) : undefined) ?? `${prefix} ${idx + 1}`);
            const explicitType = typeof rec['type'] === 'string' ? (rec['type'] as string) : undefined;
            const inferredType = inferPortTypeFromReference(dataRef ?? id ?? label);
            const type = artifact
                ?? ((explicitType && explicitType !== 'json' && explicitType !== 'any') ? explicitType : undefined)
                ?? inferredType
                ?? explicitType
                ?? 'json';
            const required = (typeof rec['required'] === 'boolean' ? (rec['required'] as boolean) : undefined);

            const port = { id, label, type, required } as WorkflowPorts['inputs'][number] & {
                data_reference?: string;
                artifact_type?: string;
            };
            if (dataRef) port.data_reference = dataRef;
            if (artifact) {
                port.artifact_type = artifact;
            } else if (inferredType) {
                port.artifact_type = inferredType;
            }
            return port as WorkflowPorts['inputs'][number];
        };

        return {
            inputs: (inputsRaw ?? []).map((h, i) => toPort(h, i, 'in')),
            outputs: (outputsRaw ?? []).map((h, i) => toPort(h, i, 'out')),
        };
    }


    onValidation(v: WorkflowValidationState): void {
        this.store.setValidation(v);
    }

    saveCurrent(): void {
        const selected = this.selectedWorkflow();
        if (!selected) return;
        this.store.loadWorkflow({ workflow: { ...selected, updatedAt: new Date().toISOString() } });
    }

    newWorkflow(): void {
        this.openNewWorkflowDialog();
    }

    async openNewWorkflowDialog(): Promise<void> {
        const ok = await this.confirmDiscardChanges();
        if (!ok) return;
        const dialogRef = this.dialog.open(NewWorkflowDialogComponent, {
            data: { name: 'Workflow', visibility: 'draft', kind: 'standard' } satisfies NewWorkflowDialogData,
            width: '480px',
            autoFocus: true,
        });

        dialogRef.afterClosed().subscribe((result) => {
            if (!result) return;
            this.store.createWorkflowWithGraph({
                name: result.name ?? 'Workflow',
                description: result.description,
                visibility: result.visibility ?? 'draft',
                kind: result.kind ?? 'standard',
                nodes: this.defaultNodes,
                edges: [],
            });
            this.sidebarCollapsed.set(false);
        });
    }

    toggleRunPanelSideNav(): void {
        if (!this.sidebarCollapsed()) {
            this.sidebarCollapsed.set(true);
        }
        
        this.runPanelOpen.set(!this.runPanelOpen())
    }

    closeRunPanel(): void {
        this.runPanelOpen.set(false);
    }

    toggleRunPanel(): void {
        this.runPanelOpen.update(v => !v);
    }

    openRunDetail(data: { run: RunEntry; index: number }): void {
        this.selectedRunForDetail.set(data);
        this.runDetailOpen.set(true);
    }

    closeRunDetail(): void {
        this.runDetailOpen.set(false);
    }

    onStageCancel(runId: string, event: { index: number; nodeIds: string[] }): void {
        // Handle stage cancel logic if needed
        console.log('Stage cancel:', runId, event);
    }

    onPipelineCancel(runId: string): void {
        // Handle pipeline cancel logic if needed
        console.log('Pipeline cancel:', runId);
    }

    toggleSidebar(): void {
        this.sidebarCollapsed.update((v) => !v);
    }

    closeSidebar(): void {
        this.sidebarCollapsed.set(true);
    }

    /** Navigate to Template Builder to create Tier 3 templates */
    openTemplateBuilder(): void {
        this.router.navigate(['/genai-workflows/templates/builder']);
    }

    /** Navigate to Templates List page */
    openTemplatesPage(): void {
        this.router.navigate(['/genai-workflows/templates']);
    }

    /** Navigate to Composites List page */
    openCompositesPage(): void {
        this.router.navigate(['/genai-workflows/composites']);
    }

    toggleMultiSelect(): void {
        this.multiSelectMode.update(v => !v);
        if (!this.multiSelectMode()) {
            this.selectedWorkflowIds.set(new Set());
        }
    }

    toggleWorkflowSelection(id: string, event?: Event): void {
        event?.stopPropagation();
        const next = new Set(this.selectedWorkflowIds());
        if (next.has(id)) {
            next.delete(id);
        } else {
            next.add(id);
        }
        this.selectedWorkflowIds.set(next);
    }

    clearWorkflowSelection(): void {
        this.selectedWorkflowIds.set(new Set());
    }

    onWorkflowCardKeydown(id: string, ev: KeyboardEvent): void {
        if (ev.key === 'Enter' || ev.key === ' ') {
            ev.preventDefault();
            void this.selectWorkflow(id);
        }
    }

    private async confirmDiscardChanges(): Promise<boolean> {
        if (!this.dirty()) return true;
        const confirmed = await firstValueFrom(
            this.dialog.open<ConfirmDialogComponent, ConfirmDialogData, boolean>(
                ConfirmDialogComponent,
                {
                    data: {
                        title: this.translate.instant('workflow.unsaved_changes_title'),
                        message: this.translate.instant('workflow.unsaved_changes_message'),
                    }
                }
            ).afterClosed()
        );
        return !!confirmed;
    }


    private async confirmUnsavedChoice(): Promise<UnsavedChoice> {
        const selected = this.selectedWorkflow();
        const selectedDirty = selected ? !!this.canDraftById()[selected.id] : false;
        if (!selectedDirty) return 'discard'; // meaning: proceed

        const choice = await firstValueFrom(
            this.dialog.open<ConfirmDialogComponent, ConfirmDialogData, UnsavedChoice>(
                ConfirmDialogComponent,
                {
                    data: {
                        title: this.translate.instant('workflow.unsaved_changes_title'),
                        message: this.translate.instant('workflow.unsaved_changes_message'),
                        // You must wire these to your ConfirmDialogComponent API:
                        // e.g. primary/secondary/tertiary buttons that close with 'save'/'discard'/'cancel'
                    },
                }
            ).afterClosed()
        );

        return choice ?? 'cancel';
    }

    async selectWorkflow(id: string): Promise<void> {
        if (this.selectedWorkflow()?.id === id) return;

        const rawChoice = await this.confirmUnsavedChoice() as UnsavedChoice | boolean | null | undefined;
        const choice: UnsavedChoice =
            rawChoice === 'save' || rawChoice === 'discard' || rawChoice === 'cancel'
                ? rawChoice
                : (rawChoice ? 'save' : 'cancel');

        if (choice === 'cancel') return;
        if (choice === 'save') {
            this.store.saveSelected();
        }

        // "discard" or "save" -> proceed
        this.store.selectWorkflow({ id });
        this.store.revalidateSelected();
        this.sidebarCollapsed.set(false);
    }

    async deleteWorkflow(id: string, event: Event): Promise<void> {
        event.stopPropagation();
        const workflow = this.workflows().find(w => w.id === id);
        if (!workflow) return;

        const confirmed = await firstValueFrom(
            this.dialog.open<ConfirmDialogComponent, ConfirmDialogData, boolean>(
                ConfirmDialogComponent,
                {
                    data: {
                        title: this.translate.instant('workflow.delete'),
                        message: this.translate.instant('workflow.delete_confirmation', { name: workflow.name }),
                        context: { workflow },
                    }
                }
            ).afterClosed()
        );

        if (!confirmed) return;

        this.store.deleteWorkflow({ id });
    }

    duplicateWorkflow(id: string, event: Event): void {
        event.stopPropagation();
        this.store.duplicateWorkflow({ id });
    }

    async editWorkflow(id: string, event: Event): Promise<void> {
        event.stopPropagation();
        const workflow = this.workflows().find(w => w.id === id);
        if (!workflow) return;

        const ok = await this.confirmDiscardChanges();
        if (!ok) return;

        const isSelected = this.selectedWorkflow()?.id === workflow.id;
        const hasValidationErrors = isSelected ? !this.validation().valid : !this.validityById()[workflow.id];

        const dialogRef = this.dialog.open(NewWorkflowDialogComponent, {
            data: {
                name: workflow.name,
                description: workflow.description,
                visibility: workflow.visibility,
                kind: workflow.kind,
                isEdit: true,
                workflowId: workflow.id,
                hasValidationErrors
            } satisfies NewWorkflowDialogData,
            width: '480px',
            autoFocus: true,
        });

        dialogRef.afterClosed().subscribe((result) => {
            if (!result) return;
            
            if (result.visibility === 'public' && workflow.visibility !== 'public') {
                // Publishing: update full workflow to set needsRepublish: false
                const updated: WorkflowDraft = {
                    ...workflow,
                    name: result.name ?? workflow.name,
                    description: result.description ?? workflow.description,
                    visibility: result.visibility,
                    kind: result.kind ?? workflow.kind,
                    needsRepublish: false,
                    updatedAt: new Date().toISOString(),
                };
                this.store.updateWorkflow({ workflow: updated });
            } else {
                // Just updating meta
                this.store.updateWorkflowMeta({
                    id: workflow.id,
                    name: result.name ?? workflow.name,
                    description: result.description ?? workflow.description,
                    visibility: result.visibility ?? workflow.visibility,
                    kind: result.kind ?? workflow.kind,
                });
            }
        });
    }

    async bulkDelete(): Promise<void> {
        const ids = this.selectedWorkflowIdList();
        if (!ids.length) return;
        const confirmed = await firstValueFrom(
            this.dialog.open<ConfirmDialogComponent, ConfirmDialogData, boolean>(
                ConfirmDialogComponent,
                {
                    data: {
                        title: this.translate.instant('workflow.delete'),
                        message: this.translate.instant('workflow.bulk_delete_confirmation', { count: ids.length }),
                    }
                }
            ).afterClosed()
        );
        if (!confirmed) return;
        ids.forEach(id => this.store.deleteWorkflow({ id }));
        this.clearWorkflowSelection();
    }

    bulkDuplicate(): void {
        const ids = this.selectedWorkflowIdList();
        if (!ids.length) return;
        ids.forEach(id => this.store.duplicateWorkflow({ id }));
        this.clearWorkflowSelection();
    }

    bulkSetKind(kind: 'standard' | 'reusable'): void {
        const ids = this.selectedWorkflowIdList();
        if (!ids.length) return;
        ids.forEach(id => this.store.updateWorkflowMeta({ id, kind }));
        this.clearWorkflowSelection();
    }

    runWorkflow(): void {
        this.store.startExecution();
    }

    clearHistory(): void {
        this.store.clearHistory();
    }

    saveWorkflow(): void {
        const selected = this.selectedWorkflow();
        if (!selected) return;

        const updated: WorkflowDraft = {
            ...selected,
            updatedAt: new Date().toISOString(),
        };

        this.store.updateWorkflow({ workflow: updated });
        this.toast.show(this.translate.instant('workflow.toast.draft_saved'));
    }

    saveDraft(): void {
        const selected = this.selectedWorkflow();
        if (!selected) return;

        const updated: WorkflowDraft = {
            ...selected,
            visibility: 'draft',
            updatedAt: new Date().toISOString(),
        };

        this.store.updateWorkflow({ workflow: updated });
        this.toast.show(this.translate.instant('workflow.toast.draft_saved'));
    }

    publishWorkflow(): void {
        const selected = this.selectedWorkflow();
        if (!selected) return;

        const canPublish = this.canPublishById()[selected.id] ?? false;
        if (!canPublish) {
            this.toast.show(this.translate.instant('workflow.new_dialog.visibility.cannot_publish_error'));
            return;
        }

        const updated: WorkflowDraft = {
            ...selected,
            visibility: 'public',
            needsRepublish: false,
            updatedAt: new Date().toISOString(),
        };

        this.store.updateWorkflow({ workflow: updated });
        this.toast.show(this.translate.instant('workflow.toast.published'));
    }

    private normalizeTypeToken(value: string | null | undefined): string {
        return (value ?? '')
            .toString()
            .trim()
            .toLowerCase()
            .replace(/-/g, '_');
    }

    private initializeFilterForm(): void {
        this.filterFieldConfig = [
            this.fieldsConfigService.getTextField({
                name: 'search',
                label: this.translate.instant('workflow.filter'),
                placeholder: this.translate.instant('workflow.filter'),
                layoutClass: 'primary',
                required: false,
                helperText: this.translate.instant('workflow.filter'),
            }),
        ];
    }

    private setupFilterListeners(): void {
        this.filterForm.valueChanges.subscribe((values) => {
            this.workflowFilter.set(values.search || '');
        });
    }

    private setupRepublishToasts(): void {
        runInInjectionContext(this.injector, () => {
            effect(() => {
                const wf = this.selectedWorkflow();
                if (!wf) return;
                const prev = this.republishSeen.get(wf.id);
                const current = !!wf.needsRepublish;
                if (prev === undefined) {
                    this.republishSeen.set(wf.id, current);
                    return;
                }
                if (current && !prev) {
                    this.toast.show(this.translate.instant('workflow.toast.republish_required'));
                }
                this.republishSeen.set(wf.id, current);
            });
        });
    }
}
