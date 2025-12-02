import { DocxContentSection, ExportableContent, PdfContentSection } from "./document-export.interface";
import { SummaryResult } from "./tplsInterfaces/summarizeTpl.interface";


/**
 * Adapter to convert SummaryResult to ExportableContent
 */
export class SummaryExportAdapter implements ExportableContent {
  constructor(private result: SummaryResult) {}

  get id(): string {
    return this.result.id;
  }

  public readonly title = 'Document Summary Report';

  get createdAt(): Date {
    return this.result.createdAt;
  }

  getTextContent(): string {
    let text = '='.repeat(80) + '\n';
    text += `DOCUMENT SUMMARY\n`;
    text += '='.repeat(80) + '\n\n';

    // Source files
    if (this.result.files.length > 0) {
      text += 'SOURCE DOCUMENTS:\n';
      text += '-'.repeat(80) + '\n';
      this.result.files.forEach((file, index) => {
        text += `${index + 1}. ${file.name}`;
        if (file.size) {
          text += ` (${(file.size / 1024).toFixed(1)} KB)`;
        }
        text += '\n';
      });
      text += '\n';
    }

    // Summary metadata
    text += 'SUMMARY DETAILS:\n';
    text += '-'.repeat(80) + '\n';
    text += `Style: ${this.result.style}\n`;
    text += `Length: ${this.result.length}\n`;
    text += `Language: ${this.result.language.toUpperCase()}\n`;
    text += `Created: ${this.result.createdAt.toLocaleString()}\n`;
    text += '\n';

    // Word count statistics
    text += 'STATISTICS:\n';
    text += '-'.repeat(80) + '\n';
    text += `Original Words: ${this.result.wordCount.original}\n`;
    text += `Summary Words: ${this.result.wordCount.summary}\n`;
    text += `Reduction: ${this.result.wordCount.reduction}%\n`;
    text += '\n';

    // Key points
    if (this.result.keyPoints.length > 0) {
      text += 'KEY POINTS:\n';
      text += '-'.repeat(80) + '\n';
      this.result.keyPoints.forEach((point, index) => {
        text += `${index + 1}. ${point}\n`;
      });
      text += '\n';
    }

    // Summary text
    text += 'SUMMARY:\n';
    text += '-'.repeat(80) + '\n';
    text += this.result.summary.replace(/<[^>]*>/g, '');
    text += '\n\n';

    text += '='.repeat(80) + '\n';
    text += `Generated on ${new Date().toLocaleString()}\n`;
    text += '='.repeat(80) + '\n';

    return text;
  }

  getPdfContent(): PdfContentSection[] {
    const sections: PdfContentSection[] = [];

    // Metadata
    sections.push({
      type: 'metadata',
      content: {
        Style: this.result.style,
        Length: this.result.length,
        Language: this.result.language.toUpperCase(),
      },
    });

    sections.push({ type: 'separator', content: '' });

    // Summary text
    sections.push({
      type: 'title',
      content: 'Summary',
    });

    sections.push({
      type: 'text',
      content: this.result.summary.replace(/<[^>]*>/g, ''),
    });

    // Key points
    if (this.result.keyPoints.length > 0) {
      sections.push({
        type: 'title',
        content: 'Key Points',
      });

      sections.push({
        type: 'list',
        content: this.result.keyPoints,
      });
    }

    // Statistics
    sections.push({ type: 'separator', content: '' });
    sections.push({
      type: 'metadata',
      content: {
        'Original Words': this.result.wordCount.original,
        'Summary Words': this.result.wordCount.summary,
        Reduction: `${this.result.wordCount.reduction}%`,
      },
    });

    return sections;
  }

  getDocxContent(): DocxContentSection[] {
    const sections: DocxContentSection[] = [];

    // Summary
    sections.push({
      type: 'heading2',
      content: 'Summary',
    });

    sections.push({
      type: 'paragraph',
      content: this.result.summary.replace(/<[^>]*>/g, ''),
      spacing: { after: 400 },
    });

    // Key points
    if (this.result.keyPoints.length > 0) {
      sections.push({
        type: 'heading2',
        content: 'Key Points',
      });

      this.result.keyPoints.forEach((point) => {
        sections.push({
          type: 'bullet',
          content: point,
        });
      });
    }

    // Statistics
    sections.push({
      type: 'heading2',
      content: 'Statistics',
      spacing: { before: 400 },
    });

    sections.push({
      type: 'paragraph',
      content: `Original Words: ${this.result.wordCount.original}`,
    });

    sections.push({
      type: 'paragraph',
      content: `Summary Words: ${this.result.wordCount.summary}`,
    });

    sections.push({
      type: 'paragraph',
      content: `Reduction: ${this.result.wordCount.reduction}%`,
    });

    return sections;
  }
}