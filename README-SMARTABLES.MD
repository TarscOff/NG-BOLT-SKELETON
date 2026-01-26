# SmartTable (Angular 19+ Standalone) — README

>_Last updated: 2025-09-10_

A highly configurable Angular Material table with **drag & drop reordering**, **show/hide columns** (position preserved), **global & per‑column filters**, **client/server pagination + sorting**, **tree rows**, **multi‑select**, **action buttons**, **dark mode styling**, and **reactive i18n** driven by **NgRx + ngx‑translate**.

> Works great with `ChangeDetectionStrategy.OnPush`, Angular signals, and Material 3.

---

## Table of Contents

- [Features](#features)
- [Quick Start](#quick-start)
- [Installation & Imports](#installation--imports)
- [Inputs / Outputs](#inputs--outputs)
- [Column & Types Reference](#column--types-reference)
- [Language & i18n (NgRx + ngx-translate)](#language--i18n-ngrx--ngx-translate)
  - [Paginator i18n](#paginator-i18n)
  - [Headers / Labels / Values](#headers--labels--values)
  - [Send `lang` to Backend](#send-lang-to-backend)
- [Data Sources](#data-sources)
  - [Client-side mode](#client-side-mode)
  - [Server-side mode](#server-side-mode)
- [Filtering](#filtering)
- [Sorting & Pagination](#sorting--pagination)
- [Tree Rows](#tree-rows)
- [Selection & Actions](#selection--actions)
- [Reordering & Visibility](#reordering--visibility)
- [Styling & Theming](#styling--theming)
- [Accessibility](#accessibility)
- [Performance Notes](#performance-notes)
- [Examples](#examples)
  - [Basic Local Data](#basic-local-data)
  - [Server-side Data](#server-side-data)
  - [Tree Mode](#tree-mode)
  - [i18n-driven Columns](#i18n-driven-columns)
- [Common Pitfalls](#common-pitfalls)
- [API Reference](#api-reference)

---

## Features

- **Reorder columns** via header drag (preserves order across show/hide).
- **Show/Hide columns** without losing original positions.
- **Global filter** + **per-column filters** (opt-in per column).
- **Client-side** or **Server-side** pagination, sorting & filtering.
- **Sticky start/end** columns and **sticky header/footer** rows.
- **Multi-select** checkbox column.
- **Tree rows** (expand/collapse, keeps zebra striping for child rows).
- **Action buttons** per row with tooltips & color states.
- **Dark theme** class binding & CSS variables for easy themeing.
- **Reactive i18n**: updates headers, placeholders, paginator when language changes in NgRx store.

---

## Quick Start

```ts
// app.component.ts (host)
import SmartTableComponent, { SmartColumn } from './smart-table.component';
    this.cols = [
      { id: 'select', type: 'selection', sticky: true, draggable: false },
      { id: 'name', header: 'name', type: 'number', sortable: true, filtrable: true, draggable: false, },
      { id: 'role', header: 'role', type: 'chip', sortable: true, filtrable: true, draggable: false },
      { id: 'created', header: 'created', type: 'date', sortable: true, format: 'yyyy-LL-dd', draggable: false },
      {
        id: 'actions', type: 'actions', header:"actions", stickyEnd: false, draggable: false, width: 80, cellButtons: [
          { icon: 'edit', id: 'edit', color: 'primary', tooltip: 'edit' },
          { icon: 'delete', id: 'delete', color: 'warn', tooltip: 'delete' },
        ]
      }
    ];
users = [
  { id: 1, name: 'Alice', role: ['Admin'], created: new Date('2025-08-01') },
  { id: 2, name: 'Bob',   role: ['User'],  created: new Date('2025-08-05') },
];

// template
<app-smart-table
  [columns]="cols"
  [data]="users"
  [serverSide]="false"
  [pageSize]="10"
  (action)="onAction($event)"
  (rowClick)="onRow($event)"
  (selectionChange)="onSelection($event)">
</app-smart-table>
```

---


## Installation & Imports

- Angular 16+ (tested with **Angular 19**)
- Angular Material (MDC components)
- NgRx Store (for theme/i18n optional)
- ngx-translate (optional but recommended)

In your component/module that hosts the table, ensure Material modules used by the table are available (the SmartTable is **standalone** and imports what it needs).

---

## Inputs / Outputs

### Inputs

| Input | Type | Default | Description |
|---|---|---:|---|
| `columns` | `SmartColumn[]` | **required** | Column definitions (order, types, behaviors). |
| `endpoint` | `string?` | `undefined` | Server endpoint for server-side mode. |
| `data` | `any[]?` | `undefined` | Local data for client-side mode. |
| `serverSide` | `boolean` | `false` | If `true`, uses `endpoint` + POST to fetch pages. |
| `idKey` | `string` | `"id"` | Key used as unique id for rows. |
| `childrenKey` | `string` | `"children"` | Key holding children for tree rows. |
| `enableTree` | `boolean` | `false` | Enables tree mode (flattened rendering + toggles). |
| `pageSize` | `number` | `10` | Page size. |
| `pageSizeOptions` | `number[]` | `[10,20,50,100]` | Paginator page-size options. |
| `stickyHeader` | `boolean` | `true` | Stick header row. |
| `stickyFooter` | `boolean` | `false` | Stick footer row. |
| `rippleRows` | `boolean` | `true` | Enable row ripple on hover/click. |
| `enableGlobalFilter` | `boolean` | `true` | Show global filter field. |
| `globalFilterPlaceholder` | `string` | `"Search…"` | Placeholder for global filter. |
| `columnFilterEnabled` | `boolean` | `false` | If server supports per-column `f_{col}` filters. |
| `enableReorder` | `boolean` | `true` | Enable drag & drop reordering of headers. |
| `multiSelect` | `boolean` | `true` | Enable multi-row selection via checkbox column. |
| `height` | `number` | `undefined` | Enable height. |

### Outputs

| Output | Payload | Description |
|---|---|---|
| `rowClick` | `any` | Emits the clicked row. |
| `action` | `{ id: string; row: any }` | Emits when an action button is clicked. |
| `selectionChange` | `any[]` | Emits the full selection on change. |

---

## Column & Types Reference

```ts
export type SmartCellType = 'text' | 'number' | 'date' | 'chip' | 'actions' | 'selection';

export interface SmartActionButton {
  id: string;
  icon: string;
  label?: string;
  tooltip?: string;
  color?: 'primary' | 'accent' | 'warn' | undefined;
  disabledWhen?: (row: any) => boolean;
}

export interface SmartColumn {
  id: string;                   // unique column id (special: 'select' for selection col)
  header?: string;              // display header (or use headerKey + i18n pipe)
  type: SmartCellType;
  width?: number | string;
  minWidth?: number | string;
  maxWidth?: number | string;
  sortable?: boolean;
  filtrable?: boolean;
  visible?: boolean;            // default true
  sticky?: boolean;             // sticky start
  stickyEnd?: boolean;          // sticky end
  format?: string;              // e.g., date format for 'date' type
  cellClass?: (row: any) => string | string;
  cellButtons?: SmartActionButton[]; // for 'actions'
  value?: (row: any) => any;    // custom accessor
  _menuOpen?: boolean;          // internal
  draggable?: boolean;          // default true
  // Optional i18n keys (pattern you can adopt)
  // headerKey?: string;
  // translateValue?: boolean;
}
```

**Notes**

- The **selection** column is a reserved column with `id: 'select'` and `type: 'selection'` (the specific type is not rendered; the presence of the id enables the checkbox column). Set `draggable: false` and `sticky: true` if desired.
- For an **actions** column, set `type: 'actions'` and configure `cellButtons`.
- For value formatting, use `format` for dates or a custom `value(row)` accessor.

---

## Language & i18n (NgRx + ngx-translate)

The table is designed to react to language changes kept in **NgRx store** and propagated to **ngx-translate**.

### Connect Store → TranslateService

```ts
import { distinctUntilChanged } from 'rxjs';
import { TranslateService } from '@ngx-translate/core';
import { DateAdapter } from '@angular/material/core';
import { ChangeDetectorRef } from '@angular/core';

private translate = inject(TranslateService);
private dateAdapter = inject(DateAdapter);
private cdr = inject(ChangeDetectorRef);

ngOnInit(): void {
  this.store.select(AppSelectors.LangSelectors.selectLang)
    .pipe(distinctUntilChanged(), takeUntilDestroyed(this.destroyRef))
    .subscribe(lang => {
      this.translate.use(lang);
      this.dateAdapter.setLocale?.(lang);
      queueMicrotask(() => this.table?.renderRows?.());
      this.cdr.markForCheck();
    });
}
```

Or use **signals**:

```ts
import { toSignal } from '@angular/core/rxjs-interop';
import { effect } from '@angular/core';

private langSig = toSignal(
  this.store.select(AppSelectors.LangSelectors.selectLang),
  { initialValue: this.translate.currentLang || this.translate.getDefaultLang() || 'en' }
);

constructor() {
  effect(() => {
    const lang = this.langSig();
    this.translate.use(lang);
    this.dateAdapter.setLocale?.(lang);
    queueMicrotask(() => this.table?.renderRows?.());
    this.cdr.markForCheck();
  });
}
```

### Paginator i18n

Provide a `MatPaginatorIntl` that listens to `onLangChange`:

```ts
import { Injectable } from '@angular/core';
import { MatPaginatorIntl } from '@angular/material/paginator';
import { TranslateService } from '@ngx-translate/core';

@Injectable()
export class I18nPaginatorIntl extends MatPaginatorIntl {
  constructor(private t: TranslateService) {
    super();
    this._update();
    this.t.onLangChange.subscribe(() => this._update());
  }
  private _update() {
    this.itemsPerPageLabel = this.t.instant('table.paginator.itemsPerPage');
    this.nextPageLabel     = this.t.instant('table.paginator.nextPage');
    this.previousPageLabel = this.t.instant('table.paginator.prevPage');
    this.firstPageLabel    = this.t.instant('table.paginator.firstPage');
    this.lastPageLabel     = this.t.instant('table.paginator.lastPage');
    this.getRangeLabel = (page, pageSize, length) => {
      if (length === 0 || pageSize === 0) return this.t.instant('table.paginator.rangeEmpty');
      const start = page * pageSize + 1;
      const end = Math.min((page + 1) * pageSize, length);
      return this.t.instant('table.paginator.range', { start, end, length });
    };
    this.changes.next();
  }
}
```

Provide it at the component level:

```ts
@Component({
  // ...
  providers: [{ provide: MatPaginatorIntl, useClass: I18nPaginatorIntl }],
})
```

### Headers / Labels / Values

Three approaches (pick one):

1) **Translate in template** (impure pipe updates on lang change):

```html
<span class="label">{{ c.header || c.id | translate }}</span>
<input matInput [placeholder]="'table.searchPlaceholder' | translate">
```

2) **Use `headerKey` + helper**:

```ts
headerLabel = (c: SmartColumn) => c['headerKey']
  ? this.translate.instant(c['headerKey'])
  : (c.header ?? c.id);
```

3) **Signal-computed labels** (pre-resolved with `translate.instant` inside a `computed` that depends on `langSig`).

### Send `lang` to Backend

If in server-side mode:

```ts
function buildParams(opts: ...) {
  let p = new HttpParams()
    .set('page', opts.pageIndex)
    .set('size', opts.pageSize);
  // ...
  p = p.set('lang', this.translate.currentLang || 'en');
  return p;
}
```

---

## Data Sources

### Client-side mode

- Provide `[data]` and set `[serverSide]="false"` (default).
- Sorting & filtering are done in-memory.

### Server-side mode

- Provide `[endpoint]` and set `[serverSide]="true"`.
- Table POSTs a payload like `{ params }` where `params` is an `HttpParams` containing:
  - `page`, `size`
  - `sort=field,asc|desc` (when active)
  - `q` (global filter)
  - `f_{column}` for each column filter
  - (optional) `lang`

Expected response shape:

```ts
export interface ServerPage<T = any> { data: T[]; total: number; }
```

> The table also tolerates `{ items, count }` with a small adapter.

---

## Filtering

- **Global filter** textbox (top-left). Debounced (250ms).
- **Per-column filter**: opt-in with `filtrable: true` and (for server mode) set component `columnFilterEnabled=true`. Opens from header filter icon.
- Client-side: string containment; Server-side: added as `f_{col}` query params.

---

## Sorting & Pagination

- Sorting via `mat-sort-header` on header cells (respect `sortable: true`).
- Paginator appears at the **top** (can be moved). Use `pageSizeOptions` & `pageSize` inputs.
- In server-side mode, sort & pagination are forwarded to your API.

---

## Tree Rows

- Enable with `[enableTree]="true"` and supply `childrenKey` (default `'children'`).  
- Rows are flattened while keeping a `level` and `expandable` flags. Root rows keep zebra parity; child rows overlay a subtle darkening gradient for depth.

---

## Selection & Actions

- Enable selection by adding a **reserved** column with `id: 'select'`. The table shows a checkbox column; selection is multi-select when `[multiSelect]="true"`.
- Use `(selectionChange)` to get the current selection.
- **Actions column**: `type: 'actions'` with `cellButtons: SmartActionButton[]`. Clicks emit `(action)` with `{ id, row }`.

---

## Reordering & Visibility

- **Reorder** by dragging header cells (grab the drag handle). Only visible & `draggable !== false` columns participate.
- **Show/Hide** columns via the Columns menu. Hidden columns keep their last position and are restored in place.
- Sticky recalculations handled automatically after reorder/hide/show.

---

## Styling & Theming

- Host binds `.dark-theme` class from NgRx store (`selectIsDark`). CSS variables drive appearance:
  - `--row-even`, `--row-odd`
  - `--child-darken`, `--child-darken-dark`
  - `--mat-sys-*` (Material tokens) are respected where available.
- Sticky backgrounds are forced to the surface color to avoid gaps.
- Row hover uses `color-mix` with `--mat-sys-primary` for subtle feedback.

---

## Accessibility

- Header and cell controls include ARIA labels where appropriate (checkboxes).
- Keyboard focus and tab order come from Material components.
- Ensure tooltips and icons have accessible labels if needed (`aria-label`).

---

## Performance Notes

- Component uses `OnPush`, Angular **signals** (`signal`, `computed`, `effect`) and manual `renderRows()` calls after structure changes to keep the table snappy.
- Debounced filters (250ms) to limit reflow.
- Heavy operations (e.g., flattening trees) are localized and only recomputed when needed.

---

## Examples

### Basic Local Data

```ts
cols: SmartColumn[] = [
  { id: 'select', type: 'selection', sticky: true, draggable: false },
  { id: 'name', header: 'Name', type: 'text', sortable: true, filtrable: true },
  { id: 'role', header: 'Role', type: 'chip', sortable: true, filtrable: true },
  { id: 'created', header: 'Created', type: 'date', sortable: true, format: 'yyyy-LL-dd' },
  { id: 'actions', type: 'actions', stickyEnd: true, cellButtons: [
    { icon: 'edit', id: 'edit', color: 'primary' },
    { icon: 'delete', id: 'delete', color: 'warn' },
  ]},
];

users = [
  {
    id: 1, name: 'Alice', role: ['Admin'], created: new Date('2025-08-01'),
    children: [
      { id: 11, name: 'Alice Jr', role: ['User'], created: new Date() },
      { id: 12, name: 'Alice Sr', role: ['Admin'], created: new Date() },
    ]
  },
  { id: 2, name: 'Bob', role: ['User'], created: new Date('2025-08-05'), children: [] },
  ...Array.from({ length: 20 }, (_, i) => ({
    id: i + 3, name: `User ${i + 3}`, role: ['User'],
    created: new Date(Date.now() - (i + 3) * 24*60*60*1000),
  }))
];

// template
<app-smart-table [columns]="cols" [data]="users" [enableTree]="true" [height]="300"></app-smart-table>
```

### Server-side Data

```ts
<app-smart-table
  [columns]="cols"
  [endpoint]="'/api/users/search'"
  [serverSide]="true"
  [columnFilterEnabled]="true">
</app-smart-table>
```

Your backend should accept params: `page`, `size`, optional `sort`, `q`, and `f_{col}` keys; return `{ data, total }`.

### Tree Mode

Provide `children` arrays and set `[enableTree]="true"`. Toggle arrows appear automatically for rows with children.

### i18n-driven Columns

You can either set `header` to i18n keys and use pipes, or keep keys separately:

```ts
cols: SmartColumn[] = [
  { id: 'select', type: 'selection', sticky: true, draggable: false },
  { id: 'name',    header: 'name',    type: 'text',   sortable: true, filtrable: true },
  { id: 'role',    header: 'role',    type: 'chip',   sortable: true, filtrable: true },
  { id: 'created', header: 'created', type: 'date',   sortable: true,  },
  { id: 'actions', header :"actions", type: 'actions', stickyEnd: true, cellButtons: [
    { icon: 'edit', id: 'edit', color: 'primary',  tooltip: 'edit'   },
    { icon: 'delete', id: 'delete', color: 'warn', tooltip: 'delete' },
  ]},
];
```

Template translation (simple option):

```html
<span class="label">{{ c.header || c.id | translate }}</span>
<button mat-icon-button [matTooltip]="b.tooltip | translate">
  <mat-icon>{{ b.icon }}</mat-icon>
</button>
```


The "header" attribute on the columns definition is a key that is used to translate table header according to the selected language
by setting the following

```
   { id: 'name', header: 'name', type: 'number', sortable: true, filtrable: true, draggable: false, },
```

The header key "name" should be available on the translation files on `fr.json` or `en.json`


---

## Common Pitfalls

- **`type` must be one of** `'text' | 'number' | 'date' | 'chip' | 'actions' | 'selection'`.  
  Do **not** pass a localized string to `type`. Use `header` for translated text.
- **Selection column** is enabled by adding a column with `id: 'select'`; `type: 'selection'` is conventional but not rendered as a special cell type.
- If using `OnPush`, after language or structural changes call `markForCheck()` and (when needed) `table.renderRows()`—this component already does that in the i18n and reorder handlers.
- For server mode, ensure your API accepts the `f_{column}` pattern for column filters (or adapt `buildParams`).

---

## API Reference

### `ServerPage<T>`

```ts
export interface ServerPage<T = any> {
  data: T[];
  total: number;
}
```

### `buildParams(...)`

Utility that constructs an `HttpParams` with `page`, `size`, `sort`, `q`, and `f_{column}` entries (and can be extended to include `lang`).

---

**Happy building!** If you need a slimmer version or additional cell types (badges, avatars, progress), you can extend the switch in the cell template with custom renderers.


That’s it — happy coding! 🎉

## 🧑‍💻 Author

**Angular Product Skeleton**  
Built by **Tarik Haddadi** using Angular 19 and modern best practices (2025).
