import { inject } from '@angular/core';
import { Actions, createEffect, ofType } from '@ngrx/effects';
import { of } from 'rxjs';
import { mergeMap, tap } from 'rxjs/operators';
import { TranslateService } from '@ngx-translate/core';
import { ToastService } from '@cadai/pxs-ng-core/services';
import * as FavoritesActions from './favorites.actions';
import { FavoritesStorageService } from '@shared/services/favorites.service';

// Load favorites effect
export const loadFavoritesEffect = createEffect(
  () => {
    const actions$ = inject(Actions);
    const storage = inject(FavoritesStorageService);

    return actions$.pipe(
      ofType(FavoritesActions.loadFavorites),
      mergeMap(() => {
        try {
          const favorites = storage.loadFavorites();
          return of(FavoritesActions.loadFavoritesSuccess({ favorites }));
        } catch (err) {
          const error = err instanceof Error ? err.message : String(err);
          return of(FavoritesActions.loadFavoritesFailure({ error }));
        }
      })
    );
  },
  { functional: true }
);

// Add favorite effect (now with favoriteType)
export const addFavoriteEffect = createEffect(
  () => {
    const actions$ = inject(Actions);
    const storage = inject(FavoritesStorageService);

    return actions$.pipe(
      ofType(FavoritesActions.addFavorite),
      mergeMap(({ url, title, favoriteType }) => {
        try {
          const favorite = storage.addFavorite(url, title, favoriteType);
          return of(FavoritesActions.addFavoriteSuccess({ favorite }));
        } catch (err) {
          const error = err instanceof Error ? err.message : String(err);
          return of(FavoritesActions.addFavoriteFailure({ error }));
        }
      })
    );
  },
  { functional: true }
);

// Remove favorite effect
export const removeFavoriteEffect = createEffect(
  () => {
    const actions$ = inject(Actions);
    const storage = inject(FavoritesStorageService);

    return actions$.pipe(
      ofType(FavoritesActions.removeFavorite),
      mergeMap(({ id }) => {
        try {
          storage.removeFavorite(id);
          return of(FavoritesActions.removeFavoriteSuccess({ id }));
        } catch (err) {
          const error = err instanceof Error ? err.message : String(err);
          return of(FavoritesActions.removeFavoriteFailure({ error }));
        }
      })
    );
  },
  { functional: true }
);

// Clear favorites effect
export const clearFavoritesEffect = createEffect(
  () => {
    const actions$ = inject(Actions);
    const storage = inject(FavoritesStorageService);

    return actions$.pipe(
      ofType(FavoritesActions.clearFavorites),
      mergeMap(() => {
        try {
          storage.clearAll();
          return of(FavoritesActions.clearFavoritesSuccess());
        } catch (err) {
          const error = err instanceof Error ? err.message : String(err);
          return of(FavoritesActions.clearFavoritesFailure({ error }));
        }
      })
    );
  },
  { functional: true }
);

// Toast notifications for success actions
export const toastSuccessEffect = createEffect(
  () => {
    const actions$ = inject(Actions);
    const toast = inject(ToastService);
    const translate = inject(TranslateService);

    return actions$.pipe(
      ofType(
        FavoritesActions.addFavoriteSuccess,
        FavoritesActions.removeFavoriteSuccess,
        FavoritesActions.clearFavoritesSuccess
      ),
      tap((action) => {
        switch (action.type) {
          case FavoritesActions.addFavoriteSuccess.type:
            toast.show(translate.instant('favorites.added'));
            break;
          case FavoritesActions.removeFavoriteSuccess.type:
            toast.show(translate.instant('favorites.removed'));
            break;
          case FavoritesActions.clearFavoritesSuccess.type:
            toast.show(translate.instant('favorites.cleared'));
            break;
        }
      })
    );
  },
  { functional: true, dispatch: false }
);

// Toast notifications for error actions
export const toastErrorEffect = createEffect(
  () => {
    const actions$ = inject(Actions);
    const toast = inject(ToastService);
    const translate = inject(TranslateService);

    return actions$.pipe(
      ofType(
        FavoritesActions.addFavoriteFailure,
        FavoritesActions.removeFavoriteFailure,
        FavoritesActions.clearFavoritesFailure,
        FavoritesActions.loadFavoritesFailure
      ),
      tap((action) => {
        const errorMessage = 'error' in action ? action.error : translate.instant('favorites.error.unknown');
        toast.showError(errorMessage);
      })
    );
  },
  { functional: true, dispatch: false }
);