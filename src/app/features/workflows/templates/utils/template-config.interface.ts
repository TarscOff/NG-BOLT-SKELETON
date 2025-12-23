import { ChatConfig, ChatMessage, ChatSender } from '@features/workflows/templates/utils/tplsInterfaces/chatTpl.interface';
import { CompareConfig, ComparisonResult } from '@features/workflows/templates/utils/tplsInterfaces/compareTpl.interface';
import { SummarizeConfig, SummaryResult } from '@features/workflows/templates/utils/tplsInterfaces/summarizeTpl.interface';
import { ExtractConfig, ExtractionResult } from '@features/workflows/templates/utils/tplsInterfaces/extractTpl.interface';
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
export type TemplateType = 'chat' | 'compare' | 'summarize' | 'extract' | string;

/**
 * Base template configuration
 */
export interface BaseTemplateConfig {
  config?: Partial<ChatConfig | CompareConfig | SummarizeConfig | ExtractConfig>;
  context?: TemplateContext;
  templateId: string;
}

/**
 * Extract template configuration
 */
export interface ExtractTemplateConfig extends BaseTemplateConfig {
  type: TemplateType;
  mode?: 'upload' | 'preloaded';
  result?: ExtractionResult;
  config?: Partial<ExtractConfig>;
}

/**
 * Chat template configuration
 */
export interface ChatTemplateConfig extends BaseTemplateConfig {
  type: TemplateType;
  initialMessages?: ChatMessage[];
  currentUser?: ChatSender;
}

/**
 * Compare template configuration
 */
export interface CompareTemplateConfig extends BaseTemplateConfig {
  type: TemplateType;
  mode?: 'upload' | 'preloaded';
  result?: ComparisonResult;
}

/**
 * Summarize template configuration
 */
export interface SummarizeTemplateConfig extends BaseTemplateConfig {
  type: TemplateType;
  mode?: 'upload' | 'preloaded';
  result?: SummaryResult;
}

/**
 * Union type for all template configurations
 */
export type TemplateConfig = ChatTemplateConfig | CompareTemplateConfig | SummarizeTemplateConfig | ExtractTemplateConfig | null;

/**
 * API Response structure
 */
export interface TemplatePageResponse {
  pageTitle: string;
  pageDescription?: string;
  templates: TemplateConfig[];
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