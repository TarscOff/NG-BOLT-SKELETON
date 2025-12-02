import { FileVM } from '@cadai/pxs-ng-core/interfaces';

export interface SummarizeFile extends FileVM {
  url?: string;
  uploadDate?: Date;
  file?: File;
}

export interface SummaryResult {
  id: string;
  files: SummarizeFile[];
  summary: string;
  keyPoints: string[];
  wordCount: {
    original: number;
    summary: number;
    reduction: number; // percentage
  };
  style: SummaryStyle;
  length: SummaryLength;
  language: string;
  status: 'pending' | 'processing' | 'completed' | 'failed';
  createdAt: Date;
  completedAt?: Date;
  error?: string;
}

export type SummaryLength = 'short' | 'medium' | 'long';
export type SummaryStyle = 'bullets' | 'paragraph' | 'executive';

export interface SummarizeConfig {
  allowedFileTypes?: string[];
  maxFileSize?: number;
  maxFiles?: number;
}

export interface SummarizeMode {
  mode: 'upload' | 'preloaded';
  result?: SummaryResult;
}

export interface SummarizeUploadRequest {
  files: File[];
  metadata?: Record<string, unknown>;
}

export interface SummarizeStartRequest {
  fileKeys: string[];
  options?: {
    style?: SummaryStyle;
    length?: SummaryLength;
    language?: string;
    includeKeyPoints?: boolean;
    maxKeyPoints?: number;
  };
}

export interface SummarizeUploadResponse {
  files: SummarizeFile[];
  uploadTimestamp: Date;
}

export interface SummarizeStatusResponse {
  summaryId: string;
  status: 'pending' | 'processing' | 'completed' | 'failed';
  progress?: number;
  result?: SummaryResult;
}

export interface SummarizeEndpoints {
  uploadFile: string;         // POST - Upload file for summarization
  startSummarization: string; // POST - Start summarization process
  getSummary: string;         // GET - Get summary result by ID
  cancelSummary: string;      // DELETE - Cancel ongoing summarization
  exportSummary: string;      // POST - Export summary result
}