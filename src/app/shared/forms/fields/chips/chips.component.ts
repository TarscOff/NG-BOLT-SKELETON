// fields/chips/chips.component.ts
import { Component, Input } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormControl, ReactiveFormsModule } from '@angular/forms';
import { MatChipsModule } from '@angular/material/chips';
import { TranslateModule, TranslateService } from '@ngx-translate/core';
import { FieldConfig } from '../../field-config.model';

@Component({
  selector: 'app-chips',
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule, MatChipsModule, TranslateModule],
  template: `
    <div class="chips-field">
      <label class="chips-label" [attr.id]="labelId" [attr.for]="'listboxId'">{{ field.label | translate }}</label>

      <mat-chip-listbox
        [id]="'listboxId'"
        [formControl]="control"
        [attr.aria-labelledby]="labelId"
        [attr.aria-invalid]="control.invalid || null"
        [attr.aria-required]="field.required || null"
        (blur)="markTouched()"
      >
        <mat-chip-option *ngFor="let chip of field.chipOptions ?? []" [value]="chip">
          {{ chip }}
        </mat-chip-option>
      </mat-chip-listbox>

      <div class="chips-hint" *ngIf="field.helperText && !showError">
        {{ field.helperText | translate }}
      </div>

      <div class="chips-error" *ngIf="showError" role="alert">
        {{ errorMessage }}
      </div>
    </div>
  `,
  styleUrls: ['./chips.component.scss']
})
export class ChipsComponent {
  @Input({ required: true }) field!: FieldConfig;
  @Input({ required: true }) control!: FormControl<string[]>;

  constructor(private t: TranslateService) {}

  get labelId() { return `${this.field.name}-label`; }
  get showError(): boolean { return !!(this.control?.touched && this.control?.invalid); }

  get errorMessage(): string {
    const errs = this.control?.errors ?? {};
    const first = Object.keys(errs)[0];
    const key = this.field.errorMessages?.[first]
      ?? `form.errors.${this.field.i18nKey || this.field.name}.${first}`;
    return this.t.instant(key);
  }

  markTouched() { this.control?.markAsTouched(); }
}
