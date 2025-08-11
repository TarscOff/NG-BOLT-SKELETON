import { createAction, props } from '@ngrx/store';
import { User } from './user.model';

// Get one user
export const loadUser = createAction('[User] Load');
export const loadUserSuccess = createAction('[User] Load Success', props<{ user: User }>());
export const loadUserFailure = createAction('[User] Load Failure', props<{ error: string }>());

// Get all users
export const loadUsers = createAction('[User] Load All');
export const loadUsersSuccess = createAction('[User] Load All Success', props<{ users: User[] }>());
export const loadUsersFailure = createAction('[User] Load All Failure', props<{ error: string }>());

// Create user
export const createUser = createAction('[User] Create', props<{ user: Partial<User> }>());
export const createUserSuccess = createAction('[User] Create Success', props<{ user: User }>());
export const createUserFailure = createAction('[User] Create Failure', props<{ error: string }>());

// Update user
export const updateUser = createAction('[User] Update', props<{ id: string, user: Partial<User> }>());
export const updateUserSuccess = createAction('[User] Update Success', props<{ user: User }>());
export const updateUserFailure = createAction('[User] Update Failure', props<{ error: string }>());

// Delete user
export const deleteUser = createAction('[User] Delete', props<{ id: string }>());
export const deleteUserSuccess = createAction('[User] Delete Success', props<{ id: string }>());
export const deleteUserFailure = createAction('[User] Delete Failure', props<{ error: string }>());