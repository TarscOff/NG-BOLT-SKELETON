/**
 * Composites List Page
 * 
 * Displays all Tier 2 Composite Workflows with options to:
 * - View composite details
 * - Publish/unpublish composites
 * - Delete composites
 * 
 * NOTE: Published workflows are automatically composites - no sync needed!
 * When a workflow is published in the editor, it becomes available as a composite.
 */

import {
    Component,
    OnInit,
    OnDestroy,
    inject,
    signal,
    computed,
    ChangeDetectionStrategy,
    DestroyRef,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { Router } from '@angular/router';
import { FormsModule } from '@angular/forms';
import { Subject, interval, takeUntil, startWith } from 'rxjs';

// Angular Material
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatCardModule } from '@angular/material/card';
import { MatChipsModule } from '@angular/material/chips';
import { MatTooltipModule } from '@angular/material/tooltip';
import { MatMenuModule } from '@angular/material/menu';
import { MatInputModule } from '@angular/material/input';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatDialog, MatDialogModule } from '@angular/material/dialog';
import { MatSnackBar, MatSnackBarModule } from '@angular/material/snack-bar';
import { MatTabsModule } from '@angular/material/tabs';
import { MatBadgeModule } from '@angular/material/badge';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';

import { TranslateModule, TranslateService } from '@ngx-translate/core';
import { SeoComponent } from '@cadai/pxs-ng-core/shared';
import { ToolbarAction } from '@cadai/pxs-ng-core/interfaces';
import { ToolbarActionsService, LayoutService } from '@cadai/pxs-ng-core/services';

// Store and Services
import { TemplateWorkflowsStore } from '../../data/template-workflows.store';
import { WorkflowSyncService } from '../../services/workflow-sync.service';
import {
    CompositeWorkflow,
    WorkflowStatus,
} from '../../interfaces/template-workflow.interface';

@Component({
    selector: 'app-composites-list',
    standalone: true,
    imports: [
        CommonModule,
        FormsModule,
        TranslateModule,
        SeoComponent,
        // Material
        MatButtonModule,
        MatIconModule,
        MatCardModule,
        MatChipsModule,
        MatTooltipModule,
        MatMenuModule,
        MatInputModule,
        MatFormFieldModule,
        MatDialogModule,
        MatSnackBarModule,
        MatTabsModule,
        MatBadgeModule,
        MatProgressSpinnerModule,
    ],
    templateUrl: './composites-list.component.html',
    styleUrls: ['./composites-list.component.scss'],
    changeDetection: ChangeDetectionStrategy.OnPush,
})
export class CompositesListComponent implements OnInit, OnDestroy {
    private readonly store = inject(TemplateWorkflowsStore);
    private readonly syncService = inject(WorkflowSyncService);
    private readonly router = inject(Router);
    private readonly dialog = inject(MatDialog);
    private readonly snackBar = inject(MatSnackBar);
    private readonly translate = inject(TranslateService);
    private readonly toolbarService = inject(ToolbarActionsService);
    private readonly layoutService = inject(LayoutService);
    private readonly destroyRef = inject(DestroyRef);
    private readonly destroy$ = new Subject<void>();

    // ========================================================================
    // SIGNALS
    // ========================================================================

    readonly searchQuery = signal('');
    readonly selectedTab = signal<'all' | 'published' | 'draft'>('all');
    
    /** All composites (from published workflows) */
    private readonly allComposites = signal<CompositeWorkflow[]>([]);

    // ========================================================================
    // COMPUTED
    // ========================================================================

    readonly composites = computed(() => {
        const all = this.allComposites();
        const query = this.searchQuery().toLowerCase().trim();
        const tab = this.selectedTab();

        let filtered = all;

        // Filter by status
        if (tab === 'published') {
            filtered = filtered.filter(c => c.status === WorkflowStatus.PUBLISHED);
        } else if (tab === 'draft') {
            filtered = filtered.filter(c => c.status === WorkflowStatus.DRAFT);
        }

        // Filter by search
        if (query) {
            filtered = filtered.filter(c =>
                c.name.toLowerCase().includes(query) ||
                c.description.toLowerCase().includes(query)
            );
        }

        return filtered;
    });

    readonly compositeCounts = computed(() => {
        const all = this.allComposites();
        return {
            all: all.length,
            published: all.filter(c => c.status === WorkflowStatus.PUBLISHED).length,
            draft: all.filter(c => c.status === WorkflowStatus.DRAFT).length,
        };
    });

    // ========================================================================
    // LIFECYCLE
    // ========================================================================

    ngOnInit(): void {
        // Setup toolbar and breadcrumbs
        this.setupToolbar();
        this.layoutService.setBreadcrumbs([
            { label: this.translate.instant('nav.genai-workflows'), route: '/genai-workflows' },
            { label: this.translate.instant('composites.list.title') },
        ]);

        // Load composites from published workflows (auto-refresh every 2 seconds)
        interval(2000).pipe(
            startWith(0),
            takeUntil(this.destroy$)
        ).subscribe(() => {
            this.refreshComposites();
        });
    }

    private setupToolbar(): void {
        const back: ToolbarAction = {
            id: 'back',
            icon: 'arrow_back',
            tooltip: this.translate.instant('common.back'),
            class: 'error',
            variant: 'icon',
            label: this.translate.instant('common.back'),
            click: () => this.goBack(),
        };

        const viewTemplates: ToolbarAction = {
            id: 'view-templates',
            icon: 'dashboard_customize',
            tooltip: this.translate.instant('composites.list.view_templates'),
            class: 'primary',
            variant: 'stroked',
            label: this.translate.instant('composites.list.view_templates'),
            click: () => this.goToTemplates(),
        };

        const openEditor: ToolbarAction = {
            id: 'open-editor',
            icon: 'edit',
            tooltip: this.translate.instant('composites.list.open_editor'),
            class: 'primary',
            variant: 'flat',
            label: this.translate.instant('composites.list.open_editor'),
            click: () => this.goToWorkflowEditor(),
        };

        this.toolbarService.scope(this.destroyRef, [back, viewTemplates, openEditor]);
    }

    ngOnDestroy(): void {
        this.destroy$.next();
        this.destroy$.complete();
    }

    // ========================================================================
    // ACTIONS
    // ========================================================================

    private refreshComposites(): void {
        // Get composites directly from published workflows
        const composites = this.syncService.getPublishedWorkflowsAsComposites();
        this.allComposites.set(composites);
    }

    goBack(): void {
        this.router.navigate(['/genai-workflows']);
    }

    goToTemplates(): void {
        this.router.navigate(['/genai-workflows/templates']);
    }

    goToWorkflowEditor(): void {
        this.router.navigate(['/genai-workflows']);
    }

    viewInEditor(composite: CompositeWorkflow): void {
        // Navigate to workflow editor with the source workflow ID
        const sourceId = (composite as CompositeWorkflow & { sourceWorkflowId?: string }).sourceWorkflowId;
        if (sourceId) {
            // Navigate to workflow editor and select the workflow
            this.router.navigate(['/genai-workflows'], { 
                queryParams: { workflowId: sourceId } 
            });
        } else {
            this.snackBar.open(
                this.translate.instant('composites.list.no_source_workflow'),
                'OK',
                { duration: 3000 }
            );
        }
    }

    // ========================================================================
    // HELPERS
    // ========================================================================

    getStatusColor(status: WorkflowStatus): string {
        switch (status) {
            case WorkflowStatus.PUBLISHED: return 'primary';
            case WorkflowStatus.DRAFT: return 'accent';
            case WorkflowStatus.UNPUBLISHED: return 'warn';
            default: return '';
        }
    }

    trackById(_: number, composite: CompositeWorkflow): string {
        return composite.id;
    }

    onTitleChange(title: string): void {
        this.layoutService.setTitle(title);
    }
}
