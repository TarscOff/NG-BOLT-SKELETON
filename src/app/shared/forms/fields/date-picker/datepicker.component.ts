import { Component, Input } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormControl, ReactiveFormsModule } from '@angular/forms';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatDatepickerModule } from '@angular/material/datepicker';
import { MatNativeDateModule } from '@angular/material/core';
import { TranslateModule, TranslateService } from '@ngx-translate/core';
import { FieldConfig } from '../../field-config.model';

@Component({
  selector: 'app-date-picker',
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule, MatFormFieldModule, MatInputModule, MatDatepickerModule, MatNativeDateModule, TranslateModule],
  template: `
    <mat-form-field appearance="outline" class="w-full" floatLabel="always">
      <mat-label>{{ field.label | translate }}</mat-label>
      <input
        matInput
        [matDatepicker]="picker"
        [id]="field.name"
        [formControl]="control"
        [placeholder]="(field.placeholder ?? '') | translate"
        [attr.aria-label]="field.label | translate"
        [attr.aria-describedby]="hintId"
        [attr.aria-invalid]="control.invalid || null"
        [attr.aria-required]="field.required || null"
      />
      <mat-datepicker-toggle matSuffix [for]="picker"></mat-datepicker-toggle>
      <mat-datepicker #picker></mat-datepicker>

      <mat-hint *ngIf="field.helperText" [id]="hintId">{{ field.helperText | translate }}</mat-hint>
      <mat-error *ngIf="control.touched && control.invalid" role="alert">
        {{ firstErrorMessage() }}
      </mat-error>
    </mat-form-field>
  `
})
export class DatePickerComponent {
  @Input({ required: true }) field!: FieldConfig;
  @Input({ required: true }) control!: FormControl;
  constructor(private t: TranslateService) {}
  get hintId() { return `${this.field.name}-hint`; }
  firstErrorMessage(): string {
    const errors = this.control.errors ?? {};
    const firstKey = Object.keys(errors)[0];
    return this.t.instant(this.field.errorMessages?.[firstKey]
      ?? `form.errors.${this.field.i18nKey || this.field.name}.${firstKey}`);
  }
}
