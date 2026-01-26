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
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatTooltipModule } from '@angular/material/tooltip';
import { MatCardModule } from '@angular/material/card';
import { MatChipsModule } from '@angular/material/chips';
import { TranslateModule, TranslateService } from '@ngx-translate/core';
import { Store } from '@ngrx/store';
import { Observable, Subject } from 'rxjs';
import { takeUntil } from 'rxjs/operators';
import { AppSelectors } from '@cadai/pxs-ng-core/store';
import { DynamicFormComponent } from '@cadai/pxs-ng-core/shared';
import { FieldConfig } from '@cadai/pxs-ng-core/interfaces';
import { FieldConfigService } from '@cadai/pxs-ng-core/services';
import {
    SummarizeFile,
    SummaryResult,
    SummarizeConfig,
    SummarizeMode,
} from '../../utils/tplsInterfaces/summarizeTpl.interface';
import { SummarizeService } from '../../services/summarize.service';
import { iconFor } from '@features/workflows/templates/utils/fileIcon';
import { SummaryResultComponent } from './summarize-result/summarize-result.component';
import { ExportFormat } from '@features/workflows/templates/utils/document-export.interface';
import { SummaryExportAdapter } from '@features/workflows/templates/utils/summary-export.adapter';
import { ExportOverlayComponent } from '../export-overlay/export-overlay.component';
import { DocumentExportService } from '../../services/document-export.service';
import { Clipboard } from '@angular/cdk/clipboard';

@Component({
    selector: 'app-summarize-tpl',
    standalone: true,
    imports: [
        CommonModule,
        ReactiveFormsModule,
        TranslateModule,
        MatButtonModule,
        MatIconModule,
        MatProgressBarModule,
        MatProgressSpinnerModule,
        MatTooltipModule,
        MatCardModule,
        MatChipsModule,
        DynamicFormComponent,
        SummaryResultComponent,
        ExportOverlayComponent,
    ],
    templateUrl: './summarize.component.html',
    styleUrls: ['./summarize.component.scss'],
    changeDetection: ChangeDetectionStrategy.OnPush,
})
export class SummarizeComponent implements OnInit, OnDestroy {
    private store = inject(Store);
    private translate = inject(TranslateService);
    private summarizeService = inject(SummarizeService);
    private fb = inject(FormBuilder);
    private fields = inject(FieldConfigService);
    private destroy$ = new Subject<void>();

    readonly exportService = inject(DocumentExportService);

    @ViewChild('summaryResultContainer', { read: ElementRef })
    summaryResultContainer?: ElementRef;

    // Forms
    formFiles!: FormGroup;
    formOptions!: FormGroup;
    configFiles: FieldConfig[] = [];
    configOptions: FieldConfig[] = [];

    // Inputs
    @Input() set mode(value: SummarizeMode) {
        this._mode.set(value);
        if (value.mode === 'preloaded' && value.result) {
            this._result.set(value.result);
        }
    }

    @Input() set config(value: Partial<SummarizeConfig>) {
        this._config.set({ ...this.defaultConfig, ...value });
        this.initializeForms();
    }

    @Input() disabled = false;

    // Outputs
    @Output() fileUploaded = new EventEmitter<SummarizeFile>();
    @Output() summarizeStarted = new EventEmitter<void>();
    @Output() summarizeCompleted = new EventEmitter<SummaryResult>();
    @Output() summarizeError = new EventEmitter<Error>();

    // Signals
    private _mode = signal<SummarizeMode>({ mode: 'upload' });
    private _config = signal<SummarizeConfig>(this.defaultConfig);
    private _result = signal<SummaryResult | null>(null);
    private _isUploading = signal<boolean>(false);
    private _isSummarizing = signal<boolean>(false);
    private _uploadProgress = signal<number>(0);
    private _summarizeProgress = signal<number>(0);
    private _summaryId = signal<string | null>(null);

    // Computed
    mode$ = computed(() => this._mode());
    config$ = computed(() => this._config());
    result$ = computed(() => this._result());
    isUploading$ = computed(() => this._isUploading());
    isSummarizing$ = computed(() => this._isSummarizing());
    uploadProgress$ = computed(() => this._uploadProgress());
    summarizeProgress$ = computed(() => this._summarizeProgress());


    isDark$!: Observable<boolean>;
    lang$!: Observable<string>;

    canClearAll$ = computed(() => {
        const mode = this._mode();
        const files = this.formFiles.get('files')?.value || [];
        const isUploading = this._isUploading();
        const isSummarizing = this._isSummarizing();

        return !!(
            files.length > 0 &&
            mode.mode === 'upload' &&
            !isUploading &&
            !isSummarizing
        );
    });

    canRemoveFile$ = computed(() => {
        const mode = this._mode();
        const isUploading = this._isUploading();
        const isSummarizing = this._isSummarizing();

        return !!(
            mode.mode === 'upload' &&
            !isUploading &&
            !isSummarizing
        );
    });

    isPreloadedMode$ = computed(() => this._mode().mode === 'preloaded');

    private get defaultConfig(): SummarizeConfig {
        return {
            allowedFileTypes: ['.pdf', '.docx', '.txt', '.json', '.md'],
            maxFileSize: 10 * 1024 * 1024,
            maxFiles: 5,
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

        // Files Form
        this.formFiles = this.fb.group({});
        this.configFiles = [
            this.fields.getFileField({
                name: 'files',
                label: 'summarizeTpl.uploadFiles',
                multiple: true,
                accept: acceptTypes,
                maxFiles: config.maxFiles,
                maxFileSize: config.maxFileSize,
                required: true,
                validators: [Validators.required],
                fileVariant: 'dropzone',
                disabled: isPreloaded,
                errorMessages: { required: 'summarizeTpl.filesRequired' },
            }),
        ];

        // Options Form
        this.formOptions = this.fb.group({});

        this.configOptions = [
            this.fields.getDropdownField({
                name: 'length',
                label: 'summarizeTpl.length',
                placeholder: 'summarizeTpl.selectLength',
                options: [
                    { label: this.translate.instant('summarizeTpl.lengths.short'), value: 'short' },
                    { label: this.translate.instant('summarizeTpl.lengths.medium'), value: 'medium' },
                    { label: this.translate.instant('summarizeTpl.lengths.long'), value: 'long' },
                ],
                multiple: false,
                color: 'primary',
                layoutClass: 'primary',
                helperText: 'summarizeTpl.selectLength',
                required: true,
                validators: [Validators.required],
                errorMessages: { required: 'summarizeTpl.lengthRequired' },
                defaultValue: 'medium',
            }),
            this.fields.getDropdownField({
                name: 'style',
                label: 'summarizeTpl.style',
                placeholder: 'summarizeTpl.selectStyle',
                options: [
                    { label: this.translate.instant('summarizeTpl.styles.bullets'), value: 'bullets' },
                    { label: this.translate.instant('summarizeTpl.styles.paragraph'), value: 'paragraph' },
                    { label: this.translate.instant('summarizeTpl.styles.executive'), value: 'executive' },
                ],
                multiple: false,
                color: 'primary',
                layoutClass: 'primary',
                helperText: 'summarizeTpl.selectStyle',
                required: true,
                validators: [Validators.required],
                errorMessages: { required: 'summarizeTpl.styleRequired' },
                defaultValue: 'paragraph',
            }),
            this.fields.getDropdownField({
                name: 'language',
                label: 'summarizeTpl.language',
                placeholder: 'summarizeTpl.selectLanguage',
                options: [
                    { label: this.translate.instant('languages.en'), value: 'en' },
                    { label: this.translate.instant('languages.fr'), value: 'fr' },
                ],
                multiple: false,
                color: 'primary',
                layoutClass: 'primary',
                helperText: 'summarizeTpl.selectLanguage',
                required: true,
                validators: [Validators.required],
                errorMessages: { required: 'summarizeTpl.languageRequired' },
                defaultValue: 'en',
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
     * Trigger summarization - uploads files first, then performs summarization
     */
    triggerSummarize(): void {
        let files: SummarizeFile[] = [];

        const filesControl = this.formFiles.get('files');
        if (filesControl) {
            const filesArray = this.extractFiles(filesControl.value);
            if (filesArray.length > 0) {
                const fileReferences: SummarizeFile[] = filesArray.map((file) => ({
                    key: crypto.randomUUID(),
                    name: file.name,
                    size: file.size,
                    type: file.type,
                    ext: file.name.split('.').pop()?.toLowerCase(),
                    uploadDate: new Date(),
                    url: '',
                    file: file,
                }));

                files = fileReferences;
            }
        }

        if (files.length === 0) {
            console.warn('No files to summarize');
            return;
        }

        if (this._isSummarizing() || this._isUploading()) {
            console.warn('Operation already in progress');
            return;
        }

        // Check if we have actual File objects to upload
        const filesToUpload = files
            .map((f) => f.file)
            .filter((f) => f instanceof File);

        if (filesToUpload.length === 0) {
            console.warn('No file objects found to upload');
            return;
        }

        this._isUploading.set(true);
        this._uploadProgress.set(0);

        // Upload files
        this.summarizeService
            .uploadFile({ files: filesToUpload })
            .pipe(takeUntil(this.destroy$))
            .subscribe({
                next: (response) => {
                    // Update files with uploaded data
                    this.formFiles.get('files')?.setValue(response.files);

                    // Emit upload events
                    response.files.forEach((file) => {
                        this.fileUploaded.emit(file);
                    });

                    this._isUploading.set(false);
                    this._uploadProgress.set(100);

                    // Now perform summarization
                    this.performSummarization(response.files);
                },
                error: (err) => {
                    console.error('Upload failed:', err);
                    this._isUploading.set(false);
                    this._uploadProgress.set(0);
                    this.summarizeError.emit(err);
                },
            });
    }

    /**
     * Perform summarization using service
     */
    private performSummarization(files: SummarizeFile[]): void {
        this._isSummarizing.set(true);
        this._summarizeProgress.set(0);
        this.summarizeStarted.emit();

        this.summarizeService
            .startSummarization(
                {
                    fileKeys: files.map((f) => f.key),
                    options: {
                        style: this.formOptions.get('style')?.value,
                        length: this.formOptions.get('length')?.value,
                        language: this.formOptions.get('language')?.value,
                        includeKeyPoints: true,
                        maxKeyPoints: 5,
                    },
                }
            )
            .pipe(takeUntil(this.destroy$))
            .subscribe({
                next: (response) => {
                    this._summaryId.set(response.summaryId);

                    // Poll for result if processing
                    if (response.status === 'processing') {
                        this.pollSummaryResult(response.summaryId);
                    } else if (response.status === 'completed' && response.result) {
                        this.handleSummaryComplete(response.result);
                    }
                },
                error: (err) => {
                    console.error('Summarization failed:', err);
                    this._isSummarizing.set(false);
                    this._summarizeProgress.set(0);
                    this.summarizeError.emit(err);
                },
            });
    }

    /**
     * Poll for summary result
     */
    private pollSummaryResult(summaryId: string): void {
        const pollInterval = setInterval(() => {
            this.summarizeService
                .getSummary(summaryId)
                .pipe(takeUntil(this.destroy$))
                .subscribe({
                    next: (result) => {
                        // Update progress
                        this._summarizeProgress.set(
                            Math.min(this._summarizeProgress() + 10, 90)
                        );

                        if (result.status === 'completed') {
                            clearInterval(pollInterval);
                            this._summarizeProgress.set(100);
                            this.handleSummaryComplete(result);
                        } else if (result.status === 'failed') {
                            clearInterval(pollInterval);
                            this._isSummarizing.set(false);
                            this._summarizeProgress.set(0);
                            const error = new Error(result.error || 'Summarization failed');
                            this.summarizeError.emit(error);
                        }
                    },
                    error: (err) => {
                        clearInterval(pollInterval);
                        this._isSummarizing.set(false);
                        this._summarizeProgress.set(0);
                        console.error('Error polling summary:', err);
                        this.summarizeError.emit(err);
                    },
                });
        }, 2000); // Poll every 2 seconds
    }

    /**
     * Handle summary completion
     */
    private handleSummaryComplete(result: SummaryResult): void {
        this._result.set(result);
        this._isSummarizing.set(false);
        this.summarizeCompleted.emit(result);
    }

    /**
     * Clear all files and results
     */
    clearAll(): void {
        if (this.isPreloadedMode$()) return;

        if (this._isUploading() || this._isSummarizing()) {
            console.warn('Cannot clear all while operation is in progress');
            return;
        }

        this._result.set(null);
        this._summaryId.set(null);
        this._uploadProgress.set(0);
        this._summarizeProgress.set(0);

        this.formFiles.reset();
        this.formOptions.reset();
    }

    /**
     * Format file size for display
     */
    formatFileSize(bytes: number): string {
        if (bytes === 0) return '0 Bytes';
        const k = 1024;
        const sizes = ['Bytes', 'KB', 'MB', 'GB'];
        const i = Math.floor(Math.log(bytes) / Math.log(k));
        return Math.round((bytes / Math.pow(k, i)) * 100) / 100 + ' ' + sizes[i];
    }

    /**
     * Get file icon
     */
    getFileIcon(file: SummarizeFile): string {
        return iconFor(file);
    }

    /**
     * Export summary result using DocumentExportService
     * This method is called from the HTML template via the export overlay
     */
    async handleExport(event: {
        format: ExportFormat;
        result: SummaryResult;
    }): Promise<void> {
        const { format, result } = event;

        if (!result || !this.summaryResultContainer) {
            console.warn('No summary result or container available for export');
            return;
        }

        // Create adapter for the summary result
        const adapter = new SummaryExportAdapter(result);

        // Export using service with proper options
        await this.exportService.export(adapter, {
            format,
            filename: `summary-${result.id}.${format === 'docx' ? 'docx' : format === 'pdf' ? 'pdf' : 'txt'}`,
            includeScreenshot: format === 'pdf' || format === 'docx',
            screenshotElement: this.summaryResultContainer,
            screenshotSelector: '.summary-result-container',
            metadata: {
                Style: result.style,
                Length: result.length,
                Language: result.language.toUpperCase(),
                'File Count': result.files.length.toString(),
                'Created Date': new Date(result.createdAt).toLocaleDateString(),
            },
        });
    }

    private clipboard = inject(Clipboard);
    copied = signal(false);
    copyToClipboard(): void {
        const text = this.formatSummaryForExport();
        if (text) {
            const success = this.clipboard.copy(text);

            if (success) {
                this.copied.set(true);
                setTimeout(() => this.copied.set(false), 2000);
            }
        }
    }

    private formatSummaryForExport(): string | null {
        const result = this.result$();

        if (result) {
            let text = `${result.summary}\n\n`;

            if (result.keyPoints.length > 0) {
                text += 'Key Points:\n';
                result.keyPoints.forEach((point, index) => {
                    text += `${index + 1}. ${point}\n`;
                });
            }

            text += `\n---\n`;
            text += `Original: ${result.wordCount.original} words\n`;
            text += `Summary: ${result.wordCount.summary} words\n`;
            text += `Reduction: ${result.wordCount.reduction}%\n`;

            return text;
        } else {
            return null;
        }
    }
}