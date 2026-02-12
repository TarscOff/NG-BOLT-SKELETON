/**
 * Template Preview Component
 * 
 * Provides a live preview of the Template Workflow based on the canvas configuration.
 * Shows how the UI components will be rendered at runtime.
 */

import {
    Component,
    Input,
    OnDestroy,
    inject,
    signal,
    computed,
    ChangeDetectionStrategy,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { MatCardModule } from '@angular/material/card';
import { MatIconModule } from '@angular/material/icon';
import { MatButtonModule } from '@angular/material/button';
import { MatTabsModule } from '@angular/material/tabs';
import { MatTooltipModule } from '@angular/material/tooltip';
import { MatDividerModule } from '@angular/material/divider';
import { TranslateModule, TranslateService } from '@ngx-translate/core';
import { Subject } from 'rxjs';

// Import existing template components
import { ChatComponent } from '../../chat/chat.component';
import { CompareComponent } from '../../compare/compare.component';
import { ExtractComponent } from '../../extract/extract.component';
import { SummarizeComponent } from '../../summarize/summarize.component';

import { TemplateCanvasNode } from '../template-canvas-builder.component';
import { UIComponentType } from '../nodes/template-ui-node.component';

/** Preview configuration */
export interface TemplatePreviewConfig {
    nodes: TemplateCanvasNode[];
    name?: string;
    description?: string;
}

@Component({
    selector: 'app-template-preview',
    standalone: true,
    imports: [
        CommonModule,
        MatCardModule,
        MatIconModule,
        MatButtonModule,
        MatTabsModule,
        MatTooltipModule,
        MatDividerModule,
        TranslateModule,
        // Template components
        ChatComponent,
        CompareComponent,
        ExtractComponent,
        SummarizeComponent,
    ],
    templateUrl: './template-preview.component.html',
    styleUrls: ['./template-preview.component.scss'],
    changeDetection: ChangeDetectionStrategy.OnPush,
})
export class TemplatePreviewComponent implements OnDestroy {
    private readonly translate = inject(TranslateService);
    private readonly destroy$ = new Subject<void>();

    /** Input configuration */
    @Input() set config(value: TemplatePreviewConfig) {
        this._config.set(value);
    }

    /** Show in preview mode (no actual execution) */
    @Input() previewMode = true;

    // ========================================================================
    // STATE
    // ========================================================================

    private readonly _config = signal<TemplatePreviewConfig | null>(null);

    /** UI component nodes from canvas */
    readonly uiNodes = computed(() => {
        const config = this._config();
        if (!config) return [];
        return config.nodes.filter(n => n.type === 'ui-component');
    });

    /** Whether there are any UI components to preview */
    readonly hasUIComponents = computed(() => this.uiNodes().length > 0);

    /** Currently active tab index */
    readonly activeTabIndex = signal(0);

    /** Get layout mode based on UI components */
    readonly layoutMode = computed(() => {
        const nodes = this.uiNodes();
        if (nodes.length === 0) return 'empty';
        if (nodes.length === 1) return 'single';
        
        // Check for chat component
        const hasChat = nodes.some(n => n.data.uiType === 'chat');
        const hasResults = nodes.some(n => 
            n.data.uiType === 'summarize' || 
            n.data.uiType === 'extract' || 
            n.data.uiType === 'compare' ||
            n.data.uiType === 'result-viewer'
        );
        
        if (hasChat && hasResults) return 'split';
        return 'tabs';
    });

    /** Chat node if present */
    readonly chatNode = computed(() => 
        this.uiNodes().find(n => n.data.uiType === 'chat')
    );

    /** Result nodes (non-chat) */
    readonly resultNodes = computed(() =>
        this.uiNodes().filter(n => n.data.uiType !== 'chat' && n.data.uiType !== 'file-upload')
    );

    /** File upload node if present */
    readonly fileUploadNode = computed(() =>
        this.uiNodes().find(n => n.data.uiType === 'file-upload')
    );

    // ========================================================================
    // LIFECYCLE
    // ========================================================================

    ngOnDestroy(): void {
        this.destroy$.next();
        this.destroy$.complete();
    }

    // ========================================================================
    // METHODS
    // ========================================================================

    /** Get icon for UI component type */
    getComponentIcon(uiType?: UIComponentType): string {
        switch (uiType) {
            case 'chat': return 'chat';
            case 'file-upload': return 'upload_file';
            case 'summarize': return 'summarize';
            case 'extract': return 'find_in_page';
            case 'compare': return 'compare';
            case 'result-viewer': return 'visibility';
            default: return 'widgets';
        }
    }

    /** Get label for UI component type */
    getComponentLabel(uiType?: UIComponentType): string {
        switch (uiType) {
            case 'chat': return this.translate.instant('templates.ui.chat');
            case 'file-upload': return this.translate.instant('templates.ui.file_upload');
            case 'summarize': return this.translate.instant('templates.ui.summarize');
            case 'extract': return this.translate.instant('templates.ui.extract');
            case 'compare': return this.translate.instant('templates.ui.compare');
            case 'result-viewer': return this.translate.instant('templates.ui.result_viewer');
            default: return this.translate.instant('templates.ui.component');
        }
    }

    /** Set active tab */
    setActiveTab(index: number): void {
        this.activeTabIndex.set(index);
    }
}
