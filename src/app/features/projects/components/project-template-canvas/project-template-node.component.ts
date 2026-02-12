/**
 * Project Template Node Component
 * 
 * A ng-draw-flow node component for displaying template assignments
 * in the project template canvas. Shows template info, ports, and actions.
 */

import { Component, inject, ChangeDetectorRef, OnInit, OnDestroy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { MatIconModule } from '@angular/material/icon';
import { MatTooltipModule } from '@angular/material/tooltip';
import { MatButtonModule } from '@angular/material/button';
import { MatMenuModule } from '@angular/material/menu';
import { MatChipsModule } from '@angular/material/chips';
import { MatDividerModule } from '@angular/material/divider';
import { TranslateModule } from '@ngx-translate/core';
import {
    DrawFlowBaseNode,
    DfInputComponent,
    DfOutputComponent,
    DfConnectorPosition,
} from '@ng-draw-flow/core';
import { Router } from '@angular/router';
import { DataPortScopeConfig } from '@features/workflows/templates/interfaces/template-workflow.interface';
import { DataScope, PortDataScopeConfig as AssignmentPortDataScopeConfig } from '@shared/types/workflow.types';
import { interval, Subscription } from 'rxjs';

interface ProjectTemplateNodeData {
    assignmentId: string;
    templateId: string;
    templateName: string;
    enabled: boolean;
    description?: string;
    exposedInputs: DataPortScopeConfig[];
    exposedOutputs: DataPortScopeConfig[];
    portDataScopes?: AssignmentPortDataScopeConfig[];
}

@Component({
    selector: 'app-project-template-df-node',
    standalone: true,
    imports: [
        CommonModule,
        MatIconModule,
        MatTooltipModule,
        MatButtonModule,
        MatMenuModule,
        MatChipsModule,
        MatDividerModule,
        TranslateModule,
        DfInputComponent,
        DfOutputComponent,
    ],
    template: `
        <div class="project-template-node" 
             [class.selected]="selected"
             [class.disabled]="!isEnabled">
            
            <!-- Header -->
            <div class="node-header">
                <mat-icon class="node-icon">dashboard_customize</mat-icon>
                <span class="node-label" [matTooltip]="nodeData.templateName">
                    {{ nodeData.templateName }}
                </span>
                
                <!-- Status Badge -->
                <span class="status-badge" [class.enabled]="isEnabled">
                    {{ (isEnabled ? 'templates.status.enabled' : 'templates.status.disabled') | translate }}
                </span>

                <!-- Actions Menu -->
                <button mat-icon-button 
                        class="menu-btn"
                        [matMenuTriggerFor]="actionsMenu"
                        (click)="$event.stopPropagation()">
                    <mat-icon>more_vert</mat-icon>
                </button>

                <mat-menu #actionsMenu="matMenu">
                    <button mat-menu-item (click)="onNavigate($event)">
                        <mat-icon>open_in_new</mat-icon>
                        {{ 'templates.view_template' | translate }}
                    </button>
                    <button mat-menu-item (click)="onToggle()">
                        <mat-icon>{{ isEnabled ? 'toggle_off' : 'toggle_on' }}</mat-icon>
                        {{ (isEnabled ? 'templates.disable' : 'templates.enable') | translate }}
                    </button>
                    <mat-divider></mat-divider>
                    <button mat-menu-item class="delete-action" (click)="onRemove()">
                        <mat-icon color="warn">delete</mat-icon>
                        {{ 'common.delete' | translate }}
                    </button>
                </mat-menu>
            </div>

            <!-- Description -->
            @if (nodeData.description) {
                <div class="node-description">
                    {{ nodeData.description | slice:0:80 }}{{ nodeData.description.length > 80 ? '...' : '' }}
                </div>
            }

            <!-- Body with Ports -->
            <div class="node-body">
                <!-- Input Ports (Left Side) -->
                <div class="port-column left">
                    @if (inputPorts.length) {
                        @for (port of inputPorts; track port.portPath) {
                            <div class="port-row">
                                <df-input 
                                    [connectorData]="{ nodeId: nodeId, connectorId: inputConnectorId(port.portPath), single: false }"
                                    [position]="positions.Left"
                                    class="port-connector"
                                    [class.disabled]="!isEnabled">
                                </df-input>
                                <span class="port-label"
                                      [class.scope-session]="portScope(port.portPath) === 'session'"
                                      [class.scope-project]="portScope(port.portPath) === 'project'"
                                      [class.scope-both]="portScope(port.portPath) === 'both'"
                                      [class.scope-none]="!portScope(port.portPath)"
                                      [matTooltip]="port.dataType || 'any'">
                                    {{ port.label || port.portPath }}
                                </span>
                            </div>
                        }
                    } @else {
                        <div class="port-row empty">
                            <span class="port-label muted">{{ 'templates.canvas.no_inputs' | translate }}</span>
                        </div>
                    }
                </div>

                <!-- Output Ports (Right Side) -->
                <div class="port-column right">
                    @if (outputPorts.length) {
                        @for (port of outputPorts; track port.portPath) {
                            <div class="port-row">
                                <span class="port-label"
                                      [class.scope-session]="portScope(port.portPath) === 'session'"
                                      [class.scope-project]="portScope(port.portPath) === 'project'"
                                      [class.scope-both]="portScope(port.portPath) === 'both'"
                                      [class.scope-none]="!portScope(port.portPath)"
                                      [matTooltip]="port.dataType || 'any'">
                                    {{ port.label || port.portPath }}
                                </span>
                                <df-output 
                                    [connectorData]="{ nodeId: nodeId, connectorId: outputConnectorId(port.portPath), single: false }"
                                    [position]="positions.Right"
                                    class="port-connector"
                                    [class.disabled]="!isEnabled">
                                </df-output>
                            </div>
                        }
                    } @else {
                        <div class="port-row empty">
                            <span class="port-label muted">{{ 'templates.canvas.no_outputs' | translate }}</span>
                        </div>
                    }
                </div>
            </div>

            <!-- Footer -->
            <div class="node-footer">
                <mat-icon class="link-icon">link</mat-icon>
                <span class="port-count">
                    {{ inputPorts.length }} {{ 'templates.canvas.inputs' | translate }} / 
                    {{ outputPorts.length }} {{ 'templates.canvas.outputs' | translate }}
                </span>
            </div>
        </div>
    `,
    styles: [`
        :host {
            display: block;
            position: relative;
        }

        .project-template-node {
            min-width: 220px;
            max-width: 320px;
            background: var(--mat-sys-primary);
            border: 2px solid var(--mat-sys-primary);
            border-radius: 12px;
            box-shadow: 0 2px 8px rgba(0, 0, 0, 0.1);
            transition: all 0.2s ease;
            overflow: visible;
            position: relative;
            cursor: pointer;
            color: #fff;

            &.selected {
                border-color: var(--mat-sys-tertiary);
                box-shadow: 0 4px 20px rgba(var(--mat-sys-primary-rgb), 0.3);
            }

            &.disabled {
                opacity: 0.7;
                border-color: var(--mat-sys-outline);

                .node-header {
                    background: var(--mat-sys-surface-variant);
                }
            }

            &:hover {
                box-shadow: 0 4px 16px rgba(0, 0, 0, 0.15);
                transform: translateY(-1px);
            }
        }

        .node-header {
            display: flex;
            align-items: center;
            gap: 8px;
            padding: 10px 12px;
            color: #fff;
            border-radius: 10px 10px 0 0;
            cursor: grab;

            &:active {
                cursor: grabbing;
            }

            .node-icon {
                font-size: 20px;
                width: 20px;
                height: 20px;
            }

            .node-label {
                flex: 1;
                font-weight: 500;
                font-size: 14px;
                white-space: nowrap;
                overflow: hidden;
                text-overflow: ellipsis;
            }

            .status-badge {
                font-size: 10px;
                padding: 2px 6px;
                border-radius: 8px;
                background: rgba(255, 255, 255, 0.2);
                text-transform: uppercase;
                font-weight: 600;

                &.enabled {
                    background: rgba(76, 175, 80, 0.8);
                }
            }

            .menu-btn {
                color: var(--mat-sys-on-primary);
            }
        }

        .node-description {
            padding: 8px 12px;
            font-size: 12px;
            color: var(--mat-sys-on-surface-variant);
            background: var(--mat-sys-surface-container);
            border-bottom: 1px solid var(--mat-sys-outline-variant);
        }

        .node-body {
            display: grid;
            grid-template-columns: minmax(0, 1fr) minmax(0, 1fr);
            align-items: start;
            padding: 14px 10px;
            gap: 10px;
        }

        .port-column {
            display: flex;
            flex-direction: column;
            gap: 10px;
            min-width: 0;

            &.left {
                align-items: flex-start;
                justify-self: start;

                .port-row {
                    flex-direction: row;
                }

                .port-connector {
                    position: absolute;
                    left: -22px;
                    margin: 0;
                }
            }

            &.right {
                align-items: flex-end;
                justify-self: end;

                .port-row {
                    flex-direction: row-reverse;
                }

                .port-connector {
                    position: absolute;
                    right: -22px;
                    margin: 0;
                }
            }
        }

        .port-row {
            display: flex;
            align-items: center;
            gap: 6px;
            width: 100%;
            min-height: 20px;
            position: relative;

            &.empty {
                .port-label {
                    font-style: italic;
                    opacity: 0.6;
                }
            }
        }

        .port-label {
            font-size: 12px;
            color: var(--mat-sys-on-surface);
            white-space: nowrap;
            overflow: hidden;
            text-overflow: ellipsis;
            max-width: 130px;
            font-weight: 500;
            padding: 3px 8px;
            background: var(--mat-sys-surface-container);
            border-radius: 6px;
            border: 1px solid transparent;

            &.muted {
                color: var(--mat-sys-on-surface-variant);
                background: transparent;
            }

            &.scope-session {
                background: #fff3e0;
                border-color: #ffcc80;
                color: #e65100;
            }

            &.scope-project {
                background: #e8f5e9;
                border-color: #a5d6a7;
                color: #1b5e20;
            }

            &.scope-both {
                background: linear-gradient(90deg, #fff3e0 0%, #e8f5e9 100%);
                border-color: #c8e6c9;
                color: #33691e;
            }

            &.scope-none {
                background: transparent;
                border-style: dashed;
                border-color: color-mix(in srgb, var(--mat-sys-outline) 60%, transparent);
                color: var(--mat-sys-on-surface-variant);
            }
        }

        .port-connector {
            --df-connector-size: 18px;
            cursor: crosshair;

            &.disabled {
                pointer-events: none;
                opacity: 0.55;
                cursor: default;
            }
        }

        .node-footer {
            display: flex;
            align-items: center;
            gap: 6px;
            padding: 8px 12px;
            background: var(--mat-sys-surface-container);
            border-radius: 0 0 10px 10px;
            border-top: 1px solid var(--mat-sys-outline-variant);
            font-size: 11px;
            color: var(--mat-sys-on-surface-variant);

            .link-icon {
                font-size: 14px;
                width: 14px;
                height: 14px;
            }
        }

        .delete-action {
            color: var(--mat-sys-error);
        }
    `],
})
export class ProjectTemplateNodeComponent extends DrawFlowBaseNode implements OnInit, OnDestroy {
    private readonly router = inject(Router);
    private readonly changeDetector = inject(ChangeDetectorRef);
    private refreshSub?: Subscription;
    private lastModelString?: string;
    private optimisticEnabled?: boolean;
    
    readonly positions = DfConnectorPosition;

    ngOnInit(): void {
        // Poll for model changes since ng-draw-flow doesn't notify on data updates
        this.refreshSub = interval(50).subscribe(() => {
            try {
                const currentModelString = JSON.stringify({ 
                    enabled: this.model?.['enabled'],
                    templateName: this.model?.['templateName'],
                    portDataScopes: this.model?.['portDataScopes'],
                    exposedInputs: (this.model?.['exposedInputs'] ?? []).map((port: DataPortScopeConfig) => ({
                        portPath: port.portPath,
                        label: port.label,
                        dataType: port.dataType,
                    })),
                    exposedOutputs: (this.model?.['exposedOutputs'] ?? []).map((port: DataPortScopeConfig) => ({
                        portPath: port.portPath,
                        label: port.label,
                        dataType: port.dataType,
                    })),
                });
                if (this.lastModelString !== currentModelString) {
                    this.lastModelString = currentModelString;
                    this.optimisticEnabled = undefined;
                    this.changeDetector.detectChanges();
                }
            } catch {
                // Ignore JSON stringify errors
            }
        });
    }

    ngOnDestroy(): void {
        this.refreshSub?.unsubscribe();
    }

    get nodeData(): ProjectTemplateNodeData {
        return this.model as unknown as ProjectTemplateNodeData;
    }

    get inputPorts(): DataPortScopeConfig[] {
        return this.nodeData.exposedInputs ?? [];
    }

    get outputPorts(): DataPortScopeConfig[] {
        return this.nodeData.exposedOutputs ?? [];
    }

    portScope(portPath: string): DataScope | null {
        const scopes = this.nodeData.portDataScopes;
        if (!Array.isArray(scopes) || !scopes.length) {
            return null;
        }
        return scopes.find(scope => scope.portId === portPath)?.scope ?? null;
    }

    get isEnabled(): boolean {
        return this.optimisticEnabled ?? !!this.nodeData.enabled;
    }

    inputConnectorId(portPath: string): string {
        return `in::${portPath}`;
    }

    outputConnectorId(portPath: string): string {
        return `out::${portPath}`;
    }

    onNavigate(event: Event): void {
        event.stopPropagation();
        this.router.navigate(['/genai-workflows/templates/builder', this.nodeData.templateId]);
    }

    onConfigure(): void {
        // Emit event to parent canvas to open configure dialog
        this.dispatchNodeEvent('configure', this.nodeData.assignmentId);
    }

    onToggle(): void {
        this.optimisticEnabled = !this.isEnabled;
        this.changeDetector.detectChanges();
        // Emit event to parent canvas to toggle enabled state
        this.dispatchNodeEvent('toggle', this.nodeData.assignmentId);
    }

    onRemove(): void {
        // Emit event to parent canvas to remove template
        this.dispatchNodeEvent('remove', this.nodeData.assignmentId);
    }

    private dispatchNodeEvent(action: string, assignmentId: string): void {
        // Dispatch custom event for parent to handle
        const event = new CustomEvent('nodeAction', {
            bubbles: true,
            detail: { action, assignmentId },
        });
        (document.querySelector(`[data-assignment-id="${assignmentId}"]`) ?? document)
            .dispatchEvent(event);
    }
}

