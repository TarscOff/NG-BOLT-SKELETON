import {
    Component,
    ChangeDetectionStrategy,
    Input,
    Output,
    EventEmitter,
    signal,
    computed,
    inject,
    OnInit,
    OnDestroy,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { TranslateModule, TranslateService } from '@ngx-translate/core';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatTabsModule } from '@angular/material/tabs';
import { MatMenuModule } from '@angular/material/menu';
import { MatTooltipModule } from '@angular/material/tooltip';
import { MatDividerModule } from '@angular/material/divider';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatListModule } from '@angular/material/list';
import { MatChipsModule } from '@angular/material/chips';
import { MatDialog } from '@angular/material/dialog';
import { Subject, firstValueFrom, takeUntil } from 'rxjs';
import { DateTime } from 'luxon';
import { KeycloakService } from '@cadai/pxs-ng-core/services';
import { UserRole } from '@cadai/pxs-ng-core/enums';
import { ConfirmDialogComponent } from '@cadai/pxs-ng-core/shared';
import { ConfirmDialogData } from '@cadai/pxs-ng-core/interfaces';

import { ChatComponent } from '@features/workflows/templates/components/chat/chat.component';
import { CompareComponent } from '@features/workflows/templates/components/compare/compare.component';
import { ExtractComponent } from '@features/workflows/templates/components/extract/extract.component';
import { SummarizeComponent } from '@features/workflows/templates/components/summarize/summarize.component';
import { RuntimeResultComponent } from '@features/workflows/templates/components/result/runtime-result/runtime-result.component';
import { FileUploadPanelComponent } from '../file-upload-panel/file-upload-panel.component';
import { TemplateWorkflowsStore } from '@features/workflows/templates/data/template-workflows.store';
import {
    TemplateWorkflow,
    UIComponentType,
    UIComponentConfig,
    TemplateLayoutType,
    CompositeWorkflow,
    CompositeWorkflowNode,
    ExposedHandle,
} from '@features/workflows/templates/interfaces/template-workflow.interface';
import {
    ProjectTemplateAssignment,
    TemplateExecutionSession,
    TemplateExecutionContext,
    UploadedFileInfo,
} from '../../interfaces/project.model';
import { ChatInputData, ChatMessage, ChatMode, ChatSender } from '@features/workflows/templates/utils/tplsInterfaces/chatTpl.interface';
import { ComparisonResult, CompareConfig, CompareMode } from '@features/workflows/templates/utils/tplsInterfaces/compareTpl.interface';
import { ExtractConfig, ExtractionResult, ExtractMode } from '@features/workflows/templates/utils/tplsInterfaces/extractTpl.interface';
import { SummarizeConfig, SummaryResult, SummarizeMode } from '@features/workflows/templates/utils/tplsInterfaces/summarizeTpl.interface';
import { FileUploadConfig } from '../../utils/workflow-trigger.utils';
import { DataScope } from '@shared/types/workflow.types';

// ============================================================================
// CONFIG INTERFACE
// ============================================================================

export interface TemplateExecutionConfig {
    projectId: string;
    assignment: ProjectTemplateAssignment;
    template: TemplateWorkflow;
}

type DebugBindingScope = DataScope | 'unscoped';

interface RuntimeDebugBindingItem {
    id: string;
    componentId: string;
    componentLabel: string;
    componentType: UIComponentType;
    componentProperty: string;
    workflowPath: string;
    scope: DebugBindingScope;
    scopePortId?: string;
    value: unknown;
    valuePresent: boolean;
    valueKind: string;
}

interface RuntimeDebugBindingGroup {
    componentId: string;
    componentLabel: string;
    componentType: UIComponentType;
    componentIcon: string;
    bindings: RuntimeDebugBindingItem[];
}

type TriggerNodeType =
    | 'trigger_chat'
    | 'trigger_file_upload'
    | 'trigger_webhook'
    | 'trigger_manual';

interface TriggerConstraint {
    triggerType: TriggerNodeType;
    workflowPath: string;
    templateNodeId: string;
    exposedPortId: string;
    sourceNodeId: string;
    sourcePortId: string;
    params: Record<string, unknown>;
}

interface FileConstraint {
    acceptedTypes?: string[];
    maxFileSize?: number;
    maxFiles?: number;
    multiple?: boolean;
}

// ============================================================================
// COMPONENT
// ============================================================================

@Component({
    selector: 'app-template-execution-panel',
    standalone: true,
    imports: [
        CommonModule,
        TranslateModule,
        MatButtonModule,
        MatIconModule,
        MatTabsModule,
        MatMenuModule,
        MatTooltipModule,
        MatDividerModule,
        MatProgressSpinnerModule,
        MatListModule,
        MatChipsModule,
        ChatComponent,
        CompareComponent,
        ExtractComponent,
        SummarizeComponent,
        RuntimeResultComponent,
        FileUploadPanelComponent,
    ],
    template: `
        <div class="template-execution-panel">
            <!-- Session Sidebar -->
            <div class="session-sidebar">
                <div class="sidebar-header">
                    <h3>{{ 'templates.sessions.title' | translate }}</h3>
                    <button mat-icon-button 
                            color="primary" 
                            (click)="createNewSession()"
                            [matTooltip]="'templates.sessions.new' | translate">
                        <mat-icon>add</mat-icon>
                    </button>
                </div>
                
                <mat-divider></mat-divider>
                
                <div class="session-list">
                    @if (isLoadingSessions()) {
                        <div class="loading-sessions">
                            <mat-spinner diameter="24"></mat-spinner>
                        </div>
                    } @else if (sessions().length === 0) {
                        <div class="empty-sessions">
                            <mat-icon>chat_bubble_outline</mat-icon>
                            <span>{{ 'templates.sessions.empty' | translate }}</span>
                        </div>
                    } @else {
                        @for (session of sessions(); track session.id) {
                            <div class="session-item" 
                                 role="button"
                                 tabindex="0"
                                 [class.active]="selectedSessionId() === session.id"
                                 (click)="selectSession(session)"
                                 (keydown)="onSessionItemKeydown($event, session)">
                                <div class="session-info">
                                    <span class="session-name">{{ session.name }}</span>
                                    <span class="session-date">{{ formatDate(session.createdAt) }}</span>
                                </div>
                                <div class="session-status">
                                    <mat-icon [class]="'status-' + session.status">
                                        {{ getStatusIcon(session.status) }}
                                    </mat-icon>
                                </div>
                                <button mat-icon-button 
                                        [matMenuTriggerFor]="sessionMenu"
                                        (click)="$event.stopPropagation()">
                                    <mat-icon>more_vert</mat-icon>
                                </button>
                                <mat-menu #sessionMenu="matMenu">
                                    <button mat-menu-item (click)="renameSession(session)">
                                        <mat-icon>edit</mat-icon>
                                        {{ 'common.rename' | translate }}
                                    </button>
                                    <button mat-menu-item (click)="deleteSession(session)">
                                        <mat-icon>delete</mat-icon>
                                        {{ 'common.delete' | translate }}
                                    </button>
                                </mat-menu>
                            </div>
                        }
                    }
                </div>
            </div>

            <!-- Main Content Area -->
            <div class="execution-content">
                @if (!selectedSession()) {
                    <div class="no-session-selected">
                        <mat-icon>play_circle_outline</mat-icon>
                        <h2>{{ 'templates.sessions.select_or_create' | translate }}</h2>
                        <p>{{ 'templates.sessions.description' | translate }}</p>
                        <button mat-flat-button color="primary" (click)="createNewSession()">
                            <mat-icon>add</mat-icon>
                            {{ 'templates.sessions.new' | translate }}
                        </button>
                    </div>
                } @else {
                    <!-- Dynamic UI Rendering Based on Template Layout -->
                    <div class="execution-area" [class]="'layout-' + templateLayout()">
                        @switch (templateLayout()) {
                            @case ('chat-with-files') {
                                <div class="chat-with-files-layout">
                                    <div class="chat-section">
                                        <app-chat-tpl
                                            [projectId]="config.projectId"
                                            [sessionId]="selectedSessionId() ?? ''"
                                            [currentUser]="currentUser()"
                                            [chatTemplateId]="getExecutionTemplateId()"
                                            [fileTemplateId]="getExecutionTemplateId()"
                                            [mode]="chatMode(getFirstComponentOfType('chat'))"
                                            [config]="chatConfig()"
                                            (messageSent)="onMessageSent($event)"
                                            (errorEmitter)="onChatError($event)">
                                        </app-chat-tpl>
                                    </div>
                                    @if (hasFileUploader()) {
                                        <div class="file-section">
                                            <app-file-upload-panel
                                                [config]="fileUploadConfig()"
                                                (filesSubmitted)="onFilesSubmitted($event)">
                                            </app-file-upload-panel>
                                        </div>
                                    }
                                </div>
                            }

                            @case ('standalone-single') {
                                <div class="generic-execution">
                                    @if (uiComponents().length === 0) {
                                        <div class="default-layout">
                                            <mat-icon>widgets</mat-icon>
                                            <h3>{{ 'templates.preview.no_components' | translate }}</h3>
                                        </div>
                                    } @else {
                                        @for (component of uiComponents(); track component.id) {
                                            @switch (component.type) {
                                                @case ('chat') {
                                                    <app-chat-tpl
                                                        [projectId]="config.projectId"
                                                        [sessionId]="selectedSessionId() ?? ''"
                                                        [currentUser]="currentUser()"
                                                        [chatTemplateId]="getExecutionTemplateId()"
                                                        [fileTemplateId]="getExecutionTemplateId()"
                                                        [mode]="chatMode(component)"
                                                        [config]="chatConfig()"
                                                        (messageSent)="onMessageSent($event)"
                                                        (errorEmitter)="onChatError($event)">
                                                    </app-chat-tpl>
                                                }
                                                @case ('compare') {
                                                    @if (isComponentReadyForExecution(component)) {
                                                        <app-compare-tpl
                                                            [mode]="compareMode(component)"
                                                            [config]="compareConfig(component)"
                                                            (comparisonStarted)="onComparisonStarted(component)"
                                                            (comparisonCompleted)="onComparisonCompleted($event, component)"
                                                            (comparisonError)="onComparisonError($event, component)">
                                                        </app-compare-tpl>
                                                    } @else {
                                                        <div class="binding-warning">
                                                            <mat-icon>error</mat-icon>
                                                            <span>{{ getBindingRequirementMessage(component) }}</span>
                                                        </div>
                                                    }
                                                }
                                                @case ('summarize') {
                                                    @if (isComponentReadyForExecution(component)) {
                                                        <app-summarize-tpl
                                                            [mode]="summarizeMode(component)"
                                                            [config]="summarizeConfig(component)"
                                                            (summarizeStarted)="onSummarizeStarted(component)"
                                                            (summarizeCompleted)="onSummarizeCompleted($event, component)"
                                                            (summarizeError)="onSummarizeError($event, component)">
                                                        </app-summarize-tpl>
                                                    } @else {
                                                        <div class="binding-warning">
                                                            <mat-icon>error</mat-icon>
                                                            <span>{{ getBindingRequirementMessage(component) }}</span>
                                                        </div>
                                                    }
                                                }
                                                @case ('extract') {
                                                    <app-extract-tpl
                                                        [mode]="extractMode(component)"
                                                        [config]="extractConfig(component)"
                                                        (extractionStarted)="onExtractionStarted(component)"
                                                        (extractionCompleted)="onExtractionCompleted($event, component)"
                                                        (extractionError)="onExtractionError($event, component)">
                                                    </app-extract-tpl>
                                                }
                                                @case ('file-uploader') {
                                                    <app-file-upload-panel
                                                        [config]="fileUploadConfig(component)"
                                                        (filesSubmitted)="onFilesSubmitted($event, undefined, component)">
                                                    </app-file-upload-panel>
                                                }
                                                @case ('file-upload') {
                                                    <app-file-upload-panel
                                                        [config]="fileUploadConfig(component)"
                                                        (filesSubmitted)="onFilesSubmitted($event, undefined, component)">
                                                    </app-file-upload-panel>
                                                }
                                                @case ('result-view') {
                                                    <div class="result-viewer-component">
                                                        <app-runtime-result-tpl
                                                            [title]="component.label || 'Result View'"
                                                            [value]="getComponentOutput(component)"
                                                            mode="result">
                                                        </app-runtime-result-tpl>
                                                    </div>
                                                }
                                                @case ('result-viewer') {
                                                    <div class="result-viewer-component">
                                                        <app-runtime-result-tpl
                                                            [title]="component.label || ('templates.components.result_viewer' | translate)"
                                                            [value]="getComponentOutput(component)"
                                                            mode="result">
                                                        </app-runtime-result-tpl>
                                                    </div>
                                                }
                                                @case ('markdown') {
                                                    <div class="markdown-viewer-component">
                                                        <app-runtime-result-tpl
                                                            [title]="component.label || 'Markdown'"
                                                            [value]="markdownContentFor(component)"
                                                            mode="markdown">
                                                        </app-runtime-result-tpl>
                                                    </div>
                                                }
                                                @default {
                                                    <div class="composite-placeholder">
                                                        <mat-icon>hub</mat-icon>
                                                        <span>{{ tabLabel(component) }}</span>
                                                    </div>
                                                }
                                            }
                                        }
                                    }
                                </div>
                            }

                            @case ('standalone-tabs') {
                                @if (uiTabComponents().length > 0) {
                                    <mat-tab-group class="composite-tabs">
                                        @for (component of uiTabComponents(); track component.id) {
                                            <mat-tab>
                                                <ng-template mat-tab-label>
                                                    <span class="tab-label-with-icon">
                                                        <mat-icon>{{ tabIcon(component) }}</mat-icon>
                                                        <span>{{ tabLabel(component) }}</span>
                                                    </span>
                                                </ng-template>
                                                <ng-template matTabContent>
                                                    <div class="composite-content">
                                                        @switch (component.type) {
                                                            @case ('chat') {
                                                                <app-chat-tpl
                                                                    [projectId]="config.projectId"
                                                                    [sessionId]="selectedSessionId() ?? ''"
                                                                    [currentUser]="currentUser()"
                                                                    [chatTemplateId]="getExecutionTemplateId()"
                                                                    [fileTemplateId]="getExecutionTemplateId()"
                                                                    [mode]="chatMode(component)"
                                                                    [config]="chatConfig()"
                                                                    (messageSent)="onMessageSent($event)"
                                                                    (errorEmitter)="onChatError($event)">
                                                                </app-chat-tpl>
                                                            }
                                                            @case ('compare') {
                                                                @if (isComponentReadyForExecution(component)) {
                                                                    <app-compare-tpl
                                                                        [mode]="compareMode(component)"
                                                                        [config]="compareConfig(component)"
                                                                        (comparisonStarted)="onComparisonStarted(component)"
                                                                        (comparisonCompleted)="onComparisonCompleted($event, component)"
                                                                        (comparisonError)="onComparisonError($event, component)">
                                                                    </app-compare-tpl>
                                                                } @else {
                                                                    <div class="binding-warning">
                                                                        <mat-icon>error</mat-icon>
                                                                        <span>{{ getBindingRequirementMessage(component) }}</span>
                                                                    </div>
                                                                }
                                                            }
                                                            @case ('extract') {
                                                                <app-extract-tpl
                                                                    [mode]="extractMode(component)"
                                                                    [config]="extractConfig(component)"
                                                                    (extractionStarted)="onExtractionStarted(component)"
                                                                    (extractionCompleted)="onExtractionCompleted($event, component)"
                                                                    (extractionError)="onExtractionError($event, component)">
                                                                </app-extract-tpl>
                                                            }
                                                            @case ('summarize') {
                                                                @if (isComponentReadyForExecution(component)) {
                                                                    <app-summarize-tpl
                                                                        [mode]="summarizeMode(component)"
                                                                        [config]="summarizeConfig(component)"
                                                                        (summarizeStarted)="onSummarizeStarted(component)"
                                                                        (summarizeCompleted)="onSummarizeCompleted($event, component)"
                                                                        (summarizeError)="onSummarizeError($event, component)">
                                                                    </app-summarize-tpl>
                                                                } @else {
                                                                    <div class="binding-warning">
                                                                        <mat-icon>error</mat-icon>
                                                                        <span>{{ getBindingRequirementMessage(component) }}</span>
                                                                    </div>
                                                                }
                                                            }
                                                            @case ('file-uploader') {
                                                                <app-file-upload-panel
                                                                    [config]="fileUploadConfig(component)"
                                                                    (filesSubmitted)="onFilesSubmitted($event, undefined, component)">
                                                                </app-file-upload-panel>
                                                            }
                                                            @case ('file-upload') {
                                                                <app-file-upload-panel
                                                                    [config]="fileUploadConfig(component)"
                                                                    (filesSubmitted)="onFilesSubmitted($event, undefined, component)">
                                                                </app-file-upload-panel>
                                                            }
                                                            @case ('result-view') {
                                                                <div class="result-viewer-component">
                                                                    <app-runtime-result-tpl
                                                                        [title]="component.label || 'Result View'"
                                                                        [value]="getComponentOutput(component)"
                                                                        mode="result">
                                                                    </app-runtime-result-tpl>
                                                                </div>
                                                            }
                                                            @case ('result-viewer') {
                                                                <div class="result-viewer-component">
                                                                    <app-runtime-result-tpl
                                                                        [title]="component.label || ('templates.components.result_viewer' | translate)"
                                                                        [value]="getComponentOutput(component)"
                                                                        mode="result">
                                                                    </app-runtime-result-tpl>
                                                                </div>
                                                            }
                                                            @case ('markdown') {
                                                                <div class="markdown-viewer-component">
                                                                    <app-runtime-result-tpl
                                                                        [title]="component.label || 'Markdown'"
                                                                        [value]="markdownContentFor(component)"
                                                                        mode="markdown">
                                                                    </app-runtime-result-tpl>
                                                                </div>
                                                            }
                                                            @default {
                                                                <div class="composite-placeholder">
                                                                    <mat-icon>hub</mat-icon>
                                                                    <span>{{ tabLabel(component) }}</span>
                                                                </div>
                                                            }
                                                        }
                                                    </div>
                                                </ng-template>
                                            </mat-tab>
                                        }
                                        @if (isAdmin()) {
                                            <mat-tab>
                                                <ng-template mat-tab-label>
                                                    <span class="tab-label-with-icon">
                                                        <mat-icon>bug_report</mat-icon>
                                                        <span>{{ 'templates.sessions.admin_data.title' | translate }}</span>
                                                    </span>
                                                </ng-template>
                                                <ng-template matTabContent>
                                                    <ng-container [ngTemplateOutlet]="adminDataMapContent"></ng-container>
                                                </ng-template>
                                            </mat-tab>
                                        }
                                    </mat-tab-group>
                                } @else if (!hasAssignmentUiOverride()) {
                                    <mat-tab-group class="composite-tabs">
                                        @for (composite of compositeWorkflows(); track composite.id) {
                                            <mat-tab [label]="composite.label">
                                                <ng-template matTabContent>
                                                    <div class="composite-content">
                                                        <!-- Render based on composite type -->
                                                        @if (getCompositeComponentType(composite) === 'chat') {
                                                            <app-chat-tpl
                                                                [projectId]="config.projectId"
                                                                [sessionId]="selectedSessionId() ?? ''"
                                                                [currentUser]="currentUser()"
                                                                [chatTemplateId]="getExecutionTemplateId()"
                                                                [fileTemplateId]="getExecutionTemplateId()"
                                                                [mode]="chatMode(getFirstComponentOfType('chat'))"
                                                                [config]="chatConfig()"
                                                                (messageSent)="onMessageSent($event)"
                                                                (errorEmitter)="onChatError($event)">
                                                            </app-chat-tpl>
                                                        } @else if (getCompositeComponentType(composite) === 'compare') {
                                                            @if (isComponentReadyForExecution(getFirstComponentOfType('compare'))) {
                                                                <app-compare-tpl
                                                                    [mode]="compareMode(getFirstComponentOfType('compare'))"
                                                                    [config]="compareConfig()"
                                                                    (comparisonStarted)="onComparisonStarted()"
                                                                    (comparisonCompleted)="onComparisonCompleted($event)"
                                                                    (comparisonError)="onComparisonError($event)">
                                                                </app-compare-tpl>
                                                            } @else {
                                                                <div class="binding-warning">
                                                                    <mat-icon>error</mat-icon>
                                                                    <span>{{ getBindingRequirementMessage(getFirstComponentOfType('compare')) }}</span>
                                                                </div>
                                                            }
                                                        } @else if (getCompositeComponentType(composite) === 'extract') {
                                                            <app-extract-tpl
                                                                [mode]="extractMode(getFirstComponentOfType('extract'))"
                                                                [config]="extractConfig()"
                                                                (extractionStarted)="onExtractionStarted()"
                                                                (extractionCompleted)="onExtractionCompleted($event)"
                                                                (extractionError)="onExtractionError($event)">
                                                            </app-extract-tpl>
                                                        } @else if (getCompositeComponentType(composite) === 'summarize') {
                                                            @if (isComponentReadyForExecution(getFirstComponentOfType('summarize'))) {
                                                                <app-summarize-tpl
                                                                    [mode]="summarizeMode(getFirstComponentOfType('summarize'))"
                                                                    [config]="summarizeConfig()"
                                                                    (summarizeStarted)="onSummarizeStarted()"
                                                                    (summarizeCompleted)="onSummarizeCompleted($event)"
                                                                    (summarizeError)="onSummarizeError($event)">
                                                                </app-summarize-tpl>
                                                            } @else {
                                                                <div class="binding-warning">
                                                                    <mat-icon>error</mat-icon>
                                                                    <span>{{ getBindingRequirementMessage(getFirstComponentOfType('summarize')) }}</span>
                                                                </div>
                                                            }
                                                        } @else if (getCompositeComponentType(composite) === 'file-uploader' || getCompositeComponentType(composite) === 'file-upload') {
                                                            <app-file-upload-panel
                                                                [config]="fileUploadConfig()"
                                                                (filesSubmitted)="onFilesSubmitted($event)">
                                                            </app-file-upload-panel>
                                                        } @else {
                                                            <div class="composite-placeholder">
                                                                <mat-icon>hub</mat-icon>
                                                                <span>{{ composite.label }}</span>
                                                            </div>
                                                        }
                                                    </div>
                                                </ng-template>
                                            </mat-tab>
                                        }
                                        @if (isAdmin()) {
                                            <mat-tab>
                                                <ng-template mat-tab-label>
                                                    <span class="tab-label-with-icon">
                                                        <mat-icon>bug_report</mat-icon>
                                                        <span>{{ 'templates.sessions.admin_data.title' | translate }}</span>
                                                    </span>
                                                </ng-template>
                                                <ng-template matTabContent>
                                                    <ng-container [ngTemplateOutlet]="adminDataMapContent"></ng-container>
                                                </ng-template>
                                            </mat-tab>
                                        }
                                    </mat-tab-group>
                                } @else {
                                    <div class="default-layout">
                                        <mat-icon>widgets</mat-icon>
                                        <h3>{{ 'templates.preview.no_components' | translate }}</h3>
                                    </div>
                                }
                            }

                            @case ('comparison-view') {
                                <div class="comparison-layout">
                                    @if (hasCompareComponent()) {
                                        @if (isComponentReadyForExecution(getFirstComponentOfType('compare'))) {
                                            <app-compare-tpl
                                                [mode]="compareMode(getFirstComponentOfType('compare'))"
                                                [config]="compareConfig(getFirstComponentOfType('compare'))"
                                                (comparisonStarted)="onComparisonStarted()"
                                                (comparisonCompleted)="onComparisonCompleted($event)"
                                                (comparisonError)="onComparisonError($event)">
                                            </app-compare-tpl>
                                        } @else {
                                            <div class="binding-warning">
                                                <mat-icon>error</mat-icon>
                                                <span>{{ getBindingRequirementMessage(getFirstComponentOfType('compare')) }}</span>
                                            </div>
                                        }
                                    } @else {
                                        <div class="comparison-panel left">
                                            @if (getComparisonComponent('left'); as leftComp) {
                                                <h4>{{ leftComp.label || ('templates.comparison.left' | translate) }}</h4>
                                                <app-file-upload-panel
                                                    [config]="fileUploadConfig()"
                                                    (filesSubmitted)="onFilesSubmitted($event, 'left')">
                                                </app-file-upload-panel>
                                            }
                                        </div>
                                        <div class="comparison-divider">
                                            <mat-icon>compare_arrows</mat-icon>
                                        </div>
                                        <div class="comparison-panel right">
                                            @if (getComparisonComponent('right'); as rightComp) {
                                                <h4>{{ rightComp.label || ('templates.comparison.right' | translate) }}</h4>
                                                <app-file-upload-panel
                                                    [config]="fileUploadConfig()"
                                                    (filesSubmitted)="onFilesSubmitted($event, 'right')">
                                                </app-file-upload-panel>
                                            }
                                        </div>
                                    }
                                </div>
                            }

                            @case ('dashboard') {
                                <div class="dashboard-layout">
                                    @for (component of uiComponents(); track component.id) {
                                        <div class="dashboard-widget"
                                             [style.grid-row]="component.position?.row || 'auto'"
                                             [style.grid-column]="component.position?.column || 'auto'">
                                            @switch (component.type) {
                                                @case ('chat') {
                                                    <app-chat-tpl
                                                        [projectId]="config.projectId"
                                                        [sessionId]="selectedSessionId() ?? ''"
                                                        [currentUser]="currentUser()"
                                                        [chatTemplateId]="getExecutionTemplateId()"
                                                        [fileTemplateId]="getExecutionTemplateId()"
                                                        [mode]="chatMode(component)"
                                                        [config]="chatConfig()"
                                                        (messageSent)="onMessageSent($event)"
                                                        (errorEmitter)="onChatError($event)">
                                                    </app-chat-tpl>
                                                }
                                                @case ('file-uploader') {
                                                    <app-file-upload-panel
                                                        [config]="fileUploadConfig(component)"
                                                        (filesSubmitted)="onFilesSubmitted($event, undefined, component)">
                                                    </app-file-upload-panel>
                                                }
                                                @case ('file-upload') {
                                                    <app-file-upload-panel
                                                        [config]="fileUploadConfig(component)"
                                                        (filesSubmitted)="onFilesSubmitted($event, undefined, component)">
                                                    </app-file-upload-panel>
                                                }
                                                @case ('compare') {
                                                    @if (isComponentReadyForExecution(component)) {
                                                        <app-compare-tpl
                                                            [mode]="compareMode(component)"
                                                            [config]="compareConfig(component)"
                                                            (comparisonStarted)="onComparisonStarted(component)"
                                                            (comparisonCompleted)="onComparisonCompleted($event, component)"
                                                            (comparisonError)="onComparisonError($event, component)">
                                                        </app-compare-tpl>
                                                    } @else {
                                                        <div class="binding-warning">
                                                            <mat-icon>error</mat-icon>
                                                            <span>{{ getBindingRequirementMessage(component) }}</span>
                                                        </div>
                                                    }
                                                }
                                                @case ('extract') {
                                                    <app-extract-tpl
                                                        [mode]="extractMode(component)"
                                                        [config]="extractConfig(component)"
                                                        (extractionStarted)="onExtractionStarted(component)"
                                                        (extractionCompleted)="onExtractionCompleted($event, component)"
                                                        (extractionError)="onExtractionError($event, component)">
                                                    </app-extract-tpl>
                                                }
                                                @case ('summarize') {
                                                    @if (isComponentReadyForExecution(component)) {
                                                        <app-summarize-tpl
                                                            [mode]="summarizeMode(component)"
                                                            [config]="summarizeConfig(component)"
                                                            (summarizeStarted)="onSummarizeStarted(component)"
                                                            (summarizeCompleted)="onSummarizeCompleted($event, component)"
                                                            (summarizeError)="onSummarizeError($event, component)">
                                                        </app-summarize-tpl>
                                                    } @else {
                                                        <div class="binding-warning">
                                                            <mat-icon>error</mat-icon>
                                                            <span>{{ getBindingRequirementMessage(component) }}</span>
                                                        </div>
                                                    }
                                                }
                                                @case ('result-viewer') {
                                                    <div class="result-viewer-widget">
                                                        <app-runtime-result-tpl
                                                            [title]="component.label || ('templates.components.result_viewer' | translate)"
                                                            [value]="getComponentOutput(component)"
                                                            mode="result">
                                                        </app-runtime-result-tpl>
                                                    </div>
                                                }
                                                @case ('result-view') {
                                                    <div class="result-viewer-widget">
                                                        <app-runtime-result-tpl
                                                            [title]="component.label || 'Result View'"
                                                            [value]="getComponentOutput(component)"
                                                            mode="result">
                                                        </app-runtime-result-tpl>
                                                    </div>
                                                }
                                                @case ('markdown') {
                                                    <div class="markdown-viewer-component">
                                                        <app-runtime-result-tpl
                                                            [title]="component.label || 'Markdown'"
                                                            [value]="markdownContentFor(component)"
                                                            mode="markdown">
                                                        </app-runtime-result-tpl>
                                                    </div>
                                                }
                                                @case ('document-list') {
                                                    <div class="document-list-widget">
                                                        <h4>{{ component.label || ('templates.components.document_list' | translate) }}</h4>
                                                        <!-- Document list implementation -->
                                                    </div>
                                                }
                                            }
                                        </div>
                                    }
                                </div>
                            }

                            @default {
                                <div class="default-layout">
                                    <mat-icon>construction</mat-icon>
                                    <h3>{{ 'templates.layout.custom' | translate }}</h3>
                                    <p>{{ 'templates.layout.custom_description' | translate }}</p>
                                </div>
                            }
                        }
                    </div>
                    <ng-template #adminDataMapContent>
                        <div class="admin-debug-tab">
                            @if (runtimeDebugGroups().length === 0) {
                                <div class="admin-debug-empty">
                                    <mat-icon>info</mat-icon>
                                    <span>{{ 'templates.sessions.admin_data.no_bindings' | translate }}</span>
                                </div>
                            } @else {
                                <div class="admin-debug-layout">
                                    <div class="admin-debug-groups">
                                        @for (group of runtimeDebugGroups(); track group.componentId) {
                                            <section class="admin-debug-group">
                                                <header class="admin-debug-group-header">
                                                    <span class="tab-label-with-icon">
                                                        <mat-icon>{{ group.componentIcon }}</mat-icon>
                                                        <span>{{ group.componentLabel }}</span>
                                                    </span>
                                                    <span class="group-count">{{ group.bindings.length }}</span>
                                                </header>
                                                @if (group.bindings.length === 0) {
                                                    <div class="admin-debug-group-empty">
                                                        {{ 'templates.sessions.admin_data.no_component_bindings' | translate }}
                                                    </div>
                                                } @else {
                                                    <div class="admin-debug-binding-list">
                                                        @for (binding of group.bindings; track binding.id) {
                                                            <button type="button"
                                                                    class="admin-debug-binding"
                                                                    [class.selected]="selectedRuntimeDebugBinding()?.id === binding.id"
                                                                    [class.scope-session]="binding.scope === 'session'"
                                                                    [class.scope-project]="binding.scope === 'project'"
                                                                    [class.scope-both]="binding.scope === 'both'"
                                                                    [class.scope-none]="binding.scope === 'unscoped'"
                                                                    (click)="selectRuntimeDebugBinding(binding.id)">
                                                                <div class="binding-main">
                                                                    <span class="binding-property">{{ binding.componentProperty }}</span>
                                                                    <span class="binding-path">{{ binding.workflowPath }}</span>
                                                                </div>
                                                                <div class="binding-meta">
                                                                    <span class="binding-scope">{{ runtimeDebugScopeLabel(binding.scope) }}</span>
                                                                    <span class="binding-value">{{ runtimeDebugValuePreview(binding.value) }}</span>
                                                                </div>
                                                            </button>
                                                        }
                                                    </div>
                                                }
                                            </section>
                                        }
                                    </div>
                                    <div class="admin-debug-details">
                                        @if (selectedRuntimeDebugBinding(); as selectedBinding) {
                                            <div class="debug-details-header">
                                                <h4>{{ selectedBinding.componentLabel }}</h4>
                                                <span class="debug-scope-chip"
                                                      [class.scope-session]="selectedBinding.scope === 'session'"
                                                      [class.scope-project]="selectedBinding.scope === 'project'"
                                                      [class.scope-both]="selectedBinding.scope === 'both'"
                                                      [class.scope-none]="selectedBinding.scope === 'unscoped'">
                                                    {{ runtimeDebugScopeLabel(selectedBinding.scope) }}
                                                </span>
                                            </div>
                                            <div class="debug-detail-row">
                                                <span class="label">{{ 'templates.sessions.admin_data.property' | translate }}</span>
                                                <span class="value">{{ selectedBinding.componentProperty }}</span>
                                            </div>
                                            <div class="debug-detail-row">
                                                <span class="label">{{ 'templates.sessions.admin_data.workflow_path' | translate }}</span>
                                                <span class="value">{{ selectedBinding.workflowPath }}</span>
                                            </div>
                                            <div class="debug-detail-row">
                                                <span class="label">{{ 'templates.sessions.admin_data.source' | translate }}</span>
                                                <span class="value">{{ runtimeDebugSourceLabel(selectedBinding.scope) }}</span>
                                            </div>
                                            <div class="debug-detail-row">
                                                <span class="label">{{ 'templates.sessions.admin_data.value_type' | translate }}</span>
                                                <span class="value">{{ selectedBinding.valueKind }}</span>
                                            </div>
                                            <div class="debug-detail-row column">
                                                <span class="label">{{ 'templates.sessions.admin_data.value' | translate }}</span>
                                                <pre class="debug-value">{{ formatRuntimeDebugValue(selectedBinding.value) }}</pre>
                                            </div>
                                        } @else {
                                            <div class="admin-debug-empty">
                                                <mat-icon>touch_app</mat-icon>
                                                <span>{{ 'templates.sessions.admin_data.select_binding' | translate }}</span>
                                            </div>
                                        }
                                    </div>
                                </div>
                            }
                        </div>
                    </ng-template>
                }
            </div>
        </div>
    `,
    styleUrl: './template-execution-panel.component.scss',
    changeDetection: ChangeDetectionStrategy.OnPush,
})
export class TemplateExecutionPanelComponent implements OnInit, OnDestroy {
    private readonly templateStore = inject(TemplateWorkflowsStore);
    private readonly translate = inject(TranslateService);
    private readonly keycloak = inject(KeycloakService);
    private readonly dialog = inject(MatDialog);
    private readonly destroy$ = new Subject<void>();

    private readonly configSignal = signal<TemplateExecutionConfig | null>(null);

    @Input({ required: true }) set config(value: TemplateExecutionConfig) {
        this.configSignal.set(value);
    }

    get config(): TemplateExecutionConfig {
        const config = this.configSignal();
        if (!config) {
            throw new Error('TemplateExecutionPanelComponent: config input is required.');
        }
        return config;
    }

    @Output() sessionCreated = new EventEmitter<TemplateExecutionSession>();
    @Output() sessionDeleted = new EventEmitter<string>();
    @Output() executionStarted = new EventEmitter<{ sessionId: string; data?: unknown }>();

    // State signals
    readonly sessions = signal<TemplateExecutionSession[]>([]);
    readonly selectedSessionId = signal<string | null>(null);
    readonly isLoadingSessions = signal(false);
    readonly isExecuting = signal(false);
    readonly isAdmin = signal(false);
    readonly selectedRuntimeDebugBindingId = signal<string | null>(null);

    // Computed signals
    readonly selectedSession = computed(() =>
        this.sessions().find(s => s.id === this.selectedSessionId())
    );

    readonly assignmentUiTemplateOverride = computed(() => this.resolveAssignmentUiTemplateOverride());

    readonly templateLayout = computed(() =>
        this.assignmentUiTemplateOverride()?.layout ?? this.config.template.uiTemplate.layout
    );

    readonly uiComponents = computed(() =>
        this.assignmentUiTemplateOverride()
            ? this.mergeUiComponentsWithTemplateDefaults(this.assignmentUiTemplateOverride()!.components)
            : this.config.template.uiTemplate.components
    );

    readonly runtimeDebugGroups = computed<RuntimeDebugBindingGroup[]>(() =>
        this.buildRuntimeDebugGroups()
    );

    readonly selectedRuntimeDebugBinding = computed<RuntimeDebugBindingItem | null>(() => {
        const groups = this.runtimeDebugGroups();
        const allBindings = groups.flatMap(group => group.bindings);
        if (allBindings.length === 0) {
            return null;
        }
        const selectedId = this.selectedRuntimeDebugBindingId();
        return allBindings.find(binding => binding.id === selectedId) ?? allBindings[0];
    });

    readonly uiTabComponents = computed(() =>
        this.uiComponents().filter(component => this.isTabRenderableComponent(component.type))
    );

    readonly compositeWorkflows = computed(() =>
        this.config.template.compositeWorkflows
    );

    readonly executionOutputs = computed(() =>
        this.selectedSession()?.context.outputs ?? null
    );

    readonly chatConfig = computed(() => {
        const chatComponent = this.findFirstComponentByTypes(['chat']);
        const cfg = this.getComponentConfig(chatComponent);
        const strictUiBindings = this.hasAssignmentUiOverride();
        const hasQueryBinding = this.chatHasQueryBinding(chatComponent);
        const hasAttachmentBinding = this.chatHasAttachmentBinding(chatComponent);
        const queryTrigger = this.resolveFirstTriggerConstraint(
            chatComponent,
            ['user_query', 'query', 'text', 'value', 'message', 'user_prompt', 'prompt']
        );
        const fileTriggerConstraints = this.resolveMergedFileConstraint(
            chatComponent,
            ['uploaded_files', 'files', 'file_upload', 'attachments', 'file']
        );
        const maxMessageLength = this.getNumberConfig(
            cfg,
            ['maxLength', 'maxMessageLength', 'max_message_length']
        ) ?? this.getNumberConfig(queryTrigger?.params ?? {}, ['max_chars', 'maxChars', 'max_length', 'maxLength']) ?? 4000;
        const acceptedFileTypes = this.getStringArrayConfig(
            cfg,
            ['acceptedFileTypes', 'acceptedTypes', 'accepted_types', 'allowedFileTypes']
        ) ?? fileTriggerConstraints?.acceptedTypes;
        const attachmentsEnabled = this.getBooleanConfig(
            cfg,
            ['enableAttachments', 'enable_attachments']
        ) ?? fileTriggerConstraints !== null;
        const placeholder = this.getStringConfig(cfg, ['placeholder'])
            ?? this.getStringConfig(queryTrigger?.params ?? {}, ['placeholder', 'inputPlaceholder']);
        const maxFiles = this.getNumberConfig(cfg, ['maxFiles', 'max_files'])
            ?? fileTriggerConstraints?.maxFiles
            ?? 5;
        const maxFileSize = this.getNumberConfig(cfg, ['maxFileSize', 'max_file_size'])
            ?? fileTriggerConstraints?.maxFileSize
            ?? 10 * 1024 * 1024;

        return {
            showTimestamps: this.getBooleanConfig(cfg, ['showTimestamps', 'show_timestamps']) ?? true,
            allowEdit: this.getBooleanConfig(cfg, ['allowEdit', 'allow_edit']) ?? false,
            allowDelete: this.getBooleanConfig(cfg, ['allowDelete', 'allow_delete']) ?? false,
            allowMarkdown: this.getBooleanConfig(cfg, ['allowMarkdown', 'allow_markdown']) ?? true,
            showAvatars: this.getBooleanConfig(cfg, ['showAvatars', 'show_avatars']) ?? true,
            maxMessageLength,
            maxLength: maxMessageLength,
            placeholder,
            emptyStateMessage: this.getStringConfig(cfg, ['emptyStateMessage', 'empty_state_message']),
            showInputArea: strictUiBindings
                ? (hasQueryBinding || hasAttachmentBinding)
                : (this.getBooleanConfig(cfg, ['showInputArea', 'show_input_area']) ?? true),
            showHistoryArea: strictUiBindings
                ? this.chatHasHistoryBinding(chatComponent)
                : (this.getBooleanConfig(cfg, ['showHistoryArea', 'show_history_area']) ?? true),
            enableAttachments: strictUiBindings
                ? hasAttachmentBinding
                : (attachmentsEnabled ?? hasAttachmentBinding),
            acceptedFileTypes: acceptedFileTypes?.join(','),
            maxFiles,
            maxFileSize,
        };
    });

    readonly currentUser = signal<ChatSender>({
        id: 'current-user',
        name: 'User',
        type: 'user',
        avatar: '',
    });

    private resolveAssignmentUiTemplateOverride():
        { layout: TemplateLayoutType; components: UIComponentConfig[] } | null {
        const configuration = this.config.assignment.configuration;
        if (!configuration || typeof configuration !== 'object') {
            return null;
        }
        const record = configuration as Record<string, unknown>;
        const uiTemplate = record['uiTemplate'];
        if (!uiTemplate || typeof uiTemplate !== 'object') {
            return null;
        }
        const uiTemplateRecord = uiTemplate as Record<string, unknown>;

        const layoutRaw = uiTemplateRecord['layout'];
        const componentsRaw = uiTemplateRecord['components'];
        if (typeof layoutRaw !== 'string' || !Array.isArray(componentsRaw)) {
            return null;
        }

        const components: UIComponentConfig[] = componentsRaw
            .map(raw => this.normalizeUiComponent(raw))
            .filter((component): component is UIComponentConfig => !!component);

        return {
            layout: layoutRaw as TemplateLayoutType,
            components,
        };
    }

    private mergeUiComponentsWithTemplateDefaults(
        overrideComponents: UIComponentConfig[]
    ): UIComponentConfig[] {
        const defaults = this.config.template.uiTemplate.components ?? [];
        if (!overrideComponents.length) {
            return [];
        }

        const consumedDefaults = new Set<number>();
        return overrideComponents.map(component => {
            let matchIndex = defaults.findIndex(
                (candidate, index) =>
                    !consumedDefaults.has(index) && candidate.id === component.id
            );
            if (matchIndex < 0) {
                matchIndex = defaults.findIndex(
                    (candidate, index) =>
                        !consumedDefaults.has(index) && candidate.type === component.type
                );
            }

            const fallback = matchIndex >= 0 ? defaults[matchIndex] : undefined;
            if (matchIndex >= 0) {
                consumedDefaults.add(matchIndex);
            }

            return {
                ...fallback,
                ...component,
                bindings: component.bindings?.length
                    ? component.bindings
                    : (fallback?.bindings ?? []),
                config: {
                    ...(fallback?.config ?? {}),
                    ...(component.config ?? {}),
                },
            };
        });
    }

    private normalizeUiComponent(raw: unknown): UIComponentConfig | null {
        if (!raw || typeof raw !== 'object') return null;
        const record = raw as Record<string, unknown>;
        const id = typeof record['id'] === 'string' ? record['id'] : null;
        const type = typeof record['type'] === 'string' ? record['type'] as UIComponentType : null;
        if (!id || !type) return null;

        const label = typeof record['label'] === 'string' ? record['label'] : undefined;
        const bindingsRaw = Array.isArray(record['bindings']) ? record['bindings'] : [];
        const bindings = bindingsRaw
            .map(bindingRaw => {
                if (!bindingRaw || typeof bindingRaw !== 'object') return null;
                const binding = bindingRaw as Record<string, unknown>;
                const componentProperty = typeof binding['componentProperty'] === 'string'
                    ? binding['componentProperty']
                    : null;
                const workflowPath = typeof binding['workflowPath'] === 'string'
                    ? binding['workflowPath']
                    : null;
                if (!componentProperty || !workflowPath) return null;
                return { componentProperty, workflowPath };
            })
            .filter((binding): binding is { componentProperty: string; workflowPath: string } => !!binding);
        const config = this.isRecord(record['config'])
            ? record['config'] as Record<string, unknown>
            : undefined;

        return {
            id,
            type,
            label,
            bindings,
            config,
        };
    }

    ngOnInit(): void {
        const { roles } = this.keycloak.getUserCtx();
        this.isAdmin.set(roles.includes(UserRole.ROLE_admin));
        this.loadSessions();
    }

    ngOnDestroy(): void {
        this.destroy$.next();
        this.destroy$.complete();
    }

    private loadSessions(): void {
        this.templateStore.selectSessionsByAssignment(this.config.assignment.id)
            .pipe(takeUntil(this.destroy$))
            .subscribe(sessions => {
                // Convert string dates to DateTime objects
                const hydratedSessions = sessions.map(s => ({
                    ...s,
                    createdAt: typeof s.createdAt === 'string'
                        ? DateTime.fromISO(s.createdAt)
                        : s.createdAt,
                    updatedAt: typeof s.updatedAt === 'string'
                        ? DateTime.fromISO(s.updatedAt)
                        : s.updatedAt,
                })) as unknown as TemplateExecutionSession[];

                this.sessions.set(hydratedSessions);

                // Auto-select first session if none selected
                if (hydratedSessions.length > 0 && !this.selectedSessionId()) {
                    this.selectedSessionId.set(hydratedSessions[0].id);
                }
            });
    }

    // ========================================================================
    // SESSION MANAGEMENT
    // ========================================================================

    createNewSession(): void {
        const sessionNumber = this.sessions().length + 1;
        this.templateStore.createSession({
            assignmentId: this.config.assignment.id,
            projectId: this.config.projectId,
            name: `${this.translate.instant('templates.sessions.session')} #${sessionNumber}`,
        });
    }

    selectSession(session: TemplateExecutionSession): void {
        this.selectedSessionId.set(session.id);
        this.templateStore.selectSession(session.id);
    }

    onSessionItemKeydown(event: KeyboardEvent, session: TemplateExecutionSession): void {
        if (event.key === 'Enter' || event.key === ' ') {
            event.preventDefault();
            this.selectSession(session);
        }
    }

    renameSession(session: TemplateExecutionSession): void {
        const newName = prompt(
            this.translate.instant('templates.sessions.enter_name'),
            session.name
        );
        if (newName && newName !== session.name) {
            this.templateStore.updateSession({
                assignmentId: session.assignmentId,
                sessionId: session.id,
                changes: { name: newName },
            });
        }
    }

    async deleteSession(session: TemplateExecutionSession): Promise<void> {
        const confirmed = await firstValueFrom(
            this.dialog.open<ConfirmDialogComponent, ConfirmDialogData, boolean>(
                ConfirmDialogComponent,
                {
                    data: {
                        title: this.translate.instant('common.delete'),
                        message: this.translate.instant('templates.sessions.confirm_delete'),
                        context: { session },
                    },
                }
            ).afterClosed()
        );

        if (!confirmed) {
            return;
        }

        this.templateStore.removeSession({
            assignmentId: session.assignmentId,
            sessionId: session.id,
        });
        this.sessionDeleted.emit(session.id);

        if (this.selectedSessionId() === session.id) {
            const remaining = this.sessions().filter(s => s.id !== session.id);
            this.selectedSessionId.set(remaining.length > 0 ? remaining[0].id : null);
        }
    }

    // ========================================================================
    // UI COMPONENT HELPERS
    // ========================================================================

    hasChatComponent(): boolean {
        return this.hasComponentType('chat');
    }

    hasFileUploader(): boolean {
        return this.hasAnyComponentType(['file-uploader', 'file-upload']);
    }

    hasAssignmentUiOverride(): boolean {
        return !!this.assignmentUiTemplateOverride();
    }

    chatHasAttachmentBinding(component?: UIComponentConfig | null): boolean {
        return this.componentHasAnyBinding(component, [
            'uploaded_files',
            'files',
            'file_upload',
            'attachments',
            'file',
        ]);
    }

    chatHasHistoryBinding(component?: UIComponentConfig | null): boolean {
        return this.componentHasAnyBinding(component, ['history', 'chat_history', 'messages']);
    }

    chatHasQueryBinding(component?: UIComponentConfig | null): boolean {
        return this.componentHasAnyBinding(component, [
            'user_query',
            'query',
            'message',
            'text',
            'prompt',
            'user_prompt',
            'value',
        ]);
    }

    hasCompareComponent(): boolean {
        return this.hasAnyComponentType(['compare', 'comparison-panel']);
    }

    hasExtractComponent(): boolean {
        return this.hasComponentType('extract');
    }

    hasSummarizeComponent(): boolean {
        return this.hasComponentType('summarize');
    }

    getExecutionTemplateId(): string {
        return this.config.assignment.templateId || this.config.template.id;
    }

    getFirstComponentOfType(type: string): UIComponentConfig | null {
        return this.findFirstComponentByTypes([type]);
    }

    getCompositeComponentType(composite: { id: string; compositeWorkflowId: string }): UIComponentType | 'compare' | 'extract' | 'summarize' | 'file-upload' {
        // Determine the primary component type for this composite
        const compositeWorkflow = this.templateStore.getCompositeById(composite.compositeWorkflowId);
        if (!compositeWorkflow) return 'custom';

        // Check exposed inputs/outputs to determine type
        const hasChat = compositeWorkflow.exposedInputs.some(i =>
            i.dataReference === 'user_prompt' || i.dataReference === 'chat_history'
        );
        const hasFile = compositeWorkflow.exposedInputs.some(i =>
            i.dataReference === 'file' || i.artifactType === 'file'
        );
        const hasCompare = compositeWorkflow.name.toLowerCase().includes('compare');
        const hasExtract = compositeWorkflow.name.toLowerCase().includes('extract');
        const hasSummarize = compositeWorkflow.name.toLowerCase().includes('summar');

        if (hasChat) return 'chat';
        if (hasCompare) return 'compare';
        if (hasExtract) return 'extract';
        if (hasSummarize) return 'summarize';
        if (hasFile) return 'file-uploader';
        return 'result-viewer';
    }

    getComparisonComponent(side: 'left' | 'right'): UIComponentConfig | null {
        const components = this.findComponentsByTypes(['comparison-panel', 'compare']);
        const index = side === 'left' ? 0 : 1;
        return components[index] ?? null;
    }

    tabLabel(component: UIComponentConfig): string {
        if (component.label && component.label.trim().length > 0) {
            return component.label;
        }

        const defaults: Record<string, string> = {
            chat: 'Chat',
            compare: 'Two Files',
            summarize: 'One File Upload',
            extract: 'Extract',
            'file-uploader': 'File Upload',
            'file-upload': 'File Upload',
            'result-viewer': 'Results',
            'result-view': 'Result View',
            markdown: 'Markdown',
        };
        return defaults[component.type as string] ?? component.type;
    }

    tabIcon(component: UIComponentConfig): string {
        const defaults: Record<string, string> = {
            chat: 'chat',
            compare: 'compare',
            summarize: 'summarize',
            extract: 'find_in_page',
            'file-uploader': 'upload_file',
            'file-upload': 'upload_file',
            'result-viewer': 'analytics',
            'result-view': 'analytics',
            markdown: 'article',
        };
        return defaults[component.type as string] ?? 'widgets';
    }

    chatMode(component?: UIComponentConfig | null): ChatMode {
        const messages = this.resolveChatMessages(component);
        if (messages.length > 0) {
            return { mode: 'preloaded', messages };
        }
        return { mode: 'interactive' };
    }

    compareMode(component?: UIComponentConfig | null): CompareMode {
        const result = this.resolveBoundValue(component, ['comparison_result']);
        if (this.isComparisonResult(result)) {
            return { mode: 'preloaded', result };
        }
        return { mode: 'upload' };
    }

    extractMode(component?: UIComponentConfig | null): ExtractMode {
        const result = this.resolveBoundValue(component, ['extraction_result']);
        if (this.isExtractionResult(result)) {
            return { mode: 'preloaded', result };
        }
        return { mode: 'upload' };
    }

    summarizeMode(component?: UIComponentConfig | null): SummarizeMode {
        const result = this.resolveBoundValue(component, ['summary_result']);
        if (this.isSummaryResult(result)) {
            return { mode: 'preloaded', result };
        }
        return { mode: 'upload' };
    }

    getComponentOutput(component: UIComponentConfig): unknown {
        const value = this.resolveBoundValue(component, ['value', 'result', 'data']);
        if (value !== undefined) {
            return value;
        }
        const firstBindingPath = component.bindings?.[0]?.workflowPath;
        return firstBindingPath ? this.resolveWorkflowPathValue(firstBindingPath) ?? null : null;
    }

    fileUploadConfig(component?: UIComponentConfig | null): FileUploadConfig {
        const targetComponent = component ?? this.findFirstComponentByTypes(['file-uploader', 'file-upload']);
        const config = this.getComponentConfig(targetComponent);
        const triggerConstraint = this.resolveMergedFileConstraint(
            targetComponent,
            ['files', 'uploaded_files', 'source_file', 'left_file', 'right_file']
        );

        const acceptedTypes = this.getStringArrayConfig(config, ['acceptedTypes', 'accepted_types', 'allowedFileTypes'])
            ?? triggerConstraint?.acceptedTypes
            ?? [
            'application/pdf',
            'text/plain',
            'application/msword',
            'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
        ];

        return {
            acceptedTypes,
            maxFileSize: this.getNumberConfig(config, ['maxFileSize', 'max_file_size'])
                ?? triggerConstraint?.maxFileSize
                ?? 10 * 1024 * 1024,
            maxFiles: this.getNumberConfig(config, ['maxFiles', 'max_files'])
                ?? triggerConstraint?.maxFiles
                ?? 5,
            multiple: this.getBooleanConfig(config, ['multiple'])
                ?? triggerConstraint?.multiple
                ?? true,
        };
    }

    compareConfig(component?: UIComponentConfig | null): CompareConfig {
        const targetComponent = component ?? this.findFirstComponentByTypes(['compare', 'comparison-panel']);
        const cfg = this.getComponentConfig(targetComponent);
        const triggerConstraint = this.resolveMergedFileConstraint(
            targetComponent,
            ['left_file', 'right_file']
        );
        const mappedAllowedFileTypes = this.toAllowedFileTypes(triggerConstraint?.acceptedTypes);
        return {
            allowedFileTypes: this.getStringArrayConfig(cfg, ['allowedFileTypes', 'acceptedTypes', 'accepted_types'])
                ?? mappedAllowedFileTypes
                ?? [
                '.pdf',
                '.docx',
                '.txt',
                '.json',
            ],
            maxFileSize: this.getNumberConfig(cfg, ['maxFileSize', 'max_file_size'])
                ?? triggerConstraint?.maxFileSize
                ?? 10 * 1024 * 1024,
        };
    }

    extractConfig(component?: UIComponentConfig | null): ExtractConfig {
        const targetComponent = component ?? this.findFirstComponentByTypes(['extract']);
        const cfg = this.getComponentConfig(targetComponent);
        const triggerConstraint = this.resolveMergedFileConstraint(
            targetComponent,
            ['source_file', 'files', 'uploaded_files']
        );
        const mappedAllowedFileTypes = this.toAllowedFileTypes(triggerConstraint?.acceptedTypes);
        return {
            allowedFileTypes: this.getStringArrayConfig(cfg, ['allowedFileTypes', 'acceptedTypes', 'accepted_types'])
                ?? mappedAllowedFileTypes
                ?? [
                '.pdf',
                '.docx',
                '.txt',
                '.json',
                '.md',
            ],
            maxFileSize: this.getNumberConfig(cfg, ['maxFileSize', 'max_file_size'])
                ?? triggerConstraint?.maxFileSize
                ?? 10 * 1024 * 1024,
            maxFiles: this.getNumberConfig(cfg, ['maxFiles', 'max_files'])
                ?? triggerConstraint?.maxFiles
                ?? 5,
        };
    }

    summarizeConfig(component?: UIComponentConfig | null): SummarizeConfig {
        const targetComponent = component ?? this.findFirstComponentByTypes(['summarize']);
        const cfg = this.getComponentConfig(targetComponent);
        const triggerConstraint = this.resolveMergedFileConstraint(
            targetComponent,
            ['source_file', 'files', 'uploaded_files']
        );
        const mappedAllowedFileTypes = this.toAllowedFileTypes(triggerConstraint?.acceptedTypes);
        return {
            allowedFileTypes: this.getStringArrayConfig(cfg, ['allowedFileTypes', 'acceptedTypes', 'accepted_types'])
                ?? mappedAllowedFileTypes
                ?? [
                '.pdf',
                '.docx',
                '.txt',
                '.json',
                '.md',
            ],
            maxFileSize: this.getNumberConfig(cfg, ['maxFileSize', 'max_file_size'])
                ?? triggerConstraint?.maxFileSize
                ?? 10 * 1024 * 1024,
            maxFiles: this.getNumberConfig(cfg, ['maxFiles', 'max_files'])
                ?? triggerConstraint?.maxFiles
                ?? 5,
        };
    }

    private isTabRenderableComponent(type: UIComponentType): boolean {
        return [
            'chat',
            'compare',
            'extract',
            'summarize',
            'file-uploader',
            'file-upload',
            'result-viewer',
            'result-view',
            'markdown',
        ].includes(type as string);
    }

    isComponentReadyForExecution(component?: UIComponentConfig | null): boolean {
        if (!component) return true;

        if (component.type === 'compare') {
            return this.componentHasAnyBinding(component, ['left_file'])
                && this.componentHasAnyBinding(component, ['right_file']);
        }

        if (component.type === 'summarize') {
            return this.componentHasAnyBinding(component, ['source_file']);
        }

        return true;
    }

    getBindingRequirementMessage(component?: UIComponentConfig | null): string {
        if (!component) return 'Missing component bindings.';

        if (component.type === 'compare') {
            const missing: string[] = [];
            if (!this.componentHasAnyBinding(component, ['left_file'])) {
                missing.push('File A');
            }
            if (!this.componentHasAnyBinding(component, ['right_file'])) {
                missing.push('File B');
            }
            return missing.length
                ? `Connect ${missing.join(' and ')} to run this Two Files component.`
                : '';
        }

        if (component.type === 'summarize') {
            return this.componentHasAnyBinding(component, ['source_file'])
                ? ''
                : 'Connect Source File to run this One File Upload component.';
        }

        return '';
    }

    markdownContentFor(component: UIComponentConfig): string {
        const value = this.resolveBoundValue(component, ['markdown', 'content', 'text', 'value', 'result', 'data']);
        if (typeof value === 'string' && value.trim().length > 0) {
            return value;
        }
        if (this.isRecord(value)) {
            for (const key of ['markdown', 'content', 'text', 'summary']) {
                const candidate = value[key];
                if (typeof candidate === 'string' && candidate.trim().length > 0) {
                    return candidate;
                }
            }
        }

        const componentConfig = this.getComponentConfig(component);
        const fallback = this.getStringConfig(componentConfig, ['markdown', 'content', 'defaultContent', 'default']);
        return fallback ?? '';
    }

    private resolveFirstTriggerConstraint(
        component: UIComponentConfig | null | undefined,
        componentProperties: string[]
    ): TriggerConstraint | null {
        const constraints = this.resolveTriggerConstraints(component, componentProperties);
        return constraints.length ? constraints[0] : null;
    }

    private resolveMergedFileConstraint(
        component: UIComponentConfig | null | undefined,
        componentProperties: string[]
    ): FileConstraint | null {
        const constraints = this.resolveTriggerConstraints(component, componentProperties)
            .map(constraint => this.extractFileConstraint(constraint))
            .filter((constraint): constraint is FileConstraint => !!constraint);

        if (!constraints.length) {
            return null;
        }

        const acceptedSets = constraints
            .map(constraint => constraint.acceptedTypes ?? [])
            .filter(set => set.length > 0)
            .map(set => this.normalizeAcceptedTypes(set));

        let acceptedTypes: string[] | undefined;
        if (acceptedSets.length === 1) {
            acceptedTypes = acceptedSets[0];
        } else if (acceptedSets.length > 1) {
            const intersection = acceptedSets.slice(1).reduce((acc, set) => {
                const setLower = new Set(set.map(item => item.toLowerCase()));
                return acc.filter(item => setLower.has(item.toLowerCase()));
            }, [...acceptedSets[0]]);

            acceptedTypes = intersection.length
                ? intersection
                : this.uniqueValues(acceptedSets.flat());
        }

        const maxFileSizes = constraints
            .map(constraint => constraint.maxFileSize)
            .filter((value): value is number => typeof value === 'number' && Number.isFinite(value) && value > 0);
        const maxFilesValues = constraints
            .map(constraint => constraint.maxFiles)
            .filter((value): value is number => typeof value === 'number' && Number.isFinite(value) && value > 0);
        const multiples = constraints
            .map(constraint => constraint.multiple)
            .filter((value): value is boolean => typeof value === 'boolean');

        return {
            acceptedTypes,
            maxFileSize: maxFileSizes.length ? Math.min(...maxFileSizes) : undefined,
            maxFiles: maxFilesValues.length ? Math.min(...maxFilesValues) : undefined,
            multiple: multiples.length ? multiples.every(Boolean) : undefined,
        };
    }

    private resolveTriggerConstraints(
        component: UIComponentConfig | null | undefined,
        componentProperties: string[]
    ): TriggerConstraint[] {
        if (!component) {
            return [];
        }

        const propertySet = new Set(componentProperties.map(property => property.toLowerCase()));
        const constraints: TriggerConstraint[] = [];
        const seen = new Set<string>();

        for (const binding of component.bindings ?? []) {
            const property = (binding.componentProperty ?? '').toLowerCase();
            if (!propertySet.has(property)) {
                continue;
            }
            const constraint = this.resolveTriggerConstraintFromWorkflowPath(binding.workflowPath);
            if (!constraint) {
                continue;
            }
            const key = `${constraint.templateNodeId}|${constraint.sourceNodeId}|${constraint.sourcePortId}|${constraint.triggerType}`;
            if (seen.has(key)) {
                continue;
            }
            seen.add(key);
            constraints.push(constraint);
        }

        return constraints;
    }

    private resolveTriggerConstraintFromWorkflowPath(workflowPath: string): TriggerConstraint | null {
        if (!workflowPath) {
            return null;
        }

        const parsedPath = this.parseTemplateWorkflowPath(workflowPath);
        if (!parsedPath) {
            return null;
        }

        const templateNode = this.config.template.compositeWorkflows
            .find(node => node.id === parsedPath.templateNodeId);
        if (!templateNode) {
            return null;
        }

        const composite = this.templateStore.getCompositeById(templateNode.compositeWorkflowId);
        if (!composite) {
            return null;
        }

        const handle = this.findCompositeExposedHandle(composite, parsedPath.exposedPortId);
        if (!handle) {
            return null;
        }

        const sourceNode = composite.nodes.find(node => node.id === handle.sourceNodeId);
        if (!sourceNode) {
            return null;
        }

        const nodeType = this.resolveCompositeNodeType(sourceNode);
        if (!this.isTriggerNodeType(nodeType)) {
            return null;
        }

        return {
            triggerType: nodeType,
            workflowPath,
            templateNodeId: templateNode.id,
            exposedPortId: parsedPath.exposedPortId,
            sourceNodeId: handle.sourceNodeId,
            sourcePortId: handle.sourcePortId,
            params: this.toRecord(sourceNode.configuration),
        };
    }

    private parseTemplateWorkflowPath(workflowPath: string):
        { templateNodeId: string; exposedPortId: string } | null {
        const normalizedPath = workflowPath
            .replace(/^in::/, '')
            .replace(/^out::/, '')
            .trim();
        const separatorIndex = normalizedPath.indexOf(':');
        if (separatorIndex <= 0 || separatorIndex >= normalizedPath.length - 1) {
            return null;
        }
        return {
            templateNodeId: normalizedPath.slice(0, separatorIndex),
            exposedPortId: normalizedPath.slice(separatorIndex + 1),
        };
    }

    private findCompositeExposedHandle(
        composite: CompositeWorkflow,
        exposedPortId: string
    ): ExposedHandle | null {
        const directMatch = composite.exposedInputs.find(handle => handle.id === exposedPortId)
            ?? composite.exposedOutputs.find(handle => handle.id === exposedPortId);
        if (directMatch) {
            return directMatch;
        }

        const tail = this.extractPathTail(exposedPortId, ':');
        if (!tail) {
            return null;
        }

        return composite.exposedInputs.find(handle => handle.id === tail)
            ?? composite.exposedOutputs.find(handle => handle.id === tail)
            ?? null;
    }

    private resolveCompositeNodeType(node: CompositeWorkflowNode): TriggerNodeType | string {
        const config = this.toRecord(node.configuration);
        const configType = this.getStringConfig(config, ['__nodeType', 'nodeType', 'type']);
        const normalizedFromConfig = this.normalizeNodeType(configType);
        if (normalizedFromConfig) {
            return normalizedFromConfig;
        }

        const microWorkflowId = (node.microWorkflowId ?? '').toString();
        if (!microWorkflowId.startsWith('micro-')) {
            return '';
        }
        const withoutPrefix = microWorkflowId.slice('micro-'.length);
        const suffix = `-${node.id}`;
        const candidate = withoutPrefix.endsWith(suffix)
            ? withoutPrefix.slice(0, -suffix.length)
            : withoutPrefix;
        return this.normalizeNodeType(candidate);
    }

    private isTriggerNodeType(type: string): type is TriggerNodeType {
        const normalized = this.normalizeNodeType(type);
        return normalized === 'trigger_chat'
            || normalized === 'trigger_file_upload'
            || normalized === 'trigger_webhook'
            || normalized === 'trigger_manual';
    }

    private normalizeNodeType(type: string | undefined): string {
        return (type ?? '').toString().trim().toLowerCase().replace(/-/g, '_');
    }

    private extractFileConstraint(constraint: TriggerConstraint): FileConstraint | null {
        const params = constraint.params;
        const acceptedTypes = this.getStringArrayConfig(
            params,
            ['accepted_types', 'acceptedTypes', 'allowedFileTypes', 'accept_content_types', 'acceptContentTypes']
        );
        const maxFileSize = this.getNumberConfig(
            params,
            ['max_file_size', 'maxFileSize', 'max_payload_size', 'maxPayloadSize']
        );
        const maxFiles = this.getNumberConfig(params, ['max_files', 'maxFiles']);
        const multiple = this.getBooleanConfig(params, ['multiple']);

        if (!acceptedTypes && maxFileSize === undefined && maxFiles === undefined && multiple === undefined) {
            return null;
        }

        return {
            acceptedTypes: acceptedTypes ?? undefined,
            maxFileSize: maxFileSize ?? undefined,
            maxFiles: maxFiles ?? undefined,
            multiple: multiple ?? undefined,
        };
    }

    private normalizeAcceptedTypes(types: string[]): string[] {
        return this.uniqueValues(
            types
                .map(type => type.trim())
                .filter(Boolean)
        );
    }

    private toAllowedFileTypes(acceptedTypes: string[] | undefined): string[] | undefined {
        if (!acceptedTypes?.length) {
            return undefined;
        }

        const mimeToExtension: Record<string, string> = {
            'application/pdf': '.pdf',
            'text/plain': '.txt',
            'application/msword': '.doc',
            'application/vnd.openxmlformats-officedocument.wordprocessingml.document': '.docx',
            'text/csv': '.csv',
            'application/json': '.json',
            'text/markdown': '.md',
        };

        const resolved = acceptedTypes
            .map(type => type.trim().toLowerCase())
            .filter(Boolean)
            .map(type => {
                if (type.startsWith('.')) return type;
                if (mimeToExtension[type]) return mimeToExtension[type];
                return type;
            });

        const normalized = this.uniqueValues(resolved);
        return normalized.length ? normalized : undefined;
    }

    private uniqueValues(values: string[]): string[] {
        const seen = new Set<string>();
        const unique: string[] = [];
        for (const value of values) {
            const normalized = value.toLowerCase();
            if (seen.has(normalized)) continue;
            seen.add(normalized);
            unique.push(value);
        }
        return unique;
    }

    private toRecord(value: unknown): Record<string, unknown> {
        if (!value || typeof value !== 'object' || Array.isArray(value)) {
            return {};
        }
        return value as Record<string, unknown>;
    }

    private resolveBoundValue(
        component: UIComponentConfig | null | undefined,
        componentProperties: string[]
    ): unknown {
        if (!component) {
            return undefined;
        }

        for (const binding of component.bindings ?? []) {
            if (!componentProperties.includes(binding.componentProperty)) {
                continue;
            }

            const value = this.resolveWorkflowPathValue(binding.workflowPath);
            if (value !== undefined) {
                return value;
            }
        }

        for (const componentProperty of componentProperties) {
            const value = this.resolveWorkflowPathValue(componentProperty);
            if (value !== undefined) {
                return value;
            }
        }

        return undefined;
    }

    private resolveWorkflowPathValue(workflowPath: string): unknown {
        const context = this.selectedSession()?.context;
        if (!context || !workflowPath) {
            return undefined;
        }

        const outputValue = this.resolveFromRecord(context.outputs, workflowPath);
        if (outputValue !== undefined) {
            return outputValue;
        }

        const inputValue = this.resolveFromRecord(context.inputs, workflowPath);
        if (inputValue !== undefined) {
            return inputValue;
        }

        return undefined;
    }

    private resolveFromRecord(
        record: Record<string, unknown> | undefined,
        workflowPath: string
    ): unknown {
        if (!record) {
            return undefined;
        }

        if (Object.prototype.hasOwnProperty.call(record, workflowPath)) {
            return record[workflowPath];
        }

        const candidates = new Set<string>();
        const colonTail = this.extractPathTail(workflowPath, ':');
        const dotTail = this.extractPathTail(workflowPath, '.');
        const slashTail = this.extractPathTail(workflowPath, '/');
        if (colonTail) candidates.add(colonTail);
        if (dotTail) candidates.add(dotTail);
        if (slashTail) candidates.add(slashTail);

        for (const candidate of candidates) {
            if (Object.prototype.hasOwnProperty.call(record, candidate)) {
                return record[candidate];
            }
        }

        return undefined;
    }

    private extractPathTail(path: string, delimiter: string): string | null {
        const index = path.lastIndexOf(delimiter);
        if (index < 0 || index >= path.length - 1) {
            return null;
        }
        return path.slice(index + 1);
    }

    private resolveChatMessages(component?: UIComponentConfig | null): ChatMessage[] {
        const historyValue = this.resolveBoundValue(component, ['history', 'chat_history']);
        const boundHistoryMessages = this.normalizeChatMessages(historyValue);
        if (boundHistoryMessages.length > 0) {
            return boundHistoryMessages;
        }

        const contextHistory = this.selectedSession()?.context?.chatHistory;
        const contextHistoryMessages = this.normalizeChatMessages(contextHistory);
        if (contextHistoryMessages.length > 0) {
            return contextHistoryMessages;
        }

        const assistantResponse = this.resolveBoundValue(component, ['assistant_response', 'llm_response', 'response']);
        return this.normalizeChatMessages(assistantResponse);
    }

    private normalizeChatMessages(value: unknown): ChatMessage[] {
        if (Array.isArray(value)) {
            return value
                .map((entry, index) => this.normalizeChatMessageEntry(entry, index))
                .filter((entry): entry is ChatMessage => !!entry);
        }

        if (this.isRecord(value)) {
            if (Array.isArray(value['messages'])) {
                return this.normalizeChatMessages(value['messages']);
            }
            const single = this.normalizeChatMessageEntry(value, 0);
            return single ? [single] : [];
        }

        if (typeof value === 'string' && value.trim().length > 0) {
            return [this.createChatMessage('assistant', value, 0)];
        }

        return [];
    }

    private normalizeChatMessageEntry(entry: unknown, index: number): ChatMessage | null {
        if (typeof entry === 'string') {
            const trimmed = entry.trim();
            return trimmed ? this.createChatMessage('assistant', trimmed, index) : null;
        }

        if (!this.isRecord(entry)) {
            return null;
        }

        const content = typeof entry['content'] === 'string'
            ? entry['content']
            : typeof entry['message'] === 'string'
                ? entry['message']
                : typeof entry['text'] === 'string'
                    ? entry['text']
                    : '';

        if (!content.trim()) {
            return null;
        }

        const role = typeof entry['role'] === 'string'
            ? entry['role']
            : this.isRecord(entry['sender']) && typeof entry['sender']['type'] === 'string'
                ? entry['sender']['type']
                : 'assistant';

        const senderType = this.toChatSenderType(role);
        const senderName = this.isRecord(entry['sender']) && typeof entry['sender']['name'] === 'string'
            ? entry['sender']['name']
            : senderType === 'user'
                ? 'User'
                : senderType === 'assistant'
                    ? 'Assistant'
                    : 'System';

        const senderId = this.isRecord(entry['sender']) && typeof entry['sender']['id'] === 'string'
            ? entry['sender']['id']
            : `sender-${senderType}`;

        const timestampRaw = entry['timestamp'];
        let timestamp: Date | undefined;
        if (timestampRaw instanceof Date) {
            timestamp = timestampRaw;
        } else if (typeof timestampRaw === 'string' || typeof timestampRaw === 'number') {
            const parsed = new Date(timestampRaw);
            if (!Number.isNaN(parsed.getTime())) {
                timestamp = parsed;
            }
        } else if (this.isRecord(timestampRaw) && typeof timestampRaw['ts'] === 'number') {
            timestamp = new Date(Number(timestampRaw['ts']));
        }

        return {
            id: typeof entry['id'] === 'string' ? entry['id'] : `msg-${index}-${Date.now()}`,
            content,
            sender: {
                id: senderId,
                name: senderName,
                type: senderType,
            },
            timestamp,
        };
    }

    private createChatMessage(
        senderType: ChatSender['type'],
        content: string,
        index: number
    ): ChatMessage {
        return {
            id: `msg-${index}-${Date.now()}`,
            content,
            sender: {
                id: `sender-${senderType}`,
                name: senderType === 'user' ? 'User' : senderType === 'assistant' ? 'Assistant' : 'System',
                type: senderType,
            },
        };
    }

    private toChatSenderType(roleRaw: string): ChatSender['type'] {
        const role = roleRaw.toLowerCase();
        if (role === 'user') return 'user';
        if (role === 'assistant' || role === 'ai' || role === 'bot') return 'assistant';
        return 'system';
    }

    private isComparisonResult(value: unknown): value is ComparisonResult {
        return this.isRecord(value)
            && Array.isArray(value['differences'])
            && typeof value['similarity'] === 'number';
    }

    private isSummaryResult(value: unknown): value is SummaryResult {
        return this.isRecord(value)
            && typeof value['summary'] === 'string'
            && Array.isArray(value['keyPoints']);
    }

    private isExtractionResult(value: unknown): value is ExtractionResult {
        return this.isRecord(value)
            && this.isRecord(value['entities'])
            && typeof value['totalEntitiesFound'] === 'number';
    }

    private isRecord(value: unknown): value is Record<string, unknown> {
        return !!value && typeof value === 'object';
    }

    selectRuntimeDebugBinding(bindingId: string): void {
        this.selectedRuntimeDebugBindingId.set(bindingId);
    }

    runtimeDebugScopeLabel(scope: DebugBindingScope): string {
        switch (scope) {
            case 'project':
                return this.translate.instant('templates.scope.project');
            case 'both':
                return this.translate.instant('templates.scope.both');
            case 'session':
                return this.translate.instant('templates.scope.session');
            default:
                return this.translate.instant('templates.sessions.admin_data.unscoped');
        }
    }

    runtimeDebugSourceLabel(scope: DebugBindingScope): string {
        switch (scope) {
            case 'project':
                return this.translate.instant('templates.sessions.admin_data.source_project');
            case 'both':
                return this.translate.instant('templates.sessions.admin_data.source_both');
            case 'session':
                return this.translate.instant('templates.sessions.admin_data.source_session');
            default:
                return this.translate.instant('templates.sessions.admin_data.source_unknown');
        }
    }

    runtimeDebugValuePreview(value: unknown): string {
        if (value === undefined || value === null) {
            return this.translate.instant('templates.sessions.admin_data.no_value');
        }
        if (typeof value === 'string') {
            const compact = value.replace(/\s+/g, ' ').trim();
            if (!compact) {
                return this.translate.instant('templates.sessions.admin_data.empty_string');
            }
            return compact.length > 56 ? `${compact.slice(0, 56)}...` : compact;
        }
        if (typeof value === 'number' || typeof value === 'boolean') {
            return String(value);
        }
        if (Array.isArray(value)) {
            return this.translate.instant('templates.sessions.admin_data.array_items', { count: value.length });
        }
        if (this.isRecord(value)) {
            return this.translate.instant('templates.sessions.admin_data.object_keys', {
                count: Object.keys(value).length,
            });
        }
        return String(value);
    }

    formatRuntimeDebugValue(value: unknown): string {
        if (value === undefined || value === null) {
            return this.translate.instant('templates.sessions.admin_data.no_value');
        }
        if (typeof value === 'string') {
            return value;
        }
        try {
            return JSON.stringify(value, null, 2);
        } catch {
            return String(value);
        }
    }

    private buildRuntimeDebugGroups(): RuntimeDebugBindingGroup[] {
        const components = this.uiTabComponents().length > 0
            ? this.uiTabComponents()
            : this.uiComponents();

        return components.map(component => {
            const bindings = (component.bindings ?? []).map((binding, index) => {
                const workflowPath = binding.workflowPath ?? '';
                const scopeMeta = this.resolveRuntimeDebugScope(workflowPath);
                const value = workflowPath ? this.resolveWorkflowPathValue(workflowPath) : undefined;
                return {
                    id: `${component.id}::${binding.componentProperty}::${workflowPath}::${index}`,
                    componentId: component.id,
                    componentLabel: this.tabLabel(component),
                    componentType: component.type,
                    componentProperty: binding.componentProperty,
                    workflowPath,
                    scope: scopeMeta.scope,
                    scopePortId: scopeMeta.portId,
                    value,
                    valuePresent: value !== undefined && value !== null,
                    valueKind: this.describeRuntimeDebugValueKind(value),
                } as RuntimeDebugBindingItem;
            });

            return {
                componentId: component.id,
                componentLabel: this.tabLabel(component),
                componentType: component.type,
                componentIcon: this.tabIcon(component),
                bindings,
            } as RuntimeDebugBindingGroup;
        });
    }

    private resolveRuntimeDebugScope(workflowPath: string): { scope: DebugBindingScope; portId?: string } {
        if (!workflowPath) {
            return { scope: 'unscoped' };
        }

        const scopes = this.config.assignment.portDataScopes ?? [];
        if (!scopes.length) {
            return { scope: 'unscoped' };
        }

        const candidates = [workflowPath];
        const colonTail = this.extractPathTail(workflowPath, ':');
        const dotTail = this.extractPathTail(workflowPath, '.');
        const slashTail = this.extractPathTail(workflowPath, '/');
        if (colonTail) candidates.push(colonTail);
        if (dotTail) candidates.push(dotTail);
        if (slashTail) candidates.push(slashTail);

        const candidateSet = new Set(candidates.filter(Boolean));
        const scopeEntry = scopes.find(scope => {
            const raw = scope as unknown as Record<string, unknown>;
            const portId = typeof raw['portId'] === 'string'
                ? raw['portId']
                : typeof raw['portPath'] === 'string'
                    ? raw['portPath']
                    : '';
            return !!portId && candidateSet.has(portId);
        });

        if (!scopeEntry) {
            return { scope: 'unscoped' };
        }

        const raw = scopeEntry as unknown as Record<string, unknown>;
        const portId = typeof raw['portId'] === 'string'
            ? raw['portId']
            : typeof raw['portPath'] === 'string'
                ? raw['portPath']
                : undefined;

        const scope = raw['scope'];
        if (scope === 'project' || scope === 'session' || scope === 'both') {
            return { scope, portId };
        }

        return { scope: 'unscoped', portId };
    }

    private describeRuntimeDebugValueKind(value: unknown): string {
        if (value === undefined) return 'undefined';
        if (value === null) return 'null';
        if (Array.isArray(value)) return `array[${value.length}]`;
        if (value instanceof Date) return 'date';
        switch (typeof value) {
            case 'string':
            case 'number':
            case 'boolean':
            case 'bigint':
            case 'symbol':
            case 'function':
                return typeof value;
            case 'object':
                if (this.isRecord(value)) {
                    return `object{${Object.keys(value).length}}`;
                }
                return 'object';
            default:
                return 'unknown';
        }
    }

    // ========================================================================
    // EVENT HANDLERS
    // ========================================================================

    onMessageSent(payload?: ChatInputData): void {
        const normalizedMessage = payload?.message?.trim();
        const normalizedFiles = payload?.files ?? [];
        const chatComponents = this.findComponentsByTypes(['chat']);

        const boundMessageInputs = normalizedMessage
            ? this.buildBindingsPayload(
                normalizedMessage,
                chatComponents,
                ['user_query', 'query', 'text', 'value']
            )
            : {};
        const boundFileInputs = normalizedFiles.length
            ? this.buildBindingsPayload(
                normalizedFiles,
                chatComponents,
                ['uploaded_files', 'files']
            )
            : {};

        const inputs: Record<string, unknown> = {
            ...(normalizedMessage ? { user_query: normalizedMessage } : {}),
            ...(normalizedFiles.length ? { uploaded_files: normalizedFiles } : {}),
            ...boundMessageInputs,
            ...boundFileInputs,
        };

        this.updateSelectedSessionContext({
            status: 'running',
            inputs: Object.keys(inputs).length ? inputs : undefined,
        });
    }

    onFilesSubmitted(files: File[], source?: string, component?: UIComponentConfig | null): void {
        const session = this.selectedSession();
        if (!session) {
            return;
        }

        const uploadedFiles: UploadedFileInfo[] = files.map(file => ({
            id: crypto.randomUUID(),
            name: file.name,
            size: file.size,
            type: file.type,
            uploadedAt: DateTime.now(),
            status: 'completed',
        }));

        const inputPayload: Record<string, unknown> = {
            files,
            ...(source ? { [`files:${source}`]: files } : {}),
        };

        const fileComponents = component
            ? [component]
            : this.findComponentsByTypes(['file-uploader', 'file-upload']);
        const boundInputs = this.buildBindingsPayload(
            files,
            fileComponents,
            source === 'left'
                ? ['left_file', 'files', 'source_file']
                : source === 'right'
                    ? ['right_file', 'files', 'source_file']
                    : ['files', 'uploaded_files', 'source_file', 'left_file', 'right_file']
        );

        this.updateSelectedSessionContext({
            status: 'running',
            inputs: { ...inputPayload, ...boundInputs },
            uploadedFiles,
        });

        this.executionStarted.emit({
            sessionId: session.id,
            data: { files, source },
        });
    }

    onChatError(error: Error): void {
        console.error('Chat error:', error);
        this.updateSelectedSessionContext({ status: 'error' });
    }

    onComparisonStarted(_component?: UIComponentConfig | null): void {
        void _component;
        this.updateSelectedSessionContext({
            status: 'running',
        });
    }

    onComparisonCompleted(result: ComparisonResult, component?: UIComponentConfig | null): void {
        const compareComponents = component
            ? [component]
            : this.findComponentsByTypes(['compare', 'comparison-panel']);
        const boundOutputs = this.buildBindingsPayload(
            result,
            compareComponents,
            ['comparison_result', 'result', 'data']
        );
        this.updateSelectedSessionContext({
            status: 'completed',
            outputs: {
                ...boundOutputs,
                comparisonResult: result,
                comparisonSimilarity: result.similarity,
                comparisonDifferences: result.differences,
            },
        });
    }

    onComparisonError(error: Error, component?: UIComponentConfig | null): void {
        console.error('Comparison error:', error);
        const compareComponents = component
            ? [component]
            : this.findComponentsByTypes(['compare', 'comparison-panel']);
        this.updateSelectedSessionContext({
            status: 'error',
            outputs: {
                ...this.buildBindingsPayload(
                    { error: error.message },
                    compareComponents,
                    ['comparison_result', 'result', 'data']
                ),
                comparisonError: error.message,
            },
        });
    }

    onExtractionStarted(_component?: UIComponentConfig | null): void {
        void _component;
        this.updateSelectedSessionContext({
            status: 'running',
        });
    }

    onExtractionCompleted(result: ExtractionResult, component?: UIComponentConfig | null): void {
        const extractComponents = component ? [component] : this.findComponentsByTypes(['extract']);
        const boundOutputs = this.buildBindingsPayload(
            result,
            extractComponents,
            ['extraction_result', 'result', 'data']
        );
        this.updateSelectedSessionContext({
            status: 'completed',
            outputs: {
                ...boundOutputs,
                extractionResult: result,
                extractedEntities: result.entities,
                extractedEntityCount: result.totalEntitiesFound,
            },
        });
    }

    onExtractionError(error: Error, component?: UIComponentConfig | null): void {
        console.error('Extraction error:', error);
        const extractComponents = component ? [component] : this.findComponentsByTypes(['extract']);
        this.updateSelectedSessionContext({
            status: 'error',
            outputs: {
                ...this.buildBindingsPayload(
                    { error: error.message },
                    extractComponents,
                    ['extraction_result', 'result', 'data']
                ),
                extractionError: error.message,
            },
        });
    }

    onSummarizeStarted(_component?: UIComponentConfig | null): void {
        void _component;
        this.updateSelectedSessionContext({
            status: 'running',
        });
    }

    onSummarizeCompleted(result: SummaryResult, component?: UIComponentConfig | null): void {
        const summarizeComponents = component ? [component] : this.findComponentsByTypes(['summarize']);
        const boundOutputs = this.buildBindingsPayload(
            result,
            summarizeComponents,
            ['summary_result', 'result', 'data']
        );
        this.updateSelectedSessionContext({
            status: 'completed',
            outputs: {
                ...boundOutputs,
                summarizeResult: result,
                summaryText: result.summary,
                summaryKeyPoints: result.keyPoints,
            },
        });
    }

    onSummarizeError(error: Error, component?: UIComponentConfig | null): void {
        console.error('Summarize error:', error);
        const summarizeComponents = component ? [component] : this.findComponentsByTypes(['summarize']);
        this.updateSelectedSessionContext({
            status: 'error',
            outputs: {
                ...this.buildBindingsPayload(
                    { error: error.message },
                    summarizeComponents,
                    ['summary_result', 'result', 'data']
                ),
                summarizeError: error.message,
            },
        });
    }

    private hasComponentType(type: string): boolean {
        return this.uiComponents().some(component => (component.type as string) === type);
    }

    private hasAnyComponentType(types: string[]): boolean {
        return this.uiComponents().some(component => types.includes(component.type as string));
    }

    private findFirstComponentByTypes(types: string[]): UIComponentConfig | null {
        return this.uiComponents().find(component => types.includes(component.type as string)) ?? null;
    }

    private findComponentsByTypes(types: string[]): UIComponentConfig[] {
        return this.uiComponents().filter(component => types.includes(component.type as string));
    }

    private componentHasAnyBinding(
        component: UIComponentConfig | null | undefined,
        componentProperties: string[]
    ): boolean {
        if (!component) return false;
        const normalizedProps = new Set(componentProperties.map(prop => prop.toLowerCase()));
        return (component.bindings ?? []).some(binding =>
            normalizedProps.has((binding.componentProperty ?? '').toLowerCase())
        );
    }

    private getComponentConfig(component?: UIComponentConfig | null): Record<string, unknown> {
        if (!component?.config) {
            return {};
        }
        return component.config;
    }

    private getStringArrayConfig(
        config: Record<string, unknown>,
        keys: string[]
    ): string[] | undefined {
        for (const key of keys) {
            const value = config[key];
            if (Array.isArray(value)) {
                const normalized = value
                    .filter(item => typeof item === 'string')
                    .map(item => item.trim())
                    .filter(Boolean);
                if (normalized.length > 0) {
                    return normalized;
                }
            }
            if (typeof value === 'string') {
                const normalized = value
                    .split(',')
                    .map(item => item.trim())
                    .filter(Boolean);
                if (normalized.length > 0) {
                    return normalized;
                }
            }
        }
        return undefined;
    }

    private getNumberConfig(config: Record<string, unknown>, keys: string[]): number | undefined {
        for (const key of keys) {
            const value = config[key];
            if (typeof value === 'number' && Number.isFinite(value)) {
                return value;
            }
            if (typeof value === 'string') {
                const parsed = Number(value);
                if (Number.isFinite(parsed)) {
                    return parsed;
                }
            }
        }
        return undefined;
    }

    private getStringConfig(config: Record<string, unknown>, keys: string[]): string | undefined {
        for (const key of keys) {
            const value = config[key];
            if (typeof value === 'string' && value.trim().length > 0) {
                return value.trim();
            }
        }
        return undefined;
    }

    private getBooleanConfig(config: Record<string, unknown>, keys: string[]): boolean | undefined {
        for (const key of keys) {
            const value = config[key];
            if (typeof value === 'boolean') {
                return value;
            }
            if (typeof value === 'string') {
                if (value.toLowerCase() === 'true') return true;
                if (value.toLowerCase() === 'false') return false;
            }
        }
        return undefined;
    }

    private buildBindingsPayload(
        payload: unknown,
        components: (UIComponentConfig | null | undefined)[],
        componentProperties?: string[]
    ): Record<string, unknown> {
        const outputs: Record<string, unknown> = {};

        for (const component of components) {
            if (!component) continue;

            let hasBinding = false;
            for (const binding of component.bindings ?? []) {
                if (!binding.workflowPath) continue;
                if (
                    componentProperties?.length &&
                    !componentProperties.includes(binding.componentProperty)
                ) {
                    continue;
                }
                outputs[binding.workflowPath] = payload;
                hasBinding = true;
            }

            if (!hasBinding && !componentProperties?.length) {
                outputs[`ui:${component.id}:result`] = payload;
            }
        }

        return outputs;
    }

    private updateSelectedSessionContext(params: {
        status?: TemplateExecutionSession['status'];
        inputs?: Record<string, unknown>;
        outputs?: Record<string, unknown>;
        uploadedFiles?: UploadedFileInfo[];
    }): void {
        const session = this.selectedSession();
        if (!session) {
            return;
        }

        const context = (session.context ?? {
            projectId: this.config.projectId,
            sessionId: session.id,
            assignmentId: this.config.assignment.id,
            userId: this.currentUser().id,
            inputs: {},
            outputs: {},
        }) as TemplateExecutionContext;

        const existingUploadedFiles = context.uploadedFiles ?? [];
        const incomingUploadedFiles = params.uploadedFiles ?? [];
        const dedupedUploadedFiles = [...existingUploadedFiles];

        for (const uploadedFile of incomingUploadedFiles) {
            const existingIdx = dedupedUploadedFiles.findIndex(
                existing => existing.name === uploadedFile.name && existing.size === uploadedFile.size
            );
            if (existingIdx >= 0) {
                dedupedUploadedFiles[existingIdx] = uploadedFile;
            } else {
                dedupedUploadedFiles.push(uploadedFile);
            }
        }

        const nextContext: TemplateExecutionContext = {
            ...context,
            projectId: this.config.projectId,
            sessionId: session.id,
            assignmentId: this.config.assignment.id,
            userId: context.userId ?? this.currentUser().id,
            inputs: {
                ...(context.inputs ?? {}),
                ...(params.inputs ?? {}),
            },
            outputs: {
                ...(context.outputs ?? {}),
                ...(params.outputs ?? {}),
            },
            uploadedFiles: dedupedUploadedFiles,
        };

        this.templateStore.updateSession({
            assignmentId: session.assignmentId,
            sessionId: session.id,
            changes: {
                status: params.status ?? session.status,
                context: nextContext,
            },
        });
    }

    // ========================================================================
    // FORMATTING HELPERS
    // ========================================================================

    formatDate(date: DateTime | string | undefined): string {
        if (!date) return '';
        const dt = typeof date === 'string' ? DateTime.fromISO(date) : date;
        return dt.toLocaleString(DateTime.DATETIME_SHORT);
    }

    getStatusIcon(status: TemplateExecutionSession['status']): string {
        switch (status) {
            case 'idle': return 'radio_button_unchecked';
            case 'running': return 'sync';
            case 'completed': return 'check_circle';
            case 'error': return 'error';
            default: return 'help';
        }
    }
}
