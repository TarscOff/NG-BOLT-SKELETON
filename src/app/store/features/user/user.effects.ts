import { inject } from '@angular/core';
import { Actions, createEffect, ofType } from '@ngrx/effects';
import * as UserActions from './user.actions';
import { catchError, map, mergeMap, of } from 'rxjs';
import { UserService } from '../../../core/services/user.service';

export const loadUser = createEffect(() => {
    const actions$ = inject(Actions);
    const userService = inject(UserService);
    return actions$.pipe(
        ofType(UserActions.loadUser),
        mergeMap(() =>
            userService.getCurrentUser().pipe(
                map(user => UserActions.loadUserSuccess({ user })),
                catchError(error => of(UserActions.loadUserFailure({ error: error.message })))
            )
        )
    );
}, { functional: true })

export const loadUsers = createEffect(() => {
    const actions$ = inject(Actions);
    const userService = inject(UserService);

    return actions$.pipe(
        ofType(UserActions.loadUsers),
        mergeMap(() =>
            userService.getAll().pipe(
                map(users => UserActions.loadUsersSuccess({ users })),
                catchError(error => of(UserActions.loadUsersFailure({ error: error.message })))
            )
        )
    )
}, { functional: true })

export const createUser = createEffect(() => {
    const actions$ = inject(Actions);
    const userService = inject(UserService);

    return actions$.pipe(
        ofType(UserActions.createUser),
        mergeMap(({ user }) =>
            userService.create(user).pipe(
                map(newUser => UserActions.createUserSuccess({ user: newUser })),
                catchError(error => of(UserActions.createUserFailure({ error: error.message })))
            )
        )
    )
}, { functional: true })

export const updateUser = createEffect(() => {
    const actions$ = inject(Actions);
    const userService = inject(UserService);
    return actions$.pipe(
        ofType(UserActions.updateUser),
        mergeMap(({ id, user }) =>
            userService.update(id, user).pipe(
                map(updated => UserActions.updateUserSuccess({ user: updated })),
                catchError(error => of(UserActions.updateUserFailure({ error: error.message })))
            )
        )
    )
}, { functional: true })

export const deleteUser = createEffect(() => {
    const actions$ = inject(Actions);
    const userService = inject(UserService);
    return actions$.pipe(
        ofType(UserActions.deleteUser),
        mergeMap(({ id }) =>
            userService.delete(id).pipe(
                map(() => UserActions.deleteUserSuccess({ id })),
                catchError(error => of(UserActions.deleteUserFailure({ error: error.message })))
            )
        )
    )
}, { functional: true })

