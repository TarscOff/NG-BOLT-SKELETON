/**
 * Templates List Page
 * 
 * Displays all Tier 3 Template Workflows with options to:
 * - View template details
 * - Edit templates (navigate to builder)
 * - Publish/unpublish templates
 * - Delete templates
 * - Create new templates
 */

import {
    Component,
    OnInit,
    inject,
    signal,
    computed,
    ChangeDetectionStrategy,
    DestroyRef,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { Router } from '@angular/router';
import { FormsModule } from '@angular/forms';
import { toSignal } from '@angular/core/rxjs-interop';

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

import { TranslateModule, TranslateService } from '@ngx-translate/core';
import { SeoComponent, ConfirmDialogComponent } from '@cadai/pxs-ng-core/shared';
import { ConfirmDialogData, ToolbarAction } from '@cadai/pxs-ng-core/interfaces';
import { ToolbarActionsService, LayoutService } from '@cadai/pxs-ng-core/services';

// Store
import { TemplateWorkflowsStore } from '../../data/template-workflows.store';
import {
    TemplateWorkflow,
    WorkflowStatus,
    TemplatePresentationPattern,
} from '../../interfaces/template-workflow.interface';

@Component({
    selector: 'app-templates-list',
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
    ],
    templateUrl: './templates-list.component.html',
    styleUrls: ['./templates-list.component.scss'],
    changeDetection: ChangeDetectionStrategy.OnPush,
})
export class TemplatesListComponent implements OnInit {
    private readonly store = inject(TemplateWorkflowsStore);
    private readonly router = inject(Router);
    private readonly dialog = inject(MatDialog);
    private readonly snackBar = inject(MatSnackBar);
    private readonly translate = inject(TranslateService);
    private readonly toolbarService = inject(ToolbarActionsService);
    private readonly layoutService = inject(LayoutService);
    private readonly destroyRef = inject(DestroyRef);

    // ========================================================================
    // SIGNALS
    // ========================================================================

    readonly searchQuery = signal('');
    readonly selectedTab = signal<'all' | 'published' | 'draft'>('all');
    
    // Subscribe to templates$ observable to get reactive updates
    private readonly allTemplates = toSignal(this.store.templates$, { initialValue: [] as TemplateWorkflow[] });

    // ========================================================================
    // COMPUTED
    // ========================================================================

    readonly templates = computed(() => {
        const all = this.allTemplates();
        const query = this.searchQuery().toLowerCase().trim();
        const tab = this.selectedTab();

        let filtered = all;

        // Filter by status
        if (tab === 'published') {
            filtered = filtered.filter(t => t.status === WorkflowStatus.PUBLISHED);
        } else if (tab === 'draft') {
            filtered = filtered.filter(t => t.status === WorkflowStatus.DRAFT);
        }

        // Filter by search
        if (query) {
            filtered = filtered.filter(t =>
                t.name.toLowerCase().includes(query) ||
                t.description.toLowerCase().includes(query)
            );
        }

        return filtered;
    });

    readonly templateCounts = computed(() => {
        const all = this.allTemplates();
        return {
            all: all.length,
            published: all.filter(t => t.status === WorkflowStatus.PUBLISHED).length,
            draft: all.filter(t => t.status === WorkflowStatus.DRAFT).length,
        };
    });

    // ========================================================================
    // LIFECYCLE
    // ========================================================================

    ngOnInit(): void {
        // Templates are loaded from storage in the store constructor
        this.setupToolbar();
        this.layoutService.setBreadcrumbs([
            { label: this.translate.instant('nav.genai-workflows'), route: '/genai-workflows' },
            { label: this.translate.instant('templates.list.title') },
        ]);
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

        const manageComposites: ToolbarAction = {
            id: 'manage-composites',
            icon: 'account_tree',
            tooltip: this.translate.instant('templates.list.manage_composites'),
            class: 'primary',
            variant: 'stroked',
            label: this.translate.instant('templates.list.manage_composites'),
            click: () => this.goToComposites(),
        };

        const createNew: ToolbarAction = {
            id: 'create-new',
            icon: 'add',
            tooltip: this.translate.instant('templates.list.create_new'),
            class: 'primary',
            variant: 'flat',
            label: this.translate.instant('templates.list.create_new'),
            click: () => this.createNew(),
        };

        this.toolbarService.scope(this.destroyRef, [back, manageComposites, createNew]);
    }

    // ========================================================================
    // ACTIONS
    // ========================================================================

    createNew(): void {
        this.router.navigate(['/genai-workflows/templates/builder']);
    }

    editTemplate(template: TemplateWorkflow): void {
        this.router.navigate(['/genai-workflows/templates/builder', template.id]);
    }

    viewTemplate(template: TemplateWorkflow): void {
        // For now, navigate to edit mode
        this.editTemplate(template);
    }

    async deleteTemplate(template: TemplateWorkflow): Promise<void> {
        const confirmed = await this.dialog.open<ConfirmDialogComponent, ConfirmDialogData, boolean>(
            ConfirmDialogComponent,
            {
                data: {
                    title: this.translate.instant('templates.list.delete_confirm_title'),
                    message: this.translate.instant('templates.list.delete_confirm_message', { name: template.name }),
                    context: { template },
                },
            }
        ).afterClosed().toPromise();

        if (confirmed) {
            this.store.removeTemplate(template.id);
            this.snackBar.open(
                this.translate.instant('templates.list.deleted_success'),
                'OK',
                { duration: 3000 }
            );
        }
    }

    togglePublish(template: TemplateWorkflow): void {
        const newStatus = template.status === WorkflowStatus.PUBLISHED
            ? WorkflowStatus.DRAFT
            : WorkflowStatus.PUBLISHED;

        this.store.updateTemplate({
            id: template.id,
            changes: { status: newStatus },
        });

        const messageKey = newStatus === WorkflowStatus.PUBLISHED
            ? 'templates.list.published_success'
            : 'templates.list.unpublished_success';

        this.snackBar.open(
            this.translate.instant(messageKey),
            'OK',
            { duration: 3000 }
        );
    }

    duplicateTemplate(template: TemplateWorkflow): void {
        const newTemplate: TemplateWorkflow = {
            ...template,
            id: crypto.randomUUID(),
            name: `${template.name} (Copy)`,
            status: WorkflowStatus.DRAFT,
            metadata: {
                ...template.metadata,
                createdAt: new Date().toISOString(),
                updatedAt: new Date().toISOString(),
                version: 1,
            },
        };

        this.store.addTemplate(newTemplate);
        this.snackBar.open(
            this.translate.instant('templates.list.duplicated_success'),
            'OK',
            { duration: 3000 }
        );
    }

    goBack(): void {
        this.router.navigate(['/genai-workflows']);
    }

    goToComposites(): void {
        this.router.navigate(['/genai-workflows/composites']);
    }

    // ========================================================================
    // HELPERS
    // ========================================================================

    getPatternIcon(pattern: TemplatePresentationPattern): string {
        switch (pattern) {
            case 'standalone-single': return 'web';
            case 'standalone-tabs': return 'tab';
            case 'linked-integrated': return 'hub';
            default: return 'dashboard';
        }
    }

    getStatusColor(status: WorkflowStatus): string {
        switch (status) {
            case WorkflowStatus.PUBLISHED: return 'primary';
            case WorkflowStatus.DRAFT: return 'accent';
            case WorkflowStatus.UNPUBLISHED: return 'warn';
            default: return '';
        }
    }

    trackById(_: number, template: TemplateWorkflow): string {
        return template.id;
    }
    
    onTitleChange(title: string): void {
        this.layoutService.setTitle(title);
    }
}
