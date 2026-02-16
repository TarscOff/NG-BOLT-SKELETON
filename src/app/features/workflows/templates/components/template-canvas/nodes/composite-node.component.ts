/**
 * Template Composite Node Component
 * 
 * NOTE: This component is currently not in use.
 * The template canvas builder uses an inline card-based approach.
 * This file is preserved for potential future ng-draw-flow integration.
 */

import { Component, Input } from '@angular/core';
import { CommonModule } from '@angular/common';
import { MatIconModule } from '@angular/material/icon';
import { MatTooltipModule } from '@angular/material/tooltip';
import { TranslateModule } from '@ngx-translate/core';

export interface CompositeNodeData {
    label: string;
    exposedInputs?: { id: string; label?: string; artifactType?: string }[];
    exposedOutputs?: { id: string; label?: string; artifactType?: string }[];
}

@Component({
    selector: 'app-template-composite-node',
    standalone: true,
    imports: [CommonModule, MatIconModule, MatTooltipModule, TranslateModule],
    template: `
        <div class="composite-node" [class.selected]="selected">
            <div class="node-header">
                <mat-icon>hub</mat-icon>
                <span class="node-label">{{ data?.label || 'Composite' }}</span>
            </div>
            
            <div class="node-body">
                <!-- Input Ports -->
                @if (data?.exposedInputs?.length) {
                    <div class="port-section inputs">
                        <div class="port-label">{{ 'templates.canvas.inputs' | translate }}</div>
                        @for (input of data?.exposedInputs; track input.id) {
                            <div class="port-item">
                                <div class="port-dot input" 
                                     [matTooltip]="(input.label || input.id) + ' (' + (input.artifactType || 'any') + ')'">
                                </div>
                                <span class="port-name">{{ input.label || input.id }}</span>
                            </div>
                        }
                    </div>
                }
                
                <!-- Output Ports -->
                @if (data?.exposedOutputs?.length) {
                    <div class="port-section outputs">
                        <div class="port-label">{{ 'templates.canvas.outputs' | translate }}</div>
                        @for (output of data?.exposedOutputs; track output.id) {
                            <div class="port-item">
                                <span class="port-name">{{ output.label || output.id }}</span>
                                <div class="port-dot output"
                                     [matTooltip]="(output.label || output.id) + ' (' + (output.artifactType || 'any') + ')'">
                                </div>
                            </div>
                        }
                    </div>
                }
                
                @if (!data?.exposedInputs?.length && !data?.exposedOutputs?.length) {
                    <div class="no-ports">
                        <mat-icon>info</mat-icon>
                        <span>{{ 'templates.canvas.no_ports' | translate }}</span>
                    </div>
                }
            </div>
        </div>
    `,
    styles: [`
        :host {
            display: block;
        }

        .composite-node {
            min-width: 200px;
            background: white;
            border: 2px solid #9c27b0;
            border-radius: 12px;
            box-shadow: 0 2px 8px rgba(0, 0, 0, 0.1);
            transition: all 0.2s ease;

            &.selected {
                border-color: var(--mat-primary);
                box-shadow: 0 4px 16px rgba(156, 39, 176, 0.3);
            }

            &:hover {
                box-shadow: 0 4px 16px rgba(0, 0, 0, 0.15);
            }
        }

        .node-header {
            display: flex;
            align-items: center;
            gap: 8px;
            padding: 12px 16px;
            background: linear-gradient(135deg, #9c27b0 0%, #7b1fa2 100%);
            color: white;
            border-radius: 10px 10px 0 0;

            mat-icon {
                font-size: 20px;
                width: 20px;
                height: 20px;
            }

            .node-label {
                font-weight: 500;
                font-size: 14px;
            }
        }

        .node-body {
            padding: 12px 16px;
            display: flex;
            flex-direction: column;
            gap: 12px;
        }

        .port-section {
            display: flex;
            flex-direction: column;
            gap: 6px;

            .port-label {
                font-size: 10px;
                font-weight: 600;
                text-transform: uppercase;
                color: #9c27b0;
                opacity: 0.8;
            }

            &.outputs {
                align-items: flex-end;

                .port-item {
                    flex-direction: row-reverse;
                }
            }
        }

        .port-item {
            display: flex;
            align-items: center;
            gap: 8px;
        }

        .port-dot {
            width: 12px;
            height: 12px;
            border-radius: 50%;
            background: #9c27b0;
            border: 2px solid white;
            box-shadow: 0 1px 4px rgba(0, 0, 0, 0.2);
            cursor: pointer;
            transition: transform 0.2s ease;

            &:hover {
                transform: scale(1.3);
            }

            &.input {
                background: #4caf50;
            }

            &.output {
                background: #ff9800;
            }
        }

        .port-name {
            font-size: 12px;
            color: #333;
        }

        .no-ports {
            display: flex;
            align-items: center;
            gap: 8px;
            font-size: 12px;
            color: #999;
            padding: 8px 0;

            mat-icon {
                font-size: 16px;
                width: 16px;
                height: 16px;
            }
        }

        // Dark mode
        :host-context(html.dark) {
            .composite-node {
                background: var(--mat-surface-color, #1e1e1e);
            }

            .port-name {
                color: #ccc;
            }

            .no-ports {
                color: #666;
            }
        }
    `],
})
export class TemplateCompositeNodeComponent {
    @Input() data?: CompositeNodeData;
    @Input() selected = false;
}
