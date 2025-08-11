import { createReducer, on } from '@ngrx/store';
import * as UserActions from './user.actions';
import { UserState } from './user.model';

const initialState: UserState = {
  user: null,
  users: [],
  loading: false,
  error: null
};

export const userReducer = createReducer(
  initialState,

  // Load single user
  on(UserActions.loadUser, state => ({ ...state, loading: true, error: null })),
  on(UserActions.loadUserSuccess, (state, { user }) => ({ ...state, loading: false, user })),
  on(UserActions.loadUserFailure, (state, { error }) => ({ ...state, loading: false, error })),

  // Load all users
  on(UserActions.loadUsers, state => ({ ...state, loading: true, error: null })),
  on(UserActions.loadUsersSuccess, (state, { users }) => ({ ...state, loading: false, users })),
  on(UserActions.loadUsersFailure, (state, { error }) => ({ ...state, loading: false, error })),

  // Create user
  on(UserActions.createUser, state => ({ ...state, loading: true, error: null })),
  on(UserActions.createUserSuccess, (state, { user }) => ({
    ...state,
    loading: false,
    users: [...state.users, user]
  })),
  on(UserActions.createUserFailure, (state, { error }) => ({ ...state, loading: false, error })),

  // Update user
  on(UserActions.updateUser, state => ({ ...state, loading: true, error: null })),
  on(UserActions.updateUserSuccess, (state, { user }) => ({
    ...state,
    loading: false,
    users: state.users.map(u => u.id === user.id ? user : u)
  })),
  on(UserActions.updateUserFailure, (state, { error }) => ({ ...state, loading: false, error })),

  // Delete user
  on(UserActions.deleteUser, state => ({ ...state, loading: true, error: null })),
  on(UserActions.deleteUserSuccess, (state, { id }) => ({
    ...state,
    loading: false,
    users: state.users.filter(u => u.id !== id)
  })),
  on(UserActions.deleteUserFailure, (state, { error }) => ({ ...state, loading: false, error }))
);
