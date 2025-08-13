# Dynamic Forms & Field Components Guide
_Last updated: 2025-08-13_

This document explains how to **instantiate forms** and **reuse custom field components** under `shared/forms/fields`. It covers the `DynamicFormComponent`, the `FieldHostComponent`, and the `FieldConfigService` helpers your teammates will use every day.


## TL;DR – Quick Start

### 1) Create a form and field config in your feature component
```ts
// my-feature.component.ts
import { Component, inject } from '@angular/core';
import { FormBuilder, FormGroup } from '@angular/forms';
import { FieldConfigService } from '@/app/shared/shared'; // re-export path in your project

@Component({ /* ... */ })
export class MyFeatureComponent {
  private fb = inject(FormBuilder);
  private fields = inject(FieldConfigService);

  form: FormGroup = this.fb.group({});
  fieldConfig = [
    this.fields.getTextField('form.labels.fullname', 'form.placeholders.fullname'),
    this.fields.getEmailField('form.labels.email', 'form.placeholders.email'),
    this.fields.getPasswordField('form.labels.password', 'form.placeholders.password'),
    this.fields.getPhoneField('form.labels.phone', 'form.placeholders.phone'),
    this.fields.getToggleField('form.labels.notify'),
    this.fields.getDropdownField('form.labels.role'),
    this.fields.getDatepickerField('form.labels.dob'),
    this.fields.getChipsField('form.labels.tags'),
    this.fields.getAutocompleteField('form.labels.country'),
    this.fields.getRangeField('form.labels.price', 0, 200, 5),
    this.fields.getTextAreaField('form.labels.input', 'form.placeholders.input'),
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
  <ng-container *ngFor="let field of fieldConfig">
    <div class="{{ field.layoutClass || 'col-12' }}" *ngIf="!field.hidden">
      <app-field-host [field]="field" [control]="form.get(field.name)!"></app-field-host>
    </div>
  </ng-container>
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

- **`FieldConfigService`** → factory methods that return typed `FieldConfig` objects (text, email, password, phone, toggle, dropdown, range, datepicker, chips, autocomplete, textarea).  
- **`DynamicFormComponent`** → takes `[form]` + `[config]`, creates controls, and renders each field via `FieldHostComponent`.  
- **`FieldHostComponent`** → maps each `FieldConfig.type` to a concrete field UI component (TextInput, Datepicker, Chips, etc.).

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
  - `group` (nested) / `array` (list)
- `name`: unique control key in the parent form
- `label`: i18n key or plain label
- `placeholder`: i18n key or plain text

**Common options**
- `required`, `minLength`, `maxLength`, `pattern`, `validators`
- `errorMessages`: map of error keys → i18n keys (see example list below)
- `layoutClass`: CSS/grid class (`'col-12'`, `'col-md-6'`, …)
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


## Validators & Error Keys (conventions)

Built‑in and custom validators used in `FieldConfigService`:
- `Validators.required`, `minLength`, `maxLength`, `pattern`
- `allowedCharsValidator(disallowedRegex)` → sets `invalidChars` with `{ char }`
- `emailTldValidator(min)` → sets `emailTld`
- `passwordStrengthValidator({ minLength, minUpper, minDigits, minSpecial? })` → sets `uppercase`, `digit`, `special`
- `phoneDigitCount(min, max)` → sets `phoneDigitsLen`
- `optionInListValidator(options)` → sets `optionNotAllowed`
- `minArrayLength(n)` → sets `minlengthArray`
- `datePatternFromPlaceholder('YYYY-MM-DD')` → input mask for parsing in `DatepickerComponent` (do **not** use `Validators.pattern` for datepicker; the control value is `Date | null`).

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
form.errors.phone.invalid  // also for phoneDigitsLen

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
```

## Patterns & Examples

### Login/Profile form (minimal)
```ts
form = this.fb.group({});
fields = [
  this.fields.getEmailField('form.labels.email', 'form.placeholders.email'),
  this.fields.getPasswordField('form.labels.password', 'form.placeholders.password'),
  this.fields.getToggleField('form.labels.notify')
];
```

### Address as a nested group
```ts
fields = [
  {
    type: 'group', name: 'address', label: 'form.labels.address',
    children: [
      this.fields.getTextField('form.labels.street', 'form.placeholders.street'),
      this.fields.getTextField('form.labels.city', 'form.placeholders.city'),
      this.fields.getTextField('form.labels.zip', 'form.placeholders.zip')
    ]
  }
];
// Access: form.get('address.street')?.value
```

### Dropdown with custom options (single or multiple)
```ts
fields = [
  this.fields.getDropdownField('form.labels.role', [
    { label: 'Admin', value: 'admin' },
    { label: 'User', value: 'user' },
    { label: 'Manager', value: 'manager' }
  ], /* multiple? */ false)
];
```

### Chips with predefined options
```ts
fields = [ this.fields.getChipsField('form.labels.tags', ['Angular', 'React', 'Vue'], true) ];
```

### Autocomplete restricted to a list
```ts
fields = [ this.fields.getAutocompleteField('form.labels.country', ['Luxembourg','Germany','France']) ];
```

### Datepicker with strict placeholder pattern
```ts
fields = [ this.fields.getDatepickerField('form.labels.dob') ];
```

### Range slider with min/max/step + default
```ts
fields = [ this.fields.getRangeField('form.labels.price', 0, 200, 5) ];
```

---

## Dynamic Behaviors

- **Show/Hide**: toggle `field.hidden = true/false` and re-render.
- **Disable/Enable**: `form.get(field.name)?.disable()` or model `field.disabled = true` before build.
- **Update options** (dropdown/autocomplete):
  ```ts
  const f = this.fieldConfig.find(x => x.name === 'role')!;
  f.options = [{ label: 'Owner', value: 'owner' }, ...];
  ```
- **Set values**: `this.form.patchValue({ email: 'a@b.com' })`.
- **Listen to changes**: `this.form.get('email')?.valueChanges.subscribe(...)`.

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

## Where Things Live

| Path                                               | Purpose                                 |
|----------------------------------------------------|-----------------------------------------|
| `shared/forms/field-config.model.ts`               | `FieldConfig` type (shape of a field)   |
| `shared/forms/dynamic-form.component.*`            | Builds the form & renders field host    |
| `shared/forms/field-host/field-host.component.*`   | Maps `type` → concrete field component  |
| `shared/forms/fields/*`                            | Concrete field components               |
| `core/services/field-config.service.ts`            | Field builder helpers (this file)       |
| `shared/shared` (barrel)                           | Re-exports common symbols               |


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
Built by **Tarik Haddadi** using Angular 19 and modern best practices (2025).