// src/app/shared/forms/fields/text-field/text-field.component.ts
import { Component, Input } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormControl, ReactiveFormsModule } from '@angular/forms';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { FieldConfig } from '../../field-config.model';

@Component({
  standalone: true,
  selector: 'app-text-field',
  imports: [CommonModule, ReactiveFormsModule, MatFormFieldModule, MatInputModule],
  template: `
    <mat-form-field appearance="outline" class="w-full" floatLabel="always">
      <mat-label>{{ field.label }}</mat-label>
      <input
        matInput
        [type]="field.type === 'password' ? 'password' : field.type === 'email' ? 'email' : 'text'"
        [placeholder]="field.placeholder"
        [formControl]="control"
        [attr.aria-describedby]="helperId"
      />
      <mat-hint *ngIf="field.helperText" [id]="helperId">{{ field.helperText }}</mat-hint>
      <mat-error *ngIf="control.touched && control.invalid">
        {{ firstErrorMessage() }}
      </mat-error>
    </mat-form-field>
  `,
})
export class TextFieldComponent {
  @Input({ required: true }) field!: FieldConfig;
  @Input({ required: true }) control!: FormControl;

  get helperId() { return `${this.field.name}-hint`; }

  firstErrorMessage(): string {
    if (!this.field.errorMessages) return 'Invalid value';
    const errors = this.control.errors ?? {};
    const firstKey = Object.keys(errors)[0];
    return this.field.errorMessages[firstKey] ?? 'Invalid value';
  }
}
