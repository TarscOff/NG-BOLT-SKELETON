import {
  Component,
  Input,
  Output,
  EventEmitter,
  ViewChild,
  ViewContainerRef,
  OnInit,
  AfterViewInit,
  OnDestroy,
  ComponentRef,
  inject,
  ChangeDetectionStrategy,
  ChangeDetectorRef,
  signal,
  Type,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { MatCardModule } from '@angular/material/card';
import { MatIconModule } from '@angular/material/icon';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { TranslateModule } from '@ngx-translate/core';

import {
  TemplateConfig,
  TemplateContext,
  ChatTemplateConfig,
  CompareTemplateConfig,
  SummarizeTemplateConfig,
  ExtractTemplateConfig,
  TemplateComponentInstance,
  TemplateResult
} from '../../utils/template-config.interface';
import { TemplatingService } from '../../services/templating.service';

import { ChatComponent } from '../chat/chat.component';
import { CompareComponent } from '../compare/compare.component';
import { SummarizeComponent } from '../summarize/summarize.component';
import { ExtractComponent } from '../extract/extract.component';

import { CompareConfig, CompareFile } from '@features/workflows/templates/utils/tplsInterfaces/compareTpl.interface';
import { ChatConfig } from '@features/workflows/templates/utils/tplsInterfaces/chatTpl.interface';
import { SummarizeConfig } from '@features/workflows/templates/utils/tplsInterfaces/summarizeTpl.interface';
import { ExtractConfig, ExtractFile } from '@features/workflows/templates/utils/tplsInterfaces/extractTpl.interface';

@Component({
  selector: 'app-template-loader',
  standalone: true,
  imports: [
    CommonModule,
    MatCardModule,
    MatIconModule,
    MatProgressSpinnerModule,
    TranslateModule,
  ],
  template: `
    <mat-card class="template-loader-card">
      <mat-card-content>
        @if (initialLoading()) {
          <div class="loading-container">
            <mat-spinner diameter="48"></mat-spinner>
            <p>{{ 'chatPage.templateLoader.loading' | translate }}</p>
          </div>
        } @else if (error()) {
          <div class="error-container">
            <mat-icon color="warn">error</mat-icon>
            <p>{{ 'chatPage.templateLoader.error' | translate }}</p>
            <small>{{ error() }}</small>
          </div>
        } @else {
          <div class="template-container" #templateHost></div>
        }
      </mat-card-content>
    </mat-card>
  `,
  styles: [`
  :host {height:100%}
    .template-loader-card {
      height: 100%;
      display: flex;
      flex-direction: column;
      box-shadow: none;
      background-color: var(--mat-sys-surface);

      mat-card-content {
        flex: 1;
        display: flex;
        flex-direction: column;
        padding: 0;
        overflow: hidden;
      }
    }

    .template-header {
      display: flex;
      align-items: center;
      gap: 12px;
      width: 100%;

      .template-info {
        flex: 1;
      }
    }

    .template-container {
      flex: 1;
      display: flex;
      flex-direction: column;
      overflow: hidden;

      ::ng-deep > * {
        flex: 1;
        display: flex;
        flex-direction: column;
        min-height: 0;
      }
    }

    .loading-container,
    .error-container {
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      padding: 48px;
      text-align: center;
      color: var(--mat-accent);
      
      mat-icon {
        font-size: 48px;
        width: 48px;
        height: 48px;
        margin-bottom: 16px;
      }

      p {
        margin: 8px 0;
        font-size: 16px;
      }

      small {
        color: var(--mat-sys-on-surface-variant);
        font-size: 12px;
      }
    }
  `],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class TemplateLoaderComponent implements OnInit, AfterViewInit, OnDestroy {
  private readonly registry = inject(TemplatingService);
  private readonly cdr = inject(ChangeDetectorRef);

  @Input({ required: true }) config!: TemplateConfig;
  @Input({ required: true }) sessionId!: string;
  @Input({ required: true }) projectId!: string;
  @Input({ required: true }) templateId!: string;

  @Input() context?: TemplateContext;

  @Output() templateLoaded = new EventEmitter<ComponentRef<TemplateComponentInstance>>();
  @Output() templateError = new EventEmitter<Error>();
  @Output() resultCompleted = new EventEmitter<TemplateResult>();

  @ViewChild('templateHost', { read: ViewContainerRef })
  templateHost?: ViewContainerRef;

  private componentRef?: ComponentRef<TemplateComponentInstance>;

  readonly initialLoading = signal(true);
  readonly error = signal<string | null>(null);

  ngOnInit(): void {
    if (!this.config) {
      this.error.set('No template configuration provided');
      this.initialLoading.set(false);
      return;
    }

    this.initialLoading.set(false);
  }

  ngAfterViewInit(): void {
    if (!this.config || this.error()) {
      return;
    }

    Promise.resolve().then(() => {
      try {
        this.loadTemplate();
        this.cdr.markForCheck();
      } catch (err) {
        const error = err as Error;
        console.error('Failed to load template:', error);
        this.error.set(error.message);
        this.templateError.emit(error);
      }
    });
  }

  ngOnDestroy(): void {
    this.destroyComponent();
  }

  /**
   * Load and configure the template component
   */
  private loadTemplate(): void {
    if (!this.templateHost) {
      throw new Error('Template host ViewContainerRef not available');
    }

    if (!this.config) {
      throw new Error('No template configuration provided');
    }

    this.error.set(null);

    const componentType = this.registry.getComponent(this.config?.type);
    if (!componentType) {
      throw new Error(`No component registered for type: ${this.config?.type}`);
    }

    this.destroyComponent();
    this.templateHost.clear();

    this.componentRef = this.templateHost.createComponent(
      componentType as Type<TemplateComponentInstance>
    );

    this.configureComponent(this.componentRef);
    this.templateLoaded.emit(this.componentRef);
  }

  /**
   * Configure component inputs and wire up outputs
   */
  private configureComponent(componentRef: ComponentRef<TemplateComponentInstance>): void {
    const instance = componentRef.instance;

    switch (this.config?.type) {
      case 'chat':
        this.configureChatComponent(instance as ChatComponent, this.config as ChatTemplateConfig);
        break;
      case 'compare':
        this.configureCompareComponent(instance as CompareComponent, this.config as CompareTemplateConfig);
        break;
      case 'summarize':
        this.configureSummarizeComponent(instance as SummarizeComponent, this.config as SummarizeTemplateConfig);
        break;
      case 'extract':
        this.configureExtractComponent(instance as ExtractComponent, this.config as ExtractTemplateConfig);
        break;
      default:
        console.warn(`No configuration handler for template type: ${this.config}`);
    }
  }

  /**
   * Configure Chat component - pass all inputs and wire outputs
   */
  private configureChatComponent(instance: ChatComponent, config: ChatTemplateConfig): void {
    // Set mode input
    if (config.initialMessages && config.initialMessages.length > 0) {
      instance.mode = {
        mode: 'preloaded',
        messages: config.initialMessages,
      };
    } else {
      instance.mode = {
        mode: 'interactive'
      };
    }

    // Set configuration inputs
    if (config.config) {
      instance.config = config.config as ChatConfig || {};
    }

    if (config.currentUser) {
      instance.currentUser = config.currentUser;
    }

    instance.projectId = this.projectId;
    instance.sessionId = this.sessionId;
    instance.templateId = this.templateId;

    // Wire outputs to forward events
    instance.messageSent.subscribe((content: string) => {
      this.context?.events?.onMessageSent?.(content);
    });

    instance.messageDeleted.subscribe((id: string) => {
      this.context?.events?.onMessageDeleted?.(id);
    });

    instance.messageEdited.subscribe((event: { id: string; content: string }) => {
      this.context?.events?.onMessageEdited?.(event);
    });

    instance.chatCleared.subscribe(() => {
      this.context?.events?.onCleared?.();
    });

    instance.errorEmitter.subscribe((error: Error) => {
      this.context?.events?.onError?.(error);
      this.templateError.emit(error);
    });
  }

  /**
   * Configure Compare component - pass all inputs and wire outputs
   */
  private configureCompareComponent(instance: CompareComponent, config: CompareTemplateConfig): void {
    // Set mode
    if (config.mode === 'preloaded' && config.result) {
      instance.mode = {
        mode: 'preloaded',
        result: config.result
      };
    } else {
      instance.mode = { mode: 'upload' };
    }

    // Set configuration
    if (config.config) {
      instance.config = config.config as CompareConfig || {};
    }

    // Wire outputs
    instance.comparisonCompleted.subscribe((result) => {
      const templateResult: TemplateResult = {
        type: 'compare',
        result,
      };
      this.resultCompleted.emit(templateResult);
      this.context?.events?.onSuccess?.(result);
    });

    instance.comparisonError.subscribe((error) => {
      this.context?.events?.onError?.(error);
      this.templateError.emit(error);
    });

    instance.fileUploaded.subscribe((event: { slot: 1 | 2; file: CompareFile }) => {
      this.context?.events?.onFileUploaded?.(event.file);
    });

    instance.comparisonStarted.subscribe(() => {
      this.context?.events?.onStarted?.();
    });
  }

  /**
   * Configure Summarize component - pass all inputs and wire outputs
   */
  private configureSummarizeComponent(instance: SummarizeComponent, config: SummarizeTemplateConfig): void {
    // Set mode
    if (config.mode === 'preloaded' && config.result) {
      instance.mode = {
        mode: 'preloaded',
        result: config.result
      };
    } else {
      instance.mode = { mode: 'upload' };
    }

    // Set configuration
    if (config.config) {
      instance.config = config.config as SummarizeConfig || {};
    }

    // Wire outputs
    instance.summarizeCompleted.subscribe((result) => {
      const templateResult: TemplateResult = {
        type: 'summarize',
        result,
      };
      this.resultCompleted.emit(templateResult);
      this.context?.events?.onSuccess?.(result);
    });

    instance.summarizeError.subscribe((error) => {
      this.context?.events?.onError?.(error);
      this.templateError.emit(error);
    });

    instance.fileUploaded.subscribe((file) => {
      this.context?.events?.onFileUploaded?.(file);
    });

    instance.summarizeStarted.subscribe(() => {
      this.context?.events?.onStarted?.();
    });
  }

  /**
   * Configure Extract component - pass all inputs and wire outputs
   */
  private configureExtractComponent(instance: ExtractComponent, config: ExtractTemplateConfig): void {
    // Set mode
    if (config.mode === 'preloaded' && config.result) {
      instance.mode = {
        mode: 'preloaded',
        result: config.result
      };
    } else {
      instance.mode = { mode: 'upload' };
    }

    // Set configuration
    if (config.config) {
      instance.config = config.config as ExtractConfig || {};
    }

    // Wire outputs
    instance.extractionCompleted.subscribe((result) => {
      const templateResult: TemplateResult = {
        type: 'extract',
        result,
      };
      this.resultCompleted.emit(templateResult);
      this.context?.events?.onSuccess?.(result);
    });

    instance.extractionError.subscribe((error) => {
      this.context?.events?.onError?.(error);
      this.templateError.emit(error);
    });

    instance.fileUploaded.subscribe((file: ExtractFile) => {
      this.context?.events?.onFileUploaded?.(file);
    });

    instance.extractionStarted.subscribe(() => {
      this.context?.events?.onStarted?.();
    });
  }

  /**
   * Safely destroy component reference
   */
  private destroyComponent(): void {
    if (this.componentRef) {
      try {
        this.componentRef.destroy();
      } catch (err) {
        console.warn('Error destroying component:', err);
      } finally {
        this.componentRef = undefined;
      }
    }
  }
}