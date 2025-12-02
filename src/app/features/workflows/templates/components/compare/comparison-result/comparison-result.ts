import {
  Component,
  ChangeDetectionStrategy,
  Input,
  inject,
  OnInit,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { MatIconModule } from '@angular/material/icon';
import { MatExpansionModule } from '@angular/material/expansion';
import { MatChipsModule } from '@angular/material/chips';
import { TranslateModule } from '@ngx-translate/core';
import { CompareFile, ComparisonResult } from '../../../utils/tplsInterfaces/compareTpl.interface';
import { MatTooltipModule } from '@angular/material/tooltip';
import { MatButtonModule } from '@angular/material/button';
import { Observable } from 'rxjs';
import { Store } from '@ngrx/store';
import { AppSelectors } from '@cadai/pxs-ng-core/store';
import { iconFor } from '@features/workflows/templates/utils/fileIcon';

@Component({
  selector: 'app-comparison-result-tpl',
  standalone: true,
  imports: [
    CommonModule,
    MatIconModule,
    MatExpansionModule,
    MatChipsModule,
    TranslateModule,
    MatTooltipModule,
    MatButtonModule,
  ],
  template: `
    <div class="comparison-result-container">

      @if (result) {
        <!-- PRELOADED MODE: Show loaded files -->
        <div class="preloaded-files-section">
          <div class="preloaded-files-header">
            <mat-icon color="primary">folder_open</mat-icon>
            <span>{{ 'compareTpl.loadedFiles' | translate }}</span>                
          </div>
          <div class="preloaded-files-grid">
            <!-- File 1 -->
            @if (result.file1) {
              <div class="file-card">
                <div class="file-card-header">
                  <mat-icon [color]="(isDark$ | async) ? 'accent' : 'primary'">
                    {{ getFileIcon(result.file1!) }}
                  </mat-icon>
                  <span class="file-badge">{{ 'compareTpl.file1' | translate }}</span>
                </div>
                <div class="file-card-body">
                  <div class="file-name" [matTooltip]="result.file1!.name">
                    {{ result.file1!.name }}
                  </div>
                  <div class="file-details">
                    <span class="file-size">{{ formatFileSize(result.file1!.size) }}</span>
                    @if (result.file1!.uploadDate) {
                      <span class="file-date">{{ result.file1!.uploadDate | date: 'short' }}</span>
                    }
                  </div>
                </div>
              </div>
            }

            <!-- VS Divider -->
            <div class="files-divider">
              <mat-icon [color]="(isDark$ | async) ? 'neutral' : 'primary'">compare_arrows</mat-icon>
            </div>

            <!-- File 2 -->
            @if (result.file2) {
              <div class="file-card">
                <div class="file-card-header">
                  <mat-icon [color]="(isDark$ | async) ? 'success' : 'accent'">
                    {{ getFileIcon(result.file2!) }}
                  </mat-icon>
                  <span class="file-badge accent">{{ 'compareTpl.file2' | translate }}</span>
                </div>
                <div class="file-card-body">
                  <div class="file-name" [matTooltip]="result.file2!.name">
                    {{ result.file2!.name }}
                  </div>
                  <div class="file-details">
                    <span class="file-size">{{ formatFileSize(result.file2!.size) }}</span>
                    @if (result.file2!.uploadDate) {
                      <span class="file-date">{{ result.file2!.uploadDate | date: 'short' }}</span>
                    }
                  </div>
                </div>
              </div>
            }
          </div>
        </div>

        <!-- Summary -->
        <div class="result-summary">
          <div class="summary-item">
            <mat-icon [class]="getDifferenceIcon('added').class">{{ getDifferenceIcon('added').icon }}</mat-icon>
            <span>{{ getCountByType('added') }} {{ 'compareTpl.added' | translate }}</span>
          </div>
          <div class="summary-item">
            <mat-icon [class]="getDifferenceIcon('removed').class">{{ getDifferenceIcon('removed').icon }}</mat-icon>
            <span>{{ getCountByType('removed') }} {{ 'compareTpl.removed' | translate }}</span>
          </div>
          <div class="summary-item">
            <mat-icon [class]="getDifferenceIcon('modified').class">{{ getDifferenceIcon('modified').icon }}</mat-icon>
            <span>{{ getCountByType('modified') }} {{ 'compareTpl.modified' | translate }}</span>
          </div>
        </div>

        <!-- Differences List -->
        @if (showDetails && result.differences.length > 0) {
          <mat-accordion class="differences-list" multi>
            @for (diff of result.differences; track diff.id) {
              <mat-expansion-panel [expanded]="true">
                <mat-expansion-panel-header>
                  <mat-panel-title>
                    <mat-icon [class]="getDifferenceIcon(diff.type).class">
                      {{ getDifferenceIcon(diff.type).icon }}
                    </mat-icon>
                    <span class="diff-section">{{ diff.section }}</span>
                    <mat-chip [class]="'chip-' + diff.type">
                      {{ 'compareTpl.' + diff.type | translate }}
                    </mat-chip>
                  </mat-panel-title>
                </mat-expansion-panel-header>

                <div class="diff-content">
                  <p class="diff-description">{{ diff.description }}</p>
                  
                  @if (diff.lineNumber) {
                    <p class="diff-line">{{ 'compareTpl.line' | translate }}: {{ diff.lineNumber }}</p>
                  }

                  <div class="diff-comparison">
                    @if (diff.file1Content) {
                      <div class="diff-block file1">
                        <div class="diff-block-header">{{ 'compareTpl.file1' | translate }}</div>
                        <pre>{{ diff.file1Content }}</pre>
                      </div>
                    }

                    @if (diff.file2Content) {
                      <div class="diff-block file2">
                        <div class="diff-block-header">{{ 'compareTpl.file2' | translate }}</div>
                        <pre>{{ diff.file2Content }}</pre>
                      </div>
                    }
                  </div>
                </div>
              </mat-expansion-panel>
            }
          </mat-accordion>
        }

        @if (result.differences.length === 0) {
          <div class="no-differences">
            <mat-icon>check_circle</mat-icon>
            <p>{{ 'compareTpl.noDifferences' | translate }}</p>
          </div>
        }
      }
    </div>
  `,
  styles: [`
    .preloaded-files-section {
      display: flex;
      flex-direction: column;
      gap: 24px;

      .preloaded-files-header {
        display: flex;
        align-items: center;
        gap: 12px;
        padding-bottom: 16px;
        border-bottom: 1px solid var(--mat-sys-outline-variant);

        mat-icon {
          font-size: 24px;
          width: 24px;
          height: 24px;
        }

        span {
          font-size: 18px;
          font-weight: 500;
          color: var(--mat-sys-on-surface);
        }
      }

      .preloaded-files-grid {
        display: grid;
        grid-template-columns: 1fr auto 1fr;
        gap: 24px;
        align-items: center;

        .files-divider {
          display: flex;
          align-items: center;
          justify-content: center;
          padding: 0 16px;

          mat-icon {
            font-size: 32px;
            width: 32px;
            height: 32px;
          }
        }
      }
    }
    
    .file-card {
      display: flex;
      flex-direction: column;
      gap: 12px;
      padding: 20px;
      border: 2px solid var(--mat-primary);
      border-radius: 12px;
      background: var(--mat-sys-surface-container);
      transition: all 0.2s ease;

      &:hover {
        border-color: var(--mat-sys-primary);
        box-shadow: var(--mat-sys-level1);
      }

      .file-card-header {
        display: flex;
        align-items: center;
        gap: 12px;
        padding-bottom: 12px;
        border-bottom: 1px solid var(--mat-sys-outline-variant);

        mat-icon {
          font-size: 50px;
          width: 50px;
          height: 50px;
          color: var(--mat-primary)
        }

        .file-badge {
          padding: 4px 12px;
          border-radius: 12px;
          background: var(--mat-sys-primary-container);
          color: var(--mat-sys-on-primary-container);
          font-size: 12px;
          font-weight: 500;
          text-transform: uppercase;

          &.accent {
            background: var(--mat-sys-secondary-container);
            color: var(--mat-sys-on-secondary-container);
          }
        }
      }

      .file-card-body {
        display: flex;
        flex-direction: column;
        gap: 8px;

        .file-name {
          font-size: 16px;
          font-weight: 500;
          color: var(--mat-sys-on-surface);
          overflow: hidden;
          text-overflow: ellipsis;
          white-space: nowrap;
        }

        .file-details {
          display: flex;
          align-items: center;
          gap: 12px;
          font-size: 12px;
          color: var(--mat-sys-on-surface-variant);

          .file-size {
            font-weight: 500;
          }

          .file-date {
            opacity: 0.8;
          }
        }
      }
    }



    @media (max-width: 768px) {
      .preloaded-files-grid {
        grid-template-columns: 1fr;
        gap: 16px;

        .files-divider {
          padding: 0;

          mat-icon {
            transform: rotate(90deg);
          }
        }
      }
    }
    .comparison-result-container {
      display: flex;
      flex-direction: column;
      gap: 16px;
    }

    .added {
      color: var(--mat-success);
    }
    .removed {
        color: var(--mat-accent);
    }
    .modified {
        color: var(--mat-primary);
    }
    .result-summary {
      display: flex;
      gap: 24px;
      padding: 16px;
      background: var(--mat-sys-surface-container);
      border-radius: 8px;

      .summary-item {
        display: flex;
        align-items: center;
        gap: 8px;
        font-size: 14px;

        mat-icon {
          font-size: 20px;
          width: 20px;
          height: 20px;
        }
      }
    }

    .differences-list {
      mat-expansion-panel-header {
        mat-panel-title {
          display: flex;
          align-items: center;
          gap: 12px;

          mat-icon {
            font-size: 20px;
            width: 20px;
            height: 20px;
          }

          .diff-section {
            flex: 1;
            font-weight: 500;
          }

        }
      }
    }

    .diff-content {
      padding: 16px 0;

      .diff-description {
        margin: 0 0 8px 0;
        color: var(--mat-sys-on-surface);
      }

      .diff-line {
        margin: 0 0 16px 0;
        font-size: 12px;
        color: var(--mat-neutral);
      }

      .diff-comparison {
        display: grid;
        grid-template-columns: 1fr 1fr;
        gap: 16px;

        .diff-block {
          border-radius: 8px;
          overflow: hidden;

          &.file1 {
            border: 2px solid var(--mat-accent);
          }

          &.file2 {
            border: 2px solid var(--mat-success);
          }

          .diff-block-header {
            padding: 8px 12px;
            font-size: 12px;
            font-weight: 500;
            background: var(--mat-sys-surface-container-high);
          }

          pre {
            margin: 0;
            padding: 12px;
            background: var(--mat-sys-surface-container);
            overflow-x: auto;
            font-size: 13px;
            line-height: 1.5;
          }
        }
      }
    }

    .no-differences {
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      padding: 48px;
      text-align: center;
      background: var(--mat-sys-primary-container);
      border-radius: 8px;

      mat-icon {
        font-size: 64px;
        width: 64px;
        height: 64px;
        color: var(--mat-sys-primary);
        margin-bottom: 16px;
      }

      p {
        margin: 0;
        font-size: 16px;
        color: var(--mat-sys-on-primary-container);
      }
    }

    @media (max-width: 768px) {
      .result-summary {
        flex-direction: column;
        gap: 12px;
      }

      .diff-comparison {
        grid-template-columns: 1fr !important;
      }
    }
  `],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ComparisonResultComponent implements OnInit {
  @Input() result!: ComparisonResult;
  @Input() showDetails = true;

  isDark$!: Observable<boolean>;
  private store = inject(Store);

  ngOnInit(): void {
    this.isDark$ = this.store.select(AppSelectors.ThemeSelectors.selectIsDark);
  }

  getCountByType(type: 'added' | 'removed' | 'modified'): number {
    return this.result.differences.filter(d => d.type === type).length;
  }

  getDifferenceIcon(type: 'added' | 'removed' | 'modified'): { icon: string; class: string; color: string } {
    const icons = {
      added: { icon: 'add_circle', class: 'added', color: 'success' },
      removed: { icon: 'remove_circle', class: 'removed', color: "accent" },
      modified: { icon: 'edit', class: 'modified', color: "primary" },
    };
    return icons[type];
  }


  /**
   * Get file icon
   */
  getFileIcon(file: CompareFile): string {
    return iconFor(file);
  }

  /**
   * Format file size for display
   */
  formatFileSize(bytes?: number): string {
    if (!bytes || bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return Math.round((bytes / Math.pow(k, i)) * 100) / 100 + ' ' + sizes[i];
  }

}