# Dynamic Forms & Field Components Guide

_Last updated: 2025-10-02_

This document explains how to **instantiate forms** and **reuse custom field components** under `shared/forms/fields`. It covers the `DynamicFormComponent`, the `FieldHostComponent`, and the `FieldConfigService` helpers your teammates will use every day.

## TL;DR – Quick Start

### 1) Create a form and field config in your feature component

```ts
// my-feature.component.ts
import { Component, inject } from '@angular/core';
import { FormBuilder, FormGroup, Validators } from '@angular/forms';
import { FieldConfigService } from '@/app/shared/shared'; // re-export path in your project

@Component({
  /* ... */
})
export class MyFeatureComponent {
  private fb = inject(FormBuilder);
  private fieldsConfigService = inject(FieldConfigService);

  form: FormGroup = this.fb.group({});
  fieldConfig = [
    this.fieldsConfigService.getTextField({
      name: 'fullName',
      label: 'form.labels.fullname',
      placeholder: 'form.placeholders.fullname',
      layoutClass: 'primary',
      validators: [Validators.required, Validators.minLength(2), Validators.maxLength(80)],
      errorMessages: { required: 'form.errors.fullname.required' },
    }),

    this.fieldsConfigService.getEmailField({
      name: 'email',
      label: 'form.labels.email',
      placeholder: 'form.placeholders.email',
      layoutClass: 'primary',
    }),

    this.fieldsConfigService.getPasswordField({
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

    this.fieldsConfigService.getPhoneField({
      name: 'phone',
      label: 'form.labels.phone',
      placeholder: '+352 12345678',
      layoutClass: 'primary',
      defaultValue: '+352',
    }),

    this.fieldsConfigService.getToggleField({
      name: 'notify',
      label: 'form.labels.notify',
      helperText: 'form.hints.notify',
      layoutClass: 'primary',
      required: false,
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
      layoutClass: 'primary',
    }),

    this.fieldsConfigService.getDatepickerField({
      name: 'dob',
      label: 'form.labels.dob',
      placeholder: 'YYYY-MM-DD',
      layoutClass: 'primary',
    }),

    this.fieldsConfigService.getChipsField({
      name: 'tags',
      label: 'form.labels.tags',
      chipOptions: ['Angular', 'React', 'Vue', 'Node.js'],
      multiple: true,
      layoutClass: 'primary',
    }),

    this.fieldsConfigService.getAutocompleteField({
      name: 'country',
      label: 'form.labels.country',
      autocompleteOptions: ['Luxembourg', 'Germany', 'France', 'Belgium', 'Netherlands'],
      placeholder: 'form.placeholders.country',
      layoutClass: 'primary',
    }),

    this.fieldsConfigService.getRangeField({
      name: 'price',
      label: 'form.labels.price',
      min: 0,
      max: 200,
      step: 5,
      defaultValue: 20,
      layoutClass: 'primary',
    }),

    this.fieldsConfigService.getTextAreaField({
      name: 'input',
      label: 'form.labels.input',
      placeholder: 'form.placeholders.input',
      showCounter: true,
      maxLength: 500,
      layoutClass: 'primary',
    }),

    // --- File field example ---
    this.fieldsConfigService.getFileField({
      name: 'files',
      label: 'form.labels.files',
      multiple: true,
      accept: '.pdf,.docx,image/*',
      maxFiles: 10,
      maxTotalSize: 50 * 1024 * 1024, // 50 MB total
      maxFileSize: 10 * 1024 * 1024, // 10 MB per file
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

    // -------- Other variants
    this.fields.getFileField({
      name: 'files',
      label: 'form.labels.files',
      fileVariant: 'input',   // default; can omit
      multiple: true,
      accept: '.pdf,.docx,image/*',
      required: true,
      validators: [Validators.required],
    });

    // Pure dropzone
    this.fields.getFileField({
      name: 'files',
      label: 'Upload documents',
      fileVariant: 'dropzone',
      multiple: true,
      accept: '.pdf,.docx',
    });

    // Both (dropzone + browse button in form-field)
    this.fields.getFileField({
      name: 'files',
      label: 'Supporting evidence',
      fileVariant: 'both',
      multiple: true,
      maxFiles: 5,
    });
  ];
}
```

### 2) Render the dynamic form

- **Option A (recommended):** Use the self-contained `DynamicFormComponent` (it renders the `<form>` for you).

```html
<!-- my-feature.component.html -->
<app-dynamic-form [form]="form" [config]="fieldConfig"></app-dynamic-form>
```

- **Option B (custom layout):** Use `FieldHostComponent` yourself and place fields anywhere in your grid/layout.

```html
<form [formGroup]="form" class="grid gap-2">
  @for (field of fieldConfig; track field.name) { @if (!field.hidden) { @if (form.get(field.name);
  as ctl) {
  <app-field-host [field]="field" [control]="ctl"></app-field-host>
  } @else {
  <div style="min-height: 48px"></div>
  } } } @empty {
  <p class="text-sm opacity-60">No fields configured.</p>
  }
</form>
```

### 3) Handle submit/validation

```ts
submit() {
  this.form.markAllAsTouched();
  if (this.form.valid) {
    console.log('payload', this.form.value);
  }
}
```

---

## Architecture Overview

- **`FieldConfigService`** → factory methods that return typed `FieldConfig` objects (text, email, password, phone, toggle, dropdown, range, datepicker, chips, autocomplete, textarea, **file**).
- **`DynamicFormComponent`** → takes `[form]` + `[config]`, creates controls, and renders each field via `FieldHostComponent`.
- **`FieldHostComponent`** → maps each `FieldConfig.type` to a concrete field UI component (TextInput, Datepicker, Chips, **InputFile**, etc.).

```
MyFeature → (FormGroup + FieldConfig[]) → DynamicForm → FieldHost → Concrete Field Component
```

## FieldConfig – What devs need to know

**Required basics**

- `type`: one of
  - `text`, `email`, `phone`, `password`, `textarea`
  - `datepicker`
  - `chips`, `autocomplete`
  - `toggle`
  - `dropdown`
  - `range`
  - `file`
  - `group` (nested) / `array` (list)
- `name`: unique control key in the parent form
- `label`: i18n key or plain label
- `placeholder`: i18n key or plain text

**Common options**

- `required`, `minLength`, `maxLength`, `pattern`, `validators`
- `errorMessages`: map of error keys → i18n keys (see example list below)
- `layoutClass`: CSS/grid class (`'primary'`, `'accent'`,`'warn'`,`'neutral'`,`'success'`, …)
- `defaultValue`: initial value (when applicable)
- `hidden`, `disabled`: UI/interaction flags
- `multiple`: for `dropdown` / `chips`
- `options`: for `dropdown` (`{label, value}`) and helpers like `autocompleteOptions`

**UI mapping (FieldHost)**

- `textarea` → `TextFieldComponent`
- `text|email|phone|password` → `TextInputComponent`
- `datepicker` → `DatepickerComponent`
- `chips` → `ChipsComponent`
- `autocomplete` → `AutocompleteComponent`
- `toggle` → `ToggleComponent`
- `dropdown` → `SelectComponent`
- `range` → `RangeComponent`
- `file` → `InputFileComponent`

---

# 📁 File Field (`type: 'file'`) — Complete Guide

The file field is rendered by `InputFileComponent`. It supports **single** and **multiple** file selection, client‑side limits, i18n, ARIA, and safe error handling. It offers **three UI variants** for different use cases.

## Value shape

- **Single**: `File | string | null`
- **Multiple**: `(File | string)[]`
  - Strings can represent previously uploaded file URLs/ids.
  - The component UI renders both `File` and `string` entries.

> Internally, helper methods like `currentFiles()` only consider `File` instances for size/count checks.


## FieldConfig options (SDK)

```ts
type FileFieldConfig = FieldConfig & {
  accept?: string; // MIME list or extensions, e.g. ".pdf,.docx,image/*"
  multiple?: boolean; // default: false
  maxFiles?: number; // max allowed items (only counts File objects)
  maxFileSize?: number; // per-file bytes limit
  maxTotalSize?: number; // total bytes limit (sum of File sizes)
  required?: boolean; // standard required semantics
  validators?: ValidatorFn[]; // e.g., [Validators.required]
  fileVariant?: 'input' | 'dropzone' | 'both'; // UI variant (default: 'input')
  errorMessages?: Partial<
    Record<'required' | 'accept' | 'maxFiles' | 'maxFileSize' | 'maxTotalSize', string>
  >;
};
```

### Complete `FieldConfig` Interface Reference

All field types extend from the base `FieldConfig` interface. Below is the complete list of available properties:

#### Core Properties (All Field Types)

| Property | Type | Description |
|----------|------|-------------|
| `type` | `FieldType` | **Required**. Field type: `'text'`, `'email'`, `'password'`, `'phone'`, `'textarea'`, `'datepicker'`, `'chips'`, `'autocomplete'`, `'toggle'`, `'dropdown'`, `'range'`, `'file'` |
| `name` | `string` | **Required**. Unique control key in the FormGroup |
| `label` | `string` | Field label (i18n key or plain text) |
| `placeholder` | `string` | Placeholder text (i18n key or plain text) |
| `required` | `boolean` | Marks field as required (adds asterisk, used with `Validators.required`) |
| `disabled` | `boolean` | Disables the field (non-interactive) |
| `hidden` | `boolean` | Hides the field from the UI |
| `helperText` | `string` | Helper/hint text displayed below field (i18n key) |
| `validators` | `ValidatorFn[]` | Array of Angular validators |
| `errorMessages` | `Record<string, string>` | Map of error keys to i18n keys for custom error messages |
| `layoutClass` | `'primary' \| 'accent' \| 'warn' \| 'neutral' \| 'success' \| string` | CSS/theme class for styling |
| `color` | `ThemePalette` | Material theme color (`'primary'`, `'accent'`, `'warn'`) |
| `defaultValue` | `string \| number \| boolean \| File \| File[] \| string[]` | Initial value for the field |

#### Text & Input Fields (`text`, `email`, `password`, `phone`)

| Property | Type | Description |
|----------|------|-------------|
| `minLength` | `number` | Minimum character length (use with `Validators.minLength()`) |
| `maxLength` | `number` | Maximum character length (use with `Validators.maxLength()`) |
| `pattern` | `string` | Regex pattern for validation (use with `Validators.pattern()`) |

#### Textarea Fields (`textarea`)

| Property | Type | Description |
|----------|------|-------------|
| `rows` | `number` | Initial number of rows (default: `3`) |
| `maxRows` | `number` | Maximum rows when auto-resizing (default: `8` if `autoResize` is true) |
| `autoResize` | `boolean` | Enable CDK auto-resize based on content (default: `false`) |
| `isResizable` | `boolean` | Enable manual resize with drag handle. Disables `autoResize` when `true` (default: `false`) |
| `showCounter` | `boolean` | Display character counter (requires `maxLength`) |
| `minLength` | `number` | Minimum character length |
| `maxLength` | `number` | Maximum character length |

#### Dropdown/Select Fields (`dropdown`)

| Property | Type | Description |
|----------|------|-------------|
| `options` | `{ label: string; value: string \| number }[]` | Array of options for dropdown |
| `multiple` | `boolean` | Enable multi-select (default: `false`) |

#### Chips Fields (`chips`)

| Property | Type | Description |
|----------|------|-------------|
| `chipOptions` | `string[]` | Array of available chip values |
| `multiple` | `boolean` | Enable multi-selection (default: `true`) |

#### Autocomplete Fields (`autocomplete`)

| Property | Type | Description |
|----------|------|-------------|
| `autocompleteOptions` | `string[]` | Array of autocomplete suggestions |
| `multiple` | `boolean` | Enable multi-selection (default: `false`) |

#### Toggle/Switch Fields (`toggle`)

| Property | Type | Description |
|----------|------|-------------|
| `toggleIcons` | `{ on: string; off: string; position?: 'start' \| 'end' }` | Custom icons for toggle states |

#### Range/Slider Fields (`range`)

| Property | Type | Description |
|----------|------|-------------|
| `min` | `number` | Minimum slider value |
| `max` | `number` | Maximum slider value |
| `step` | `number` | Step increment for slider |

#### File Upload Fields (`file`)

| Property | Type | Description |
|----------|------|-------------|
| `accept` | `string` | Accepted file types (MIME types or extensions: `".pdf,.docx,image/*"`) |
| `multiple` | `boolean` | Enable multi-file selection (default: `false`) |
| `maxFiles` | `number` | Maximum number of files allowed (counts only `File` objects) |
| `maxFileSize` | `number` | Maximum size per file in bytes |
| `maxTotalSize` | `number` | Maximum total size of all files in bytes |
| `fileVariant` | `'input' \| 'dropzone' \| 'both'` | UI variant: `'input'` (browse button), `'dropzone'` (drag & drop area), `'both'` (combined) |

#### Nested Fields (`group`, `array`)

| Property | Type | Description |
|----------|------|-------------|
| `children` | `FieldConfig[]` | Child field configurations for nested groups |

### Property Usage Examples

#### Text Field with Character Limits
```ts
{
  type: 'text',
  name: 'username',
  label: 'form.labels.username',
  minLength: 3,
  maxLength: 20,
  showCounter: true,
  validators: [Validators.required, Validators.minLength(3), Validators.maxLength(20)]
}
```

#### Resizable Textarea
```ts
{
  type: 'textarea',
  name: 'description',
  label: 'form.labels.description',
  isResizable: true,  // Enables manual resize handle
  rows: 4,            // Initial height
  maxLength: 500,
  showCounter: true
}
```

#### Auto-Resizing Textarea
```ts
{
  type: 'textarea',
  name: 'comments',
  label: 'form.labels.comments',
  autoResize: true,   // Auto-expands with content
  rows: 3,            // Min rows
  maxRows: 10         // Max rows before scrolling
}
```

#### Multi-Select Dropdown
```ts
{
  type: 'dropdown',
  name: 'roles',
  label: 'form.labels.roles',
  multiple: true,
  options: [
    { label: 'Admin', value: 'admin' },
    { label: 'User', value: 'user' },
    { label: 'Manager', value: 'manager' }
  ]
}
```

#### File Upload with Dropzone
```ts
{
  type: 'file',
  name: 'documents',
  label: 'form.labels.documents',
  fileVariant: 'dropzone',
  multiple: true,
  accept: '.pdf,.docx',
  maxFiles: 5,
  maxFileSize: 5 * 1024 * 1024,      // 5 MB per file
  maxTotalSize: 20 * 1024 * 1024,    // 20 MB total
  required: true
}
```

#### Range Slider
```ts
{
  type: 'range',
  name: 'volume',
  label: 'form.labels.volume',
  min: 0,
  max: 100,
  step: 5,
  defaultValue: 50
}
```

#### Toggle with Custom Icons
```ts
{
  type: 'toggle',
  name: 'notifications',
  label: 'form.labels.notifications',
  toggleIcons: {
    on: 'notifications_active',
    off: 'notifications_off',
    position: 'start'
  }
}
```

### Best Practices

1. **Always provide `name` and `type`**: These are required for all fields.
2. **Use i18n keys** for `label`, `placeholder`, `helperText`, and `errorMessages`.
3. **Match validators to constraints**: If using `maxLength`, include `Validators.maxLength()` in `validators`.
4. **Choose the right variant**: 
   - Use `autoResize: true` for dynamic content that grows
   - Use `isResizable: true` for user-controlled sizing
   - Never use both together (they conflict)
5. **File field limits**: `maxFiles` only counts `File` objects, not string URLs.
6. **Nested groups**: Use `children` for complex forms with logical grouping.

### `fileVariant` options

The component supports three UI variants to match different UX needs:

- **`'input'` (default)**: Traditional form field with a browse button. Clean, compact, fits well in standard forms.
- **`'dropzone'`**: Drag-and-drop zone only. Larger, more prominent, ideal for file-centric workflows.
- **`'both'`**: Combines a form field with browse button AND a drag-and-drop zone below. Maximum flexibility for users who prefer either interaction pattern.

### `accept` syntax

- Comma-separated tokens:
  - Exact MIME: `application/pdf`
  - Wildcard MIME: `image/*`
  - Extension: `.pdf`, `.docx`
  - `*` allows any (not recommended)

The component filters **accepted** files and drops rejected ones, while setting an **`accept`** error so the user is informed.

## UX behaviors (important)

- **Touched/dirty**: on open/confirm/remove/clear we mark the control touched and dirty so errors are visible.
- **Error precedence**: component selects first error by order:  
  `required → maxFiles → maxFileSize → maxTotalSize → accept`.
- **Where errors are applied**: **after** `setValue()` and an initial `updateValueAndValidity({ emitEvent: false })`, we call `setErrors(...)`. This prevents Angular from overwriting custom errors.
- **Display**: error message is rendered inside `<mat-error>` with `role="alert"` and `aria-live="polite"`.
- **Drag & drop** (variants `'dropzone'` and `'both'`):
  - Visual feedback on dragover (border highlight)
  - Prevents default browser behavior
  - Filters files by `accept` criteria
  - Works on both desktop and touch devices
- **Read-only input** (variant `'input'`): the visible `<input matInput>` shows a summary (`"3 files"` or a single filename). Real file picking uses a hidden `<input type="file">`.

## i18n keys (add to your locale file)

```jsonc
"form": {
  "actions": {
    "browse": "Browse",
    "addFiles": "Add files",
    "replaceFile": "Replace file",
    "remove": "Remove",
    "clear": "Clear"
  },
  "files": {
    "count": "{{count}} files",
    "dropzone": {
      "title": "Drop files here or click to browse",
      "subtitle": "Accepted formats: {{accept}}"
    }
  },
  "errors": {
    "file": {
      "accept": "Field only accepts the following types: {{requiredTypes}}.",
      "required": "Field is required.",
      "maxFiles": "Maximum {{requiredLength}} file(s) allowed (you selected {{actualLength}}).",
      "maxFileSize": "Maximum file size {{requiredLength}} allowed.",
      "maxTotalSize": "Maximum total size {{requiredLength}} allowed."
    }
  }
}
```

> `requiredTypes` is formatted from `accept` (e.g., `".pdf, .docx, image/*"`).

## Example factory (`FieldConfigService.getFileField`) signature

```ts
getFileField(cfg: Partial<FileFieldConfig> & { name: string; label: string }): FileFieldConfig {
  return {
    type: 'file',
    placeholder: '',
    layoutClass: 'primary',
    multiple: false,
    fileVariant: 'input', // default variant
    ...cfg,
    validators: [...(cfg.validators ?? [])],
    errorMessages: {
      required: 'form.errors.file.required',
      accept: 'form.errors.file.accept',
      maxFiles: 'form.errors.file.maxFiles',
      maxFileSize: 'form.errors.file.maxFileSize',
      maxTotalSize: 'form.errors.file.maxTotalSize',
      ...(cfg.errorMessages ?? {}),
    }
  };
}
```

## Component integration (FieldHost)

Ensure the type map includes the file field:

```ts
const MAP = {
  text: TextInputComponent,
  email: TextInputComponent,
  password: TextInputComponent,
  phone: TextInputComponent,
  textarea: TextFieldComponent,
  datepicker: DatepickerComponent,
  chips: ChipsComponent,
  autocomplete: AutocompleteComponent,
  toggle: ToggleComponent,
  dropdown: SelectComponent,
  range: RangeComponent,
  file: InputFileComponent,
};
```

## Common scenarios (recipes)

### Single image (avatar) - Input variant

```ts
this.fieldsConfigService.getFileField({
  name: 'avatar',
  label: 'form.labels.avatar',
  fileVariant: 'input', // compact form field
  accept: 'image/*',
  maxFiles: 1,
  maxFileSize: 2 * 1024 * 1024,
  required: false,
});
```

### Multi-doc upload - Dropzone variant

```ts
this.fieldsConfigService.getFileField({
  name: 'documents',
  label: 'form.labels.documents',
  fileVariant: 'dropzone', // prominent drag & drop area
  multiple: true,
  accept: '.pdf,.docx',
  maxFiles: 10,
  maxFileSize: 5 * 1024 * 1024,
  maxTotalSize: 50 * 1024 * 1024,
  required: true,
  validators: [Validators.required],
});
```

### Flexible upload - Both variants

```ts
this.fieldsConfigService.getFileField({
  name: 'attachments',
  label: 'form.labels.attachments',
  fileVariant: 'both', // browse button + dropzone
  multiple: true,
  accept: '.pdf,.docx,image/*',
  maxFiles: 5,
  maxFileSize: 5 * 1024 * 1024,
  maxTotalSize: 12 * 1024 * 1024,
  required: true,
  validators: [Validators.required],
});
```

### Pre-filled with existing URLs/ids

```ts
form.patchValue({
  attachments: ['https://cdn.example.com/file/1234', 'contract-2025.pdf'],
});
```

> The UI lists strings as simple names; size info is only shown for `File` objects.

## Accessibility details

- `aria-invalid` follows control validity.
- `aria-describedby` points to hint or error id depending on state.
- Error text is inside `<mat-error>` with `role="alert"` and polite live region.
- Keyboard users can focus the browse button and remove/clear buttons.
- **Dropzone accessibility**:
  - Clickable area has `role="button"` and `tabindex="0"`
  - Keyboard activation (Enter/Space) triggers file picker
  - Screen readers announce dropzone purpose via `aria-label`

## Testing checklist (unit/integration)

- Selecting files totalling **over** `maxTotalSize` shows `form.errors.file.maxTotalSize` and keeps control invalid.
- Selecting a file **over** `maxFileSize` shows `form.errors.file.maxFileSize`.
- Selecting **more** than `maxFiles` shows `form.errors.file.maxFiles`.
- Picking a **disallowed** type sets `accept` error and **excludes** the rejected file from the control value.
- `required` appears when value is empty and field is touched.
- `removeAt(i)` + `clear()` keep touched/dirty and recompute errors.
- Same file can be selected twice (native input value reset after change).
- **Variant-specific tests**:
  - `'dropzone'`: drag & drop triggers file selection
  - `'dropzone'`: click on dropzone opens file picker
  - `'both'`: both browse button and dropzone work independently
  - `'both'`: files from either method are combined in the same control

## Pitfalls & gotchas

- **Do not** call `updateValueAndValidity()` after `setErrors(...)`—Angular may rerun validators and clear custom errors.
- `maxFiles` counts only `File` items, not `string` placeholders.
- If your backend needs **total size** including already‑uploaded items, compute on the server; the client only sums current `File` objects.
- Using `accept="image/*"` relies on browser MIME detection; some images may have empty MIME—extensions in `accept` can improve detection.
- **Variant selection**: Choose based on your UX needs:
  - Use `'input'` for compact forms with other fields
  - Use `'dropzone'` for file-centric workflows or when files are the primary action
  - Use `'both'` when you want maximum flexibility and have space for both patterns

## Async upload pattern (optional)

For direct-to-storage uploads, keep the control value as strings (URLs/ids) after a successful upload. Example flow:

1. User selects files → show local list + errors.
2. Upload files (`File[]`) asynchronously.
3. Replace `File` entries with returned URLs/ids in the control value.

```ts
const files = (form.get('attachments')!.value as (File | string)[]).filter(
  (x) => x instanceof File,
) as File[];
// upload...
form.patchValue({
  attachments: uploaded.map((u) => u.url), // keep strings only
});
```

## Helpers

- `humanSize(bytes)` → formats `KB/MB/GB` for display.
- `filesView` → normalizes `(File|string)` entries into `{ name, size? }` for the list.

---

## Validators & Error Keys (conventions)

Built‑in and custom validators used in `FieldConfigService`:

- `Validators.required`, `minLength`, `maxLength`, `pattern`
- `allowedCharsValidator(disallowedRegex)` → sets `invalidChars` with `{ char }`
- `emailTldValidator(min)` → sets `emailTld`
- `passwordStrengthValidator({ minLength, minUpper, minDigits, minSpecial? })` → sets `uppercase`, `digit`, `special`
- `phoneDigitCount(min, max)` → sets `phoneDigitsLen`
- `optionInListValidator(options)` → sets `optionNotAllowed`
- `minArrayLength(n)` → sets `minlengthArray`
- `datePatternFromPlaceholder('YYYY-MM-DD')` → input mask for parsing in `DatepickerComponent`
- **File validators (component-level enforcement):** `accept`, `maxFiles`, `maxFileSize`, `maxTotalSize`, `required`

**Common error message keys (add to i18n):**

```
form.errors.input.required
form.errors.input.minlength
form.errors.input.maxlength
form.errors.input.invalidChars

form.errors.email.required
form.errors.email.invalid
form.errors.email.tld
form.errors.email.maxlength

form.errors.password.required
form.errors.password.minlength
form.errors.password.maxlength
form.errors.password.uppercase
form.errors.password.digit
form.errors.password.special

form.errors.phone.required
form.errors.phone.invalid

form.errors.role.required

form.errors.volume.required
form.errors.volume.min
form.errors.volume.max

form.errors.dob.required
form.errors.dob.format
form.errors.dob.parse
form.errors.dob.minDate
form.errors.dob.maxDate
form.errors.dob.dateNotAllowed

form.errors.tags.minOne

form.errors.country.required
form.errors.country.notAllowed

form.errors.file.accept
form.errors.file.maxFiles
form.errors.file.maxTotalSize
form.errors.file.maxFileSize
form.errors.file.required
```

---

## Dynamic Behaviors

- **Show/Hide**: toggle `field.hidden = true/false` and re-render.
- **Disable/Enable**: `form.get(field.name)?.disable()` or model `field.disabled = true` before build.
- **Update options** (dropdown/autocomplete):

  ```ts
  const f = fieldConfig.find(x => x.name === 'role')!;
  f.options = [{ label: 'Owner', value: 'owner' }, ...];
  ```

- **Set values**: `form.patchValue({ email: 'a@b.com' })`.
- **Listen to changes**: `form.get('email')?.valueChanges.subscribe(...)`.

## Adding a New Field Type

1. **Create a field component** with inputs: `field: FieldConfig` and `control: FormControl`.
2. **Register it** in `FieldHostComponent` map:

   ```ts
   const MAP = { ..., myNewType: MyNewFieldComponent };
   ```

3. **Extend** `FieldConfigService` with a `getMyNewField(...)` factory.
4. **Use** it in `fieldConfig` as `type: 'myNewType'`.

> Keep `FieldComponent` contract: the component must bind to `control` and use metadata from `field` (label, placeholder, errors, etc.).

## Accessibility & i18n Tips

- Always provide a `label` (i18n key).
- `placeholder` should be informative; avoid duplicating the label.
- Ensure error messages map to actual validator keys.
- Components set ARIA attributes (e.g., `aria-invalid`) based on control state.
- Use `TranslateService` pipes in templates for labels/help/errors.

## Testing Guidelines

- **Reducers/validators**: unit test pure functions.
- **Field components**: render with a `FormControl`, assert error messages & aria attributes.
- **DynamicForm**: pass a small `FieldConfig[]` and assert controls exist; test group creation and default values.
- **Integration**: simulate user input and ensure validators trigger expected errors.

## Common Pitfalls

- **Unique `name`** per field: duplicates will overwrite controls.
- **Required + dropdown**: for single-select, control starts at `null` so `Validators.required` works.
- **Datepicker**: do **not** add `Validators.pattern` (value is `Date | null`); use the `pattern` only for parsing raw input.
- **Chips**: use `minArrayLength(1)` to enforce a non-empty selection.
- **Autocomplete**: enforce with `optionInListValidator([...])` to restrict to known values.
- **File field**: apply custom errors **after** `setValue()`; otherwise Angular may overwrite them.

## Where Things Live

| Path                                             | Purpose                                |
| ------------------------------------------------ | -------------------------------------- |
| `shared/forms/field-config.model.ts`             | `FieldConfig` type (shape of a field)  |
| `shared/forms/dynamic-form.component.*`          | Builds the form & renders field host   |
| `shared/forms/field-host/field-host.component.*` | Maps `type` → concrete field component |
| `shared/forms/fields/*`                          | Concrete field components              |
| `core/services/field-config.service.ts`          | Field builder helpers (this file)      |
| `shared/shared` (barrel)                         | Re-exports common symbols              |

## FAQ

**Q: How do I add a nested group (e.g., address)?**  
A: Use a `type: 'group'` field with `children: FieldConfig[]`. `DynamicForm` will create a nested `FormGroup` automatically.

**Q: How do I add or remove items from an array field?**  
A: `DynamicForm` creates the top-level `FormControl` as an array; push/splice values from the component. If you need `FormArray`, extend the builder accordingly.

**Q: How do I surface custom validator messages?**  
A: Ensure your validator sets a clear error key (e.g., `invalidChars`) and provide a matching i18n key in `errorMessages` of the field.

---

Happy building! 🎯

## 🧑‍💻 Author

**Angular Product Skeleton**  
Built by **Tarik Haddadi** using Angular 19+ and modern best practices (2025).
