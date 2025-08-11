import { createReducer, on } from '@ngrx/store';
import * as TeamActions from './team-management.actions';
import { TeamManagementState } from './team-management.model';

const initialState: TeamManagementState = {
    members: [],
    loading: false,
    error: null
};


export const teamManagementReducer = createReducer(
    initialState,
    on(TeamActions.saveTeamForm, (state, { member }) => ({
        ...state,
        members: [...state.members, member],
        loading: false,
        error: null
    })),
    on(TeamActions.updateTeamForm, (state, { member }) => ({
        ...state,
        members: state.members.map(m => m.id === member.id ? member : m),
        loading: false,
        error: null
    })),
    on(TeamActions.removeTeamMember, (state, { member }) => ({
        ...state,
        members: state.members.filter(m => m.id !== member.id)
    })),
    on(TeamActions.saveFormFailure, (state, { error }) => ({
        ...state,
        error,
        loading: false
    })),
    on(TeamActions.clearTeamForm, (state) => ({
        ...state,
        form: undefined,
    }))
);
