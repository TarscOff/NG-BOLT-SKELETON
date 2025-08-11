
import { ValidatorFn } from '@angular/forms';

export type FieldType = 'text' | 'email' | 'phone' | 'password' | 'toggle' | 'dropdown' | 'range' | 'group' | 'array' | 'datepicker' | 'chips' | 'autocomplete';

export interface FieldConfig {
  type: FieldType;
  name: string;
  label?: string;
  placeholder?: string;
  required?: boolean;
  helperText?: string;
  options?: { label: string; value: string |number }[];
  min?: number;
  max?: number;
  step?: number;
  minLength?: number;
  maxLength?: number;
  pattern?: string;
  validators?: ValidatorFn[];
  disabled?: boolean;
  hidden?: boolean;
  children?: FieldConfig[];
  errorMessages?:  Record<string, string>;
  layoutClass?: string;
  i18nKey?: string;
  chipOptions?: string[];
  autocompleteOptions?: string[];
}