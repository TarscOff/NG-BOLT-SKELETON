/**
 * Template Composite Node Component
 * 
 * A ng-draw-flow node component for Composite Workflows in the Template Canvas.
 * Extends DrawFlowBaseNode to integrate with the ng-draw-flow library.
 */

import { Component, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { MatIconModule } from '@angular/material/icon';
import { MatTooltipModule } from '@angular/material/tooltip';
import { MatButtonModule } from '@angular/material/button';
import { TranslateModule } from '@ngx-translate/core';
import {
    DrawFlowBaseNode,
    DfInputComponent,
    DfOutputComponent,
    DfConnectorPosition,
} from '@ng-draw-flow/core';
import { WfCanvasBus } from '../../../utils/wf-canvas-bus';

@Component({
    selector: 'app-template-composite-df-node',
    standalone: true,
    imports: [
        CommonModule,
        MatIconModule,
        MatTooltipModule,
        MatButtonModule,
        TranslateModule,
        DfInputComponent,
        DfOutputComponent,
    ],
    template: `
        <div class="template-composite-node" 
             [class.selected]="selected"
             [class.missing-in]="model['__missingIn']"
             [class.missing-out]="model['__missingOut']">
            
            <!-- Header -->
            <div class="node-header" [attr.data-node-id]="nodeId">
                <mat-icon class="node-icon">hub</mat-icon>
                <span class="node-label">{{ model['label'] || 'Composite' }}</span>
                <button mat-icon-button 
                        class="delete-btn"
                        (click)="onDelete($event)"
                        [matTooltip]="'common.delete' | translate">
                    <mat-icon>close</mat-icon>
                </button>
            </div>

            <!-- Body with Ports -->
            <div class="node-body">
                <!-- Input Ports (Left Side) -->
                <div class="port-column left">
                    @if (inputPorts.length) {
                        @for (port of inputPorts; track port.id) {
                            <div class="port-row">
                                <df-input 
                                    [connectorData]="{ nodeId: nodeId, connectorId: inputConnectorId(port.id), single: false }"
                                    [position]="positions.Left"
                                    class="port-connector">
                                </df-input>
                                <span class="port-label" [matTooltip]="port.artifactType || 'any'">
                                    {{ port.customLabel || port.label || port.id }}
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
                        @for (port of outputPorts; track port.id) {
                            <div class="port-row">
                                <span class="port-label" [matTooltip]="port.artifactType || 'any'">
                                    {{ port.customLabel || port.label || port.id }}
                                </span>
                                <df-output 
                                    [connectorData]="{ nodeId: nodeId, connectorId: outputConnectorId(port.id), single: false }"
                                    [position]="positions.Right"
                                    class="port-connector">
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

            <!-- Footer with Info -->
            @if (compositeId) {
                <div class="node-footer">
                    <mat-icon class="info-icon">info_outline</mat-icon>
                    <span class="composite-id">{{ compositeId | slice:0:8 }}...</span>
                </div>
            }
        </div>
    `,
    styles: [`
        :host {
            display: block;
            position: relative;
        }

        .template-composite-node {
            min-width: 180px;
            max-width: 280px;
            background: #f5f0f8;
            border: 2px solid #9c27b0;
            border-radius: 12px;
            box-shadow: 0 2px 8px rgba(0, 0, 0, 0.1);
            transition: all 0.2s ease;
            overflow: visible;
            position: relative;

            &.selected {
                border-color: #7b1fa2;
                box-shadow: 0 4px 20px rgba(156, 39, 176, 0.3);
            }

            &.missing-in,
            &.missing-out {
                border-color: #ff9800;
            }

            &:hover {
                box-shadow: 0 4px 16px rgba(0, 0, 0, 0.15);
            }
        }

        .node-header {
            display: flex;
            align-items: center;
            gap: 8px;
            padding: 10px 12px;
            background: linear-gradient(135deg, #9c27b0 0%, #7b1fa2 100%);
            color: white;
            border-radius: 10px 10px 0 0;
            cursor: grab;
            position: relative;

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

            .delete-btn {
                opacity: 1;
                color: white;
                background: rgba(255, 255, 255, 0.2);
                border-radius: 50%;  

                &:hover {
                    background: rgba(255, 255, 255, 0.35);
                }
            }
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
            gap: 12px;
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

                .port-label {
                    margin-left: 0;
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

                .port-label {
                    margin-right: 0;
                }
            }
        }

        .port-row {
            display: flex;
            align-items: center;
            gap: 8px;
            width: 100%;
            min-height: 20px;
            position: relative;

            &.empty {
                opacity: 0.5;
            }
        }

        .port-label {
            font-size: 12px;
            color: #333;
            max-width: 130px;
            white-space: nowrap;
            overflow: hidden;
            text-overflow: ellipsis;
            font-weight: 500;
            background: rgba(255, 255, 255, 0.9);
            padding: 3px 8px;
            border-radius: 4px;
            box-shadow: 0 1px 3px rgba(0, 0, 0, 0.1);

            &.muted {
                color: #888;
                font-style: italic;
            }
        }

        .port-connector {
            --df-connector-background: #9c27b0;
            --df-connector-size: 18px;
            --df-connector-border: 2px solid white;
            width: 18px;
            height: 18px;
            display: block;
            cursor: pointer;
            position: relative;
            z-index: 10;
        }

        .node-footer {
            display: flex;
            align-items: center;
            gap: 6px;
            padding: 6px 12px;
            background: rgba(156, 39, 176, 0.1);
            border-top: 1px solid rgba(156, 39, 176, 0.2);
            border-radius: 0 0 10px 10px;
            font-size: 11px;
            color: #666;

            .info-icon {
                font-size: 14px;
                width: 14px;
                height: 14px;
            }
        }

        /* Dark mode */
        :host-context(.dark-theme) {
            .template-composite-node {
                background: #2d2535;
            }

            .port-label {
                color: #e0e0e0;
                background: rgba(30, 30, 30, 0.9);

                &.muted {
                    color: #999;
                }
            }

            .node-footer {
                background: rgba(156, 39, 176, 0.15);
                color: #aaa;
            }
        }
    `],
})
export class TemplateCompositeDfNodeComponent extends DrawFlowBaseNode {
    private readonly bus = inject(WfCanvasBus);

    readonly positions = DfConnectorPosition;

    get compositeId(): string | undefined {
        return this.model?.['compositeId'];
    }

    get inputPorts(): { id: string; label?: string; customLabel?: string; artifactType?: string }[] {
        return this.model?.['exposedInputs'] || [];
    }

    get outputPorts(): { id: string; label?: string; customLabel?: string; artifactType?: string }[] {
        return this.model?.['exposedOutputs'] || [];
    }

    inputConnectorId(portId: string): string {
        return `${this.nodeId}::in::${portId}`;
    }

    outputConnectorId(portId: string): string {
        return `${this.nodeId}::out::${portId}`;
    }

    onDelete(event: MouseEvent): void {
        event.stopPropagation();
        this.bus.onNodeDelete$.next({ nodeId: this.nodeId });
    }
}
