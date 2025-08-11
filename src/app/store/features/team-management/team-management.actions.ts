import { createAction, props } from "@ngrx/store";
import { TeamMember } from "./team-management.model";


export const saveTeamForm = createAction(
  '[Team] Save Team Form',
  props<{ member: TeamMember }>()
);
export const updateTeamForm = createAction(
  '[Team] Update Team Form',
  props<{ member: TeamMember }>()
);
export const saveFormFailure = createAction('[Team] Save Failure', props<{ error: string }>());
export const clearTeamForm = createAction('[Team] Clear Form');
export const removeTeamMember = createAction('[Team] Remove Member', props<{ member: TeamMember }>());
