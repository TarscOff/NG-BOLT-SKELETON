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
  ViewChild,
  ElementRef,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import {
  FormBuilder,
  FormGroup,
  ReactiveFormsModule,
  Validators,
} from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatProgressBarModule } from '@angular/material/progress-bar';
import { MatTooltipModule } from '@angular/material/tooltip';
import { MatCardModule } from '@angular/material/card';
import { MatChipsModule } from '@angular/material/chips';
import { TranslateModule } from '@ngx-translate/core';
import { Store } from '@ngrx/store';
import { Observable, Subject } from 'rxjs';
import { takeUntil } from 'rxjs/operators';
import { AppSelectors } from '@cadai/pxs-ng-core/store';
import { DynamicFormComponent } from '@cadai/pxs-ng-core/shared';
import { FieldConfig } from '@cadai/pxs-ng-core/interfaces';
import { FieldConfigService } from '@cadai/pxs-ng-core/services';
import {
  ExtractMode,
  ExtractConfig,
  ExtractEndpoints,
  ExtractionResult,
  ExtractFile,
} from '../../utils/tplsInterfaces/extractTpl.interface';
import { ExtractService } from '../../services/extract.service';
import { ExportOverlayComponent } from '../export-overlay/export-overlay.component';
import { DocumentExportService } from '../../services/document-export.service';
import { ExtractionExportAdapter } from '../../utils/extract-export.adapter';
import { iconFor } from '../../utils/fileIcon';
import { ExportFormat } from '../../utils/document-export.interface';
import { ExtractResultComponent } from './extract-result/extract-result.component';
import { Clipboard } from '@angular/cdk/clipboard';

@Component({
  selector: 'app-extract-tpl',
  standalone: true,
  imports: [
    CommonModule,
    ReactiveFormsModule,
    TranslateModule,
    MatButtonModule,
    MatIconModule,
    MatProgressBarModule,
    MatTooltipModule,
    MatCardModule,
    MatChipsModule,
    DynamicFormComponent,
    ExtractResultComponent,
    ExportOverlayComponent,
  ],
  templateUrl: './extract.component.html',
  styleUrls: ['./extract.component.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ExtractComponent implements OnInit, OnDestroy {
  private store = inject(Store);
  private extractService = inject(ExtractService);
  private fb = inject(FormBuilder);
  private fields = inject(FieldConfigService);
  private destroy$ = new Subject<void>();

  readonly exportService = inject(DocumentExportService);

  @ViewChild('extractResultContainer', { read: ElementRef })
  extractResultContainer?: ElementRef;

  // Forms
  formFiles!: FormGroup;
  formOptions!: FormGroup;
  configFiles: FieldConfig[] = [];
  configOptions: FieldConfig[] = [];

  // Inputs
  @Input() set mode(value: ExtractMode) {
    this._mode.set(value);
    if (value.mode === 'preloaded' && value.result) {
      this._result.set(value.result);
    }
  }

  @Input() set config(value: Partial<ExtractConfig>) {
    this._config.set({ ...this.defaultConfig, ...value });
    this.initializeForms();
  }

  @Input() set endpoints(value: Partial<ExtractEndpoints>) {
    this._endpoints.set(value);
  }

  @Input() disabled = false;

  // Outputs
  @Output() fileUploaded = new EventEmitter<ExtractFile>();
  @Output() extractionStarted = new EventEmitter<void>();
  @Output() extractionCompleted = new EventEmitter<ExtractionResult>();
  @Output() extractionError = new EventEmitter<Error>();

  // Signals
  private _mode = signal<ExtractMode>({ mode: 'upload' });
  private _config = signal<ExtractConfig>(this.defaultConfig);
  private _endpoints = signal<Partial<ExtractEndpoints>>({});
  private _result = signal<ExtractionResult | null>(null);
  private _isUploading = signal<boolean>(false);
  private _isExtracting = signal<boolean>(false);
  private _uploadProgress = signal<number>(0);
  private _extractProgress = signal<number>(0);
  private _extractId = signal<string | null>(null);

  // Computed
  mode$ = computed(() => this._mode());
  config$ = computed(() => this._config());
  endpoints$ = computed(() => this._endpoints());
  result$ = computed(() => this._result());
  isUploading$ = computed(() => this._isUploading());
  isExtracting$ = computed(() => this._isExtracting());
  uploadProgress$ = computed(() => this._uploadProgress());
  extractProgress$ = computed(() => this._extractProgress());

  isDark$!: Observable<boolean>;
  lang$!: Observable<string>;

  isPreloadedMode$ = computed(() => this._mode().mode === 'preloaded');


  private clipboard = inject(Clipboard);
  copied = signal(false);

  private get defaultConfig(): ExtractConfig {
    return {
      allowedFileTypes: ['.pdf', '.docx', '.txt', '.json', '.md'],
      maxFileSize: 10 * 1024 * 1024,
      maxFiles: 5,
    };
  }

  ngOnInit(): void {
    this.isDark$ = this.store.select(AppSelectors.ThemeSelectors.selectIsDark);
    this.lang$ = this.store.select(AppSelectors.LangSelectors.selectLang);

    this.extractService.configure({
      endpoints: this._endpoints(),
    });

    this.initializeForms();
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
  }

  private initializeForms(): void {
    const config = this._config();
    const acceptTypes = config.allowedFileTypes?.join(',') || '*';
    const isPreloaded = this.isPreloadedMode$();

    // Files Form
    this.formFiles = this.fb.group({});
    this.configFiles = [
      this.fields.getFileField({
        name: 'files',
        label: 'extractTpl.uploadFiles',
        multiple: true,
        accept: acceptTypes,
        maxFiles: config.maxFiles,
        maxFileSize: config.maxFileSize,
        required: true,
        validators: [Validators.required],
        errorMessages: { required: 'extractTpl.filesRequired' },
        fileVariant: 'dropzone',
        disabled: isPreloaded,
      }),
    ];

    // Options Form
    this.formOptions = this.fb.group({});
    this.configOptions = [
      this.fields.getTextAreaField({
        name: 'text',
        label: 'extractTpl.text',
        placeholder: 'extractTpl.textPlaceholder',
        rows: 4,
        required: false,
        disabled: isPreloaded,
      }),
      this.fields.getTextField({
        name: 'entities',
        label: 'extractTpl.entities',
        placeholder: 'extractTpl.entitiesPlaceholder',
        helperText: 'extractTpl.entitiesHelper',
        required: true,
        validators: [Validators.required],
        errorMessages: { required: 'extractTpl.entitiesRequired' },
        disabled: isPreloaded,
      }),
    ];
  }

  private extractFiles(files: File | File[] | FileList | null): File[] {
    if (!files) return [];

    if (files instanceof File) {
      return [files];
    } else if (Array.isArray(files)) {
      return files;
    } else if (files instanceof FileList) {
      return Array.from(files);
    }

    return [];
  }


  /**
   * Trigger extraction
   */
  triggerExtract(): void {
    let files: ExtractFile[] = [];
    const textInput: string = this.formOptions.get('text')?.value || '';
    const entities: string = this.formOptions.get('entities')?.value || "";
    const trimmedEntities = entities.split(',').map(e => e.trim()).filter(e => e.length > 0);

    const filesControl = this.formFiles.get('files');
    if (filesControl) {
      const filesValue: File | File[] | FileList = filesControl.value;

      if (filesValue) {
        const filesArray = this.extractFiles(filesValue);
        if (filesArray.length > 0) {

          const fileReferences: ExtractFile[] = filesArray.map(
            (file) => ({
              key: crypto.randomUUID(),
              name: file.name,
              size: file.size,
              type: file.type,
              ext: file.name.split('.').pop()?.toLowerCase(),
              uploadDate: new Date(),
              url: '',
              file: file,
            })
          );
          files = fileReferences
        }
      }
    }

    // Validate inputs
    if (files.length === 0 && !textInput.trim()) {
      console.warn('No files or text to extract');
      this.extractionError.emit(new Error('extractTpl.noFilesOrText'));
      return;
    }

    if (trimmedEntities.length === 0 || !trimmedEntities.some(e => e.trim().length > 0)) {
      console.warn('No entities specified');
      this.extractionError.emit(new Error('extractTpl.noEntities'));
      return;
    }

    // Validate form
    if (!this.formOptions.valid) {
      console.warn('Form is invalid');
      this.formOptions.markAllAsTouched();
      return;
    }

    if (this._isExtracting() || this._isUploading()) {
      console.warn('Operation already in progress');
      return;
    }

    // If files exist, upload first
    if (files.length > 0) {
      const filesToUpload = files
        .map((f) => f.file)
        .filter((f) => f instanceof File);

      if (filesToUpload.length > 0) {
        this._isUploading.set(true);
        this._uploadProgress.set(0);

        this.extractService
          .uploadFile({ files: filesToUpload }, this._endpoints())
          .pipe(takeUntil(this.destroy$))
          .subscribe({
            next: (response) => {
              this.formFiles.get('files')?.setValue(response.files);
              response.files.forEach((file) => {
                this.fileUploaded.emit(file);
              });

              this._isUploading.set(false);
              this._uploadProgress.set(100);

              this.performExtraction(response.files);
            },
            error: (err) => {
              console.error('Upload failed:', err);
              this._isUploading.set(false);
              this._uploadProgress.set(0);
              this.extractionError.emit(err);

              // TODO:
              const mockResult = this.extractService.generateMockExtractionResult();
              this.handleExtractionComplete(mockResult);
            },
          });
      }
    } else {
      // Direct extraction from text
      this.performExtraction([]);
    }
  }

  /**
   * Perform extraction
   */
  private performExtraction(files: ExtractFile[]): void {
    this._isExtracting.set(true);
    this._extractProgress.set(0);
    this.extractionStarted.emit();
    const textInput: string = (this.formOptions.get('text')?.value ?? '').trim();
    const entitiesRaw: string = this.formOptions.get('entities')?.value ?? '';
    const entities = entitiesRaw
      .split(',')
      .map(e => e.trim())
      .filter(Boolean);

    this.extractService
      .startExtraction(
        {
          fileKeys: files.map((f) => f.key),
          options: {
            entities: entities,
            text: textInput || undefined,
          },
        },
        this._endpoints()
      )
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: (response) => {
          this._extractId.set(response.extractionId);

          if (response.status === 'processing') {
            this.pollExtractionResult(response.extractionId);
          } else if (response.status === 'completed' && response.result) {
            this.handleExtractionComplete(response.result);
          }
        },
        error: (err) => {
          console.error('Extraction failed:', err);
          this._isExtracting.set(false);
          this._extractProgress.set(0);
          this.extractionError.emit(err);
        },
      });
  }

  /**
   * Poll for extraction result
   */
  private pollExtractionResult(extractionId: string): void {
    const pollInterval = setInterval(() => {
      this.extractService
        .getExtraction(extractionId, this._endpoints())
        .pipe(takeUntil(this.destroy$))
        .subscribe({
          next: (result) => {
            this._extractProgress.set(
              Math.min(this._extractProgress() + 10, 90)
            );

            if (result.status === 'completed') {
              clearInterval(pollInterval);
              this._extractProgress.set(100);
              this.handleExtractionComplete(result);
            } else if (result.status === 'failed') {
              clearInterval(pollInterval);
              this._isExtracting.set(false);
              this._extractProgress.set(0);
              const error = new Error(result.error || 'Extraction failed');
              this.extractionError.emit(error);
            }
          },
          error: (err) => {
            clearInterval(pollInterval);
            this._isExtracting.set(false);
            this._extractProgress.set(0);
            console.error('Error polling extraction:', err);
            this.extractionError.emit(err);
          },
        });
    }, 2000);
  }

  /**
   * Handle extraction completion
   */
  private handleExtractionComplete(result: ExtractionResult): void {
    this._result.set(result);
    this._isExtracting.set(false);
    this.extractionCompleted.emit(result);
  }

  /**
   * Clear all files and results
   */
  clearAll(): void {
    if (this.isPreloadedMode$()) return;

    if (this._isUploading() || this._isExtracting()) {
      console.warn('Cannot clear all while operation is in progress');
      return;
    }

    this._result.set(null);
    this._extractId.set(null);
    this._uploadProgress.set(0);
    this._extractProgress.set(0);

    this.formFiles.reset();
    this.formOptions.reset();
  }

  /**
   * Format file size
   */
  formatFileSize(bytes?: number): string {
    if (bytes === 0 || !bytes) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return Math.round((bytes / Math.pow(k, i)) * 100) / 100 + ' ' + sizes[i];
  }

  /**
   * Get file icon
   */
  getFileIcon(file: ExtractFile): string {
    return iconFor(file);
  }

  /**
   * Export extraction result
   */
  async handleExport(event: {
    format: ExportFormat;
    result: ExtractionResult;
  }): Promise<void> {
    const { format, result } = event;

    if (!result || !this.extractResultContainer) {
      console.warn(
        'No extraction result or container available for export'
      );
      return;
    }

    const adapter = new ExtractionExportAdapter(result);

    await this.exportService.export(adapter, {
      format,
      filename: `extraction-${result.id}.${format === 'docx' ? 'docx' : format === 'pdf' ? 'pdf' : 'txt'}`,
      includeScreenshot: format === 'pdf' || format === 'docx',
      screenshotElement: this.extractResultContainer,
      screenshotSelector: '.extract-result-container',
      metadata: {
        Status: result.status,
        'Total Entities': result.totalEntitiesFound.toString(),
        'Created Date': new Date().toLocaleDateString(),
      },
    });
  }

  /**
   * Copy extraction results to clipboard
   */
  copyToClipboard(): void {
    const text = this.formatExtractionForExport();
    if (text) {
      const success = this.clipboard.copy(text);

      if (success) {
        this.copied.set(true);
        setTimeout(() => this.copied.set(false), 2000);
      }
    }
  }

  /**
   * Format extraction results for export
   */
  private formatExtractionForExport(): string | null {
    let text = `ENTITY EXTRACTION RESULTS\n`;
    text += `${'='.repeat(50)}\n\n`;
    const result = this.result$();
    if (result) {


      // Status and Statistics
      text += `Status: ${result.status.toUpperCase()}\n`;
      text += `Total Entities Found: ${result.totalEntitiesFound}\n`;

      if (result.files.length > 0) {
        text += `Files Processed: ${result.files.length}\n`;
      }


      text += `\n${'-'.repeat(50)}\n\n`;

      // Entities
      if (result.entities && Object.keys(result.entities).length > 0) {
        text += `${'-'.repeat(50)}\n`;
        text += `EXTRACTED ENTITIES\n`;
        text += `${'-'.repeat(50)}\n\n`;

        Object.entries(result.entities).forEach(([entityType, entities]) => {
          text += `${entityType.toUpperCase()}\n`;
          text += `${'.'.repeat(40)}\n`;
          
          if (Array.isArray(entities) && entities.length > 0) {
            entities.forEach((entity, index) => {
              text += `  ${index + 1}. ${entity}\n`;
            });
          } else {
            text += `  No entities found\n`;
          }
          
          text += `\n`;
        });

        text += `${'-'.repeat(50)}\n\n`;
      }

      // Files Information
      if (result.files.length > 0) {
        text += `${'-'.repeat(50)}\n`;
        text += `FILES PROCESSED\n`;
        text += `${'-'.repeat(50)}\n`;

        result.files.forEach((file, index) => {
          text += `${index + 1}. ${file.name}\n`;
          text += `   Size: ${this.formatFileSize(file.size)}\n`;
          text += `   Type: ${file.type}\n`;
          text += `   Date: ${new Date(file.uploadDate).toLocaleString()}\n\n`;
        });
      }

      // Source Text
      if (result.text) {
        text += `${'-'.repeat(50)}\n`;
        text += `SOURCE TEXT\n`;
        text += `${'-'.repeat(50)}\n`;
        text += result.text + '\n';
      }

      // Metadata
      text += `\n${'-'.repeat(50)}\n`;
      text += `Extraction ID: ${result.id}\n`;
      text += `Generated: ${new Date().toLocaleString()}\n`;

      return text;
    } else {
      return null;
    }
  }
}