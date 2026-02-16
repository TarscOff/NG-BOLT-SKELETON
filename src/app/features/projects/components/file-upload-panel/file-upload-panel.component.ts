import {
    Component,
    ChangeDetectionStrategy,
    Input,
    Output,
    EventEmitter,
    signal,
    computed,
    inject,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { TranslateModule, TranslateService } from '@ngx-translate/core';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatProgressBarModule } from '@angular/material/progress-bar';
import { MatChipsModule } from '@angular/material/chips';
import { MatTooltipModule } from '@angular/material/tooltip';
import { FileUploadConfig } from '../../utils/workflow-trigger.utils';
import { ToastService } from '@cadai/pxs-ng-core/services';

export interface UploadedFile {
    file: File;
    id: string;
    progress: number;
    status: 'pending' | 'uploading' | 'completed' | 'error';
    error?: string;
}

@Component({
    selector: 'app-file-upload-panel',
    standalone: true,
    imports: [
        CommonModule,
        TranslateModule,
        MatButtonModule,
        MatIconModule,
        MatProgressBarModule,
        MatChipsModule,
        MatTooltipModule,
    ],
    template: `
        <div class="file-upload-panel" 
             [class.dragging]="isDragging()"
             (dragover)="onDragOver($event)"
             (dragleave)="onDragLeave($event)"
             (drop)="onDrop($event)">
            
            <div class="upload-zone"
                 role="button"
                 tabindex="0"
                 (click)="fileInput.click()"
                 (keydown)="onUploadZoneKeydown($event, fileInput)">
                <mat-icon class="upload-icon">cloud_upload</mat-icon>
                <div class="upload-text">
                    <span class="primary-text">{{ 'projects.workflows.upload.drag_drop' | translate }}</span>
                    <span class="secondary-text">{{ 'projects.workflows.upload.or_click' | translate }}</span>
                </div>
                <div class="upload-constraints">
                    @if (config) {
                        <span class="constraint">
                            {{ 'projects.workflows.upload.max_size' | translate }}: {{ formatFileSize(config.maxFileSize ?? 0) }}
                        </span>
                        <span class="constraint">
                            {{ 'projects.workflows.upload.accepted_types' | translate }}: {{ acceptedTypesDisplay() }}
                        </span>
                        @if (config.multiple) {
                            <span class="constraint">
                                {{ 'projects.workflows.upload.max_files' | translate }}: {{ config.maxFiles ?? 1 }}
                            </span>
                        }
                    }
                </div>
            </div>

            <input 
                #fileInput
                type="file" 
                class="hidden-input"
                [accept]="acceptString()"
                [multiple]="config?.multiple ?? false"
                (change)="onFileSelected($event)">

            @if (files().length > 0) {
                <div class="file-list">
                    <div class="file-list-header">
                        <span>{{ 'projects.workflows.upload.selected_files' | translate }} ({{ files().length }})</span>
                        <button mat-icon-button color="warn" (click)="clearFiles()" [matTooltip]="'common.clear' | translate">
                            <mat-icon>delete_sweep</mat-icon>
                        </button>
                    </div>
                    @for (f of files(); track f.id) {
                        <div class="file-item" [class.error]="f.status === 'error'">
                            <mat-icon class="file-icon">{{ getFileIcon(f.file.type) }}</mat-icon>
                            <div class="file-info">
                                <span class="file-name">{{ f.file.name }}</span>
                                <span class="file-size">{{ formatFileSize(f.file.size) }}</span>
                                @if (f.status === 'uploading') {
                                    <mat-progress-bar mode="determinate" [value]="f.progress"></mat-progress-bar>
                                }
                                @if (f.status === 'error') {
                                    <span class="file-error">{{ f.error }}</span>
                                }
                            </div>
                            <button mat-icon-button color="warn" (click)="removeFile(f.id)">
                                <mat-icon>close</mat-icon>
                            </button>
                        </div>
                    }
                </div>
            }

            @if (files().length > 0 && !disabled) {
                <div class="upload-actions">
                    <button mat-flat-button color="primary" 
                            [disabled]="!canSubmit()" 
                            (click)="submit()">
                        <mat-icon>send</mat-icon>
                        {{ 'projects.workflows.upload.submit' | translate }}
                    </button>
                </div>
            }
        </div>
    `,
    styles: [`
        .file-upload-panel {
            display: flex;
            flex-direction: column;
            gap: 16px;
            padding: 16px;
        }

        .upload-zone {
            border: 2px dashed var(--mat-sys-outline-variant);
            border-radius: 12px;
            padding: 32px;
            display: flex;
            flex-direction: column;
            align-items: center;
            gap: 12px;
            cursor: pointer;
            transition: all 0.2s ease;
            background: var(--mat-sys-surface-container-lowest);

            &:hover {
                border-color: var(--mat-sys-primary);
                background: color-mix(in srgb, var(--mat-sys-primary) 5%, transparent);
            }
        }

        .dragging .upload-zone {
            border-color: var(--mat-sys-primary);
            background: color-mix(in srgb, var(--mat-sys-primary) 10%, transparent);
            transform: scale(1.02);
        }

        .upload-icon {
            font-size: 48px;
            width: 48px;
            height: 48px;
            color: var(--mat-sys-primary);
        }

        .upload-text {
            display: flex;
            flex-direction: column;
            align-items: center;
            gap: 4px;
        }

        .primary-text {
            font-size: 16px;
            font-weight: 500;
        }

        .secondary-text {
            font-size: 14px;
            color: var(--mat-sys-on-surface-variant);
        }

        .upload-constraints {
            display: flex;
            flex-wrap: wrap;
            gap: 8px;
            justify-content: center;
            margin-top: 8px;
        }

        .constraint {
            font-size: 12px;
            color: var(--mat-sys-on-surface-variant);
            background: var(--mat-sys-surface-container);
            padding: 4px 8px;
            border-radius: 4px;
        }

        .hidden-input {
            display: none;
        }

        .file-list {
            display: flex;
            flex-direction: column;
            gap: 8px;
        }

        .file-list-header {
            display: flex;
            align-items: center;
            justify-content: space-between;
            font-weight: 500;
        }

        .file-item {
            display: flex;
            align-items: center;
            gap: 12px;
            padding: 12px;
            background: var(--mat-sys-surface-container);
            border-radius: 8px;

            &.error {
                background: color-mix(in srgb, var(--mat-sys-error) 10%, var(--mat-sys-surface));
            }
        }

        .file-icon {
            color: var(--mat-sys-primary);
        }

        .file-info {
            flex: 1;
            display: flex;
            flex-direction: column;
            gap: 4px;
            min-width: 0;
        }

        .file-name {
            font-weight: 500;
            white-space: nowrap;
            overflow: hidden;
            text-overflow: ellipsis;
        }

        .file-size {
            font-size: 12px;
            color: var(--mat-sys-on-surface-variant);
        }

        .file-error {
            font-size: 12px;
            color: var(--mat-sys-error);
        }

        .upload-actions {
            display: flex;
            justify-content: flex-end;
            gap: 8px;
        }
    `],
    changeDetection: ChangeDetectionStrategy.OnPush,
})
export class FileUploadPanelComponent {
    private readonly toast = inject(ToastService);
    private readonly translate = inject(TranslateService);

    @Input() config: FileUploadConfig | null = null;
    @Input() disabled = false;

    @Output() filesSubmitted = new EventEmitter<File[]>();
    @Output() fileRemoved = new EventEmitter<string>();

    readonly files = signal<UploadedFile[]>([]);
    readonly isDragging = signal(false);

    readonly acceptedTypesDisplay = computed(() => {
        if (!this.config?.acceptedTypes?.length) return '*';
        return this.config.acceptedTypes
            .map(t => this.mimeToExtension(t))
            .filter(Boolean)
            .join(', ');
    });

    readonly acceptString = computed(() => {
        if (!this.config?.acceptedTypes?.length) return '*';
        return this.config.acceptedTypes.join(',');
    });

    readonly canSubmit = computed(() => {
        const fileList = this.files();
        return fileList.length > 0 && fileList.every(f => f.status === 'pending' || f.status === 'completed');
    });

    onDragOver(event: DragEvent): void {
        event.preventDefault();
        event.stopPropagation();
        this.isDragging.set(true);
    }

    onDragLeave(event: DragEvent): void {
        event.preventDefault();
        event.stopPropagation();
        this.isDragging.set(false);
    }

    onDrop(event: DragEvent): void {
        event.preventDefault();
        event.stopPropagation();
        this.isDragging.set(false);

        const droppedFiles = event.dataTransfer?.files;
        if (droppedFiles) {
            this.processFiles(Array.from(droppedFiles));
        }
    }

    onFileSelected(event: Event): void {
        const input = event.target as HTMLInputElement;
        if (input.files) {
            this.processFiles(Array.from(input.files));
            input.value = ''; // Reset input
        }
    }

    onUploadZoneKeydown(event: KeyboardEvent, input: HTMLInputElement): void {
        if (event.key === 'Enter' || event.key === ' ') {
            event.preventDefault();
            input.click();
        }
    }

    private processFiles(fileList: File[]): void {
        const maxFiles = this.config?.maxFiles ?? 1;
        const multiple = this.config?.multiple ?? false;
        const maxSize = this.config?.maxFileSize ?? 10 * 1024 * 1024;
        const acceptedTypes = this.config?.acceptedTypes ?? [];

        const currentCount = this.files().length;
        const allowedCount = multiple ? maxFiles - currentCount : 1;

        if (!multiple && currentCount > 0) {
            this.toast.show(this.translate.instant('projects.workflows.upload.single_file_only'));
            return;
        }

        const validFiles: UploadedFile[] = [];
        for (const file of fileList.slice(0, allowedCount)) {
            // Check file type
            if (!this.isFileTypeAccepted(file, acceptedTypes)) {
                this.toast.showError(this.translate.instant('projects.workflows.upload.invalid_type', { name: file.name }));
                continue;
            }

            // Check file size
            if (file.size > maxSize) {
                this.toast.showError(this.translate.instant('projects.workflows.upload.file_too_large', { 
                    name: file.name, 
                    max: this.formatFileSize(maxSize) 
                }));
                continue;
            }

            validFiles.push({
                file,
                id: `file-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`,
                progress: 0,
                status: 'pending',
            });
        }

        if (multiple) {
            this.files.update(existing => [...existing, ...validFiles]);
        } else {
            this.files.set(validFiles);
        }
    }

    removeFile(id: string): void {
        this.files.update(files => files.filter(f => f.id !== id));
        this.fileRemoved.emit(id);
    }

    clearFiles(): void {
        this.files.set([]);
    }

    submit(): void {
        const fileList = this.files().map(f => f.file);
        this.filesSubmitted.emit(fileList);
    }

    formatFileSize(bytes: number): string {
        if (bytes === 0) return '0 B';
        const k = 1024;
        const sizes = ['B', 'KB', 'MB', 'GB'];
        const i = Math.floor(Math.log(bytes) / Math.log(k));
        return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
    }

    getFileIcon(mimeType: string): string {
        if (mimeType.startsWith('image/')) return 'image';
        if (mimeType.startsWith('video/')) return 'movie';
        if (mimeType.startsWith('audio/')) return 'audiotrack';
        if (mimeType.includes('pdf')) return 'picture_as_pdf';
        if (mimeType.includes('spreadsheet') || mimeType.includes('excel') || mimeType.includes('csv')) return 'table_chart';
        if (mimeType.includes('word') || mimeType.includes('document')) return 'description';
        if (mimeType.includes('presentation') || mimeType.includes('powerpoint')) return 'slideshow';
        if (mimeType.includes('json')) return 'data_object';
        if (mimeType.includes('text')) return 'article';
        return 'insert_drive_file';
    }

    private isFileTypeAccepted(file: File, acceptedTypes: string[]): boolean {
        if (!acceptedTypes.length) {
            return true;
        }

        const mimeType = file.type.toLowerCase();
        const fileName = file.name.toLowerCase();

        return acceptedTypes.some(rawAcceptedType => {
            const acceptedType = rawAcceptedType.trim().toLowerCase();
            if (!acceptedType) return false;
            if (acceptedType === '*' || acceptedType === '*/*') return true;

            if (acceptedType.endsWith('/*')) {
                const mimePrefix = acceptedType.slice(0, acceptedType.length - 1);
                return mimeType.startsWith(mimePrefix);
            }

            if (acceptedType.startsWith('.')) {
                return fileName.endsWith(acceptedType);
            }

            if (acceptedType.includes('/')) {
                return mimeType === acceptedType;
            }

            return fileName.endsWith(`.${acceptedType}`);
        });
    }

    private mimeToExtension(mime: string): string {
        if (mime.startsWith('.')) {
            return mime.slice(1).toUpperCase();
        }

        const map: Record<string, string> = {
            'application/pdf': 'PDF',
            'text/plain': 'TXT',
            'application/msword': 'DOC',
            'application/vnd.openxmlformats-officedocument.wordprocessingml.document': 'DOCX',
            'text/csv': 'CSV',
            'application/json': 'JSON',
            'image/png': 'PNG',
            'image/jpeg': 'JPEG',
            'image/gif': 'GIF',
            'application/vnd.ms-excel': 'XLS',
            'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': 'XLSX',
        };
        return map[mime] ?? mime.split('/').pop()?.toUpperCase() ?? mime;
    }
}
