import { ChatConfig, ChatEndpoints, ChatMessage, ChatSender } from '@features/workflows/templates/utils/tplsInterfaces/chatTpl.interface';
import { CompareConfig, CompareEndpoints, ComparisonResult } from '@features/workflows/templates/utils/tplsInterfaces/compareTpl.interface';
import { SummarizeConfig, SummarizeEndpoints, SummaryResult } from '@features/workflows/templates/utils/tplsInterfaces/summarizeTpl.interface';
import { ExtractConfig, ExtractEndpoints, ExtractionResult } from '@features/workflows/templates/utils/tplsInterfaces/extractTpl.interface';
import { CompareComponent } from '../components/compare/compare.component';
import { SummarizeComponent } from '../components/summarize/summarize.component';
import { ChatComponent } from '../components/chat/chat.component';
import { ExtractComponent } from '../components/extract/extract.component';

/**
 * Type union for all template component instances
 */
export type TemplateComponentInstance = ChatComponent | CompareComponent | SummarizeComponent | ExtractComponent;

/**
 * Result event types
 */
export interface TemplateResult {
  type: TemplateType;
  result: ChatMessage[] | ComparisonResult | SummaryResult | ExtractionResult;
}

/**
 * Template type discriminator
 */
export type TemplateType = 'chat' | 'compare' | 'summarize' | 'extract';

/**
 * Base template configuration
 */
export interface BaseTemplateConfig {
  config?: Partial<ChatConfig | CompareConfig | SummarizeConfig | ExtractConfig>;
  context?: TemplateContext;
}

/**
 * Extract template configuration
 */
export interface ExtractTemplateConfig extends BaseTemplateConfig {
  type: 'extract';
  mode?: 'upload' | 'preloaded';
  result?: ExtractionResult;
  config?: Partial<ExtractConfig>;
  endpoints?: Partial<ExtractEndpoints>;
}

/**
 * Chat template configuration
 */
export interface ChatTemplateConfig extends BaseTemplateConfig {
  type: 'chat';
  initialMessages?: ChatMessage[];
  currentUser?: ChatSender;
  endpoints?: Partial<ChatEndpoints>;
}

/**
 * Compare template configuration
 */
export interface CompareTemplateConfig extends BaseTemplateConfig {
  type: 'compare';
  mode?: 'upload' | 'preloaded';
  result?: ComparisonResult;
  endpoints?: Partial<CompareEndpoints>;
}

/**
 * Summarize template configuration
 */
export interface SummarizeTemplateConfig extends BaseTemplateConfig {
  type: 'summarize';
  mode?: 'upload' | 'preloaded';
  result?: SummaryResult;
  endpoints?: Partial<SummarizeEndpoints>;
}

/**
 * Union type for all template configurations
 */
export type TemplateConfig = ChatTemplateConfig | CompareTemplateConfig | SummarizeTemplateConfig | ExtractTemplateConfig;

/**
 * API Response structure
 */
export interface TemplatePageResponse {
  pageTitle: string;
  pageDescription?: string;
  templates: TemplateConfig[];
  metadata?: {
    version: string;
    lastUpdated: Date;
    environment: string;
    pageId?: string;
  };
}

/**
 * Template rendering context
 */
export interface TemplateContext {
  config: TemplateConfig;
  events?: {
    onSuccess?: (result: ComparisonResult | SummaryResult | ChatMessage[]| ExtractionResult) => void;
    onError?: (error: Error) => void;
    onStarted?: () => void;
    onProgress?: (progress: number) => void;
    onFileUploaded?: (file: File | { name: string; size?: number }) => void;
    onMessageSent?: (content: string) => void;
    onMessageDeleted?: (id: string) => void;
    onMessageEdited?: (event: { id: string; content: string }) => void;
    onCleared?: () => void;
  };
  metadata?: Record<string, unknown>;
}