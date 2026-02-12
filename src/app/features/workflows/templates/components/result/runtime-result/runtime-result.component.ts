import {
    Component,
    ChangeDetectionStrategy,
    Input,
    ViewChild,
    ElementRef,
    inject,
    OnInit,
    signal,
    computed,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { MatIconModule } from '@angular/material/icon';
import { MatButtonModule } from '@angular/material/button';
import { MatExpansionModule } from '@angular/material/expansion';
import { MatChipsModule } from '@angular/material/chips';
import { MatTooltipModule } from '@angular/material/tooltip';
import { MatCardModule } from '@angular/material/card';
import { TranslateModule } from '@ngx-translate/core';
import { Store } from '@ngrx/store';
import { Observable } from 'rxjs';
import { marked } from 'marked';
import { Clipboard } from '@angular/cdk/clipboard';

import { AppSelectors } from '@cadai/pxs-ng-core/store';
import { iconFor } from '@features/workflows/templates/utils/fileIcon';
import { DocumentExportService } from '../../../services/document-export.service';
import { SummaryExportAdapter } from '../../../utils/summary-export.adapter';
import { ExportFormat } from '../../../utils/document-export.interface';
import { ExportOverlayComponent } from '../../export-overlay/export-overlay.component';
import {
    SummarizeFile,
    SummaryLength,
    SummaryResult,
    SummaryStyle,
} from '../../../utils/tplsInterfaces/summarizeTpl.interface';

@Component({
    selector: 'app-runtime-result-tpl',
    standalone: true,
    imports: [
        CommonModule,
        MatIconModule,
        MatButtonModule,
        MatExpansionModule,
        MatChipsModule,
        MatTooltipModule,
        MatCardModule,
        TranslateModule,
        ExportOverlayComponent,
    ],
    templateUrl: './runtime-result.component.html',
    styleUrls: ['./runtime-result.component.scss'],
    changeDetection: ChangeDetectionStrategy.OnPush,
})
export class RuntimeResultComponent implements OnInit {
    isDark$!: Observable<boolean>;
    private readonly store = inject(Store);
    readonly exportService = inject(DocumentExportService);
    private readonly clipboard = inject(Clipboard);
    readonly copied = signal(false);
    readonly actionResult = computed(() => this.resolveActionResult());

    @ViewChild('runtimeResultContainer', { read: ElementRef })
    runtimeResultContainer?: ElementRef;

    private readonly _result = signal<SummaryResult | null>(null);
    private readonly _markdownContent = signal<string>('');
    private _mode: 'result' | 'markdown' = 'result';
    private readonly _preloaded = signal(false);

    @Input() showDetails = true;
    @Input() set preloaded(value: boolean) {
        this._preloaded.set(!!value);
    }

    @Input() set mode(value: 'result' | 'markdown') {
        this._mode = value ?? 'result';
        if (this._mode === 'markdown') {
            this._result.set(null);
        } else {
            this._markdownContent.set('');
        }
    }

    get mode(): 'result' | 'markdown' {
        return this._mode;
    }

    @Input() set title(_value: string) {
        // API compatibility with runtime panel bindings.
    }

    @Input() set result(value: SummaryResult | null | undefined) {
        this._result.set(value ? this.normalizeSummaryResult(value) : null);
    }

    get result(): SummaryResult | null {
        return this._result();
    }

    @Input() set value(value: unknown) {
        const unwrapped = this.unwrapValue(value);
        if (this._mode === 'markdown') {
            this._result.set(null);
            this._markdownContent.set(this.resolveMarkdownContent(unwrapped));
            return;
        }
        this._markdownContent.set('');
        this._result.set(this.isSummaryResult(unwrapped) ? this.normalizeSummaryResult(unwrapped) : null);
    }

    isPreloadedMode$(): boolean {
        return this._preloaded();
    }

    get hasMarkdownContent(): boolean {
        return this._markdownContent().trim().length > 0;
    }

    ngOnInit(): void {
        this.isDark$ = this.store.select(AppSelectors.ThemeSelectors.selectIsDark);
    }

    getFileIcon(file: SummarizeFile): string {
        return iconFor(file);
    }

    formatFileSize(bytes: number): string {
        if (bytes === 0) return '0 Bytes';
        const k = 1024;
        const sizes = ['Bytes', 'KB', 'MB', 'GB'];
        const i = Math.floor(Math.log(bytes) / Math.log(k));
        return Math.round((bytes / Math.pow(k, i)) * 100) / 100 + ' ' + sizes[i];
    }

    getStyleIcon(): string {
        if (!this.result) return 'notes';
        const icons: Record<SummaryStyle, string> = {
            bullets: 'format_list_bulleted',
            paragraph: 'notes',
            executive: 'business_center',
        };
        return icons[this.result.style] || 'notes';
    }

    getLengthIcon(): string {
        if (!this.result) return 'subject';
        const icons: Record<SummaryLength, string> = {
            short: 'short_text',
            medium: 'subject',
            long: 'description',
        };
        return icons[this.result.length] || 'subject';
    }

    getReductionColor(): string {
        const reduction = this.result?.wordCount?.reduction ?? 0;
        if (reduction >= 70) return 'success';
        if (reduction >= 50) return 'primary';
        return 'accent';
    }

    renderedMarkdown(): string {
        const markdown = this._markdownContent();
        if (!markdown) return '';
        return this.renderMarkdown(markdown);
    }

    async handleExport(event: { format: ExportFormat; result: SummaryResult }): Promise<void> {
        const { format, result } = event;
        if (!result) {
            return;
        }

        const adapter = new SummaryExportAdapter(result);
        await this.exportService.export(adapter, {
            format,
            filename: `summary-${result.id}.${format === 'docx' ? 'docx' : format === 'pdf' ? 'pdf' : 'txt'}`,
            includeScreenshot: format === 'pdf' || format === 'docx',
            screenshotElement: this.runtimeResultContainer,
            screenshotSelector: '.summary-result-container',
            metadata: {
                Style: result.style,
                Length: result.length,
                Language: result.language.toUpperCase(),
                'File Count': result.files.length.toString(),
                'Created Date': new Date(result.createdAt).toLocaleDateString(),
            },
        });
    }

    copyToClipboard(): void {
        const exportResult = this.actionResult();
        if (!exportResult) {
            return;
        }

        const text = this.formatSummaryForExport(exportResult);
        if (!text) {
            return;
        }

        const success = this.clipboard.copy(text);
        if (success) {
            this.copied.set(true);
            setTimeout(() => this.copied.set(false), 2000);
        }
    }

    clearAll(): void {
        this._result.set(null);
        this._markdownContent.set('');
    }

    canClear(): boolean {
        return !!this.result || this.hasMarkdownContent;
    }

    private renderMarkdown(markdown: string): string {
        try {
            return marked.parse(markdown) as string;
        } catch {
            return markdown;
        }
    }

    private resolveMarkdownContent(value: unknown): string {
        if (typeof value === 'string') {
            return value;
        }
        if (this.isSummaryResult(value)) {
            return value.summary;
        }
        if (this.isRecord(value)) {
            for (const key of ['markdown', 'content', 'text', 'summary']) {
                const candidate = value[key];
                if (typeof candidate === 'string') {
                    return candidate;
                }
            }
        }
        return '';
    }

    private resolveActionResult(): SummaryResult | null {
        const result = this.result;
        if (result) {
            return result;
        }

        if (this._mode === 'markdown' && this.hasMarkdownContent) {
            return this.createResultFromMarkdown(this._markdownContent());
        }

        return null;
    }

    private createResultFromMarkdown(markdown: string): SummaryResult {
        const plain = this.toPlainText(markdown);
        const words = this.wordCount(plain);
        return {
            id: crypto.randomUUID(),
            files: [],
            summary: this.renderMarkdown(markdown),
            keyPoints: [],
            wordCount: {
                original: words,
                summary: words,
                reduction: 0,
            },
            style: 'paragraph',
            length: 'medium',
            language: 'en',
            status: 'completed',
            createdAt: new Date(),
            completedAt: new Date(),
        };
    }

    private formatSummaryForExport(result: SummaryResult): string | null {
        if (!result) {
            return null;
        }

        let text = `${result.summary.replace(/<[^>]*>/g, '')}\n\n`;

        if (result.keyPoints.length > 0) {
            text += 'Key Points:\n';
            result.keyPoints.forEach((point, index) => {
                text += `${index + 1}. ${point}\n`;
            });
        }

        text += `\n---\n`;
        text += `Original: ${result.wordCount.original} words\n`;
        text += `Summary: ${result.wordCount.summary} words\n`;
        text += `Reduction: ${result.wordCount.reduction}%\n`;
        return text;
    }

    private toPlainText(value: string): string {
        return value
            .replace(/```[\s\S]*?```/g, ' ')
            .replace(/<[^>]+>/g, ' ')
            .replace(/[#*_`>~-]/g, ' ')
            .replace(/\s+/g, ' ')
            .trim();
    }

    private wordCount(value: string): number {
        if (!value.trim()) return 0;
        return value.trim().split(/\s+/).length;
    }

    private normalizeSummaryResult(result: SummaryResult): SummaryResult {
        const createdAt = this.toDate(result.createdAt);
        const completedAt = result.completedAt ? this.toDate(result.completedAt) : undefined;

        return {
            ...result,
            files: Array.isArray(result.files) ? result.files : [],
            keyPoints: Array.isArray(result.keyPoints) ? result.keyPoints : [],
            createdAt,
            completedAt,
            wordCount: result.wordCount ?? { original: 0, summary: 0, reduction: 0 },
            language: result.language || 'en',
            style: this.isSummaryStyle(result.style) ? result.style : 'paragraph',
            length: this.isSummaryLength(result.length) ? result.length : 'medium',
        };
    }

    private unwrapValue(value: unknown): unknown {
        if (!this.isRecord(value)) {
            return value;
        }
        for (const key of ['result', 'data', 'value', 'payload']) {
            if (Object.prototype.hasOwnProperty.call(value, key) && value[key] !== undefined) {
                return value[key];
            }
        }
        return value;
    }

    private toDate(value: unknown): Date {
        if (value instanceof Date) return value;
        if (typeof value === 'string' || typeof value === 'number') {
            const parsed = new Date(value);
            if (!Number.isNaN(parsed.getTime())) {
                return parsed;
            }
        }
        return new Date();
    }

    private isSummaryStyle(value: unknown): value is SummaryStyle {
        return value === 'bullets' || value === 'paragraph' || value === 'executive';
    }

    private isSummaryLength(value: unknown): value is SummaryLength {
        return value === 'short' || value === 'medium' || value === 'long';
    }

    private isSummaryResult(value: unknown): value is SummaryResult {
        return this.isRecord(value)
            && typeof value['summary'] === 'string'
            && Array.isArray(value['keyPoints'])
            && this.isRecord(value['wordCount']);
    }

    private isRecord(value: unknown): value is Record<string, unknown> {
        return !!value && typeof value === 'object';
    }
}
