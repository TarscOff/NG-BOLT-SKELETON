import { createFeatureSelector, createSelector } from '@ngrx/store';
import { TeamManagementState } from './team-management.model';

// 1. Root selector
export const selectTeamState = createFeatureSelector<TeamManagementState>('teamManagement');

// 2. Members
export const selectTeamMembers = createSelector(
  selectTeamState,
  (state) => state.members
);

// 3. Loading state
export const selectTeamLoading = createSelector(
  selectTeamState,
  (state) => state.loading
);

// 4. Error message
export const selectTeamError = createSelector(
  selectTeamState,
  (state) => state.error
);