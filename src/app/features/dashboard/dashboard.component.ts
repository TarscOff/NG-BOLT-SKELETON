import { Component, Input, OnInit, ViewEncapsulation } from '@angular/core';
import { ConfirmDialogComponent, DynamicFormComponent, SeoComponent } from '../../shared/shared';
import { FieldConfig } from '../../shared/forms/field-config.model';
import { FormBuilder, FormGroup } from '@angular/forms';
import { FieldConfigService } from '../../core/services/field-config.service';
import { ToastService } from '../../core/services/toast.service';
import { MatDialog } from '@angular/material/dialog';
import { MatTooltip } from '@angular/material/tooltip';
import { MatIcon } from '@angular/material/icon';
import { ThemeService } from '../../core/services/theme.service';
import { MatButtonModule } from '@angular/material/button';
import { TranslateModule, TranslatePipe, TranslateService } from '@ngx-translate/core';
import { MatFormField, MatHint, MatLabel } from '@angular/material/form-field';
import { MatOption, MatSelect } from '@angular/material/select';
import { MatGridListModule } from '@angular/material/grid-list';
import { firstValueFrom, Observable } from 'rxjs';
import { Store } from '@ngrx/store';
import { selectUser, selectUserLoading } from '../../store/features/user/user.selectors';
import { loadUser } from '../../store/features/user/user.actions';
import { User } from '../../store/features/user/user.model';
import { clearTeamForm, removeTeamMember, saveTeamForm, updateTeamForm } from '../../store/features/team-management/team-management.actions';
import { selectTeamLoading, selectTeamMembers } from '../../store/features/team-management/team-management.selectors';
import { TeamMember } from '../../store/features/team-management/team-management.model';
import { MatListModule } from '@angular/material/list';
import { CommonModule } from '@angular/common';
import { LayoutService } from '../../core/services/layout.service';
import { ConfigService } from '../../core/services/config.service';


@Component({
  selector: 'app-dashboard',
  imports: [SeoComponent, DynamicFormComponent, MatTooltip, MatIcon, MatButtonModule, TranslatePipe, MatHint, MatOption, MatSelect, MatLabel, MatFormField, TranslateModule, MatGridListModule, MatListModule, CommonModule],
  standalone: true,
  templateUrl: './dashboard.component.html',
  styleUrl: './dashboard.component.scss',
  encapsulation: ViewEncapsulation.None
})
export class DashboardComponent implements OnInit {

  constructor(
    private fb: FormBuilder,
    private fieldsConfigService: FieldConfigService,
    private toast: ToastService,
    private dialog: MatDialog,
    public theme: ThemeService,
    public translate: TranslateService,
    private store: Store,
    private layoutService: LayoutService,
    private configService: ConfigService
  ) {

  }

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
    // Env configs
    this.version = this.configService.getAll().version || '0.0.0';

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
      this.fieldsConfigService.getRangeField("form.labels.price", 0, 200, 1),
    ];

    // NGRX
    this.user$ = this.store.select(selectUser);
    this.userloading$ = this.store.select(selectUserLoading);
    this.store.dispatch(loadUser());

    // NGRX
    this.members$ = this.store.select(selectTeamMembers);
    this.teamloading$ = this.store.select(selectTeamLoading);
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
      this.store.dispatch(updateTeamForm({ member }));
    } else {
      this.store.dispatch(saveTeamForm({ member }));
    }
    this.form.reset();
    this.store.dispatch(clearTeamForm());
    this.selectedMemberId = null;
  }

  public changeLang(lang: string) {
    this.translate.use(lang);
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

    this.store.dispatch(removeTeamMember({ member }));
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
