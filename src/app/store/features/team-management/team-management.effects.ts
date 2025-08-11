import { inject } from '@angular/core';
import { Actions, createEffect, ofType } from '@ngrx/effects';
import { tap } from 'rxjs/operators';
import * as TeamActions from './team-management.actions';
import { ToastService } from '../../../core/services/toast.service';

export const showSaveToast = createEffect(() => {
    const actions$ = inject(Actions);
    const toast = inject(ToastService);

    return actions$.pipe(
        ofType(TeamActions.saveTeamForm),
        tap(() => {
            toast.show('Form submitted successfully');
        })
    );
}, { functional: true, dispatch: false });

export const showUpdateToast = createEffect(() => {
    const actions$ = inject(Actions);
    const toast = inject(ToastService);

    return actions$.pipe(
        ofType(TeamActions.updateTeamForm),
        tap(() => {
            toast.show('Form updated successfully');
        })
    );
}, { functional: true, dispatch: false });

export const showDeleteToast = createEffect(() => {
    const actions$ = inject(Actions);
    const toast = inject(ToastService);

    return actions$.pipe(
        ofType(TeamActions.removeTeamMember),
        tap(() => {
            toast.show('Mamber deleted successfully');
        })
    );
}, { functional: true, dispatch: false });