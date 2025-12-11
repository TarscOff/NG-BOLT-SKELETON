import { Component, OnInit, inject, signal, computed } from '@angular/core';
import { CommonModule } from '@angular/common';
import { MatTabsModule } from '@angular/material/tabs';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatTooltipModule } from '@angular/material/tooltip';
import { TranslateModule } from '@ngx-translate/core';
import { LayoutService, ToastService } from '@cadai/pxs-ng-core/services';

import { TemplateLoaderComponent } from '@features/workflows/templates/components/loader/template-loader.component';
import { TemplatingService } from '@features/workflows/templates/services/templating.service';
import { TemplateConfig, TemplatePageResponse } from '@features/workflows/templates/utils/template-config.interface';
import { SeoComponent } from '@cadai/pxs-ng-core/shared';

@Component({
  selector: 'app-chat',
  standalone: true,
  imports: [
    CommonModule,
    MatTabsModule,
    MatButtonModule,
    MatIconModule,
    MatProgressSpinnerModule,
    MatTooltipModule,
    TranslateModule,
    TemplateLoaderComponent,
    SeoComponent
  ],
  templateUrl: './chat.component.html',
  styleUrls: ['./chat.component.scss'],
})
export class ChatPageComponent implements OnInit {
  private templating = inject(TemplatingService);
  private toast = inject(ToastService);
  private layoutService = inject(LayoutService);

  // State
  pageConfig = signal<TemplatePageResponse | null>(null);
  loading = signal(true);
  error = signal<string | null>(null);
  selectedTabIndex = signal(0);

  // Computed
  enabledTemplates = computed(() => {
    const config = this.pageConfig();
    if (!config) return [];
    return config.templates;
  });

  //pageTitle = computed(() => this.pageConfig()?.pageTitle || 'AI Tools');
  //pageDescription = computed(() => this.pageConfig()?.pageDescription);

  ngOnInit(): void {
    this.loadPageConfig();
  }

  /**
   * Load page configuration from API
   */
  loadPageConfig(pageId = 'default'): void {
    this.loading.set(true);
    this.error.set(null);

    this.templating.fetchTemplateConfig(pageId, false).subscribe({
      next: (config) => {
        this.pageConfig.set(config);
        this.loading.set(false);
      },
      error: (err) => {
        console.error('Failed to load page config:', err);
        this.error.set('Failed to load page configuration');
        this.loading.set(false);
        this.toast.show(
          'Failed to load page configuration.',
          'Close',
          5000
        );
      },
    });
  }

  /**
   * Handle template error
   */
  onTemplateError(error: Error): void {
    console.error('Template error:', error);
    this.toast.show(`Error: ${error.message}`, 'Close', 5000);
  }

  /**
   * Track by function for templates
   */
  trackByTemplateId(index: number, template: TemplateConfig): string {
    return template.type;
  }

  public onTitleChange(title: string): void {
    this.layoutService.setTitle(title);
  }
}