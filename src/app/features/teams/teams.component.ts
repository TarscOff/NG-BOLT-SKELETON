import { Component, OnInit } from '@angular/core';
import { MatIcon } from '@angular/material/icon';
import { firstValueFrom, Observable } from 'rxjs';
import { MatDialog } from '@angular/material/dialog';
import { Store } from '@ngrx/store';
import { TranslateModule } from '@ngx-translate/core';
import { MatListModule } from '@angular/material/list';
import { CommonModule } from '@angular/common';
import { MatButtonModule } from '@angular/material/button';
import { ConfirmDialogComponent, SeoComponent } from '@cadai/pxs-ng-core/shared';
import { AppActions, AppSelectors } from '@cadai/pxs-ng-core/store';

import { LayoutService, ToastService } from '@cadai/pxs-ng-core/services';
import { TeamMember } from '@cadai/pxs-ng-core/interfaces';

@Component({
  selector: 'app-teams',
  imports: [SeoComponent, MatIcon, TranslateModule, MatListModule, CommonModule, MatButtonModule],
  templateUrl: './teams.component.html',
  styleUrl: './teams.component.scss'
})
export class TeamsComponent implements OnInit {
  public members$!: Observable<TeamMember[] | []>;
  public loading$!: Observable<boolean>;

  constructor(
    private dialog: MatDialog,
    private toast: ToastService,
    private store: Store,
    private layoutService: LayoutService
  ) { }

  public ngOnInit(): void {
    this.members$ = this.store.select(AppSelectors.TeamSelectors.selectTeamMembers);
    this.loading$ = this.store.select(AppSelectors.TeamSelectors.selectTeamLoading);
  }

  public onTitleChange(title: string): void {
    this.layoutService.setTitle(title);
  }

  public async removeMember(member: TeamMember): Promise<void> {
    const confirmed = await firstValueFrom(this.dialog.open(ConfirmDialogComponent, {
      data: {
        title: 'Delete Mamber',
        message: 'Are you sure you want to delete this member?'
      }
    }).afterClosed())

    if (!confirmed) {
      this.toast.show('Submission canceled');
      return;
    }

    this.store.dispatch(AppActions.TeamActions.removeTeamMember({ member }));
  }
}
