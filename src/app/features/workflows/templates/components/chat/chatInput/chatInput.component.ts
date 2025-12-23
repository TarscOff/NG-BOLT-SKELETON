import {
  Component,
  ChangeDetectionStrategy,
  Input,
  Output,
  EventEmitter,
  OnInit,
  OnChanges,
  SimpleChanges,
  signal,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormBuilder, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatTooltipModule } from '@angular/material/tooltip';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { TranslateModule, TranslateService } from '@ngx-translate/core';
import { DynamicFormComponent } from '@cadai/pxs-ng-core/shared';
import { FieldConfig } from '@cadai/pxs-ng-core/interfaces';
import { FieldConfigService, ToastService } from '@cadai/pxs-ng-core/services';
import { ChatInputData } from '@features/workflows/templates/utils/tplsInterfaces/chatTpl.interface';

@Component({
  selector: 'app-chat-input-tpl',
  standalone: true,
  imports: [
    CommonModule,
    ReactiveFormsModule,
    MatButtonModule,
    MatIconModule,
    MatTooltipModule,
    MatProgressSpinnerModule,
    TranslateModule,
    DynamicFormComponent,
  ],
  templateUrl: './chatInput.component.html',
  styleUrls: ['./chatInput.component.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ChatInputComponent implements OnInit, OnChanges {
  @Input() maxLength = 4000;
  @Input() placeholder = 'chatTpl.placeholder';
  @Input() enableAttachments = false;
  @Input() disabled = false;
  @Input() loading = false;

  @Output() send = new EventEmitter<ChatInputData>();

  form!: FormGroup;
  fieldConfig: FieldConfig[] = [];
  characterCount = signal(0);

  @Input() attachedFiles: File[] = [];
  @Input() allowMultipleFiles = true;
  @Input() acceptedFileTypes = '*'; // or specify like: 'image/*,.pdf,.doc,.docx'
  @Input() maxFileSize = 10 * 1024 * 1024; // 10MB
  @Input() maxFiles = 5;

  constructor(
    private fb: FormBuilder,
    private fieldsConfigService: FieldConfigService,
    private translate: TranslateService,
    private toast: ToastService
  ) { }

  ngOnInit(): void {
    this.initializeForm();
  }

  ngOnChanges(changes: SimpleChanges): void {
    // Reinitialize form if maxLength or placeholder changes
    if (changes['maxLength'] || changes['placeholder']) {
      if (this.form) {
        const currentValue = this.form.get('message')?.value;
        this.initializeForm();
        if (currentValue) {
          this.form.patchValue({ message: currentValue }, { emitEvent: false });
        }
      }
    }

    // Update form disabled state
    if (changes['disabled'] || changes['loading']) {
      this.updateFormState();
    }
  }

  private initializeForm(): void {
    this.form = this.fb.group({});

    this.fieldConfig = [
      this.fieldsConfigService.getTextAreaField({
        name: 'message',
        label: this.translate.instant('chatTpl.input'),
        placeholder: this.translate.instant(this.placeholder),
        showCounter: true,
        maxLength: this.maxLength,
        color: 'primary',
        layoutClass: 'primary',
        rows: 1,
        maxRows: 10,
        //autoResize: true,
        disabled: this.disabled || this.loading,
        validators: [Validators.maxLength(this.maxLength)],
        errorMessages: {
          maxlength: this.translate.instant('form.errors.textarea.maxlength', {
            requiredLength: this.maxLength,
          }),
        },
        isResizable: true
      }),
    ];

    // Subscribe to form value changes for character count
    setTimeout(() => {
      const messageControl = this.form.get('message');
      if (messageControl) {
        messageControl.valueChanges.subscribe(value => {
          this.characterCount.set((value || '').length);
        });
      }
    });
  }

  fileIcon(name: string, type?: string): string {
    const ext = name.split('.').pop()?.toLowerCase();
    if (type?.includes('pdf') || ext === 'pdf') return 'picture_as_pdf';
    if (
      type?.startsWith('image/') ||
      ['png', 'jpg', 'jpeg', 'gif', 'webp', 'svg'].includes(ext ?? '')
    )
      return 'image';
    if (['csv', 'xls', 'xlsx'].includes(ext ?? '')) return 'table_chart';
    if (['ppt', 'pptx', 'key'].includes(ext ?? '')) return 'slideshow';
    if (['doc', 'docx', 'rtf', 'odt', 'txt', 'md'].includes(ext ?? ''))
      return 'description';
    if (['zip', 'rar', '7z', 'tar', 'gz'].includes(ext ?? ''))
      return 'folder_zip';
    return 'attach_file';
  }

  private updateFormState(): void {
    const messageControl = this.form?.get('message');
    if (!messageControl) return;

    const shouldDisable = this.disabled || this.loading;

    if (shouldDisable && messageControl.enabled) {
      messageControl.disable({ emitEvent: false });
    } else if (!shouldDisable && messageControl.disabled) {
      messageControl.enable({ emitEvent: false });
    }
  }

  onSend(): void {
    if (!this.canSend()) return;

    const message = this.form.get('message')?.value?.trim();

    // Emit message along with attached files
    this.send.emit({
      message,
      files: [...this.attachedFiles]
    });

    // Reset form and clear attachments
    this.form.reset();
    this.characterCount.set(0);
    this.attachedFiles = [];
  }

  onKeyDown(event: KeyboardEvent): void {
    if (event.key === 'Enter' && !event.shiftKey) {
      event.preventDefault();
      this.onSend();
    }
  }

  isOverLimit(): boolean {
    return this.characterCount() > this.maxLength;
  }

  canSend(): boolean {
    const messageControl = this.form.get('message');
    const hasMessage = !!messageControl?.value?.trim();
    const hasFiles = this.attachedFiles.length > 0;

    return (
      !this.disabled &&
      !this.loading &&
      (hasMessage || hasFiles) &&
      !this.isOverLimit() &&
      messageControl?.valid === true
    );
  }

  onFileSelected(event: Event): void {
    const input = event.target as HTMLInputElement;
    if (!input.files || input.files.length === 0) {
      return;
    }

    const files = Array.from(input.files);

    // Validate file count
    if (this.attachedFiles.length + files.length > this.maxFiles) {
      // Show error - too many files
      // display a toast or some UI feedback here as needed
      this.toast.showError(
        this.translate.instant('chatTpl.error.maxFilesExceeded', { maxFiles: this.maxFiles })
      );
      return;
    }

    // Validate file sizes and add files
    for (const file of files) {
      if (file.size > this.maxFileSize) {
        console.error(`File ${file.name} exceeds maximum size of ${this.formatFileSize(this.maxFileSize)}`);
        continue;
      }

      // Check for duplicates
      if (!this.attachedFiles.some(f => f.name === file.name && f.size === file.size)) {
        this.attachedFiles.push(file);
      }
    }

    // Reset input
    input.value = '';
  }

  removeFile(file: File): void {
    const index = this.attachedFiles.indexOf(file);
    if (index > -1) {
      this.attachedFiles.splice(index, 1);
    }
  }

  formatFileSize(bytes: number): string {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return Math.round(bytes / Math.pow(k, i) * 100) / 100 + ' ' + sizes[i];
  }
}