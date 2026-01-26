import { Injectable } from '@angular/core';
import { MatPaginatorIntl } from '@angular/material/paginator';
import { TranslateService } from '@ngx-translate/core';
import { Subject } from 'rxjs';

@Injectable()
export class CustomPaginatorIntl extends MatPaginatorIntl {
  override changes = new Subject<void>();

  constructor(private translate: TranslateService) {
    super();
    
    // Re-translate when language changes
    this.translate.onLangChange.subscribe(() => {
      this.translateLabels();
    });

    this.translateLabels();
  }

  private translateLabels(): void {
    this.itemsPerPageLabel = this.translate.instant('paginator.itemsPerPage');
    this.nextPageLabel = this.translate.instant('paginator.nextPage');
    this.previousPageLabel = this.translate.instant('paginator.previousPage');
    this.firstPageLabel = this.translate.instant('paginator.firstPage');
    this.lastPageLabel = this.translate.instant('paginator.lastPage');
    
    this.changes.next();
  }

  override getRangeLabel = (page: number, pageSize: number, length: number): string => {
    if (length === 0 || pageSize === 0) {
      return this.translate.instant('paginator.rangeLabel', { 
        start: 0, 
        end: 0, 
        total: length 
      });
    }

    const startIndex = page * pageSize;
    const endIndex = Math.min(startIndex + pageSize, length);

    return this.translate.instant('paginator.rangeLabel', { 
      start: startIndex + 1, 
      end: endIndex, 
      total: length 
    });
  };
}