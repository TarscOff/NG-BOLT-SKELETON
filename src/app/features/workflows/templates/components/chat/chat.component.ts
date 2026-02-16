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
import { catchError, finalize, interval, map, Observable, of, Subject, switchMap, takeUntil, takeWhile, tap } from 'rxjs';
import { TranslateModule, TranslateService } from '@ngx-translate/core';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatTooltipModule } from '@angular/material/tooltip';
import { MatDividerModule } from '@angular/material/divider';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatSelectModule } from '@angular/material/select';
import { MatOptionModule } from '@angular/material/core';
import { MatSidenavModule } from '@angular/material/sidenav';
import { MatMenuModule } from '@angular/material/menu';

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
import {
  ArtifactsDataDto,
  ChatMessageResponseDto,
  FileItem,
  TaskDto,
  WorkflowStatusDto,
} from '@features/projects/interfaces/project.model';
import { ToastService } from '@cadai/pxs-ng-core/services';
import { DateTime } from 'luxon';
import { ProjectsService } from '@features/projects/services/projects.service';

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
    MatDividerModule,
    MatFormFieldModule,
    MatSelectModule,
    MatOptionModule,
    MatSidenavModule,
    MatMenuModule,
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
  private readonly projectService = inject(ProjectsService);
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

  @Input() set chatTemplateId(value: string) {
    this._chatTemplateId.set(value);
  }

  @Input() set fileTemplateId(value: string) {
    this._fileTemplateId.set(value);
  }

  @Input() disabled = false;
  @Input() loading = false;
  @Input() typing = false;

  // ============================================================================
  // OUTPUTS
  // ============================================================================
  @Output() messageSent = new EventEmitter<ChatInputData>();
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
  private readonly _chatTemplateId = signal<string>('');
  private readonly _fileTemplateId = signal<string>('');
  private readonly _workflowStatus = signal<WorkflowStatusDto | null>(null);
  private readonly _isPolling = signal<boolean>(false);
  private readonly _hasRunningWorkflows = signal<boolean>(false);
  private readonly _files = signal<FileItem[]>([]);
  private readonly _artifactsPanelOpen = signal(false);
  private readonly _selectedFileReference = signal<string>('all');
  private readonly _isLoadingArtifacts = signal(false);

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
  chatTemplateId$ = computed(() => this._chatTemplateId());
  fileTemplateId$ = computed(() => this._fileTemplateId());
  workflowStatus$ = computed(() => this._workflowStatus());
  isPolling$ = computed(() => this._isPolling());
  isPreloadedMode$ = computed(() => this._mode().mode === 'preloaded');
  hasRunningWorkflows$ = computed(() => this._hasRunningWorkflows());
  files$ = computed(() => this._files());
  filesCount$ = computed(() => this._files().length);
  artifactsPanelOpen$ = computed(() => this._artifactsPanelOpen());
  selectedFileReference$ = computed(() => this._selectedFileReference());
  isLoadingArtifacts$ = computed(() => this._isLoadingArtifacts());
  groupedFiles$ = computed(() => {
    const filesArray = this._files();
    const groups = new Map<string, FileItem[]>();

    filesArray.forEach(file => {
      const reference = file.extraInfo?.data_reference || 'ungrouped';
      if (!groups.has(reference)) {
        groups.set(reference, []);
      }
      groups.get(reference)!.push(file);
    });

    return Array.from(groups.entries()).map(([reference, files]) => ({
      reference,
      files,
    }));
  });
  availableReferences$ = computed(() => this.groupedFiles$().map(group => group.reference));
  filteredGroupedFiles$ = computed(() => {
    const selected = this._selectedFileReference();
    if (selected === 'all') {
      return this.groupedFiles$();
    }
    return this.groupedFiles$().filter(group => group.reference === selected);
  });
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
      showHistoryArea: true,
      allowEdit: true,
      allowDelete: true,
      maxLength: 4000,
      showInputArea: true,
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

    // Keep related session files synced with active session.
    effect(() => {
      const sessionId = this._sessionId();
      if (!sessionId) {
        this._files.set([]);
        this._selectedFileReference.set('all');
        return;
      }
      this.loadSessionArtifacts();
    });
  }

  // ============================================================================
  // LIFECYCLE HOOKS
  // ============================================================================
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

  ngOnInit(): void {
    this.isDark$ = this.store.select(AppSelectors.ThemeSelectors.selectIsDark);
    this.lang$ = this.store.select(AppSelectors.LangSelectors.selectLang);
    this.loadChatHistory();
    this.checkForRunningWorkflows(); // Check on load
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

  trackFile(index: number, file: FileItem): string {
    return file.id || `${file.name}-${index}`;
  }

  async onSendMessage(data: ChatInputData): Promise<void> {
    if (!this.canSendMessage$()) {
      return;
    }

    const userMessage: ChatMessage = {
      id: this.generateMessageId(),
      content: data.message,
      sender: this._currentUser(),
      attachments: data.files?.map(f => ({
        name: f.name,
        size: f.size,
        type: f.type
      }))
    };

    this._messages.update(msgs => [...msgs, userMessage]);
    this._isTyping.set(true);
    this.messageSent.emit(data);

    // Determine which service method to call based on content type
    let sendMessageObs: Observable<ChatMessageResponseDto>;

    if (data.files && data.files.length > 0) {
      // Handle file uploads
      sendMessageObs = this.chatService.submitArtifacts(
        this.sessionId$(),
        this.fileTemplateId$(),
        data.files
      );
    } else {
      // Handle text messages
      sendMessageObs = this.chatService.sendMessage(
        this.projectId$(),
        this.sessionId$(),
        this.chatTemplateId$(),
        data.message
      );
    }

    sendMessageObs
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: response => {
          this._isTyping.set(false);

          if (response.workflow_instance_id) {
            this._isPolling.set(true);
            this.startPollingWorkflowStatus(response.workflow_instance_id);
          } else {
            console.warn('No workflow_instance_id received from response');
            this.loadSessionArtifacts();
            this.loadChatHistory();
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

  toggleArtifactsPanel(): void {
    const nextOpen = !this._artifactsPanelOpen();
    this._artifactsPanelOpen.set(nextOpen);
    if (nextOpen) {
      this.loadSessionArtifacts();
    }
  }

  closeArtifactsPanel(): void {
    this._artifactsPanelOpen.set(false);
  }

  onFileReferenceChange(nextValue: string): void {
    this._selectedFileReference.set(nextValue || 'all');
  }

  prettySize(bytes: number): string {
    if (bytes < 1024) return `${bytes} B`;
    const kb = bytes / 1024;
    if (kb < 1024) return `${kb.toFixed(1)} KB`;
    const mb = kb / 1024;
    return `${mb.toFixed(1)} MB`;
  }

  fileIcon(type?: string): string {
    const ext = (type ?? '').toLowerCase();
    if (ext === 'pdf' || ext === 'application/pdf') return 'picture_as_pdf';
    if (ext === 'json' || ext === 'application/json') return 'code';
    if (['png', 'jpg', 'jpeg', 'gif', 'webp', 'svg', 'image'].includes(ext)) return 'image';
    if (['csv', 'xls', 'xlsx'].includes(ext)) return 'table_chart';
    if (['ppt', 'pptx', 'key'].includes(ext)) return 'slideshow';
    if (['doc', 'docx', 'rtf', 'odt', 'txt', 'md'].includes(ext)) return 'description';
    if (['zip', 'rar', '7z', 'tar', 'gz', 'collection_metadata'].includes(ext)) return 'folder_zip';
    if (['mp4', 'avi', 'mov', 'wmv', 'mkv', 'video'].includes(ext)) return 'movie';
    if (['mp3', 'wav', 'flac', 'aac', 'audio'].includes(ext)) return 'audiotrack';
    return 'attach_file';
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

  /**
   * Check for running workflows when component loads
   */
  private checkForRunningWorkflows(): void {
    if (!this.sessionId$()) {
      return;
    }

    this.projectService.getSessionStatusById(this.sessionId$())
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: sessionStatus => {
          // Find all running workflows
          const runningWorkflows = sessionStatus?.workflow_executions?.filter(
            wf => wf.workflow_status === 'running' || wf.workflow_status === 'queued' || wf.workflow_status === 'waiting'
          );

          if (runningWorkflows?.length > 0) {
            // console.log(`Found ${runningWorkflows.length} running workflows on load`);
            this._hasRunningWorkflows.set(true);

            // Start polling for the most recent running workflow
            const mostRecentWorkflow = runningWorkflows.sort((a, b) => {
              const dateA = typeof a.created_on === 'string'
                ? new Date(a.created_on).getTime()
                : a.created_on.toMillis();
              const dateB = typeof b.created_on === 'string'
                ? new Date(b.created_on).getTime()
                : b.created_on.toMillis();
              return dateB - dateA;
            })[0];

            // console.log(`Starting polling for workflow: ${mostRecentWorkflow.workflow_instance_id} (${mostRecentWorkflow.workflow_status})`);
            this.startPollingWorkflowStatus(mostRecentWorkflow.workflow_instance_id);
          } else {
            // console.log('No running workflows found on load');
            this._hasRunningWorkflows.set(false);
            this._workflowStatus.set(null);
          }
        },
        error: err => {
          console.error('Error checking for running workflows:', err);
          this._hasRunningWorkflows.set(false);
          this._workflowStatus.set(null);
        }
      });
  }

  trackByTaskId(index: number, task: TaskDto): string {
    return task.task_id;
  }

  private startPollingWorkflowStatus(workflowInstanceId: string): void {
    const maxNotFoundRetries = 5;
    let notFoundCount = 0;

    this._isPolling.set(true);

    // Set initial state  of this._workflowStatus.set(status);
    this._workflowStatus.set({
      workflow_status: 'queued',
      workflow_instance_id: workflowInstanceId,
      workflow_name: 'Initializing workflow...',
      tasks: [],
      created_on: DateTime.now(),
      updated_on: DateTime.now(),
      completed_on: DateTime.now()
    });

    interval(2000)
      .pipe(
        switchMap(() => {
          return this.projectService.getSessionStatusById(this.sessionId$()).pipe(
            map(sessionStatus => {
              // Check if session is already completed or failed
              if (sessionStatus.status === 'completed' || sessionStatus.status === 'error') {
                return {
                  workflow_status: sessionStatus.status,
                  workflow_instance_id: workflowInstanceId,
                  workflow_name: 'Session completed',
                  tasks: [], // No tasks to show when session is done
                  created_on: DateTime.now(),
                  updated_on: DateTime.now(),
                  completed_on: DateTime.now()
                } as WorkflowStatusDto;
              }

              // Find the specific workflow execution
              const workflowExecution = sessionStatus.workflow_executions.find(
                wf => wf.workflow_instance_id === workflowInstanceId
              );

              if (!workflowExecution) {
                throw { status: 404, message: 'Workflow execution not found in session' };
              }

              // Get ALL tasks from ALL running/pending workflows for display
              const allRunningWorkflows = sessionStatus.workflow_executions.filter(
                wf => wf.workflow_status === 'running' || wf.workflow_status === 'queued' || wf.workflow_status === 'waiting'
              );

              // Include ALL task statuses (pending, running, completed, failed)
              const allActiveTasks = allRunningWorkflows
                .flatMap(wf => wf.tasks?.map(task => ({
                  ...task,
                  workflow_name: wf.workflow_name,
                  workflow_id: wf.workflow_instance_id
                })) || [])
                .sort((a, b) => {
                  const dateA = typeof a.created_on === 'string'
                    ? new Date(a.created_on).getTime()
                    : a.created_on.toMillis();
                  const dateB = typeof b.created_on === 'string'
                    ? new Date(b.created_on).getTime()
                    : b.created_on.toMillis();
                  return dateA - dateB;
                });

              // Return workflow status based on SESSION status
              return {
                workflow_status: sessionStatus.status === 'running' ? 'running' : sessionStatus.status,
                workflow_instance_id: workflowInstanceId,
                workflow_name: workflowExecution.workflow_name,
                tasks: allActiveTasks, // Show all tasks without filtering
                created_on: workflowExecution.created_on,
                updated_on: workflowExecution.updated_on,
                completed_on: workflowExecution.completed_on
              } as WorkflowStatusDto;
            }),
            tap(() => {
              notFoundCount = 0;
            }),
            catchError(err => {
              const is404 = err?.status === 404 ||
                err?.error?.error?.includes('code=404') ||
                err?.error?.message?.includes('no matching operation was found') ||
                err?.message?.includes('Workflow execution not found') ||
                (typeof err === 'string' && err.includes('no matching operation was found'));

              if (is404) {
                notFoundCount++;

                if (notFoundCount >= maxNotFoundRetries) {
                  // console.error('Max retries reached for workflow status');
                  return of({
                    workflow_status: 'error',
                    workflow_instance_id: workflowInstanceId,
                    workflow_name: 'Workflow not found',
                    tasks: [],
                    created_on: DateTime.now(),
                    updated_on: DateTime.now(),
                    completed_on: DateTime.now()
                  } as WorkflowStatusDto);
                }

                return of({
                  workflow_status: 'waiting',
                  workflow_instance_id: workflowInstanceId,
                  workflow_name: 'Initializing workflow...',
                  tasks: [],
                  created_on: DateTime.now(),
                  updated_on: DateTime.now(),
                  completed_on: DateTime.now()
                } as WorkflowStatusDto);
              }

              console.error('Unexpected error while polling (continuing):', err);
              notFoundCount++;

              if (notFoundCount >= maxNotFoundRetries) {
                console.error('Max retries reached due to errors');
                return of({
                  workflow_status: 'error',
                  workflow_instance_id: workflowInstanceId,
                  workflow_name: 'Error occurred',
                  tasks: [],
                  created_on: DateTime.now(),
                  updated_on: DateTime.now(),
                  completed_on: DateTime.now()
                } as WorkflowStatusDto);
              }

              return of({
                workflow_status: 'waiting',
                workflow_instance_id: workflowInstanceId,
                workflow_name: 'Processing...',
                tasks: [],
                created_on: DateTime.now(),
                updated_on: DateTime.now(),
                completed_on: DateTime.now()
              } as WorkflowStatusDto);
            })
          );
        }),
        tap(status => {
          // console.log('Current workflow status:', status.workflow_status);
          // console.log('Setting workflowStatus signal with tasks:', status.tasks.length);
          this._workflowStatus.set(status);
          this._hasRunningWorkflows.set(
            status.workflow_status === 'running' || status.workflow_status === 'waiting' || status.workflow_status === 'queued'
          );
          this.cdr.detectChanges();
          this.scrollToBottom();
        }),
        takeWhile(status => {
          const shouldContinue = status.workflow_status === 'waiting' || status.workflow_status === 'running' || status.workflow_status === 'queued';
          // console.log(`Should continue polling: ${shouldContinue} (session status: ${status.workflow_status})`);
          return shouldContinue;
        }, true),
        takeUntil(this.destroy$),
        finalize(() => {
          // console.log('Polling finalized for workflow:', workflowInstanceId);
          this._isPolling.set(false);
          this._hasRunningWorkflows.set(false);

          setTimeout(() => {
            this._workflowStatus.set(null);
            // Reload messages after workflow completes
            this.loadChatHistory();
            this.loadSessionArtifacts();
          }, 2000);
        })
      )
      .subscribe({
        next: status => {
          if (status.workflow_status === 'completed' || status.workflow_status === 'error') {
            // console.log('Session/Workflow reached final state');
            if (status.workflow_status === 'error') {
              this.toast.showError(this.translate.instant('projects.error.workflow-status-polling-failed'));
            }
          }
        },
        error: err => {
          console.error('Polling subscription error:', err);
          this._isPolling.set(false);
          this._hasRunningWorkflows.set(false);
          this._workflowStatus.set(null);
          this.errorEmitter.emit(err);
        },
        complete: () => {
          // console.log('Polling observable completed for workflow:', workflowInstanceId);
        }
      });
  }

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

  private generateMessageId(): string {
    return `msg-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
  }

  private loadSessionArtifacts(): void {
    const sessionId = this.sessionId$();
    if (!sessionId) {
      this._files.set([]);
      this._selectedFileReference.set('all');
      return;
    }

    this._isLoadingArtifacts.set(true);
    this.projectService.getSessionArtifacts(sessionId)
      .pipe(
        takeUntil(this.destroy$),
        finalize(() => this._isLoadingArtifacts.set(false))
      )
      .subscribe({
        next: artifacts => {
          const files = this.mapToFiles(artifacts ?? []);
          this._files.set(files);
          const current = this._selectedFileReference();
          if (current !== 'all' && !files.some(file => file.extraInfo?.data_reference === current)) {
            this._selectedFileReference.set('all');
          }
        },
        error: err => {
          console.error('Error loading session artifacts:', err);
          this._files.set([]);
          this._selectedFileReference.set('all');
        },
      });
  }

  private mapToFiles(artifacts: ArtifactsDataDto[]): FileItem[] {
    if (!artifacts?.length) {
      return [];
    }
    return artifacts.map(artifact => ({
      id: artifact.artifact_id,
      name: artifact.artifact_name || artifact.artifact_id || 'Untitled File',
      size: artifact.artifact_size,
      type: artifact.artifact_type,
      uploadedAt: DateTime.fromJSDate(new Date(artifact.created_on)),
      extraInfo: artifact,
    }));
  }
}
