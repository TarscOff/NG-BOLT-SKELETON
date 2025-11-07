import { Injectable, inject } from '@angular/core';
import { HttpClient, HttpHeaders } from '@angular/common/http';
import { Observable, of, delay, throwError } from 'rxjs';
import { catchError, tap } from 'rxjs/operators';
import {
  ComparisonResult, CompareFile, CompareEndpoints,
  CompareUploadRequest,
  CompareStartRequest,
  CompareUploadResponse,
  CompareStatusResponse
} from '../utils/tplsInterfaces/compareTpl.interface';

@Injectable({
  providedIn: 'root',
})
export class CompareService {
  private http = inject(HttpClient);

  private defaultEndpoints: CompareEndpoints = {
    uploadFiles: '/api/compare/upload',
    startComparison: '/api/compare/start',
    getComparison: '/api/compare/result',
    cancelComparison: '/api/compare/cancel',
    exportComparison: '/api/compare/export',
  };


  configure(config: { endpoints?: Partial<CompareEndpoints> }): void {
    if (config.endpoints) {
      this.defaultEndpoints = { ...this.defaultEndpoints, ...config.endpoints };
    }
  }

  /**
   * Upload two files for comparison
   */
  uploadFiles(
    request: CompareUploadRequest,
    endpoints?: Partial<CompareEndpoints>
  ): Observable<CompareUploadResponse> {
    const url = endpoints?.uploadFiles || this.defaultEndpoints.uploadFiles;

    const formData = new FormData();
    formData.append('file1', request.file1);
    formData.append('file2', request.file2);
    if (request.metadata) {
      formData.append('metadata', JSON.stringify(request.metadata));
    }

    return this.http.post<CompareUploadResponse>(url, formData).pipe(
      tap(response => console.log('Files uploaded:', response)),
      catchError(error => {
        console.error('Error uploading files:', error);
        throwError(() => error);
        return this.mockUploadFiles(request);

      })
    );
  }

  /**
   * Start comparison process
   */
  startComparison(
    request: CompareStartRequest,
    endpoints?: Partial<CompareEndpoints>
  ): Observable<CompareStatusResponse> {
    const url = endpoints?.startComparison || this.defaultEndpoints.startComparison;


    const headers = new HttpHeaders({ 'Content-Type': 'application/json' });

    return this.http.post<CompareStatusResponse>(url, request, { headers }).pipe(
      tap(response => console.log('Comparison started:', response)),
      catchError(error => {
        console.error('Error starting comparison:', error);
        throwError(() => error);
        return this.mockStartComparison(request);

      })
    );
  }

  /**
   * Get comparison result
   */
  getComparison(
    comparisonId: string,
    endpoints?: Partial<CompareEndpoints>
  ): Observable<ComparisonResult> {
    const url = `${endpoints?.getComparison || this.defaultEndpoints.getComparison}/${comparisonId}`;


    return this.http.get<ComparisonResult>(url).pipe(
      tap(response => console.log('Comparison result:', response)),
      catchError(error => {
        console.error('Error getting comparison:', error);
        throwError(() => error);

        return this.mockGetComparison(comparisonId);

      })
    );
  }

  /**
   * Cancel comparison
   */
  cancelComparison(
    comparisonId: string,
    endpoints?: Partial<CompareEndpoints>
  ): Observable<{ success: boolean; comparisonId: string }> {
    const url = `${endpoints?.cancelComparison || this.defaultEndpoints.cancelComparison}/${comparisonId}`;


    return this.http.delete<{ success: boolean; comparisonId: string }>(url).pipe(
      tap(response => console.log('Comparison cancelled:', response)),
      catchError(error => {
        console.error('Error cancelling comparison:', error);
        throwError(() => error);
        return this.mockCancelComparison(comparisonId);

      })
    );
  }

  /**
   * Export comparison result
   */
  exportComparison(
    comparisonId: string,
    format: 'pdf' | 'docx' | 'html',
    endpoints?: Partial<CompareEndpoints>
  ): Observable<Blob> {
    const url = `${endpoints?.exportComparison || this.defaultEndpoints.exportComparison}/${comparisonId}`;

    return this.http
      .post(url, { format }, { responseType: 'blob' })
      .pipe(
        tap(() => console.log('Comparison exported')),
        catchError(error => {
          console.error('Error exporting comparison:', error);
          throwError(() => error);
          return this.mockExportComparison(comparisonId, format);

        })
      );
  }

  // ============================================================================
  // MOCK DATA METHODS
  // ============================================================================

  private mockUploadFiles(request: CompareUploadRequest): Observable<CompareUploadResponse> {
    const file1: CompareFile = {
      key: `file-1-${Date.now()}`,
      name: request.file1.name,
      size: request.file1.size,
      ext: request.file1.name.split('.').pop() || 'unknown',
      mime: request.file1.type,
      url: URL.createObjectURL(request.file1),
      uploadDate: new Date(),
    };

    const file2: CompareFile = {
      key: `file-2-${Date.now()}`,
      name: request.file2.name,
      size: request.file2.size,
      ext: request.file2.name.split('.').pop() || 'unknown',
      mime: request.file2.type,
      url: URL.createObjectURL(request.file2),
      uploadDate: new Date(),
    };

    return of({
      file1,
      file2,
      uploadTimestamp: new Date(),
    }).pipe(delay(1000));
  }

  private mockStartComparison(request: CompareStartRequest): Observable<CompareStatusResponse> {
    const comparisonId = `comp-${Date.now()}`;

    return of({
      comparisonId,
      status: 'processing' as const,
      progress: 0,
      request
    }).pipe(delay(500));
  }

  private mockGetComparison(comparisonId: string): Observable<ComparisonResult> {
    return of(this.generateMockComparisonResult(comparisonId)).pipe(delay(2000));
  }

  private mockCancelComparison(
    comparisonId: string
  ): Observable<{ success: boolean; comparisonId: string }> {
    return of({
      success: true,
      comparisonId,
    }).pipe(delay(300));
  }

  private mockExportComparison(comparisonId: string, format: string): Observable<Blob> {
    const content = `Mock ${format.toUpperCase()} export for comparison ${comparisonId}`;
    const blob = new Blob([content], { type: 'application/octet-stream' });
    return of(blob).pipe(delay(1000));
  }


  private generateMockComparisonResult(comparisonId: string): ComparisonResult {
    return {
      id: comparisonId || 'comp-123',
      file1: {
        key: 'file-1-key',
        name: 'contract_v1.pdf',
        size: 2048576,
        ext: 'pdf',
        mime: 'application/pdf',
        url: 'https://storage.example.com/files/contract_v1.pdf',
        uploadDate: new Date('2025-01-15'),
      },
      file2: {
        key: 'file-2-key',
        name: 'contract_v2.pdf',
        size: 2156789,
        ext: 'pdf',
        mime: 'application/pdf',
        url: 'https://storage.example.com/files/contract_v2.pdf',
        uploadDate: new Date('2025-01-20'),
      },
      differences: [
        {
          id: 'diff-1',
          type: 'modified' as const,
          section: 'Section 3: Payment Terms',
          file1Content: 'Payment due within 30 days',
          file2Content: 'Payment due within 45 days',
          lineNumber: 42,
          description: 'Payment term duration changed from 30 to 45 days',
        },
        {
          id: 'diff-2',
          type: 'added' as const,
          section: 'Section 5: Confidentiality',
          file2Content: 'All information shall remain confidential for 5 years',
          lineNumber: 78,
          description: 'New confidentiality clause added',
        },
        {
          id: 'diff-3',
          type: 'removed' as const,
          section: 'Section 2: Delivery Terms',
          file1Content: 'Delivery within 14 business days',
          lineNumber: 28,
          description: 'Delivery terms section removed',
        },
      ],
      similarity: 87.5,
      status: 'completed' as const,
      createdAt: new Date('2025-01-20T10:30:00'),
      completedAt: new Date('2025-01-20T10:30:45'),
    };
  }
}