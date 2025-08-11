// src/app/layout/app-layout.component.ts
import { AfterViewInit, ChangeDetectorRef, Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { MatSidenavModule } from '@angular/material/sidenav';
import { MatToolbarModule } from '@angular/material/toolbar';
import { MatIconModule } from '@angular/material/icon';
import { MatButtonModule } from '@angular/material/button';
import { RouterModule, RouterOutlet } from '@angular/router';
import { MatTooltipModule } from '@angular/material/tooltip';
import { MatListModule } from '@angular/material/list';
import { LayoutService } from '../../core/services/layout.service';
import { Observable } from 'rxjs';

@Component({
  selector: 'app-layout',
  standalone: true,
  imports: [
    CommonModule,
    RouterOutlet,
    MatSidenavModule,
    MatToolbarModule,
    MatIconModule,
    MatButtonModule,
    RouterModule,
    MatTooltipModule,
    MatListModule
  ],
  templateUrl: './app-layout.component.html',
  styleUrl: './app-layout.component.scss',
})
export class AppLayoutComponent implements OnInit, AfterViewInit {
  public menuItems = [
    { label: 'Dashboard', icon: 'dashboard', route: '/dashboard' },
    { label: 'Team', icon: 'group', route: '/team' },
  ];
  public isOpen = true;
  public title$!: Observable<string>;

  constructor(
    private layoutService: LayoutService,
    private cdr: ChangeDetectorRef
  ) { }

  public ngAfterViewInit(): void {
    this.cdr.detectChanges();
  }

  public ngOnInit(): void {
    this.title$ = this.layoutService.title$;
  }
}
