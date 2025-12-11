import { Component, DoCheck, OnInit, inject, signal, Input } from '@angular/core';
import { CommonModule } from '@angular/common';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatTooltipModule } from '@angular/material/tooltip';
import { TranslateModule } from '@ngx-translate/core';

import { DrawFlowBaseNode } from '@ng-draw-flow/core';
import { DataViewerComponent } from './data-viewer.component';

import {
  PaletteType,
  PreferredTab,
  RESERVED_KEYS,
  ReservedKeys,
  RunNodeDTO,
  StripReservedShallow,
} from '../../templates/utils/workflow.interface';

import { WfCanvasBus } from '../../templates/utils/wf-canvas-bus';
import { Observable } from 'rxjs';
import { Store } from '@ngrx/store';
import { AppSelectors } from '@cadai/pxs-ng-core/store';

@Component({
  selector: 'app-wf-details-node',
  standalone: true,
  imports: [
    CommonModule,
    MatButtonModule,
    MatIconModule,
    MatTooltipModule,
    TranslateModule,
    DataViewerComponent,
  ],
  styles: [`
    :host { display:block; min-width:320px; max-width:760px; }
    .card { border:2px solid var(--mat-primary,#fff); border-radius:12px; background:var(--md-sys-color-surface,#fff);
            box-shadow:0 6px 24px rgba(0,0,0,.08); overflow:hidden; min-width:700px;}
    .card::before {
        content: "";
        position: absolute;
        inset: 0;
        height: 100%;
        width: 100%;
        background: linear-gradient(135deg, var(--mat-primary-variant), var(--mat-accent));
        opacity: .07;
    }
                .card.is-selected {
    outline: 2px solid #42a5f5;
    outline-offset: 5px;
}
    .hdr { display:flex; align-items:center; gap:.5rem; padding:.5rem .75rem;}
    .title {     font-weight: 600;color: var(--mat-primary, #fff); flex:1 1 auto; white-space:nowrap; overflow:hidden; text-overflow:ellipsis; }
    .tabs { display:flex; gap:.25rem; padding:10px 15px; border-bottom:1px solid var(--md-sys-surface); flex-wrap:wrap; }
    .tab.is-active { outline:1px solid rgba(0,0,0,.18); }
    .body { padding:.75rem; max-height:420px; overflow:auto; }
    .kv { display:grid; grid-template-columns: max-content 1fr; gap:.25rem .75rem; }
    .k { color:#666; white-space:nowrap; }
    .pill { display:inline-flex; align-items:center; padding:.1rem .5rem; border-radius:999px; border:1px solid rgba(0,0,0,.1); }
  `],
  template: `
    <div class="card" (dblclick)="$event.stopPropagation()" [attr.data-node-id]="nodeId">
      <div class="hdr">
        <mat-icon [color]="(isDark$ |async) ?'neutral': 'success' ">details</mat-icon>
        <div class="title"> {{"workflow.runPanel.details" | translate}} : {{ computedTitle() | translate }}</div>

        <button mat-icon-button (click)="closePanel()" [matTooltip]="'close' | translate"  [color]="(isDark$ |async) ?'neutral': 'primary' ">
          <mat-icon>{{'close'}}</mat-icon>
        </button>
        <button mat-icon-button (click)="collapsed.set(!collapsed())" [matTooltip]="(collapsed() ? 'untoggle' : 'toggle') | translate"  [color]="(isDark$ |async) ?'neutral': 'primary' ">
          <mat-icon>{{ collapsed() ? 'expand_more' : 'expand_less' }}</mat-icon>
        </button>
      </div>

      <ng-container *ngIf="!collapsed()">
        <div class="tabs">
          <button *ngFor="let t of tabs"
          mat-flat-button
                  class="tab primary"
                  [class.accent]="t === currentTab()"
                  (click)="currentTab.set(t)">
            {{ "workflow.runPanel."+t | translate}}
          </button>
        </div>

        <div class="body">
          <ng-container [ngSwitch]="currentTab()">

            <app-data-viewer *ngSwitchCase="'auto'" [data]="autoData()"></app-data-viewer>

            <app-data-viewer *ngSwitchCase="'params'" [data]="dto()?.params"></app-data-viewer>
            <app-data-viewer *ngSwitchCase="'results'" [data]="dto()?.result"></app-data-viewer>
            <app-data-viewer *ngSwitchCase="'error'"  [data]="dto()?.error"></app-data-viewer>

            <div *ngSwitchCase="'logs'">
              <div *ngFor="let l of (dto()?.logs ?? [])" class="kv">
                <div class="k" style="width:7rem">{{ l.at }}</div>
                <div class="k pill">{{ l.level }}</div>
                <div>{{ l.message }}</div>
              </div>
              <div *ngIf="!(dto()?.logs?.length)">—</div>
            </div>

            <div *ngSwitchCase="'artifacts'">
              <div *ngFor="let a of (dto()?.artifacts ?? [])" class="kv">
                <div class="k">{{ a.name }}</div>
                <div>
                  <a *ngIf="a.href" [href]="a.href" target="_blank" rel="noreferrer">{{ a.href }}</a>
                  <span *ngIf="!a.href">—</span>
                </div>
              </div>
              <div *ngIf="!(dto()?.artifacts?.length)">—</div>
            </div>

          </ng-container>
        </div>
      </ng-container>
    </div>
  `
})
export class WfDetailsNodeComponent extends DrawFlowBaseNode implements OnInit, DoCheck {
  private bus = inject(WfCanvasBus);

  @Input() preferredTab?: PreferredTab;

  tabs: PreferredTab[] = ['auto', 'params', 'results', 'error', 'logs', 'artifacts'];
  currentTab = signal<PreferredTab>('auto');
  collapsed = signal<boolean>(false);

  private lastModelRef: unknown = null;
  private lastHashKey = '';

  public isDark$!: Observable<boolean>;
  store = inject(Store);

  ngOnInit(): void {
    this.applyInitialPreferredTab();
    this.lastModelRef = this.model;
    this.lastHashKey = this.hashKey();
    this.isDark$ = this.store.select(AppSelectors.ThemeSelectors.selectIsDark);
  }

  ngDoCheck(): void {
    const ref = this.model;
    const hk = this.hashKey();
    if (ref !== this.lastModelRef || hk !== this.lastHashKey) {
      this.applyInitialPreferredTab();
      this.markForCheck();
      this.lastModelRef = ref;
      this.lastHashKey = hk;
    }
  }

  private coerceModel(raw: unknown): RunNodeDTO {
    const data = (raw ?? {}) as RunNodeDTO;
    const type = (data.type ?? data.aiType ?? 'input') as PaletteType;
    const ports = data.ports;
    return { type, ports, params: this.stripReserved(data.params), aiType: data.aiType, label: data.label, position: data?.['position'], preferredTab: data.preferredTab, };
  }

  private get safeModel(): RunNodeDTO {
    return this.coerceModel(this.model);
  }

  dto(): RunNodeDTO | undefined {
    const raw = this.safeModel;
    if (!raw) return undefined;

    return {
      id: raw?.id ?? '',
      type: raw?.type ?? 'action',
      label: this.computedTitle(),
      params: raw.params,
      result: raw.result,
      error: raw.error,
      logs: raw.logs,
      artifacts: raw.artifacts,
      status: raw.status,
    };;
  }

  computedTitle(): string {
    const raw = this.safeModel;
    return (
      raw?.label ??
      (this.safeModel.type || 'workflow.runPanel.details')
    );
  }

  autoData(): RunNodeDTO {
    const d = this.dto();
    if (!d) return this.safeModel;

    return d;
  }

  private applyInitialPreferredTab(): void {
    const raw = this.safeModel;
    const preferred: PreferredTab | undefined =
      this.preferredTab ||
      raw?.preferredTab;

    if (preferred && this.tabs.includes(preferred)) {
      this.currentTab.set(preferred);
    } else {
      const d = this.dto();
      const auto: PreferredTab =
        d?.error != null ? 'error' :
          d?.result != null ? 'results' :
            d?.params != null ? 'params' : 'auto';
      this.currentTab.set(auto);
    }
  }

  private hashKey(): string {
    const m = this.safeModel ?? {};
    return [
      m, m?.['data'], m?.params, m?.result, m?.error, m?.logs, m?.artifacts,
      m?.label, m?.type, m?.status
    ].map(x => (x && typeof x === 'object') ? `@${Object.keys(x).length}` : String(x)).join('|');
  }

  private stripReserved<T>(obj: T): StripReservedShallow<T> {
    if (obj === null || typeof obj !== 'object') {
      return obj as StripReservedShallow<T>;
    }
    const RESERVED_SET: ReadonlySet<ReservedKeys> = new Set(RESERVED_KEYS);

    const entries = Object
      .entries(obj as Record<string, unknown>)
      .filter(([k]) => !RESERVED_SET.has(k as ReservedKeys));

    return Object.fromEntries(entries) as StripReservedShallow<T>;
  }

  closePanel() {
    this.bus.toggleDetailsPanel$.next({
      toggleOff: true,
    });
  }
}
