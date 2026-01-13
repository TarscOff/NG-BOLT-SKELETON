import { createAction, props } from '@ngrx/store';
import { FavoriteUrl, FavoriteType } from '@store/interfaces/favorites.model';

// Load favorites from storage
export const loadFavorites = createAction('[Favorites] Load Favorites');

export const loadFavoritesSuccess = createAction(
  '[Favorites] Load Favorites Success',
  props<{ favorites: FavoriteUrl[] }>()
);

export const loadFavoritesFailure = createAction(
  '[Favorites] Load Favorites Failure',
  props<{ error: string }>()
);

export const addFavorite = createAction(
  '[Favorites] Add Favorite',
  props<{ url: string; title: string; favoriteType: FavoriteType }>()
);

export const addFavoriteSuccess = createAction(
  '[Favorites] Add Favorite Success',
  props<{ favorite: FavoriteUrl }>()
);

export const addFavoriteFailure = createAction(
  '[Favorites] Add Favorite Failure',
  props<{ error: string }>()
);

// Remove a favorite
export const removeFavorite = createAction(
  '[Favorites] Remove Favorite',
  props<{ id: string }>()
);

export const removeFavoriteSuccess = createAction(
  '[Favorites] Remove Favorite Success',
  props<{ id: string }>()
);

export const removeFavoriteFailure = createAction(
  '[Favorites] Remove Favorite Failure',
  props<{ error: string }>()
);

// Clear all favorites
export const clearFavorites = createAction('[Favorites] Clear All Favorites');

export const clearFavoritesSuccess = createAction('[Favorites] Clear All Success');

export const clearFavoritesFailure = createAction(
  '[Favorites] Clear All Failure',
  props<{ error: string }>()
);