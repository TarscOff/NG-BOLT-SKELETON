import {
  Component,
  ChangeDetectionStrategy,
  Input,
  Output,
  EventEmitter,
  computed,
  signal,
  OnInit,
} from '@angular/core';
import { CommonModule, DatePipe } from '@angular/common';
import { FormBuilder, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { MatIconModule } from '@angular/material/icon';
import { MatButtonModule } from '@angular/material/button';
import { MatTooltipModule } from '@angular/material/tooltip';
import { TranslateModule, TranslateService } from '@ngx-translate/core';
import { DynamicFormComponent } from '@cadai/pxs-ng-core/shared';
import { FieldConfig } from '@cadai/pxs-ng-core/interfaces';
import { FieldConfigService } from '@cadai/pxs-ng-core/services';
import { ChatMessage } from '../../../utils/tplsInterfaces/chatTpl.interface';

@Component({
  selector: 'app-chat-message-tpl',
  standalone: true,
  imports: [
    CommonModule,
    DatePipe,
    ReactiveFormsModule,
    MatIconModule,
    MatButtonModule,
    MatTooltipModule,
    TranslateModule,
    DynamicFormComponent,
  ],
  templateUrl: './chatMessage.component.html',
  styleUrls: ['./chatMessage.component.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ChatMessageComponent implements OnInit {
  @Input() message!: ChatMessage;
  @Input() currentUserId: string | undefined;

  // Individual config inputs
  @Input() showTimestamp = true;
  @Input() showAvatar = true;
  @Input() allowMarkdown = true;
  @Input() allowEdit = true;
  @Input() allowDelete = true;
  @Input() isDark = false;
  @Input() maxEditLength = 4000;

  @Output() delete = new EventEmitter<string>();
  @Output() edit = new EventEmitter<{ id: string; content: string }>();

  isEditing = signal(false);
  editForm!: FormGroup;
  editFieldConfig: FieldConfig[] = [];

  isCurrentUser = computed(() => {
    return this.message?.sender?.id === this.currentUserId;
  });

  isAssistant = computed(() => {
    return this.message?.sender?.type === 'assistant';
  });

  isSystem = computed(() => {
    return this.message?.sender?.type === 'system';
  });

  canEdit = computed(() => {
    return this.isCurrentUser() && this.allowEdit && !this.isSystem();
  });

  canDelete = computed(() => {
    return this.isCurrentUser() && this.allowDelete && !this.isSystem();
  });

  shouldShowTimestamp = computed(() => {
    return this.showTimestamp && !this.isSystem();
  });

  shouldShowAvatar = computed(() => {
    return this.showAvatar && !this.isSystem();
  });

  constructor(
    private fb: FormBuilder,
    private fieldsConfigService: FieldConfigService,
    private translate: TranslateService
  ) { }

  ngOnInit(): void {
    // Initialize edit form
    this.editForm = this.fb.group({});
    this.editFieldConfig = [
      this.fieldsConfigService.getTextAreaField({
        name: 'editContent',
        label: '',
        placeholder: this.translate.instant('chatTpl.editMessage'),
        showCounter: true,
        maxLength: this.maxEditLength,
        color: 'primary',
        layoutClass: 'primary',
        rows: 3,
        autoResize: true,
        validators: [Validators.maxLength(this.maxEditLength)],
        errorMessages: {
          maxlength: this.translate.instant('form.errors.textarea.maxlength', {
            requiredLength: this.maxEditLength,
          }),
        },
      }),
    ];
  }

  startEdit(): void {
    if (!this.canEdit()) return;

    this.editForm.patchValue({ editContent: this.message.content });
    this.isEditing.set(true);
  }

  cancelEdit(): void {
    this.isEditing.set(false);
    this.editForm.reset();
  }


  onEditKeyDown(event: KeyboardEvent): void {
    // Allow Shift+Enter for new lines
    if (event.shiftKey) {
      return;
    }

    // Enter alone saves the edit
    event.preventDefault();
    this.saveEdit();
  }

  saveEdit(): void {
    if (!this.canEdit()) return;

    const content = this.editForm.get('editContent')?.value?.trim();
    if (content && content !== this.message.content && this.editForm.valid) {
      this.edit.emit({ id: this.message.id, content });
    }
    this.isEditing.set(false);
    this.editForm.reset();
  }

  onDelete(): void {
    if (!this.canDelete()) return;

    this.delete.emit(this.message.id);
  }

  getAvatarText(): string {
    if (!this.message?.sender?.name) return '?';
    return this.message.sender.name.charAt(0).toUpperCase();
  }

  getMessageClasses(): string {
    const classes = ['chat-message'];
    if (this.isCurrentUser()) classes.push('current-user');
    if (this.isAssistant()) classes.push('assistant');
    if (this.isSystem()) classes.push('system');
    if (this.isDark) classes.push('dark-theme');
    return classes.join(' ');
  }

  shouldRenderMarkdown(): boolean {
    return this.allowMarkdown &&
      this.message.type === 'markdown' &&
      !this.isEditing();
  }

  shouldRenderCode(): boolean {
    return this.message.type === 'code' && !this.isEditing();
  }

  shouldRenderPlainText(): boolean {
    return !this.shouldRenderMarkdown() &&
      !this.shouldRenderCode() &&
      !this.isEditing();
  }
}