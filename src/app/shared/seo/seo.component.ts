import { Component, Input, inject, OnChanges, SimpleChanges, Output, EventEmitter } from '@angular/core';
import { Title } from '@angular/platform-browser';
import { Meta } from '@angular/platform-browser';

@Component({
  selector: 'app-seo',
  standalone: true,
  template: '', // No UI needed
})
export class SeoComponent implements OnChanges {
  private titleService = inject(Title);
  private metaService = inject(Meta);

  @Input() pageTitle = '';
  @Input() description = '';
  @Input() keywords = '';
  @Output() titleChange = new EventEmitter<string>();

  ngOnChanges(changes: SimpleChanges): void {
    if (changes['pageTitle'] && this.pageTitle) {
      Promise.resolve().then(() => {
        this.titleService.setTitle(this.pageTitle);
        this.titleChange.emit(this.pageTitle);
      });
    }

    if (changes['description'] && this.description) {
      this.metaService.updateTag({ name: 'description', content: this.description });
    }

    if (changes['keywords'] && this.keywords) {
      this.metaService.updateTag({ name: 'keywords', content: this.keywords });
    }
  }
}