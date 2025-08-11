import { Validators, ValidatorFn } from '@angular/forms';
import { FieldConfig } from './field-config.model';

export function buildValidators(field: FieldConfig): ValidatorFn[] {
  const v: ValidatorFn[] = [];
  if (field.required) v.push(Validators.required);
  if (field.minLength) v.push(Validators.minLength(field.minLength));
  if (field.maxLength) v.push(Validators.maxLength(field.maxLength));
  if (field.min !== undefined) v.push(Validators.min(field.min));
  if (field.max !== undefined) v.push(Validators.max(field.max));
  if (field.pattern) v.push(Validators.pattern(field.pattern));
  if (field.validators?.length) v.push(...field.validators);
  return v;
}