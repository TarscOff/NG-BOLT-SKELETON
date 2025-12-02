
# Dynamic Forms & Field Components Guide

>_Last updated: 2025-10-30_

This guide explains how to **instantiate forms** and **reuse custom field components** from `shared/forms/fields`. It covers the `DynamicFormComponent`, the `FieldHostComponent`, and the `FieldConfigService` helpers your teammates use every day. It reflects the latest updates:
- Angular 17+ **built‑in control flow** (`@if`, `@for`) instead of structural directives.
- File field (`InputFileComponent`) supports **variants** via `fileVariant`: `input`, `dropzone`, `both`.
- Robust file UX: drag‑and‑drop, single‑click remove (stable keys), proper required `*`, consistent error surfacing, i18n for dropzone text.
- Accessibility & ARIA fixes (`[attr.aria-*]` usage).

---

## TL;DR — Quick Start

### 1) Feature component (build the config + form)

```ts
// my-feature.component.ts
import { Component, inject } from '@angular/core';
import { FormBuilder, FormGroup, Validators } from '@angular/forms';
import { FieldConfigService } from '@/app/shared/shared'; // your barrel export

@Component({ /* ... */ })
export class MyFeatureComponent {
  private fb = inject(FormBuilder);
  private fields = inject(FieldConfigService);

  form: FormGroup = this.fb.group({});
  fieldConfig = [
    this.fields.getTextField({
      name: 'fullName',
      label: 'form.labels.fullname',
      placeholder: 'form.placeholders.fullname',
      layoutClass: 'primary',
      validators: [Validators.required, Validators.minLength(2), Validators.maxLength(80)],
      errorMessages: { required: 'form.errors.fullname.required' },
    }),

    this.fields.getEmailField({
      name: 'email',
      label: 'form.labels.email',
      placeholder: 'form.placeholders.email',
      layoutClass: 'primary',
    }),

    this.fields.getPasswordField({
      name: 'password',
      label: 'form.labels.password',
      placeholder: 'form.placeholders.password',
      layoutClass: 'primary',
      validators: [
        Validators.required,
        Validators.maxLength(128),
        passwordStrengthValidator({ minLength: 8, minUpper: 1, minDigits: 1, minSpecial: 1 }),
      ],
      errorMessages: { special: 'form.errors.password.special' },
    }),

    this.fields.getToggleField({
      name: 'notify',
      label: 'form.labels.notify',
      helperText: 'form.hints.notify',
      layoutClass: 'primary',
    }),

    this.fields.getDropdownField({
      name: 'role',
      label: 'form.labels.role',
      placeholder: 'form.placeholders.role',
      options: [
        { label: 'Admin', value: 'admin' },
        { label: 'User', value: 'user' },
        { label: 'Manager', value: 'manager' },
      ],
      multiple: false,
      layoutClass: 'primary',
    }),

    // --- File field examples ---
    // 1) Classic input (browse button in mat-form-field)
    this.fields.getFileField({
      name: 'files',
      label: 'form.labels.files',
      fileVariant: 'input',     // default; can omit
      multiple: true,
      accept: '.pdf,.docx,image/*',
      maxFiles: 10,
      maxTotalSize: 50 * 1024 * 1024, // 50 MB total
      maxFileSize: 10 * 1024 * 1024,  // 10 MB per file
      required: true,
      validators: [Validators.required],
      errorMessages: {
        required: 'form.errors.file.required',
        accept: 'form.errors.file.accept',
        maxFiles: 'form.errors.file.maxFiles',
        maxFileSize: 'form.errors.file.maxFileSize',
        maxTotalSize: 'form.errors.file.maxTotalSize',
      },
    }),

    // 2) Pure dropzone
    this.fields.getFileField({
      name: 'evidence',
      label: 'Upload documents',
      fileVariant: 'dropzone',
      multiple: true,
      accept: '.pdf,.docx',
    }),

    // 3) Both: dropzone + browse button
    this.fields.getFileField({
      name: 'supporting',
      label: 'Supporting evidence',
      fileVariant: 'both',
      multiple: true,
      maxFiles: 5,
    }),
  ];
}
```

### 2) Render the dynamic form

- **Option A (recommended)**: self‑contained `<app-dynamic-form>`

```html
<!-- my-feature.component.html -->
<app-dynamic-form [form]="form" [config]="fieldConfig"></app-dynamic-form>
```

- **Option B (custom layout)**: use `FieldHostComponent` directly

```html
<form [formGroup]="form" class="grid gap-2">
  @for (field of fieldConfig; track field.name) {
    @if (!field.hidden) {
      @if (form.get(field.name) as ctl) {
        <app-field-host [field]="field" [control]="ctl"></app-field-host>
      } @else {
        <div style="min-height: 48px"></div>
      }
    }
  } @empty {
    <p class="text-sm opacity-60">No fields configured.</p>
  }
</form>
```

### 3) Submit

```ts
submit() {
  this.form.markAllAsTouched();
  if (this.form.valid) console.log('payload', this.form.value);
}
```

---

## Architecture Overview

- **`FieldConfigService`** → factories for typed `FieldConfig` (text, email, password, phone, toggle, dropdown, range, datepicker, chips, autocomplete, textarea, **file**).
- **`DynamicFormComponent`** → takes `[form]` + `[config]`, creates controls, renders each via `FieldHostComponent`.
- **`FieldHostComponent`** → maps `FieldConfig.type` → concrete component (TextInput, Datepicker, Chips, **InputFile**, …).

```
MyFeature → (FormGroup + FieldConfig[]) → DynamicForm → FieldHost → Concrete Field Component
```

---

## FieldConfig – Reference

```ts
export type FileVariant = 'input' | 'dropzone' | 'both';

export interface FieldConfig {
  type: FieldType;
  name: string;
  label?: string;
  placeholder?: string;
  required?: boolean;
  helperText?: string;
  options?: { label: string; value: string | number }[];
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
  multiple?: boolean;
  errorMessages?: Record<string, string>;
  layoutClass?: 'primary' | 'accent' | 'warn' | 'neutral' | 'success' | string;
  defaultValue?: string | number | boolean | File | File[] | string[];
  chipOptions?: string[];
  autocompleteOptions?: string[];
  toggleIcons?: { on: string; off: string; position?: 'start' | 'end' };
  color?: ThemePalette;
  rows?: number;
  maxRows?: number;
  autoResize?: boolean;
  showCounter?: boolean;

  // File‑specific
  accept?: string;
  maxFiles?: number;
  maxFileSize?: number;
  maxTotalSize?: number;
  fileVariant?: FileVariant; // NEW: 'input' | 'dropzone' | 'both' (default: 'input')
}
```

### Factory default (excerpt)
```ts
getFileField(overrides: Partial<FieldConfig> = {}): FieldConfig {
  const required = overrides.required ?? true;
  const fileVariant = overrides.fileVariant ?? 'input';

  const defaults: FieldConfig = {
    type: 'file',
    name: 'file',
    label: 'form.labels.file',
    placeholder: 'form.placeholders.file',
    required,
    helperText: 'form.hints.file',
    accept: overrides.accept,
    multiple: !!overrides.multiple,
    maxFiles: overrides.maxFiles,
    maxFileSize: overrides.maxFileSize,
    maxTotalSize: overrides.maxTotalSize,
    fileVariant,
    validators: [
      ...(required ? [Validators.required] : []),
      fileAcceptValidator(overrides.accept),
      maxFilesValidator(!!overrides.multiple ? overrides.maxFiles : 1),
      maxFileSizeValidator(overrides.maxFileSize),
      maxTotalSizeValidator(overrides.maxTotalSize),
    ],
    errorMessages: {
      required: 'form.errors.file.required',
      accept: 'form.errors.file.accept',
      maxFiles: 'form.errors.file.maxFiles',
      maxFileSize: 'form.errors.file.maxFileSize',
      maxTotalSize: 'form.errors.file.maxTotalSize',
      ...(overrides.errorMessages ?? {}),
    },
    layoutClass: 'primary',
    children: [],
    chipOptions: [],
    autocompleteOptions: [],
  };

  return mergeField(defaults, { ...overrides, type: 'file' });
}
```

---

# 📁 File Field (`type: 'file'`) — Updated Behavior

### Value shape
- **Single**: `File | null` (or a `string` if you purposefully bind a persisted path)
- **Multiple**: `File[] | string[]` (no mixed arrays for strong typing)

### Required & error state
- The visible `<input matInput>` is **readonly** and bound to the same control for error state:
  - Shows the `*` via `[required]="field.required"`
  - Red underline + `<mat-error>` when `touched && invalid`
- A tiny `hasFilesValidator` enforces the required rule (`len === 0 → { required: true }`).

### Deletion (single click)
- Rows are rendered with **stable keys** (`name:size:lastModified`) and removed via `removeByKey`, eliminating “double‑click to delete”.

### Drag & Drop
- Available when `fileVariant` is `dropzone` or `both`.
- Uses standard drag events (`dragover`, `dragenter`, `dragleave`, `drop`) to collect `FileList` and delegates to the same merge/validate pipeline as the native picker.

### i18n (dropzone text)
Add to your locales:
```jsonc
"form": {
  "actions": {
    "dropHere": "Drop files here",
    "dropFilesHere": "Drop files here (or click to browse)",
    "or": "or",
    "browse": "Browse"
  },
  "hints": {
    "dropAccepted": "Accepted: {{types}}"
  },
  "files": { "count": "{{count}} files" },
  "errors": {
    "file": {
      "accept": "Allowed types: {{requiredTypes}}.",
      "required": "A file is required.",
      "maxFiles": "Max {{requiredLength}} file(s) (you selected {{actualLength}}).",
      "maxFileSize": "Each file must be ≤ {{requiredLength}}.",
      "maxTotalSize": "Total size must be ≤ {{requiredLength}}."
    }
  }
}
```

### Template notes
- Use built‑in control flow: `@if (...) {}` and `@for (...; track f.key) {}`
- ARIA attributes must be set via `[attr.aria-*]`, e.g. `[attr.aria-label]="'form.actions.dropHere' | translate"`
- Translate placeholder with correct precedence: `[placeholder]="(field.placeholder || '') | translate"`

---

## Accessibility

- `aria-invalid` mirrors control validity: `[attr.aria-invalid]="fc.invalid ? 'true' : null"`
- `aria-describedby` points to `mat-hint` when no error, or `mat-error` when invalid.
- Dropzone has `role="button"` and keyboard activation (`Enter`/`Space`) to open the picker.

---

## Testing Checklist (updated)

- Selecting > `maxTotalSize` ⇒ `form.errors.file.maxTotalSize`, invalid.
- Any file > `maxFileSize` ⇒ `form.errors.file.maxFileSize`.
- Adding > `maxFiles` (counting remaining items) ⇒ `form.errors.file.maxFiles`.
- Disallowed types are **rejected** and `accept` error is set.
- Touch + cancel ⇒ `required` error is visible (red underline + `<mat-error>`).
- Remove one item ⇒ list updates immediately; control remains touched/dirty.
- Same file can be selected twice (native input value reset after change).

---

## Where Things Live

| Path                                             | Purpose                                |
| ------------------------------------------------ | -------------------------------------- |
| `shared/forms/field-config.model.ts`             | `FieldConfig` type (+ `fileVariant`)   |
| `shared/forms/dynamic-form.component.*`          | Builds the form & renders field host   |
| `shared/forms/field-host/field-host.component.*` | Maps `type` → concrete field component |
| `shared/forms/fields/*`                          | Concrete field components              |
| `core/services/field-config.service.ts`          | Field builder helpers                  |
| `shared/shared` (barrel)                         | Re-exports common symbols              |

---

## Changelog (since 2025‑10‑02)

- **Added** `fileVariant` (`input` | `dropzone` | `both`) to `FieldConfig` and factory default.
- **Implemented** drag‑and‑drop handlers and styles for dropzone variant.
- **Fixed** required `*` visibility and error styling on touch/cancel.
- **Stabilized** delete behavior with `removeByKey` and `@for(...; track f.key)`.
- **Updated** templates to Angular built‑in control flow (`@if`, `@for`).
- **Added** i18n keys for dropzone text (`dropHere`, `dropFilesHere`, `or`, `browse`).

---

Happy building! 🎯


## 🧑‍💻 Author

**Angular Product Skeleton**  
Built by **Tarik Haddadi** using Angular 19+ and modern best practices (2025).
