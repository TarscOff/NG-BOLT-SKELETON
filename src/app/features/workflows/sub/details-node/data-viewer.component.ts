import { CommonModule } from '@angular/common';
import { Component, Input, TemplateRef, ContentChild, computed } from '@angular/core';

@Component({
  selector: 'app-data-viewer',
  standalone: true,
  imports: [CommonModule],
  styles: [`
    :host { display:block; }
    .kv { display:grid; grid-template-columns: max-content 1fr; gap:.25rem .75rem; }
    .k  { color:#666; white-space:nowrap; }
    .v  { word-break:break-word; }
    details { margin:.25rem 0; }
    .arr, .obj { border:1px solid rgba(0,0,0,.08); border-radius:.5rem; padding:.5rem .75rem; }
    .pill { display:inline-flex; align-items:center; padding:.15rem .5rem; border-radius:999px; border:1px solid rgba(0,0,0,.1)}
    .list { display:grid; gap:.25rem; }
    pre { margin:0; white-space:pre-wrap; }
  `],
  template: `
    <ng-container *ngIf="customTpl; else auto">
      <ng-container *ngTemplateOutlet="customTpl; context: {$implicit: data}"></ng-container>
    </ng-container>

    <ng-template #auto>
      <ng-container [ngSwitch]="kind()">

        <span *ngSwitchCase="'null'" class="pill">null</span>
        <span *ngSwitchCase="'string'" class="v">{{ data }}</span>
        <span *ngSwitchCase="'number'" class="v">{{ data }}</span>
        <span *ngSwitchCase="'boolean'" class="pill">{{ data ? 'true' : 'false' }}</span>

            <div *ngSwitchCase="'array'" class="arr list">
      <details open>
        <summary>{{ ($any(data)?.length ?? 0) }} item(s)</summary>
        <ol class="list" style="margin:0; padding-left:1.25rem;">
          <li *ngFor="let item of $any(data); index as i">
            <app-data-viewer [data]="item"></app-data-viewer>
          </li>
        </ol>
      </details>
    </div>

    <div *ngSwitchCase="'object'" class="obj">
      <details open>
        <summary>{{ objKeys().length }} field(s)</summary>
        <div class="kv">
          <ng-container *ngFor="let k of objKeys()">
            <div class="k">{{ k }}</div>
            <div class="v">
              <app-data-viewer [data]="$any(data)[k]"></app-data-viewer>
            </div>
          </ng-container>
        </div>
      </details>
    </div>


        <pre *ngSwitchDefault>{{ data | json }}</pre>
      </ng-container>
    </ng-template>
  `
})
export class DataViewerComponent {
  @Input() data: unknown;
  @ContentChild(TemplateRef) customTpl?: TemplateRef<unknown>;

  kind = computed<'null' | 'string' | 'number' | 'boolean' | 'array' | 'object' | 'other'>(() => {
    const d = this.data;
    if (d === null || d === undefined) return 'null';
    if (Array.isArray(d)) return 'array';
    const t = typeof d;
    if (t === 'string' || t === 'number' || t === 'boolean') return t;
    if (t === 'object') return 'object';
    return 'other';
  });

  objKeys = computed<string[]>(() => {
    if (this.kind() !== 'object') return [];
    try { return Object.keys(this.data as object); } catch { return []; }
  });
}
