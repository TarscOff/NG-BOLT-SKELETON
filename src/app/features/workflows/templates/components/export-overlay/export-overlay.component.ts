import { Component, inject, ChangeDetectionStrategy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatProgressBarModule } from '@angular/material/progress-bar';
import { MatIconModule } from '@angular/material/icon';
import { TranslateModule } from '@ngx-translate/core';
import { DocumentExportService } from '@features/workflows/templates/services/document-export.service';

@Component({
  selector: 'app-export-overlay-tpl',
  standalone: true,
  imports: [
    CommonModule,
    MatProgressSpinnerModule,
    MatProgressBarModule,
    MatIconModule,
    TranslateModule,
  ],
  template: `
    @if (exportService.isExporting$ | async) {
      <div class="export-overlay">
        <div class="export-loader-card">
          <mat-spinner diameter="60" color="primary"></mat-spinner>
          
          <div class="export-loader-content">
            <h3>{{ 'exportTpl.exporting' | translate }}</h3>
            
            @if (exportService.exportProgress$ | async; as progress) {
              <p class="export-stage">
                {{ 'exportTpl.stages.' + progress.stage | translate }}
              </p>
              <mat-progress-bar 
                mode="determinate" 
                [value]="progress.percent"
                color="primary"
              ></mat-progress-bar>
              <span class="export-percent">{{ progress.percent }}%</span>
            }
            
            @if (exportService.currentFormat$ | async; as format) {
              <div class="export-format-badge">
                <mat-icon>
                  @switch (format) {
                    @case ('pdf') { picture_as_pdf }
                    @case ('docx') { description }
                    @case ('txt') { notes }
                    @default { file_download }
                  }
                </mat-icon>
                <span>{{ format | uppercase }}</span>
              </div>
            }
          </div>
        </div>
      </div>
    }
  `,
  styleUrls: ['./export-overlay.component.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ExportOverlayComponent {
  exportService = inject(DocumentExportService);
}