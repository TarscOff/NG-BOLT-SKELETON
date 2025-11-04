import {
  Component,
  ChangeDetectionStrategy,
  Input,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { MatIconModule } from '@angular/material/icon';
import { MatExpansionModule } from '@angular/material/expansion';
import { MatChipsModule } from '@angular/material/chips';
import { TranslateModule } from '@ngx-translate/core';
import { ComparisonResult } from '../../../utils/compareTpl.interface';

@Component({
  selector: 'app-comparison-result-tpl',
  standalone: true,
  imports: [
    CommonModule,
    MatIconModule,
    MatExpansionModule,
    MatChipsModule,
    TranslateModule,
  ],
  template: `
    <div class="comparison-result-container">
      @if (result) {
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
export class ComparisonResultComponent {
  @Input() result!: ComparisonResult;
  @Input() showDetails = true;

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

}