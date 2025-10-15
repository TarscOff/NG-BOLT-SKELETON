import { Component, OnInit } from '@angular/core';
import { MatIcon } from '@angular/material/icon';
import { firstValueFrom, Observable } from 'rxjs';
import { MatDialog, MatDialogModule } from '@angular/material/dialog';
import { Store } from '@ngrx/store';
import { TranslateModule } from '@ngx-translate/core';
import { MatListModule } from '@angular/material/list';
import { CommonModule } from '@angular/common';
import { MatButtonModule } from '@angular/material/button';
import { ConfirmDialogComponent, DynamicFormComponent, SeoComponent } from '@cadai/pxs-ng-core/shared';
import { AppActions, AppSelectors } from '@cadai/pxs-ng-core/store';

import { FieldConfigService, LayoutService, ToastService } from '@cadai/pxs-ng-core/services';
import { ConfirmDialogData, FieldConfig, TeamMember, User } from '@cadai/pxs-ng-core/interfaces';
import { FormBuilder, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { passwordStrengthValidator } from '@cadai/pxs-ng-core/utils';
import { DateTime } from 'luxon';


@Component({
  selector: 'app-teams',
  standalone: true,
  imports: [SeoComponent, MatIcon, TranslateModule, MatListModule, CommonModule, MatButtonModule, DynamicFormComponent, MatDialogModule, ReactiveFormsModule],
  templateUrl: './teams.component.html',
  styleUrls: ['./teams.component.scss']
})
export class TeamsComponent implements OnInit {
  public members$!: Observable<TeamMember[] | []>;
  public loading$!: Observable<boolean>;
  // Dynamic Form management
  public form!: FormGroup;
  public fieldConfig: FieldConfig[] = [];
  public selectedMemberId: number | null = null;

  // NGRX
  public user$!: Observable<User | null>;

  constructor(
    private fb: FormBuilder,
    private fieldsConfigService: FieldConfigService,
    private toast: ToastService,
    private dialog: MatDialog,
    private store: Store,
    private layoutService: LayoutService
  ) { }

  public ngOnInit(): void {
    /* Form management */
    this.form = this.fb.group({});
    this.fieldConfig = [
      this.fieldsConfigService.getTextField({
        name: 'fullName',
        label: 'form.labels.fullname',
        placeholder: 'form.placeholders.fullname',
        validators: [Validators.required, Validators.minLength(2), Validators.maxLength(80)],
        errorMessages: { required: 'form.errors.fullname.required' },
        color: "primary",
        layoutClass: "primary",
      }),

      this.fieldsConfigService.getEmailField({
        name: 'email',
        label: 'form.labels.email',
        placeholder: 'form.placeholders.email',
        color: "primary",
        layoutClass: "primary",
      }),

      this.fieldsConfigService.getPasswordField({
        name: 'password',
        label: 'form.labels.password',
        placeholder: 'form.placeholders.password',
        validators: [
          Validators.required,
          Validators.maxLength(128),
          passwordStrengthValidator({ minLength: 8, minUpper: 1, minDigits: 1, minSpecial: 1 }),
        ],
        errorMessages: { special: 'form.errors.password.special' },
        color: "primary",
        layoutClass: "primary",
      }),

      this.fieldsConfigService.getPhoneField({
        name: 'phone',
        label: 'form.labels.phone',
        placeholder: '+352 12345678',
        defaultValue: '+352',
        color: "primary",
        layoutClass: "primary",
      }),

      this.fieldsConfigService.getToggleField({
        name: 'notify',
        label: 'form.labels.notify',
        helperText: 'form.hints.notify',
        required: false,
        color: "primary",
        layoutClass: "primary",
      }),

      this.fieldsConfigService.getDropdownField({
        name: 'role',
        label: 'form.labels.role',
        placeholder: 'form.placeholders.role',
        options: [
          { label: 'Admin', value: 'admin' },
          { label: 'User', value: 'user' },
          { label: 'Manager', value: 'manager' },
        ],
        multiple: false,
        color: "primary",
        layoutClass: "primary",
      }),

      this.fieldsConfigService.getDatepickerField({
        name: 'dob',
        label: 'form.labels.dob',
        placeholder: 'YYYY-MM-DD',
        color: "primary",
        layoutClass: "primary",
      }),

      this.fieldsConfigService.getChipsField({
        name: 'tags',
        label: 'form.labels.tags',
        chipOptions: ['Angular', 'React', 'Vue', 'Node.js'],
        multiple: true,
        color: "primary",
        layoutClass: "primary",
      }),

      this.fieldsConfigService.getAutocompleteField({
        name: 'country',
        label: 'form.labels.country',
        autocompleteOptions: ['Luxembourg', 'Germany', 'France', 'Belgium', 'Netherlands'],
        placeholder: 'form.placeholders.country',
        color: "primary",
        layoutClass: "primary",
      }),

      this.fieldsConfigService.getRangeField({
        name: 'price',
        label: 'form.labels.price',
        min: 0,
        max: 200,
        step: 5,
        defaultValue: 20,
        color: "primary",
        layoutClass: "primary",
      }),

      this.fieldsConfigService.getTextAreaField({
        name: 'input',
        label: 'form.labels.input',
        placeholder: 'form.placeholders.input',
        showCounter: true,
        maxLength: 500,
        color: "primary",
        layoutClass: "primary",
      }),

      this.fieldsConfigService.getFileField({
        name: 'file',
        label: 'form.labels.file',
        multiple: true,
        accept: '.pdf,.docx,image/*',
        maxFiles: 3,
        maxTotalSize: 1 * 1024 * 1024,  // 1 MB total
        required: true,
        validators: [Validators.required],
      }),

      this.fieldsConfigService.getFileField({
        name: 'file2',
        label: 'form.labels.file',
        multiple: false,
        accept: '.pdf,.docx,image/*',
        maxFileSize:  124,
        required: true,
        validators: [Validators.required],
      })
    ];

    // NGRX
    /*     this.user$ = this.store.select(AppSelectors.UserSelectors.selectUser);
        this.userloading$ = this.store.select(AppSelectors.UserSelectors.selectUserLoading);
        this.store.dispatch(AppActions.UserActions.loadUser()); */

    // NGRX
    this.members$ = this.store.select(AppSelectors.TeamSelectors.selectTeamMembers);
    this.loading$ = this.store.select(AppSelectors.TeamSelectors.selectTeamLoading);
  }

  public onTitleChange(title: string): void {
    this.layoutService.setTitle(title);
  }

  public async removeMember(member: TeamMember): Promise<void> {
    const confirmed = await firstValueFrom(this.dialog.open<
      ConfirmDialogComponent,
      ConfirmDialogData,
      boolean
    >(ConfirmDialogComponent, {
      data: {
        title: 'Delete Member',
        message: 'Are you sure you want to delete this member?',
        context: { member },
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
      fullName: member.fullname,
      email: member.email,
      phone: member.phone,
      role: member.role,
      dob: member.dob,
      country: member.country,
      password: member.password,
      tags: member.tags
    });
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
      fullname: raw.fullName,
      email: raw.email,
      phone: raw.phone,
      role: raw.role,
      dob: DateTime.fromJSDate(raw.dob).toFormat('yyyy-MM-dd'),
      country: raw.country,
      password: raw.password,
      tags: raw.tags,
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

}
