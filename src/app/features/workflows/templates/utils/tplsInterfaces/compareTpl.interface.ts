import { FileVM } from '@cadai/pxs-ng-core/interfaces';

export interface CompareFile extends FileVM {
  url?: string;
  uploadDate?: Date;
  file?: File;
}

export interface ComparisonResult {
  id: string;
  file1: CompareFile;
  file2: CompareFile;
  differences: ComparisonDifference[];
  similarity: number;
  status: 'pending' | 'processing' | 'completed' | 'failed';
  createdAt: Date;
  completedAt?: Date;
  error?: string;
}

export interface ComparisonDifference {
  id: string;
  type: 'added' | 'removed' | 'modified';
  section: string;
  file1Content?: string;
  file2Content?: string;
  lineNumber?: number;
  description: string;
}

export interface CompareConfig {
  allowedFileTypes?: string[];
  maxFileSize?: number; // in bytes
}
export interface CompareMode {
  mode: 'upload' | 'preloaded';
  result?: ComparisonResult;
}

export interface CompareUploadRequest {
  file1: File;
  file2: File;
  metadata?: Record<string, unknown>;
}

export interface CompareStartRequest {
  file1Key: string;
  file2Key: string;
}

export interface CompareUploadResponse {
  file1: CompareFile;
  file2: CompareFile;
  uploadTimestamp: Date;
}

export interface CompareStatusResponse {
  comparisonId: string;
  status: 'pending' | 'processing' | 'completed' | 'failed';
  progress?: number;
  result?: ComparisonResult;
}
