import { Component, Input, OnChanges, Type, computed, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormControl, ReactiveFormsModule } from '@angular/forms';

import { TextInputComponent } from '../fields/text-input/text-input.component';
import { DatePickerComponent } from '../fields/date-picker/datepicker.component';
import { ChipsComponent } from '../fields/chips/chips.component';
import { AutocompleteComponent } from '../fields/autocomplete/autocomplete.component';
import { ToggleComponent } from '../fields/toggle/toggle.component';
import { SelectComponent } from '../fields/select/select.component';
import { RangeComponent } from '../fields/range/range.component';
import { FieldConfig, FieldType } from '../field-config.model';

export interface FieldComponent {
  field: FieldConfig;
  control: FormControl;
}

const MAP: Partial<Record<FieldType, Type<FieldComponent>>> = {
  text: TextInputComponent,
  email: TextInputComponent,
  phone: TextInputComponent,
  password: TextInputComponent,
  datepicker: DatePickerComponent,
  chips: ChipsComponent,
  autocomplete: AutocompleteComponent,
  toggle: ToggleComponent,
  dropdown: SelectComponent,
  range: RangeComponent,
};

@Component({
  selector: 'app-field-host',
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule],
  template: `
    <ng-container *ngIf="component() as cmp">
      <ng-container *ngComponentOutlet="cmp; inputs: inputs()"></ng-container>
    </ng-container>
  `
})
export class FieldHostComponent implements OnChanges {
  @Input({ required: true }) field!: FieldConfig;
  @Input({ required: true }) control!: FormControl;

  component = computed<Type<FieldComponent> | undefined>(() => MAP[this.field.type]);
  inputs = signal<Record<string, unknown>>({});

  ngOnChanges() {
    this.inputs.set({ field: this.field, control: this.control });
  }
}