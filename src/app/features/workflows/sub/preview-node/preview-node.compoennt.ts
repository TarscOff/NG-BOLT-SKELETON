import { Component, DoCheck, OnInit, inject, signal, computed } from '@angular/core';
import { CommonModule } from '@angular/common';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatTooltipModule } from '@angular/material/tooltip';
import { TranslateModule } from '@ngx-translate/core';
import { DrawFlowBaseNode } from '@ng-draw-flow/core';

import {
  PaletteType,
  RESERVED_KEYS,
  ReservedKeys,
  RunNodeDTO,
  StripReservedShallow,
} from '../../templates/utils/workflow.interface';

import { WfCanvasBus } from '../../templates/utils/wf-canvas-bus';
import { Observable } from 'rxjs';
import { Store } from '@ngrx/store';
import { AppSelectors } from '@cadai/pxs-ng-core/store';
import { ChatComponent } from '@features/workflows/templates/components/chat/chat.component';
import { ComparisonResult } from '@features/workflows/templates/utils/tplsInterfaces/compareTpl.interface';
import { CompareComponent } from '@features/workflows/templates/components/compare/compare.component';
import { SummaryResult } from '@features/workflows/templates/utils/tplsInterfaces/summarizeTpl.interface';
import { SummarizeComponent } from '@features/workflows/templates/components/summarize/summarize.component';
import { ChatMessage } from '@features/workflows/templates/utils/tplsInterfaces/chatTpl.interface';
import { TemplatingService } from '@features/workflows/templates/services/templating.service';
import { CHAT_CONFIG, CHAT_ENDPOINTS, COMPARE_CONFIG, COMPARE_ENDPOINTS, SUMMARIZE_CONFIG, SUMMARIZE_ENDPOINTS, EXTRACT_CONFIG, EXTRACT_ENDPOINTS } from '@features/workflows/templates/utils/constants';
import { ExtractComponent } from '@features/workflows/templates/components/extract/extract.component';
import { ExtractionResult } from '@features/workflows/templates/utils/tplsInterfaces/extractTpl.interface';

@Component({
  selector: 'app-wf-preview-node',
  standalone: true,
  imports: [
    CommonModule,
    MatButtonModule,
    MatIconModule,
    MatTooltipModule,
    TranslateModule,
    ChatComponent,
    CompareComponent,
    SummarizeComponent,
    ExtractComponent
  ],
  styles: [`
    :host { display:block; min-width:320px; max-width:760px; }
    .card { 
      border:2px solid var(--mat-primary,#fff); 
      border-radius:12px; 
      background:var(--md-sys-color-surface,#fff);
      box-shadow:0 6px 24px rgba(0,0,0,.08); 
      overflow:hidden; 
      min-width:700px;
      display: flex;
      flex-direction: column;
      height: 820px;
      max-height: 820px;

      &.collapsed {
        height: auto;
      }
    }
    .card.is-selected {
      outline: 2px solid #42a5f5;
      outline-offset: 5px;
    }
    .hdr { 
      display:flex; 
      align-items:center; 
      gap:.5rem; 
      padding:.5rem .75rem;
      flex-shrink: 0;
    }
    .title { 
      font-weight: 600;
      color: var(--mat-primary, #fff); 
      flex:1 1 auto; 
      white-space:nowrap; 
      overflow:hidden; 
      text-overflow:ellipsis; 
    }
    .body { 
      padding: 0;
      flex: 1;
      display: flex;
      flex-direction: column;
      min-height: 0;
      overflow: hidden;
    }
    .body app-chat-tpl,
    .body app-compare-tpl,
    .body app-summarize-tpl,
    .body app-extract-tpl {
      min-height: 100%;
      flex: 1;
    }
    .no-preview {
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      padding: 48px;
      text-align: center;
      color: var(--mat-sys-on-surface-variant);
      
      mat-icon {
        font-size: 64px;
        width: 64px;
        height: 64px;
        margin-bottom: 16px;
        opacity: 0.5;
      }
      
      p {
        margin: 0;
        font-size: 14px;
      }
    }
  `],
  template: `
    <div class="card" [ngClass]="{'collapsed': collapsed()}" (dblclick)="$event.stopPropagation()" [attr.data-node-id]="nodeId">
      <div class="hdr">
        <mat-icon [color]="(isDark$ | async) ? 'neutral' : 'success'">preview</mat-icon>
        <div class="title">{{ "workflow.runPanel.preview" | translate }} : {{ computedTitle() | translate }}</div>

        <button mat-icon-button (click)="fullscreen()" [matTooltip]="('jump_to_view' | translate) + ' : ' + (computedTitle() | translate)" [color]="(isDark$ | async) ? 'warn' : 'accent'">
          <mat-icon>move_up</mat-icon>
        </button>
        <button mat-icon-button (click)="closePanel()" [matTooltip]="'close' | translate" [color]="(isDark$ | async) ? 'neutral' : 'primary'">
          <mat-icon>close</mat-icon>
        </button>
        <button mat-icon-button (click)="collapsed.set(!collapsed())" [matTooltip]="(collapsed() ? 'untoggle' : 'toggle') | translate" [color]="(isDark$ | async) ? 'neutral' : 'primary'">
          <mat-icon>{{ collapsed() ? 'expand_more' : 'expand_less' }}</mat-icon>
        </button>
      </div>

      @if (!collapsed()) {
        <div class="body">
          @switch (currentComponentType()) {
            @case ('chat') {
              <app-chat-tpl
                [mode]="{ mode: 'preloaded', messages: chatMessages() }"
                [config]="chatConfig()"
                [endpoints]="chatEndpoints()"
              />
            }
            @case ('compare') {
              <app-compare-tpl
                [mode]="{ mode: 'preloaded', result: comparisonResult() }"
                [config]="comparisonConfig()"
                [endpoints]="comparisonEndpoints()"
              />
            }
            @case ('summarize') {
              <app-summarize-tpl
                [mode]="{ mode: 'preloaded', result: summaryResult() }"
                [config]="summarizeConfig()"
                [endpoints]="summarizeEndpoints()"
              />
            }
            @case ('extract') {
              <app-extract-tpl
                [mode]="{ mode: 'preloaded', result: extractionResult() }"
                [config]="extractConfig()"
                [endpoints]="extractEndpoints()"
              />
            }
            @default {
              <div class="no-preview">
                <mat-icon>info</mat-icon>
                <p>{{ 'workflow.runPanel.noPreview' | translate }}</p>
                <p>{{ 'workflow.runPanel.type' | translate }}: {{ dto()?.type || 'unknown' }}</p>
              </div>
            }
          }
        </div>
      }
    </div>
  `
})
export class WfPreviewNodeComponent extends DrawFlowBaseNode implements OnInit, DoCheck {
  private bus = inject(WfCanvasBus);
  private store = inject(Store);
  private templatingService = inject(TemplatingService);

  collapsed = signal<boolean>(false);
  private lastModelRef: unknown = null;
  private lastHashKey = '';

  public isDark$!: Observable<boolean>;

  /**
   * Computed signal to determine which component to display
   */
  currentComponentType = computed(() => {
    const currentDto = this.dto();
    if (!currentDto) return null;

    const type = currentDto.aiType || '';

    switch (type.toLowerCase()) {
      case 'chat':
        return 'chat';
      case 'compare':
        return 'compare';
      case 'summarize':
        return 'summarize';
      case 'extract':
        return 'extract';
      default:
        return null;
    }
  });

  /**
   * Computed signal for chat messages
   */
  chatMessages = computed(() => {
    const currentDto = this.dto();

    // Try to get messages from DTO result
    if (currentDto?.result) {
      // Check if result is an array of chat messages
      if (Array.isArray(currentDto.result) && this.isChatMessageArray(currentDto.result)) {
        return currentDto.result;
      }

      // Check if result has a messages property (alternative structure)
      if (typeof currentDto.result === 'object' && 'messages' in currentDto.result) {
        const messages = currentDto.result?.['messages'];
        if (Array.isArray(messages) && this.isChatMessageArray(messages)) {
          return messages;
        }
      }
    }

    return this.templatingService.getMockChatMessages();
  });

  chatConfig = computed(() => {
    // TODO Map with passed data in the DTO
    const currentDto = this.dto();

    // Try to get messages from DTO result
    if (currentDto?.result) {
      // TODO: implement right logic
    }
    return CHAT_CONFIG;
  });
  chatEndpoints = computed(() => {
    // TODO Map with passed data in the DTO
    const currentDto = this.dto();

    // Try to get messages from DTO result
    if (currentDto?.result) {
      // TODO: implement right logic
    }
    return CHAT_ENDPOINTS;
  });

  /**
   * Computed signal for comparison result
   */
  comparisonResult = computed((): ComparisonResult => {
    const currentDto = this.dto();

    if (currentDto?.result && this.isComparisonResult(currentDto.result)) {
      return currentDto.result as ComparisonResult;
    }

    return this.templatingService.getMockComparisonResult();
  });
  comparisonConfig = computed(() => {
    // TODO Map with passed data in the DTO
    const currentDto = this.dto();

    // Try to get messages from DTO result
    if (currentDto?.result) {
      // TODO: implement right logic
    }
    return COMPARE_CONFIG;
  });
  comparisonEndpoints = computed(() => {
    // TODO Map with passed data in the DTO
    const currentDto = this.dto();

    // Try to get messages from DTO result
    if (currentDto?.result) {
      // TODO: implement right logic
    }
    return COMPARE_ENDPOINTS;
  });

  /**
   * Computed signal for summary result
   */
  summaryResult = computed((): SummaryResult => {
    const currentDto = this.dto();

    if (currentDto?.result && this.isSummaryResult(currentDto.result)) {
      return currentDto.result as SummaryResult;
    }

    return this.templatingService.getMockSummaryResult();
  });
  summarizeConfig = computed(() => {
    // TODO Map with passed data in the DTO
    const currentDto = this.dto();

    // Try to get messages from DTO result
    if (currentDto?.result) {
      // TODO: implement right logic
    }
    return SUMMARIZE_CONFIG;
  });
  summarizeEndpoints = computed(() => {
    // TODO Map with passed data in the DTO
    const currentDto = this.dto();

    // Try to get messages from DTO result
    if (currentDto?.result) {
      // TODO: implement right logic
    }
    return SUMMARIZE_ENDPOINTS;
  });

  /**
   * Computed signal for extraction result
   */
  extractionResult = computed((): ExtractionResult => {
    const currentDto = this.dto();

    if (currentDto?.result && this.isExtractionResult(currentDto.result)) {
      return currentDto.result as ExtractionResult;
    }

    return this.templatingService.getMockExtractionResult();
  });
  extractConfig = computed(() => {
    // TODO Map with passed data in the DTO
    const currentDto = this.dto();

    // Try to get messages from DTO result
    if (currentDto?.result) {
      // TODO: implement right logic
    }
    return EXTRACT_CONFIG;
  });
  extractEndpoints = computed(() => {
    // TODO Map with passed data in the DTO
    const currentDto = this.dto();

    // Try to get messages from DTO result
    if (currentDto?.result) {
      // TODO: implement right logic
    }
    return EXTRACT_ENDPOINTS;
  });

  ngOnInit(): void {
    this.lastModelRef = this.model;
    this.lastHashKey = this.hashKey();
    this.isDark$ = this.store.select(AppSelectors.ThemeSelectors.selectIsDark);
  }

  ngDoCheck(): void {
    const ref = this.model;
    const hk = this.hashKey();
    if (ref !== this.lastModelRef || hk !== this.lastHashKey) {
      this.markForCheck();
      this.lastModelRef = ref;
      this.lastHashKey = hk;
    }
  }

  private coerceModel(raw: unknown): RunNodeDTO {
    const data = (raw ?? {}) as RunNodeDTO;
    const type = (data.type ?? data.aiType ?? 'input') as PaletteType;
    const ports = data.ports;
    return {
      type,
      ports,
      params: this.stripReserved(data.params),
      aiType: data.aiType,
      label: data.label,
      position: data?.['position'],
      result: data?.result,
      error: data?.error,
      logs: data?.logs,
      artifacts: data?.artifacts,
      status: data?.status,
    };
  }

  private get safeModel(): RunNodeDTO {
    return this.coerceModel(this.model);
  }

  dto(): RunNodeDTO | undefined {
    const raw = this.safeModel;
    if (!raw) return undefined;

    return {
      id: raw?.id ?? '',
      type: raw?.type ?? 'action',
      aiType: raw?.aiType,
      label: this.computedTitle(),
      params: raw.params,
      result: raw.result,
      error: raw.error,
      logs: raw.logs,
      artifacts: raw.artifacts,
      status: raw.status,
    };
  }

  computedTitle(): string {
    const raw = this.safeModel;
    return raw?.label ?? (this.safeModel.type || '');
  }

  private hashKey(): string {
    const m = this.safeModel ?? {};
    return [
      m, m?.['data'], m?.params, m?.result, m?.error, m?.logs, m?.artifacts,
      m?.label, m?.type, m?.status
    ].map(x => (x && typeof x === 'object') ? `@${Object.keys(x).length}` : String(x)).join('|');
  }

  private stripReserved<T>(obj: T): StripReservedShallow<T> {
    if (obj === null || typeof obj !== 'object') {
      return obj as StripReservedShallow<T>;
    }
    const RESERVED_SET: ReadonlySet<ReservedKeys> = new Set(RESERVED_KEYS);

    const entries = Object
      .entries(obj as Record<string, unknown>)
      .filter(([k]) => !RESERVED_SET.has(k as ReservedKeys));

    return Object.fromEntries(entries) as StripReservedShallow<T>;
  }

  closePanel(): void {
    this.bus.togglePreviewPanel$.next({
      toggleOff: true,
    });
  }

  fullscreen(): void {
    // Implement fullscreen logic
  }

  /**
   * Type guards
   */
  private isChatMessageArray(arr: unknown[]): arr is ChatMessage[] {
    if (!Array.isArray(arr) || arr.length === 0) {
      return false;
    }

    // Check if first item looks like a ChatMessage
    const first = arr[0];
    return (
      typeof first === 'object' &&
      first !== null &&
      'id' in first &&
      'content' in first &&
      'sender' in first &&
      'timestamp' in first
    );
  }

  private isComparisonResult(obj: unknown): obj is ComparisonResult {
    return (
      typeof obj === 'object' &&
      obj !== null &&
      'file1' in obj &&
      'file2' in obj &&
      'differences' in obj &&
      'similarity' in obj
    );
  }

  private isSummaryResult(obj: unknown): obj is SummaryResult {
    return (
      typeof obj === 'object' &&
      obj !== null &&
      'summary' in obj &&
      'keyPoints' in obj &&
      'wordCount' in obj
    );
  }

  private isExtractionResult(obj: unknown): obj is ExtractionResult {
    return (
      typeof obj === 'object' &&
      obj !== null &&
      'entities' in obj &&
      'totalEntitiesFound' in obj &&
      'status' in obj
    );
  }
}