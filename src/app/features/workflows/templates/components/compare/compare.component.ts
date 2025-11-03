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
import { FormBuilder, FormGroup, ReactiveFormsModule } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatProgressBarModule } from '@angular/material/progress-bar';
import { MatTooltipModule } from '@angular/material/tooltip';
import { MatCardModule } from '@angular/material/card';
import { TranslateModule, TranslateService } from '@ngx-translate/core';
import { Store } from '@ngrx/store';
import { Observable, Subject, Subscription } from 'rxjs';
import { takeUntil } from 'rxjs/operators';
import { AppSelectors } from '@cadai/pxs-ng-core/store';
import { DynamicFormComponent } from '@cadai/pxs-ng-core/shared';
import { FieldConfig } from '@cadai/pxs-ng-core/interfaces';
import { FieldConfigService } from '@cadai/pxs-ng-core/services';
import {
  CompareFile,
  ComparisonResult,
  CompareConfig,
  CompareMode,
  CompareEndpoints,
} from '../../../utils/compareTpl.interface';
import { CompareService } from '../../services/compare.service';
import { ComparisonResultComponent } from './comparison-result/comparison-result';
import { iconFor } from '@features/workflows/utils/fileIcon';
import { ExportFormat } from '@features/workflows/utils/document-export.interface';
import { ExportOverlayComponent } from '../export-overlay/export-overlay.component';
import { DocumentExportService } from '../../services/document-export.service';
import { ComparisonExportAdapter } from '@features/workflows/utils/comparison-export.adapter';

@Component({
  selector: 'app-compare-tpl',
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
    DynamicFormComponent,
    ComparisonResultComponent,
    ExportOverlayComponent,
  ],
  templateUrl: './compare.component.html',
  styleUrls: ['./compare.component.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class CompareComponent implements OnInit, OnDestroy {
  private store = inject(Store);
  private translate = inject(TranslateService);
  private compareService = inject(CompareService);
  private fb = inject(FormBuilder);
  private fields = inject(FieldConfigService);
  private destroy$ = new Subject<void>();

  readonly exportService = inject(DocumentExportService);

  @ViewChild('comparisonResultContainer', { read: ElementRef })
  comparisonResultContainer?: ElementRef;

  // Forms
  formFile1!: FormGroup;
  formFile2!: FormGroup;
  configFile1: FieldConfig[] = [];
  configFile2: FieldConfig[] = [];

  // Subscriptions
  private formSubscriptions: Subscription[] = [];

  // Inputs
  @Input() set mode(value: CompareMode) {
    this._mode.set(value);
    if (value.mode === 'preloaded' && value.result) {
      this._result.set(value.result);
      this._file1.set(value.result.file1);
      this._file2.set(value.result.file2);
    }
  }

  @Input() set config(value: Partial<CompareConfig>) {
    this._config.set({ ...this.defaultConfig, ...value });
    this.initializeForms();
  }

  @Input() set endpoints(value: Partial<CompareEndpoints>) {
    this._endpoints.set(value);
  }

  @Input() disabled = false;

  // Outputs
  @Output() fileUploaded = new EventEmitter<{ slot: 1 | 2; file: CompareFile }>();
  @Output() comparisonStarted = new EventEmitter<void>();
  @Output() comparisonCompleted = new EventEmitter<ComparisonResult>();
  @Output() comparisonError = new EventEmitter<Error>();

  // Signals
  private _mode = signal<CompareMode>({ mode: 'upload' });
  private _config = signal<CompareConfig>(this.defaultConfig);
  private _endpoints = signal<Partial<CompareEndpoints>>({});
  private _file1 = signal<CompareFile | null>(null);
  private _file2 = signal<CompareFile | null>(null);
  private _result = signal<ComparisonResult | null>(null);
  private _isUploading = signal<boolean>(false);
  private _isComparing = signal<boolean>(false);
  private _uploadProgress = signal<number>(0);
  private _comparisonProgress = signal<number>(0);
  private _comparisonId = signal<string | null>(null);

  // Computed
  mode$ = computed(() => this._mode());
  config$ = computed(() => this._config());
  endpoints$ = computed(() => this._endpoints());
  file1$ = computed(() => this._file1());
  file2$ = computed(() => this._file2());
  result$ = computed(() => this._result());
  isUploading$ = computed(() => this._isUploading());
  isComparing$ = computed(() => this._isComparing());
  uploadProgress$ = computed(() => this._uploadProgress());
  comparisonProgress$ = computed(() => this._comparisonProgress());

  isDark$!: Observable<boolean>;
  lang$!: Observable<string>;

  canCompare$ = computed(() => {
    const file1 = this._file1();
    const file2 = this._file2();
    const mode = this._mode();
    const isUploading = this._isUploading();
    const isComparing = this._isComparing();

    return !!(
      file1 &&
      file2 &&
      mode.mode === 'upload' &&
      !isUploading &&
      !isComparing &&
      !this.disabled
    );
  });

  isPreloadedMode$ = computed(() => this._mode().mode === 'preloaded');

  hasFile1$ = computed(() => !!this._file1());
  hasFile2$ = computed(() => !!this._file2());

  canClearFile1$ = computed(() => {
    const mode = this._mode();
    const file1 = this._file1();
    const isUploading = this._isUploading();
    const isComparing = this._isComparing();

    return !!(
      file1 &&
      mode.mode === 'upload' &&
      !isUploading &&
      !isComparing
    );
  });

  canClearFile2$ = computed(() => {
    const mode = this._mode();
    const file2 = this._file2();
    const isUploading = this._isUploading();
    const isComparing = this._isComparing();

    return !!(
      file2 &&
      mode.mode === 'upload' &&
      !isUploading &&
      !isComparing
    );
  });

  canClearAll$ = computed(() => {
    const mode = this._mode();
    const file1 = this._file1();
    const file2 = this._file2();
    const isUploading = this._isUploading();
    const isComparing = this._isComparing();

    return !!(
      (file1 || file2) &&
      mode.mode === 'upload' &&
      !isUploading &&
      !isComparing
    );
  });

  private get defaultConfig(): CompareConfig {
    return {
      allowedFileTypes: ['.pdf', '.docx', '.txt', '.json'],
      maxFileSize: 10 * 1024 * 1024, // 10MB
    };
  }

  ngOnInit(): void {
    this.isDark$ = this.store.select(AppSelectors.ThemeSelectors.selectIsDark);
    this.lang$ = this.store.select(AppSelectors.LangSelectors.selectLang);

    // Configure service
    this.compareService.configure({
      endpoints: this._endpoints(),
    });

    this.initializeForms();
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
    this.formSubscriptions.forEach((sub) => sub.unsubscribe());
  }

  private initializeForms(): void {
    const config = this._config();
    const acceptTypes = config.allowedFileTypes?.join(',') || '*';
    const isPreloaded = this.isPreloadedMode$();

    // Clear previous subscriptions
    this.formSubscriptions.forEach((sub) => sub.unsubscribe());
    this.formSubscriptions = [];

    // Form for File 1
    this.formFile1 = this.fb.group({});
    this.configFile1 = [
      this.fields.getFileField({
        name: 'file1',
        label: 'compareTpl.file1',
        multiple: false,
        accept: acceptTypes,
        required: false,
        fileVariant: 'dropzone',
        disabled: isPreloaded,
        validators: undefined,
        errorMessages: { required: 'compareTpl.fileRequired' },
      }),
    ];

    // Form for File 2
    this.formFile2 = this.fb.group({});
    this.configFile2 = [
      this.fields.getFileField({
        name: 'file2',
        label: 'compareTpl.file2',
        multiple: false,
        accept: acceptTypes,
        required: false,
        fileVariant: 'dropzone',
        disabled: isPreloaded,
        validators: undefined,
        errorMessages: { required: 'compareTpl.fileRequired' },
      }),
    ];

    // Setup subscriptions after forms are created
    this.setupFormValueChanges();
  }

  private setupFormValueChanges(): void {
    // Use setTimeout to ensure form controls are created by DynamicFormComponent
    setTimeout(() => {
      // Watch File 1 changes
      const file1Control = this.formFile1.get('file1');
      if (file1Control) {
        const file1Sub = file1Control.valueChanges.subscribe(
          (files: File | File[] | FileList) => {
            if (files) {
              const file = this.extractFile(files);
              if (file && this.validateFile(file)) {
                // Store file reference temporarily
                this._file1.set({
                  key: crypto.randomUUID(),
                  name: file.name,
                  size: file.size,
                  mime: file.type,
                  ext: file.name.split('.').pop()?.toLowerCase() || '',
                  uploadDate: new Date(),
                  url: '',
                  file: file, // Temporary storage
                });
              }
            }
          }
        );
        this.formSubscriptions.push(file1Sub);
      }

      // Watch File 2 changes
      const file2Control = this.formFile2.get('file2');
      if (file2Control) {
        const file2Sub = file2Control.valueChanges.subscribe(
          (files: File | File[] | FileList) => {
            if (files) {
              const file = this.extractFile(files);
              if (file && this.validateFile(file)) {
                // Store file reference temporarily
                this._file2.set({
                  key: crypto.randomUUID(),
                  name: file.name,
                  size: file.size,
                  mime: file.type,
                  ext: file.name.split('.').pop()?.toLowerCase() || '',
                  uploadDate: new Date(),
                  url: '',
                  file: file, // Temporary storage
                });
              }
            }
          }
        );
        this.formSubscriptions.push(file2Sub);
      }
    }, 100);
  }

  private extractFile(files: File | File[] | FileList | null): File | null {
    if (!files) return null;

    if (files instanceof File) {
      return files;
    } else if (Array.isArray(files) && files.length > 0) {
      return files[0];
    } else if (files instanceof FileList && files.length > 0) {
      return files[0];
    }

    return null;
  }

  /**
   * Trigger comparison - uploads files first, then performs comparison
   */
  triggerComparison(): void {
    const file1 = this._file1();
    const file2 = this._file2();

    if (!file1 || !file2) {
      console.warn('Both files must be selected before comparison');
      return;
    }

    if (this._isComparing() || this._isUploading()) {
      console.warn('Operation already in progress');
      return;
    }

    // Check if we have actual File objects to upload
    const file1ToUpload = file1.file;
    const file2ToUpload = file2.file;

    if (!file1ToUpload || !file2ToUpload) {
      console.warn('File objects not found');
      return;
    }

    this._isUploading.set(true);
    this._uploadProgress.set(0);

    // Upload both files
    this.compareService
      .uploadFiles(
        { file1: file1ToUpload, file2: file2ToUpload },
        this._endpoints()
      )
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: (response) => {
          // Update files with uploaded data
          this._file1.set(response.file1);
          this._file2.set(response.file2);

          // Emit upload events
          this.fileUploaded.emit({ slot: 1, file: response.file1 });
          this.fileUploaded.emit({ slot: 2, file: response.file2 });

          this._isUploading.set(false);
          this._uploadProgress.set(100);

          // Now perform comparison
          this.performComparison(response.file1, response.file2);
        },
        error: (err) => {
          console.error('Upload failed:', err);
          this._isUploading.set(false);
          this._uploadProgress.set(0);
          this.comparisonError.emit(err);
        },
      });
  }

  /**
   * Perform comparison using service
   */
  private performComparison(file1: CompareFile, file2: CompareFile): void {
    this._isComparing.set(true);
    this._comparisonProgress.set(0);
    this.comparisonStarted.emit();

    this.compareService
      .startComparison(
        {
          file1Key: file1.key,
          file2Key: file2.key,
        },
        this._endpoints()
      )
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: (response) => {
          this._comparisonId.set(response.comparisonId);

          // Poll for result if processing
          if (response.status === 'processing') {
            this.pollComparisonResult(response.comparisonId);
          } else if (response.status === 'completed' && response.result) {
            this.handleComparisonComplete(response.result);
          }
        },
        error: (err) => {
          console.error('Comparison failed:', err);
          this._isComparing.set(false);
          this._comparisonProgress.set(0);
          this.comparisonError.emit(err);
        },
      });
  }

  /**
   * Poll for comparison result
   */
  private pollComparisonResult(comparisonId: string): void {
    const pollInterval = setInterval(() => {
      this.compareService
        .getComparison(comparisonId, this._endpoints())
        .pipe(takeUntil(this.destroy$))
        .subscribe({
          next: (result) => {
            // Update progress
            this._comparisonProgress.set(
              Math.min(this._comparisonProgress() + 10, 90)
            );

            if (result.status === 'completed') {
              clearInterval(pollInterval);
              this._comparisonProgress.set(100);
              this.handleComparisonComplete(result);
            } else if (result.status === 'error') {
              clearInterval(pollInterval);
              this._isComparing.set(false);
              this._comparisonProgress.set(0);
              const error = new Error(result.error || 'Comparison failed');
              this.comparisonError.emit(error);
            }
          },
          error: (err) => {
            clearInterval(pollInterval);
            this._isComparing.set(false);
            this._comparisonProgress.set(0);
            console.error('Error polling comparison:', err);
            this.comparisonError.emit(err);
          },
        });
    }, 2000); // Poll every 2 seconds
  }

  /**
   * Handle comparison completion
   */
  private handleComparisonComplete(result: ComparisonResult): void {
    this._result.set(result);
    this._isComparing.set(false);
    this.comparisonCompleted.emit(result);
  }

  /**
   * Clear specific file slot
   */
  clearFile(slot: 1 | 2): void {
    if (this.isPreloadedMode$()) return;

    if (this._isUploading() || this._isComparing()) {
      console.warn('Cannot clear file while operation is in progress');
      return;
    }

    if (slot === 1) {
      this._file1.set(null);
      this.formFile1.get('file1')?.reset();
    } else {
      this._file2.set(null);
      this.formFile2.get('file2')?.reset();
    }

    // Clear result when clearing any file
    this._result.set(null);
  }

  /**
   * Clear all files and results
   */
  clearAll(): void {
    if (this.isPreloadedMode$()) return;

    if (this._isUploading() || this._isComparing()) {
      console.warn('Cannot clear all while operation is in progress');
      return;
    }

    this._file1.set(null);
    this._file2.set(null);
    this._result.set(null);
    this._comparisonId.set(null);
    this._uploadProgress.set(0);
    this._comparisonProgress.set(0);

    this.formFile1.reset();
    this.formFile2.reset();
  }

  /**
   * Validate file
   */
  private validateFile(file: File): boolean {
    const config = this._config();

    // Check file size
    if (config.maxFileSize && file.size > config.maxFileSize) {
      const maxSizeMB = config.maxFileSize / (1024 * 1024);
      const error = new Error(`File size exceeds ${maxSizeMB}MB limit`);
      this.comparisonError.emit(error);
      return false;
    }

    // Check file type
    if (config.allowedFileTypes && config.allowedFileTypes.length > 0) {
      const fileExtension = '.' + file.name.split('.').pop()?.toLowerCase();
      if (!config.allowedFileTypes.includes(fileExtension)) {
        const error = new Error(
          `File type ${fileExtension} not allowed. Allowed types: ${config.allowedFileTypes.join(', ')}`
        );
        this.comparisonError.emit(error);
        return false;
      }
    }

    return true;
  }

  /**
   * Format file size for display
   */
  formatFileSize(bytes?: number): string {
    if (!bytes || bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return Math.round((bytes / Math.pow(k, i)) * 100) / 100 + ' ' + sizes[i];
  }

  /**
   * Get file icon
   */
  getFileIcon(file: CompareFile): string {
    return iconFor(file);
  }

  /**
   * Export comparison result using DocumentExportService
   * This method is called from the HTML template via the export overlay
   */
  /**
 * Export comparison result using DocumentExportService
 * This method is called from the HTML template via the export overlay
 */
async exportComparison(event: {
  format: ExportFormat;
  result: ComparisonResult;
}): Promise<void> {
  const { format, result } = event;
  
  if (!result || !this.comparisonResultContainer) {
    console.warn('No comparison result or container available for export');
    return;
  }

  // Create adapter for the comparison result
  const adapter = new ComparisonExportAdapter(result);

  // Export using service with proper options
  await this.exportService.export(adapter, {
    format,
    filename: `comparison-${result.id}.${format === 'docx' ? 'docx' : format === 'pdf' ? 'pdf' : 'txt'}`,
    includeScreenshot: format === 'pdf' || format === 'docx',
    screenshotElement: this.comparisonResultContainer,
    screenshotSelector: '.comparison-result-container',
    metadata: {
      'File 1': result.file1.name,
      'File 2': result.file2.name,
      'Similarity': `${result.similarity}%`,
      'Differences': result.differences.length.toString(),
      'Comparison Date': new Date(result.createdAt).toLocaleDateString(),
    },
  });
}
}