import {  createReducer, on } from '@ngrx/store';
import * as FavoritesActions from './favorites.actions';
import { FavoritesState } from '@store/interfaces/favorites.model';


const initialState: FavoritesState = {
  favorites: [],
  loading: false,
  error: undefined,
};

export const FavoritesReducer = createReducer<FavoritesState>(
  initialState,
  // Load favorites
  on(FavoritesActions.loadFavorites, (state) => ({
    ...state,
    loading: true,
    error: undefined,
  })),
  on(FavoritesActions.loadFavoritesSuccess, (state, { favorites }) => ({
    ...state,
    loading: false,
    favorites,
  })),
  on(FavoritesActions.loadFavoritesFailure, (state, { error }) => ({
    ...state,
    loading: false,
    error,
  })),
  
  // Add favorite
  on(FavoritesActions.addFavorite, (state) => ({
    ...state,
    loading: true,
    error: undefined,
  })),
  on(FavoritesActions.addFavoriteSuccess, (state, { favorite }) => ({
    ...state,
    loading: false,
    favorites: [...state.favorites, favorite],
  })),
  on(FavoritesActions.addFavoriteFailure, (state, { error }) => ({
    ...state,
    loading: false,
    error,
  })),
  
  // Remove favorite
  on(FavoritesActions.removeFavorite, (state) => ({
    ...state,
    loading: true,
    error: undefined,
  })),
  on(FavoritesActions.removeFavoriteSuccess, (state, { id }) => ({
    ...state,
    loading: false,
    favorites: state.favorites.filter((f) => f.id !== id),
  })),
  on(FavoritesActions.removeFavoriteFailure, (state, { error }) => ({
    ...state,
    loading: false,
    error,
  })),
  
  // Clear favorites
  on(FavoritesActions.clearFavorites, (state) => ({
    ...state,
    loading: true,
    error: undefined,
  })),
  on(FavoritesActions.clearFavoritesSuccess, (state) => ({
    ...state,
    loading: false,
    favorites: [],
  })),
  on(FavoritesActions.clearFavoritesFailure, (state, { error }) => ({
    ...state,
    loading: false,
    error,
  }))
);