import { createFeatureSelector, createSelector } from '@ngrx/store';
import { UserState } from './user.model';

export const selectUserState = createFeatureSelector<UserState>('user');

export const selectUser = createSelector(selectUserState, state => state.user);
export const selectUserRole = createSelector(selectUser, user => user?.role ?? null);
export const selectUserLoading = createSelector(selectUserState, state => state.loading);
export const selectUsers = createSelector(selectUserState, state => state.users);
export const selectUserError = createSelector(selectUserState, state => state.error);
