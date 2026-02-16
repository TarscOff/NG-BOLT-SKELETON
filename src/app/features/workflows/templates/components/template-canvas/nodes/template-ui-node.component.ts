/**
 * Template UI Node Component
 * 
 * A ng-draw-flow node component for UI Components (Tier 3) in the Template Canvas.
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

export type UIComponentType = 'chat' | 'file-upload' | 'summarize' | 'extract' | 'compare' | 'result-viewer';

@Component({
    selector: 'app-template-ui-df-node',
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
        <div class="template-ui-node" 
             [class.selected]="selected"
             [attr.data-ui-type]="uiType">
            
            <!-- Header -->
            <div class="node-header" [attr.data-node-id]="nodeId">
                <mat-icon class="node-icon">{{ uiIcon }}</mat-icon>
                <span class="node-label">{{ model['label'] || uiLabel }}</span>
                <button mat-icon-button 
                        class="delete-btn"
                        (click)="onDelete($event)"
                        [matTooltip]="'common.delete' | translate">
                    <mat-icon>close</mat-icon>
                </button>
            </div>

            <!-- UI Preview Mini -->
            <div class="node-preview">
                @switch (uiType) {
                    @case ('chat') {
                        <div class="preview-chat">
                            <div class="msg user"></div>
                            <div class="msg assistant"></div>
                            <div class="input-bar"></div>
                        </div>
                    }
                    @case ('file-upload') {
                        <div class="preview-upload">
                            <mat-icon>cloud_upload</mat-icon>
                        </div>
                    }
                    @case ('summarize') {
                        <div class="preview-doc">
                            <div class="line"></div>
                            <div class="line short"></div>
                            <div class="line"></div>
                        </div>
                    }
                    @case ('extract') {
                        <div class="preview-extract">
                            <mat-icon>content_paste_search</mat-icon>
                        </div>
                    }
                    @case ('compare') {
                        <div class="preview-compare">
                            <div class="side left"></div>
                            <div class="side right"></div>
                        </div>
                    }
                    @case ('result-viewer') {
                        <div class="preview-result">
                            <mat-icon>visibility</mat-icon>
                        </div>
                    }
                    @default {
                        <mat-icon class="default-icon">widgets</mat-icon>
                    }
                }
            </div>

            <!-- Body with Ports -->
            <div class="node-body">
                <!-- Input Ports (Left Side) -->
                <div class="port-column left">
                    @for (port of inputPorts; track port.id) {
                        <div class="port-row">
                            <df-input 
                                [connectorData]="{ nodeId: nodeId, connectorId: inputConnectorId(port.id), single: false }"
                                [position]="positions.Left"
                                class="port-connector">
                            </df-input>
                            <span class="port-label" [matTooltip]="port.dataType">
                                {{ port.label }}
                            </span>
                        </div>
                    }
                </div>

                <!-- Output Ports (Right Side) -->
                <div class="port-column right">
                    @for (port of outputPorts; track port.id) {
                        <div class="port-row">
                            <span class="port-label" [matTooltip]="port.dataType">
                                {{ port.label }}
                            </span>
                            <df-output 
                                [connectorData]="{ nodeId: nodeId, connectorId: outputConnectorId(port.id), single: false }"
                                [position]="positions.Right"
                                class="port-connector">
                            </df-output>
                        </div>
                    }
                </div>
            </div>
        </div>
    `,
    styles: [`
        :host {
            display: block;
            position: relative;
        }

        .template-ui-node {
            min-width: 180px;
            max-width: 260px;
            background: #e3f2fd;
            border: 2px solid #2196f3;
            border-radius: 12px;
            box-shadow: 0 2px 8px rgba(0, 0, 0, 0.1);
            transition: all 0.2s ease;
            overflow: visible;
            position: relative;

            &.selected {
                border-color: #1976d2;
                box-shadow: 0 4px 20px rgba(33, 150, 243, 0.3);
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
            background: linear-gradient(135deg, #2196f3 0%, #1976d2 100%);
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

        .node-preview {
            padding: 12px;
            background: rgba(33, 150, 243, 0.1);
            border-bottom: 1px solid rgba(33, 150, 243, 0.2);
            min-height: 50px;
            display: flex;
            align-items: center;
            justify-content: center;

            .preview-chat {
                width: 100%;
                display: flex;
                flex-direction: column;
                gap: 4px;

                .msg {
                    height: 8px;
                    border-radius: 4px;
                    
                    &.user {
                        width: 60%;
                        background: #e3f2fd;
                        align-self: flex-end;
                    }
                    
                    &.assistant {
                        width: 75%;
                        background: #f5f5f5;
                    }
                }

                .input-bar {
                    height: 12px;
                    background: white;
                    border: 1px solid #e0e0e0;
                    border-radius: 6px;
                    margin-top: 4px;
                }
            }

            .preview-upload {
                mat-icon {
                    font-size: 32px;
                    width: 32px;
                    height: 32px;
                    color: #2196f3;
                }
            }

            .preview-doc {
                width: 100%;
                display: flex;
                flex-direction: column;
                gap: 4px;

                .line {
                    height: 6px;
                    background: #e0e0e0;
                    border-radius: 3px;

                    &.short {
                        width: 60%;
                    }
                }
            }

            .preview-extract {
                mat-icon {
                    font-size: 32px;
                    width: 32px;
                    height: 32px;
                    color: #ff9800;
                }
            }

            .preview-compare {
                display: flex;
                gap: 4px;
                width: 100%;

                .side {
                    flex: 1;
                    height: 30px;
                    background: #f5f5f5;
                    border-radius: 4px;

                    &.left {
                        border-left: 3px solid #4caf50;
                    }

                    &.right {
                        border-left: 3px solid #f44336;
                    }
                }
            }

            .preview-result {
                mat-icon {
                    font-size: 32px;
                    width: 32px;
                    height: 32px;
                    color: #9c27b0;
                }
            }

            .default-icon {
                font-size: 32px;
                width: 32px;
                height: 32px;
                color: var(--mat-sys-on-surface-variant);
            }
        }

        .node-body {
            display: flex;
            justify-content: space-between;
            padding: 16px 12px;
            min-height: 40px;
            gap: 16px;
            position: relative;
        }

        .port-column {
            position: absolute;
            top: 0;
            bottom: 0;
            display: flex;
            flex-direction: column;
            justify-content: center;
            gap: 12px;
            z-index: 100;

            &.left {
                left: 0;
                align-items: flex-start;
                
                .port-row {
                    flex-direction: row;
                }

                .port-connector {
                    position: absolute;
                    left: -10px;
                }

                .port-label {
                    margin-left: 16px;
                }
            }

            &.right {
                right: 0;
                align-items: flex-end;
                
                .port-row {
                    flex-direction: row-reverse;
                }

                .port-connector {
                    position: absolute;
                    right: -10px;
                }

                .port-label {
                    margin-right: 16px;
                }
            }
        }

        .port-row {
            display: flex;
            align-items: center;
            gap: 8px;
            position: relative;
            min-height: 20px;
        }

        .port-label {
            font-size: 12px;
            color: #333;
            max-width: 80px;
            white-space: nowrap;
            overflow: hidden;
            text-overflow: ellipsis;
            font-weight: 500;
            background: rgba(255, 255, 255, 0.9);
            padding: 3px 8px;
            border-radius: 4px;
            box-shadow: 0 1px 3px rgba(0, 0, 0, 0.1);
        }

        .port-connector {
            --df-connector-background: #2196f3;
            --df-connector-size: 18px;
            --df-connector-border: 2px solid white;
            width: 18px;
            height: 18px;
            display: block;
            cursor: pointer;
            position: relative;
            z-index: 10;
        }

        /* Dark mode */
        :host-context(.dark-theme) {
            .template-ui-node {
                background: #1e3a5f;
            }

            .node-preview {
                background: rgba(33, 150, 243, 0.15);
                border-color: rgba(33, 150, 243, 0.25);
                
                .preview-chat {
                    .msg.user {
                        background: rgba(33, 150, 243, 0.4);
                    }
                    .msg.assistant {
                        background: rgba(255, 255, 255, 0.1);
                    }
                    .input-bar {
                        background: rgba(255, 255, 255, 0.1);
                        border-color: rgba(255, 255, 255, 0.2);
                    }
                }

                .preview-doc .line {
                    background: rgba(255, 255, 255, 0.2);
                }

                .preview-compare .side {
                    background: rgba(255, 255, 255, 0.1);
                }
                
                .default-icon {
                    color: #aaa;
                }
            }

            .port-label {
                color: #e0e0e0;
                background: rgba(30, 30, 30, 0.9);
            }
        }
    `],
})
export class TemplateUiDfNodeComponent extends DrawFlowBaseNode {
    private readonly bus = inject(WfCanvasBus);

    readonly positions = DfConnectorPosition;

    get uiType(): UIComponentType {
        return this.model?.['uiType'] || 'result-viewer';
    }

    get uiIcon(): string {
        const icons: Record<UIComponentType, string> = {
            'chat': 'chat',
            'file-upload': 'upload_file',
            'summarize': 'summarize',
            'extract': 'find_in_page',
            'compare': 'compare',
            'result-viewer': 'visibility',
        };
        return icons[this.uiType] || 'widgets';
    }

    get uiLabel(): string {
        const labels: Record<UIComponentType, string> = {
            'chat': 'Chat Interface',
            'file-upload': 'File Upload',
            'summarize': 'Summarize',
            'extract': 'Extract',
            'compare': 'Compare',
            'result-viewer': 'Result Viewer',
        };
        return labels[this.uiType] || 'UI Component';
    }

    get inputPorts(): { id: string; label: string; dataType: string }[] {
        const portsByType: Record<UIComponentType, { id: string; label: string; dataType: string }[]> = {
            'chat': [
                { id: 'history', label: 'History', dataType: 'chat_history' },
                { id: 'assistant_response', label: 'AI Response', dataType: 'text' },
                { id: 'files', label: 'Files', dataType: 'file[]' },
            ],
            'file-upload': [],
            'summarize': [{ id: 'summary_result', label: 'Summary Result', dataType: 'json' }],
            'extract': [{ id: 'extraction_result', label: 'Extraction Result', dataType: 'json' }],
            'compare': [{ id: 'comparison_result', label: 'Comparison Result', dataType: 'json' }],
            'result-viewer': [{ id: 'data', label: 'Data', dataType: 'any' }],
        };
        return portsByType[this.uiType] || [];
    }

    get outputPorts(): { id: string; label: string; dataType: string }[] {
        const portsByType: Record<UIComponentType, { id: string; label: string; dataType: string }[]> = {
            'chat': [
                { id: 'user_query', label: 'User Query', dataType: 'text' },
                { id: 'uploaded_files', label: 'Attachments', dataType: 'file[]' },
            ],
            'file-upload': [{ id: 'files', label: 'Files', dataType: 'file[]' }],
            'summarize': [
                { id: 'source_file', label: 'Input File', dataType: 'file' },
                { id: 'summary_result', label: 'Summary Result', dataType: 'json' },
            ],
            'extract': [
                { id: 'source_file', label: 'Input File', dataType: 'file' },
                { id: 'extraction_result', label: 'Extraction Result', dataType: 'json' },
            ],
            'compare': [
                { id: 'left_file', label: 'File 1', dataType: 'file' },
                { id: 'right_file', label: 'File 2', dataType: 'file' },
                { id: 'comparison_result', label: 'Comparison Result', dataType: 'json' },
            ],
            'result-viewer': [],
        };
        return portsByType[this.uiType] || [];
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
