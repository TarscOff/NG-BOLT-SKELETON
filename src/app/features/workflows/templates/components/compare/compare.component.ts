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
import { FormBuilder, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatProgressBarModule } from '@angular/material/progress-bar';
import { MatTooltipModule } from '@angular/material/tooltip';
import { MatCardModule } from '@angular/material/card';
import { TranslateModule } from '@ngx-translate/core';
import { Store } from '@ngrx/store';
import { Observable, Subject } from 'rxjs';
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
} from '../../utils/tplsInterfaces/compareTpl.interface';
import { CompareService } from '../../services/compare.service';
import { ComparisonResultComponent } from './comparison-result/comparison-result';
import { ExportFormat } from '@features/workflows/templates/utils/document-export.interface';
import { ExportOverlayComponent } from '../export-overlay/export-overlay.component';
import { DocumentExportService } from '../../services/document-export.service';
import { ComparisonExportAdapter } from '@features/workflows/templates/utils/comparison-export.adapter';
import { Clipboard } from '@angular/cdk/clipboard';

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

  // Inputs
  @Input() set mode(value: CompareMode) {
    this._mode.set(value);
    if (value.mode === 'preloaded' && value.result) {
      this._result.set(value.result);
    }
  }

  @Input() set config(value: Partial<CompareConfig>) {
    this._config.set({ ...this.defaultConfig, ...value });
    this.initializeForms();
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
  private _result = signal<ComparisonResult | null>(null);
  private _isUploading = signal<boolean>(false);
  private _isComparing = signal<boolean>(false);
  private _uploadProgress = signal<number>(0);
  private _comparisonProgress = signal<number>(0);
  private _comparisonId = signal<string | null>(null);

  // Computed
  mode$ = computed(() => this._mode());
  config$ = computed(() => this._config());
  result$ = computed(() => this._result());
  isUploading$ = computed(() => this._isUploading());
  isComparing$ = computed(() => this._isComparing());
  uploadProgress$ = computed(() => this._uploadProgress());
  comparisonProgress$ = computed(() => this._comparisonProgress());

  isDark$!: Observable<boolean>;
  lang$!: Observable<string>;

  isPreloadedMode$ = computed(() => this._mode().mode === 'preloaded');

  private clipboard = inject(Clipboard);
  copied = signal(false);

  private get defaultConfig(): CompareConfig {
    return {
      allowedFileTypes: ['.pdf', '.docx', '.txt', '.json'],
      maxFileSize: 10 * 1024 * 1024, // 10MB
    };
  }

  ngOnInit(): void {
    this.isDark$ = this.store.select(AppSelectors.ThemeSelectors.selectIsDark);
    this.lang$ = this.store.select(AppSelectors.LangSelectors.selectLang);

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

    // Form for File 1
    this.formFile1 = this.fb.group({});
    this.configFile1 = [
      this.fields.getFileField({
        name: 'file1',
        label: 'compareTpl.file1',
        multiple: false,
        accept: acceptTypes,
        required: true,
        fileVariant: 'dropzone',
        disabled: isPreloaded,
        validators: [Validators.required],
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
        required: true,
        fileVariant: 'dropzone',
        disabled: isPreloaded,
        validators: [Validators.required],
        errorMessages: { required: 'compareTpl.fileRequired' },
      }),
    ];
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
    let file1: CompareFile | null = null;
    let file2: CompareFile | null = null;

    const file1Control = this.formFile1.get('file1');
    if (file1Control) {
      const filesValue: File | File[] | FileList = file1Control.value;

      const file = this.extractFile(filesValue);
      if (file) {
        file1 = {
          key: crypto.randomUUID(),
          name: file.name,
          size: file.size,
          mime: file.type,
          ext: file.name.split('.').pop()?.toLowerCase() || '',
          uploadDate: new Date(),
          url: '',
          file: file,
        };
      }
    }

    const file2Control = this.formFile2.get('file2');
    if (file2Control) {
      const filesValue: File | File[] | FileList = file2Control.value;

      const file = this.extractFile(filesValue);
      if (file) {
        file2 = {
          key: crypto.randomUUID(),
          name: file.name,
          size: file.size,
          mime: file.type,
          ext: file.name.split('.').pop()?.toLowerCase() || '',
          uploadDate: new Date(),
          url: '',
          file: file,
        };
      }
    }

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
        { file1: file1ToUpload, file2: file2ToUpload }
      )
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: (response) => {
          // Update files with uploaded data
          this.formFile1.get('file1')?.setValue(response.file1);
          this.formFile2.get('file2')?.setValue(response.file2);

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
        }
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
        .getComparison(comparisonId)
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
            } else if (result.status === 'failed') {
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
      this.formFile1.get('file1')?.reset();
    } else {
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

    this._result.set(null);
    this._comparisonId.set(null);
    this._uploadProgress.set(0);
    this._comparisonProgress.set(0);

    this.formFile1.reset();
    this.formFile2.reset();
  }

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

  
  copyToClipboard(): void {
    const text = this.formatComparisonForExport();
    if(text) {

      const success = this.clipboard.copy(text);
      
      if (success) {
        this.copied.set(true);
        setTimeout(() => this.copied.set(false), 2000);
      }
    }
  }

  private formatComparisonForExport(): string | null {
    let text = `Comparison Results\n\n`;
    const results = this.result$();
    if (results) {
      // Add file information
      text += `Files:\n`;
      if (results.file1) {
        text += `File 1:\n`;
        text += `  - Name: ${results.file1.name}\n`;
        if (results.file1.uploadDate) {
          text += `  - Upload Date: ${new Date(results.file1.uploadDate).toLocaleString()}\n`;
        }
      }
      if (results.file2) {
        text += `File 2:\n`;
        text += `  - Name: ${results.file2.name}\n`;
        if (results.file2.uploadDate) {
          text += `  - Upload Date: ${new Date(results.file2.uploadDate).toLocaleString()}\n`;
        }
      }
      text += `\n`;

      text += `Summary:\n`;
      text += `- Added: ${results.differences.filter(d => d.type === 'added').length}\n`;
      text += `- Removed: ${results.differences.filter(d => d.type === 'removed').length}\n`;
      text += `- Modified: ${results.differences.filter(d => d.type === 'modified').length}\n\n`;

      if (results.differences.length > 0) {
        text += `Differences:\n\n`;
        results.differences.forEach((diff, index) => {
          text += `${index + 1}. [${diff.type.toUpperCase()}] ${diff.section}\n`;
          text += `   ${diff.description}\n`;
          if (diff.lineNumber) {
            text += `   Line: ${diff.lineNumber}\n`;
          }
          if (diff.file1Content) {
            text += `   File 1: ${diff.file1Content}\n`;
          }
          if (diff.file2Content) {
            text += `   File 2: ${diff.file2Content}\n`;
          }
          text += `\n`;
        });
      } else {
        text += `No differences found.\n`;
      }

      return text;
    } else {
      return null;
    }
  }
}