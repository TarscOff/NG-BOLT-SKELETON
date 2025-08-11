import { Component, Input } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormControl, ReactiveFormsModule } from '@angular/forms';
import { MatSliderModule } from '@angular/material/slider';
import { TranslateModule } from '@ngx-translate/core';
import { FieldConfig } from '../../field-config.model';
import { MatHint } from '@angular/material/form-field';

@Component({
  selector: 'app-range',
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule, MatSliderModule, TranslateModule,MatHint],
  template: `
    <label [attr.for]="field.name">{{ field.label | translate }}</label>
    <mat-slider
      [min]="field.min ?? 0"
      [max]="field.max ?? 100"
      [step]="field.step ?? 1"
      [attr.id]="field.name"
      [attr.aria-label]="field.label | translate"
      [attr.aria-valuemin]="field.min ?? 0"
      [attr.aria-valuemax]="field.max ?? 100"
      [attr.aria-invalid]="control.invalid || null"
      [attr.aria-required]="field.required || null"
    >
      <input matSliderThumb [formControl]="control" [attr.id]="field.name" />
    </mat-slider>
    <mat-hint *ngIf="field.helperText" [id]="field.name + '-hint'">{{ field.helperText | translate }}</mat-hint>
  `
})
export class RangeComponent {
  @Input({ required: true }) field!: FieldConfig;
  @Input({ required: true }) control!: FormControl;
}
