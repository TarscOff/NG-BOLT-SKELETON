// fields/toggle/toggle.component.ts
import { Component, Input } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormControl, ReactiveFormsModule } from '@angular/forms';
import { MatSlideToggleModule } from '@angular/material/slide-toggle';
import { TranslateModule, TranslateService } from '@ngx-translate/core';
import { FieldConfig } from '../../field-config.model';

@Component({
  selector: 'app-toggle',
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule, MatSlideToggleModule, TranslateModule],
  template: `
    <div class="toggle-field">
      <mat-slide-toggle
        [formControl]="control"
        [attr.aria-label]="field.label | translate"
        [attr.aria-checked]="control.value || null"
        [attr.aria-invalid]="control.invalid || null"
        [attr.aria-required]="field.required || null"
        [attr.aria-describedby]="ariaDescribedBy"
        (blur)="markTouched()"
      >
        {{ field.label | translate }}
      </mat-slide-toggle>

      <!-- Helper text (when no error) -->
      <div *ngIf="field.helperText && !showError" class="toggle-hint" [id]="hintId">
        {{ field.helperText | translate }}
      </div>

      <!-- Error message -->
      <div *ngIf="showError" class="toggle-error" [id]="errorId" role="alert" aria-live="polite">
        {{ errorMessage }}
      </div>
    </div>
  `,
  styleUrls:["./toggle.component.scss"]
})
export class ToggleComponent {
  @Input({ required: true }) field!: FieldConfig;
  @Input({ required: true }) control!: FormControl<boolean>;

  constructor(private t: TranslateService) {}

  get showError(): boolean {
    return !!(this.control?.touched && this.control?.invalid);
  }

  get hintId(): string { return `${this.field.name}-hint`; }
  get errorId(): string { return `${this.field.name}-error`; }

  get ariaDescribedBy(): string | null {
    if (this.showError) return this.errorId;
    if (this.field.helperText) return this.hintId;
    return null;
    }

  get errorMessage(): string {
    const errs = this.control?.errors ?? {};
    const first = Object.keys(errs)[0];
    const key = this.field.errorMessages?.[first]
      ?? `form.errors.${this.field.i18nKey || this.field.name}.${first}`;
    return this.t.instant(key);
  }

  markTouched() { this.control?.markAsTouched(); }
}
