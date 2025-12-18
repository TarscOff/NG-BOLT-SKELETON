import { Component, DestroyRef, OnInit, computed, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { MatTabsModule } from '@angular/material/tabs';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatTooltipModule } from '@angular/material/tooltip';
import { TranslateModule, TranslateService } from '@ngx-translate/core';
import { FieldConfigService, LayoutService, ToastService, ToolbarActionsService } from '@cadai/pxs-ng-core/services';

import { DynamicFormComponent, SeoComponent } from '@cadai/pxs-ng-core/shared';
import { ProjectsService } from '@features/projects/services/projects.service';
import { ProjectDto } from '@features/projects/interfaces/project.model';
import { MatPaginatorModule, PageEvent } from '@angular/material/paginator';
import { Router } from '@angular/router';
import { MatCardModule } from '@angular/material/card';
import { MatListModule } from '@angular/material/list';
import { FormBuilder, FormGroup } from '@angular/forms';
import { FieldConfig, ToolbarAction } from '@cadai/pxs-ng-core/interfaces';
import { of } from 'rxjs';

@Component({
    selector: 'app-projects',
    standalone: true,
    imports: [
        CommonModule,
        MatCardModule,
        MatTabsModule,
        MatButtonModule,
        MatListModule,
        MatPaginatorModule,
        MatIconModule,
        MatProgressSpinnerModule,
        MatTooltipModule,
        TranslateModule,
        SeoComponent,
        DynamicFormComponent
    ],
    templateUrl: './projects.component.html',
    styleUrls: ['./projects.component.scss'],
})
export class ProjectsComponent implements OnInit {
    private readonly projectsService = inject(ProjectsService);
    private readonly router = inject(Router);
    private readonly destroyRef = inject(DestroyRef);
    private readonly translateService = inject(TranslateService);
    private readonly toast = inject(ToastService);
    private readonly layoutService = inject(LayoutService);
    private readonly fb = inject(FormBuilder);
    private readonly fieldsConfigService = inject(FieldConfigService);
    private readonly toolbarService = inject(ToolbarActionsService);

    // Filter signals
    readonly searchTerm = signal<string>('');
    readonly orderBy = signal<'name' | 'id'>('name');

    // State signals
    readonly projects = signal<ProjectDto[]>([]);
    readonly loading = signal(false);
    readonly error = signal<string | null>(null);

    // Pagination state
    readonly pageIndex = signal(0);
    readonly pageSize = signal(15);
    readonly pageSizeOptions = [4, 8, 12, 16];

    // Derived values
    readonly length = computed(() => this.filteredProjects().length);
    readonly pageStart = computed(() => this.pageIndex() * this.pageSize());
    readonly pageEnd = computed(() => this.pageStart() + this.pageSize());

    readonly pagedProjects = computed(() => {
        const start = this.pageIndex() * this.pageSize();
        const end = start + this.pageSize();
        return this.filteredProjects().slice(start, end);
    });

    readonly filteredProjects = computed(() => {
        const search = this.searchTerm().toLowerCase();
        const order = this.orderBy();
        let filtered = this.projects();

        // Filter by search term
        if (search) {
            filtered = filtered.filter(project =>
                project.name.toLowerCase().includes(search) ||
                project.id.toString().includes(search)
            );
        }

        // Sort
        return [...filtered].sort((a, b) => {
            if (order === 'name') {
                return a.name.localeCompare(b.name);
            } else {
                return a.id.localeCompare(b.id);
            }
        });
    });

    readonly pageTitle = signal('nav.genai-projects');
    readonly pageDescription = signal('');

    filterForm: FormGroup = this.fb.group({});
    filterFieldConfig: FieldConfig[] = [];

    constructor() {
        // Toolbar Actions
        const newAction: ToolbarAction = {
            id: 'create-project',
            icon: 'add',
            disabled$: of(true),
            tooltip: this.translateService.instant('projects.create-new'),
            class: "primary",
            variant: "flat",
            label: this.translateService.instant('projects.create-new'),
            click: () => this.createProject(),
        };
        this.toolbarService.scope(this.destroyRef, [newAction]);
    }

    ngOnInit(): void {
        this.loadPageConfig();
        this.initializeFilterForm();
        this.setupFilterListeners();

        this.translateService.onLangChange.subscribe(() => {
            this.initializeFilterForm();
        });
    }

    loadPageConfig(): void {
        this.loading.set(true);
        this.error.set(null);

        this.projectsService.getProjectsList().subscribe({
            next: (projects) => {
                console.log('Projects loaded:', projects);
                this.projects.set(projects);
                this.loading.set(false);
            },
            error: (err) => {
                console.error('Error loading projects:', err);
                this.error.set(
                    this.translateService.instant('error.failed-to-load-projects')
                ); 
                this.toast.showError(
                    this.translateService.instant('error.failed-to-load-projects'),

                );
                this.loading.set(false);
            },
        });
    }

    private initializeFilterForm(): void {
        this.filterFieldConfig = [
            this.fieldsConfigService.getTextField({
                name: 'search',
                label: this.translateService.instant('projects.search.label'),
                placeholder: this.translateService.instant('projects.search.placeholder'),
                helperText: this.translateService.instant('projects.search.placeholder'),
                color: 'primary',
                layoutClass: 'primary',
                required: false,
                validators: undefined
            }),

            this.fieldsConfigService.getDropdownField({
                name: 'orderBy',
                label: this.translateService.instant('projects.orderBy.label'),
                placeholder: this.translateService.instant('projects.orderBy.placeholder'),
                options: [
                    { label: this.translateService.instant('projects.orderBy.name'), value: 'name' },
                    { label: this.translateService.instant('projects.orderBy.id'), value: 'id' },
                ],
                helperText: this.translateService.instant('projects.orderBy.placeholder'),
                required: false,
                validators: undefined,
                multiple: false,
                defaultValue: 'name',
                color: 'primary',
                layoutClass: 'primary',
            }),
        ];
    }

    private setupFilterListeners(): void {
        this.filterForm.valueChanges.subscribe((values) => {
            // Update signals based on form changes
            this.searchTerm.set(values.search || '');
            this.orderBy.set(values.orderBy || 'name');

            // Reset to first page when filter changes
            this.pageIndex.set(0);
        });
    }

    clearFilters(): void {
        this.filterForm.reset({ orderBy: 'name', search: '' });
        this.searchTerm.set('');
        this.orderBy.set('name');
        this.pageIndex.set(0);
    }

    trackById = (_: number, project: ProjectDto) => project.id;

    // Helpers
    totalUsers(project: ProjectDto): number {
        return (project.ownerCount || 0) + (project.memberCount || 0);
    }

    // Events
    onPage(event: PageEvent): void {
        this.pageIndex.set(event.pageIndex);
        this.pageSize.set(event.pageSize);
    }

    openProject(project: ProjectDto): void {
        this.router.navigate(['/genai-projects', project.id]);
    }

    createProject(): void {
        this.router.navigate(['/genai-projects', 'new']);
    }

    public onTitleChange(title: string): void {
        this.layoutService.setTitle(title);
    }
}