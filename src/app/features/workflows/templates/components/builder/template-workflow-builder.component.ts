/**
 * Template Workflow Builder Component
 * 
 * Allows SuperAdmins to create Tier 3 Template Workflows by:
 * - Selecting published Composite Workflows (Tier 2)
 * - Choosing a presentation pattern (standalone-single, standalone-tabs, linked-integrated)
 * - Configuring the UI layout and components
 * - Creating connections between composites (for linked templates)
 * - Publishing the template for end users
 */

import {
    Component,
    OnInit,
    OnDestroy,
    inject,
    signal,
    computed,
    ChangeDetectionStrategy,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule, ReactiveFormsModule, FormBuilder, FormGroup, Validators } from '@angular/forms';
import { Router, ActivatedRoute } from '@angular/router';
import { Subject, interval, takeUntil } from 'rxjs';

// Angular Material
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatCardModule } from '@angular/material/card';
import { MatInputModule } from '@angular/material/input';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatSelectModule } from '@angular/material/select';
import { MatChipsModule } from '@angular/material/chips';
import { MatTooltipModule } from '@angular/material/tooltip';
import { MatDividerModule } from '@angular/material/divider';
import { MatStepperModule } from '@angular/material/stepper';
import { MatCheckboxModule } from '@angular/material/checkbox';
import { MatSnackBar, MatSnackBarModule } from '@angular/material/snack-bar';
import { MatDialogModule } from '@angular/material/dialog';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatListModule } from '@angular/material/list';
import { MatTabsModule } from '@angular/material/tabs';
import { MatMenuModule } from '@angular/material/menu';

import { TranslateModule, TranslateService } from '@ngx-translate/core';
import {
    CdkDragDrop,
    CdkDrag,
    CdkDropList,
    moveItemInArray,
} from '@angular/cdk/drag-drop';

// Store and interfaces
import { TemplateWorkflowsStore } from '../../data/template-workflows.store';
import {
    TemplateWorkflow,
    TemplateWorkflowNode,
    TemplateWorkflowEdge,
    CompositeWorkflow,
    TemplatePresentationPattern,
    UIComponentConfig,
    UIComponentType,
    WorkflowStatus,
    DataPortScopeConfig,
    TemplateDataFlowConfig,
    ArtifactType,
} from '../../interfaces/template-workflow.interface';
import { DataScope } from '@shared/types/workflow.types';
import { WorkflowSyncService } from '../../services/workflow-sync.service';

// ============================================================================
// COMPONENT DEFINITION
// ============================================================================

@Component({
    selector: 'app-template-workflow-builder',
    standalone: true,
    imports: [
        CommonModule,
        FormsModule,
        ReactiveFormsModule,
        TranslateModule,
        // Material
        MatButtonModule,
        MatIconModule,
        MatCardModule,
        MatInputModule,
        MatFormFieldModule,
        MatSelectModule,
        MatChipsModule,
        MatTooltipModule,
        MatDividerModule,
        MatStepperModule,
        MatCheckboxModule,
        MatSnackBarModule,
        MatDialogModule,
        MatProgressSpinnerModule,
        MatListModule,
        MatTabsModule,
        MatMenuModule,
        // CDK
        CdkDropList,
        CdkDrag,
    ],
    templateUrl: './template-workflow-builder.component.html',
    styleUrls: ['./template-workflow-builder.component.scss'],
    changeDetection: ChangeDetectionStrategy.OnPush,
})
export class TemplateWorkflowBuilderComponent implements OnInit, OnDestroy {
    private readonly store = inject(TemplateWorkflowsStore);
    private readonly workflowSync = inject(WorkflowSyncService);
    private readonly fb = inject(FormBuilder);
    private readonly router = inject(Router);
    private readonly route = inject(ActivatedRoute);
    private readonly snackBar = inject(MatSnackBar);
    private readonly translate = inject(TranslateService);
    private readonly destroy$ = new Subject<void>();

    // ========================================================================
    // SIGNALS
    // ========================================================================

    /** Edit mode - true if editing existing template */
    readonly isEditMode = signal(false);

    /** Template ID when editing */
    readonly templateId = signal<string | null>(null);

    /** Current step in stepper */
    readonly currentStep = signal(0);

    /** Loading state */
    readonly isLoading = signal(false);

    /** Saving state */
    readonly isSaving = signal(false);

    /** Available composites (published only) */
    readonly availableComposites = signal<CompositeWorkflow[]>([]);

    /** Selected composites for template */
    readonly selectedComposites = signal<TemplateWorkflowNode[]>([]);

    /** Template edges (for linked patterns) */
    readonly templateEdges = signal<TemplateWorkflowEdge[]>([]);

    /** UI Components configuration */
    readonly uiComponents = signal<UIComponentConfig[]>([]);

    /** Data flow configuration - scope for each port */
    readonly dataFlowConfig = signal<TemplateDataFlowConfig>({
        inputs: [],
        outputs: [],
        intermediates: [],
        defaultScope: 'session',
        showDataFlowVisualization: true,
    });

    /** Form validity signals (for reactive updates in templates) */
    readonly basicInfoFormValid = signal(false);
    readonly layoutFormValid = signal(false);

    // ========================================================================
    // FORMS
    // ========================================================================

    /** Basic info form */
    basicInfoForm!: FormGroup;

    /** Layout form */
    layoutForm!: FormGroup;

    // ========================================================================
    // COMPUTED
    // ========================================================================

    /** Step labels (translated) */
    get stepLabels(): string[] {
        return [
            this.translate.instant('templates.builder.step1_label'),
            this.translate.instant('templates.builder.step2_label'),
            this.translate.instant('templates.builder.step3_label'),
            this.translate.instant('templates.builder.step4_label'),
            this.translate.instant('templates.builder.step5_label'),
        ];
    }

    /** Pattern options */
    readonly patternOptions: { value: TemplatePresentationPattern; label: string; icon: string }[] = [
        { value: 'standalone-single', label: 'Single Page', icon: 'web' },
        { value: 'standalone-tabs', label: 'Tabbed View', icon: 'tab' },
        { value: 'linked-integrated', label: 'Linked Workflow', icon: 'hub' },
    ];

    /** Layout options based on pattern */
    readonly layoutOptions = computed(() => {
        const pattern = this.layoutForm?.get('pattern')?.value;
        switch (pattern) {
            case 'standalone-single':
                return [
                    { value: 'standalone-single', label: 'Full Page' },
                    { value: 'chat-with-files', label: 'Chat with Files' },
                ];
            case 'standalone-tabs':
                return [
                    { value: 'standalone-tabs', label: 'Horizontal Tabs' },
                ];
            case 'linked-integrated':
                return [
                    { value: 'linked-horizontal', label: 'Horizontal Layout' },
                    { value: 'linked-vertical', label: 'Vertical Layout' },
                    { value: 'comparison-view', label: 'Comparison View' },
                    { value: 'dashboard', label: 'Dashboard' },
                ];
            default:
                return [{ value: 'standalone-single', label: 'Full Page' }];
        }
    });

    /** UI Component type options */
    readonly componentTypeOptions: { value: UIComponentType; label: string; icon: string }[] = [
        { value: 'chat', label: 'Chat Interface', icon: 'chat' },
        { value: 'file-uploader', label: 'File Upload', icon: 'upload_file' },
        { value: 'result-viewer', label: 'Result Viewer', icon: 'preview' },
        { value: 'text-input', label: 'Text Input', icon: 'edit_note' },
        { value: 'document-list', label: 'Document List', icon: 'list_alt' },
        { value: 'comparison-panel', label: 'Comparison Panel', icon: 'compare' },
    ];

    /** Data scope options */
    readonly dataScopeOptions: { value: DataScope; label: string; icon: string; description: string }[] = [
        { 
            value: 'session', 
            label: 'Session Only', 
            icon: 'schedule', 
            description: 'Data exists only during current session, deleted when session ends' 
        },
        { 
            value: 'project', 
            label: 'Project Scope', 
            icon: 'folder', 
            description: 'Data persists in project, can be reused across sessions' 
        },
        { 
            value: 'both', 
            label: 'Both', 
            icon: 'sync', 
            description: 'Session data synced to project storage' 
        },
    ];

    /** Check if can proceed to next step */
    readonly canProceedToComposites = computed(() => this.basicInfoFormValid());

    readonly canProceedToLayout = computed(() => this.selectedComposites().length > 0);

    readonly canProceedToUI = computed(() => this.layoutFormValid());

    readonly canSave = computed(() => {
        return this.basicInfoFormValid() &&
            this.selectedComposites().length > 0 &&
            this.layoutFormValid();
    });

    /** Get validation message explaining why form can't be saved */
    readonly validationMessage = computed(() => {
        if (!this.basicInfoFormValid()) {
            return this.translate.instant('templates.builder.validation_error');
        }
        if (this.selectedComposites().length === 0) {
            return this.translate.instant('templates.builder.select_composites_error');
        }
        if (!this.layoutFormValid()) {
            return this.translate.instant('templates.builder.validation_error');
        }
        return '';
    });

    /** Suggested UI components based on composites */
    readonly suggestedComponents = computed(() => {
        const composites = this.selectedComposites();
        const suggestions: UIComponentType[] = [];

        for (const node of composites) {
            const composite = this.getCompositeById(node.compositeWorkflowId);
            if (composite) {
                // Suggest based on composite name patterns
                const name = composite.name.toLowerCase();
                if (name.includes('chat')) suggestions.push('chat');
                if (name.includes('file') || name.includes('upload')) suggestions.push('file-uploader');
                if (name.includes('compare')) suggestions.push('comparison-panel');
                if (name.includes('summar') || name.includes('extract')) suggestions.push('result-viewer');
            }
        }

        return [...new Set(suggestions)];
    });

    /** Collect all data ports from selected composites for scope configuration */
    readonly collectableDataPorts = computed(() => {
        const composites = this.selectedComposites();
        const ports: { 
            portPath: string; 
            label: string; 
            dataType: string; 
            direction: 'input' | 'output' | 'intermediate';
            compositeName: string;
        }[] = [];

        for (const node of composites) {
            const composite = this.getCompositeById(node.compositeWorkflowId);
            if (composite) {
                // Exposed inputs
                for (const input of composite.exposedInputs) {
                    ports.push({
                        portPath: `${node.id}:${input.id}`,
                        label: input.customLabel || input.label || input.id,
                        dataType: input.artifactType,
                        direction: 'input',
                        compositeName: composite.name,
                    });
                }
                // Exposed outputs
                for (const output of composite.exposedOutputs) {
                    ports.push({
                        portPath: `${node.id}:${output.id}`,
                        label: output.customLabel || output.label || output.id,
                        dataType: output.artifactType,
                        direction: 'output',
                        compositeName: composite.name,
                    });
                }
            }
        }

        // Add intermediate ports from edges
        const edges = this.templateEdges();
        for (const edge of edges) {
            ports.push({
                portPath: `${edge.source}:${edge.sourcePort}→${edge.target}:${edge.targetPort}`,
                label: `Connection: ${edge.sourcePort} → ${edge.targetPort}`,
                dataType: 'connection',
                direction: 'intermediate',
                compositeName: 'Edge',
            });
        }

        return ports;
    });

    /** Count of ports by scope */
    readonly scopeCounts = computed(() => {
        const config = this.dataFlowConfig();
        return {
            session: config.inputs.filter(p => p.scope === 'session').length +
                     config.outputs.filter(p => p.scope === 'session').length,
            project: config.inputs.filter(p => p.scope === 'project').length +
                     config.outputs.filter(p => p.scope === 'project').length,
            both: config.inputs.filter(p => p.scope === 'both').length +
                  config.outputs.filter(p => p.scope === 'both').length,
        };
    });

    // ========================================================================
    // LIFECYCLE
    // ========================================================================

    ngOnInit(): void {
        this.initForms();
        this.loadAvailableComposites();
        this.checkEditMode();
    }

    ngOnDestroy(): void {
        this.destroy$.next();
        this.destroy$.complete();
    }

    // ========================================================================
    // INITIALIZATION
    // ========================================================================

    private initForms(): void {
        this.basicInfoForm = this.fb.group({
            name: ['', [Validators.required, Validators.minLength(3)]],
            description: [''],
        });

        this.layoutForm = this.fb.group({
            pattern: ['standalone-single', Validators.required],
            layout: ['standalone-single', Validators.required],
        });

        // Subscribe to form status changes to update validity signals
        this.basicInfoForm.statusChanges.pipe(
            takeUntil(this.destroy$)
        ).subscribe(() => {
            this.basicInfoFormValid.set(this.basicInfoForm.valid);
        });

        this.layoutForm.statusChanges.pipe(
            takeUntil(this.destroy$)
        ).subscribe(() => {
            this.layoutFormValid.set(this.layoutForm.valid);
        });

        // Set initial validity
        this.basicInfoFormValid.set(this.basicInfoForm.valid);
        this.layoutFormValid.set(this.layoutForm.valid);

        // Update layout when pattern changes
        this.layoutForm.get('pattern')?.valueChanges.pipe(
            takeUntil(this.destroy$)
        ).subscribe(pattern => {
            const options = this.getLayoutOptionsForPattern(pattern);
            if (options.length > 0) {
                this.layoutForm.patchValue({ layout: options[0].value });
            }
        });
    }

    private loadAvailableComposites(): void {
        this.isLoading.set(true);
        const refresh = (): void => {
            const published = this.workflowSync.getPublishedWorkflowsAsComposites()
                .filter(c => c.status === WorkflowStatus.PUBLISHED);
            this.availableComposites.set(published);
            this.isLoading.set(false);
        };

        refresh();
        interval(2000).pipe(takeUntil(this.destroy$)).subscribe(() => refresh());
    }

    private checkEditMode(): void {
        const id = this.route.snapshot.paramMap.get('id');
        if (id) {
            this.isEditMode.set(true);
            this.templateId.set(id);
            this.loadExistingTemplate(id);
        }
    }

    private loadExistingTemplate(id: string): void {
        const template = this.store.getTemplateById(id);
        if (template) {
            // Populate forms
            this.basicInfoForm.patchValue({
                name: template.name,
                description: template.description,
            });

            this.layoutForm.patchValue({
                pattern: template.presentationPattern,
                layout: template.uiTemplate.layout,
            });

            this.selectedComposites.set([...template.compositeWorkflows]);
            this.templateEdges.set([...template.edges]);
            this.uiComponents.set([...template.uiTemplate.components]);
            
            // Load data flow config if exists
            if (template.dataFlowConfig) {
                this.dataFlowConfig.set({ ...template.dataFlowConfig });
            } else {
                // Initialize for legacy templates
                this.initializeDataFlowConfig();
            }
        }
    }

    private getLayoutOptionsForPattern(pattern: TemplatePresentationPattern) {
        switch (pattern) {
            case 'standalone-single':
                return [
                    { value: 'standalone-single', label: 'Full Page' },
                    { value: 'chat-with-files', label: 'Chat with Files' },
                ];
            case 'standalone-tabs':
                return [{ value: 'standalone-tabs', label: 'Horizontal Tabs' }];
            case 'linked-integrated':
                return [
                    { value: 'linked-horizontal', label: 'Horizontal Layout' },
                    { value: 'linked-vertical', label: 'Vertical Layout' },
                    { value: 'comparison-view', label: 'Comparison View' },
                    { value: 'dashboard', label: 'Dashboard' },
                ];
            default:
                return [];
        }
    }

    // ========================================================================
    // COMPOSITE MANAGEMENT
    // ========================================================================

    /** Check if a composite is already selected */
    isCompositeSelected(compositeId: string): boolean {
        return this.selectedComposites().some(c => c.compositeWorkflowId === compositeId);
    }

    /** Add composite to template */
    addComposite(composite: CompositeWorkflow): void {
        const existing = this.selectedComposites();
        if (this.isCompositeSelected(composite.id)) {
            this.snackBar.open(
                this.translate.instant('templates.builder.composite_already_added'),
                'OK',
                { duration: 3000 }
            );
            return;
        }

        const node: TemplateWorkflowNode = {
            id: crypto.randomUUID(),
            compositeWorkflowId: composite.id,
            label: composite.name,
            position: { x: existing.length * 200, y: 100 },
        };

        this.selectedComposites.set([...existing, node]);

        // Auto-suggest UI components
        this.autoSuggestUIComponents(composite);
    }

    /** Remove composite from template */
    removeComposite(nodeId: string): void {
        const updated = this.selectedComposites().filter(c => c.id !== nodeId);
        this.selectedComposites.set(updated);

        // Also remove related edges
        const updatedEdges = this.templateEdges().filter(
            e => e.source !== nodeId && e.target !== nodeId
        );
        this.templateEdges.set(updatedEdges);
    }

    /** Handle drag-drop reordering */
    onCompositeDrop(event: CdkDragDrop<TemplateWorkflowNode[]>): void {
        const composites = [...this.selectedComposites()];
        moveItemInArray(composites, event.previousIndex, event.currentIndex);
        this.selectedComposites.set(composites);
    }

    /** Auto-suggest UI components based on composite type */
    private autoSuggestUIComponents(composite: CompositeWorkflow): void {
        const components = [...this.uiComponents()];
        const name = composite.name.toLowerCase();

        // Check what components already exist
        const hasChat = components.some(c => c.type === 'chat');
        const hasFileUploader = components.some(c => c.type === 'file-uploader');

        if (name.includes('chat') && !hasChat) {
            components.push(this.createUIComponent('chat', 'Chat'));
        }

        if ((name.includes('file') || name.includes('upload')) && !hasFileUploader) {
            components.push(this.createUIComponent('file-uploader', 'File Upload'));
        }

        if (name.includes('summar') || name.includes('extract')) {
            components.push(this.createUIComponent('result-viewer', 'Results'));
        }

        if (name.includes('compare')) {
            components.push(this.createUIComponent('comparison-panel', 'Comparison'));
        }

        this.uiComponents.set(components);
    }

    // ========================================================================
    // UI COMPONENT MANAGEMENT
    // ========================================================================

    /** Create a new UI component config */
    private createUIComponent(type: UIComponentType, label: string): UIComponentConfig {
        return {
            id: crypto.randomUUID(),
            type,
            label,
            bindings: [],
            config: {},
        };
    }

    /** Add UI component */
    addUIComponent(type: UIComponentType): void {
        const label = this.componentTypeOptions.find(o => o.value === type)?.label || type;
        const component = this.createUIComponent(type, label);
        this.uiComponents.set([...this.uiComponents(), component]);
    }

    /** Remove UI component */
    removeUIComponent(componentId: string): void {
        const updated = this.uiComponents().filter(c => c.id !== componentId);
        this.uiComponents.set(updated);
    }

    /** Update UI component */
    updateUIComponent(componentId: string, changes: Partial<UIComponentConfig>): void {
        const updated = this.uiComponents().map(c =>
            c.id === componentId ? { ...c, ...changes } : c
        );
        this.uiComponents.set(updated);
    }

    /** Handle UI component drop reordering */
    onUIComponentDrop(event: CdkDragDrop<UIComponentConfig[]>): void {
        const components = [...this.uiComponents()];
        moveItemInArray(components, event.previousIndex, event.currentIndex);
        this.uiComponents.set(components);
    }

    // ========================================================================
    // EDGE MANAGEMENT (for linked templates)
    // ========================================================================

    /** Add edge between composites */
    addEdge(sourceNodeId: string, sourcePort: string, targetNodeId: string, targetPort: string): void {
        const edge: TemplateWorkflowEdge = {
            id: crypto.randomUUID(),
            source: sourceNodeId,
            sourcePort,
            target: targetNodeId,
            targetPort,
        };
        this.templateEdges.set([...this.templateEdges(), edge]);
    }

    /** Remove edge */
    removeEdge(edgeId: string): void {
        const updated = this.templateEdges().filter(e => e.id !== edgeId);
        this.templateEdges.set(updated);
    }

    // ========================================================================
    // STEPPER NAVIGATION
    // ========================================================================

    nextStep(): void {
        if (this.currentStep() < 3) {
            this.currentStep.set(this.currentStep() + 1);
        }
    }

    previousStep(): void {
        if (this.currentStep() > 0) {
            this.currentStep.set(this.currentStep() - 1);
        }
    }

    goToStep(step: number): void {
        this.currentStep.set(step);
    }

    // ========================================================================
    // SAVE & PUBLISH
    // ========================================================================

    /** Show validation error with specific message */
    private showValidationError(): void {
        const message = this.validationMessage();
        
        this.snackBar.open(
            message,
            'OK',
            { duration: 5000, panelClass: 'warning-snackbar' }
        );
    }

    /** Save template as draft */
    saveAsDraft(): void {
        if (!this.canSave()) {
            this.showValidationError();
            return;
        }
        this.saveTemplate(WorkflowStatus.DRAFT);
    }

    /** Save and publish template */
    saveAndPublish(): void {
        if (!this.canSave()) {
            this.showValidationError();
            return;
        }
        this.saveTemplate(WorkflowStatus.PUBLISHED);
    }

    private saveTemplate(status: WorkflowStatus): void {
        this.isSaving.set(true);

        const now = new Date().toISOString();
        const basicInfo = this.basicInfoForm.value;
        const layoutInfo = this.layoutForm.value;

        const template: TemplateWorkflow = {
            id: this.templateId() || crypto.randomUUID(),
            name: basicInfo.name,
            description: basicInfo.description || '',
            status,
            presentationPattern: layoutInfo.pattern,
            compositeWorkflows: this.selectedComposites(),
            edges: this.templateEdges(),
            uiTemplate: {
                layout: layoutInfo.layout,
                components: this.uiComponents(),
            },
            dataFlowConfig: this.dataFlowConfig(),
            permissions: {
                viewers: [],
                executors: [],
                editors: [],
            },
            metadata: {
                createdAt: this.isEditMode() ? (this.store.getTemplateById(this.templateId()!)?.metadata.createdAt || now) : now,
                updatedAt: now,
                createdBy: 'current-user', // TODO: Get from auth service
                version: 1,
            },
        };

        try {
            if (this.isEditMode()) {
                this.store.updateTemplate({ id: template.id, changes: template });
            } else {
                this.store.addTemplate(template);
            }

            this.snackBar.open(
                this.translate.instant(
                    status === WorkflowStatus.PUBLISHED
                        ? 'templates.builder.published_success'
                        : 'templates.builder.saved_success'
                ),
                'OK',
                { duration: 3000 }
            );

            // Navigate back to templates list
            this.router.navigate(['/genai-workflows/templates']);
        } catch (error) {
            console.error('Error saving template:', error);
            this.snackBar.open(
                this.translate.instant('templates.builder.save_error'),
                'OK',
                { duration: 5000, panelClass: 'error-snackbar' }
            );
        } finally {
            this.isSaving.set(false);
        }
    }

    /** Cancel and go back */
    cancel(): void {
        this.router.navigate(['/genai-workflows/templates']);
    }

    // ========================================================================
    // HELPERS
    // ========================================================================

    getCompositeById(id: string): CompositeWorkflow | null {
        return this.availableComposites().find(c => c.id === id)
            ?? this.store.getCompositeById(id);
    }

    getComponentIcon(type: UIComponentType): string {
        return this.componentTypeOptions.find(o => o.value === type)?.icon || 'widgets';
    }

    trackByNodeId(_: number, node: TemplateWorkflowNode): string {
        return node.id;
    }

    trackByComponentId(_: number, component: UIComponentConfig): string {
        return component.id;
    }

    trackByCompositeId(_: number, composite: CompositeWorkflow): string {
        return composite.id;
    }

    // ========================================================================
    // DATA SCOPE MANAGEMENT
    // ========================================================================

    /** Initialize data flow config when composites change */
    initializeDataFlowConfig(): void {
        const ports = this.collectableDataPorts();
        const currentConfig = this.dataFlowConfig();

        const inputs: DataPortScopeConfig[] = [];
        const outputs: DataPortScopeConfig[] = [];
        const intermediates: DataPortScopeConfig[] = [];

        for (const port of ports) {
            // Check if already configured
            const existingInput = currentConfig.inputs.find(p => p.portPath === port.portPath);
            const existingOutput = currentConfig.outputs.find(p => p.portPath === port.portPath);
            const existingIntermediate = currentConfig.intermediates.find(p => p.portPath === port.portPath);

            const config: DataPortScopeConfig = existingInput || existingOutput || existingIntermediate || {
                portPath: port.portPath,
                label: port.label,
                dataType: port.dataType as ArtifactType,
                scope: this.suggestScopeForDataType(port.dataType),
                shareable: port.direction === 'output' && port.dataType !== 'chat_history',
                description: `${port.compositeName}: ${port.label}`,
            };

            if (port.direction === 'input') {
                inputs.push(config);
            } else if (port.direction === 'output') {
                outputs.push(config);
            } else {
                intermediates.push(config);
            }
        }

        this.dataFlowConfig.set({
            ...currentConfig,
            inputs,
            outputs,
            intermediates,
        });
    }

    /** Suggest a default scope based on data type */
    private suggestScopeForDataType(dataType: string): DataScope {
        // Files and documents typically persist at project level
        if (['file', 'collection', 'langchain_documents', 'embedded_langchain_documents'].includes(dataType)) {
            return 'project';
        }
        // Chat and session data typically stays in session
        if (['chat_history', 'user_prompt', 'context'].includes(dataType)) {
            return 'session';
        }
        // Default to session for safety
        return 'session';
    }

    /** Update scope for a specific port */
    updatePortScope(portPath: string, scope: DataScope): void {
        const config = this.dataFlowConfig();
        
        const updateInArray = (arr: DataPortScopeConfig[]): DataPortScopeConfig[] => {
            return arr.map(p => p.portPath === portPath ? { ...p, scope } : p);
        };

        this.dataFlowConfig.set({
            ...config,
            inputs: updateInArray(config.inputs),
            outputs: updateInArray(config.outputs),
            intermediates: updateInArray(config.intermediates),
        });
    }

    /** Update shareable flag for a port */
    updatePortShareable(portPath: string, shareable: boolean): void {
        const config = this.dataFlowConfig();
        
        const updateInArray = (arr: DataPortScopeConfig[]): DataPortScopeConfig[] => {
            return arr.map(p => p.portPath === portPath ? { ...p, shareable } : p);
        };

        this.dataFlowConfig.set({
            ...config,
            inputs: updateInArray(config.inputs),
            outputs: updateInArray(config.outputs),
            intermediates: updateInArray(config.intermediates),
        });
    }

    /** Update storage name for project-scoped port */
    updatePortStorageName(portPath: string, storageName: string): void {
        const config = this.dataFlowConfig();
        
        const updateInArray = (arr: DataPortScopeConfig[]): DataPortScopeConfig[] => {
            return arr.map(p => p.portPath === portPath ? { ...p, storageName } : p);
        };

        this.dataFlowConfig.set({
            ...config,
            inputs: updateInArray(config.inputs),
            outputs: updateInArray(config.outputs),
            intermediates: updateInArray(config.intermediates),
        });
    }

    /** Set default scope for all ports */
    setAllPortsScope(scope: DataScope): void {
        const config = this.dataFlowConfig();
        
        const updateInArray = (arr: DataPortScopeConfig[]): DataPortScopeConfig[] => {
            return arr.map(p => ({ ...p, scope }));
        };

        this.dataFlowConfig.set({
            ...config,
            defaultScope: scope,
            inputs: updateInArray(config.inputs),
            outputs: updateInArray(config.outputs),
            intermediates: updateInArray(config.intermediates),
        });
    }

    /** Toggle data flow visualization */
    toggleDataFlowVisualization(): void {
        const config = this.dataFlowConfig();
        this.dataFlowConfig.set({
            ...config,
            showDataFlowVisualization: !config.showDataFlowVisualization,
        });
    }

    /** Get scope icon for display */
    getScopeIcon(scope: DataScope): string {
        return this.dataScopeOptions.find(o => o.value === scope)?.icon || 'help';
    }

    /** Get scope color for visualization */
    getScopeColor(scope: DataScope): string {
        switch (scope) {
            case 'session': return '#ff9800'; // Orange
            case 'project': return '#4caf50'; // Green
            case 'both': return '#2196f3'; // Blue
            default: return '#9e9e9e';
        }
    }

    /** Get port config by path */
    getPortConfig(portPath: string): DataPortScopeConfig | undefined {
        const config = this.dataFlowConfig();
        return config.inputs.find(p => p.portPath === portPath) ||
               config.outputs.find(p => p.portPath === portPath) ||
               config.intermediates.find(p => p.portPath === portPath);
    }

    trackByPortPath(_: number, port: DataPortScopeConfig): string {
        return port.portPath;
    }
}
