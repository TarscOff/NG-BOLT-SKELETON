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
import { MatDividerModule } from '@angular/material/divider';
import { MatTooltipModule } from '@angular/material/tooltip';
import { MatChipsModule } from '@angular/material/chips';
import { TranslateModule } from '@ngx-translate/core';

import { TemplateWorkflowsStore } from '@features/workflows/templates/data/template-workflows.store';
import {
    TemplateWorkflow,
    DataPortScopeConfig,
    ExposedHandle,
} from '@features/workflows/templates/interfaces/template-workflow.interface';
import { DataScope, PortDataScopeConfig } from '@shared/types/workflow.types';

// ============================================================================
// DIALOG DATA INTERFACES
// ============================================================================

export interface DataScopeConfigDialogData {
    /** The template assignment ID */
    assignmentId: string;
    /** The template ID */
    templateId: string;
    /** The template name for display */
    templateName: string;
    /** Current port data scope configuration */
    portDataScopes: PortDataScopeConfig[];
    /** Project ID for context */
    projectId: string;
}

export interface DataScopeConfigDialogResult {
    assignmentId: string;
    portDataScopes: PortDataScopeConfig[];
}

// ============================================================================
// INTERNAL INTERFACE
// ============================================================================

interface EditablePortScope {
    portId: string;
    scope: DataScope;
    collectionName?: string;
    customLabel?: string;
    type: 'input' | 'output' | 'intermediate';
    originalLabel?: string;
}

// ============================================================================
// COMPONENT
// ============================================================================

@Component({
    selector: 'app-data-scope-config-dialog',
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
        MatDividerModule,
        MatTooltipModule,
        MatChipsModule,
        TranslateModule,
    ],
    template: `
        <h2 mat-dialog-title>
            <mat-icon>settings</mat-icon>
            {{ 'templates.scopes.title' | translate }}
        </h2>

        <mat-dialog-content>
            <div class="template-info">
                <mat-icon class="template-icon">dashboard</mat-icon>
                <div class="template-details">
                    <h3>{{ data.templateName }}</h3>
                    <span class="port-count">
                        {{ portScopes().length }} {{ 'templates.scopes.ports' | translate }}
                    </span>
                </div>
            </div>

            @if (loading()) {
                <div class="loading-state">
                    <mat-icon>hourglass_empty</mat-icon>
                    <span>{{ 'common.loading' | translate }}</span>
                </div>
            } @else {
                <div class="scope-sections">
                    @if (inputPorts().length > 0) {
                        <div class="scope-section">
                            <h4>
                                <mat-icon>input</mat-icon>
                                {{ 'templates.scopes.inputs' | translate }}
                            </h4>
                            @for (port of inputPorts(); track port.portId) {
                                <ng-container *ngTemplateOutlet="portRow; context: { port }"></ng-container>
                            }
                        </div>
                    }

                    @if (outputPorts().length > 0) {
                        <div class="scope-section">
                            <h4>
                                <mat-icon>output</mat-icon>
                                {{ 'templates.scopes.outputs' | translate }}
                            </h4>
                            @for (port of outputPorts(); track port.portId) {
                                <ng-container *ngTemplateOutlet="portRow; context: { port }"></ng-container>
                            }
                        </div>
                    }

                    @if (intermediatePorts().length > 0) {
                        <div class="scope-section">
                            <h4>
                                <mat-icon>sync_alt</mat-icon>
                                {{ 'templates.scopes.intermediates' | translate }}
                            </h4>
                            @for (port of intermediatePorts(); track port.portId) {
                                <ng-container *ngTemplateOutlet="portRow; context: { port }"></ng-container>
                            }
                        </div>
                    }

                    @if (portScopes().length === 0) {
                        <div class="empty-state">
                            <mat-icon>info</mat-icon>
                            <span>{{ 'templates.scopes.no_ports' | translate }}</span>
                        </div>
                    }
                </div>
            }
        </mat-dialog-content>

        <mat-dialog-actions align="end">
            <button mat-button mat-dialog-close>
                {{ 'common.cancel' | translate }}
            </button>
            <button mat-flat-button color="primary" 
                    [disabled]="!hasChanges()"
                    (click)="save()">
                <mat-icon>save</mat-icon>
                {{ 'common.save' | translate }}
            </button>
        </mat-dialog-actions>

        <!-- Port Row Template -->
        <ng-template #portRow let-port="port">
            <div class="port-row">
                <div class="port-info">
                    <mat-icon class="port-icon">{{ getPortIcon(port.type) }}</mat-icon>
                    <div class="port-details">
                        <span class="port-id">{{ port.customLabel || port.portId }}</span>
                        @if (port.originalLabel && port.customLabel) {
                            <span class="port-original">({{ port.originalLabel }})</span>
                        }
                    </div>
                </div>
                <div class="port-config">
                    <mat-form-field appearance="outline" class="scope-select">
                        <mat-label>{{ 'templates.scopes.scope' | translate }}</mat-label>
                        <mat-select [(ngModel)]="port.scope"
                                    (ngModelChange)="onScopeChange(port)">
                            @for (option of scopeOptions; track option.value) {
                                <mat-option [value]="option.value">
                                    <mat-icon>{{ option.icon }}</mat-icon>
                                    {{ option.label | translate }}
                                </mat-option>
                            }
                        </mat-select>
                    </mat-form-field>

                    @if (port.scope === 'project' || port.scope === 'both') {
                        <mat-form-field appearance="outline" class="collection-field">
                            <mat-label>{{ 'templates.scopes.collection' | translate }}</mat-label>
                            <input matInput [(ngModel)]="port.collectionName"
                                   (ngModelChange)="onCollectionChange(port)"
                                   [placeholder]="'templates.scopes.collection_placeholder' | translate">
                        </mat-form-field>
                    }
                </div>
            </div>
        </ng-template>
    `,
    styles: [`
        :host {
            display: block;
        }

        .template-info {
            display: flex;
            align-items: center;
            gap: 1rem;
            padding: 1rem;
            background: color-mix(in srgb, var(--mat-primary) 8%, transparent);
            border-radius: 8px;
            border-left: 4px solid var(--mat-primary, #1976d2);
            margin-bottom: 1.5rem;
        }

        .template-icon {
            font-size: 2rem;
            width: 2rem;
            height: 2rem;
            color: var(--mat-primary, #1976d2);
        }

        .template-details {
            h3 {
                margin: 0;
                font-size: 1.1rem;
                font-weight: 500;
            }

            .port-count {
                font-size: 0.85rem;
                opacity: 0.7;
            }
        }

        .scope-sections {
            display: flex;
            flex-direction: column;
            gap: 1.5rem;
        }

        .scope-section {
            h4 {
                display: flex;
                align-items: center;
                gap: 0.5rem;
                margin: 0 0 0.75rem 0;
                font-size: 0.95rem;
                font-weight: 600;
                color: var(--mat-primary, #1976d2);
                padding-bottom: 0.5rem;
                border-bottom: 1px solid var(--mat-divider-color, rgba(0,0,0,0.1));

                mat-icon {
                    font-size: 1.25rem;
                    width: 1.25rem;
                    height: 1.25rem;
                }
            }
        }

        .port-row {
            display: flex;
            align-items: flex-start;
            justify-content: space-between;
            gap: 1rem;
            padding: 0.75rem;
            background: color-mix(in srgb, var(--mat-primary) 3%, transparent);
            border-radius: 6px;
            margin-bottom: 0.5rem;

            &:hover {
                background: color-mix(in srgb, var(--mat-primary) 6%, transparent);
            }
        }

        .port-info {
            display: flex;
            align-items: center;
            gap: 0.5rem;
            min-width: 150px;

            .port-icon {
                font-size: 1.25rem;
                width: 1.25rem;
                height: 1.25rem;
                opacity: 0.7;
            }

            .port-details {
                display: flex;
                flex-direction: column;

                .port-id {
                    font-weight: 500;
                    font-size: 0.9rem;
                }

                .port-original {
                    font-size: 0.75rem;
                    opacity: 0.6;
                }
            }
        }

        .port-config {
            display: flex;
            align-items: center;
            gap: 0.75rem;
            flex: 1;
            justify-content: flex-end;

            mat-form-field {
                margin-bottom: -1.25em;
            }

            .scope-select {
                min-width: 140px;
            }

            .collection-field {
                min-width: 180px;
            }
        }

        .loading-state,
        .empty-state {
            display: flex;
            flex-direction: column;
            align-items: center;
            justify-content: center;
            gap: 0.5rem;
            padding: 2rem;
            opacity: 0.7;

            mat-icon {
                font-size: 2.5rem;
                width: 2.5rem;
                height: 2.5rem;
            }
        }
    `],
    changeDetection: ChangeDetectionStrategy.OnPush,
})
export class DataScopeConfigDialogComponent implements OnInit {
    private readonly dialogRef = inject(MatDialogRef<DataScopeConfigDialogComponent>);
    private readonly templateStore = inject(TemplateWorkflowsStore);
    readonly data = inject<DataScopeConfigDialogData>(MAT_DIALOG_DATA);

    // State
    readonly loading = signal(true);
    readonly portScopes = signal<EditablePortScope[]>([]);
    private originalScopes: PortDataScopeConfig[] = [];

    // Computed filtered ports by type
    readonly inputPorts = computed(() => this.portScopes().filter(p => p.type === 'input'));
    readonly outputPorts = computed(() => this.portScopes().filter(p => p.type === 'output'));
    readonly intermediatePorts = computed(() => this.portScopes().filter(p => p.type === 'intermediate'));

    // Scope options for select
    readonly scopeOptions = [
        { value: 'session' as DataScope, label: 'templates.scopes.session', icon: 'view_timeline' },
        { value: 'project' as DataScope, label: 'templates.scopes.project', icon: 'folder' },
        { value: 'both' as DataScope, label: 'templates.scopes.both', icon: 'all_inclusive' },
    ];

    // Check if there are changes
    readonly hasChanges = computed(() => {
        const current = this.portScopes();
        if (current.length !== this.originalScopes.length) return true;

        return current.some(port => {
            const original = this.originalScopes.find(o => o.portId === port.portId);
            if (!original) return true;
            return port.scope !== original.scope ||
                   port.collectionName !== original.collectionName ||
                   port.customLabel !== original.customLabel;
        });
    });

    ngOnInit(): void {
        this.loadTemplateConfiguration();
    }

    private loadTemplateConfiguration(): void {
        this.loading.set(true);
        this.originalScopes = [...this.data.portDataScopes];

        // Try to load the template to get port definitions
        this.templateStore.selectTemplateById(this.data.templateId).subscribe(template => {
            if (template) {
                this.initializePortScopes(template);
            } else {
                // Fallback: use the existing port data scopes from the assignment
                this.initializeFromExistingScopes();
            }
            this.loading.set(false);
        });
    }

    private initializePortScopes(template: TemplateWorkflow): void {
        const resolvedPorts = this.resolveTemplatePorts(template);
        const existingScopes = new Map(this.data.portDataScopes.map(p => [p.portId, p]));

        const scopes: EditablePortScope[] = [];

        // Add inputs (DataPortScopeConfig uses portPath and label, while PortDataScopeConfig uses portId and customLabel)
        resolvedPorts.inputs.forEach(port => {
            const portId = port.portPath; // Map portPath to portId
            const existing = existingScopes.get(portId);
            scopes.push({
                portId,
                scope: existing?.scope ?? port.scope ?? 'session',
                collectionName: existing?.collectionName ?? port.storageName,
                customLabel: existing?.customLabel ?? port.label,
                type: 'input',
                originalLabel: port.label || portId,
            });
        });

        // Add outputs
        resolvedPorts.outputs.forEach(port => {
            const portId = port.portPath;
            const existing = existingScopes.get(portId);
            scopes.push({
                portId,
                scope: existing?.scope ?? port.scope ?? 'session',
                collectionName: existing?.collectionName ?? port.storageName,
                customLabel: existing?.customLabel ?? port.label,
                type: 'output',
                originalLabel: port.label || portId,
            });
        });

        // Add intermediates
        for (const port of template.dataFlowConfig?.intermediates ?? []) {
            const portId = port.portPath;
            const existing = existingScopes.get(portId);
            scopes.push({
                portId,
                scope: existing?.scope ?? port.scope ?? 'session',
                collectionName: existing?.collectionName ?? port.storageName,
                customLabel: existing?.customLabel ?? port.label,
                type: 'intermediate',
                originalLabel: port.label || portId,
            });
        }

        this.portScopes.set(scopes);
    }

    private resolveTemplatePorts(template: TemplateWorkflow): {
        inputs: DataPortScopeConfig[];
        outputs: DataPortScopeConfig[];
    } {
        const inputByPath = new Map<string, DataPortScopeConfig>();
        const outputByPath = new Map<string, DataPortScopeConfig>();

        for (const input of template.dataFlowConfig?.inputs ?? []) {
            inputByPath.set(input.portPath, input);
        }
        for (const output of template.dataFlowConfig?.outputs ?? []) {
            outputByPath.set(output.portPath, output);
        }

        for (const nodeRef of template.compositeWorkflows ?? []) {
            const composite = this.templateStore.getCompositeById(nodeRef.compositeWorkflowId);
            if (!composite) continue;

            this.mergeCompositeHandles(nodeRef.id, composite.exposedInputs, inputByPath);
            this.mergeCompositeHandles(nodeRef.id, composite.exposedOutputs, outputByPath);
        }

        return {
            inputs: [...inputByPath.values()],
            outputs: [...outputByPath.values()],
        };
    }

    private mergeCompositeHandles(
        nodeId: string,
        handles: ExposedHandle[] | undefined,
        map: Map<string, DataPortScopeConfig>
    ): void {
        for (const handle of handles ?? []) {
            const portPath = `${nodeId}:${handle.id}`;
            const derived: DataPortScopeConfig = {
                portPath,
                label: handle.customLabel || handle.label || handle.id,
                dataType: handle.artifactType || 'any',
                scope: 'session',
                shareable: false,
            };
            const existing = map.get(portPath);
            map.set(
                portPath,
                existing
                    ? {
                        ...derived,
                        ...existing,
                        label: existing.label || derived.label,
                        dataType: existing.dataType || derived.dataType,
                    }
                    : derived
            );
        }
    }

    private initializeFromExistingScopes(): void {
        // Fallback when template isn't found - just use existing scopes as outputs
        const scopes: EditablePortScope[] = this.data.portDataScopes.map(port => ({
            portId: port.portId,
            scope: port.scope,
            collectionName: port.collectionName,
            customLabel: port.customLabel,
            type: 'output' as const,
            originalLabel: port.portId,
        }));

        this.portScopes.set(scopes);
    }

    getPortIcon(type: 'input' | 'output' | 'intermediate'): string {
        switch (type) {
            case 'input': return 'login';
            case 'output': return 'logout';
            case 'intermediate': return 'sync_alt';
        }
    }

    onScopeChange(port: EditablePortScope): void {
        // If changing away from project/both, clear collection name
        if (port.scope === 'session') {
            port.collectionName = undefined;
        }
    }

    onCollectionChange(port: EditablePortScope): void {
        // Trim whitespace
        if (port.collectionName) {
            port.collectionName = port.collectionName.trim();
        }
    }

    save(): void {
        const result: DataScopeConfigDialogResult = {
            assignmentId: this.data.assignmentId,
            portDataScopes: this.portScopes().map(port => ({
                portId: port.portId,
                scope: port.scope,
                collectionName: port.collectionName,
                customLabel: port.customLabel,
            })),
        };

        this.dialogRef.close(result);
    }
}
