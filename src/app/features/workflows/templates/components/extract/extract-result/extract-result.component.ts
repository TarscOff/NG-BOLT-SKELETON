import {
  Component,
  ChangeDetectionStrategy,
  Input,
  OnInit,
  computed,
  signal,
  inject,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { MatCardModule } from '@angular/material/card';
import { MatIconModule } from '@angular/material/icon';
import { MatButtonModule } from '@angular/material/button';
import { MatChipsModule } from '@angular/material/chips';
import { MatTooltipModule } from '@angular/material/tooltip';
import { MatExpansionModule } from '@angular/material/expansion';
import { MatDividerModule } from '@angular/material/divider';
import { MatBadgeModule } from '@angular/material/badge';
import { TranslateModule } from '@ngx-translate/core';
import { Store } from '@ngrx/store';
import { Observable } from 'rxjs';
import { AppSelectors } from '@cadai/pxs-ng-core/store';
import {
  ExtractionResult,
  ExtractFile,
} from '../../../utils/tplsInterfaces/extractTpl.interface';
import { iconFor } from '@features/workflows/templates/utils/fileIcon';

@Component({
  selector: 'app-extraction-result-tpl',
  standalone: true,
  imports: [
    CommonModule,
    TranslateModule,
    MatCardModule,
    MatIconModule,
    MatButtonModule,
    MatChipsModule,
    MatTooltipModule,
    MatExpansionModule,
    MatDividerModule,
    MatBadgeModule,
  ],
  templateUrl: './extract-result.component.html',
  styleUrls: ['./extract-result.component.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ExtractResultComponent implements OnInit {
  private store = inject(Store);

  @Input({ required: true }) result!: ExtractionResult;

  isDark$!: Observable<boolean>;

  // Signals
  private _selectedType = signal<string | null>(null);
  private _expandedGroups = signal<Set<string>>(new Set());

  // Computed properties
  selectedType$ = computed(() => this._selectedType());
  hasEntities$ = computed(() => this.result.entities.length > 0);
  hasFiles$ = computed(() => this.result.files.length > 0);
  hasSourceText$ = computed(() => !!this.result.text);

  filteredEntities$ = computed(() => {
    const selectedType = this._selectedType();
    if (!selectedType) {
      return this.result.entities;
    }
    return this.result.entities.filter(entity => entity.type === selectedType);
  });

  entityTypes$ = computed(() => {
    const types = new Set(this.result.entities.map(e => e.type));
    return Array.from(types).sort();
  });

  statusIcon$ = computed(() => {
    switch (this.result.status) {
      case 'completed':
        return 'check_circle';
      case 'processing':
        return 'hourglass_empty';
      case 'failed':
        return 'error';
      case 'pending':
        return 'schedule';
      default:
        return 'help';
    }
  });

  statusColor$ = computed(() => {
    switch (this.result.status) {
      case 'completed':
        return 'success';
      case 'processing':
        return 'primary';
      case 'failed':
        return 'warn';
      case 'pending':
        return 'neutral';
      default:
        return 'neutral';
    }
  });

  ngOnInit(): void {
    this.isDark$ = this.store.select(AppSelectors.ThemeSelectors.selectIsDark);
  }

  /**
   * Filter entities by type
   */
  filterByType(type: string | null): void {
    this._selectedType.set(type);
  }

  /**
   * Toggle group expansion
   */
  toggleGroup(type: string): void {
    const expanded = this._expandedGroups();
    const newExpanded = new Set(expanded);

    if (newExpanded.has(type)) {
      newExpanded.delete(type);
    } else {
      newExpanded.add(type);
    }

    this._expandedGroups.set(newExpanded);
  }

  /**
   * Check if group is expanded
   */
  isGroupExpanded(type: string): boolean {
    return this._expandedGroups().has(type);
  }

  /**
   * Get file icon
   */
  getFileIcon(file: ExtractFile): string {
    return iconFor(file);
  }

  /**
   * Format file size
   */
  formatFileSize(bytes?: number): string {
    if (bytes === 0 || !bytes) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return Math.round((bytes / Math.pow(k, i)) * 100) / 100 + ' ' + sizes[i];
  }

}