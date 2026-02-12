/**
 * Base Template Operation Service
 * 
 * Abstract base class for template operations (Compare, Summarize, Extract, etc.)
 * This provides a consistent pattern for:
 * - File upload
 * - Operation start
 * - Result retrieval
 * - Operation cancellation
 * - Export functionality
 * - Mock fallback for development
 * 
 * @usageNotes
 * Extend this class and implement the abstract properties/methods:
 * 
 * ```typescript
 * @Injectable({ providedIn: 'root' })
 * export class CompareService extends BaseTemplateOperationService<
 *   CompareUploadRequest,
 *   CompareUploadResponse,
 *   CompareStartRequest,
 *   CompareStatusResponse,
 *   ComparisonResult
 * > {
 *   protected basePath = '/api/compare';
 *   protected operationName = 'comparison';
 *   protected idField = 'comparisonId';
 *   
 *   protected buildUploadFormData(request: CompareUploadRequest): FormData {
 *     const formData = new FormData();
 *     formData.append('file1', request.file1);
 *     formData.append('file2', request.file2);
 *     return formData;
 *   }
 *   
 *   protected generateMockResult(id: string): ComparisonResult {
 *     return { ... };
 *   }
 * }
 * ```
 */

import { HttpClient, HttpHeaders } from '@angular/common/http';
import { inject } from '@angular/core';
import { Observable, of, delay, throwError } from 'rxjs';
import { catchError, tap } from 'rxjs/operators';

/**
 * Configuration for the base template operation service
 */
export interface OperationConfig {
  /** Whether to use mock implementations when API fails */
  useMockFallback: boolean;
  /** Whether to enable mock mode entirely (skip real API calls) */
  mockEnabled: boolean;
  /** Delay for mock operations in ms */
  mockDelay: number;
}

/**
 * Default configuration
 */
export const DEFAULT_OPERATION_CONFIG: OperationConfig = {
  useMockFallback: true,
  mockEnabled: false, // Set to true for development without backend
  mockDelay: 1000,
};

/**
 * Base interface for upload responses
 */
export interface BaseUploadResponse {
  success: boolean;
  uploadId: string;
  message?: string;
}

/**
 * Base interface for status responses
 */
export interface BaseStatusResponse {
  status: 'pending' | 'processing' | 'completed' | 'failed';
  progress?: number;
  message?: string;
}

/**
 * Cancel response interface
 */
export interface CancelResponse {
  success: boolean;
  [key: string]: unknown;
}

/**
 * Abstract base class for template operation services
 * 
 * @typeParam TUploadRequest - Request type for file upload
 * @typeParam TUploadResponse - Response type from file upload
 * @typeParam TStartRequest - Request type for starting operation
 * @typeParam TStatusResponse - Response type for operation status
 * @typeParam TResult - Final result type
 */
export abstract class BaseTemplateOperationService<
  TUploadRequest,
  TUploadResponse extends BaseUploadResponse,
  TStartRequest,
  TStatusResponse extends BaseStatusResponse,
  TResult
> {
  protected http = inject(HttpClient);
  
  /**
   * Base API path (e.g., '/api/compare', '/api/summarize')
   */
  protected abstract basePath: string;
  
  /**
   * Operation name for logging (e.g., 'comparison', 'summarization')
   */
  protected abstract operationName: string;
  
  /**
   * ID field name for cancel/get responses (e.g., 'comparisonId', 'summaryId')
   */
  protected abstract idField: string;
  
  /**
   * Service configuration
   */
  protected config: OperationConfig = { ...DEFAULT_OPERATION_CONFIG };
  
  /**
   * Build FormData from upload request
   */
  protected abstract buildUploadFormData(request: TUploadRequest): FormData;
  
  /**
   * Generate mock result for development
   */
  protected abstract generateMockResult(id: string): TResult;
  
  /**
   * Generate mock upload response
   */
  protected generateMockUploadResponse(request: TUploadRequest): TUploadResponse {
    void request;
    return {
      success: true,
      uploadId: `mock-upload-${Date.now()}`,
      message: `Mock upload for ${this.operationName}`,
    } as unknown as TUploadResponse;
  }
  
  /**
   * Generate mock status response
   */
  protected generateMockStatusResponse(request: TStartRequest): TStatusResponse {
    void request;
    return {
      status: 'completed',
      progress: 100,
      message: `Mock ${this.operationName} completed`,
      [this.idField]: `mock-${this.operationName}-${Date.now()}`,
    } as unknown as TStatusResponse;
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // PUBLIC API
  // ─────────────────────────────────────────────────────────────────────────────

  /**
   * Upload files for operation
   */
  upload(request: TUploadRequest): Observable<TUploadResponse> {
    if (this.config.mockEnabled) {
      return this.mockUpload(request);
    }

    const url = `${this.basePath}/upload`;
    const formData = this.buildUploadFormData(request);

    return this.http.post<TUploadResponse>(url, formData).pipe(
      tap(response => console.log(`[${this.operationName}] Files uploaded:`, response)),
      catchError(error => this.handleError('upload', error, () => this.mockUpload(request)))
    );
  }

  /**
   * Start the operation
   */
  start(request: TStartRequest): Observable<TStatusResponse> {
    if (this.config.mockEnabled) {
      return this.mockStart(request);
    }

    const url = `${this.basePath}/start`;
    const headers = new HttpHeaders({ 'Content-Type': 'application/json' });

    return this.http.post<TStatusResponse>(url, request, { headers }).pipe(
      tap(response => console.log(`[${this.operationName}] Started:`, response)),
      catchError(error => this.handleError('start', error, () => this.mockStart(request)))
    );
  }

  /**
   * Get operation result
   */
  getResult(operationId: string): Observable<TResult> {
    if (this.config.mockEnabled) {
      return this.mockGetResult(operationId);
    }

    const url = `${this.basePath}/result/${operationId}`;

    return this.http.get<TResult>(url).pipe(
      tap(response => console.log(`[${this.operationName}] Result:`, response)),
      catchError(error => this.handleError('getResult', error, () => this.mockGetResult(operationId)))
    );
  }

  /**
   * Cancel operation
   */
  cancel(operationId: string): Observable<CancelResponse> {
    if (this.config.mockEnabled) {
      return this.mockCancel(operationId);
    }

    const url = `${this.basePath}/cancel/${operationId}`;

    return this.http.delete<CancelResponse>(url).pipe(
      tap(response => console.log(`[${this.operationName}] Cancelled:`, response)),
      catchError(error => this.handleError('cancel', error, () => this.mockCancel(operationId)))
    );
  }

  /**
   * Export result to file
   */
  export(operationId: string, format = 'pdf'): Observable<Blob> {
    if (this.config.mockEnabled) {
      return this.mockExport(operationId, format);
    }

    const url = `${this.basePath}/export/${operationId}`;

    return this.http.get(url, {
      params: { format },
      responseType: 'blob',
    }).pipe(
      tap(() => console.log(`[${this.operationName}] Exported as ${format}`)),
      catchError(error => this.handleError('export', error, () => this.mockExport(operationId, format)))
    );
  }

  /**
   * Get operation status (for polling)
   */
  getStatus(operationId: string): Observable<TStatusResponse> {
    if (this.config.mockEnabled) {
      return of({
        status: 'completed',
        progress: 100,
        [this.idField]: operationId,
      } as unknown as TStatusResponse).pipe(delay(this.config.mockDelay));
    }

    const url = `${this.basePath}/status/${operationId}`;

    return this.http.get<TStatusResponse>(url).pipe(
      catchError(error => this.handleError('getStatus', error, () => 
        of({ status: 'completed', progress: 100, [this.idField]: operationId } as unknown as TStatusResponse).pipe(delay(this.config.mockDelay))
      ))
    );
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // MOCK IMPLEMENTATIONS
  // ─────────────────────────────────────────────────────────────────────────────

  protected mockUpload(request: TUploadRequest): Observable<TUploadResponse> {
    return of(this.generateMockUploadResponse(request)).pipe(
      delay(this.config.mockDelay)
    );
  }

  protected mockStart(request: TStartRequest): Observable<TStatusResponse> {
    return of(this.generateMockStatusResponse(request)).pipe(
      delay(this.config.mockDelay)
    );
  }

  protected mockGetResult(operationId: string): Observable<TResult> {
    return of(this.generateMockResult(operationId)).pipe(
      delay(this.config.mockDelay)
    );
  }

  protected mockCancel(operationId: string): Observable<CancelResponse> {
    return of({
      success: true,
      [this.idField]: operationId,
    }).pipe(delay(300));
  }

  protected mockExport(operationId: string, format: string): Observable<Blob> {
    const content = `Mock ${format.toUpperCase()} export for ${this.operationName} ${operationId}`;
    const blob = new Blob([content], { type: 'application/octet-stream' });
    return of(blob).pipe(delay(this.config.mockDelay));
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // ERROR HANDLING
  // ─────────────────────────────────────────────────────────────────────────────

  /**
   * Handle errors with optional mock fallback
   */
  protected handleError<T>(
    operation: string,
    error: unknown,
    mockFallback?: () => Observable<T>
  ): Observable<T> {
    console.error(`[${this.operationName}] Error in ${operation}:`, error);
    
    if (this.config.useMockFallback && mockFallback) {
      console.warn(`[${this.operationName}] Falling back to mock for ${operation}`);
      return mockFallback();
    }
    
    return throwError(() => error);
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // CONFIGURATION
  // ─────────────────────────────────────────────────────────────────────────────

  /**
   * Configure the service
   */
  configure(config: Partial<OperationConfig>): void {
    this.config = { ...this.config, ...config };
  }

  /**
   * Enable mock mode (for development)
   */
  enableMockMode(): void {
    this.config.mockEnabled = true;
  }

  /**
   * Disable mock mode (for production)
   */
  disableMockMode(): void {
    this.config.mockEnabled = false;
  }
}
