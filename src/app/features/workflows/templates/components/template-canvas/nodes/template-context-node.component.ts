/**
 * Template Context Node Component
 * 
 * A ng-draw-flow node component for Session/Project Context Storage in the Template Canvas.
 * 
 * Purpose:
 * - Composite outputs can be connected here to STORE data in session/project context
 * - Each stored data item gets a custom name and creates a new OUTPUT port
 * - These output ports can then be connected to another composite's inputs
 * 
 * Example Flow:
 * 1. Chat Composite -> [chat_history output] -> [store port on Session Context]
 * 2. Session Context creates "Chat History" stored data with ID "stored-chat-history"
 * 3. Compare Composite <- [input port] <- [stored-chat-history output on Session Context]
 * 
 * Extends DrawFlowBaseNode to integrate with the ng-draw-flow library.
 */

import { Component, inject, ChangeDetectorRef, OnInit, OnDestroy } from '@angular/core';
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
import { interval, Subscription } from 'rxjs';

/** Interface for stored data items in context */
export interface StoredDataItem {
    /** Unique ID for this stored data */
    id: string;
    /** Custom label (user-editable) */
    label: string;
    /** Source composite ID */
    sourceCompositeId: string;
    /** Source port ID from the composite */
    sourcePortId: string;
    /** Data type (for visualization) */
    dataType: string;
}

// Internal connector id for the static "store here" input port on context nodes.
export const TEMPLATE_CONTEXT_STORE_INPUT_PORT_ID = '__store_input__';
// Backward compatibility for older persisted graphs.
export const TEMPLATE_CONTEXT_STORE_INPUT_PORT_ID_LEGACY = 'store-data';

@Component({
    selector: 'app-template-context-df-node',
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
        <div class="template-context-node" 
             [class.selected]="selected"
             [class.session]="contextType === 'session'"
             [class.project]="contextType === 'project'">
            
            <!-- Header -->
            <div class="node-header" [attr.data-node-id]="nodeId">
                <mat-icon class="node-icon">{{ contextIcon }}</mat-icon>
                <span class="node-label">{{ modelData['label'] || contextLabel }}</span>
            </div>

            <!-- Description -->
            <div class="node-description">
                <mat-icon class="desc-icon">info_outline</mat-icon>
                <span>{{ contextType === 'session' 
                    ? ('templates.canvas.session_desc' | translate) 
                    : ('templates.canvas.project_desc' | translate) }}</span>
            </div>

            <!-- Body with Ports -->
            <div class="node-body">
                <!-- INPUT SECTION: Connect composite outputs here to store -->
                <div class="port-section input-section">
                    <div class="section-title">
                        <mat-icon>arrow_forward</mat-icon>
                        <span>{{ 'templates.canvas.connect_outputs' | translate }}</span>
                    </div>
                    <div class="port-row">
                        <df-input 
                            [connectorData]="{ nodeId: nodeId, connectorId: inputConnectorId(storeInputPortId), single: false }"
                            [position]="positions.Left"
                            class="port-connector store-port">
                        </df-input>
                        <span class="port-label">{{ 'templates.canvas.store_here' | translate }}</span>
                        <mat-icon class="port-hint" [matTooltip]="'templates.canvas.store_hint' | translate">help_outline</mat-icon>
                    </div>
                </div>

                <!-- DIVIDER -->
                <div class="section-divider">
                    <mat-icon>swap_vert</mat-icon>
                </div>

                <!-- OUTPUT SECTION: Stored data that can be connected to inputs -->
                <div class="port-section output-section">
                    <div class="section-title">
                        <mat-icon>output</mat-icon>
                        <span>{{ 'templates.canvas.stored_data' | translate }}</span>
                    </div>
                    
                    @if (storedItems.length === 0) {
                        <div class="empty-stored">
                            <mat-icon>inventory_2</mat-icon>
                            <span>{{ 'templates.canvas.no_stored_data' | translate }}</span>
                        </div>
                    } @else {
                        @for (item of storedItems; track item.id) {
                            <div class="port-row stored-item">
                                <df-input
                                    [connectorData]="{ nodeId: nodeId, connectorId: inputConnectorId(item.id), single: false }"
                                    [position]="positions.Left"
                                    class="port-connector item-input-port">
                                </df-input>
                                <div class="stored-info">
                                    <div class="stored-meta-row">
                                        <span class="stored-field">ID</span>
                                        <input
                                            class="stored-id-input"
                                            [value]="item.id"
                                            (click)="$event.stopPropagation()"
                                            (keydown)="$event.stopPropagation()"
                                            (blur)="onItemIdBlur(item, $any($event.target).value)">
                                    </div>
                                    <div class="stored-meta-row">
                                        <span class="stored-field">Label</span>
                                        <input
                                            class="stored-label-input"
                                            [value]="item.label"
                                            (click)="$event.stopPropagation()"
                                            (keydown)="$event.stopPropagation()"
                                            (blur)="onItemLabelBlur(item, $any($event.target).value)">
                                    </div>
                                    <span class="stored-type" [matTooltip]="'From: ' + item.sourceCompositeId">
                                        {{ item.dataType }}
                                    </span>
                                </div>
                                <button
                                    mat-icon-button
                                    class="stored-delete"
                                    (click)="onDeleteItem($event, item)"
                                    [matTooltip]="'common.delete' | translate">
                                    <mat-icon>delete</mat-icon>
                                </button>
                                <df-output
                                    [connectorData]="{ nodeId: nodeId, connectorId: outputConnectorId(item.id), single: false }"
                                    [position]="positions.Right"
                                    class="port-connector item-output-port">
                                </df-output>
                            </div>
                        }
                    }
                </div>
            </div>

            <!-- Footer with Scope Info -->
            <div class="node-footer">
                <div class="scope-info">
                    <mat-icon class="scope-icon">{{ contextType === 'session' ? 'schedule' : 'share' }}</mat-icon>
                    <span class="scope-label">{{ contextType === 'session' 
                        ? ('templates.canvas.session_scope' | translate) 
                        : ('templates.canvas.project_scope' | translate) }}</span>
                </div>
                <div class="scope-hint">
                    {{ contextType === 'session' 
                        ? ('templates.canvas.session_scope_hint' | translate)
                        : ('templates.canvas.project_scope_hint' | translate) }}
                </div>
            </div>
        </div>
    `,
    styles: [`
        :host {
            display: block;
            position: relative;
        }

        .template-context-node {
            min-width: 200px;
            max-width: 280px;
            background: #f5f5f5;
            border: 2px solid #607d8b;
            border-radius: 12px;
            box-shadow: 0 2px 8px rgba(0, 0, 0, 0.1);
            transition: all 0.2s ease;
            overflow: visible;
            position: relative;

            &.session {
                border-color: #ff9800;
                background: #fff8e1;

                .node-header {
                    background: linear-gradient(135deg, #ff9800 0%, #f57c00 100%);
                }

                .store-port {
                    --df-connector-background: #ff9800;
                    --df-connector-size: 18px;
                    --df-connector-border: 2px solid white;
                }

                .item-output-port {
                    --df-connector-background: #ffb74d;
                    --df-connector-size: 18px;
                    --df-connector-border: 2px solid white;
                }

                .item-input-port {
                    --df-connector-background: #ffcc80;
                    --df-connector-size: 18px;
                    --df-connector-border: 2px solid white;
                }

                .section-divider mat-icon {
                    color: #ff9800;
                }
            }

            &.project {
                border-color: #4caf50;
                background: #e8f5e9;

                .node-header {
                    background: linear-gradient(135deg, #4caf50 0%, #388e3c 100%);
                }

                .store-port {
                    --df-connector-background: #4caf50;
                    --df-connector-size: 18px;
                    --df-connector-border: 2px solid white;
                }

                .item-output-port {
                    --df-connector-background: #81c784;
                    --df-connector-size: 18px;
                    --df-connector-border: 2px solid white;
                }

                .item-input-port {
                    --df-connector-background: #a5d6a7;
                    --df-connector-size: 18px;
                    --df-connector-border: 2px solid white;
                }

                .section-divider mat-icon {
                    color: #4caf50;
                }
            }

            &.selected {
                box-shadow: 0 4px 20px rgba(0, 0, 0, 0.2);
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
            background: linear-gradient(135deg, #607d8b 0%, #455a64 100%);
            color: white;
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
                font-weight: 600;
                font-size: 14px;
                white-space: nowrap;
                overflow: hidden;
                text-overflow: ellipsis;
            }
        }

        .node-description {
            display: flex;
            align-items: flex-start;
            gap: 6px;
            padding: 8px 12px;
            background: rgba(0, 0, 0, 0.05);
            font-size: 11px;
            color: #555;
            line-height: 1.4;

            .desc-icon {
                font-size: 14px;
                width: 14px;
                height: 14px;
                flex-shrink: 0;
                margin-top: 1px;
            }
        }

        .node-body {
            padding: 12px;
        }

        .port-section {
            display: flex;
            flex-direction: column;
            gap: 8px;
        }

        .section-title {
            display: flex;
            align-items: center;
            gap: 6px;
            font-size: 11px;
            font-weight: 600;
            text-transform: uppercase;
            color: #666;
            letter-spacing: 0.5px;
            margin-bottom: 4px;

            mat-icon {
                font-size: 14px;
                width: 14px;
                height: 14px;
            }
        }

        .section-divider {
            display: flex;
            align-items: center;
            justify-content: center;
            padding: 8px 0;
            margin: 4px 0;
            border-top: 1px dashed var(--mat-sys-outline-variant);
            border-bottom: 1px dashed var(--mat-sys-outline-variant);

            mat-icon {
                font-size: 18px;
                width: 18px;
                height: 18px;
                opacity: 0.6;
            }
        }

            .port-row {
                display: flex;
                align-items: center;
                gap: 10px;
                padding: 8px 10px;
            background: rgba(255, 255, 255, 0.8);
            border-radius: 6px;
            border: 1px solid rgba(0, 0, 0, 0.1);
            position: relative;

                &.stored-item {
                    justify-content: space-between;
                    padding-left: 18px;
                    padding-right: 18px;
                }
            }

        .port-label {
            font-size: 12px;
            font-weight: 500;
            color: #333;
            flex: 1;
        }

        .port-hint {
            font-size: 16px;
            width: 16px;
            height: 16px;
            color: #888;
            opacity: 0.6;
            cursor: help;
        }

        .port-connector {
            --df-connector-size: 18px;
            --df-connector-border: 2px solid white;
            width: 18px;
            height: 18px;
            display: block;
            cursor: pointer;
            position: relative;
            z-index: 10;
        }

        .store-port {
            position: absolute;
            left: -22px;
        }

        .output-port {
            position: absolute;
            right: -22px;
        }

        .item-input-port {
            position: absolute;
            left: -22px;
        }

        .item-output-port {
            position: absolute;
            right: -22px;
        }

        .empty-stored {
            display: flex;
            align-items: center;
            gap: 8px;
            padding: 12px;
            background: rgba(255, 255, 255, 0.6);
            border-radius: 6px;
            border: 1px dashed rgba(0, 0, 0, 0.2);
            color: #777;
            font-size: 12px;
            font-style: italic;

            mat-icon {
                font-size: 18px;
                width: 18px;
                height: 18px;
                opacity: 0.5;
            }
        }

        .stored-info {
            display: flex;
            flex-direction: column;
            gap: 4px;
            flex: 1;
            min-width: 0;
        }

        .stored-meta-row {
            display: flex;
            align-items: center;
            gap: 6px;
            min-width: 0;
        }

        .stored-field {
            width: 34px;
            min-width: 34px;
            font-size: 10px;
            text-transform: uppercase;
            color: #666;
            font-weight: 600;
        }

        .stored-id-input,
        .stored-label-input {
            width: 100%;
            min-width: 0;
            font-size: 12px;
            font-weight: 500;
            color: #333;
            border: 1px solid rgba(0, 0, 0, 0.18);
            border-radius: 4px;
            padding: 2px 6px;
            background: rgba(255, 255, 255, 0.95);
            outline: none;

            &:focus {
                border-color: rgba(25, 118, 210, 0.6);
                box-shadow: 0 0 0 2px rgba(25, 118, 210, 0.15);
            }
        }

        .stored-type {
            font-size: 10px;
            color: #666;
            text-transform: uppercase;
        }

        .stored-delete {
            color: var(--mat-error);
        }

        .node-footer {
            display: flex;
            flex-direction: column;
            gap: 4px;
            padding: 8px 12px;
            background: rgba(0, 0, 0, 0.05);
            border-top: 1px solid rgba(0, 0, 0, 0.1);
            border-radius: 0 0 10px 10px;
        }

        .scope-info {
            display: flex;
            align-items: center;
            gap: 6px;

            .scope-icon {
                font-size: 14px;
                width: 14px;
                height: 14px;
            }

            .scope-label {
                font-size: 12px;
                font-weight: 600;
                color: #333;
            }
        }

        .scope-hint {
            font-size: 10px;
            color: #666;
            line-height: 1.3;
        }

        /* Dark mode */
        :host-context(.dark-theme) {
            .template-context-node {
                background: #2d2d2d;
                
                &.session {
                    background: #3d3020;
                }
                
                &.project {
                    background: #203d25;
                }
            }

            .node-description {
                background: rgba(255, 255, 255, 0.05);
                color: #aaa;
            }

            .section-title {
                color: #aaa;
            }

            .port-row {
                background: rgba(255, 255, 255, 0.1);
                border-color: rgba(255, 255, 255, 0.1);
            }

            .port-label {
                color: #e0e0e0;
            }

            .stored-field {
                color: #b0b0b0;
            }

            .stored-id-input,
            .stored-label-input {
                color: #e0e0e0;
                background: rgba(0, 0, 0, 0.25);
                border-color: rgba(255, 255, 255, 0.2);
            }

            .empty-stored {
                background: rgba(255, 255, 255, 0.05);
                border-color: rgba(255, 255, 255, 0.2);
                color: #888;
            }

            .node-footer {
                background: rgba(255, 255, 255, 0.05);
                border-color: rgba(255, 255, 255, 0.1);
            }

            .scope-label {
                color: #e0e0e0;
            }

            .scope-hint, .stored-type {
                color: #999;
            }
        }
    `],
})
export class TemplateContextDfNodeComponent extends DrawFlowBaseNode implements OnInit, OnDestroy {
    private readonly bus = inject(WfCanvasBus);
    private readonly changeDetector = inject(ChangeDetectorRef);
    private refreshSub?: Subscription;
    private contextSyncSub?: Subscription;
    private lastModelSnapshot = '';
    private storedItemsState: StoredDataItem[] = [];
    private storedItemsFingerprint = '';
    private storeInputEpoch = 0;
    private connectorRefreshScheduled = false;
    
    readonly positions = DfConnectorPosition;

    get storeInputPortId(): string {
        return `${TEMPLATE_CONTEXT_STORE_INPUT_PORT_ID}::${this.storeInputEpoch}`;
    }

    ngOnInit(): void {
        this.setStoredItems(this.extractStoredItems(this.modelData), false);

        this.contextSyncSub = this.bus.contextItemsSync$.subscribe(event => {
            if (event.nodeId !== this.nodeId) return;
            this.setStoredItems(event.items);
            this.changeDetector.detectChanges();
        });

        // ng-draw-flow does not reliably notify Angular on model data updates.
        // Polling a lightweight snapshot ensures storedItems render immediately.
        this.refreshSub = interval(80).subscribe(() => {
            let snapshot = '';
            let modelData: Record<string, unknown> | null = null;
            try {
                modelData = this.modelData;
                snapshot = JSON.stringify({
                    contextType: modelData['contextType'],
                    storedItems: this.extractStoredItems(modelData),
                });
            } catch {
                snapshot = '';
                modelData = null;
            }
            if (snapshot !== this.lastModelSnapshot) {
                this.lastModelSnapshot = snapshot;
                if (modelData) {
                    this.setStoredItems(this.extractStoredItems(modelData));
                }
                this.changeDetector.detectChanges();
            }
        });
    }

    ngOnDestroy(): void {
        this.refreshSub?.unsubscribe();
        this.contextSyncSub?.unsubscribe();
    }

    /** Type-safe accessor for model data */
    get modelData(): Record<string, unknown> {
        return (this.model ?? {}) as Record<string, unknown>;
    }

    /** Get context type from model data */
    get contextType(): 'session' | 'project' {
        return (this.modelData['contextType'] as 'session' | 'project') || 'session';
    }

    /** Get icon based on context type */
    get contextIcon(): string {
        return this.contextType === 'session' ? 'history' : 'folder_shared';
    }

    /** Get label based on context type */
    get contextLabel(): string {
        return this.contextType === 'session' ? 'Session Storage' : 'Project Storage';
    }

    /** Get stored data items from model */
    get storedItems(): StoredDataItem[] {
        return this.storedItemsState;
    }

    onDeleteItem(event: MouseEvent, item: StoredDataItem): void {
        event.stopPropagation();
        this.bus.contextItemDelete$.next({ nodeId: this.nodeId, itemId: item.id });
    }

    onItemIdBlur(item: StoredDataItem, rawValue: string): void {
        const next = this.normalizeId(rawValue);
        if (!next || next === item.id) return;
        this.bus.contextItemRename$.next({
            nodeId: this.nodeId,
            itemId: item.id,
            newItemId: next,
            label: item.label,
        });
    }

    onItemLabelBlur(item: StoredDataItem, rawValue: string): void {
        const label = (rawValue ?? '').trim();
        if (!label || label === item.label) return;
        this.bus.contextItemRename$.next({
            nodeId: this.nodeId,
            itemId: item.id,
            newItemId: item.id,
            label,
        });
    }

    private normalizeId(value: string): string {
        return (value ?? '')
            .trim()
            .toLowerCase()
            .replace(/[^a-z0-9_-]/g, '_')
            .replace(/_+/g, '_');
    }

    inputConnectorId(portId: string): string {
        return `${this.nodeId}::in::${portId}`;
    }

    outputConnectorId(portId: string): string {
        return `${this.nodeId}::out::${portId}`;
    }

    private extractStoredItems(modelData: Record<string, unknown>): StoredDataItem[] {
        const items = (modelData['storedItems'] as StoredDataItem[] | undefined) ?? [];
        return items.map(item => ({ ...item }));
    }

    private setStoredItems(items: StoredDataItem[], bumpEpoch = true): void {
        const normalized = items.map(item => ({ ...item }));
        const fingerprint = JSON.stringify(normalized);
        const changed = fingerprint !== this.storedItemsFingerprint;
        if (bumpEpoch && changed) {
            this.storeInputEpoch += 1;
        }
        this.storedItemsFingerprint = fingerprint;
        this.storedItemsState = normalized;
        if (changed) {
            this.scheduleConnectorRefresh();
        }
    }

    private scheduleConnectorRefresh(): void {
        if (this.connectorRefreshScheduled) return;
        this.connectorRefreshScheduled = true;
        requestAnimationFrame(() => {
            requestAnimationFrame(() => {
                this.connectorRefreshScheduled = false;
                this.connectorsUpdated.emit();
            });
        });
    }
}
