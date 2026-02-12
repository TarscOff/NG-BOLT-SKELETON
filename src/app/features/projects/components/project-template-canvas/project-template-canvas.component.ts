/**
 * Project Template Canvas Component
 *
 * A visual canvas for managing templates within a project.
 * Features:
 * - Drag & drop published templates from palette onto canvas
 * - Drag & drop UI components (chat, compare, etc.) to connect to template ports
 * - Visual nodes showing ports and data scope (session/project)
 * - Actions: view, configure, toggle enable/disable, remove
 */

import {
    Component,
    ChangeDetectionStrategy,
    Input,
    Output,
    EventEmitter,
    inject,
    signal,
    computed,
    OnInit,
    ViewChild,
    DestroyRef,
    HostListener,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule, ReactiveFormsModule, FormControl, FormGroup, FormBuilder } from '@angular/forms';
import { TranslateModule, TranslateService } from '@ngx-translate/core';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatTooltipModule } from '@angular/material/tooltip';
import { MatMenuModule } from '@angular/material/menu';
import { MatDialog, MatDialogModule } from '@angular/material/dialog';
import { MatChipsModule } from '@angular/material/chips';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatSidenavModule } from '@angular/material/sidenav';
import { CdkDragDrop, CdkDropList, DragDropModule } from '@angular/cdk/drag-drop';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { firstValueFrom, debounceTime } from 'rxjs';

// ng-draw-flow
import {
    DfDataModel,
    DfDataInitialNode,
    DfDataConnection,
    NgDrawFlowComponent,
    provideNgDrawFlowConfigs,
    DfArrowhead,
    DfConnectionType,
    dfPanZoomOptionsProvider,
    DfEvent,
    DfConnectionPoint,
} from '@ng-draw-flow/core';

// Store and services
import { TemplateWorkflowsStore } from '@features/workflows/templates/data/template-workflows.store';
import {
    TemplateWorkflow,
    DataPortScopeConfig,
    ExposedHandle,
    UIComponentConfig,
    TemplateLayoutType,
} from '@features/workflows/templates/interfaces/template-workflow.interface';
import { TemplateAssignment, PortDataScopeConfig, DataScope } from '@shared/types/workflow.types';
import { ToastService, FieldConfigService } from '@cadai/pxs-ng-core/services';
import { ConfirmDialogComponent, DynamicFormComponent } from '@cadai/pxs-ng-core/shared';
import { ConfirmDialogData, FieldConfig } from '@cadai/pxs-ng-core/interfaces';

// Node components
import { ProjectTemplateNodeComponent } from './project-template-node.component';
import {
    ProjectUINodeComponent,
    UIComponentType,
    getProjectUiPorts,
} from './project-ui-node.component';

// ============================================================================
// INTERFACES
// ============================================================================

/** Palette item for drag-drop */
export interface PaletteItem {
    type: 'template' | 'ui-component';
    label: string;
    icon: string;
    category: 'templates' | 'ui';
    templateId?: string;
    uiType?: UIComponentType;
    description?: string;
    nodeRenderType: string;
}

interface CanvasUiNodeState {
    id: string;
    type: UIComponentType;
    position: { x: number; y: number };
}

interface CanvasConnectionState {
    sourceNodeId: string;
    sourceConnectorId: string;
    targetNodeId: string;
    targetConnectorId: string;
}

interface ProjectCanvasConfiguration {
    uiNodes: CanvasUiNodeState[];
    connections: CanvasConnectionState[];
    viewMode?: 'single' | 'tabs';
}

// ============================================================================
// COMPONENT
// ============================================================================

@Component({
    selector: 'app-project-template-canvas',
    standalone: true,
    imports: [
        CommonModule,
        FormsModule,
        ReactiveFormsModule,
        TranslateModule,
        MatButtonModule,
        MatIconModule,
        MatTooltipModule,
        MatMenuModule,
        MatDialogModule,
        MatChipsModule,
        MatProgressSpinnerModule,
        MatSidenavModule,
        DragDropModule,
        NgDrawFlowComponent,
        DynamicFormComponent,
    ],
    providers: [
        dfPanZoomOptionsProvider({
            panSize: 20000,
        }),
        provideNgDrawFlowConfigs({
            nodes: {
                'project-template': ProjectTemplateNodeComponent,
                'project-ui': ProjectUINodeComponent,
            },
            connection: {
                type: DfConnectionType.SmoothStep,
                arrowhead: { type: DfArrowhead.ArrowClosed, height: 8, width: 8 },
                curvature: 10,
            },
        }),
    ],
    template: `
        <mat-sidenav-container class="project-canvas-container" (backdropClick)="showPalette.set(false)">
            <!-- Palette Sidenav -->
            <mat-sidenav
                class="palette-sidenav"
                position="start"
                mode="side"
                [opened]="showPalette() && !isLoading()"
                cdkDropList
                #paletteList="cdkDropList"
                [cdkDropListConnectedTo]="[canvasList]"
                [cdkDropListSortingDisabled]="true"
                [cdkDropListData]="[]">

                <!-- Palette Header -->
                <div class="palette-header">
                    <h3>
                        <mat-icon>widgets</mat-icon>
                        {{ 'templates.project_canvas.toolbox' | translate }}
                    </h3>
                    <div class="palette-search">
                        <app-dynamic-form [config]="paletteFieldConfig" [form]="paletteForm"></app-dynamic-form>
                    </div>
                </div>

                <div class="palette-items">
                    <!-- Templates Section -->
                    <div class="palette-section">
                        <div class="palette-section-title">
                            <mat-icon>dashboard_customize</mat-icon>
                            {{ 'templates.project_canvas.available_templates' | translate }}
                        </div>
                        @if (filteredTemplates().length) {
                            @for (item of filteredTemplates(); track item.templateId) {
                                <button mat-flat-button
                                        class="palette-pill template"
                                        cdkDrag
                                        [cdkDragData]="item"
                                        [cdkDragDisabled]="isLoading()"
                                        [disabled]="isLoading()"
                                        (cdkDragStarted)="isPaletteDragging.set(true)"
                                        (cdkDragEnded)="isPaletteDragging.set(false)">
                                    <mat-icon>{{ item.icon }}</mat-icon>
                                    <span class="pill-label">{{ item.label }}</span>
                                    <ng-template cdkDragPreview [matchSize]="true">
                                        <div class="palette-pill preview-shadow template">
                                            <mat-icon>{{ item.icon }}</mat-icon>
                                            <span class="pill-label">{{ item.label }}</span>
                                        </div>
                                    </ng-template>
                                    <ng-template cdkDragPlaceholder>
                                        <button mat-flat-button class="palette-pill placeholder" disabled>
                                            <mat-icon>{{ item.icon }}</mat-icon>
                                            <span class="pill-label">{{ item.label }}</span>
                                        </button>
                                    </ng-template>
                                </button>
                            }
                        } @else {
                            <div class="palette-empty">
                                <mat-icon>info</mat-icon>
                                <span>{{ 'templates.project_canvas.no_templates' | translate }}</span>
                            </div>
                        }
                    </div>

                    <!-- UI Components Section -->
                    <div class="palette-section">
                        <div class="palette-section-title">
                            <mat-icon>web</mat-icon>
                            {{ 'templates.project_canvas.ui_components' | translate }}
                        </div>
                        @for (item of uiComponentItems; track item.uiType) {
                            <button mat-flat-button
                                    class="palette-pill ui-component"
                                    cdkDrag
                                    [cdkDragData]="item"
                                    [cdkDragDisabled]="isLoading()"
                                    [disabled]="isLoading()"
                                    (cdkDragStarted)="isPaletteDragging.set(true)"
                                    (cdkDragEnded)="isPaletteDragging.set(false)">
                                <mat-icon>{{ item.icon }}</mat-icon>
                                <span class="pill-label">{{ item.label }}</span>
                                <ng-template cdkDragPreview [matchSize]="true">
                                    <div class="palette-pill preview-shadow ui-component">
                                        <mat-icon>{{ item.icon }}</mat-icon>
                                        <span class="pill-label">{{ item.label }}</span>
                                    </div>
                                </ng-template>
                                <ng-template cdkDragPlaceholder>
                                    <button mat-flat-button class="palette-pill placeholder" disabled>
                                        <mat-icon>{{ item.icon }}</mat-icon>
                                        <span class="pill-label">{{ item.label }}</span>
                                    </button>
                                </ng-template>
                            </button>
                        }
                    </div>
                </div>

                <!-- Legend -->
                <div class="palette-legend">
                    <div class="legend-title">{{ 'templates.canvas.legend' | translate }}</div>
                    <div class="legend-item">
                        <div class="legend-color template"></div>
                        <span>{{ 'templates.project_canvas.template_node' | translate }}</span>
                    </div>
                    <div class="legend-item">
                        <div class="legend-color ui-component"></div>
                        <span>{{ 'templates.project_canvas.ui_node' | translate }}</span>
                    </div>
                    <div class="legend-item">
                        <div class="legend-color session"></div>
                        <span>{{ 'templates.canvas.session_scope' | translate }}</span>
                    </div>
                    <div class="legend-item">
                        <div class="legend-color project"></div>
                        <span>{{ 'templates.canvas.project_scope' | translate }}</span>
                    </div>
                </div>
            </mat-sidenav>

            <!-- Canvas Content Area -->
            <mat-sidenav-content class="canvas-pane">
                <!-- Canvas Actions Bar -->
                @if (!isLoading()) {
                    <div class="canvas-pane_actions">
                        <button mat-fab extended
                                class="palette-toggle"
                                color="primary"
                                (click)="togglePalette()"
                                [disabled]="isLoading()"
                                [attr.aria-expanded]="showPalette()">
                            <mat-icon>{{ showPalette() ? 'close' : 'apps' }}</mat-icon>
                            {{ 'toolbox' | translate }}
                        </button>

                        <div class="canvas-info">
                            <span class="template-count">
                                {{ templateAssignments().length }} {{ 'templates.assigned' | translate }}
                            </span>
                            <span class="ui-count">
                                {{ uiNodeCount() }} {{ 'templates.project_canvas.ui_components' | translate }}
                            </span>
                        </div>

                        <div class="view-mode-switch">
                            <button mat-stroked-button
                                    [class.active]="viewMode() === 'single'"
                                    (click)="setViewMode('single')">
                                <mat-icon>web_asset</mat-icon>
                                Single Page
                            </button>
                            <button mat-stroked-button
                                    [class.active]="viewMode() === 'tabs'"
                                    (click)="setViewMode('tabs')">
                                <mat-icon>tab</mat-icon>
                                Tabs
                            </button>
                        </div>

                        <button mat-icon-button
                                color="primary"
                                (click)="resetView()"
                                [matTooltip]="'templates.canvas.reset_view' | translate">
                            <mat-icon>fit_screen</mat-icon>
                        </button>
                    </div>
                }

                <!-- Loading State -->
                @if (isLoading()) {
                    <div class="loading-overlay">
                        <div class="loading-content">
                            <mat-spinner diameter="48"></mat-spinner>
                            <span>{{ 'common.loading' | translate }}</span>
                        </div>
                    </div>
                } @else {
                    <!-- Canvas Wrapper with ng-draw-flow -->
                    <div class="canvas-wrap">
                        <ng-draw-flow
                            #flowRef
                            class="project-canvas"
                            [formControl]="flowControl"
                            (connectionCreated)="onConnectionCreated($event)"
                            (connectionDeleted)="onConnectionDeleted($event)"
                            (nodeDeleted)="onNodeDeleted($event)"
                            cdkDropList
                            #canvasList="cdkDropList"
                            [cdkDropListConnectedTo]="[paletteList]"
                            [cdkDropListData]="{}"
                            (cdkDropListDropped)="onDrop($any($event))">
                        </ng-draw-flow>

                        <!-- Empty State Hint -->
                        @if (isCanvasEmpty()) {
                            <div class="empty-canvas-hint">
                                <mat-icon>dashboard_customize</mat-icon>
                                <h3>{{ 'templates.project_canvas.drag_hint_title' | translate }}</h3>
                                <p>{{ 'templates.project_canvas.drag_hint_desc' | translate }}</p>
                            </div>
                        }
                    </div>
                }
            </mat-sidenav-content>
        </mat-sidenav-container>
    `,
    styles: [`
        :host {
            display: block;
            height: 100%;
            min-height: 640px;
            min-width: 0;
        }

        .project-canvas-container {
            height: 100%;
            min-height: 640px;
            background: transparent;

            ::ng-deep .mat-drawer-container {
                background: transparent;
            }

            ::ng-deep .mat-drawer-content {
                overflow: hidden;
            }
        }

        .palette-sidenav {
            width: 300px;

            ::ng-deep .mat-drawer-inner-container {
                display: flex;
                flex-direction: column;
                overflow: hidden;
            }
        }

        .palette-header {
            padding: 12px;
            display: flex;
            flex-direction: column;
            gap: 6px;
            border-bottom: 1px solid color-mix(in srgb, var(--mat-neutral) 20%, transparent);
            background: inherit;

            h3 {
                display: flex;
                align-items: center;
                gap: 8px;
                margin: 0;
                font-size: 14px;
                font-weight: 600;
                color: var(--mat-primary);

                mat-icon {
                    font-size: 20px;
                }
            }
        }

        .palette-search {
            ::ng-deep {
                .mat-mdc-form-field {
                    width: 100%;
                }

                .mdc-text-field {
                    background: transparent;
                }
            }
        }

        .palette-items {
            display: flex;
            flex-direction: column;
            gap: 6px;
            padding: 8px;
            overflow-y: auto;
            overflow-x: hidden;
            flex: 1 1 auto;
            min-height: 0;
        }

        .palette-section {
            display: flex;
            flex-direction: column;
            gap: 8px;
            padding: 8px;
        }

        .palette-section-title {
            display: flex;
            align-items: center;
            gap: 8px;
            font-size: 11px;
            font-weight: 700;
            letter-spacing: 0.3px;
            text-transform: uppercase;
            color: color-mix(in srgb, var(--mat-primary) 60%, #000);
            margin-top: 8px;
            margin-bottom: 4px;

            mat-icon {
                font-size: 16px;
                width: 16px;
                height: 16px;
            }
        }

        .palette-section:first-child .palette-section-title {
            margin-top: 0;
        }

        .palette-pill {
            display: flex;
            align-items: center;
            justify-content: flex-start;
            min-height: 45px;
            gap: 8px;
            border-radius: 8px;
            padding: 12px;
            transition: all 0.2s ease;

            mat-icon {
                margin-left: 8px;
            }

            &.template {
                background: var(--mat-primary);
                border: var(--mat-primary);

                &:hover {
                    background: var(--mat-primary);
                    filter: brightness(1.1);
                }
            }

            &.ui-component {
                background: var(--mat-accent);
                border: var(--mat-accent);

                &:hover {
                    background: var(--mat-accent);
                    filter: brightness(1.1);
                }
            }

            &.placeholder {
                pointer-events: none;
            }

            &.preview-shadow {
                opacity: 0.9;
                display: flex;
                align-items: center;
                gap: 8px;
                padding: 8px;
                border-radius: 10px;
                width: 70px !important;
                height: 70px !important;
                flex-direction: column;
                justify-content: center;

                mat-icon {
                    font-size: 32px;
                    width: 32px;
                    height: 32px;
                    margin-left: 0;
                }

                .pill-label {
                    font-size: 10px;
                    text-align: center;
                }
            }

            .pill-label {
                flex: 1;
                text-align: left;
                white-space: nowrap;
                overflow: hidden;
                text-overflow: ellipsis;
            }
        }

        .cdk-drag-placeholder {
            opacity: 1 !important;
        }

        .palette-empty {
            display: flex;
            align-items: center;
            gap: 6px;
            padding: 8px 10px;
            border-radius: 8px;
            font-size: 12px;

            mat-icon {
                font-size: 18px;
                width: 18px;
                height: 18px;
            }
        }

        .palette-legend {
            padding: 12px;
            border-top: 1px solid color-mix(in srgb, var(--mat-neutral) 15%, transparent);
            margin-top: auto;

            .legend-title {
                font-size: 11px;
                font-weight: 700;
                text-transform: uppercase;
                color: var(--mat-on-surface-variant);
                margin-bottom: 8px;
            }

            .legend-item {
                display: flex;
                align-items: center;
                gap: 8px;
                font-size: 12px;
                margin-bottom: 4px;

                .legend-color {
                    width: 12px;
                    height: 12px;
                    border-radius: 3px;

                    &.template { background: var(--mat-primary); }
                    &.ui-component { background: var(--mat-accent); }
                    &.session { background: #ff9800; }
                    &.project { background: #4caf50; }
                }
            }
        }

        .canvas-pane {
            position: absolute;
            display: flex;
            flex-direction: column;
            height: 100%;
            min-height: 0;
            overflow: hidden;
            width: 100%;
        }

        .canvas-pane_actions {
            display: flex;
            flex-direction: row;
            align-items: center;
            justify-content: start;
            flex-wrap: wrap;
            gap: 12px;
            margin-bottom: 12px;
            padding: 10px 12px;

            .canvas-info {
                flex: 1;
                display: flex;
                gap: 16px;

                span {
                    font-size: 13px;
                    color: var(--mat-on-surface-variant);
                    background: color-mix(in srgb, var(--mat-neutral) 10%, transparent);
                    padding: 4px 10px;
                    border-radius: 12px;
                }
            }

            .view-mode-switch {
                display: flex;
                align-items: center;
                gap: 8px;

                button {
                    height: 36px;
                    font-size: 12px;
                    border-radius: 10px;

                    &.active {
                        background: color-mix(in srgb, var(--mat-primary) 15%, transparent);
                        border-color: color-mix(in srgb, var(--mat-primary) 45%, #fff);
                    }
                }
            }
        }

        .palette-toggle {
            z-index: 1000;
            background-color: var(--mat-primary);
            color: #fff;
            height: 40px;
            border-radius: var(--mdc-filled-button-container-shape);
        }

        .canvas-wrap {
            position: relative;
            flex: 1;
            min-height: 0;

            ng-draw-flow {
                position: absolute;
                inset: 0;
                width: 99%;
                height: 98%;
                display: block;
                border: 2px solid color-mix(in srgb, var(--mat-neutral) 60%, #fff);
                border-radius: 8px;
            }
        }

        .loading-overlay {
            flex: 1;
            display: flex;
            align-items: center;
            justify-content: center;

            .loading-content {
                display: flex;
                flex-direction: column;
                align-items: center;
                gap: 16px;
                color: var(--mat-on-surface-variant);
            }
        }

        .empty-canvas-hint {
            position: absolute;
            top: 50%;
            left: 50%;
            transform: translate(-50%, -50%);
            display: flex;
            flex-direction: column;
            align-items: center;
            gap: 12px;
            text-align: center;
            color: var(--mat-on-surface-variant);
            pointer-events: none;

            mat-icon {
                font-size: 64px;
                width: 64px;
                height: 64px;
            }

            h3 {
                margin: 0;
                font-size: 18px;
                color: var(--mat-on-surface);
            }

            p {
                margin: 0;
                max-width: 400px;
            }
        }
    `],
    changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ProjectTemplateCanvasComponent implements OnInit {
    @Input({ required: true }) projectId!: string;
    @Input() projectName?: string;

    @Output() templateAssigned = new EventEmitter<TemplateAssignment>();
    @Output() templateRemoved = new EventEmitter<string>();
    @Output() templateToggled = new EventEmitter<{ assignmentId: string; enabled: boolean }>();
    @Output() navigateToTemplate = new EventEmitter<string>();

    @ViewChild('flowRef') drawFlowRef?: NgDrawFlowComponent;
    @ViewChild('paletteList') paletteList!: CdkDropList;
    @ViewChild('canvasList') canvasList!: CdkDropList;

    // Services
    private readonly dialog = inject(MatDialog);
    private readonly toast = inject(ToastService);
    private readonly translateService = inject(TranslateService);
    private readonly templateWorkflowsStore = inject(TemplateWorkflowsStore);
    private readonly destroyRef = inject(DestroyRef);
    private readonly fb = inject(FormBuilder);
    private readonly fieldsService = inject(FieldConfigService);

    // State
    readonly isLoading = signal(true);
    readonly showPalette = signal(false);
    readonly isPaletteDragging = signal(false);
    readonly paletteFilter = signal('');
    readonly viewMode = signal<'single' | 'tabs'>('single');

    readonly templateAssignments = signal<TemplateAssignment[]>([]);
    readonly availableTemplates = signal<TemplateWorkflow[]>([]);

    // Track UI nodes separately
    private readonly _uiNodes = signal<{ id: string; type: UIComponentType; position: { x: number; y: number } }[]>([]);
    private readonly _canvasConnections = signal<DfDataConnection[]>([]);

    // Computed
    readonly uiNodeCount = computed(() => this._uiNodes().length);

    readonly isCanvasEmpty = computed(() =>
        this.templateAssignments().length === 0 && this._uiNodes().length === 0
    );

    // Palette items for templates
    readonly templatePaletteItems = computed<PaletteItem[]>(() => {
        const assigned = this.templateAssignments().map(a => a.templateId);
        return this.availableTemplates()
            .filter(t => !assigned.includes(t.id))
            .map(t => ({
                type: 'template' as const,
                label: t.name,
                icon: 'dashboard_customize',
                category: 'templates' as const,
                templateId: t.id,
                description: t.description,
                nodeRenderType: 'project-template',
            }));
    });

    readonly filteredTemplates = computed(() => {
        const filter = this.paletteFilter().toLowerCase().trim();
        if (!filter) return this.templatePaletteItems();
        return this.templatePaletteItems().filter(
            item => item.label.toLowerCase().includes(filter) ||
                item.description?.toLowerCase().includes(filter)
        );
    });

    // UI Component palette items
    readonly uiComponentItems: PaletteItem[] = [
        { type: 'ui-component', label: 'Chat', icon: 'chat', category: 'ui', uiType: 'chat', description: 'Chat component with history, user query and file bindings', nodeRenderType: 'project-ui' },
        { type: 'ui-component', label: 'Two Files', icon: 'compare', category: 'ui', uiType: 'compare', description: 'Compare UI: requires two file bindings (File A + File B)', nodeRenderType: 'project-ui' },
        { type: 'ui-component', label: 'One File Upload', icon: 'summarize', category: 'ui', uiType: 'summarize', description: 'Summarize UI: requires source file binding', nodeRenderType: 'project-ui' },
        { type: 'ui-component', label: 'Result View', icon: 'analytics', category: 'ui', uiType: 'result-view', description: 'Dynamic result view for compare/summarize/extract/chat outputs', nodeRenderType: 'project-ui' },
        { type: 'ui-component', label: 'Markdown', icon: 'article', category: 'ui', uiType: 'markdown', description: 'Render bound markdown/text content', nodeRenderType: 'project-ui' },
    ];

    // Forms
    paletteForm!: FormGroup;
    paletteFieldConfig: FieldConfig[] = [];

    // FormControl for ng-draw-flow
    readonly flowControl = new FormControl<DfDataModel>({ nodes: [], connections: [] });

    // Listen for node action events from child nodes
    @HostListener('document:nodeAction', ['$event'])
    onNodeAction(event: Event): void {
        const customEvent = event as CustomEvent<{ action: string; assignmentId?: string; nodeId?: string }>;
        const { action, assignmentId, nodeId } = customEvent.detail;

        if (assignmentId) {
            const assignment = this.templateAssignments().find(a => a.id === assignmentId);
            if (!assignment) return;

            switch (action) {
                case 'configure':
                    this.openConfigureDialog(assignment);
                    break;
                case 'toggle':
                    this.toggleTemplateEnabled(assignment);
                    break;
                case 'remove':
                    this.removeTemplate(assignment);
                    break;
            }
        } else if (nodeId && action === 'remove') {
            this.removeUINode(nodeId);
        }
    }

    ngOnInit(): void {
        this.initPaletteForm();
        this.loadData();
    }

    private initPaletteForm(): void {
        // Create form first
        this.paletteForm = this.fb.group({
            search: [''],
        });

        // Then create field config that references the form field
        this.paletteFieldConfig = [
            this.fieldsService.getTextField({
                name: 'search',
                label: 'common.search',
                placeholder: 'templates.project_canvas.search_placeholder',
                color: 'primary',
                required: false,
            }),
        ];

        // Subscribe to value changes with debounce
        this.paletteForm.get('search')?.valueChanges
            .pipe(
                debounceTime(150),
                takeUntilDestroyed(this.destroyRef)
            )
            .subscribe(value => {
                this.paletteFilter.set(value ?? '');
            });
    }

    private loadData(): void {
        this.isLoading.set(true);

        // Subscribe to published templates
        this.templateWorkflowsStore.publishedTemplates$
            .pipe(takeUntilDestroyed(this.destroyRef))
            .subscribe(templates => {
                this.availableTemplates.set(templates);
                this.repairAssignmentPortScopes(this.templateAssignments());
                this.updateCanvasModel();
            });

        // Subscribe to template assignments for this project
        this.templateWorkflowsStore.selectAssignmentsByProject(this.projectId)
            .pipe(takeUntilDestroyed(this.destroyRef))
            .subscribe(assignments => {
                this.templateAssignments.set(assignments);
                this.repairAssignmentPortScopes(assignments);
                this.restoreCanvasStateFromAssignments(assignments);
                this.updateCanvasModel();
                this.isLoading.set(false);
            });
    }

    private updateCanvasModel(): void {
        const assignments = this.templateAssignments();
        const templates = this.availableTemplates();
        const uiNodes = this._uiNodes();
        const currentModel = this.flowControl.value;
        const sourceConnections = this._canvasConnections();
        const assignmentEnabledById = new Map(assignments.map(assignment => [assignment.id, !!assignment.enabled]));
        const linkedTemplateIdsByUiNode = this.collectLinkedTemplateIdsByUiNode(sourceConnections);

        // Get current node positions to preserve them
        const nodePositions: Record<string, { x: number; y: number }> = {};
        currentModel?.nodes?.forEach(node => {
            if ('position' in node && node.position) {
                nodePositions[node.id] = node.position;
            }
        });

        const nodes: DfDataInitialNode[] = [];
        const connections: DfDataConnection[] = [];
        const nodeInputPortIds = new Map<string, Set<string>>();
        const nodeOutputPortIds = new Map<string, Set<string>>();

        // Create nodes for each assigned template
        assignments.forEach((assignment, index) => {
            const template = templates.find(t => t.id === assignment.templateId);
            // Use saved position or calculate default
            const defaultX = 100 + (index % 3) * 350;
            const defaultY = 100 + Math.floor(index / 3) * 300;
            const position = nodePositions[assignment.id] ?? { x: defaultX, y: defaultY };

            const resolvedPorts = template
                ? this.resolveTemplatePorts(template)
                : { inputs: [], outputs: [] };

            nodeInputPortIds.set(
                assignment.id,
                new Set(resolvedPorts.inputs.map(p => this.templateInputConnectorId(p.portPath)))
            );
            nodeOutputPortIds.set(
                assignment.id,
                new Set(resolvedPorts.outputs.map(p => this.templateOutputConnectorId(p.portPath)))
            );

            nodes.push({
                id: assignment.id,
                position,
                data: {
                    type: 'project-template',
                    assignmentId: assignment.id,
                    templateId: assignment.templateId,
                    templateName: assignment.templateName ?? template?.name ?? 'Template',
                    enabled: assignment.enabled,
                    template: template,
                    exposedInputs: resolvedPorts.inputs,
                    exposedOutputs: resolvedPorts.outputs,
                    description: template?.description ?? '',
                    portDataScopes: assignment.portDataScopes,
                },
            } as DfDataInitialNode);
        });

        // Create nodes for UI components
        uiNodes.forEach(uiNode => {
            const uiItem = this.uiComponentItems.find(i => i.uiType === uiNode.type);
            // Use saved position from canvas if moved, or original position
            const position = nodePositions[uiNode.id] ?? uiNode.position;
            const uiPorts = getProjectUiPorts(uiNode.type);
            nodes.push({
                id: uiNode.id,
                position,
                data: {
                    type: 'project-ui',
                    uiType: uiNode.type,
                    label: uiItem?.label ?? uiNode.type,
                    icon: uiItem?.icon ?? 'web',
                    description: uiItem?.description ?? '',
                    disabled: this.isUiNodeDisabled(
                        uiNode.id,
                        linkedTemplateIdsByUiNode,
                        assignmentEnabledById
                    ),
                },
            } as DfDataInitialNode);
            nodeInputPortIds.set(
                uiNode.id,
                new Set(uiPorts.inputs.map(port => this.uiInputConnectorId(port.id)))
            );
            nodeOutputPortIds.set(
                uiNode.id,
                new Set(uiPorts.outputs.map(port => this.uiOutputConnectorId(port.id)))
            );
        });

        if (sourceConnections?.length) {
            const validNodeIds = new Set(nodes.map(n => n.id));
            const uniqueConnections = new Map<string, DfDataConnection>();
            const validConnections = sourceConnections.filter(
                conn =>
                    !!conn &&
                    !!conn.source &&
                    !!conn.target &&
                    !!conn.source.nodeId &&
                    !!conn.source.connectorId &&
                    !!conn.target.nodeId &&
                    !!conn.target.connectorId &&
                    validNodeIds.has(conn.source.nodeId) &&
                    validNodeIds.has(conn.target.nodeId) &&
                    (nodeOutputPortIds.get(conn.source.nodeId)?.has(conn.source.connectorId) ?? false) &&
                    (nodeInputPortIds.get(conn.target.nodeId)?.has(conn.target.connectorId) ?? false) &&
                    this.isTemplateUiConnection(conn)
            );
            for (const connection of validConnections) {
                const key = this.connectionKey(connection);
                if (!uniqueConnections.has(key)) {
                    uniqueConnections.set(key, connection);
                }
            }
            connections.push(...uniqueConnections.values());
        }

        const canonicalConnections = connections.map(connection => ({
            source: {
                nodeId: connection.source.nodeId,
                connectorType: connection.source.connectorType,
                connectorId: connection.source.connectorId,
            },
            target: {
                nodeId: connection.target.nodeId,
                connectorType: connection.target.connectorType,
                connectorId: connection.target.connectorId,
            },
        })) as DfDataConnection[];

        this._canvasConnections.set(canonicalConnections);
        this.flowControl.setValue({ nodes, connections: canonicalConnections });
    }

    private connectionKey(connection: DfDataConnection): string {
        return [
            connection.source?.nodeId,
            connection.source?.connectorId,
            connection.target?.nodeId,
            connection.target?.connectorId,
        ].join('|');
    }

    private isTemplateNode(nodeId: string): boolean {
        return this.templateAssignments().some(assignment => assignment.id === nodeId);
    }

    private isUiNode(nodeId: string): boolean {
        return this._uiNodes().some(node => node.id === nodeId);
    }

    private isCanvasConnectionPatternValid(connection: DfDataConnection): boolean {
        if (!this.isTemplateUiConnection(connection)) {
            return false;
        }

        const sourceNodeId = connection.source?.nodeId;
        const targetNodeId = connection.target?.nodeId;
        if (!sourceNodeId || !targetNodeId) return false;
        const templateToUi = this.isTemplateNode(sourceNodeId) && this.isUiNode(targetNodeId);
        const templateNodeId = templateToUi ? sourceNodeId : targetNodeId;
        return this.isTemplateAssignmentEnabled(templateNodeId);
    }

    private isTemplateUiConnection(connection: DfDataConnection): boolean {
        const sourceNodeId = connection.source?.nodeId;
        const targetNodeId = connection.target?.nodeId;
        if (!sourceNodeId || !targetNodeId) return false;

        const templateToUi = this.isTemplateNode(sourceNodeId) && this.isUiNode(targetNodeId);
        const uiToTemplate = this.isUiNode(sourceNodeId) && this.isTemplateNode(targetNodeId);

        return templateToUi || uiToTemplate;
    }

    private isTemplateAssignmentEnabled(nodeId: string): boolean {
        const assignment = this.templateAssignments().find(item => item.id === nodeId);
        return !!assignment?.enabled;
    }

    private collectLinkedTemplateIdsByUiNode(
        connections: DfDataConnection[]
    ): Map<string, Set<string>> {
        const linkedTemplateIdsByUiNode = new Map<string, Set<string>>();

        for (const connection of connections ?? []) {
            const sourceNodeId = connection.source?.nodeId;
            const targetNodeId = connection.target?.nodeId;
            if (!sourceNodeId || !targetNodeId) continue;

            if (!this.isTemplateUiConnection(connection)) {
                continue;
            }

            let uiNodeId: string;
            let templateNodeId: string;

            if (this.isTemplateNode(sourceNodeId) && this.isUiNode(targetNodeId)) {
                templateNodeId = sourceNodeId;
                uiNodeId = targetNodeId;
            } else if (this.isUiNode(sourceNodeId) && this.isTemplateNode(targetNodeId)) {
                templateNodeId = targetNodeId;
                uiNodeId = sourceNodeId;
            } else {
                continue;
            }

            const linkedTemplateIds = linkedTemplateIdsByUiNode.get(uiNodeId) ?? new Set<string>();
            linkedTemplateIds.add(templateNodeId);
            linkedTemplateIdsByUiNode.set(uiNodeId, linkedTemplateIds);
        }

        return linkedTemplateIdsByUiNode;
    }

    private isUiNodeDisabled(
        uiNodeId: string,
        linkedTemplateIdsByUiNode: Map<string, Set<string>>,
        assignmentEnabledById: Map<string, boolean>
    ): boolean {
        const linkedTemplateIds = linkedTemplateIdsByUiNode.get(uiNodeId);
        if (!linkedTemplateIds?.size) {
            return false;
        }

        // Shared UI nodes stay active; only disable when a single parent template is connected and disabled.
        if (linkedTemplateIds.size !== 1) {
            return false;
        }

        const [templateNodeId] = [...linkedTemplateIds];
        return assignmentEnabledById.get(templateNodeId) === false;
    }

    private uiInputConnectorId(portId: string): string {
        return `ui-in::${portId}`;
    }

    private uiOutputConnectorId(portId: string): string {
        return `ui-out::${portId}`;
    }

    private parseTemplateInputPortPath(connectorId: string): string {
        return connectorId.startsWith('in::') ? connectorId.slice(4) : connectorId;
    }

    private parseTemplateOutputPortPath(connectorId: string): string {
        return connectorId.startsWith('out::') ? connectorId.slice(5) : connectorId;
    }

    private parseUiInputPortId(connectorId: string): string {
        return connectorId.startsWith('ui-in::') ? connectorId.slice(7) : connectorId;
    }

    private parseUiOutputPortId(connectorId: string): string {
        return connectorId.startsWith('ui-out::') ? connectorId.slice(8) : connectorId;
    }

    private restoreCanvasStateFromAssignments(assignments: TemplateAssignment[]): void {
        const uiNodesById = new Map<string, CanvasUiNodeState>();
        const connectionsByKey = new Map<string, DfDataConnection>();
        let restoredViewMode: 'single' | 'tabs' | null = null;

        for (const assignment of assignments) {
            const canvasConfig = this.readProjectCanvasConfiguration(assignment);
            if (!canvasConfig) continue;
            if (!restoredViewMode && canvasConfig.viewMode) {
                restoredViewMode = canvasConfig.viewMode;
            }

            for (const uiNode of canvasConfig.uiNodes) {
                if (!uiNodesById.has(uiNode.id)) {
                    uiNodesById.set(uiNode.id, uiNode);
                }
            }

            for (const connection of canvasConfig.connections) {
                const normalized: DfDataConnection = {
                    source: {
                        nodeId: connection.sourceNodeId,
                        connectorId: connection.sourceConnectorId,
                        connectorType: DfConnectionPoint.Output,
                    },
                    target: {
                        nodeId: connection.targetNodeId,
                        connectorId: connection.targetConnectorId,
                        connectorType: DfConnectionPoint.Input,
                    },
                };
                const key = this.connectionKey(normalized);
                if (!connectionsByKey.has(key)) {
                    connectionsByKey.set(key, normalized);
                }
            }
        }

        this._uiNodes.set([...uiNodesById.values()]);
        this._canvasConnections.set([...connectionsByKey.values()]);
        if (restoredViewMode) {
            this.viewMode.set(restoredViewMode);
        }
    }

    private readProjectCanvasConfiguration(assignment: TemplateAssignment): ProjectCanvasConfiguration | null {
        const configuration = assignment.configuration;
        if (!configuration || typeof configuration !== 'object') return null;
        const record = configuration as Record<string, unknown>;
        const projectCanvas = record['projectCanvas'];
        if (!projectCanvas || typeof projectCanvas !== 'object') return null;
        const canvasRecord = projectCanvas as Record<string, unknown>;

        const rawNodes = Array.isArray(canvasRecord['uiNodes']) ? canvasRecord['uiNodes'] : [];
        const rawConnections = Array.isArray(canvasRecord['connections']) ? canvasRecord['connections'] : [];
        const viewMode = canvasRecord['viewMode'] === 'tabs' ? 'tabs' : 'single';

        const uiNodes: CanvasUiNodeState[] = rawNodes
            .map(raw => {
                if (!raw || typeof raw !== 'object') return null;
                const node = raw as Record<string, unknown>;
                const id = typeof node['id'] === 'string' ? node['id'] : null;
                const type = typeof node['type'] === 'string' ? node['type'] as UIComponentType : null;
                const position = node['position'] as Record<string, unknown> | undefined;
                const x = typeof position?.['x'] === 'number' ? position['x'] : null;
                const y = typeof position?.['y'] === 'number' ? position['y'] : null;
                if (!id || !type || x === null || y === null) return null;
                return { id, type, position: { x, y } };
            })
            .filter((node): node is CanvasUiNodeState => !!node);

        const connections: CanvasConnectionState[] = rawConnections
            .map(raw => {
                if (!raw || typeof raw !== 'object') return null;
                const connection = raw as Record<string, unknown>;
                const sourceNodeId = typeof connection['sourceNodeId'] === 'string' ? connection['sourceNodeId'] : null;
                const sourceConnectorId = typeof connection['sourceConnectorId'] === 'string' ? connection['sourceConnectorId'] : null;
                const targetNodeId = typeof connection['targetNodeId'] === 'string' ? connection['targetNodeId'] : null;
                const targetConnectorId = typeof connection['targetConnectorId'] === 'string' ? connection['targetConnectorId'] : null;
                if (!sourceNodeId || !sourceConnectorId || !targetNodeId || !targetConnectorId) return null;
                return { sourceNodeId, sourceConnectorId, targetNodeId, targetConnectorId };
            })
            .filter((connection): connection is CanvasConnectionState => !!connection);

        return { uiNodes, connections, viewMode };
    }

    private persistCanvasConfiguration(): void {
        const assignments = this.templateAssignments();
        if (!assignments.length) return;

        const uiNodes = this._uiNodes();
        const allConnections = this._canvasConnections();

        for (const assignment of assignments) {
            const assignmentConnections = allConnections.filter(connection =>
                connection.source.nodeId === assignment.id || connection.target.nodeId === assignment.id
            );

            const uiNodeIds = new Set<string>();
            for (const connection of assignmentConnections) {
                if (this.isUiNode(connection.source.nodeId)) {
                    uiNodeIds.add(connection.source.nodeId);
                }
                if (this.isUiNode(connection.target.nodeId)) {
                    uiNodeIds.add(connection.target.nodeId);
                }
            }

            const assignmentUiNodes = uiNodes.filter(node => uiNodeIds.has(node.id));
            const projectCanvas: ProjectCanvasConfiguration = {
                uiNodes: assignmentUiNodes,
                connections: assignmentConnections.map(connection => ({
                    sourceNodeId: connection.source.nodeId,
                    sourceConnectorId: connection.source.connectorId,
                    targetNodeId: connection.target.nodeId,
                    targetConnectorId: connection.target.connectorId,
                })),
                viewMode: this.viewMode(),
            };

            const uiTemplate = this.buildUiTemplateOverrideForAssignment(
                assignment,
                assignmentUiNodes,
                assignmentConnections
            );

            const currentConfiguration = (assignment.configuration ?? {}) as Record<string, unknown>;
            const nextConfiguration: Record<string, unknown> = {
                ...currentConfiguration,
                projectCanvas,
                uiTemplate,
            };

            if (JSON.stringify(currentConfiguration) === JSON.stringify(nextConfiguration)) {
                continue;
            }

            this.templateWorkflowsStore.updateAssignment({
                projectId: this.projectId,
                assignmentId: assignment.id,
                changes: {
                    configuration: nextConfiguration,
                },
            });
        }
    }

    private buildUiTemplateOverrideForAssignment(
        assignment: TemplateAssignment,
        assignmentUiNodes: CanvasUiNodeState[],
        assignmentConnections: DfDataConnection[]
    ): { layout: TemplateLayoutType; components: UIComponentConfig[] } {
        const components = assignmentUiNodes.map(node => {
            const paletteItem = this.uiComponentItems.find(item => item.uiType === node.type);
            const bindings: UIComponentConfig['bindings'] = [];

            for (const connection of assignmentConnections) {
                if (connection.source.nodeId === assignment.id && connection.target.nodeId === node.id) {
                    bindings.push({
                        componentProperty: this.parseUiInputPortId(connection.target.connectorId),
                        workflowPath: this.parseTemplateOutputPortPath(connection.source.connectorId),
                    });
                }

                if (connection.source.nodeId === node.id && connection.target.nodeId === assignment.id) {
                    bindings.push({
                        componentProperty: this.parseUiOutputPortId(connection.source.connectorId),
                        workflowPath: this.parseTemplateInputPortPath(connection.target.connectorId),
                    });
                }
            }

            return {
                id: node.id,
                type: node.type,
                label: paletteItem?.label ?? node.type,
                bindings,
            };
        });

        return {
            layout: this.viewMode() === 'tabs' ? 'standalone-tabs' : 'standalone-single',
            components,
        };
    }

    onDrop(event: CdkDragDrop<unknown, unknown, PaletteItem>): void {
        const item = event.item.data;
        if (!item) return;

        const dropElement = event.container.element.nativeElement;
        const rect = dropElement.getBoundingClientRect();
        const x = event.dropPoint.x - rect.left + 100;
        const y = event.dropPoint.y - rect.top + 100;

        if (item.type === 'template' && item.templateId) {
            this.addTemplateToCanvas(item.templateId);
        } else if (item.type === 'ui-component' && item.uiType) {
            this.addUIComponentToCanvas(item.uiType, { x, y });
        }
    }

    private addTemplateToCanvas(templateId: string): void {
        const template = this.availableTemplates().find(t => t.id === templateId);
        if (!template) return;

        this.templateWorkflowsStore.assignTemplate({
            projectId: this.projectId,
            templateId: templateId,
            templateName: template.name,
            portDataScopes: this.initializePortScopes(template),
            configuration: {
                projectCanvas: {
                    uiNodes: [],
                    connections: [],
                    viewMode: this.viewMode(),
                },
                uiTemplate: {
                    layout: this.viewMode() === 'tabs' ? 'standalone-tabs' : 'standalone-single',
                    components: [],
                },
            },
        });

        this.toast.show(
            this.translateService.instant('templates.assigned-success', { name: template.name })
        );
    }

    private initializePortScopes(template: TemplateWorkflow): PortDataScopeConfig[] {
        const { inputs, outputs } = this.resolveTemplatePorts(template);
        const scopesByPortId = new Map<string, PortDataScopeConfig>();

        [...inputs, ...outputs].forEach(port => {
            const current = scopesByPortId.get(port.portPath);
            const scope = this.mergeDataScopes(current?.scope, port.scope);

            scopesByPortId.set(port.portPath, {
                portId: port.portPath,
                scope,
                collectionName: current?.collectionName,
                customLabel: current?.customLabel,
            });
        });

        return [...scopesByPortId.values()];
    }

    private resolveTemplatePorts(template: TemplateWorkflow): {
        inputs: DataPortScopeConfig[];
        outputs: DataPortScopeConfig[];
    } {
        const inputByPath = new Map<string, DataPortScopeConfig>();
        const outputByPath = new Map<string, DataPortScopeConfig>();
        const explicitInputs = template.dataFlowConfig?.inputs ?? [];
        const explicitOutputs = template.dataFlowConfig?.outputs ?? [];

        for (const input of explicitInputs) {
            inputByPath.set(input.portPath, input);
        }
        for (const output of explicitOutputs) {
            outputByPath.set(output.portPath, output);
        }

        // Keep legacy behavior only when template has no explicit exposed ports configured.
        const shouldFilterLegacyFallback = explicitInputs.length === 0 && explicitOutputs.length === 0;
        const internalUsage = shouldFilterLegacyFallback
            ? this.getTemplateInternalPortUsage(template)
            : undefined;
        const legacyScopeByPortPath = shouldFilterLegacyFallback
            ? this.deriveLegacyScopeByPortPath(template)
            : undefined;

        // Backward compatibility: fill missing template ports from referenced composites.
        for (const nodeRef of template.compositeWorkflows ?? []) {
            const composite = this.templateWorkflowsStore.getCompositeById(nodeRef.compositeWorkflowId);
            if (!composite) continue;

            this.mergeCompositeHandles(
                nodeRef.id,
                composite.exposedInputs,
                inputByPath,
                internalUsage?.usedInputs,
                legacyScopeByPortPath
            );
            this.mergeCompositeHandles(
                nodeRef.id,
                composite.exposedOutputs,
                outputByPath,
                internalUsage?.usedOutputs,
                legacyScopeByPortPath
            );
        }

        return {
            inputs: [...inputByPath.values()],
            outputs: [...outputByPath.values()],
        };
    }

    private mergeCompositeHandles(
        nodeId: string,
        handles: ExposedHandle[] | undefined,
        map: Map<string, DataPortScopeConfig>,
        blockedPortPaths?: Set<string>,
        scopeByPortPath?: Map<string, DataScope>
    ): void {
        for (const handle of handles ?? []) {
            const portPath = `${nodeId}:${handle.id}`;
            if (blockedPortPaths?.has(portPath)) continue;
            const resolvedScope = this.normalizeDataScope(scopeByPortPath?.get(portPath));
            const derived: DataPortScopeConfig = {
                portPath,
                label: handle.customLabel || handle.label || handle.id,
                dataType: handle.artifactType || 'any',
                scope: resolvedScope,
                shareable: this.isShareableScope(resolvedScope),
            };
            const existing = map.get(portPath);
            const mergedScope = this.mergeDataScopes(existing?.scope, derived.scope);
            map.set(
                portPath,
                existing
                    ? {
                        ...derived,
                        ...existing,
                        scope: mergedScope,
                        shareable: this.isShareableScope(mergedScope),
                        label: existing.label || derived.label,
                        dataType: existing.dataType || derived.dataType,
                    }
                    : derived
            );
        }
    }

    private repairAssignmentPortScopes(assignments: TemplateAssignment[]): void {
        if (!assignments.length) {
            return;
        }

        for (const assignment of assignments) {
            const template = this.templateWorkflowsStore.getTemplateById(assignment.templateId);
            if (!template) {
                continue;
            }

            const defaultScopes = this.initializePortScopes(template);
            const currentScopes = Array.isArray(assignment.portDataScopes) ? assignment.portDataScopes : [];
            const currentByPortId = new Map(currentScopes.map(scope => [scope.portId, scope]));

            const hasMissingPorts = defaultScopes.some(scope => !currentByPortId.has(scope.portId));
            const shouldMigrateLegacyDefaults =
                this.hasAnyNonSessionScope(defaultScopes)
                && this.isLegacySessionOnlyScopes(currentScopes);

            if (!hasMissingPorts && !shouldMigrateLegacyDefaults) {
                continue;
            }

            const mergedScopes = defaultScopes.map(defaultScope => {
                const current = currentByPortId.get(defaultScope.portId);
                return {
                    portId: defaultScope.portId,
                    scope: shouldMigrateLegacyDefaults
                        ? defaultScope.scope
                        : this.normalizeDataScope(current?.scope ?? defaultScope.scope),
                    collectionName: current?.collectionName,
                    customLabel: current?.customLabel,
                } satisfies PortDataScopeConfig;
            });

            if (JSON.stringify(mergedScopes) === JSON.stringify(currentScopes)) {
                continue;
            }

            this.templateWorkflowsStore.updateAssignment({
                projectId: this.projectId,
                assignmentId: assignment.id,
                changes: {
                    portDataScopes: mergedScopes,
                },
            });
        }
    }

    private hasAnyNonSessionScope(scopes: PortDataScopeConfig[]): boolean {
        return scopes.some(scope => scope.scope === 'project' || scope.scope === 'both');
    }

    private isLegacySessionOnlyScopes(scopes: PortDataScopeConfig[]): boolean {
        if (!scopes.length) {
            return true;
        }

        return scopes.every(scope =>
            this.normalizeDataScope(scope.scope) === 'session'
            && !scope.collectionName
            && !scope.customLabel
        );
    }

    private deriveLegacyScopeByPortPath(template: TemplateWorkflow): Map<string, DataScope> {
        const scopeByPortPath = new Map<string, DataScope>();
        const contextScopeByNodeId = new Map<string, DataScope>();
        const compositeNodeIds = new Set((template.compositeWorkflows ?? []).map(node => node.id));

        for (const contextNode of template.contextNodes ?? []) {
            contextScopeByNodeId.set(
                contextNode.id,
                contextNode.type === 'project-context' ? 'project' : 'session'
            );
        }

        for (const edge of template.edges ?? []) {
            const targetScope = contextScopeByNodeId.get(edge.target);
            if (targetScope && compositeNodeIds.has(edge.source)) {
                const outputPath = `${edge.source}:${edge.sourcePort}`;
                const current = scopeByPortPath.get(outputPath);
                scopeByPortPath.set(outputPath, this.mergeDataScopes(current, targetScope));
            }

            const sourceScope = contextScopeByNodeId.get(edge.source);
            if (sourceScope && compositeNodeIds.has(edge.target)) {
                const inputPath = `${edge.target}:${edge.targetPort}`;
                const current = scopeByPortPath.get(inputPath);
                scopeByPortPath.set(inputPath, this.mergeDataScopes(current, sourceScope));
            }
        }

        return scopeByPortPath;
    }

    private normalizeDataScope(scope: DataScope | null | undefined): DataScope {
        if (scope === 'project' || scope === 'both') {
            return scope;
        }
        return 'session';
    }

    private mergeDataScopes(current: DataScope | null | undefined, incoming: DataScope | null | undefined): DataScope {
        if (!current && incoming) {
            return this.normalizeDataScope(incoming);
        }
        if (current && !incoming) {
            return this.normalizeDataScope(current);
        }

        const normalizedCurrent = this.normalizeDataScope(current ?? undefined);
        const normalizedIncoming = this.normalizeDataScope(incoming ?? undefined);

        if (normalizedCurrent === normalizedIncoming) {
            return normalizedCurrent;
        }
        return 'both';
    }

    private isShareableScope(scope: DataScope): boolean {
        return scope === 'project' || scope === 'both';
    }

    private getTemplateInternalPortUsage(template: TemplateWorkflow): {
        usedInputs: Set<string>;
        usedOutputs: Set<string>;
    } {
        const usedInputs = new Set<string>();
        const usedOutputs = new Set<string>();
        const compositeNodeIds = new Set((template.compositeWorkflows ?? []).map(n => n.id));
        const contextNodeIds = new Set((template.contextNodes ?? []).map(n => n.id));

        for (const edge of template.edges ?? []) {
            const sourceIsComposite = compositeNodeIds.has(edge.source);
            const targetIsComposite = compositeNodeIds.has(edge.target);
            const sourceIsContext = contextNodeIds.has(edge.source);
            const targetIsContext = contextNodeIds.has(edge.target);

            if (sourceIsComposite && (targetIsComposite || targetIsContext)) {
                usedOutputs.add(`${edge.source}:${edge.sourcePort}`);
            }

            if (targetIsComposite && (sourceIsComposite || sourceIsContext)) {
                usedInputs.add(`${edge.target}:${edge.targetPort}`);
            }
        }

        return { usedInputs, usedOutputs };
    }

    private addUIComponentToCanvas(uiType: UIComponentType, position: { x: number; y: number }): void {
        const newNode = {
            id: `ui-${uiType}-${Date.now()}`,
            type: uiType,
            position,
        };

        this._uiNodes.update(nodes => [...nodes, newNode]);
        this.updateCanvasModel();
        this.persistCanvasConfiguration();

        const uiItem = this.uiComponentItems.find(i => i.uiType === uiType);
        this.toast.show(
            this.translateService.instant('templates.project_canvas.ui_added', { name: uiItem?.label ?? uiType })
        );
    }

    private templateInputConnectorId(portPath: string): string {
        return `in::${portPath}`;
    }

    private templateOutputConnectorId(portPath: string): string {
        return `out::${portPath}`;
    }

    private removeUINode(nodeId: string): void {
        this._uiNodes.update(nodes => nodes.filter(n => n.id !== nodeId));
        this._canvasConnections.update(connections =>
            connections.filter(connection =>
                connection.source.nodeId !== nodeId && connection.target.nodeId !== nodeId
            )
        );
        this.updateCanvasModel();
        this.persistCanvasConfiguration();
    }

    onConnectionCreated(event: DfEvent<DfDataConnection>): void {
        const connection = this.readConnectionFromEvent(event);
        if (!connection) return;
        if (!this.isCanvasConnectionPatternValid(connection)) {
            this.updateCanvasModel();
            return;
        }

        const existing = this._canvasConnections();
        const key = this.connectionKey(connection);
        if (existing.some(item => this.connectionKey(item) === key)) {
            this.updateCanvasModel();
            return;
        }

        this._canvasConnections.set([...existing, connection]);
        this.updateCanvasModel();
        this.persistCanvasConfiguration();
    }

    onConnectionDeleted(event: DfEvent<DfDataConnection>): void {
        const connection = this.readConnectionFromEvent(event);
        if (!connection) return;
        const key = this.connectionKey(connection);
        this._canvasConnections.update(connections =>
            connections.filter(item => this.connectionKey(item) !== key)
        );
        this.updateCanvasModel();
        this.persistCanvasConfiguration();
    }

    private readConnectionFromEvent(event: DfEvent<DfDataConnection>): DfDataConnection | null {
        const target = event?.target;
        if (!target) return null;

        const direct = target as Partial<DfDataConnection>;
        if (
            direct.source?.nodeId &&
            direct.source?.connectorId &&
            direct.target?.nodeId &&
            direct.target?.connectorId
        ) {
            return {
                source: {
                    nodeId: direct.source.nodeId,
                    connectorId: direct.source.connectorId,
                    connectorType: direct.source.connectorType,
                },
                target: {
                    nodeId: direct.target.nodeId,
                    connectorId: direct.target.connectorId,
                    connectorType: direct.target.connectorType,
                },
            } as DfDataConnection;
        }

        const nestedTarget = target as {
            source?: { nodeId?: string; connectorId?: string; connectorType?: unknown };
            target?: { nodeId?: string; connectorId?: string; connectorType?: unknown };
        };
        if (
            nestedTarget.source?.nodeId &&
            nestedTarget.source?.connectorId &&
            nestedTarget.target?.nodeId &&
            nestedTarget.target?.connectorId
        ) {
            return {
                source: {
                    nodeId: nestedTarget.source.nodeId,
                    connectorId: nestedTarget.source.connectorId,
                    connectorType: nestedTarget.source.connectorType as DfDataConnection['source']['connectorType'],
                },
                target: {
                    nodeId: nestedTarget.target.nodeId,
                    connectorId: nestedTarget.target.connectorId,
                    connectorType: nestedTarget.target.connectorType as DfDataConnection['target']['connectorType'],
                },
            } as DfDataConnection;
        }

        return null;
    }

    onNodeDeleted(event: DfEvent<DfDataInitialNode>): void {
        const nodeId = event.target?.id;
        if (!nodeId) return;
        
        const assignment = this.templateAssignments().find(a => a.id === nodeId);
        if (assignment) {
            this.removeTemplate(assignment);
        } else {
            this.removeUINode(nodeId);
        }
    }

    async openConfigureDialog(assignment: TemplateAssignment): Promise<void> {
        this.toast.show(
            this.translateService.instant('templates.configure_coming_soon', {
                name: assignment.templateName,
            })
        );
    }

    toggleTemplateEnabled(assignment: TemplateAssignment): void {
        const newState = !assignment.enabled;

        // Apply optimistic local state first so linked UI nodes react immediately.
        const updatedAssignments = this.templateAssignments().map(a =>
            a.id === assignment.id ? { ...a, enabled: newState } : a
        );
        this.templateAssignments.set(updatedAssignments);
        this.syncRenderedNodeStates(updatedAssignments);

        this.templateWorkflowsStore.toggleAssignmentEnabled({
            projectId: this.projectId,
            assignmentId: assignment.id,
        });

        const statusKey = newState ? 'templates.status.enabled' : 'templates.status.disabled';
        this.toast.show(this.translateService.instant(statusKey));

        this.templateToggled.emit({ assignmentId: assignment.id, enabled: newState });
    }

    private syncRenderedNodeStates(assignments: TemplateAssignment[]): void {
        const model = this.flowControl.value;
        if (!model?.nodes?.length) {
            return;
        }

        const assignmentEnabledById = new Map(assignments.map(item => [item.id, !!item.enabled]));
        const linkedTemplateIdsByUiNode = this.collectLinkedTemplateIdsByUiNode(this._canvasConnections());
        const uiNodeStatesToDispatch: { nodeId: string; disabled: boolean }[] = [];
        let hasChanges = false;

        for (const node of model.nodes) {
            if (!node || typeof node !== 'object' || !('id' in node) || !('data' in node)) {
                continue;
            }

            const nodeRecord = node as DfDataInitialNode & { data?: Record<string, unknown> };
            if (!nodeRecord.data || typeof nodeRecord.data !== 'object') {
                continue;
            }

            const nodeId = String(nodeRecord.id);
            if (assignmentEnabledById.has(nodeId)) {
                const nextEnabled = assignmentEnabledById.get(nodeId);
                if (typeof nextEnabled === 'boolean' && nodeRecord.data['enabled'] !== nextEnabled) {
                    nodeRecord.data['enabled'] = nextEnabled;
                    hasChanges = true;
                }
                continue;
            }

            if (this.isUiNode(nodeId)) {
                const nextDisabled = this.isUiNodeDisabled(
                    nodeId,
                    linkedTemplateIdsByUiNode,
                    assignmentEnabledById
                );
                uiNodeStatesToDispatch.push({ nodeId, disabled: nextDisabled });
                if (nodeRecord.data['disabled'] !== nextDisabled) {
                    nodeRecord.data['disabled'] = nextDisabled;
                    hasChanges = true;
                }
            }
        }

        // Always notify UI nodes directly to keep both disable and re-enable instantaneous.
        for (const uiState of uiNodeStatesToDispatch) {
            this.dispatchUiNodeState(uiState.nodeId, uiState.disabled);
        }

        if (!hasChanges) {
            return;
        }

        this.flowControl.setValue({
            nodes: [...model.nodes],
            connections: [...(model.connections ?? [])],
        });
    }

    private dispatchUiNodeState(nodeId: string, disabled: boolean): void {
        document.dispatchEvent(new CustomEvent('projectUiNodeState', {
            detail: { nodeId, disabled },
        }));
    }

    async removeTemplate(assignment: TemplateAssignment): Promise<void> {
        const confirmed = await firstValueFrom(
            this.dialog.open<ConfirmDialogComponent, ConfirmDialogData, boolean>(
                ConfirmDialogComponent,
                {
                    data: {
                        title: this.translateService.instant('templates.confirm-remove-title'),
                        message: this.translateService.instant('templates.confirm-remove-message', {
                            name: assignment.templateName,
                        }),
                    },
                }
            ).afterClosed()
        );

        if (!confirmed) return;

        this.templateWorkflowsStore.removeAssignment({
            projectId: this.projectId,
            assignmentId: assignment.id,
        });

        this.toast.show(this.translateService.instant('templates.removed-success'));
        this.templateRemoved.emit(assignment.id);
    }

    setViewMode(mode: 'single' | 'tabs'): void {
        if (this.viewMode() === mode) return;
        this.viewMode.set(mode);
        this.persistCanvasConfiguration();
    }

    togglePalette(): void {
        if (!this.isLoading()) {
            this.showPalette.set(!this.showPalette());
        }
    }

    resetView(): void {
        if (this.drawFlowRef?.resetPosition) {
            this.drawFlowRef.resetPosition();
        }
    }
}
