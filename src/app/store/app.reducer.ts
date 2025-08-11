import { ActionReducerMap } from '@ngrx/store';
import { UserState } from './features/user/user.model';
import { userReducer } from './features/user/user.reducer';

export interface AppState {
  user: UserState;
}

export const reducers: ActionReducerMap<AppState> = {
  user: userReducer
};
