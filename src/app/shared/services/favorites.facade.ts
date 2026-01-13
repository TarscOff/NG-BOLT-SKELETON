import { Injectable, inject } from '@angular/core';
import { Store } from '@ngrx/store';
import { Observable } from 'rxjs';
import * as FavoritesActions from '@store/favorites/favorites.actions';
import { FavoriteUrl, FavoriteType } from '@store/interfaces/favorites.model';
import {
  selectFavoriteById,
  selectIsFavorite,
  selectFavoritesCount,
  selectSortedFavorites,
  selectHasFavorites,
  selectFavorites,
  selectLoading,
  selectError,
  selectFavoritesByType,
  selectGroupedFavorites,
  selectFavoritesCountByType,
} from '@store/favorites/favorites.selectors';

@Injectable({ providedIn: 'root' })
export class FavoritesFacade {
  private store = inject(Store);

  // Selectors
  readonly favorites$: Observable<FavoriteUrl[]> = this.store.select(selectFavorites);
  readonly sortedFavorites$: Observable<FavoriteUrl[]> = this.store.select(selectSortedFavorites);
  readonly loading$: Observable<boolean> = this.store.select(selectLoading);
  readonly error$: Observable<string | undefined> = this.store.select(selectError);
  readonly count$: Observable<number> = this.store.select(selectFavoritesCount);
  readonly hasFavorites$: Observable<boolean> = this.store.select(selectHasFavorites);
  readonly groupedFavorites$: Observable<Record<FavoriteType, FavoriteUrl[]>> = 
    this.store.select(selectGroupedFavorites);
  readonly favoritesCountByType$: Observable<Record<FavoriteType, number>> = 
    this.store.select(selectFavoritesCountByType);

  // Actions
  loadFavorites(): void {
    this.store.dispatch(FavoritesActions.loadFavorites());
  }

  addFavorite(url: string, title: string, favoriteType: FavoriteType): void {
    this.store.dispatch(FavoritesActions.addFavorite({ url, title, favoriteType }));
  }

  removeFavorite(id: string): void {
    this.store.dispatch(FavoritesActions.removeFavorite({ id }));
  }

  clearAll(): void {
    this.store.dispatch(FavoritesActions.clearFavorites());
  }

  // Dynamic selectors
  getFavoriteById(id: string): Observable<FavoriteUrl | undefined> {
    return this.store.select(selectFavoriteById(id));
  }

  isFavorite(url: string): Observable<boolean> {
    return this.store.select(selectIsFavorite(url));
  }

  getFavoritesByType(type: FavoriteType): Observable<FavoriteUrl[]> {
    return this.store.select(selectFavoritesByType(type));
  }
}