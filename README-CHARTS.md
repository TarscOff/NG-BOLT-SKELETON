# PXS‑NG Core — Charts in Host Apps
>
>_Last updated: 2025-09-11_

This guide shows how to use **Chart.js v4** through the `<pxs-chart>` wrapper from `@cadai/pxs-ng-core` in your Host App. It covers installation, bootstrap, sizing, click events, and several ready‑to‑use examples (bar, line with time scale, pie, doughnut, radar, polar area).

> Works with Angular 19/20 and Chart.js 4.x.

---

## 1) Install peer deps in the Host

```bash
npm i chart.js@^4.5.0 chartjs-adapter-luxon@^1.3.1 luxon@^3
```

These are **peerDependencies** of the Core SDK, so hosts must install them.

---

## 2) Bootstrap in the Host

You have two options. **Either** import the Luxon adapter at the Host entrypoint (recommended), **or** rely on the Core provider if it imports the adapter internally.

### Add Core charts provider

```ts
// app.config.ts (Host)
import { ApplicationConfig } from '@angular/core';
import { provideRouter } from '@angular/router';
import { routes } from './app.routes';
import { provideAppStore } from '@cadai/pxs-ng-core/store';
import { provideCharts } from '@cadai/pxs-ng-core/charts'; // exported by Core SDK

export const appConfig: ApplicationConfig = {
  providers: [
    provideRouter(routes),
    ...provideAppStore(),
    ...provideCharts({
      defaults: {
        responsive: true,
        maintainAspectRatio: false,
        animation: { duration: 300 },
        interaction: { intersect: false, mode: 'index' }, // ✅ v4
        plugins: { legend: { position: 'bottom', labels: { usePointStyle: true } } ,tooltip: { enabled: true } },
        scales: { x: { grid: { display: false } }, y: { ticks: { precision: 0 } } }
      },
      plugins: [],
    }),
  ],
};
```

> `provideCharts()` calls `Chart.register(...registerables)` and can set global defaults/plugins.

---

## 3) Sizing (important)

Chart.js is responsive and the canvas will collapse if the parent has no height. Use one of these:

- Wrap with a fixed-height container:

```html
  <div style="height:320px">
    <app-chart [type]="'bar'" [data]="barData" [options]="barOptions"></app-chart>
  </div>
```

- Or pass `[height]="300"` to the component:

```html
  <app-chart [type]="'bar'" [data]="barData" [height]="300"></app-chart>
```

- Or set `maintainAspectRatio:false` and size the parent with CSS.

---

## 4) Basic usage

```html
  <!-- BAR -->
  <app-chart [height]="300" [width]="'100%'" [type]="'bar'" [data]="barData" [options]="barOptions"
    (elementClick)="onBarClick($event)">
  </app-chart>
  <!-- LINE -->
  <app-chart [height]="300" [type]="'line'" [data]="tsData" [options]="tsDataOptions"></app-chart>
```

```ts
import { Component } from '@angular/core';
import { ChartData, ChartOptions, ChartEvent, ActiveElement } from 'chart.js';
import { DateTime } from 'luxon';

@Component({
  selector: 'host-dashboard',
  standalone: true,
  templateUrl: './dashboard.html'
})
export class HostDashboardComponent {
  // ===== Bar Data =====
  barData: ChartData<'bar'> = {
    labels: ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', "Sun"],
    datasets: [
      {
        label: 'Hours', data: [7, -8, 6, 9, 5, -6],
        backgroundColor: (ctx) => pick(ctx),
        borderColor: (ctx) => pick(ctx),
        borderWidth: 1,
      }
    ]
  };

  barOptions: ChartOptions<'bar'> = {
    responsive: true,
    maintainAspectRatio: false,
    scales: { y: { beginAtZero: true } },
  };
  onBarClick(event: { event: ChartEvent; elements: ActiveElement[] }) {
    const { elements } = event;

    if (!elements.length) {
      console.log('Clicked on empty space');
      return;
    }

    // The first active element is usually enough
    const first = elements[0];
    const datasetIndex = first.datasetIndex;
    const index = first.index;

    const dataset = this.barData.datasets[datasetIndex];
    const label = this.barData.labels?.[index];
    const value = (dataset.data as number[])[index];

    console.log('Clicked bar:', { label, value, datasetLabel: dataset.label });
  }
}
```

> If you prefer numbers, use `ChartData<'line', {x:number; y:number}[]>` and set `unit: 'millisecond'` when you pass epoch millis.

---

## 5) More examples

### Line

```html
  <!-- LINE -->
  <app-chart [height]="300" [type]="'line'" [data]="tsMultipleData" [options]="tsMultipleDataOptions"></app-chart>

```

```ts
  // ===== LINE =====
  
  tsMultipleData: ChartData<'line', { x: number | Date | string; y: number }[]> = {
    datasets: [
      {
        label: 'Multiple 1',
        data: [
          { x: this.now.minus({ days: 4 }).toMillis(), y: 60 },
          { x: this.now.minus({ days: 3 }).toJSDate(), y: 18 },
          { x: this.now.minus({ days: 2 }).toISO(), y: 35 },
          { x: this.now.minus({ days: 1 }).toMillis(), y: 45 },
          { x: this.now.toMillis(), y: 33 },
        ],
        fill: true,
        tension: 0.25,
        borderColor: COLOR.warn(),
        backgroundColor: (ctx: any) => linearGradient(
          ctx.chart.ctx,
          cssVar('--mat-warn', 'rgba(66,165,245,0.35)'),
          this.isDark ? 'rgba(0,0,0,0)' : 'rgba(255, 255, 255, 0.03)'
        ),
        pointBackgroundColor: COLOR.warn(),
        pointHoverBackgroundColor: COLOR.warn(),

      },
      {
        label: 'Multiple 2',
        data: [
          { x: this.now.minus({ days: 4 }).toMillis(), y: 33 },
          { x: this.now.minus({ days: 3 }).toJSDate(), y: 6 },
          { x: this.now.minus({ days: 2 }).toISO(), y: 17 },
          { x: this.now.minus({ days: 1 }).toMillis(), y: 22 },
          { x: this.now.toMillis(), y: 12 },
        ],
        fill: true,
        tension: 0.25,
        borderColor: COLOR.warn(),
        backgroundColor: (ctx: any) => linearGradient(
          ctx.chart.ctx,
          cssVar('--mat-warn', 'rgba(66,165,245,0.35)'),
          this.isDark ? 'rgba(0,0,0,0)' : 'rgba(255, 255, 255, 0.03)'
        ),
        pointBackgroundColor: COLOR.warn(),
        pointHoverBackgroundColor: COLOR.warn(),
      },
    ],
  };

  tsMultipleDataOptions = {
    scales: {
      x: {
        type: 'timeseries',
        time: { unit: 'day', displayFormats: { day: 'MMMM dd' } },
        ticks: { source: 'auto' },
      },
      y: { beginAtZero: true }
    },
    animation: { duration: 2000 },

  } satisfies ChartOptions<'line'>;

```

### Pie

```html
  <!-- PIE -->
  <app-chart [height]="300" [type]="'pie'" [width]="'100%'" [data]="pieData" [options]="pieOptions"
    (elementClick)="onPieClick($event)"></app-chart>
```

```ts
  // ===== PIE =====
  pieData: ChartData<'pie'> = {
    labels: ['Chrome', 'Safari', 'Firefox', 'Edge', 'Others'],
    datasets: [
      {
        label: 'Market Share',
        data: [63, 20, 10, 7, 5],
        backgroundColor: [
          COLOR.primary(),
          COLOR.accent(),
          COLOR.warn(),
          COLOR.neutral(),
          COLOR.success(),
        ],
        borderColor: '#fff',
        borderWidth: 2,
        hoverOffset: 8
      }
    ]
  };

  pieOptions: ChartOptions<'pie'> = {
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: { position: 'bottom', labels: { usePointStyle: true } },
      tooltip: { callbacks: { label: ctx => `${ctx.label}: ${ctx.formattedValue}%` } }
    },
    scales: { y: { display: false }, x: { display: false } }
  };

  onPieClick(e: { event: ChartEvent; elements: ActiveElement[] }) {
    const el = e.elements[0];
    if (!el) return;
    const label = this.pieData.labels?.[el.index];
    const value = (this.pieData.datasets[el.datasetIndex].data as number[])[el.index];
    console.log('Pie clicked:', { label, value });
  }
```

### Doughnut

```html
      <app-chart [height]="300" [type]="'doughnut'" [width]="'100%'" [data]="doughnutData" [options]="doughnutOptions"
        (elementClick)="onDoughnutClick($event)"></app-chart>
```

```ts
  doughnutData: ChartData<'doughnut'> = {
    labels: ['Completed', 'In Progress', 'Blocked', "On Hold"],
    datasets: [
      {
        label: 'Tasks', data: [42, 18, 5, 10],
        backgroundColor: [
          COLOR.success(),    // completed
          COLOR.accent(),     // in progress
          COLOR.warn(),       // blocked
          COLOR.primary(),    // on hold
        ],
        hoverOffset: 8
      }
    ]
  };

  doughnutOptions: ChartOptions<'doughnut'> = {
    responsive: true,
    maintainAspectRatio: false,
    cutout: '50%', // donut thickness
    plugins: {
      legend: { position: 'bottom' }
    },
    scales: { y: { display: false }, x: { display: false } }
  };

  onDoughnutClick(e: { event: ChartEvent; elements: ActiveElement[] }) {
    const el = e.elements[0];
    if (!el) return;
    const label = this.doughnutData.labels?.[el.index];
    const value = (this.doughnutData.datasets[el.datasetIndex].data as number[])[el.index];
    console.log('Doughnut clicked:', { label, value });
  }
```

### Radar

```html
  <app-chart [height]="300" [type]="'radar'" [data]="radarData" [options]="radarOptions"></app-chart>
```

```ts
  // ===== RADAR =====
  radarData: ChartData<'radar'> = {
    labels: ['Perf', 'Accessibility', 'Best Practices', 'SEO', 'Security'],
    datasets: [
      {
        label: 'Project A',
        data: [85, 72, 80, 68, 74],
        fill: true,
        backgroundColor: 'color-mix(in srgb, ' + COLOR.primary() + ' 30%, transparent)',
        borderColor: COLOR.primary(),
        pointBackgroundColor: COLOR.primary(),
      },
      {
        label: 'Project B',
        data: [78, 66, 75, 80, 70],
        fill: true,
        backgroundColor: 'color-mix(in srgb, ' + COLOR.accent() + ' 30%, transparent)',
        borderColor: COLOR.accent(),
        pointBackgroundColor: COLOR.accent(),
      }
    ]
  };

  radarOptions: ChartOptions<'radar'> = {
    responsive: true,
    maintainAspectRatio: false,
    scales: {
      r: {
        beginAtZero: true,
        suggestedMax: 100,
        ticks: { stepSize: 20 }
      }
    },
    plugins: {
      legend: { position: 'bottom' }
    }
  };

```

### Polar Area

```html
  <app-chart [height]="300" [type]="'polarArea'" [width]="'100%'" [data]="polarData" [options]="polarOptions"
    (elementClick)="onPolarClick($event)"></app-chart>
```

```ts
  polarData: ChartData<'polarArea'> = {
    labels: ['North', 'East', 'South', 'West'],
    datasets: [
      {
        label: 'Wind', data: [11, 7, 14, 9],
        backgroundColor: [
          COLOR.primary(),
          COLOR.accent(),
          COLOR.warn(),
          COLOR.success(),
        ],
        borderColor: '#fff',
        borderWidth: 1
      }
    ]
  };

  polarOptions: ChartOptions<'polarArea'> = {
    responsive: true,
    maintainAspectRatio: false,
    scales: { r: { beginAtZero: true } },
    plugins: { legend: { position: 'bottom' } }
  };

  onPolarClick(e: { event: ChartEvent; elements: ActiveElement[] }) {
    const el = e.elements[0];
    if (!el) return;
    const label = this.polarData.labels?.[el.index];
    const value = (this.polarData.datasets[el.datasetIndex].data as number[])[el.index];
    console.log('Polar area clicked:', { label, value });
  }
```

---

## 6) Using `{x,y}` points (typing hints)

- If you pass `{x,y}` points, set the **second generic** of `ChartData`:

```ts
  // Dates
  const data: ChartData<'line', { x: Date; y: number }[]> = { ... };

  // Epoch millis
  const data: ChartData<'line', { x: number; y: number }[]> = { ... };
```

- **Don’t mix** `Date`, `number`, and `string` unless your component input is widened. The Core wrapper can normalize mixed inputs if it implements that feature (optional).

- With time scale:

```ts
  options: ChartOptions<'line'> = {
    scales: { x: { type: 'time', time: { unit: 'day' } } }
  };
```

If you use epoch millis, change `unit` to `'millisecond'` or convert to `Date`.

---

## 7) Styling Helpers (Utils)

If you want to put custom styles, some custom styles are already in place, the core exposes some utils for that

```ts
export function cssVar(name: string, fallback?: string) {
  const v = getComputedStyle(document.documentElement).getPropertyValue(name)?.trim();
  return v || fallback || '#888';
}

export function linearGradient(ctx: CanvasRenderingContext2D, from: string, to: string) {
  const g = ctx.createLinearGradient(0, 0, 0, ctx.canvas.height);
  g.addColorStop(0, from);
  g.addColorStop(1, to);
  return g;
}

export const COLOR = {
  primary: () => cssVar('--mat-primary', '#42a5f5'),
  primaryVariant: () => cssVar('--mat-primary-variant', '#1e88e5'),
  accent: () => cssVar('--mat-accent', '#ff4081'),
  warn: () => cssVar('--mat-warn', '#ec9a00ff'),
  neutral: () => cssVar('--mat-neutral', '#9e9e9e'),
  success: () => cssVar('--mat-success', '#4caf50'),
};

export const paletteFns = [COLOR.primary, COLOR.accent, COLOR.warn, COLOR.neutral, COLOR.success, COLOR.primaryVariant];

export const pick = (ctx: any) => paletteFns[ctx.dataIndex % paletteFns.length]();
export const fill30 = (ctx: any) => `color-mix(in srgb, ${pick(ctx)} 30%, transparent)`;

export const primary = () => COLOR.primary();
export const neutral = () => COLOR.neutral();
export const warn = () => COLOR.warn();
export const success = () => COLOR.success();
export const accent = () => COLOR.accent();

export const linearGradientSuccess =(ctx: any, isDark: boolean)=> linearGradient(
          ctx,
          cssVar('--mat-success', 'rgba(255,64,129,0.35)'),
          isDark ? 'rgba(0,0,0,0)' : 'rgba(255, 255, 255, 0)'
        )
export const linearGradientWarn =(ctx: any, isDark: boolean)=> linearGradient(
          ctx,
          cssVar('--mat-warn', 'rgba(255,64,129,0.35)'),
          isDark ? 'rgba(0,0,0,0)' : 'rgba(255, 255, 255, 0)'
        )
export const linearGradientAccent =(ctx: any, isDark: boolean)=> linearGradient(
          ctx,
          cssVar('--mat-accent', 'rgba(255,64,129,0.35)'),
          isDark ? 'rgba(0,0,0,0)' : 'rgba(255, 255, 255, 0)'
        )
export const linearGradientNeutral =(ctx: any, isDark: boolean)=> linearGradient(
          ctx,
          cssVar('--mat-neutral', 'rgba(255,64,129,0.35)'),
          isDark ? 'rgba(0,0,0,0)' : 'rgba(255, 255, 255, 0)'
        )
export const linearGradientPrimary =(ctx: any, isDark: boolean)=> linearGradient(
          ctx,
          cssVar('--mat-primary', 'rgba(255,64,129,0.35)'),
          isDark ? 'rgba(0,0,0,0)' : 'rgba(255, 255, 255, 0)'
        )
        
export const successFill = () => `color-mix(in srgb, ${success()} 30%, transparent)`;
export const accentFill = () => `color-mix(in srgb, ${accent()} 30%, transparent)`;
export const warnFill = () => `color-mix(in srgb, ${warn()} 30%, transparent)`;
export const neutralFill = () => `color-mix(in srgb, ${neutral()} 30%, transparent)`;
export const primaryFill = () => `color-mix(in srgb, ${primary()} 30%, transparent)`;

```

If you want to use them inside your components here are some examples

```ts
import { 
  pick,
  fill30,
  warn,
  success,
  accent,
  linearGradientSuccess,
  linearGradientWarn,
  linearGradientAccent,
  successFill,
  accentFill
} from '@cadai/pxs-ng-core/utils';
// Simple line
 tsData: ChartData<'line'> = {
    datasets: [
      {
        label: 'Throughput',
        data: [
          { x: DateTime.now().minus({ days: 4 }).toMillis(), y: 12 },
          { x: DateTime.now().minus({ days: 3 }).toMillis(), y: 18 },
          { x: DateTime.now().minus({ days: 2 }).toMillis(), y: 15 },
          { x: DateTime.now().minus({ days: 1 }).toMillis(), y: 22 },
          { x: DateTime.now().toMillis(), y: 19 },
        ],
        fill: true,
        tension: 0.25,
        borderColor: () => success(),
        backgroundColor: (ctx) => linearGradientSuccess(ctx.chart.ctx, this.isDark),
        pointBackgroundColor: () => success(),
        pointHoverBackgroundColor: () => success(),
      }
    ]
  };

  // Multiline
  tsMultipleData: ChartData<'line', { x: number | Date | string; y: number }[]> = {
    datasets: [
      {
        label: 'Line 1',
        data: [
          { x: this.now.minus({ days: 6 }).toMillis(), y: 60 },
          { x: this.now.minus({ days: 3 }).toJSDate(), y: 18 },
          { x: this.now.minus({ days: 2 }).toISO(), y: 35 },
          { x: this.now.minus({ days: 1 }).toMillis(), y: 45 },
          { x: this.now.toMillis(), y: 33 },
        ],
        fill: true,
        tension: 0.25,
        borderColor: () => warn(),
        backgroundColor: (ctx) => linearGradientWarn(ctx.chart.ctx, this.isDark),
        pointBackgroundColor: () => warn(),
        pointHoverBackgroundColor: () => warn(),

      },
      {
        label: 'Line 2',
        data: [
          { x: this.now.minus({ days: 6 }).toMillis(), y: 33 },
          { x: this.now.minus({ days: 5 }).toJSDate(), y: 6 },
          { x: this.now.minus({ days: 3 }).toISO(), y: 17 },
          { x: this.now.minus({ days: 2 }).toMillis(), y: 22 },
          { x: this.now.toMillis(), y: 12 },
        ],
        fill: true,
        tension: 0.25,
        borderColor: () => accent(),
        backgroundColor: (ctx) => linearGradientAccent(ctx.chart.ctx, this.isDark),
        pointBackgroundColor: () => accent(),
        pointHoverBackgroundColor: () => accent(),
      },
    ],
  };

  // Pie
  pieData: ChartData<'pie'> = {
    labels: ['Chrome', 'Safari', 'Firefox', 'Edge', 'Others'],
    datasets: [
      {
        label: 'Market Share',
        data: [63, 20, 10, 7, 5],
        backgroundColor: (ctx) => pick(ctx),
        borderColor: '#fff',
        borderWidth: 2,
        hoverOffset: 8
      }
    ]
  };

  // Doughnut
  doughnutData: ChartData<'doughnut'> = {
    labels: ['Completed', 'In Progress', 'Blocked', "On Hold"],
    datasets: [
      {
        label: 'Tasks', data: [42, 18, 5, 10],
        backgroundColor: (ctx) => pick(ctx),
        hoverOffset: 8
      }
    ]
  };

  // Radar
  radarData: ChartData<'radar'> = {
    labels: ['Perf', 'Accessibility', 'Best Practices', 'SEO', 'Security', 'PWA'],
    datasets: [
      {
        label: 'Project A',
        data: [85, 72, 80, 68, 74, 90],
        fill: true,
        backgroundColor: () => successFill(),
        borderColor: () => success(),
        pointBackgroundColor: () => success(),
        pointBorderColor: () => success(),
        pointHoverBackgroundColor: () => success(),
        pointHoverBorderColor: () => success(),
        hoverRadius: 5,
        hoverBorderWidth: 5
      },
      {
        label: 'Project B',
        data: [78, 66, 75, 80, 70, 85],
        fill: true,
        backgroundColor: () => accentFill(),
        borderColor: () => accent(),
        pointBackgroundColor: () => accent(),
        pointBorderColor: () => accent(),
        pointHoverBackgroundColor: () => accent(),
        pointHoverBorderColor: () => accent(),
        hoverRadius: 5,
        hoverBorderWidth: 5
      }
    ],
  };

```

## 8) Handling clicks

Every chart emits `(elementClick)` with the active elements and the native event:

```html
<pxs-chart [type]="'bar'" [data]="barData" (elementClick)="onBarClick($event)"></pxs-chart>
```

```ts
onBarClick(e: { event: ChartEvent; elements: ActiveElement[] }) {
  const first = e.elements[0]; if (!first) return;
  const label = this.barData.labels?.[first.index];
  const value = (this.barData.datasets[first.datasetIndex].data as number[])[first.index];
  // Do something...
}
```

---

## 9) Common troubleshooting

- **Nothing displays** → The canvas has no height. Give the parent a height (e.g., `style="height:300px"`) or pass `[height]="300"` and set `maintainAspectRatio:false`.
- **Time scale error (`adapters.date` undefined)** → Ensure the adapter is imported at Host startup:

Make sure there’s only **one** `chart.js` in `npm ls chart.js` (deduped).

- **TypeScript error when passing `{x,y}`** → Use `ChartData<'line', {x: Date|number; y: number}[]>` or unify all `x` values to the same type.
- **Changing chart type dynamically** → Prefer destroying and recreating the chart on type change instead of mutating `config.type`.

---

That’s it — happy charting! 🎉

## 🧑‍💻 Author

**Angular Product Skeleton**  
Built by **Tarik Haddadi** using Angular 19 and modern best practices (2025).
