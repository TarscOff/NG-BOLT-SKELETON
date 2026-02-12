import {
    Component,
    ChangeDetectionStrategy,
    inject,
    signal,
    computed,
    OnInit,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { MatDialogRef, MAT_DIALOG_DATA, MatDialogModule } from '@angular/material/dialog';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatSelectModule } from '@angular/material/select';
import { MatRadioModule } from '@angular/material/radio';
import { MatChipsModule } from '@angular/material/chips';
import { MatDividerModule } from '@angular/material/divider';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatTooltipModule } from '@angular/material/tooltip';
import { TranslateModule, TranslateService } from '@ngx-translate/core';

import { TemplateWorkflowsStore } from '@features/workflows/templates/data/template-workflows.store';
import {
    TemplateWorkflowSummary,
    UIComponentType,
    TemplateLayoutType,
} from '@features/workflows/templates/interfaces/template-workflow.interface';
import { TemplateDataScope, PortDataScopeConfig } from '../../interfaces/project.model';

// ============================================================================
// DIALOG DATA INTERFACES
// ============================================================================

export interface TemplateSelectionDialogData {
    projectId: string;
    projectName?: string;
    /** Existing template IDs to exclude */
    excludeTemplateIds?: string[];
}

export interface TemplateSelectionDialogResult {
    templateId: string;
    templateName: string;
    portDataScopes: PortDataScopeConfig[];
}

// ============================================================================
// COMPONENT
// ============================================================================

@Component({
    selector: 'app-template-selection-dialog',
    standalone: true,
    imports: [
        CommonModule,
        FormsModule,
        MatDialogModule,
        MatButtonModule,
        MatIconModule,
        MatFormFieldModule,
        MatInputModule,
        MatSelectModule,
        MatRadioModule,
        MatChipsModule,
        MatDividerModule,
        MatProgressSpinnerModule,
        MatTooltipModule,
        TranslateModule,
    ],
    template: `
        <h2 mat-dialog-title>
            <mat-icon>add_box</mat-icon>
            {{ 'templates.selection.title' | translate }}
        </h2>

        <mat-dialog-content>
            @if (step() === 'select') {
                <!-- Step 1: Select Template -->
                <div class="step-select">
                    <p class="step-description">
                        {{ 'templates.selection.select_description' | translate }}
                    </p>

                    <!-- Search -->
                    <mat-form-field appearance="outline" class="search-field">
                        <mat-label>{{ 'templates.selection.search' | translate }}</mat-label>
                        <mat-icon matPrefix>search</mat-icon>
                        <input matInput 
                               [placeholder]="'templates.selection.search_placeholder' | translate"
                               [(ngModel)]="searchQuery"
                               (ngModelChange)="onSearchChange($event)">
                        @if (searchQuery()) {
                            <button mat-icon-button matSuffix (click)="searchQuery.set('')">
                                <mat-icon>close</mat-icon>
                            </button>
                        }
                    </mat-form-field>

                    <!-- Template List -->
                    <div class="template-list">
                        @if (isLoading()) {
                            <div class="loading">
                                <mat-spinner diameter="32"></mat-spinner>
                            </div>
                        } @else if (filteredTemplates().length === 0) {
                            <div class="empty-list">
                                <mat-icon>search_off</mat-icon>
                                <span>{{ 'templates.selection.no_templates' | translate }}</span>
                            </div>
                        } @else {
                            @for (template of filteredTemplates(); track template.id) {
                                <div class="template-card"
                                     role="button"
                                     tabindex="0"
                                     [class.selected]="selectedTemplateId() === template.id"
                                     (click)="selectTemplate(template)"
                                     (keydown)="onTemplateCardKeydown($event, template)">
                                    <div class="template-icon">
                                        <mat-icon>{{ getTemplateIcon(template) }}</mat-icon>
                                    </div>
                                    <div class="template-info">
                                        <h4>{{ template.name }}</h4>
                                        <p>{{ template.description || ('templates.no_description' | translate) }}</p>
                                        <div class="template-meta">
                                            <mat-chip-set>
                                                <mat-chip>{{ getLayoutLabel(template.layout) }}</mat-chip>
                                                @for (type of template.componentTypes.slice(0, 3); track type) {
                                                    <mat-chip>{{ getComponentLabel(type) }}</mat-chip>
                                                }
                                            </mat-chip-set>
                                        </div>
                                    </div>
                                    <div class="template-select">
                                        <mat-icon>{{ selectedTemplateId() === template.id ? 'check_circle' : 'radio_button_unchecked' }}</mat-icon>
                                    </div>
                                </div>
                            }
                        }
                    </div>
                </div>
            } @else if (step() === 'configure') {
                <!-- Step 2: Configure Data Scopes -->
                <div class="step-configure">
                    <div class="selected-template-header">
                        <mat-icon>{{ getTemplateIcon(selectedTemplateSummary()!) }}</mat-icon>
                        <div>
                            <h3>{{ selectedTemplateSummary()?.name }}</h3>
                            <p>{{ selectedTemplateSummary()?.description }}</p>
                        </div>
                    </div>

                    <mat-divider></mat-divider>

                    <h4>{{ 'templates.selection.configure_scope' | translate }}</h4>
                    <p class="step-description">
                        {{ 'templates.selection.scope_description' | translate }}
                    </p>

                    <!-- Port Scope Configuration -->
                    @if (selectedTemplateOutputPorts().length > 0) {
                        <div class="port-scope-list">
                            @for (port of selectedTemplateOutputPorts(); track port.id) {
                                <div class="port-scope-item">
                                    <div class="port-info">
                                        <mat-icon>output</mat-icon>
                                        <span class="port-label">{{ port.label || port.id }}</span>
                                    </div>
                                    <mat-form-field appearance="outline">
                                        <mat-label>{{ 'templates.selection.scope' | translate }}</mat-label>
                                        <mat-select [(ngModel)]="portScopes[port.id]">
                                            <mat-option value="project">
                                                <mat-icon>folder</mat-icon>
                                                {{ 'templates.scope.project' | translate }}
                                            </mat-option>
                                            <mat-option value="session">
                                                <mat-icon>chat_bubble</mat-icon>
                                                {{ 'templates.scope.session' | translate }}
                                            </mat-option>
                                            <mat-option value="both">
                                                <mat-icon>layers</mat-icon>
                                                {{ 'templates.scope.both' | translate }}
                                            </mat-option>
                                        </mat-select>
                                    </mat-form-field>
                                </div>
                            }
                        </div>
                    } @else {
                        <div class="no-ports">
                            <mat-icon>info</mat-icon>
                            <span>{{ 'templates.selection.no_output_ports' | translate }}</span>
                        </div>
                    }

                    <!-- Quick Scope Selector -->
                    <div class="quick-scope">
                        <span>{{ 'templates.selection.quick_scope' | translate }}:</span>
                        <button mat-stroked-button (click)="setAllScopes('project')">
                            <mat-icon>folder</mat-icon>
                            {{ 'templates.scope.project' | translate }}
                        </button>
                        <button mat-stroked-button (click)="setAllScopes('session')">
                            <mat-icon>chat_bubble</mat-icon>
                            {{ 'templates.scope.session' | translate }}
                        </button>
                        <button mat-stroked-button (click)="setAllScopes('both')">
                            <mat-icon>layers</mat-icon>
                            {{ 'templates.scope.both' | translate }}
                        </button>
                    </div>
                </div>
            }
        </mat-dialog-content>

        <mat-dialog-actions align="end">
            @if (step() === 'select') {
                <button mat-button (click)="cancel()">
                    {{ 'common.cancel' | translate }}
                </button>
                <button mat-flat-button 
                        color="primary" 
                        [disabled]="!selectedTemplateId()"
                        (click)="nextStep()">
                    {{ 'common.next' | translate }}
                    <mat-icon>arrow_forward</mat-icon>
                </button>
            } @else {
                <button mat-button (click)="previousStep()">
                    <mat-icon>arrow_back</mat-icon>
                    {{ 'common.back' | translate }}
                </button>
                <button mat-flat-button 
                        color="primary" 
                        (click)="confirm()">
                    <mat-icon>check</mat-icon>
                    {{ 'templates.selection.activate' | translate }}
                </button>
            }
        </mat-dialog-actions>
    `,
    styles: [`
        :host {
            display: block;
        }

        .step-description {
            opacity: 0.8;
            margin-bottom: 16px;
        }

        .search-field {
            width: 100%;
            margin-bottom: 16px;
            box-sizing: border-box;
        }

        .template-list {
            display: flex;
            flex-direction: column;
            gap: 12px;
            max-height: 350px;
            overflow-y: auto;
        }

        .loading {
            display: flex;
            justify-content: center;
            padding: 32px;
        }

        .empty-list {
            display: flex;
            flex-direction: column;
            align-items: center;
            gap: 12px;
            padding: 32px;
            opacity: 0.7;
            
            mat-icon {
                font-size: 48px;
                width: 48px;
                height: 48px;
            }
        }

        .template-card {
            display: flex;
            align-items: flex-start;
            gap: 16px;
            padding: 16px;
            border: 1px solid var(--mat-divider-color, rgba(0,0,0,0.12));
            border-radius: 12px;
            cursor: pointer;
            transition: all 0.2s ease;

            &:hover {
                background: color-mix(in srgb, var(--mat-primary) 5%, transparent);
            }

            &.selected {
                border-color: var(--mat-primary);
                background: color-mix(in srgb, var(--mat-primary) 10%, transparent);
            }
        }

        .template-icon {
            display: flex;
            align-items: center;
            justify-content: center;
            width: 48px;
            height: 48px;
            flex-shrink: 0;
            border-radius: 12px;
            background: color-mix(in srgb, var(--mat-primary) 10%, transparent);
            
            mat-icon {
                font-size: 28px;
                width: 28px;
                height: 28px;
                color: var(--mat-primary);
            }
        }

        .template-info {
            flex: 1;
            min-width: 0;
            
            h4 {
                margin: 0 0 4px 0;
                font-weight: 500;
            }
            
            p {
                margin: 0 0 8px 0;
                opacity: 0.7;
                font-size: 14px;
                white-space: nowrap;
                overflow: hidden;
                text-overflow: ellipsis;
            }
        }

        .template-meta {
            mat-chip-set {
                display: flex;
                flex-wrap: wrap;
                gap: 4px;
            }
            
            mat-chip {
                font-size: 11px;
            }
        }

        .template-select {
            flex-shrink: 0;
            
            mat-icon {
                color: var(--mat-primary);
            }
        }

        /* Step 2: Configure */
        .selected-template-header {
            display: flex;
            align-items: center;
            gap: 16px;
            padding: 16px;
            background: color-mix(in srgb, var(--mat-primary) 8%, transparent);
            border-radius: 12px;
            margin-bottom: 16px;
            
            mat-icon {
                font-size: 32px;
                width: 32px;
                height: 32px;
                color: var(--mat-primary);
            }
            
            h3 {
                margin: 0;
            }
            
            p {
                margin: 4px 0 0 0;
                opacity: 0.7;
                font-size: 14px;
            }
        }

        .step-configure {
            h4 {
                margin: 16px 0 8px 0;
            }
        }

        .port-scope-list {
            display: flex;
            flex-direction: column;
            gap: 12px;
            margin-top: 16px;
        }

        .port-scope-item {
            display: flex;
            align-items: center;
            gap: 16px;
            
            .port-info {
                display: flex;
                align-items: center;
                gap: 8px;
                flex: 1;
                
                mat-icon {
                    color: var(--mat-accent);
                }
                
                .port-label {
                    font-weight: 500;
                }
            }
            
            mat-form-field {
                width: 180px;
            }
        }

        .no-ports {
            display: flex;
            align-items: center;
            gap: 8px;
            padding: 16px;
            background: color-mix(in srgb, var(--mat-primary) 8%, transparent);
            border-radius: 8px;
            opacity: 0.8;
        }

        .quick-scope {
            display: flex;
            align-items: center;
            gap: 12px;
            margin-top: 16px;
            padding-top: 16px;
            border-top: 1px solid var(--mat-divider-color, rgba(0,0,0,0.12));
            flex-wrap: wrap;
            
            span {
                opacity: 0.8;
                font-size: 14px;
            }
        }
    `],
    changeDetection: ChangeDetectionStrategy.OnPush,
})
export class TemplateSelectionDialogComponent implements OnInit {
    private readonly dialogRef = inject(MatDialogRef<TemplateSelectionDialogComponent>);
    private readonly data = inject<TemplateSelectionDialogData>(MAT_DIALOG_DATA);
    private readonly templateStore = inject(TemplateWorkflowsStore);
    private readonly translate = inject(TranslateService);

    // State
    readonly step = signal<'select' | 'configure'>('select');
    readonly searchQuery = signal('');
    readonly isLoading = signal(true);
    readonly templates = signal<TemplateWorkflowSummary[]>([]);
    readonly selectedTemplateId = signal<string | null>(null);
    
    // Port scopes configuration
    portScopes: Record<string, TemplateDataScope> = {};

    // Computed
    readonly filteredTemplates = computed(() => {
        const query = this.searchQuery().toLowerCase();
        const excluded = new Set(this.data.excludeTemplateIds ?? []);
        
        return this.templates()
            .filter(t => !excluded.has(t.id))
            .filter(t => 
                !query ||
                t.name.toLowerCase().includes(query) ||
                t.description.toLowerCase().includes(query)
            );
    });

    readonly selectedTemplateSummary = computed(() =>
        this.templates().find(t => t.id === this.selectedTemplateId())
    );

    readonly selectedTemplateOutputPorts = computed(() => {
        const templateId = this.selectedTemplateId();
        if (!templateId) return [];
        
        const template = this.templateStore.getTemplateById(templateId);
        if (!template) return [];

        // Collect output ports from all composites
        const ports: { id: string; label?: string }[] = [];
        
        for (const compositeRef of template.compositeWorkflows) {
            const composite = this.templateStore.getCompositeById(compositeRef.compositeWorkflowId);
            if (composite) {
                for (const output of composite.exposedOutputs) {
                    ports.push({
                        id: `${compositeRef.id}:${output.id}`,
                        label: output.customLabel || output.label || output.id,
                    });
                }
            }
        }
        
        return ports;
    });

    ngOnInit(): void {
        this.loadTemplates();
    }

    private loadTemplates(): void {
        this.isLoading.set(true);
        
        // Get template summaries from store
        const summaries = this.templateStore.getTemplateSummaries();
        this.templates.set(summaries);
        this.isLoading.set(false);
    }

    selectTemplate(template: TemplateWorkflowSummary): void {
        this.selectedTemplateId.set(template.id);
    }

    onTemplateCardKeydown(event: KeyboardEvent, template: TemplateWorkflowSummary): void {
        if (event.key === 'Enter' || event.key === ' ') {
            event.preventDefault();
            this.selectTemplate(template);
        }
    }

    nextStep(): void {
        if (!this.selectedTemplateId()) return;
        
        // Initialize port scopes with default value
        const ports = this.selectedTemplateOutputPorts();
        ports.forEach(port => {
            if (!this.portScopes[port.id]) {
                this.portScopes[port.id] = 'session';
            }
        });
        
        this.step.set('configure');
    }

    previousStep(): void {
        this.step.set('select');
    }

    setAllScopes(scope: TemplateDataScope): void {
        const ports = this.selectedTemplateOutputPorts();
        ports.forEach(port => {
            this.portScopes[port.id] = scope;
        });
        // Force change detection
        this.portScopes = { ...this.portScopes };
    }

    confirm(): void {
        const template = this.selectedTemplateSummary();
        if (!template) return;

        const portDataScopes: PortDataScopeConfig[] = Object.entries(this.portScopes)
            .map(([portId, scope]) => ({
                portId,
                scope,
            }));

        const result: TemplateSelectionDialogResult = {
            templateId: template.id,
            templateName: template.name,
            portDataScopes,
        };

        this.dialogRef.close(result);
    }

    cancel(): void {
        this.dialogRef.close(null);
    }

    // UI Helpers
    getTemplateIcon(template: TemplateWorkflowSummary): string {
        if (template.componentTypes.includes('chat')) {
            if (template.componentTypes.includes('file-uploader')) {
                return 'smart_toy';
            }
            return 'chat';
        }
        if (template.componentTypes.includes('file-uploader')) {
            return 'upload_file';
        }
        if (template.componentTypes.includes('comparison-panel')) {
            return 'compare';
        }
        
        switch (template.layout) {
            case 'chat-with-files': return 'smart_toy';
            case 'comparison-view': return 'compare';
            case 'dashboard': return 'dashboard';
            default: return 'hub';
        }
    }

    getLayoutLabel(layout: TemplateLayoutType): string {
        const key = `templates.layout.${layout.replace(/-/g, '_')}`;
        return this.translate.instant(key);
    }

    getComponentLabel(type: UIComponentType): string {
        const key = `templates.components.${type.replace(/-/g, '_')}`;
        return this.translate.instant(key);
    }

    onSearchChange(query: string): void {
        this.searchQuery.set(query);
    }
}
