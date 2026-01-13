import { createFeatureSelector, createSelector } from '@ngrx/store';
import { FavoritesState, FavoriteType } from '@store/interfaces/favorites.model';

export const selectFavoritesState = createFeatureSelector<FavoritesState>('favorites');

export const selectFavoriteById = (id: string) =>
  createSelector(
    selectFavoritesState,
    (state) => state.favorites.find((f) => f.id === id)
  );

export const selectIsFavorite = (url: string) =>
  createSelector(
    selectFavoritesState,
    (state) => state.favorites.some((f) => f.url === url)
  );

export const selectFavoritesCount = createSelector(
  selectFavoritesState,
  (state) => state.favorites.length
);

export const selectSortedFavorites = createSelector(
  selectFavoritesState,
  (state) => [...state.favorites].sort((a, b) => b.timestamp - a.timestamp)
);

export const selectHasFavorites = createSelector(
  selectFavoritesState,
  (state) => state.favorites.length > 0
);

export const selectFavorites = createSelector(
  selectFavoritesState,
  (state) => state.favorites
);

export const selectLoading = createSelector(
  selectFavoritesState,
  (state) => state.loading
);

export const selectError = createSelector(
  selectFavoritesState,
  (state) => state.error
);

// Select favorites by type
export const selectFavoritesByType = (type: FavoriteType) =>
  createSelector(
    selectFavoritesState,
    (state) => state.favorites
      .filter(f => f.favoriteType === type)
      .sort((a, b) => b.timestamp - a.timestamp)
  );

// Select grouped favorites by type
export const selectGroupedFavorites = createSelector(
  selectFavoritesState,
  (state) => {
    const grouped: Record<FavoriteType, typeof state.favorites> = {
      [FavoriteType.PROJECT]: [],
      [FavoriteType.CHAT]: [],
      [FavoriteType.EXTRACT]: [],
      [FavoriteType.COMPARE]: [],
      [FavoriteType.SUMMARIZE]: [],
    };

    state.favorites.forEach(fav => {
      if (fav.favoriteType && grouped[fav.favoriteType]) {
        grouped[fav.favoriteType].push(fav);
      }
    });

    // Sort each group by timestamp
    Object.keys(grouped).forEach(key => {
      grouped[key as FavoriteType].sort((a, b) => b.timestamp - a.timestamp);
    });

    return grouped;
  }
);

// Count favorites by type
export const selectFavoritesCountByType = createSelector(
  selectFavoritesState,
  (state) => {
    const counts: Record<FavoriteType, number> = {
      [FavoriteType.PROJECT]: 0,
      [FavoriteType.CHAT]: 0,
      [FavoriteType.EXTRACT]: 0,
      [FavoriteType.COMPARE]: 0,
      [FavoriteType.SUMMARIZE]: 0,
    };

    state.favorites.forEach(fav => {
      if (fav.favoriteType && counts[fav.favoriteType] !== undefined) {
        counts[fav.favoriteType]++;
      }
    });

    return counts;
  }
);

export const selectFavoritesWithLoading = createSelector(
  selectFavoritesState,
  (state) => ({
    favorites: state.favorites,
    loading: state.loading,
    error: state.error,
  })
);