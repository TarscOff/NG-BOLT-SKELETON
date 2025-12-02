export interface ChatMessage {
  id: string;
  content: string;
  sender: ChatSender;
  timestamp: Date;
  type?: 'text' | 'markdown' | 'code';
  avatar?: string;
  metadata?: Record<string, unknown>;
  edited?: boolean;
}

export interface ChatSender {
  id: string;
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
  
  // UI Messages
  emptyStateMessage?: string;
  
  // Advanced Options
  maxMessageLength?: number;
}

export interface ChatMode {
  mode: 'interactive' | 'preloaded';
  messages?: ChatMessage[];
}


export interface ChatEndpoints {
  sendMessage: string;
  getMessages: string;
  deleteMessage: string;
  editMessage: string;
  clearChat: string;
  uploadAttachment: string;
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