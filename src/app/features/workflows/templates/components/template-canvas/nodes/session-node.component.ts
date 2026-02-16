/**
 * Template Session Node Component
 * 
 * NOTE: This component is currently not in use.
 * The template canvas builder uses an inline card-based approach.
 * This file is preserved for potential future ng-draw-flow integration.
 */

import { Component, Input } from '@angular/core';
import { CommonModule } from '@angular/common';
import { MatIconModule } from '@angular/material/icon';
import { MatTooltipModule } from '@angular/material/tooltip';
import { MatChipsModule } from '@angular/material/chips';
import { TranslateModule } from '@ngx-translate/core';

export interface StoredPort {
    portId: string;
    label: string;
    dataType: string;
}

export interface SessionNodeData {
    label?: string;
    storedPorts?: StoredPort[];
}

@Component({
    selector: 'app-template-session-node',
    standalone: true,
    imports: [CommonModule, MatIconModule, MatTooltipModule, MatChipsModule, TranslateModule],
    template: `
        <div class="session-node" [class.selected]="selected">
            <div class="node-header">
                <mat-icon>storage</mat-icon>
                <span class="node-label">{{ data?.label || 'Session Storage' }}</span>
            </div>
            
            <div class="node-body">
                <div class="session-description">
                    {{ 'templates.canvas.session_desc' | translate }}
                </div>
                
                <!-- Stored Data Ports -->
                @if (data?.storedPorts?.length) {
                    <div class="stored-data">
                        <div class="section-label">{{ 'templates.canvas.stored_data' | translate }}</div>
                        @for (port of data?.storedPorts; track port.portId) {
                            <div class="stored-item">
                                <div class="port-dot input"
                                     [matTooltip]="'Store: ' + port.label">
                                </div>
                                <span class="port-name">{{ port.label }}</span>
                                <mat-chip class="data-type">{{ port.dataType }}</mat-chip>
                                <div class="port-dot output"
                                     [matTooltip]="'Retrieve: ' + port.label">
                                </div>
                            </div>
                        }
                    </div>
                } @else {
                    <!-- Default Store/Retrieve ports -->
                    <div class="default-ports">
                        <div class="port-row">
                            <div class="port-dot input"
                                 [matTooltip]="'templates.canvas.store_tooltip' | translate">
                            </div>
                            <span class="port-label">{{ 'templates.canvas.store' | translate }}</span>
                            <span class="port-label">{{ 'templates.canvas.retrieve' | translate }}</span>
                            <div class="port-dot output"
                                 [matTooltip]="'templates.canvas.retrieve_tooltip' | translate">
                            </div>
                        </div>
                    </div>
                }
                
                <div class="session-hint">
                    <mat-icon>info</mat-icon>
                    <span>{{ 'templates.canvas.session_hint' | translate }}</span>
                </div>
            </div>
        </div>
    `,
    styles: [`
        :host {
            display: block;
        }

        .session-node {
            min-width: 220px;
            background: white;
            border: 2px solid #ff9800;
            border-radius: 12px;
            box-shadow: 0 2px 8px rgba(0, 0, 0, 0.1);
            transition: all 0.2s ease;

            &.selected {
                border-color: #f57c00;
                box-shadow: 0 4px 16px rgba(255, 152, 0, 0.3);
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
            background: linear-gradient(135deg, #ff9800 0%, #f57c00 100%);
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

        .session-description {
            font-size: 11px;
            color: #666;
            line-height: 1.4;
        }

        .stored-data {
            .section-label {
                font-size: 10px;
                font-weight: 600;
                text-transform: uppercase;
                color: #ff9800;
                margin-bottom: 8px;
            }

            .stored-item {
                display: flex;
                align-items: center;
                gap: 8px;
                padding: 4px 0;

                .port-name {
                    flex: 1;
                    font-size: 12px;
                    font-weight: 500;
                }

                .data-type {
                    font-size: 10px;
                    padding: 2px 6px;
                    height: auto;
                    min-height: 0;
                }
            }
        }

        .default-ports {
            .port-row {
                display: flex;
                align-items: center;
                justify-content: space-between;
                gap: 8px;
                padding: 8px 0;

                .port-label {
                    font-size: 12px;
                    color: #666;
                }
            }
        }

        .port-dot {
            width: 12px;
            height: 12px;
            border-radius: 50%;
            border: 2px solid white;
            box-shadow: 0 1px 4px rgba(0, 0, 0, 0.2);
            cursor: pointer;
            transition: transform 0.2s ease;
            flex-shrink: 0;

            &:hover {
                transform: scale(1.3);
            }

            &.input {
                background: #4caf50;
            }

            &.output {
                background: #2196f3;
            }
        }

        .session-hint {
            display: flex;
            align-items: flex-start;
            gap: 6px;
            padding: 8px;
            background: rgba(255, 152, 0, 0.1);
            border-radius: 6px;
            font-size: 11px;
            color: #666;

            mat-icon {
                font-size: 14px;
                width: 14px;
                height: 14px;
                color: #ff9800;
                flex-shrink: 0;
            }
        }
    `],
})
export class TemplateSessionNodeComponent {
    @Input() data?: SessionNodeData;
    @Input() selected = false;
}
