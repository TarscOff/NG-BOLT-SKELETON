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
import { Observable, Subject, Subscription } from 'rxjs';
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
    SummaryLength,
    SummaryStyle,
    SummarizeEndpoints,
} from '../../utils/summarizeTpl.interface';
import { SummarizeService } from '../../services/summarize.service';
import { iconFor } from '@features/workflows/templates/utils/fileIcon';
import { SummaryResultComponent } from './summarize-result/summarize-result.component';
import { ExportFormat } from '@features/workflows/templates/utils/document-export.interface';
import { SummaryExportAdapter } from '@features/workflows/templates/utils/summary-export.adapter';
import { ExportOverlayComponent } from '../export-overlay/export-overlay.component';
import { DocumentExportService } from '../../services/document-export.service';

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

    // Subscriptions
    private formSubscriptions: Subscription[] = [];

    // Inputs
    @Input() set mode(value: SummarizeMode) {
        this._mode.set(value);
        if (value.mode === 'preloaded' && value.result) {
            this._result.set(value.result);
            this._files.set(value.result.files);
            this._selectedLength.set(value.result.length);
            this._selectedStyle.set(value.result.style);
            this._selectedLanguage.set(value.result.language);
        }
    }

    @Input() set config(value: Partial<SummarizeConfig>) {
        this._config.set({ ...this.defaultConfig, ...value });
        this.initializeForms();
    }

    @Input() set endpoints(value: Partial<SummarizeEndpoints>) {
        this._endpoints.set(value);
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
    private _endpoints = signal<Partial<SummarizeEndpoints>>({});
    private _files = signal<SummarizeFile[]>([]);
    private _result = signal<SummaryResult | null>(null);
    private _isUploading = signal<boolean>(false);
    private _isSummarizing = signal<boolean>(false);
    private _uploadProgress = signal<number>(0);
    private _summarizeProgress = signal<number>(0);
    private _summaryId = signal<string | null>(null);
    private _selectedLength = signal<SummaryLength>('medium');
    private _selectedStyle = signal<SummaryStyle>('paragraph');
    private _selectedLanguage = signal<string>('en');

    // Computed
    mode$ = computed(() => this._mode());
    config$ = computed(() => this._config());
    endpoints$ = computed(() => this._endpoints());
    files$ = computed(() => this._files());
    result$ = computed(() => this._result());
    isUploading$ = computed(() => this._isUploading());
    isSummarizing$ = computed(() => this._isSummarizing());
    uploadProgress$ = computed(() => this._uploadProgress());
    summarizeProgress$ = computed(() => this._summarizeProgress());
    selectedLength$ = computed(() => this._selectedLength());
    selectedStyle$ = computed(() => this._selectedStyle());
    selectedLanguage$ = computed(() => this._selectedLanguage());

    isDark$!: Observable<boolean>;
    lang$!: Observable<string>;

    canSummarize$ = computed(() => {
        const files = this._files();
        const mode = this._mode();
        const isUploading = this._isUploading();
        const isSummarizing = this._isSummarizing();

        return !!(
            files.length > 0 &&
            mode.mode === 'upload' &&
            !isUploading &&
            !isSummarizing &&
            !this.disabled
        );
    });

    hasFiles$ = computed(() => this._files().length > 0);

    canClearAll$ = computed(() => {
        const mode = this._mode();
        const files = this._files();
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
            defaultLength: 'medium',
            defaultStyle: 'paragraph',
            defaultLanguage: 'en',
            availableLanguages: [
                { label: 'English', value: 'en' },
                { label: 'French', value: 'fr' },
                { label: 'Dutch', value: 'nl' },
                { label: 'German', value: 'de' },
                { label: 'Spanish', value: 'es' },
            ],
        };
    }

    ngOnInit(): void {
        this.isDark$ = this.store.select(AppSelectors.ThemeSelectors.selectIsDark);
        this.lang$ = this.store.select(AppSelectors.LangSelectors.selectLang);

        // Configure service
        this.summarizeService.configure({
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
                required: false,
                fileVariant: 'dropzone',
                disabled: isPreloaded,
                validators: undefined,
                errorMessages: { required: 'summarizeTpl.filesRequired' },
            }),
        ];

        // Options Form
        this.formOptions = this.fb.group({
            length: [config.defaultLength || 'medium', Validators.required],
            style: [config.defaultStyle || 'paragraph', Validators.required],
            language: [config.defaultLanguage || 'en', Validators.required],
        });

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
            }),
            this.fields.getDropdownField({
                name: 'language',
                label: 'summarizeTpl.language',
                placeholder: 'summarizeTpl.selectLanguage',
                options: config.availableLanguages || [],
                multiple: false,
                color: 'primary',
                layoutClass: 'primary',
                helperText: 'summarizeTpl.selectLanguage',
            }),
        ];

        // Set initial values from config
        this._selectedLength.set(config.defaultLength || 'medium');
        this._selectedStyle.set(config.defaultStyle || 'paragraph');
        this._selectedLanguage.set(config.defaultLanguage || 'en');

        // Setup subscriptions after forms are created
        this.setupFormValueChanges();
    }

    private setupFormValueChanges(): void {
        // Use setTimeout to ensure form controls are created by DynamicFormComponent
        setTimeout(() => {
            // Watch files changes
            const filesControl = this.formFiles.get('files');
            if (filesControl) {
                const filesSub = filesControl.valueChanges.subscribe(
                    (files: File | File[] | FileList) => {
                        if (files) {
                            const filesArray = this.extractFiles(files);
                            if (filesArray.length > 0) {
                                const config = this._config();
                                const maxFiles = config.maxFiles || 5;

                                if (filesArray.length > maxFiles) {
                                    const error = new Error(`Maximum ${maxFiles} files allowed`);
                                    this.summarizeError.emit(error);
                                    this.formFiles.get('files')?.reset();
                                    return;
                                }

                                // Validate each file
                                const validFiles = filesArray.filter((file) => this.validateFile(file));
                                if (validFiles.length === 0) {
                                    this.formFiles.get('files')?.reset();
                                    return;
                                }

                                // Store file references temporarily
                                const fileReferences: SummarizeFile[] = validFiles.map((file) => ({
                                    key: crypto.randomUUID(),
                                    name: file.name,
                                    size: file.size,
                                    type: file.type,
                                    ext: file.name.split('.').pop()?.toLowerCase(),
                                    uploadDate: new Date(),
                                    url: '',
                                    file: file, // Temporary storage
                                }));

                                this._files.set(fileReferences);
                            }
                        }
                    }
                );
                this.formSubscriptions.push(filesSub);
            }

            // Watch options changes
            const lengthControl = this.formOptions.get('length');
            if (lengthControl) {
                const lengthSub = lengthControl.valueChanges.subscribe((length: SummaryLength) => {
                    this._selectedLength.set(length);
                });
                this.formSubscriptions.push(lengthSub);
            }

            const styleControl = this.formOptions.get('style');
            if (styleControl) {
                const styleSub = styleControl.valueChanges.subscribe((style: SummaryStyle) => {
                    this._selectedStyle.set(style);
                });
                this.formSubscriptions.push(styleSub);
            }

            const languageControl = this.formOptions.get('language');
            if (languageControl) {
                const languageSub = languageControl.valueChanges.subscribe((language: string) => {
                    this._selectedLanguage.set(language);
                });
                this.formSubscriptions.push(languageSub);
            }
        }, 100);
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
        const files = this._files();

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
            .uploadFile({ files: filesToUpload }, this._endpoints())
            .pipe(takeUntil(this.destroy$))
            .subscribe({
                next: (response) => {
                    // Update files with uploaded data
                    this._files.set(response.files);

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
                        style: this._selectedStyle(),
                        length: this._selectedLength(),
                        language: this._selectedLanguage(),
                        includeKeyPoints: true,
                        maxKeyPoints: 5,
                    },
                },
                this._endpoints()
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
                .getSummary(summaryId, this._endpoints())
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
                        } else if (result.status === 'error') {
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
     * Remove specific file
     */
    removeFile(fileToRemove: SummarizeFile): void {
        if (this.isPreloadedMode$()) return;

        if (this._isUploading() || this._isSummarizing()) {
            console.warn('Cannot remove file while operation is in progress');
            return;
        }

        const currentFiles = this._files();
        const updatedFiles = currentFiles.filter((f) => f.key !== fileToRemove.key);
        this._files.set(updatedFiles);

        // Clear result when removing files
        this._result.set(null);

        // Reset form if no files left
        if (updatedFiles.length === 0) {
            this.formFiles.get('files')?.reset();
        }
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

        this._files.set([]);
        this._result.set(null);
        this._summaryId.set(null);
        this._uploadProgress.set(0);
        this._summarizeProgress.set(0);

        this.formFiles.reset();
        this.formOptions.patchValue({
            length: this._config().defaultLength || 'medium',
            style: this._config().defaultStyle || 'paragraph',
            language: this._config().defaultLanguage || 'en',
        });
    }

    /**
     * Validate file
     */
    private validateFile(file: File): boolean {
        const config = this._config();

        // Check file size
        if (config.maxFileSize && file.size > config.maxFileSize) {
            const maxSizeMB = config.maxFileSize / (1024 * 1024);
            const error = new Error(`File ${file.name} exceeds ${maxSizeMB}MB limit`);
            this.summarizeError.emit(error);
            return false;
        }

        // Check file type
        if (config.allowedFileTypes && config.allowedFileTypes.length > 0) {
            const fileExtension = '.' + file.name.split('.').pop()?.toLowerCase();
            if (!config.allowedFileTypes.includes(fileExtension)) {
                const error = new Error(
                    `File type ${fileExtension} not allowed. Allowed types: ${config.allowedFileTypes.join(', ')}`
                );
                this.summarizeError.emit(error);
                return false;
            }
        }

        return true;
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
}