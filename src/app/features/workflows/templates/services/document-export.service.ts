import { Injectable, ElementRef, inject } from '@angular/core';
import { TranslateService } from '@ngx-translate/core';
import { ToastService } from '@cadai/pxs-ng-core/services';
import { BehaviorSubject } from 'rxjs';
import { jsPDF } from 'jspdf';
import { saveAs } from 'file-saver';
import { Document, Paragraph, HeadingLevel, ImageRun } from 'docx';
import html2canvas from 'html2canvas';
import {
  ExportFormat,
  ExportProgress,
  ExportOptions,
  ExportableContent,
  ExportResult,
  PdfContentSection,
  DocxContentSection,
} from '../utils/document-export.interface';

@Injectable({
  providedIn: 'root',
})
export class DocumentExportService {
  private translate = inject(TranslateService);
  private toast = inject(ToastService);

  // Progress tracking
  private _exportProgress$ = new BehaviorSubject<ExportProgress | null>(null);
  private _isExporting$ = new BehaviorSubject<boolean>(false);
  private _currentFormat$ = new BehaviorSubject<ExportFormat | null>(null);

  // Observables
  readonly exportProgress$ = this._exportProgress$.asObservable();
  readonly isExporting$ = this._isExporting$.asObservable();
  readonly currentFormat$ = this._currentFormat$.asObservable();

  /**
   * Export content with progress tracking
   */
  async export(
    content: ExportableContent,
    options: ExportOptions
  ): Promise<void> {
    this._isExporting$.next(true);
    this._currentFormat$.next(options.format);
    this.updateProgress('initializing', 0);

    setTimeout(async () => {
      try {

        switch (options.format) {
          case 'pdf':
            await this.exportPdf(content, options);
            break;
          case 'docx':
            await this.exportDocx(content, options);
            break;
          case 'txt':
            await this.exportTxt(content, options);
            break;
          case 'copy':
            await this.copyToClipboard(content);
            break;
          default:
            throw new Error(`Unsupported export format: ${options.format}`);
        }

        this.updateProgress('complete', 100);
        this.showSuccessNotification(options.format);

        // Reset after delay
        setTimeout(() => this.reset(), 1000);

      } catch (error) {
        console.error('Export failed:', {
          success: false,
          format: options.format,
          error: error as Error,
        });
        this.showErrorNotification(options.format);
        this.reset();
      }
    }, 300);
  }

  /**
   * Export as PDF
   */
  private async exportPdf(
    content: ExportableContent,
    options: ExportOptions
  ): Promise<ExportResult> {
    this.updateProgress('preparing', 10);

    const doc = new jsPDF('p', 'mm', 'a4');
    const pageWidth = doc.internal.pageSize.getWidth();
    const pageHeight = doc.internal.pageSize.getHeight();
    const margin = 20;
    let yPosition = margin;

    // Add title
    this.updateProgress('formatting', 15);
    doc.setFontSize(22);
    doc.setTextColor(33, 150, 243);
    doc.text(content.title, margin, yPosition);
    yPosition += 15;

    // Add metadata
    doc.setFontSize(10);
    doc.setTextColor(100, 100, 100);
    doc.text(`Generated: ${new Date().toLocaleString()}`, margin, yPosition);
    yPosition += 8;

    // Add metadata fields if provided
    if (options.metadata) {
      const metadataText = Object.entries(options.metadata)
        .map(([key, value]) => `${key}: ${value}`)
        .join(' | ');
      doc.text(metadataText, margin, yPosition);
      yPosition += 12;
    } else {
      yPosition += 4;
    }

    // Add separator
    doc.setDrawColor(200, 200, 200);
    doc.line(margin, yPosition, pageWidth - margin, yPosition);
    yPosition += 10;

    // Capture screenshot if requested
    if (options.includeScreenshot) {
      const screenshot = await this.captureScreenshot(
        options.screenshotElement,
        options.screenshotSelector
      );

      if (screenshot) {
        this.updateProgress('embedding', 50);
        const img = new Image();
        img.src = screenshot;

        await new Promise((resolve) => {
          img.onload = resolve;
        });

        const imgWidth = pageWidth - 2 * margin;
        const imgHeight = (img.height * imgWidth) / img.width;

        if (yPosition + imgHeight > pageHeight - margin) {
          doc.addPage();
          yPosition = margin;
        }

        doc.addImage(screenshot, 'PNG', margin, yPosition, imgWidth, imgHeight);
        yPosition += imgHeight + 15;
      }
    }

    // Add content sections
    this.updateProgress('adding_content', 70);
    const sections = content.getPdfContent();

    for (const section of sections) {
      if (yPosition > pageHeight - margin) {
        doc.addPage();
        yPosition = margin;
      }

      yPosition = this.addPdfSection(doc, section, yPosition, margin, pageWidth, pageHeight);
    }

    // Save PDF
    this.updateProgress('saving', 98);
    doc.save(options.filename);

    return { success: true, format: 'pdf', filename: options.filename };
  }

  /**
   * Export as DOCX
   */
  private async exportDocx(
    content: ExportableContent,
    options: ExportOptions
  ): Promise<ExportResult> {
    this.updateProgress('preparing', 10);

    const children: Paragraph[] = [
      new Paragraph({
        text: content.title,
        heading: HeadingLevel.HEADING_1,
      }),
      new Paragraph({
        text: `Generated: ${new Date().toLocaleString()}`,
        spacing: { after: 200 },
      }),
    ];

    // Add metadata
    if (options.metadata) {
      const metadataText = Object.entries(options.metadata)
        .map(([key, value]) => `${key}: ${value}`)
        .join(' | ');
      children.push(
        new Paragraph({
          text: metadataText,
          spacing: { after: 400 },
        })
      );
    }

    // Capture screenshot if requested
    if (options.includeScreenshot) {
      const screenshot = await this.captureScreenshot(
        options.screenshotElement,
        options.screenshotSelector
      );

      if (screenshot) {
        this.updateProgress('embedding', 50);
        const base64Data = screenshot.split(',')[1];
        const imageBuffer = Uint8Array.from(atob(base64Data), (c) => c.charCodeAt(0));

        children.push(
          new Paragraph({
            children: [
              new ImageRun({
                data: imageBuffer,
                transformation: {
                  width: 600,
                  height: 400,
                },
                type: 'png',
              }),
            ],
            spacing: { after: 400 },
          })
        );
      }
    }

    // Add content sections
    this.updateProgress('adding_content', 75);
    const sections = content.getDocxContent();

    for (const section of sections) {
      const paragraph = this.createDocxSection(section);
      if (paragraph) {
        children.push(paragraph);
      }
    }

    // Create document
    this.updateProgress('finalizing', 90);
    const doc = new Document({
      sections: [{ children }],
    });

    // Save document
    this.updateProgress('saving', 95);
    const { Packer } = await import('docx');
    const blob = await Packer.toBlob(doc);
    saveAs(blob, options.filename);

    return { success: true, format: 'docx', filename: options.filename };
  }

  /**
   * Export as TXT
   */
  private async exportTxt(
    content: ExportableContent,
    options: ExportOptions
  ): Promise<ExportResult> {
    this.updateProgress('formatting', 30);

    const textContent = content.getTextContent();

    this.updateProgress('creating_file', 70);
    const blob = new Blob([textContent], { type: 'text/plain;charset=utf-8' });

    this.updateProgress('saving', 90);
    this.downloadFile(blob, options.filename);

    return { success: true, format: 'txt', filename: options.filename };
  }

  /**
   * Copy to clipboard
   */
  private async copyToClipboard(content: ExportableContent): Promise<ExportResult> {
    this.updateProgress('copying', 50);

    const textContent = content.getTextContent();

    try {
      await navigator.clipboard.writeText(textContent);
      return { success: true, format: 'copy' };
    } catch (error) {
      console.error('Clipboard write failed:', error);
      return { success: false, format: 'copy', error: error as Error };
    }
  }

  /**
   * Capture screenshot of element
   */
  private async captureScreenshot(
    element?: ElementRef,
    selector?: string
  ): Promise<string | null> {
    this.updateProgress('capturing', 20);

    let targetElement: HTMLElement | null = null;

    if (element) {
      targetElement = element.nativeElement;
    } else if (selector) {
      targetElement = document.querySelector(selector);
    }

    if (!targetElement) {
      console.warn('Screenshot target not found');
      return null;
    }

    try {
      const canvas = await html2canvas(targetElement, {
        scale: 2,
        useCORS: true,
        allowTaint: true,
        backgroundColor: '#ffffff',
        logging: false,
        imageTimeout: 0,
        onclone: (clonedDoc) => {
          const clonedElement = clonedDoc.querySelector(selector || 'body');
          if (clonedElement) {
            (clonedElement as HTMLElement).style.transform = 'none';
          }
        },
      });

      this.updateProgress('processing', 40);
      return canvas.toDataURL('image/png');
    } catch (error) {
      console.error('Screenshot capture failed:', error);
      return null;
    }
  }

  /**
   * Add PDF section
   */
  private addPdfSection(
    doc: jsPDF,
    section: PdfContentSection,
    yPosition: number,
    margin: number,
    pageWidth: number,
    pageHeight: number
  ): number {
    const style = section.style || {};
    let splitText: string[] = [];

    switch (section.type) {
      case 'title':
        doc.setFontSize(style.fontSize || 18);
        doc.setTextColor(...(style.color || [33, 150, 243]));
        doc.text(section.content as string, margin, yPosition);
        yPosition += 12;
        break;

      case 'subtitle':
        doc.setFontSize(style.fontSize || 14);
        doc.setTextColor(...(style.color || [100, 100, 100]));
        doc.text(section.content as string, margin, yPosition);
        yPosition += 10;
        break;

      case 'text':
        doc.setFontSize(style.fontSize || 11);
        doc.setTextColor(...(style.color || [0, 0, 0]));
        splitText = doc.splitTextToSize(section.content as string, (pageWidth - 2 * margin));
        splitText.forEach((line: string) => {
          if (yPosition > pageHeight - margin) {
            doc.addPage();
            yPosition = margin;
          }
          doc.text(line, margin, yPosition);
          yPosition += 7;
        });
        yPosition += 5;
        break;

      case 'list': {
        doc.setFontSize(style.fontSize || 11);
        doc.setTextColor(...(style.color || [0, 0, 0]));
        (section.content as string[]).forEach((item, index) => {
          if (yPosition > pageHeight - margin) {
            doc.addPage();
            yPosition = margin;
          }
          const itemText = `${index + 1}. ${item}`;
          const splitItem = doc.splitTextToSize(itemText, (pageWidth - 2 * margin - 10));
          splitItem.forEach((line: string) => {
            doc.text(line, margin + 5, yPosition);
            yPosition += 7;
          });
          yPosition += 3;
        });
        break;
      }

      case 'separator':
        doc.setDrawColor(200, 200, 200);
        doc.line(margin, yPosition, pageWidth - margin, yPosition);
        yPosition += 10;
        break;

      case 'metadata': {
        doc.setFontSize(10);
        doc.setTextColor(100, 100, 100);

        const metadata = section.content as Record<string, unknown>;
        for (const [key, value] of Object.entries(metadata)) {
          if (yPosition > pageHeight - margin) {
            doc.addPage();
            yPosition = margin;
          }
          // ensure value is printable
          const text = `${key}: ${typeof value === 'object' ? JSON.stringify(value) : String(value ?? '')}`;
          doc.text(text, margin, yPosition);
          yPosition += 6;
        }
        yPosition += 5;
        break;
      }
    }

    return yPosition;
  }

  /**
   * Create DOCX section
   */
  private createDocxSection(section: DocxContentSection): Paragraph | null {
    switch (section.type) {
      case 'heading1':
        return new Paragraph({
          text: section.content as string,
          heading: HeadingLevel.HEADING_1,
          spacing: section.spacing,
        });

      case 'heading2':
        return new Paragraph({
          text: section.content as string,
          heading: HeadingLevel.HEADING_2,
          spacing: section.spacing,
        });

      case 'paragraph':
        return new Paragraph({
          text: section.content as string,
          spacing: section.spacing,
        });

      case 'bullet':
        if (Array.isArray(section.content)) {
          // Return first item, rest handled in loop
          return new Paragraph({
            text: section.content[0],
            bullet: { level: 0 },
          });
        }
        return new Paragraph({
          text: section.content as string,
          bullet: { level: 0 },
        });

      default:
        return null;
    }
  }

  /**
   * Download file helper
   */
  private downloadFile(blob: Blob, filename: string): void {
    const link = document.createElement('a');
    const url = window.URL.createObjectURL(blob);

    link.href = url;
    link.download = filename;
    link.style.display = 'none';

    document.body.appendChild(link);
    link.click();

    setTimeout(() => {
      document.body.removeChild(link);
      window.URL.revokeObjectURL(url);
    }, 100);
  }

  /**
   * Update export progress
   */
  private updateProgress(stage: ExportProgress['stage'], percent: number): void {
    this._exportProgress$.next({ stage, percent });
  }

  /**
   * Show success notification
   */
  private showSuccessNotification(format: ExportFormat): void {
    const message = this.translate.instant(`exportTpl.success.${format}`);
    this.toast.show(message);
  }

  /**
   * Show error notification
   */
  private showErrorNotification(format: ExportFormat): void {
    const message = this.translate.instant(`exportTpl.error.${format}`);
    this.toast.show(message);
  }

  /**
   * Reset export state
   */
  private reset(): void {
    this._isExporting$.next(false);
    this._exportProgress$.next(null);
    this._currentFormat$.next(null);
  }
}