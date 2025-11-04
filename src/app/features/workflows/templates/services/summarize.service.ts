import { Injectable, inject } from '@angular/core';
import { HttpClient, HttpHeaders } from '@angular/common/http';
import { Observable, of, delay, throwError } from 'rxjs';
import { catchError, tap } from 'rxjs/operators';
import {
  SummaryResult,
  SummarizeFile,
  SummarizeEndpoints,
  SummarizeUploadRequest,
  SummarizeStartRequest,
  SummarizeUploadResponse,
  SummarizeStatusResponse,
  SummaryStyle,
  SummaryLength
} from '../utils/summarizeTpl.interface';

@Injectable({
  providedIn: 'root',
})
export class SummarizeService {
  private http = inject(HttpClient);

  private defaultEndpoints: SummarizeEndpoints = {
    uploadFile: '/api/summarize/upload',
    startSummarization: '/api/summarize/start',
    getSummary: '/api/summarize/result',
    cancelSummary: '/api/summarize/cancel',
    exportSummary: '/api/summarize/export',
  };


  configure(config: { endpoints?: Partial<SummarizeEndpoints> }): void {
    if (config.endpoints) {
      this.defaultEndpoints = { ...this.defaultEndpoints, ...config.endpoints };
    }
  }

  /**
   * Upload file(s) for summarization
   */
  uploadFile(
    request: SummarizeUploadRequest,
    endpoints?: Partial<SummarizeEndpoints>
  ): Observable<SummarizeUploadResponse> {
    const url = endpoints?.uploadFile || this.defaultEndpoints.uploadFile;


    const formData = new FormData();
    request.files.forEach((file, index) => {
      formData.append(`file${index}`, file);
    });
    if (request.metadata) {
      formData.append('metadata', JSON.stringify(request.metadata));
    }

    return this.http.post<SummarizeUploadResponse>(url, formData).pipe(
      tap(response => console.log('Files uploaded:', response)),
      catchError(error => {
        console.error('Error uploading files:', error);
        throwError(() => error);
        return this.mockUploadFile(request);

      })
    );
  }

  /**
   * Start summarization process
   */
  startSummarization(
    request: SummarizeStartRequest,
    endpoints?: Partial<SummarizeEndpoints>
  ): Observable<SummarizeStatusResponse> {
    const url = endpoints?.startSummarization || this.defaultEndpoints.startSummarization;


    const headers = new HttpHeaders({ 'Content-Type': 'application/json' });

    return this.http.post<SummarizeStatusResponse>(url, request, { headers }).pipe(
      tap(response => console.log('Summarization started:', response)),
      catchError(error => {
        console.error('Error starting summarization:', error);
        throwError(() => error);
        return this.mockStartSummarization(request);

      })
    );
  }

  /**
   * Get summary result
   */
  getSummary(
    summaryId: string,
    endpoints?: Partial<SummarizeEndpoints>
  ): Observable<SummaryResult> {
    const url = `${endpoints?.getSummary || this.defaultEndpoints.getSummary}/${summaryId}`;


    return this.http.get<SummaryResult>(url).pipe(
      tap(response => console.log('Summary result:', response)),
      catchError(error => {
        console.error('Error getting summary:', error);
        throwError(() => error);
        return this.mockGetSummary(summaryId);

      })
    );
  }

  /**
   * Cancel summarization
   */
  cancelSummary(
    summaryId: string,
    endpoints?: Partial<SummarizeEndpoints>
  ): Observable<{ success: boolean; summaryId: string }> {
    const url = `${endpoints?.cancelSummary || this.defaultEndpoints.cancelSummary}/${summaryId}`;


    return this.http.delete<{ success: boolean; summaryId: string }>(url).pipe(
      tap(response => console.log('Summarization cancelled:', response)),
      catchError(error => {
        console.error('Error cancelling summarization:', error);
        throwError(() => error);
        return this.mockCancelSummary(summaryId);

      })
    );
  }

  /**
   * Export summary result
   */
  exportSummary(
    summaryId: string,
    format: 'pdf' | 'docx' | 'html' | 'txt',
    endpoints?: Partial<SummarizeEndpoints>
  ): Observable<Blob> {
    const url = `${endpoints?.exportSummary || this.defaultEndpoints.exportSummary}/${summaryId}`;


    return this.http
      .post(url, { format }, { responseType: 'blob' })
      .pipe(
        tap(() => console.log('Summary exported')),
        catchError(error => {
          console.error('Error exporting summary:', error);
          throwError(() => error);
          return this.mockExportSummary(summaryId, format);

        })
      );
  }

  // ============================================================================
  // MOCK DATA METHODS
  // ============================================================================

  private mockUploadFile(request: SummarizeUploadRequest): Observable<SummarizeUploadResponse> {
    const files: SummarizeFile[] = request.files.map((file, index) => ({
      key: `file-${index}-${Date.now()}`,
      name: file.name,
      size: file.size,
      ext: file.name.split('.').pop() || 'unknown',
      mime: file.type,
      url: URL.createObjectURL(file),
      uploadDate: new Date(),
    }));

    return of({
      files,
      uploadTimestamp: new Date(),
    }).pipe(delay(1000));
  }

  private mockStartSummarization(request: SummarizeStartRequest): Observable<SummarizeStatusResponse> {
    const summaryId = `summary-${Date.now()}`;

    return of({
      summaryId,
      status: 'processing' as const,
      progress: 0,
      request
    }).pipe(delay(500));
  }

  private mockGetSummary(summaryId: string): Observable<SummaryResult> {
    return of(this.generateMockSummaryResult(summaryId)).pipe(delay(2000));
  }

  private mockCancelSummary(summaryId: string): Observable<{ success: boolean; summaryId: string }> {
    return of({
      success: true,
      summaryId,
    }).pipe(delay(300));
  }

  private mockExportSummary(summaryId: string, format: string): Observable<Blob> {
    const content = `Mock ${format.toUpperCase()} export for summary ${summaryId}`;
    const blob = new Blob([content], { type: 'application/octet-stream' });
    return of(blob).pipe(delay(1000));
  }

  private generateMockSummaryResult(summaryId: string): SummaryResult {
    return {
      id: summaryId || 'summary-123',
      files: [
        {
          key: 'file-1',
          name: 'quarterly-report.pdf',
          size: 2048576,
          ext: 'pdf',
          mime: 'application/pdf',
          url: 'https://storage.example.com/files/report.pdf',
          uploadDate: new Date('2025-10-15'),
        },
      ],
      summary: `This quarterly report highlights significant growth across all departments. 
                Revenue increased by 25% compared to Q3. Key achievements include successful 
                product launches and market expansion in European markets.`,
      keyPoints: [
        'Revenue increased by 25% quarter-over-quarter',
        'Successful launch of 3 new products',
        'Market expansion into 5 European countries',
        'Customer satisfaction rating improved to 4.8/5',
        'Operating costs reduced by 12%',
      ],
      wordCount: {
        original: 5420,
        summary: 456,
        reduction: 91.6,
      },
      style: 'executive' as SummaryStyle,
      length: 'medium' as SummaryLength,
      language: 'en',
      status: 'completed' as const,
      createdAt: new Date('2025-10-20T10:30:00'),
      completedAt: new Date('2025-10-20T10:31:15'),
    };
  }
}