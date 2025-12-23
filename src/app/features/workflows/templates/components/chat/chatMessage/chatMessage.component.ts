import {
  Component,
  ChangeDetectionStrategy,
  Input,
  Output,
  EventEmitter,
  computed,
  signal,
  OnInit,
  inject,
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
import { marked } from 'marked';
import { DomSanitizer, SafeHtml } from '@angular/platform-browser';
import hljs from 'highlight.js';
import { Clipboard } from '@angular/cdk/clipboard';
import { Store } from '@ngrx/store';
import { Observable } from 'rxjs';
import { AppSelectors } from '@cadai/pxs-ng-core/store';

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
    return this.message?.sender?.type === 'user';
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

  private clipboard = inject(Clipboard);
  private store = inject(Store);
  
  isDark$!: Observable<boolean>;
  copied = signal(false);

  constructor(
    private fb: FormBuilder,
    private fieldsConfigService: FieldConfigService,
    private translate: TranslateService,
    private sanitizer: DomSanitizer
  ) {
    marked.use({
      breaks: true,
      gfm: true,
      renderer: {
        code(token) {
          const code = token.text;
          const language = token.lang;
          const validLanguage = language && hljs.getLanguage(language) ? language : 'plaintext';
          try {
            const highlighted = hljs.highlight(code, { language: validLanguage }).value;
            return `<pre><code class="hljs language-${validLanguage}">${highlighted}</code></pre>`;
          } catch (err) {
            console.error('Highlight error:', err);
            return `<pre><code class="hljs">${code}</code></pre>`;
          }
        }
      }
    });

  }

  ngOnInit(): void {
    this.isDark$ = this.store.select(AppSelectors.ThemeSelectors.selectIsDark);

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

  getParsedContent(): SafeHtml {
    if (!this.message?.content) return '';

    try {
      if (this.shouldRenderMarkdown()) {
        const parsed = marked.parse(this.message.content) as string;
        return this.sanitizer.sanitize(1, parsed) || '';
      }
      return this.message.content;
    } catch (error) {
      console.error('Error parsing markdown:', error);
      return this.message.content;
    }
  }

  shouldRenderMarkdown(): boolean {
    return (this.allowMarkdown || this.message.type === 'markdown' || this.message.type === 'mixed') &&
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

  getFileIcon(name: string, type?: string): string {
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

  formatFileSize(bytes: number): string {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return Math.round(bytes / Math.pow(k, i) * 100) / 100 + ' ' + sizes[i];
  }

  copyToClipboard(textContent: string | SafeHtml): void {
    if (textContent) {
      const success = this.clipboard.copy(textContent.toString());

      if (success) {
        this.copied.set(true);
        setTimeout(() => this.copied.set(false), 2000);
      }
    }
  }

  isFromUser(): boolean {
    return this.message?.sender?.type === 'user';
  }
}