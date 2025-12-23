export interface ChatMessage {
  id: string;
  content: string;
  sender: ChatSender;
  timestamp?: Date;
  type?: 'text' | 'markdown' | 'code' | "mixed";
  avatar?: string;
  metadata?: Record<string, unknown>;
  edited?: boolean;
  attachments?: {
    name: string;
    size: number;
    type: string;
  }[];
}

export interface ChatSender {
  id?: string;
  name: string;
  type: 'user' | 'assistant' | 'system';
  avatar?: string;
}

export interface ChatConfig {
  // Display Options
  showTimestamps?: boolean;
  showAvatars?: boolean;
  allowMarkdown?: boolean;
  
  // Interaction Options
  allowEdit?: boolean;
  allowDelete?: boolean;
  autoScroll?: boolean;
  
  // Input Options
  maxLength?: number;
  placeholder?: string;

  enableAttachments?: boolean;
  acceptedFileTypes?: string;
  maxFileSize?: number;
  maxFiles?: number;
  // UI Messages
  emptyStateMessage?: string;
  
  // Advanced Options
  maxMessageLength?: number;
}

export interface ChatMode {
  mode: 'interactive' | 'preloaded';
  messages?: ChatMessage[];
}

export interface ChatSendRequest {
  content: string;
  sender: ChatSender;
  metadata?: Record<string, unknown>;
}

export interface ChatSendResponse {
  userMessage: ChatMessage;
  assistantMessage: ChatMessage;
  timestamp: Date;
}

export interface ChatMessagesResponse {
  messages: ChatMessage[];
  total: number;
  hasMore: boolean;
}

export interface ChatInputData {
  message: string;
  files: File[];
}