import {
  Component,
  ChangeDetectionStrategy,
  Input,
  Output,
  EventEmitter,
  OnInit,
  OnDestroy,
  ViewChild,
  ElementRef,
  signal,
  computed,
  effect,
  inject,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { ReactiveFormsModule } from '@angular/forms';
import { Store } from '@ngrx/store';
import { Observable, Subject, takeUntil } from 'rxjs';
import { TranslateModule } from '@ngx-translate/core';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatTooltipModule } from '@angular/material/tooltip';

import { ChatService } from '../../services/chat.service';
import { ChatInputComponent } from './chatInput/chatInput.component';
import { ChatMessageComponent } from './chatMessage/chatMessage.component';
import {
  ChatMessage,
  ChatSender,
  ChatMode,
  ChatConfig,
  ChatEndpoints,
} from '../../utils/tplsInterfaces/chatTpl.interface';
import { AppSelectors } from '@cadai/pxs-ng-core/store';

@Component({
  selector: 'app-chat-tpl',
  standalone: true,
  imports: [
    CommonModule,
    ReactiveFormsModule,
    TranslateModule,
    MatButtonModule,
    MatIconModule,
    MatProgressSpinnerModule,
    MatTooltipModule,
    ChatMessageComponent,
    ChatInputComponent,
  ],
  templateUrl: './chat.component.html',
  styleUrls: ['./chat.component.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ChatComponent implements OnInit, OnDestroy {
  private store = inject(Store);
  private chatService = inject(ChatService);
  private destroy$ = new Subject<void>();

  @ViewChild('messagesContainer') messagesContainer?: ElementRef;

  // Inputs
  @Input() set mode(value: ChatMode) {
    this._mode.set(value);
    if (value.mode === 'preloaded' && value.messages) {
      this._messages.set(value.messages);
    }
  }

  @Input() set config(value: Partial<ChatConfig>) {
    this._config.set({ ...this.defaultConfig, ...value });
    // Update service configuration when config changes
    this.updateServiceConfig();
  }

  @Input() set currentUser(value: ChatSender) {
    this._currentUser.set(value);
  }

  get currentUser() {
    return this._currentUser();
  }

  @Input() set initialMessages(value: ChatMessage[]) {
    if (value && value.length > 0) {
      this._messages.set(value);
    }
  }

  @Input() set endpoints(value: Partial<ChatEndpoints>) {
    this._endpoints.set(value);
    this.updateServiceConfig();
  }

  @Input() disabled = false;
  @Input() loading = false;
  @Input() typing = false;

  // Outputs
  @Output() messageSent = new EventEmitter<string>();
  @Output() messageDeleted = new EventEmitter<string>();
  @Output() messageEdited = new EventEmitter<{ id: string; content: string }>();
  @Output() chatCleared = new EventEmitter<void>();
  @Output() errorEmitter = new EventEmitter<Error>();
  @Output() attachmentUploaded = new EventEmitter<{ url: string; filename: string }>();

  // Signals
  private _mode = signal<ChatMode>({ mode: 'interactive' });
  private _config = signal<ChatConfig>(this.defaultConfig);
  private _messages = signal<ChatMessage[]>([]);
  private _currentUser = signal<ChatSender>(this.defaultUser);
  private _endpoints = signal<Partial<ChatEndpoints>>({});
  private _isTyping = signal<boolean>(false);
  private _isLoading = signal<boolean>(false);

  // Computed
  mode$ = computed(() => this._mode());
  config$ = computed(() => this._config());
  messages$ = computed(() => this._messages());
  currentUser$ = computed(() => this._currentUser());
  endpoints$ = computed(() => this._endpoints());
  isTyping$ = computed(() => this._isTyping());
  isLoading$ = computed(() => this._isLoading());

  isPreloadedMode$ = computed(() => this._mode().mode === 'preloaded');

  // Use maxLength OR maxMessageLength (maxLength takes priority)
  effectiveMaxLength$ = computed(() => {
    const config = this._config();
    return config.maxLength ?? config.maxMessageLength ?? 4000;
  });

  // Use config placeholder or default
  effectivePlaceholder$ = computed(() => {
    const config = this._config();
    return config.placeholder ?? 'chatTpl.placeholder';
  });

  // Use config empty message or default
  effectiveEmptyMessage$ = computed(() => {
    const config = this._config();
    return config.emptyStateMessage ?? 'chatTpl.empty';
  });

  canSendMessage$ = computed(() => {
    const isLoading = this._isLoading();
    const isTyping = this._isTyping();
    const disabled = this.disabled;

    return !isLoading && !isTyping && !disabled;
  });

  canEditDelete$ = computed(() => {
    const mode = this._mode();
    const config = this._config();
    const disabled = this.disabled;

    if(disabled) return false;
    if (mode.mode === 'preloaded') {
      return config.allowEdit !== false && config.allowDelete !== false;
    }

    return true;
  });

  isDark$!: Observable<boolean>;
  lang$!: Observable<string>;

  private get defaultConfig(): ChatConfig {
    return {
      showTimestamps: true,
      showAvatars: true,
      allowMarkdown: true,
      allowEdit: true,
      allowDelete: true,
      maxLength: 4000,
      placeholder: 'chatTpl.placeholder',
      emptyStateMessage: 'chatTpl.emptyState',
      enableAttachments: false,
      autoScroll: true,
    };
  }

  private get defaultUser(): ChatSender {
    return {
      id: 'user-1',
      name: 'You',
      type: 'user',
    };
  }

  constructor() {
    // Auto-scroll effect
    effect(() => {
      const messages = this._messages();
      const config = this._config();

      if (config.autoScroll && messages.length > 0) {
        setTimeout(() => this.scrollToBottom(), 100);
      }
    });

    // Sync typing state
    effect(() => {
      this.typing = this._isTyping();
    });

    // Sync loading state
    effect(() => {
      this.loading = this._isLoading();
    });
  }

  ngOnInit(): void {
    this.isDark$ = this.store.select(AppSelectors.ThemeSelectors.selectIsDark);
    this.lang$ = this.store.select(AppSelectors.LangSelectors.selectLang);

    // Configure service with initial config
    this.updateServiceConfig();
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
  }

  private updateServiceConfig(): void {
    this.chatService.configure({
      endpoints: this._endpoints(),
      config: this._config(),
    });
  }

  isEmpty(): boolean {
    return this._messages().length === 0;
  }

  trackByMessageId(index: number, message: ChatMessage): string {
    return message.id;
  }

  onSendMessage(content: string): void {
    console.log("here1")
    if (!this.canSendMessage$()) {
      return;
    }

    const userMessage: ChatMessage = {
      id: this.generateMessageId(),
      content,
      sender: this._currentUser(),
      timestamp: new Date(),
    };

    this._messages.update(msgs => [...msgs, userMessage]);
    this.messageSent.emit(content);
    this._isTyping.set(true);

    const endpoints = {
      ...this._endpoints(),
    };
    console.log("here2",endpoints)

    this.chatService
      .sendMessage(
        {
          content,
          sender: this._currentUser(),
        },
        endpoints
      )
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: response => {
          this._isTyping.set(false);
          this._messages.update(msgs => [...msgs, response.assistantMessage]);
        },
        error: err => {
          this._isTyping.set(false);
          console.error('Error sending message:', err);
          this.errorEmitter.emit(err);
        },
      });
  }

  onDeleteMessage(messageId: string): void {
    if (!this.canEditDelete$()) {
      return;
    }

    this._isLoading.set(true);

    this.chatService
      .deleteMessage(messageId, this._endpoints())
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: () => {
          this._isLoading.set(false);
          this._messages.update(msgs => msgs.filter(m => m.id !== messageId));
          this.messageDeleted.emit(messageId);
        },
        error: err => {
          this._isLoading.set(false);
          console.error('Error deleting message:', err);
          this.errorEmitter.emit(err);
        },
      });
  }

onEditMessage(messageId: string, content: string): void {
  if (!this.canEditDelete$()) {
    return;
  }

  this._isLoading.set(true);

  this.chatService
    .editMessage(messageId, content, this._endpoints())
    .pipe(takeUntil(this.destroy$))
    .subscribe({
      next: updated => {
        this._isLoading.set(false);
        this._messages.update(msgs =>
          msgs.map(m =>
            m.id === messageId
              ? { ...m, content, edited: true, ...updated }
              : m
          )
        );
        this.messageEdited.emit({ id: messageId, content });
      },
      error: err => {
        this._isLoading.set(false);
        console.error('Error editing message:', err);
        this.errorEmitter.emit(err);
      },
    });
}

  onAttachmentSelected(file: File): void {
    const config = this._config();
    if (!config.enableAttachments) {
      return;
    }

    this._isLoading.set(true);

    const endpoints = {
      ...this._endpoints(),
    };

    this.chatService
      .uploadAttachment(file, endpoints)
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: result => {
          this._isLoading.set(false);
          this.attachmentUploaded.emit(result);
          
          // Optionally add attachment info as message
          const attachmentMessage: ChatMessage = {
            id: this.generateMessageId(),
            content: `Uploaded: ${result.filename}`,
            sender: this._currentUser(),
            timestamp: new Date(),
            metadata: { attachmentUrl: result.url },
          };
          this._messages.update(msgs => [...msgs, attachmentMessage]);
        },
        error: err => {
          this._isLoading.set(false);
          console.error('Error uploading attachment:', err);
          this.errorEmitter.emit(err);
        },
      });
  }

  clearChat(): void {
    this._messages.set([]);
    this.chatCleared.emit();
  }

  scrollToBottom(): void {
    if (this.messagesContainer?.nativeElement) {
      const element = this.messagesContainer.nativeElement;
      element.scrollTop = element.scrollHeight;
    }
  }

  
  private generateMessageId(): string {
    return `msg-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
  }
}