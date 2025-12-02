import { FileVM } from "@cadai/pxs-ng-core/interfaces";

// Mode definition
export type ExtractMode =
  | { mode: 'upload' }
  | { mode: 'preloaded'; result: ExtractionResult };

// Configuration interface
export interface ExtractConfig {
  allowedFileTypes?: string[];
  maxFileSize?: number;
  maxFiles?: number;
}

// Endpoints interface
export interface ExtractEndpoints {
  uploadExtract?: string;
  startExtract?: string;
  statusExtract?: string;
  cancelExtract?: string;
  exportExtract?: string;
}


// Input file interface
export interface ExtractFile extends  FileVM  {
  type: string;
  url: string;
  uploadDate: Date;
  file?: File; // Temporary storage
}

// Entity extraction result
export interface ExtractedEntity {
  type: string;
  value: string;
  context?: string;
}

// Result interface
export interface ExtractionResult {
  id: string;
  files: ExtractFile[];
  entities: ExtractedEntity[];
  text?: string;
  totalEntitiesFound: number;
  status: 'pending' | 'processing' | 'completed' | 'failed';
  error?: string;
}

// Request/Response interfaces
export interface ExtractUploadRequest {
  files: File[];
}

export interface ExtractUploadResponse {
  success: boolean;
  files: ExtractFile[];
}

export interface ExtractStartRequest {
  fileKeys: string[];
  options: {
    entities?: string[];
    text?: string;
  };
}

export interface ExtractStatusResponse {
  extractionId: string;
  status: 'pending' | 'processing' | 'completed' | 'failed';
  progress?: number;
  result?: ExtractionResult;
  error?: string;
}