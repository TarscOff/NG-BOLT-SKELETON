import { ComparisonResult } from "./tplsInterfaces/compareTpl.interface";
import { DocxContentSection, ExportableContent, PdfContentSection } from "./document-export.interface";

/**
 * Adapter to convert ComparisonResult to ExportableContent
 */
export class ComparisonExportAdapter implements ExportableContent {
  constructor(private result: ComparisonResult) {}

  get id(): string {
    return this.result.id;
  }

  public readonly title = 'Document Comparison Report';


  get createdAt(): Date {
    return this.result.createdAt;
  }

  getTextContent(): string {
    let text = '='.repeat(80) + '\n';
    text += `DOCUMENT COMPARISON REPORT\n`;
    text += '='.repeat(80) + '\n\n';

    // Files
    text += 'COMPARED DOCUMENTS:\n';
    text += '-'.repeat(80) + '\n';
    text += `File 1: ${this.result.file1.name}\n`;
    text += `File 2: ${this.result.file2.name}\n`;
    text += '\n';

    // Similarity
    text += 'SIMILARITY:\n';
    text += '-'.repeat(80) + '\n';
    text += `${this.result.similarity}%\n`;
    text += '\n';

    // Differences
    if (this.result.differences.length > 0) {
      text += 'DIFFERENCES:\n';
      text += '-'.repeat(80) + '\n';
      this.result.differences.forEach((diff, index) => {
        text += `${index + 1}. ${diff.description}\n`;
        text += `   Section: ${diff.section}\n`;
        if (diff.lineNumber) {
          text += `   Line: ${diff.lineNumber}\n`;
        }
        text += `   Type: ${diff.type}\n`;
        text += '\n';
      });
    }

    text += '='.repeat(80) + '\n';
    text += `Generated on ${new Date().toLocaleString()}\n`;
    text += '='.repeat(80) + '\n';

    return text;
  }

  getPdfContent(): PdfContentSection[] {
    const sections: PdfContentSection[] = [];

    // Files metadata
    sections.push({
      type: 'subtitle',
      content: 'Compared Documents',
    });

    sections.push({
      type: 'text',
      content: `File 1: ${this.result.file1.name}`,
    });

    sections.push({
      type: 'text',
      content: `File 2: ${this.result.file2.name}`,
    });

    sections.push({ type: 'separator', content: '' });

    // Similarity
    sections.push({
      type: 'title',
      content: `Similarity: ${this.result.similarity}%`,
    });

    // Differences
    if (this.result.differences.length > 0) {
      sections.push({
        type: 'subtitle',
        content: `Found ${this.result.differences.length} differences`,
      });

      this.result.differences.forEach((diff, index) => {
        sections.push({
          type: 'text',
          content: `${index + 1}. ${diff.description}\n   Section: ${diff.section}\n   Type: ${diff.type}`,
        });
      });
    }

    return sections;
  }

  getDocxContent(): DocxContentSection[] {
    const sections: DocxContentSection[] = [];

    // Files
    sections.push({
      type: 'heading2',
      content: 'Compared Documents',
    });

    sections.push({
      type: 'paragraph',
      content: `File 1: ${this.result.file1.name}`,
    });

    sections.push({
      type: 'paragraph',
      content: `File 2: ${this.result.file2.name}`,
      spacing: { after: 400 },
    });

    // Similarity
    sections.push({
      type: 'heading2',
      content: `Similarity: ${this.result.similarity}%`,
    });

    // Differences
    if (this.result.differences.length > 0) {
      sections.push({
        type: 'heading2',
        content: 'Differences',
        spacing: { before: 400 },
      });

      this.result.differences.forEach((diff) => {
        sections.push({
          type: 'bullet',
          content: `${diff.description} (${diff.type})`,
        });
      });
    }

    return sections;
  }
}