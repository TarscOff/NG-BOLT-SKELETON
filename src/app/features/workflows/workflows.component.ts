import { ChangeDetectionStrategy, Component, DestroyRef, Signal, computed, effect, inject, Injector, OnInit, runInInjectionContext, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
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
import { ActionDefinitionLite, PaletteType, WorkflowEdge, WorkflowNode, WorkflowPorts } from './templates/utils/workflow.interface';
import { ActionFormSpec } from './templates/utils/action-forms';
import { toSignal } from '@angular/core/rxjs-interop';
import { firstValueFrom } from 'rxjs';
import { map } from 'rxjs/operators';
import { WorkflowsStore, WorkflowDraft, WorkflowExecutionLog, WorkflowValidationState } from './data/workflows.store';
import { WorkflowsCatalogService } from './data/workflows-catalog.service';
import { NewWorkflowDialogComponent, NewWorkflowDialogData } from './sub/new-workflow-dialog.component';
import { FormBuilder, FormGroup } from '@angular/forms';

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
    store = inject(WorkflowsStore);
    readonly dirty = toSignal(this.store.dirty$, { initialValue: false });
    private catalogService = inject(WorkflowsCatalogService);
    private dialog = inject(MatDialog);
    private translate = inject(TranslateService);
    private layoutService = inject(LayoutService);
    private toast = inject(ToastService);
    private injector = inject(Injector);
    private republishSeen = new Map<string, boolean>();

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

    nodes = computed<WorkflowNode[]>(() => {
        const allNodes = this.selectedWorkflow()?.nodes ?? this.defaultNodes;
        return allNodes
            .filter(n => n.type !== 'input' && n.type !== 'result')
            .map(n => ({ ...n, ports: this.ensurePorts(n.type, this.portsFromHandles(n) ?? n.ports) }));
    });
    edges = computed<WorkflowEdge[]>(() => this.selectedWorkflow()?.edges ?? []);
    availableActions = computed<ActionDefinitionLite[]>(() => {
        const c = this.catalog();
        const base = c.length ? c : this.fallbackCatalog;
        const filtered = this.filterCatalog(base);
        const currentId = this.selectedWorkflow()?.id ?? null;
        const composites = this.buildCompositeActions(this.workflows(), currentId);
        return [...composites, ...filtered];
    });
    execTypes = computed<Set<PaletteType>>(() => {
        const types = this.availableActions().map(a => a.type as PaletteType);
        return new Set<PaletteType>([...types, 'composite' as PaletteType]);
    });
    canvasNodes = computed<WorkflowNode[]>(() => {
        const allNodes = this.nodes();
        return allNodes.filter(n => n.type !== 'input' && n.type !== 'result');
    });
    canvasEdges = computed<WorkflowEdge[]>(() => {
        return this.edges();
    });

    actionsNodes: Record<string, ActionFormSpec> = {

        chat: {
            make: () => [
                /* F.getTextAreaField({
                    name: 'system_prompt',
                    label: 'system_prompt',
                    placeholder: 'System prompt…',
                    rows: 10,
                    required: true,
                    validators: [Validators.required, Validators.maxLength(500)],
                    maxLength: 500
                }),
                F.getTextAreaField({
                    name: 'chat_message',
                    label: 'chat_message',
                    placeholder: 'Ask anything…',
                    rows: 10,
                    required: true,
                    validators: [Validators.required, Validators.maxLength(2000)],
                    maxLength: 2000
                }),
                F.getDropdownField({
                    name: 'temperature',
                    label: 'Temperature',
                    options: [
                        { label: '0 – Deterministic', value: 0 },
                        { label: '0.3', value: 0.3 },
                        { label: '0.7', value: 0.7 },
                        { label: '1.0 – Creative', value: 1 },
                    ],
                    required: true,
                    validators: [Validators.required],
                    errorMessages: { required: "Temperature is required" },
                    defaultValue: 0.3,
                    helperText: "Saisissez la temperature",
                }), */
            ],
            defaults: {
                temperature: 0.3
            },

        },
        // Trigger nodes: appear in toolbox as sources (only outputs)
        trigger_chat: {
            make: () => [

            ],
            defaults: {
            },
        },

        trigger_file_upload: {
            make: () => [

            ],
            defaults: {
            },
        },

        trigger_webhook: {
            make: () => [

            ],
            defaults: {
            },
        },

        embed: {
            make: () => [
                /*              F.getTextAreaField({
                                 name: 'text',
                                 label: 'workflow.forms.embed.text.label',
                                 placeholder: 'workflow.forms.embed.text.placeholder',
                                 required: true,
                                 rows: 6,
                                 validators: [Validators.required, Validators.maxLength(4000)],
                                 errorMessages: { required: 'workflow.forms.embed.errors.text_required' },
                                 maxLength: 4000,
                                 helperText: 'workflow.forms.embed.text.helper',
                             }),
                             F.getDropdownField({
                                 name: 'embedding_model',
                                 label: 'workflow.forms.embed.embedding_model.label',
                                 options: [
                                     { label: 'workflow.forms.embed.embedding_model.options.openai_small', value: 'text-embedding-3-small' },
                                     { label: 'workflow.forms.embed.embedding_model.options.openai_large', value: 'text-embedding-3-large' },
                                     { label: 'workflow.forms.embed.embedding_model.options.local', value: 'all-MiniLM-L6-v2' },
                                 ],
                                 required: true,
                                 validators: [Validators.required],
                                 errorMessages: { required: 'workflow.forms.embed.errors.model_required' },
                                 defaultValue: 'text-embedding-3-small',
                                 helperText: 'workflow.forms.embed.embedding_model.helper',
                             }),
                             F.getToggleField({
                                 name: 'normalize_embeddings',
                                 label: 'workflow.forms.embed.normalize_embeddings.label',
                                 helperText: 'workflow.forms.embed.normalize_embeddings.helper',
                                 required: false,
                                 defaultValue: true,
                             }), */
            ],
            defaults: {
                embedding_model: 'text-embedding-3-small',
                normalize_embeddings: true,
            },
        },

        retrieve: {
            make: () => [
                /*             F.getTextAreaField({
                                name: 'query',
                                label: 'workflow.forms.retrieve.query.label',
                                placeholder: 'workflow.forms.retrieve.query.placeholder',
                                rows: 4,
                                required: true,
                                validators: [Validators.required, Validators.maxLength(2000)],
                                errorMessages: { required: 'workflow.forms.retrieve.errors.query_required' },
                                maxLength: 2000,
                            }),
                            F.getDropdownField({
                                name: 'vector_store',
                                label: 'workflow.forms.retrieve.vector_store.label',
                                options: [
                                    { label: 'workflow.forms.vector_store.options.azure_cosmos_db', value: 'azure_cosmos_db' },
                                    { label: 'workflow.forms.vector_store.options.azure_ai_search', value: 'azure_ai_search' },
                                    { label: 'workflow.forms.vector_store.options.pinecone', value: 'pinecone' },
                                    { label: 'workflow.forms.vector_store.options.qdrant', value: 'qdrant' },
                                    { label: 'workflow.forms.vector_store.options.pgvector', value: 'pgvector' },
                                ],
                                required: true,
                                validators: [Validators.required],
                                defaultValue: 'azure_cosmos_db',
                                helperText: 'workflow.forms.retrieve.vector_store.helper',
                            }),
                            F.getRangeField({
                                name: 'top_k',
                                label: 'workflow.forms.retrieve.top_k.label',
                                min: 1,
                                max: 20,
                                step: 1,
                                defaultValue: 5,
                                required: true,
                                validators: [Validators.required],
                                helperText: 'workflow.forms.retrieve.top_k.helper',
                            }),
                            F.getRangeField({
                                name: 'score_threshold',
                                label: 'workflow.forms.retrieve.score_threshold.label',
                                min: 0,
                                max: 1,
                                step: 0.05,
                                defaultValue: 0.2,
                                required: true,
                                validators: [Validators.required],
                                helperText: 'workflow.forms.retrieve.score_threshold.helper',
                            }),
                            F.getToggleField({
                                name: 'include_metadata',
                                label: 'workflow.forms.retrieve.include_metadata.label',
                                helperText: 'workflow.forms.retrieve.include_metadata.helper',
                                required: false,
                                defaultValue: true,
                            }), */
            ],
            defaults: {
                vector_store: 'azure_cosmos_db',
                top_k: 5,
                score_threshold: 0.2,
                include_metadata: true,
            },
        },

        convert_and_chunk: {
            make: () => [
                /*                 F.getDropdownField({
                                    name: 'text_splitter',
                                    label: 'workflow.forms.convert_and_chunk.text_splitter.label',
                                    options: [
                                        { label: 'workflow.forms.convert_and_chunk.text_splitter.options.recursive', value: 'recursive_character' },
                                        { label: 'workflow.forms.convert_and_chunk.text_splitter.options.markdown', value: 'markdown' },
                                        { label: 'workflow.forms.convert_and_chunk.text_splitter.options.token', value: 'token' },
                                    ],
                                    required: true,
                                    validators: [Validators.required],
                                    defaultValue: 'recursive_character',
                                    helperText: 'workflow.forms.convert_and_chunk.text_splitter.helper',
                                }),
                                F.getRangeField({
                                    name: 'chunk_size',
                                    label: 'workflow.forms.convert_and_chunk.chunk_size.label',
                                    min: 200,
                                    max: 4000,
                                    step: 100,
                                    defaultValue: 1000,
                                    required: true,
                                    validators: [Validators.required],
                                    helperText: 'workflow.forms.convert_and_chunk.chunk_size.helper',
                                }),
                                F.getRangeField({
                                    name: 'chunk_overlap',
                                    label: 'workflow.forms.convert_and_chunk.chunk_overlap.label',
                                    min: 0,
                                    max: 800,
                                    step: 50,
                                    defaultValue: 200,
                                    required: true,
                                    validators: [Validators.required],
                                    helperText: 'workflow.forms.convert_and_chunk.chunk_overlap.helper',
                                }),
                                F.getToggleField({
                                    name: 'clean_whitespace',
                                    label: 'workflow.forms.convert_and_chunk.clean_whitespace.label',
                                    helperText: 'workflow.forms.convert_and_chunk.clean_whitespace.helper',
                                    required: false,
                                    defaultValue: true,
                                }),
                                F.getToggleField({
                                    name: 'add_source_metadata',
                                    label: 'workflow.forms.convert_and_chunk.add_source_metadata.label',
                                    helperText: 'workflow.forms.convert_and_chunk.add_source_metadata.helper',
                                    required: false,
                                    defaultValue: true,
                                }), */
            ],
            defaults: {
                text_splitter: 'recursive_character',
                chunk_size: 1000,
                chunk_overlap: 200,
                clean_whitespace: true,
                add_source_metadata: true,
            },
        },

        embed_langchain_documents: {
            make: () => [
                /*                 F.getDropdownField({
                                    name: 'embedding_model',
                                    label: 'workflow.forms.embed_langchain_documents.embedding_model.label',
                                    options: [
                                        { label: 'workflow.forms.embed.embedding_model.options.openai_small', value: 'text-embedding-3-small' },
                                        { label: 'workflow.forms.embed.embedding_model.options.openai_large', value: 'text-embedding-3-large' },
                                        { label: 'workflow.forms.embed.embedding_model.options.local', value: 'all-MiniLM-L6-v2' },
                                    ],
                                    required: true,
                                    validators: [Validators.required],
                                    defaultValue: 'text-embedding-3-small',
                                }),
                                F.getRangeField({
                                    name: 'batch_size',
                                    label: 'workflow.forms.embed_langchain_documents.batch_size.label',
                                    min: 1,
                                    max: 128,
                                    step: 1,
                                    defaultValue: 32,
                                    required: true,
                                    validators: [Validators.required],
                                    helperText: 'workflow.forms.embed_langchain_documents.batch_size.helper',
                                }),
                                F.getToggleField({
                                    name: 'normalize_embeddings',
                                    label: 'workflow.forms.embed.normalize_embeddings.label',
                                    helperText: 'workflow.forms.embed.normalize_embeddings.helper',
                                    required: false,
                                    defaultValue: true,
                                }), */
            ],
            defaults: {
                embedding_model: 'text-embedding-3-small',
                batch_size: 32,
                normalize_embeddings: true,
            },
        },

        store_embedded_langchain_documents: {
            make: () => [
                /*                 F.getDropdownField({
                                    name: 'vector_store',
                                    label: 'workflow.forms.store_embedded_langchain_documents.vector_store.label',
                                    options: [
                                        { label: 'workflow.forms.vector_store.options.azure_cosmos_db', value: 'azure_cosmos_db' },
                                        { label: 'workflow.forms.vector_store.options.azure_ai_search', value: 'azure_ai_search' },
                                        { label: 'workflow.forms.vector_store.options.pinecone', value: 'pinecone' },
                                        { label: 'workflow.forms.vector_store.options.qdrant', value: 'qdrant' },
                                        { label: 'workflow.forms.vector_store.options.pgvector', value: 'pgvector' },
                                    ],
                                    required: true,
                                    validators: [Validators.required],
                                    defaultValue: 'azure_cosmos_db',
                                    helperText: 'workflow.forms.store_embedded_langchain_documents.vector_store.helper',
                                }),
                                F.getTextField({
                                    name: 'collection_name',
                                    label: 'workflow.forms.store_embedded_langchain_documents.collection_name.label',
                                    placeholder: 'workflow.forms.store_embedded_langchain_documents.collection_name.placeholder',
                                    required: true,
                                    validators: [Validators.required, Validators.maxLength(128)],
                                    errorMessages: { required: 'workflow.forms.store_embedded_langchain_documents.errors.collection_required' },
                                }),
                                F.getTextField({
                                    name: 'namespace',
                                    label: 'workflow.forms.store_embedded_langchain_documents.namespace.label',
                                    placeholder: 'workflow.forms.store_embedded_langchain_documents.namespace.placeholder',
                                    required: false,
                                    validators: [Validators.maxLength(128)],
                                    helperText: 'workflow.forms.store_embedded_langchain_documents.namespace.helper',
                                }),
                                F.getToggleField({
                                    name: 'upsert',
                                    label: 'workflow.forms.store_embedded_langchain_documents.upsert.label',
                                    helperText: 'workflow.forms.store_embedded_langchain_documents.upsert.helper',
                                    required: false,
                                    defaultValue: true,
                                }), */
            ],
            defaults: {
                vector_store: 'azure_cosmos_db',
                collection_name: 'documents',
                namespace: 'default',
                upsert: true,
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
                        { id: 'embeddings', data_reference: 'embeddings', artifact_type: 'json' },
                        { id: 'collection', data_reference: 'collection', artifact_type: 'collection' },
                        { id: 'filter_document_publication_datetime', data_reference: 'filter_document_publication_datetime', artifact_type: 'string' },
                    ],
                    outputs: [
                        { id: 'context', data_reference: 'context', artifact_type: 'json' },
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
                        { id: 'langchain_documents', data_reference: 'langchain_documents', artifact_type: 'file' },
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
                        { id: 'langchain_documents', data_reference: 'langchain_documents', artifact_type: 'json' },
                    ],
                    outputs: [
                        { id: 'embedded_langchain_documents', data_reference: 'embedded_langchain_documents', artifact_type: 'json' },
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
                        { id: 'collection', data_reference: 'collection', artifact_type: 'string' },
                        { id: 'embedded_langchain_documents', data_reference: 'embedded_langchain_documents', artifact_type: 'collection' },
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
    ];

    defaultNodes: WorkflowNode[] = [];

    sidebarCollapsed = signal<boolean>(false);
    multiSelectMode = signal<boolean>(false);
    selectedWorkflowIds = signal<Set<string>>(new Set());
    selectedWorkflowCount = computed(() => this.selectedWorkflowIds().size);
    selectedWorkflowIdList = computed(() => Array.from(this.selectedWorkflowIds()));

    constructor() {

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

        // Dynamically update toolbar based on workflow selection
        this.store.selectedWorkflow$.subscribe(workflow => {
            if (workflow) {
                this.toolbar.scope(this.destroyRef, [newWorkflow, saveWorkflow, publishWorkflow]);
            } else {
                this.toolbar.scope(this.destroyRef, [newWorkflow]);
            }
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
                w.visibility === 'public' &&
                w.id !== currentId
            ).map(w => ({
                type: `wf:${w.id}`,
                params: {
                    icon: 'account_tree',
                    class: 'accent',
                    label: w.name,
                    workflowId: w.id,
                    ports: this.buildCompositePorts(w),
                }
            } as ActionDefinitionLite));
    }

    private buildCompositePorts(wf: WorkflowDraft): WorkflowPorts {
        const nodes = (wf.nodes ?? []).map(n => ({ ...n, ports: this.ensurePorts(n.type, this.portsFromHandles(n) ?? n.ports) }));
        const edges = wf.edges ?? [];
        const indeg = new Map<string, number>();
        const outdeg = new Map<string, number>();
        for (const n of nodes) {
            indeg.set(n.id, 0);
            outdeg.set(n.id, 0);
        }
        for (const e of edges) {
            indeg.set(e.target, (indeg.get(e.target) ?? 0) + 1);
            outdeg.set(e.source, (outdeg.get(e.source) ?? 0) + 1);
        }

        const sourceNodes = nodes.filter(n => (indeg.get(n.id) ?? 0) === 0);
        const sinkNodes = nodes.filter(n => (outdeg.get(n.id) ?? 0) === 0);

        const inputs: WorkflowPorts['inputs'] = [];
        const outputs: WorkflowPorts['outputs'] = [];

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
            return art ?? p.type ?? 'json';
        };

        for (const n of sourceNodes) {
            const ins = n.ports?.inputs ?? [];
            for (const p of ins) {
                inputs.push({
                    id: `${n.id}:${p.id}`,
                    label: resolveLabel(n, p),
                    type: resolveType(p),
                    required: p.required,
                });
            }
        }

        for (const n of sinkNodes) {
            const outs = n.ports?.outputs ?? [];
            for (const p of outs) {
                outputs.push({
                    id: `${n.id}:${p.id}`,
                    label: resolveLabel(n, p),
                    type: resolveType(p),
                    required: p.required,
                });
            }
        }

        return {
            inputs: inputs.length ? inputs : [{ id: 'in-1', label: 'in 1', type: 'json', required: false }],
            outputs: outputs.length ? outputs : [{ id: 'out-1', label: 'out 1', type: 'json', required: false }],
        };
    }

    private ensurePorts(type: string, ports?: WorkflowNode['ports']): WorkflowNode['ports'] {
        const defaults = this.defaultPortsFor(type);
        const base = ports ?? defaults;
        const known = this.knownPortsFor(type);

        const pickString = (obj: WorkflowPorts['inputs'][number], keys: string[]): string | undefined => {
            const rec = obj as unknown as Record<string, unknown>;
            for (const k of keys) {
                const val = rec[k];
                if (typeof val === 'string') return val;
            }
            return undefined;
        };

        const isGenericLabel = (label: string | undefined, prefix: 'in' | 'out') =>
            !label || new RegExp(`^${prefix}\\s+\\d+$`, 'i').test(label);

        const norm = (p: WorkflowPorts['inputs'][number], idx: number, prefix: 'in' | 'out', knownList?: WorkflowPorts['inputs']) => {
            const dataRef = pickString(p, ['data_reference', 'dataReference']);
            const artifact = pickString(p, ['artifact_type', 'artifactType']);
            const knownPort = knownList?.[idx];
            const knownRef = knownPort ? pickString(knownPort, ['data_reference', 'dataReference']) : undefined;
            const knownArtifact = knownPort ? pickString(knownPort, ['artifact_type', 'artifactType']) : undefined;
            const label = dataRef
                ?? (isGenericLabel(p.label, prefix) ? (knownRef ?? knownPort?.label) : p.label)
                ?? `${prefix} ${idx + 1}`;
            const port = {
                id: p.id ?? `${prefix}-${idx + 1}`,
                label,
                type: p.type ?? artifact ?? knownPort?.type ?? knownArtifact ?? 'json',
                required: p.required,
            } as WorkflowPorts['inputs'][number] & { data_reference?: string; artifact_type?: string };
            if (dataRef) port.data_reference = dataRef;
            if (artifact) port.artifact_type = artifact;
            return port as WorkflowPorts['inputs'][number];
        };

        return {
            inputs: (base.inputs ?? []).map((p, i) => norm(p, i, 'in', known?.inputs)),
            outputs: (base.outputs ?? []).map((p, i) => norm(p, i, 'out', known?.outputs)),
        };
    }

    private knownPortsFor(type: string): WorkflowNode['ports'] | undefined {
        const t = (type ?? '').toString().toLowerCase();
        const def = this.fallbackCatalog.find(a => (a.type ?? '').toString().toLowerCase() === t);
        return def?.params?.['ports'] as WorkflowNode['ports'] | undefined;
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
            const type = (typeof rec['type'] === 'string' ? (rec['type'] as string) : undefined) ?? artifact ?? 'json';
            const required = (typeof rec['required'] === 'boolean' ? (rec['required'] as boolean) : undefined);

            const port = { id, label, type, required } as WorkflowPorts['inputs'][number] & {
                data_reference?: string;
                artifact_type?: string;
            };
            if (dataRef) port.data_reference = dataRef;
            if (artifact) port.artifact_type = artifact;
            return port as WorkflowPorts['inputs'][number];
        };

        return {
            inputs: (inputsRaw ?? []).map((h, i) => toPort(h, i, 'in')),
            outputs: (outputsRaw ?? []).map((h, i) => toPort(h, i, 'out')),
        };
    }

    private defaultPortsFor(type: string): WorkflowNode['ports'] {
        const t = (type ?? '').toString().toLowerCase();
        const triggers = new Set(['compare', 'extract', 'summarize']);
        const counts = t === 'input' ? { inputs: 0, outputs: 1 }
            : t === 'result' ? { inputs: 1, outputs: 0 }
                : triggers.has(t) ? { inputs: 0, outputs: 1 }
                    : { inputs: 1, outputs: 1 };
        const inputs = Array.from({ length: counts.inputs }, (_, i) => ({
            id: `in-${i + 1}`,
            label: `in ${i + 1}`,
            type: 'json',
            required: false,
        }));
        const outputs = Array.from({ length: counts.outputs }, (_, i) => ({
            id: `out-${i + 1}`,
            label: `out ${i + 1}`,
            type: 'json',
            required: false,
        }));
        return { inputs, outputs };
    }

    private filterCatalog(list: ActionDefinitionLite[]): ActionDefinitionLite[] {
        const blocked = new Set(['compare', 'summarize', 'extract', 'jira']);
        return (list ?? []).filter((a) => !blocked.has((a.type ?? '').toString().toLowerCase()));
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

    toggleSidebar(): void {
        this.sidebarCollapsed.update((v) => !v);
    }

    closeSidebar(): void {
        this.sidebarCollapsed.set(true);
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
        if (!this.dirty()) return 'discard'; // meaning: proceed

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

        const choice = await this.confirmUnsavedChoice();

        if (!choice) return;

        if (choice) {
            this.store.saveSelected();
        }

        // discard or saved -> proceed
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

        const updated: WorkflowDraft = {
            ...selected,
            visibility: 'public',
            needsRepublish: false,
            updatedAt: new Date().toISOString(),
        };

        this.store.updateWorkflow({ workflow: updated });
        this.toast.show(this.translate.instant('workflow.toast.published'));
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
