/**
 * Template UI Node Component
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

export interface UIBinding {
    portId: string;
    targetPath: string;
}

export interface UINodeData {
    label?: string;
    icon?: string;
    uiType?: string;
    bindings?: UIBinding[];
}

@Component({
    selector: 'app-template-ui-node',
    standalone: true,
    imports: [CommonModule, MatIconModule, MatTooltipModule, TranslateModule],
    template: `
        <div class="ui-node" [class.selected]="selected" [attr.data-ui-type]="data?.uiType || 'custom'">
            <div class="node-header" [style.background]="getHeaderGradient()">
                <mat-icon>{{ data?.icon || 'widgets' }}</mat-icon>
                <span class="node-label">{{ data?.label || 'UI Component' }}</span>
            </div>
            
            <div class="node-body">
                <div class="ui-preview" [attr.data-type]="data?.uiType">
                    @switch (data?.uiType) {
                        @case ('chat') {
                            <div class="preview-chat">
                                <div class="chat-messages">
                                    <div class="msg-bubble user"></div>
                                    <div class="msg-bubble assistant"></div>
                                </div>
                                <div class="chat-input"></div>
                            </div>
                        }
                        @case ('file-uploader') {
                            <div class="preview-uploader">
                                <mat-icon>cloud_upload</mat-icon>
                                <span>{{ 'templates.canvas.drop_files' | translate }}</span>
                            </div>
                        }
                        @case ('result-viewer') {
                            <div class="preview-viewer">
                                <div class="viewer-line"></div>
                                <div class="viewer-line short"></div>
                                <div class="viewer-line"></div>
                            </div>
                        }
                        @case ('text-input') {
                            <div class="preview-input">
                                <div class="input-field"></div>
                            </div>
                        }
                        @default {
                            <mat-icon>widgets</mat-icon>
                        }
                    }
                </div>

                <!-- Ports -->
                <div class="ports-section">
                    @switch (data?.uiType) {
                        @case ('chat') {
                            <div class="port-group outputs">
                                <div class="port-item">
                                    <div class="port-dot output"
                                         data-connector-id="query"
                                         [matTooltip]="'templates.canvas.chat_query_tooltip' | translate">
                                    </div>
                                    <span>{{ 'templates.canvas.query' | translate }}</span>
                                </div>
                                <div class="port-item">
                                    <div class="port-dot output"
                                         data-connector-id="history"
                                         [matTooltip]="'templates.canvas.chat_history_tooltip' | translate">
                                    </div>
                                    <span>{{ 'templates.canvas.history' | translate }}</span>
                                </div>
                            </div>
                            <div class="port-group inputs">
                                <div class="port-item right">
                                    <span>{{ 'templates.canvas.response' | translate }}</span>
                                    <div class="port-dot input"
                                         data-connector-id="response"
                                         [matTooltip]="'templates.canvas.chat_response_tooltip' | translate">
                                    </div>
                                </div>
                                <div class="port-item right">
                                    <span>{{ 'templates.canvas.messages' | translate }}</span>
                                    <div class="port-dot input"
                                         data-connector-id="messages"
                                         [matTooltip]="'templates.canvas.chat_messages_tooltip' | translate">
                                    </div>
                                </div>
                            </div>
                        }
                        @case ('file-uploader') {
                            <div class="port-group outputs">
                                <div class="port-item">
                                    <div class="port-dot output"
                                         data-connector-id="files"
                                         [matTooltip]="'templates.canvas.files_tooltip' | translate">
                                    </div>
                                    <span>{{ 'templates.canvas.files' | translate }}</span>
                                </div>
                                <div class="port-item">
                                    <div class="port-dot output"
                                         data-connector-id="metadata"
                                         [matTooltip]="'templates.canvas.metadata_tooltip' | translate">
                                    </div>
                                    <span>{{ 'templates.canvas.metadata' | translate }}</span>
                                </div>
                            </div>
                        }
                        @case ('result-viewer') {
                            <div class="port-group inputs">
                                <div class="port-item right">
                                    <span>{{ 'templates.canvas.data' | translate }}</span>
                                    <div class="port-dot input"
                                         data-connector-id="data"
                                         [matTooltip]="'templates.canvas.data_tooltip' | translate">
                                    </div>
                                </div>
                                <div class="port-item right">
                                    <span>{{ 'templates.canvas.format' | translate }}</span>
                                    <div class="port-dot input"
                                         data-connector-id="format"
                                         [matTooltip]="'templates.canvas.format_tooltip' | translate">
                                    </div>
                                </div>
                            </div>
                        }
                        @case ('text-input') {
                            <div class="port-group outputs">
                                <div class="port-item">
                                    <div class="port-dot output"
                                         data-connector-id="value"
                                         [matTooltip]="'templates.canvas.value_tooltip' | translate">
                                    </div>
                                    <span>{{ 'templates.canvas.value' | translate }}</span>
                                </div>
                            </div>
                        }
                    }
                </div>
            </div>
        </div>
    `,
    styles: [`
        :host {
            display: block;
        }

        .ui-node {
            min-width: 180px;
            background: white;
            border: 2px solid #2196f3;
            border-radius: 12px;
            box-shadow: 0 2px 8px rgba(0, 0, 0, 0.1);
            transition: all 0.2s ease;

            &.selected {
                border-color: #1976d2;
                box-shadow: 0 4px 16px rgba(33, 150, 243, 0.3);
            }

            &:hover {
                box-shadow: 0 4px 16px rgba(0, 0, 0, 0.15);
            }
        }

        .node-header {
            display: flex;
            align-items: center;
            gap: 8px;
            padding: 10px 14px;
            color: white;
            border-radius: 10px 10px 0 0;

            mat-icon {
                font-size: 18px;
                width: 18px;
                height: 18px;
            }

            .node-label {
                font-weight: 500;
                font-size: 13px;
            }
        }

        .node-body {
            padding: 12px;
            display: flex;
            flex-direction: column;
            gap: 12px;
        }

        // UI Preview Styles
        .ui-preview {
            padding: 12px;
            background: #f5f5f5;
            border-radius: 8px;
            display: flex;
            flex-direction: column;
            align-items: center;
            justify-content: center;
            min-height: 60px;
        }

        .preview-chat {
            width: 100%;

            .chat-messages {
                display: flex;
                flex-direction: column;
                gap: 4px;
                margin-bottom: 8px;

                .msg-bubble {
                    height: 8px;
                    border-radius: 4px;

                    &.user {
                        width: 60%;
                        margin-left: auto;
                        background: #2196f3;
                    }

                    &.assistant {
                        width: 70%;
                        background: #e0e0e0;
                    }
                }
            }

            .chat-input {
                height: 12px;
                background: white;
                border: 1px solid #ddd;
                border-radius: 6px;
            }
        }

        .preview-uploader {
            display: flex;
            flex-direction: column;
            align-items: center;
            gap: 4px;
            color: #999;

            mat-icon {
                font-size: 24px;
                width: 24px;
                height: 24px;
            }

            span {
                font-size: 10px;
            }
        }

        .preview-viewer {
            width: 100%;
            display: flex;
            flex-direction: column;
            gap: 4px;

            .viewer-line {
                height: 6px;
                background: #e0e0e0;
                border-radius: 3px;

                &.short {
                    width: 60%;
                }
            }
        }

        .preview-input {
            width: 100%;

            .input-field {
                height: 16px;
                background: white;
                border: 1px solid #ddd;
                border-radius: 4px;
            }
        }

        // Port Styles
        .ports-section {
            display: flex;
            justify-content: space-between;
            gap: 16px;
        }

        .port-group {
            display: flex;
            flex-direction: column;
            gap: 6px;

            &.inputs {
                align-items: flex-end;
            }
        }

        .port-item {
            display: flex;
            align-items: center;
            gap: 6px;
            font-size: 11px;
            color: #666;

            &.right {
                flex-direction: row-reverse;
            }
        }

        .port-dot {
            width: 10px;
            height: 10px;
            border-radius: 50%;
            border: 2px solid white;
            box-shadow: 0 1px 3px rgba(0, 0, 0, 0.2);
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

        // Dark mode
        :host-context(html.dark) {
            .ui-node {
                background: var(--mat-surface-color, #1e1e1e);
            }

            .ui-preview {
                background: #2d2d2d;
            }

            .preview-chat {
                .chat-input {
                    background: #3d3d3d;
                    border-color: #555;
                }

                .msg-bubble.assistant {
                    background: #4d4d4d;
                }
            }

            .preview-viewer .viewer-line {
                background: #4d4d4d;
            }

            .preview-input .input-field {
                background: #3d3d3d;
                border-color: #555;
            }

            .port-item {
                color: #aaa;
            }
        }
    `],
})
export class TemplateUINodeComponent {
    @Input() data?: UINodeData;
    @Input() selected = false;

    getHeaderGradient(): string {
        switch (this.data?.uiType) {
            case 'chat':
                return 'linear-gradient(135deg, var(--mat-accent) 0%, var(--mat-accent) 100%)';
            case 'file-uploader':
                return 'linear-gradient(135deg, var(--mat-primary) 0%, var(--mat-primary) 100%)';
            case 'result-viewer':
                return 'linear-gradient(135deg, var(--mat-success) 0%, var(--mat-success) 100%)';
            case 'text-input':
                return 'linear-gradient(135deg, var(--mat-warn) 0%, var(--mat-warn) 100%)';
            default:
                return 'linear-gradient(135deg, var(--mat-neutral) 0%, var(--mat-neutral) 100%)';
        }
    }
}
