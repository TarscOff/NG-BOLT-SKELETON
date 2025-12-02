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
import { FieldConfigService } from '@cadai/pxs-ng-core/services';

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

  @Output() send = new EventEmitter<string>();
  @Output() attachmentSelected = new EventEmitter<File>();

  form!: FormGroup;
  fieldConfig: FieldConfig[] = [];
  characterCount = signal(0);

  constructor(
    private fb: FormBuilder,
    private fieldsConfigService: FieldConfigService,
    private translate: TranslateService
  ) {}

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
        autoResize: true,
        disabled: this.disabled || this.loading,
        validators: [Validators.maxLength(this.maxLength)],
        errorMessages: {
          maxlength: this.translate.instant('form.errors.textarea.maxlength', {
            requiredLength: this.maxLength,
          }),
        },
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
    if (!message) return;

    this.send.emit(message);
    this.form.reset();
    this.characterCount.set(0);
  }

  onKeyDown(event: KeyboardEvent): void {
    if (event.key === 'Enter' && !event.shiftKey) {
      event.preventDefault();
      this.onSend();
    }
  }

  onFileSelected(event: Event): void {
    if (!this.enableAttachments) return;

    const input = event.target as HTMLInputElement;
    if (input.files && input.files.length > 0) {
      const file = input.files[0];
      this.attachmentSelected.emit(file);
      input.value = ''; // Reset input
    }
  }

  isOverLimit(): boolean {
    return this.characterCount() > this.maxLength;
  }

  canSend(): boolean {
    const messageControl = this.form.get('message');
    return (
      !this.disabled &&
      !this.loading &&
      !!messageControl?.value?.trim() &&
      !this.isOverLimit() &&
      messageControl.valid
    );
  }
}