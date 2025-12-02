import { ElementRef } from '@angular/core';

/**
 * Export formats supported by the system
 */
export type ExportFormat = 'pdf' | 'docx' | 'txt' | 'copy';

/**
 * Export progress tracking
 */
export interface ExportProgress {
  stage: ExportStage;
  percent: number;
  message?: string;
}

/**
 * Export stages
 */
export type ExportStage =
  | 'initializing'
  | 'preparing'
  | 'capturing'
  | 'processing'
  | 'formatting'
  | 'embedding'
  | 'adding_content'
  | 'adding_keypoints'
  | 'building_document'
  | 'creating_file'
  | 'finalizing'
  | 'saving'
  | 'copying'
  | 'complete';

/**
 * Export options
 */
export interface ExportOptions {
  format: ExportFormat;
  filename: string;
  includeScreenshot?: boolean;
  screenshotElement?: ElementRef;
  screenshotSelector?: string;
  metadata?: Record<string, unknown>;
}

/**
 * Base interface for exportable content
 */
export interface ExportableContent {
  id: string;
  title: string;
  createdAt: Date;
  getTextContent(): string;
  getPdfContent(): PdfContentSection[];
  getDocxContent(): DocxContentSection[];
}

/**
 * PDF content section
 */
export interface PdfContentSection {
  type: 'title' | 'subtitle' | 'text' | 'list' | 'table' | 'metadata' | 'separator';
  content: string | string[] | Record<string, unknown>;
  style?: PdfTextStyle;
}

/**
 * PDF text styling
 */
export interface PdfTextStyle {
  fontSize?: number;
  color?: [number, number, number];
  bold?: boolean;
  italic?: boolean;
}

/**
 * DOCX content section
 */
export interface DocxContentSection {
  type: 'heading1' | 'heading2' | 'paragraph' | 'bullet' | 'table' | 'metadata';
  content: string | string[];
  spacing?: { before?: number; after?: number };
}

/**
 * Export result
 */
export interface ExportResult {
  success: boolean;
  format: ExportFormat;
  filename?: string;
  error?: Error;
  duration?: number;
}