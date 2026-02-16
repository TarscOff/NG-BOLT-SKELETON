/**
 * Project UI Node Component
 *
 * A ng-draw-flow node component for UI components (chat, compare, etc.)
 * that can be connected to template ports in the project canvas.
 */

import { ChangeDetectorRef, Component, OnDestroy, OnInit, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { MatIconModule } from '@angular/material/icon';
import { MatTooltipModule } from '@angular/material/tooltip';
import { MatButtonModule } from '@angular/material/button';
import { MatMenuModule } from '@angular/material/menu';
import { TranslateModule } from '@ngx-translate/core';
import {
    DrawFlowBaseNode,
    DfInputComponent,
    DfOutputComponent,
    DfConnectorPosition,
} from '@ng-draw-flow/core';
import { interval, Subscription } from 'rxjs';

/** UI Component types that can be added to the canvas */
export type UIComponentType =
    | 'chat'
    | 'compare'
    | 'file-upload'
    | 'result-viewer'
    | 'result-view'
    | 'markdown'
    | 'summarize'
    | 'extract';

export interface UiPortDefinition {
    id: string;
    label: string;
    dataType: string;
}

export function getProjectUiPorts(uiType: UIComponentType): {
    inputs: UiPortDefinition[];
    outputs: UiPortDefinition[];
} {
    const byType: Record<UIComponentType, { inputs: UiPortDefinition[]; outputs: UiPortDefinition[] }> = {
        chat: {
            inputs: [
                { id: 'history', label: 'History', dataType: 'chat_history' },
                { id: 'assistant_response', label: 'Assistant', dataType: 'string' },
                { id: 'files', label: 'Files', dataType: 'file[]' },
            ],
            outputs: [
                { id: 'user_query', label: 'User Query', dataType: 'string' },
                { id: 'uploaded_files', label: 'Uploaded Files', dataType: 'file[]' },
            ],
        },
        compare: {
            inputs: [
                { id: 'comparison_result', label: 'Comparison Result', dataType: 'json' },
            ],
            outputs: [
                { id: 'left_file', label: 'File A', dataType: 'file' },
                { id: 'right_file', label: 'File B', dataType: 'file' },
                { id: 'comparison_result', label: 'Comparison Result', dataType: 'json' },
            ],
        },
        summarize: {
            inputs: [
                { id: 'summary_result', label: 'Summary Result', dataType: 'json' },
            ],
            outputs: [
                { id: 'source_file', label: 'Source File', dataType: 'file' },
                { id: 'summary_result', label: 'Summary Result', dataType: 'json' },
            ],
        },
        extract: {
            inputs: [
                { id: 'extraction_result', label: 'Extraction Result', dataType: 'json' },
            ],
            outputs: [
                { id: 'source_file', label: 'Source File', dataType: 'file' },
                { id: 'extraction_result', label: 'Extraction Result', dataType: 'json' },
            ],
        },
        'file-upload': {
            inputs: [],
            outputs: [{ id: 'files', label: 'Files', dataType: 'file[]' }],
        },
        'result-viewer': {
            inputs: [{ id: 'value', label: 'Value', dataType: 'any' }],
            outputs: [],
        },
        'result-view': {
            inputs: [{ id: 'result', label: 'Result', dataType: 'any' }],
            outputs: [],
        },
        markdown: {
            inputs: [{ id: 'markdown', label: 'Markdown/Text', dataType: 'string' }],
            outputs: [],
        },
    };

    return byType[uiType] ?? { inputs: [], outputs: [] };
}

interface ProjectUINodeData {
    uiType: UIComponentType;
    label: string;
    icon: string;
    description?: string;
    bindings?: { portId: string; targetPath: string }[];
    disabled?: boolean;
}

@Component({
    selector: 'app-project-ui-df-node',
    standalone: true,
    imports: [
        CommonModule,
        MatIconModule,
        MatTooltipModule,
        MatButtonModule,
        MatMenuModule,
        TranslateModule,
        DfInputComponent,
        DfOutputComponent,
    ],
    template: `
        <div class="project-ui-node" [class.selected]="selected" [class.disabled]="isDisabled">
            <!-- Header -->
            <div class="node-header">
                <mat-icon class="node-icon">{{ nodeData.icon }}</mat-icon>
                <span class="node-label">{{ nodeData.label }}</span>

                <!-- Actions Menu -->
                <button mat-icon-button
                        class="menu-btn"
                        [matMenuTriggerFor]="actionsMenu"
                        (click)="$event.stopPropagation()">
                    <mat-icon>more_vert</mat-icon>
                </button>

                <mat-menu #actionsMenu="matMenu">
                    <button mat-menu-item class="delete-action" (click)="onRemove()">
                        <mat-icon color="warn">delete</mat-icon>
                        {{ 'common.delete' | translate }}
                    </button>
                </mat-menu>
            </div>

            <!-- Mini preview -->
            <div class="node-preview">
                @switch (nodeData.uiType) {
                    @case ('chat') {
                        <div class="preview-chat">
                            <div class="msg user"></div>
                            <div class="msg ai"></div>
                            <div class="input"></div>
                        </div>
                    }
                    @case ('compare') {
                        <div class="preview-compare">
                            <div class="side left"></div>
                            <div class="side right"></div>
                        </div>
                    }
                    @case ('summarize') {
                        <div class="preview-text">
                            <span></span><span></span><span></span>
                        </div>
                    }
                    @case ('extract') {
                        <div class="preview-text">
                            <span></span><span></span>
                        </div>
                    }
                    @case ('file-upload') {
                        <div class="preview-upload">
                            <mat-icon>upload_file</mat-icon>
                        </div>
                    }
                    @case ('result-view') {
                        <div class="preview-upload">
                            <mat-icon>analytics</mat-icon>
                        </div>
                    }
                    @case ('markdown') {
                        <div class="preview-text">
                            <span></span><span></span><span></span>
                        </div>
                    }
                    @default {
                        <div class="preview-upload">
                            <mat-icon>visibility</mat-icon>
                        </div>
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
                                class="port-connector"
                                [class.disabled]="isDisabled">
                            </df-input>
                            <span class="port-label" [matTooltip]="port.dataType">{{ port.label }}</span>
                        </div>
                    }
                    @if (!inputPorts.length) {
                        <div class="port-row empty">
                            <span class="port-label muted">{{ 'templates.canvas.no_inputs' | translate }}</span>
                        </div>
                    }
                </div>

                <!-- Output Ports (Right Side) -->
                <div class="port-column right">
                    @for (port of outputPorts; track port.id) {
                        <div class="port-row">
                            <span class="port-label" [matTooltip]="port.dataType">{{ port.label }}</span>
                            <df-output
                                [connectorData]="{ nodeId: nodeId, connectorId: outputConnectorId(port.id), single: false }"
                                [position]="positions.Right"
                                class="port-connector"
                                [class.disabled]="isDisabled">
                            </df-output>
                        </div>
                    }
                    @if (!outputPorts.length) {
                        <div class="port-row empty">
                            <span class="port-label muted">{{ 'templates.canvas.no_outputs' | translate }}</span>
                        </div>
                    }
                </div>
            </div>

            <!-- Footer -->
            <div class="node-footer">
                <span class="ui-type-badge">{{ nodeData.uiType }}</span>
            </div>
        </div>
    `,
    styles: [`
        :host {
            display: block;
            position: relative;
        }

        .project-ui-node {
            min-width: 180px;
            max-width: 260px;
            background: var(--mat-accent);
            border: 2px solid var(--mat-accent);
            border-radius: 12px;
            box-shadow: 0 2px 8px rgba(0, 0, 0, 0.1);
            transition: all 0.2s ease;
            overflow: visible;
            position: relative;
            cursor: pointer;
            color: var(--mat-on-accent, #fff);

            &.selected {
                border-color: var(--mat-primary);
                box-shadow: 0 4px 20px rgba(0, 0, 0, 0.3);
            }

            &.disabled {
                opacity: 0.65;
                filter: saturate(0.35);
                border-color: color-mix(in srgb, var(--mat-accent) 40%, #666);
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

            .menu-btn {
                color: var(--mat-on-accent, #fff);
            }
        }

        .node-preview {
            padding: 10px 12px;
            background: color-mix(in srgb, var(--mat-accent) 90%, #fff);
            border-top: 1px solid color-mix(in srgb, var(--mat-accent) 70%, #000);
            border-bottom: 1px solid color-mix(in srgb, var(--mat-accent) 70%, #000);
            min-height: 46px;
            display: flex;
            align-items: center;

            .preview-chat {
                width: 100%;
                display: flex;
                flex-direction: column;
                gap: 4px;

                .msg {
                    height: 6px;
                    border-radius: 4px;
                    background: rgba(255, 255, 255, 0.5);

                    &.user {
                        width: 55%;
                        align-self: flex-end;
                    }

                    &.ai {
                        width: 70%;
                    }
                }

                .input {
                    width: 100%;
                    height: 9px;
                    border-radius: 5px;
                    background: rgba(255, 255, 255, 0.35);
                    margin-top: 2px;
                }
            }

            .preview-compare {
                display: grid;
                width: 100%;
                gap: 4px;
                grid-template-columns: 1fr 1fr;

                .side {
                    height: 24px;
                    border-radius: 4px;
                    background: rgba(255, 255, 255, 0.35);

                    &.left {
                        border-left: 2px solid #4caf50;
                    }

                    &.right {
                        border-left: 2px solid #ef5350;
                    }
                }
            }

            .preview-text {
                width: 100%;
                display: flex;
                flex-direction: column;
                gap: 4px;

                span {
                    display: block;
                    height: 6px;
                    border-radius: 4px;
                    background: rgba(255, 255, 255, 0.45);
                }
            }

            .preview-upload {
                display: flex;
                align-items: center;
                justify-content: center;
                width: 100%;
                color: var(--mat-on-accent, #fff);
            }
        }

        .node-body {
            display: grid;
            grid-template-columns: minmax(0, 1fr) minmax(0, 1fr);
            align-items: start;
            padding: 12px 8px;
            min-height: 64px;
            gap: 10px;
            position: relative;
            background: color-mix(in srgb, var(--mat-accent) 90%, #fff);
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
                    left: -20px;
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
                    right: -20px;
                }
            }
        }

        .port-row {
            display: flex;
            align-items: center;
            gap: 6px;
            position: relative;
            min-height: 20px;
            width: 100%;

            &.empty .port-label {
                opacity: 0.7;
                font-style: italic;
            }
        }

        .port-label {
            font-size: 11px;
            color: var(--mat-on-accent, #fff);
            max-width: 120px;
            white-space: nowrap;
            overflow: hidden;
            text-overflow: ellipsis;
            font-weight: 500;
            padding: 2px 7px;
            background: color-mix(in srgb, var(--mat-accent) 68%, #000);
            border-radius: 4px;
            box-shadow: 0 1px 2px rgba(0, 0, 0, 0.15);

            &.muted {
                background: transparent;
                box-shadow: none;
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
            justify-content: center;
            padding: 6px 12px;
            background: color-mix(in srgb, var(--mat-accent) 80%, #000);
            border-radius: 0 0 10px 10px;
            border-top: 1px solid color-mix(in srgb, var(--mat-accent) 60%, #000);

            .ui-type-badge {
                font-size: 10px;
                text-transform: uppercase;
                font-weight: 600;
                color: var(--mat-on-accent, #fff);
                background: color-mix(in srgb, var(--mat-accent) 50%, #000);
                padding: 2px 8px;
                border-radius: 4px;
            }
        }

        .delete-action {
            color: var(--mat-error);
        }
    `],
})
export class ProjectUINodeComponent extends DrawFlowBaseNode implements OnInit, OnDestroy {
    private readonly changeDetector = inject(ChangeDetectorRef);
    private refreshSub?: Subscription;
    private lastModelString?: string;
    private optimisticDisabled?: boolean;
    readonly positions = DfConnectorPosition;
    private readonly uiNodeStateListener = (event: Event): void => {
        const customEvent = event as CustomEvent<{ nodeId?: string; disabled?: boolean }>;
        if (customEvent.detail?.nodeId !== this.nodeId) {
            return;
        }
        this.optimisticDisabled = !!customEvent.detail.disabled;
        this.changeDetector.detectChanges();
    };

    ngOnInit(): void {
        document.addEventListener('projectUiNodeState', this.uiNodeStateListener as EventListener);

        // Poll for model changes since ng-draw-flow doesn't notify on data updates
        this.refreshSub = interval(50).subscribe(() => {
            try {
                const currentModelString = JSON.stringify({
                    uiType: this.model?.['uiType'],
                    label: this.model?.['label'],
                    icon: this.model?.['icon'],
                    disabled: this.model?.['disabled'],
                });
                if (this.lastModelString !== currentModelString) {
                    this.lastModelString = currentModelString;
                    if (typeof this.model?.['disabled'] === 'boolean' && this.model['disabled'] === this.optimisticDisabled) {
                        this.optimisticDisabled = undefined;
                    }
                    this.changeDetector.detectChanges();
                }
            } catch {
                // Ignore JSON stringify errors
            }
        });
    }

    ngOnDestroy(): void {
        this.refreshSub?.unsubscribe();
        document.removeEventListener('projectUiNodeState', this.uiNodeStateListener as EventListener);
    }

    get nodeData(): ProjectUINodeData {
        return this.model as unknown as ProjectUINodeData;
    }

    get isDisabled(): boolean {
        return this.optimisticDisabled ?? !!this.nodeData.disabled;
    }

    get inputPorts(): UiPortDefinition[] {
        return getProjectUiPorts(this.nodeData.uiType).inputs;
    }

    get outputPorts(): UiPortDefinition[] {
        return getProjectUiPorts(this.nodeData.uiType).outputs;
    }

    inputConnectorId(portId: string): string {
        return `ui-in::${portId}`;
    }

    outputConnectorId(portId: string): string {
        return `ui-out::${portId}`;
    }

    onConfigure(): void {
        this.dispatchNodeEvent('configure', this.nodeId);
    }

    onRemove(): void {
        this.dispatchNodeEvent('remove', this.nodeId);
    }

    private dispatchNodeEvent(action: string, nodeId: string): void {
        const event = new CustomEvent('nodeAction', {
            bubbles: true,
            detail: { action, nodeId },
        });
        document.dispatchEvent(event);
    }
}
