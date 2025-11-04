import {
    Component,
    ChangeDetectionStrategy,
    Input,
    inject,
    signal,
    OnInit
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { MatIconModule } from '@angular/material/icon';
import { MatButtonModule } from '@angular/material/button';
import { MatExpansionModule } from '@angular/material/expansion';
import { MatChipsModule } from '@angular/material/chips';
import { MatTooltipModule } from '@angular/material/tooltip';
import { MatCardModule } from '@angular/material/card';
import { TranslateModule } from '@ngx-translate/core';
import { Clipboard } from '@angular/cdk/clipboard';
import { SummarizeFile, SummaryResult } from '../../../utils/summarizeTpl.interface';
import { iconFor } from '@features/workflows/templates/utils/fileIcon';
import { Store } from '@ngrx/store';
import { AppSelectors } from '@cadai/pxs-ng-core/store';
import { Observable } from 'rxjs';

@Component({
    selector: 'app-summary-result-tpl',
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
    ],
    templateUrl: './summarize-result.component.html',
    styleUrls: ['./summarize-result.component.scss'],
    changeDetection: ChangeDetectionStrategy.OnPush,
})
export class SummaryResultComponent implements OnInit {
    private clipboard = inject(Clipboard);
    isDark$!: Observable<boolean>;
    private store = inject(Store);

    @Input() result!: SummaryResult;
    @Input() showDetails = true;

    ngOnInit(): void {
        this.isDark$ = this.store.select(AppSelectors.ThemeSelectors.selectIsDark);
    }

    copied = signal(false);

    getFileIcon(file: SummarizeFile): string {
        return iconFor(file);
    }

    formatFileSize(bytes: number): string {
        if (bytes === 0) return '0 Bytes';
        const k = 1024;
        const sizes = ['Bytes', 'KB', 'MB', 'GB'];
        const i = Math.floor(Math.log(bytes) / Math.log(k));
        return Math.round(bytes / Math.pow(k, i) * 100) / 100 + ' ' + sizes[i];
    }

    getStyleIcon(): string {
        const icons = {
            bullets: 'format_list_bulleted',
            paragraph: 'notes',
            executive: 'business_center',
        };
        return icons[this.result.style] || 'notes';
    }

    getLengthIcon(): string {
        const icons = {
            short: 'short_text',
            medium: 'subject',
            long: 'description',
        };
        return icons[this.result.length] || 'subject';
    }

    copyToClipboard(): void {
        const text = this.formatSummaryForExport();
        const success = this.clipboard.copy(text);

        if (success) {
            this.copied.set(true);
            setTimeout(() => this.copied.set(false), 2000);
        }
    }

    private formatSummaryForExport(): string {
        let text = `${this.result.summary}\n\n`;

        if (this.result.keyPoints.length > 0) {
            text += 'Key Points:\n';
            this.result.keyPoints.forEach((point, index) => {
                text += `${index + 1}. ${point}\n`;
            });
        }

        text += `\n---\n`;
        text += `Original: ${this.result.wordCount.original} words\n`;
        text += `Summary: ${this.result.wordCount.summary} words\n`;
        text += `Reduction: ${this.result.wordCount.reduction}%\n`;

        return text;
    }

    getReductionColor(): string {
        const reduction = this.result.wordCount.reduction;
        if (reduction >= 70) return 'success';
        if (reduction >= 50) return 'primary';
        return 'accent';
    }
}