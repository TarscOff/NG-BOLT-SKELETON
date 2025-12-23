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
  AfterViewInit,
  ChangeDetectorRef,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { ReactiveFormsModule } from '@angular/forms';
import { Store } from '@ngrx/store';
import { catchError, finalize, interval, Observable, of, Subject, switchMap, takeUntil, takeWhile, tap } from 'rxjs';
import { TranslateModule, TranslateService } from '@ngx-translate/core';
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
  ChatInputData,
} from '../../utils/tplsInterfaces/chatTpl.interface';
import { AppSelectors } from '@cadai/pxs-ng-core/store';
import { WorkflowStatusDto } from '@features/projects/interfaces/project.model';
import { ToastService } from '@cadai/pxs-ng-core/services';

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
export class ChatComponent implements OnInit, OnDestroy, AfterViewInit {
  // ============================================================================
  // DEPENDENCY INJECTION
  // ============================================================================
  private readonly store = inject(Store);
  private readonly chatService = inject(ChatService);
  private readonly cdr = inject(ChangeDetectorRef);
  private readonly toast = inject(ToastService);
  private readonly translate = inject(TranslateService);

  // ============================================================================
  // VIEW CHILDREN
  // ============================================================================
  @ViewChild('messagesContainer') messagesContainer?: ElementRef;

  // ============================================================================
  // INPUTS
  // ============================================================================
  @Input() set mode(value: ChatMode) {
    this._mode.set(value);
    if (value.mode === 'preloaded' && value.messages) {
      this._messages.set(value.messages);
    }
  }

  @Input() set config(value: Partial<ChatConfig>) {
    this._config.set({ ...this.defaultConfig, ...value });
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

  @Input() set projectId(value: string) {
    this._projectId.set(value);
  }

  @Input() set sessionId(value: string) {
    this._sessionId.set(value);
  }

  @Input() set templateId(value: string) {
    this._templateId.set(value);
  }

  @Input() disabled = false;
  @Input() loading = false;
  @Input() typing = false;

  // ============================================================================
  // OUTPUTS
  // ============================================================================
  @Output() messageSent = new EventEmitter<string>();
  @Output() messageDeleted = new EventEmitter<string>();
  @Output() messageEdited = new EventEmitter<{ id: string; content: string }>();
  @Output() chatCleared = new EventEmitter<void>();
  @Output() errorEmitter = new EventEmitter<Error>();
  @Output() attachmentUploaded = new EventEmitter<{ url: string; filename: string }>();

  // ============================================================================
  // PUBLIC PROPERTIES
  // ============================================================================
  isDark$!: Observable<boolean>;
  lang$!: Observable<string>;

  // ============================================================================
  // PRIVATE SIGNALS
  // ============================================================================
  private readonly _mode = signal<ChatMode>({ mode: 'interactive' });
  private readonly _config = signal<ChatConfig>(this.defaultConfig);
  private readonly _messages = signal<ChatMessage[]>([]);
  private readonly _currentUser = signal<ChatSender>(this.defaultUser);
  private readonly _isTyping = signal<boolean>(false);
  private readonly _isLoading = signal<boolean>(false);
  private readonly _projectId = signal<string>('');
  private readonly _sessionId = signal<string>('');
  private readonly _templateId = signal<string>('');
  private readonly _workflowStatus = signal<WorkflowStatusDto | null>(null);
  private readonly _isPolling = signal<boolean>(false);

  // ============================================================================
  // PRIVATE PROPERTIES
  // ============================================================================
  private readonly destroy$ = new Subject<void>();
  private intersectionObserver?: IntersectionObserver;

  // ============================================================================
  // PUBLIC COMPUTED SIGNALS
  // ============================================================================
  mode$ = computed(() => this._mode());
  config$ = computed(() => this._config());
  messages$ = computed(() => this._messages());
  currentUser$ = computed(() => this._currentUser());
  isTyping$ = computed(() => this._isTyping());
  isLoading$ = computed(() => this._isLoading());
  projectId$ = computed(() => this._projectId());
  sessionId$ = computed(() => this._sessionId());
  templateId$ = computed(() => this._templateId());
  workflowStatus$ = computed(() => this._workflowStatus());
  isPolling$ = computed(() => this._isPolling());
  isPreloadedMode$ = computed(() => this._mode().mode === 'preloaded');

  effectiveMaxLength$ = computed(() => {
    const config = this._config();
    return config.maxLength ?? config.maxMessageLength ?? 4000;
  });

  effectivePlaceholder$ = computed(() => {
    const config = this._config();
    return config.placeholder ?? 'chatTpl.placeholder';
  });

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

    if (disabled) return false;
    if (mode.mode === 'preloaded') {
      return config.allowEdit !== false && config.allowDelete !== false;
    }
    return true;
  });

  // ============================================================================
  // PRIVATE GETTERS
  // ============================================================================
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

  // ============================================================================
  // CONSTRUCTOR
  // ============================================================================
  constructor() {
    // Auto-scroll effect
    effect(() => {
      const messages = this._messages();
      const config = this._config();

      if (config.autoScroll && messages.length > 0) {
        setTimeout(() => this.scrollToBottom(), 300);
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

  // ============================================================================
  // LIFECYCLE HOOKS
  // ============================================================================
  ngOnInit(): void {
    this.isDark$ = this.store.select(AppSelectors.ThemeSelectors.selectIsDark);
    this.lang$ = this.store.select(AppSelectors.LangSelectors.selectLang);
    this.loadChatHistory();
  }

  ngAfterViewInit(): void {
    setTimeout(() => {
      this.scrollToBottom();
    }, 100);
    this.setupVisibilityObserver();
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
    this.intersectionObserver?.disconnect();
  }

  // ============================================================================
  // PUBLIC METHODS
  // ============================================================================
  loadChatHistory(): void {
    if (this.mode$().mode !== 'interactive') {
      return;
    }
    this._isLoading.set(true);

    this.chatService
      .getChatHistory(this.sessionId$())
      .then((messages) => {
        this._isLoading.set(false);
        this._messages.set(messages);
      })
      .catch(err => {
        this._isLoading.set(false);
        console.error('Error loading chat history:', err);
        this.errorEmitter.emit(err);
      });
  }

  isEmpty(): boolean {
    return this._messages().length === 0;
  }

  trackByMessageId(index: number, message: ChatMessage): string {
    return message.id;
  }

  async onSendMessage(data: ChatInputData): Promise<void> {
    if (!this.canSendMessage$()) {
      return;
    }

    const userMessage: ChatMessage = {
      id: this.generateMessageId(),
      content: data.message,
      sender: this._currentUser(),
      timestamp: new Date(),
      attachments: data.files.map(f => ({
        name: f.name,
        size: f.size,
        type: f.type
      }))
    };

    this._messages.update(msgs => [...msgs, userMessage]);
    this.messageSent.emit(data.message);
    this._isTyping.set(true);

    const sendMessage = await this.chatService
      .sendMessage(
        this.projectId$(),
        this.sessionId$(),
        this.templateId$(),
        data.message,
        data.files
      );

    sendMessage
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: response => {
          this._isTyping.set(false);

          if (response.workflow_instance_id) {
            this._isPolling.set(true);

            this.startPollingWorkflowStatus(response.workflow_instance_id);
          } else {
            console.warn('No workflow_instance_id received from response');
          }
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
      .deleteMessage(messageId)
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
      .editMessage(messageId, content)
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

  // ============================================================================
  // PRIVATE METHODS
  // ============================================================================
  private setupVisibilityObserver(): void {
    if (!this.messagesContainer?.nativeElement) {
      return;
    }

    this.intersectionObserver = new IntersectionObserver(
      (entries) => {
        entries.forEach(entry => {
          if (entry.isIntersecting) {
            setTimeout(() => {
              this.scrollToBottom();
              this.cdr.detectChanges();
            }, 100);
          }
        });
      },
      { threshold: 0.1 }
    );

    this.intersectionObserver.observe(this.messagesContainer.nativeElement);
  }

  private startPollingWorkflowStatus(workflowInstanceId: string): void {

    const maxNotFoundRetries = 5;

    let notFoundCount = 0;

    interval(2000)
      .pipe(
        switchMap(() => {
          this.cdr.detectChanges();
          this.scrollToBottom();
          //console.log(`Polling attempt ${notFoundCount + 1} for workflow:`, workflowInstanceId);
          return this.chatService.getChatStatus(workflowInstanceId).pipe(
            tap(() => {
              //console.log('Received workflow status:', status);
              notFoundCount = 0;
            }),
            catchError(err => {
              //console.log('Error caught in polling:', err);

              const is404 = err?.status === 404 ||
                err?.error?.error?.includes('code=404') ||
                err?.error?.message?.includes('no matching operation was found') ||
                (typeof err === 'string' && err.includes('no matching operation was found'));

              if (is404) {
                notFoundCount++;
                //console.log(`Workflow not found yet (${notFoundCount}/${maxNotFoundRetries}), continuing to poll...`);

                if (notFoundCount >= maxNotFoundRetries) {
                  //console.error('Max retries reached for workflow status');
                  return of({
                    workflow_status: 'failed',
                    workflow_instance_id: workflowInstanceId,
                    workflow_name: 'Workflow not found',
                    tasks: [],
                    created_on: new Date().toISOString(),
                    updated_on: new Date().toISOString(),
                    completed_on: new Date().toISOString()
                  } as WorkflowStatusDto);
                }

                return of({
                  workflow_status: 'pending',
                  workflow_instance_id: workflowInstanceId,
                  workflow_name: 'Initializing workflow...',
                  tasks: [],
                  created_on: new Date().toISOString(),
                  updated_on: new Date().toISOString(),
                  completed_on: ''
                } as WorkflowStatusDto);
              }

              //console.error('Unexpected error while polling (continuing):', err);
              notFoundCount++;

              if (notFoundCount >= maxNotFoundRetries) {
                console.error('Max retries reached due to errors');
                return of({
                  workflow_status: 'failed',
                  workflow_instance_id: workflowInstanceId,
                  workflow_name: 'Error occurred',
                  tasks: [],
                  created_on: new Date().toISOString(),
                  updated_on: new Date().toISOString(),
                  completed_on: new Date().toISOString()
                } as WorkflowStatusDto);
              }

              return of({
                workflow_status: 'pending',
                workflow_instance_id: workflowInstanceId,
                workflow_name: 'Processing...',
                tasks: [],
                created_on: new Date().toISOString(),
                updated_on: new Date().toISOString(),
                completed_on: ''
              } as WorkflowStatusDto);
            })
          );
        }),
        tap(status => {
          //console.log('Current workflow status:', status.workflow_status);
          this._workflowStatus.set(status);
        }),
        takeWhile(status => {
          const shouldContinue = status.workflow_status === 'pending' || status.workflow_status === 'running';
          //console.log(`Should continue polling: ${shouldContinue} (status: ${status.workflow_status})`);
          return shouldContinue;
        }, true),
        takeUntil(this.destroy$),
        finalize(() => {
          //console.log('Polling finalized');
          this._isPolling.set(false);
          setTimeout(() => {
            this._workflowStatus.set(null);
          }, 3000);
        })
      )
      .subscribe({
        next: status => {
          //console.log('Status emitted:', status);

          if (status.workflow_status === 'completed' || status.workflow_status === 'failed') {
            //console.log('Workflow reached final state, handling completion');
            if (status.workflow_status === 'failed') {
              this.toast.showError(this.translate.instant('projects.error.workflow-status-polling-failed'));
            }
            this.handleWorkflowCompletion(status);
          }
        },
        error: err => {
          //console.error('Polling subscription error (should not happen):', err);
          this._isPolling.set(false);
          this._workflowStatus.set(null);
          this.errorEmitter.emit(err);
        },
        complete: () => {
          //console.log('Polling observable completed');
        }
      });
  }

  private async handleWorkflowCompletion(status: WorkflowStatusDto): Promise<void> {
    const allTasksCompleted = status.tasks.every(task =>
      task.task_status === 'completed' || task.task_status === 'failed'
    );

    if (status.workflow_status === 'completed' && allTasksCompleted) {
      const previousMessages = [...this._messages()];

      try {
        const updatedMessages = await this.chatService.getChatHistory(this.sessionId$());
        console.log("here",updatedMessages)
        if (this.hasMessagesChanged(previousMessages, updatedMessages)) {
          this._messages.set(updatedMessages);
        }
      } catch (err) {
        console.error('Error reloading chat history after workflow completion:', err);
        this.errorEmitter.emit(err as Error);

      }
    }

    this._workflowStatus.set(null);
  }

  private hasMessagesChanged(previous: ChatMessage[], updated: ChatMessage[]): boolean {
    if (previous.length !== updated.length) {
      return true;
    }

    return updated.some((msg, index) => {
      const prevMsg = previous[index];
      return !prevMsg ||
        prevMsg.content !== msg.content ||
        prevMsg.sender.name !== msg.sender.name ||
        JSON.stringify(prevMsg.attachments) !== JSON.stringify(msg.attachments);
    });
  }

  private generateMessageId(): string {
    return `msg-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
  }
}