import { Component, Input, OnInit, ViewEncapsulation } from '@angular/core';
import { FormBuilder, FormGroup, ReactiveFormsModule } from '@angular/forms';
import { MatDialog, MatDialogModule } from '@angular/material/dialog';
import { MatTooltip } from '@angular/material/tooltip';
import { MatIcon } from '@angular/material/icon';
import { MatButtonModule } from '@angular/material/button';
import { TranslateModule } from '@ngx-translate/core';
import { MatGridListModule } from '@angular/material/grid-list';
import { firstValueFrom, Observable } from 'rxjs';
import { Store } from '@ngrx/store';
import { MatListModule } from '@angular/material/list';
import { CommonModule } from '@angular/common';
import { ConfirmDialogComponent, DynamicFormComponent, SeoComponent } from '@cadai/pxs-ng-core/shared';
import { FieldConfigService, LayoutService, ToastService } from '@cadai/pxs-ng-core/services';
import { FieldConfig, TeamMember, User } from '@cadai/pxs-ng-core/interfaces';
import { AppActions, AppSelectors } from '@cadai/pxs-ng-core/store';
import { RouterModule } from '@angular/router';

@Component({
  selector: 'app-dashboard',
  standalone: true,
  imports: [
    CommonModule,
    ReactiveFormsModule,      // ✅ needed for FormBuilder/FormGroup
    RouterModule,

    // Material
    MatDialogModule,          // ✅ needed for MatDialog service
    MatButtonModule,
    MatGridListModule,
    MatListModule,
    MatIcon,                  // (or MatIconModule if < v17)
    MatTooltip,               // (or MatTooltipModule if < v17)

    // i18n
    TranslateModule,          // ✅ keep this; remove TranslatePipe

    // your shared components (must be standalone)
    SeoComponent,
    DynamicFormComponent,
  ],
  templateUrl: './dashboard.component.html',
  styleUrl: './dashboard.component.scss',
  encapsulation: ViewEncapsulation.None,
})
export class DashboardComponent implements OnInit {
  constructor(
    private fb: FormBuilder,
    private fieldsConfigService: FieldConfigService,
    private toast: ToastService,
    private dialog: MatDialog,
    private store: Store,
    private layoutService: LayoutService,
  ) {}

  public selectedMemberId: number | null = null;
  @Input() name!: string;

  // Get ENV variables
  public version!: string;
  // Dynamic Form management
  public form!: FormGroup;
  public fieldConfig: FieldConfig[] = [];

  // NGRX
  public user$!: Observable<User | null>;
  public members$!: Observable<TeamMember[] | []>;
  public userloading$!: Observable<boolean>;
  public teamloading$!: Observable<boolean>;


  public ngOnInit(): void {
    /* Form management */
    this.form = this.fb.group({});
    this.fieldConfig = [
      this.fieldsConfigService.getTextField('form.labels.fullname', 'form.placeholders.fullname'),
      this.fieldsConfigService.getEmailField("form.labels.email", "form.placeholders.email"),
      this.fieldsConfigService.getPasswordField("form.labels.password", "form.placeholders.password"),
      this.fieldsConfigService.getPhoneField("form.labels.phone", "form.placeholders.phone"),
      this.fieldsConfigService.getToggleField("form.labels.notify"),
      this.fieldsConfigService.getDropdownField("form.labels.role"),
      this.fieldsConfigService.getDatepickerField("form.labels.dob"),
      this.fieldsConfigService.getChipsField("form.labels.tags"),
      this.fieldsConfigService.getAutocompleteField("form.labels.country"),
      this.fieldsConfigService.getRangeField("form.labels.price", 0, 200, 5),
      this.fieldsConfigService.getTextAreaField("form.labels.input", "form.placeholders.input"),
    ];

    // NGRX
    this.user$ = this.store.select(AppSelectors.UserSelectors.selectUser);
    this.userloading$ = this.store.select(AppSelectors.UserSelectors.selectUserLoading);
    this.store.dispatch(AppActions.UserActions.loadUser());

    // NGRX
    this.members$ = this.store.select(AppSelectors.TeamSelectors.selectTeamMembers);
    this.teamloading$ = this.store.select(AppSelectors.TeamSelectors.selectTeamLoading);
  }

  public onTitleChange(title: string): void {
    this.layoutService.setTitle(title);
  }

  public async submit(): Promise<void> {
    if (this.form.invalid) {
      this.toast.show('Form is invalid', 'Dismiss');
      return;
    }

    const confirmed = await firstValueFrom(this.dialog.open(ConfirmDialogComponent, {
      data: {
        title: 'Submit Form',
        message: 'Are you sure you want to submit this form?'
      }
    }).afterClosed())

    if (!confirmed) {
      this.toast.show('Submission canceled');
      return;
    }
    const raw = this.form.getRawValue();

    const member: TeamMember = {
      id: this.selectedMemberId || Date.now(),
      fullname: raw.input,
      email: raw.email,
      phone: raw.phone,
      role: raw.role,
      dob: raw.dob,
      country: raw.country,
      password: raw.password,
      tags: raw.tags
    };

    // check if we adding a new element of just updating
    if (this.selectedMemberId) {
      this.store.dispatch(AppActions.TeamActions.updateTeamForm({ member }));
    } else {
      this.store.dispatch(AppActions.TeamActions.saveTeamForm({ member }));
    }
    this.form.reset();
    this.store.dispatch(AppActions.TeamActions.clearTeamForm());
    this.selectedMemberId = null;
  }

  public async removeMember(member: TeamMember): Promise<void> {
    const confirmed = await firstValueFrom(this.dialog.open(ConfirmDialogComponent, {
      data: {
        title: 'Delete Member',
        message: 'Are you sure you want to delete this member?'
      }
    }).afterClosed())

    if (!confirmed) {
      this.toast.show('Submission canceled');
      return;
    }

    this.store.dispatch(AppActions.TeamActions.removeTeamMember({ member }));
  }

  public editMember(member: TeamMember) {
    this.selectedMemberId = member.id;

    this.form.patchValue({
      input: member.fullname,
      email: member.email,
      phone: member.phone,
      role: member.role,
      dob: member.dob,
      country: member.country,
      password: member.password,
      tags: member.tags
    });
  }
}
