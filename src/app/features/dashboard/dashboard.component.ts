import { Component, DestroyRef, inject, OnInit, ViewEncapsulation } from '@angular/core';
import { TranslateModule, TranslateService } from '@ngx-translate/core';
import { Observable } from 'rxjs';
import { Store } from '@ngrx/store';
import { CommonModule, Location } from '@angular/common';
import { ChartComponent, SeoComponent, SmartTableComponent } from '@cadai/pxs-ng-core/shared';
import { LayoutService, ToolbarActionsService } from '@cadai/pxs-ng-core/services';
import { AppSelectors } from '@cadai/pxs-ng-core/store';
import { ActiveElement, ChartData, ChartEvent, ChartOptions } from 'chart.js';
import { DateTime } from 'luxon';
import { pick, fill30, error,success, accent, successFill, accentFill, primary, linearGradientPrimary, linearGradientAccent, linearGradientError, errorFill } from '@cadai/pxs-ng-core/utils';
import { SmartColumn, ToolbarAction } from '@cadai/pxs-ng-core/interfaces';

@Component({
  selector: 'app-dashboard',
  standalone: true,
  imports: [
    CommonModule,
    TranslateModule,
    SeoComponent,
    ChartComponent,
    SmartTableComponent
  ],
  templateUrl: './dashboard.component.html',
  styleUrl: './dashboard.component.scss',
  encapsulation: ViewEncapsulation.None,
})
export class DashboardComponent implements OnInit {
  public isDark$!: Observable<boolean>;
  public isDark!: boolean;
  private destroyRef = inject(DestroyRef);
  private location = inject(Location);

  public translate = inject(TranslateService);
  private toolbar = inject(ToolbarActionsService);

  cols: SmartColumn[] = [
    { id: 'select', type: 'selection', sticky: true, draggable: false },
    { id: 'name', header: 'name', type: 'number', sortable: true, filtrable: true, draggable: false, },
    { id: 'role', header: 'role', type: 'chip', sortable: true, filtrable: true, draggable: false },
    { id: 'created', header: 'created', type: 'date', sortable: true, format: 'yyyy-LL-dd', draggable: false },
    {
      id: 'actions', type: 'actions', header: "actions", stickyEnd: true, draggable: false, width: 80, cellButtons: [
        { icon: 'edit', id: 'edit', class: 'accent', tooltip: 'edit' },
        { icon: 'delete', id: 'delete', class: 'error', tooltip: 'delete' },
      ]
    }
  ];

  users = [
    {
      id: 1, name: 'Alice', role: ['Admin'], created: new Date('2025-08-01'),
      children: [
        { id: 11, name: 'Alice Jr', role: ['User'], created: new Date() },
        { id: 12, name: 'Alice Sr', role: ['Admin'], created: new Date() }
      ]
    },
    { id: 2, name: 'Bob', role: ['User'], created: new Date('2025-08-05'), children: [] },
    // generated data
    ...Array.from({ length: 20 }, (_, i) => ({
      id: i + 3,
      name: `User ${i + 3}`,
      role: ['User'],
      created: new Date(Date.now() - (i + 3) * 24 * 60 * 60 * 1000)
    }))
  ];

  constructor(
    private store: Store,
    private layoutService: LayoutService,
  ) {

    const back: ToolbarAction = {
      id: 'back',
      icon: 'arrow_back',
      tooltip: 'back',
      class:"primary",
      click: () => this.location.back(),
    };

    const exportCsv: ToolbarAction = {
      id: 'export',
      icon: 'download',
      tooltip: 'export',
      click: () => {console.log("export")},
      variant:"flat",
      label:'export',
      class:"primary"
    };

    const newP: ToolbarAction = {
      id: 'newP',
      icon: 'add',
      tooltip: 'SAVE',
      click: () => {console.log("export")},
      variant:"flat",
      label:'SAVE',
      class:"success"
    };
    const DeleteBtn: ToolbarAction = {
      id: 'deleteP',
      icon: 'delete',
      tooltip: 'delete',
      click: () => {console.log("delete")},
      variant:"flat",
      label:'delete',
      class:"error"
    };

    const deleteSel: ToolbarAction = {
      id: 'delete',
      icon: 'delete',
      tooltip: 'delete',
      color: 'warn',
      class:"primary",
      click: () => {console.log("delete")},
      variant:"stroked",
      label:'delete'
    };

    const refreshSel: ToolbarAction = {
      id: 'refresh',
      icon: 'refresh',
      tooltip: 'refresh',
      color: 'accent',
      class:"accent",
      click: () => {console.log("refresh")},
      variant:"raised",
      label:'refresh'
    };

    // Publish actions for this page and auto-clear on destroy
    this.toolbar.scope(this.destroyRef, [DeleteBtn,newP,back, exportCsv, deleteSel, refreshSel]);
  }

  public ngOnInit(): void {
    this.isDark$ = this.store.select(AppSelectors.ThemeSelectors.selectIsDark);
    this.isDark$.subscribe(value => this.isDark = value);
  }

  public onTitleChange(title: string): void {
    this.layoutService.setTitle(title);
  }

  onRowClick(row: unknown) {
    console.log('Row clicked:', row);

    // Example use cases:
    // Navigate to detail page
    // this.router.navigate(['/users', row.id]);

    // Or open a dialog
    // this.dialog.open(UserDetailDialog, { data: row });
  }
  onActionClick(action: { id: string; row: unknown }) {
    console.log('Action clicked:', action);

    // Example use cases:
    // Navigate to detail page
    // this.router.navigate(['/users', row.id]);

    // Or open a dialog
    // this.dialog.open(UserDetailDialog, { data: row });
  }

  // ===== Bar Data =====
  barData: ChartData<'bar'> = {
    labels: ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', "Sun","sat"],
    datasets: [
      {
        label: 'Hours', data: [7, -8, 6, 9, 5, -6,8],
        backgroundColor: (ctx) => pick(ctx),
        borderColor: (ctx) => pick(ctx),
        borderWidth: 1,
      }
    ]
  };

  barOptions: ChartOptions<'bar'> = {
    responsive: true,
    maintainAspectRatio: false,
    scales: {
      y: { beginAtZero: true }, x: {
        ticks: { source: 'auto' },
        time: {
          unit: 'day', displayFormats: { day: 'MMMM dddd' },
        },
      }
    },
    animation: { duration: 2000 },
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
  // ===== DATA LINE =====
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
        borderColor: () => primary(),
        backgroundColor: (ctx) => linearGradientPrimary(ctx.chart.ctx, this.isDark),
        pointBackgroundColor: () => primary(),
        pointHoverBackgroundColor: () => primary(),
      }
    ]
  };

  tsDataOptions = {
    scales: {
      x: {
        type: 'time',
        time: { unit: 'day', displayFormats: { day: 'MMMM dd' }, },
        ticks: { source: 'data', align: "inner" },
      },
      y: { beginAtZero: true }
    },
    animation: { duration: 2000 },
  } satisfies ChartOptions<'line'>;

  // ===== MULTIPLE DATA LINE =====
  now = DateTime.now();

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
        borderColor: () => accent(),
        backgroundColor: (ctx) => linearGradientAccent(ctx.chart.ctx, this.isDark),
        pointBackgroundColor: () => accent(),
        pointHoverBackgroundColor: () => accent(),

      },
      {
        label: 'Line 2',
        data: [
          { x: this.now.minus({ days: 6 }).toMillis(), y: 33 },
          { x: this.now.minus({ days: 3 }).toJSDate(), y: 6 },
          { x: this.now.minus({ days: 2 }).toISO(), y: 17 },
          { x: this.now.minus({ days: 1 }).toMillis(), y: 22 },
          { x: this.now.toMillis(), y: 12 },
        ],
        fill: true,
        tension: 0.25,
        borderColor: () => primary(),
        backgroundColor: (ctx) => linearGradientPrimary(ctx.chart.ctx, this.isDark),
        pointBackgroundColor: () => primary(),
        pointHoverBackgroundColor: () => primary(),
      },
      {
        label: 'Line 3',
        data: [
          { x: this.now.minus({ days: 6 }).toMillis(), y: 45 },
          { x: this.now.minus({ days: 5 }).toJSDate(), y: 12 },
          { x: this.now.minus({ days: 2 }).toISO(), y: 4 },
          { x: this.now.minus({ days: 1 }).toMillis(), y: 30 },
          { x: this.now.toMillis(), y: 17 },
        ],
        fill: true,
        tension: 0.25,
        borderColor: () => error(),
        backgroundColor: (ctx) => linearGradientError(ctx.chart.ctx, this.isDark),
        pointBackgroundColor: () => error(),
        pointHoverBackgroundColor: () => error(),
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

  // ===== PIE =====
  pieData: ChartData<'pie'> = {
    labels: ['Chrome', 'Safari', 'Firefox', 'Edge', "Chromium", 'Others'],
    datasets: [
      {
        label: 'Market Share',
        data: [63, 20, 10, 7, 55,5],
        backgroundColor: (ctx) => pick(ctx),
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
    scales: { y: { display: false }, x: { display: false } },
    animation: { duration: 2000 },
  };

  onPieClick(e: { event: ChartEvent; elements: ActiveElement[] }) {
    const el = e.elements[0];
    if (!el) return;
    const label = this.pieData.labels?.[el.index];
    const value = (this.pieData.datasets[el.datasetIndex].data as number[])[el.index];
    console.log('Pie clicked:', { label, value });
  }

  // ===== DOUGHNUT =====
  doughnutData: ChartData<'doughnut'> = {
    labels: ['Completed', 'In Progress', 'Blocked', "On Hold", "Not Started", "Cancelled"],
    datasets: [
      {
        label: 'Tasks', data: [42, 18, 5, 10, 15, 8],
        backgroundColor: (ctx) => pick(ctx),
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
    scales: { y: { display: false }, x: { display: false } },
    animation: { duration: 2000 },
  };

  onDoughnutClick(e: { event: ChartEvent; elements: ActiveElement[] }) {
    const el = e.elements[0];
    if (!el) return;
    const label = this.doughnutData.labels?.[el.index];
    const value = (this.doughnutData.datasets[el.datasetIndex].data as number[])[el.index];
    console.log('Doughnut clicked:', { label, value });
  }

  // ===== RADAR =====
  radarData: ChartData<'radar'> = {
    labels: ['Perf', 'Accessibility', 'Best Practices', 'SEO', 'Security', 'PWA', 'Security' ,'UX'],
    datasets: [
      {
        label: 'Project A',
        data: [85, 72, 80, 68, 74, 90, 80, 75],
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
        data: [78, 66, 75, 80, 70, 85, 37, 60],
        fill: true,
        backgroundColor: () => accentFill(),
        borderColor: () => accent(),
        pointBackgroundColor: () => accent(),
        pointBorderColor: () => accent(),
        pointHoverBackgroundColor: () => accent(),
        pointHoverBorderColor: () => accent(),
        hoverRadius: 5,
        hoverBorderWidth: 5
      },
      {
        label: 'Project C',
        data: [65, 58, 70, 55, 60, 72, 50, 45],
        fill: true,
        backgroundColor: () => errorFill(),
        borderColor: () => error(),
        pointBackgroundColor: () => error(),
        pointBorderColor: () => error(),
        pointHoverBackgroundColor: () => error(),
        pointHoverBorderColor: () => error(),
        hoverRadius: 5,
        hoverBorderWidth: 5
      }
    ],
  };

  radarOptions: ChartOptions<'radar'> = {
    responsive: true,
    maintainAspectRatio: false,
    scales: {
      r: {
        beginAtZero: true,
        ticks: { stepSize: 20 }
      }
    },
    plugins: {
      legend: { position: 'bottom' }
    },
    animation: { duration: 2000 },
  };

  // ===== POLAR AREA =====
  polarData: ChartData<'polarArea'> = {
    labels: ['North', 'East', 'South', 'West', "Central", "International"],
    datasets: [
      {
        label: 'Wind',
        data: [11, 7, 14, 9, 12, 8],
        backgroundColor: (ctx) => fill30(ctx),
        borderColor: (ctx) => pick(ctx),
        borderWidth: 2,
        hoverOffset: 5,
        hoverBackgroundColor: (ctx) => `color-mix(in srgb, ${pick(ctx)} 45%, transparent)`,
        hoverBorderColor: (ctx) => pick(ctx),
      }
    ]
  };

  polarOptions: ChartOptions<'polarArea'> = {
    responsive: true,
    maintainAspectRatio: false,
    scales: { r: { beginAtZero: true } },
    plugins: { legend: { position: 'bottom' } },
    animation: { duration: 2000 },
  };

  onPolarClick(e: { event: ChartEvent; elements: ActiveElement[] }) {
    const el = e.elements[0];
    if (!el) return;
    const label = this.polarData.labels?.[el.index];
    const value = (this.polarData.datasets[el.datasetIndex].data as number[])[el.index];
    console.log('Polar area clicked:', { label, value });
  }
}
