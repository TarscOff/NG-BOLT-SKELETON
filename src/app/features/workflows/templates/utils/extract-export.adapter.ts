import { ExtractionResult, ExtractedEntity } from "./tplsInterfaces/extractTpl.interface";
import { DocxContentSection, ExportableContent, PdfContentSection } from "./document-export.interface";

/**
 * Adapter to convert ExtractionResult to ExportableContent
 */
export class ExtractionExportAdapter implements ExportableContent {
  constructor(private result: ExtractionResult) {}

  get id(): string {
    return this.result.id;
  }

  public readonly title = 'Entity Extraction Report';

  get createdAt(): Date {
    return new Date();
  }

  getTextContent(): string {
    let text = '='.repeat(80) + '\n';
    text += `ENTITY EXTRACTION REPORT\n`;
    text += '='.repeat(80) + '\n\n';

    // Metadata
    text += 'EXTRACTION DETAILS:\n';
    text += '-'.repeat(80) + '\n';
    text += `Status: ${this.result.status}\n`;
    text += `Total Entities Found: ${this.result.totalEntitiesFound}\n`;
    
    if (this.result.error) {
      text += `Error: ${this.result.error}\n`;
    }
    text += '\n';

    // Files Processed
    if (this.result.files.length > 0) {
      text += 'FILES PROCESSED:\n';
      text += '-'.repeat(80) + '\n';
      this.result.files.forEach((file, index) => {
        text += `${index + 1}. ${file.name} (${this.formatFileSize(file.size)})\n`;
      });
      text += '\n';
    }

    // Extracted Entities
    if (this.result.entities.length > 0) {
      text += 'EXTRACTED ENTITIES:\n';
      text += '-'.repeat(80) + '\n';
      
      const groupedEntities = this.groupEntitiesByType();
      
      Object.entries(groupedEntities).forEach(([type, entities]) => {
        text += `\n${type.toUpperCase()} (${entities.length}):\n`;
        text += '-'.repeat(40) + '\n';
        
        entities.forEach((entity, index) => {
          text += `${index + 1}. ${entity.value}\n`;
          
          if (entity.context) {
            text += `   Context: "${entity.context}"\n`;
          }
          text += '\n';
        });
      });
    }

    // Source Text
    if (this.result.text) {
      text += 'SOURCE TEXT:\n';
      text += '-'.repeat(80) + '\n';
      text += `${this.result.text}\n`;
      text += '\n';
    }

    text += '='.repeat(80) + '\n';
    text += `Generated on ${new Date().toLocaleString()}\n`;
    text += '='.repeat(80) + '\n';

    return text;
  }

  getPdfContent(): PdfContentSection[] {
    const sections: PdfContentSection[] = [];

    // Extraction Details
    sections.push({
      type: 'subtitle',
      content: 'Extraction Details',
    });

    sections.push({
      type: 'text',
      content: `Status: ${this.result.status}`,
    });

    sections.push({
      type: 'text',
      content: `Total Entities Found: ${this.result.totalEntitiesFound}`,
    });

    if (this.result.error) {
      sections.push({
        type: 'text',
        content: `Error: ${this.result.error}`,
      });
    }

    sections.push({ type: 'separator', content: '' });

    // Files Processed
    if (this.result.files.length > 0) {
      sections.push({
        type: 'subtitle',
        content: 'Files Processed',
      });

      this.result.files.forEach((file, index) => {
        sections.push({
          type: 'text',
          content: `${index + 1}. ${file.name} (${this.formatFileSize(file.size)})`,
        });
      });

      sections.push({ type: 'separator', content: '' });
    }

    // Extracted Entities
    if (this.result.entities.length > 0) {
      sections.push({
        type: 'title',
        content: 'Extracted Entities',
      });

      const groupedEntities = this.groupEntitiesByType();

      Object.entries(groupedEntities).forEach(([type, entities]) => {
        sections.push({
          type: 'subtitle',
          content: `${type} (${entities.length})`,
        });

        entities.forEach((entity, index) => {
          let entityText = `${index + 1}. ${entity.value}`;
          
          if (entity.context) {
            entityText += `\n   Context: "${entity.context}"`;
          }

          sections.push({
            type: 'text',
            content: entityText,
          });
        });

        sections.push({ type: 'separator', content: '' });
      });
    }

    // Source Text
    if (this.result.text) {
      sections.push({
        type: 'subtitle',
        content: 'Source Text',
      });

      sections.push({
        type: 'text',
        content: this.result.text,
      });
    }

    return sections;
  }

  getDocxContent(): DocxContentSection[] {
    const sections: DocxContentSection[] = [];

    // Extraction Details
    sections.push({
      type: 'heading2',
      content: 'Extraction Details',
    });

    sections.push({
      type: 'paragraph',
      content: `Status: ${this.result.status}`,
    });

    sections.push({
      type: 'paragraph',
      content: `Total Entities Found: ${this.result.totalEntitiesFound}`,
    });

    if (this.result.error) {
      sections.push({
        type: 'paragraph',
        content: `Error: ${this.result.error}`,
        spacing: { after: 400 },
      });
    }

    // Files Processed
    if (this.result.files.length > 0) {
      sections.push({
        type: 'heading2',
        content: 'Files Processed',
        spacing: { before: 400 },
      });

      this.result.files.forEach((file) => {
        sections.push({
          type: 'bullet',
          content: `${file.name} (${this.formatFileSize(file.size)})`,
        });
      });
    }

    // Extracted Entities
    if (this.result.entities.length > 0) {
      sections.push({
        type: 'heading1',
        content: 'Extracted Entities',
        spacing: { before: 600 },
      });

      const groupedEntities = this.groupEntitiesByType();

      Object.entries(groupedEntities).forEach(([type, entities]) => {
        sections.push({
          type: 'heading2',
          content: `${type} (${entities.length})`,
          spacing: { before: 400 },
        });

        entities.forEach((entity) => {
          sections.push({
            type: 'bullet',
            content: entity.value,
          });

          if (entity.context) {
            sections.push({
              type: 'paragraph',
              content: `Context: "${entity.context}"`,
              spacing: { after: 200 },
            });
          }
        });
      });
    }

    // Source Text
    if (this.result.text) {
      sections.push({
        type: 'heading2',
        content: 'Source Text',
        spacing: { before: 400 },
      });

      sections.push({
        type: 'paragraph',
        content: this.result.text,
        spacing: { after: 400 },
      });
    }

    return sections;
  }

  private groupEntitiesByType(): Record<string, ExtractedEntity[]> {
    return this.result.entities.reduce((acc, entity) => {
      if (!acc[entity.type]) {
        acc[entity.type] = [];
      }
      acc[entity.type].push(entity);
      return acc;
    }, {} as Record<string, ExtractedEntity[]>);
  }

  private formatFileSize(bytes?: number): string {
    if (bytes === 0 || !bytes) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return Math.round((bytes / Math.pow(k, i)) * 100) / 100 + ' ' + sizes[i];
  }
}