import { Component, OnInit } from '@angular/core';
import { MatIcon } from '@angular/material/icon';
import { TeamMember } from '../../store/features/team-management/team-management.model';
import { firstValueFrom, Observable } from 'rxjs';
import { MatDialog } from '@angular/material/dialog';
import { ConfirmDialogComponent } from '../../shared/dialog/dialog.component';
import { ToastService } from '../../core/services/toast.service';
import { Store } from '@ngrx/store';
import { removeTeamMember } from '../../store/features/team-management/team-management.actions';
import { TranslateModule } from '@ngx-translate/core';
import { MatListModule } from '@angular/material/list';
import { CommonModule } from '@angular/common';
import { selectTeamLoading, selectTeamMembers } from '../../store/features/team-management/team-management.selectors';
import { MatButtonModule } from '@angular/material/button';
import { SeoComponent } from '../../shared/shared';
import { LayoutService } from '../../core/services/layout.service';

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
    this.members$ = this.store.select(selectTeamMembers);
    this.loading$ = this.store.select(selectTeamLoading);
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

    this.store.dispatch(removeTeamMember({ member }));
  }
}
