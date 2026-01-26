import {
    Component,
    ChangeDetectionStrategy,
    Input,
    inject,
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
import { SummarizeFile, SummaryResult } from '../../../utils/tplsInterfaces/summarizeTpl.interface';
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
    isDark$!: Observable<boolean>;
    private store = inject(Store);

    @Input() result!: SummaryResult;
    @Input() showDetails = true;

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

   

    getReductionColor(): string {
        const reduction = this.result.wordCount.reduction;
        if (reduction >= 70) return 'success';
        if (reduction >= 50) return 'primary';
        return 'accent';
    }
}