import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable, of, throwError, delay } from 'rxjs';
import { catchError } from 'rxjs/operators';
import {
  ExtractUploadRequest,
  ExtractUploadResponse,
  ExtractStartRequest,
  ExtractStatusResponse,
  ExtractionResult,
  ExtractFile,
  ExtractedEntity,
} from '../utils/tplsInterfaces/extractTpl.interface';

@Injectable({
  providedIn: 'root',
})
export class ExtractService {
  private http = inject(HttpClient);

  /**
   * Upload files for extraction
   */
  uploadFile(
    request: ExtractUploadRequest,
  ): Observable<ExtractUploadResponse> {
    const endpoint = "/api/extract/upload";

    if (!endpoint) {
      return this.mockUploadFile(request);
    }

    const formData = new FormData();
    request.files.forEach((file) => formData.append('files', file));

    return this.http.post<ExtractUploadResponse>(endpoint, formData).pipe(
      catchError((error) => {
        console.error('Upload error:', error);
        return throwError(() => error);
      })
    );
  }

  /**
   * Start entity extraction
   */
  startExtraction(
    request: ExtractStartRequest,
  ): Observable<ExtractStatusResponse> {
    const endpoint = "/api/extract/start";

    if (!endpoint) {
      return this.mockStartExtraction(request);
    }

    return this.http.post<ExtractStatusResponse>(endpoint, request).pipe(
      catchError((error) => {
        console.error('Extraction error:', error);
        return throwError(() => error);
      })
    );
  }

  /**
   * Get extraction result
   */
  getExtraction(
    extractionId: string,
  ): Observable<ExtractionResult> {
    const endpoint = "/api/extract/status";

    if (!endpoint) {
      return this.mockGetExtraction(extractionId);
    }

    return this.http.get<ExtractionResult>(`${endpoint}/${extractionId}`).pipe(
      catchError((error) => {
        console.error('Get extraction error:', error);
        return throwError(() => error);
      })
    );
  }

  /**
   * Cancel extraction
   */
  cancelExtraction(
    extractionId: string,
  ): Observable<{ success: boolean; extractionId: string }> {
    const endpoint = "/api/extract/cancel";

    if (!endpoint) {
      return this.mockCancelExtraction(extractionId);
    }

    return this.http.post<{ success: boolean; extractionId: string }>(
      `${endpoint}/${extractionId}`,
      {}
    ).pipe(
      catchError((error) => {
        console.error('Cancel error:', error);
        return throwError(() => error);
      })
    );
  }

  /**
   * Export extraction result
   */
  exportExtraction(
    extractionId: string,
    format: 'pdf' | 'docx' | 'csv' | 'json',
  ): Observable<Blob> {
    const endpoint = "/api/extract/export";

    if (!endpoint) {
      return this.mockExportExtraction(extractionId, format);
    }

    return this.http.get(`${endpoint}/${extractionId}/${format}`, {
      responseType: 'blob',
    }).pipe(
      catchError((error) => {
        console.error('Export error:', error);
        return throwError(() => error);
      })
    );
  }

  // ============================================================================
  // MOCK DATA METHODS
  // ============================================================================

  private mockUploadFile(
    request: ExtractUploadRequest
  ): Observable<ExtractUploadResponse> {
    const mockFiles: ExtractFile[] = request.files.map((file) => ({
      key: crypto.randomUUID(),
      name: file.name,
      size: file.size,
      type: file.type,
      ext: file.name.split('.').pop()?.toLowerCase(),
      url: `https://mock-storage.example.com/files/${file.name}`,
      uploadDate: new Date(),
    }));

    return of({
      success: true,
      files: mockFiles,
    }).pipe(delay(1000));
  }

  private mockStartExtraction(
    request: ExtractStartRequest
  ): Observable<ExtractStatusResponse> {
    const extractionId = crypto.randomUUID();
    const req = request;
    console.log(req);
    return of({
      extractionId,
      status: 'processing' as const,
      progress: 0,
    }).pipe(delay(500));
  }

  private mockGetExtraction(extractionId: string): Observable<ExtractionResult> {
    const mockEntities: ExtractedEntity[] = [
      {
        type: 'person',
        value: 'John Doe',
        context: 'John Doe is a software engineer...',
      },
      {
        type: 'person',
        value: 'Jane Smith',
        context: 'Jane Smith works at Acme Corp...',
      },
      {
        type: 'organization',
        value: 'Acme Corp',
        context: 'Jane Smith works at Acme Corp...',
      },
      {
        type: 'location',
        value: 'New York',
        context: 'The office is located in New York...',
      },
      {
        type: 'organization',
        value: 'Tech Solutions Inc',
        context: 'Previously worked at Tech Solutions Inc...',
      },
    ];

    const mockResult: ExtractionResult = {
      id: extractionId,
      files: [],
      entities: mockEntities,
      text: 'Sample text with extracted entities...',
      totalEntitiesFound: mockEntities.length,
      status: 'completed',
    };

    return of(mockResult).pipe(delay(2000));
  }

  private mockCancelExtraction(
    extractionId: string
  ): Observable<{ success: boolean; extractionId: string }> {
    return of({
      success: true,
      extractionId,
    }).pipe(delay(300));
  }

  private mockExportExtraction(
    extractionId: string,
    format: string
  ): Observable<Blob> {
    const content = `Mock export for extraction ${extractionId} in ${format} format`;
    const blob = new Blob([content], { type: 'text/plain' });
    return of(blob).pipe(delay(500));
  }

  generateMockExtractionResult(): ExtractionResult {
  return {
    id: crypto.randomUUID(),
    files: [
      {
        key: crypto.randomUUID(),
        name: 'business-proposal.pdf',
        size: 1024000,
        type: 'application/pdf',
        ext: 'pdf',
        url: 'https://example.com/files/business-proposal.pdf',
        uploadDate: new Date('2025-11-01'),
      },
      {
        key: crypto.randomUUID(),
        name: 'meeting-notes.docx',
        size: 512000,
        type: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
        ext: 'docx',
        url: 'https://example.com/files/meeting-notes.docx',
        uploadDate: new Date('2025-11-02'),
      },
    ],
    entities: [
      {
        type: 'person',
        value: 'John Doe',
        context: 'John Doe will lead the project management team.',
      },
      {
        type: 'person',
        value: 'Jane Smith',
        context: 'Jane Smith is the senior consultant for this engagement.',
      },
      {
        type: 'organization',
        value: 'Proximus',
        context: 'Proximus has been our strategic partner since 2020.',
      },
      {
        type: 'organization',
        value: 'Microsoft',
        context: 'The solution will be deployed on Microsoft Azure.',
      },
      {
        type: 'location',
        value: 'Brussels',
        context: 'The headquarters are located in Brussels, Belgium.',
      },
      {
        type: 'location',
        value: 'Antwerp',
        context: 'Regional office opening in Antwerp next quarter.',
      },
      {
        type: 'date',
        value: 'November 15, 2025',
        context: 'Project kickoff meeting scheduled for November 15, 2025.',
      },
      {
        type: 'email',
        value: 'contact@proximus.lu',
        context: 'For inquiries, please contact contact@proximus.lu.',
      },
    ],
    text: `This is a comprehensive business proposal outlining the digital transformation strategy for Proximus. 
    John Doe will lead the project management team, working closely with Jane Smith, our senior consultant. 
    The solution will be deployed on Microsoft Azure with headquarters in Brussels and a regional office in Antwerp. 
    Project kickoff is scheduled for November 15, 2025. For inquiries, contact contact@proximus.lu.`,
    totalEntitiesFound: 8,
    status: 'completed',
  };
}
}