import { Component, inject, OnInit, DestroyRef, computed } from '@angular/core';
import { CommonModule } from '@angular/common';
import { MatCardModule } from '@angular/material/card';
import { MatIconModule } from '@angular/material/icon';
import { MatButtonModule } from '@angular/material/button';
import { MatChipsModule } from '@angular/material/chips';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { TranslateModule, TranslateService } from '@ngx-translate/core';
import { Router } from '@angular/router';
import { toSignal } from '@angular/core/rxjs-interop';
import { MatDialog } from '@angular/material/dialog';
import { MatTabsModule } from '@angular/material/tabs';
import { MatExpansionModule } from '@angular/material/expansion';

import { FavoritesFacade } from '@shared/services/favorites.facade';
import { FavoriteUrl, FavoriteType } from '@store/interfaces/favorites.model';
import { ConfirmDialogComponent, SeoComponent } from '@cadai/pxs-ng-core/shared';
import { LayoutService, ToolbarActionsService } from '@cadai/pxs-ng-core/services';
import { ConfirmDialogData, ToolbarAction } from '@cadai/pxs-ng-core/interfaces';
import { MatSidenavModule } from '@angular/material/sidenav';
import { firstValueFrom, of } from 'rxjs';
import { MatTooltip } from "@angular/material/tooltip";

@Component({
  selector: 'app-favorites',
  standalone: true,
  imports: [
    CommonModule,
    MatCardModule,
    MatIconModule,
    MatButtonModule,
    MatChipsModule,
    MatProgressSpinnerModule,
    TranslateModule,
    SeoComponent,
    MatSidenavModule,
    MatTabsModule,
    MatExpansionModule,
    MatButtonModule,
    MatTooltip
],
  templateUrl: './favorites.component.html',
  styleUrls: ['./favorites.component.scss']
})
export class FavoritesComponent implements OnInit {
  private favoritesFacade = inject(FavoritesFacade);
  private layoutService = inject(LayoutService);
  private toolbarService = inject(ToolbarActionsService);
  private translateService = inject(TranslateService);
  private router = inject(Router);
  private destroyRef = inject(DestroyRef);
  private dialog = inject(MatDialog);

  // Convert observables to signals
  readonly sortedFavorites = toSignal(this.favoritesFacade.sortedFavorites$, { initialValue: [] });
  readonly groupedFavorites = toSignal(this.favoritesFacade.groupedFavorites$, { 
    initialValue: {
      [FavoriteType.PROJECT]: [],
      [FavoriteType.CHAT]: [],
      [FavoriteType.EXTRACT]: [],
      [FavoriteType.COMPARE]: [],
      [FavoriteType.SUMMARIZE]: [],
    } 
  });
  readonly favoritesCountByType = toSignal(this.favoritesFacade.favoritesCountByType$, {
    initialValue: {
      [FavoriteType.PROJECT]: 0,
      [FavoriteType.CHAT]: 0,
      [FavoriteType.EXTRACT]: 0,
      [FavoriteType.COMPARE]: 0,
      [FavoriteType.SUMMARIZE]: 0,
    }
  });
  readonly loading = toSignal(this.favoritesFacade.loading$, { initialValue: false });
  readonly error = toSignal(this.favoritesFacade.error$);
  readonly count = toSignal(this.favoritesFacade.count$, { initialValue: 0 });
  readonly hasFavorites = toSignal(this.favoritesFacade.hasFavorites$, { initialValue: false });

  // Computed signals
  readonly showLoading = computed(() => this.loading());
  readonly showError = computed(() => !!this.error());
  readonly showEmpty = computed(() => !this.loading() && !this.hasFavorites());
  readonly showContent = computed(() => !this.loading() && this.hasFavorites());

  // Expose FavoriteType enum to template
  readonly FavoriteType = FavoriteType;

  ngOnInit(): void {
    this.favoritesFacade.loadFavorites();
    
    this.setToolbarButtons();
    this.setBreadcrumbs();
  }

  private setToolbarButtons(): void {
    const clearAll: ToolbarAction = {
      id: 'clear-all',
      icon: 'delete_sweep',
      tooltip: 'clear_all',
      class: "warn",
      variant: "flat",
      label: this.translateService.instant("favorites.clear-all"),
      disabled$: of(this.sortedFavorites().length === 0),
      click: () => this.clearAll(),
    };

    this.toolbarService.scope(this.destroyRef, [clearAll]);
  }

  private setBreadcrumbs(): void {
    this.layoutService.setBreadcrumbs([
      { label: this.translateService.instant("nav.genai-favorites") }
    ]);
  }

  async removeFavorite(id: string, event: Event): Promise<void> {
    event.preventDefault();
    event.stopPropagation();

    const favorite = this.sortedFavorites().find(f => f.id === id);
    if (!favorite) return;

    const confirmed = await firstValueFrom(
      this.dialog.open<ConfirmDialogComponent, ConfirmDialogData, boolean>(
        ConfirmDialogComponent,
        {
          data: {
            title: this.translateService.instant('favorites.confirm-remove-title'),
            message: this.translateService.instant('favorites.confirm-remove-message', {
              title: favorite.title
            }),
            context: { favorite },
          }
        }
      ).afterClosed()
    );

    if (!confirmed) return;
    
    this.favoritesFacade.removeFavorite(id);
  }

  async clearAll(): Promise<void> {
    const confirmed = await firstValueFrom(
      this.dialog.open<ConfirmDialogComponent, ConfirmDialogData, boolean>(
        ConfirmDialogComponent,
        {
          data: {
            title: this.translateService.instant('favorites.confirm-clear-title'),
            message: this.translateService.instant('favorites.confirm-clear-message', {
              count: this.count()
            }),
          }
        }
      ).afterClosed()
    );

    if (!confirmed) return;

    this.favoritesFacade.clearAll();
  }

  navigateToUrl(url: string): void {
    if (url.startsWith('/')) {
      this.router.navigateByUrl(url);
    } else {
      window.open(url, '_blank');
    }
  }

  trackByFavoriteId(index: number, favorite: FavoriteUrl): string {
    return favorite.id;
  }

  onTitleChange(title: string): void {
    this.layoutService.setTitle(title);
  }

  getCategoryIcon(type: FavoriteType): string {
    const icons: Record<FavoriteType, string> = {
      [FavoriteType.PROJECT]: 'folder',
      [FavoriteType.CHAT]: 'forum',
      [FavoriteType.EXTRACT]: 'content_paste',
      [FavoriteType.COMPARE]: 'compare_arrows',
      [FavoriteType.SUMMARIZE]: 'summarize',
    };
    return icons[type] || 'star';
  }

  getCategoryLabel(type: FavoriteType): string {
    const labels: Record<FavoriteType, string> = {
      [FavoriteType.PROJECT]: 'favorites.categories.projects',
      [FavoriteType.CHAT]: 'favorites.categories.chats',
      [FavoriteType.EXTRACT]: 'favorites.categories.extracts',
      [FavoriteType.COMPARE]: 'favorites.categories.comparisons',
      [FavoriteType.SUMMARIZE]: 'favorites.categories.summaries',
    };
    return this.translateService.instant(labels[type] || 'favorites.categories.other');
  }
}