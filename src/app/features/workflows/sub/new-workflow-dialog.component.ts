import { Component, Inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormBuilder, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { MAT_DIALOG_DATA, MatDialogModule, MatDialogRef } from '@angular/material/dialog';
import { MatButtonModule } from '@angular/material/button';
import { TranslateModule } from '@ngx-translate/core';
import { DynamicFormComponent } from '@cadai/pxs-ng-core/shared';
import { FieldConfigService, ToastService } from '@cadai/pxs-ng-core/services';
import { FieldConfig } from '@cadai/pxs-ng-core/interfaces';

export interface NewWorkflowDialogData {
  name?: string;
  description?: string;
  visibility?: 'public' | 'draft';
  kind?: 'standard' | 'reusable';
  isEdit?: boolean;
  workflowId?: string;
  hasValidationErrors?: boolean;
}

@Component({
  selector: 'app-new-workflow-dialog',
  standalone: true,
  imports: [
    CommonModule,
    ReactiveFormsModule,
    MatDialogModule,
    MatButtonModule,
    TranslateModule,
    DynamicFormComponent,
  ],
  template: `
    <h2 mat-dialog-title>{{ (data.isEdit ? 'workflow.edit_dialog.title' : 'workflow.new_dialog.title') | translate }}</h2>
    <form [formGroup]="form" (ngSubmit)="submit()" mat-dialog-content class="dialog-body">
      <app-dynamic-form [form]="form" [config]="config"></app-dynamic-form>
    </form>

    <div mat-dialog-actions align="end">
      <button mat-button mat-dialog-close>{{ 'workflow.new_dialog.cancel' | translate }}</button>
      <button mat-flat-button color="primary" [disabled]="form.invalid" (click)="submit()">
        {{ (data.isEdit ? 'workflow.edit_dialog.update' : 'workflow.new_dialog.create') | translate }}
      </button>
    </div>
  `,
  styles: [`
    .dialog-body { display: flex; flex-direction: column; gap: 12px; min-width: 420px; padding: 18px !important; }
  `]
})
export class NewWorkflowDialogComponent {
  config!: FieldConfig[];
  form!: FormGroup;

  constructor(
    private fb: FormBuilder,
    private dialogRef: MatDialogRef<NewWorkflowDialogComponent>,
    private fields: FieldConfigService,
    private toast: ToastService,
    @Inject(MAT_DIALOG_DATA) public data: NewWorkflowDialogData,
  ) {
    this.config = [
      this.fields.getTextField({
        name: 'name',
        label: 'workflow.new_dialog.name.label',
        placeholder: 'workflow.new_dialog.name.placeholder',
        required: true,
        validators: [Validators.required, Validators.minLength(2), Validators.maxLength(80)],
        errorMessages: {
          required: 'workflow.new_dialog.name.required',
          minlength: 'form.errors.input.minlength',
          maxlength: 'form.errors.input.maxlength',
        },
        color: 'primary',
        layoutClass: 'primary',
        helperText: 'workflow.new_dialog.name.helper',
      }),
      this.fields.getTextAreaField({
        name: 'description',
        label: 'workflow.new_dialog.description.label',
        placeholder: 'workflow.new_dialog.description.placeholder',
        rows: 3,
        maxRows: 6,
        autoResize: true,
        maxLength: 500,
        showCounter: true,
        validators: [Validators.maxLength(500)],
        errorMessages: {
          maxlength: 'form.errors.input.maxlength',
        },
        color: 'primary',
        layoutClass: 'primary',
        helperText: 'workflow.new_dialog.description.helper',
      }),
      this.fields.getToggleField({
        name: 'visibility',
        label: 'workflow.new_dialog.visibility.label',
        helperText: 'workflow.new_dialog.visibility.helper',
        defaultValue: this.data.visibility === 'public',
        disabled: this.data.isEdit && this.data.hasValidationErrors,
        color: 'primary',
        layoutClass: 'primary',
        toggleIcons: {
          on: 'public',
          off: 'lock',
          position: 'start',
        },
        errorMessages: {
          cannotPublish: 'workflow.new_dialog.visibility.cannot_publish_error',
        },
      }),
      this.fields.getToggleField({
        name: 'kind',
        label: 'workflow.new_dialog.kind.label',
        helperText: 'workflow.new_dialog.kind.helper',
        defaultValue: this.data.kind === 'reusable',
        color: 'primary',
        layoutClass: 'primary',
        toggleIcons: {
          on: 'layers',
          off: 'description',
          position: 'start',
        },
      }),
    ];

    this.form = this.fb.group({
      name: [this.data.name ?? '', [Validators.required, Validators.minLength(2), Validators.maxLength(80)]],
      description: [this.data.description ?? '', [Validators.maxLength(500)]],
      visibility: [this.data.visibility === 'public', []],
      kind: [this.data.kind === 'reusable', []],
    });

    // Set validation error if workflow has validation errors
    if (this.data.isEdit && this.data.hasValidationErrors) {
      this.form.get('visibility')?.setErrors({ cannotPublish: true });
      this.form.get('visibility')?.markAsTouched();
    }
  }

  submit(): void {
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      return;
    }
    
    const formValue = this.form.value;
    const visibility = formValue.visibility ? 'public' : 'draft';
    
    // Prevent setting visibility to public when there are validation errors
    if (this.data.isEdit && visibility === 'public' && this.data.hasValidationErrors) {
      // Mark the visibility field as invalid
      this.form.get('visibility')?.setErrors({ cannotPublish: true });
      this.form.get('visibility')?.markAsTouched();
      this.toast.showError('Cannot publish workflow with validation errors.');
      return;
    }
    
    const result: NewWorkflowDialogData = {
      name: formValue.name,
      description: formValue.description,
      visibility,
      kind: formValue.kind ? 'reusable' : 'standard',
    };
    
    this.dialogRef.close(result);
  }
}
