import { Component, Input, OnInit, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormBuilder, FormControl, FormGroup, ReactiveFormsModule } from '@angular/forms';
import { TranslateModule, TranslateService } from '@ngx-translate/core';

import { FieldConfig } from './field-config.model';
import { FieldHostComponent } from './field-host/field-host.component';
import { buildValidators } from './utils';

@Component({
  selector: 'app-dynamic-form',
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule, TranslateModule, FieldHostComponent],
  templateUrl: './dynamic-form.component.html',
  styleUrls: ['./dynamic-form.component.scss'] 
})
export class DynamicFormComponent implements OnInit {
  @Input() config: FieldConfig[] = [];
  @Input() form!: FormGroup;

  private fb = inject(FormBuilder);
  public translateService = inject(TranslateService);

  ngOnInit(): void {
    this.buildForm();
  }

  private buildForm(): void {
    for (const field of this.config) {
      // support nested structures if you already use them
      if (field.type === 'group') {
        const group = this.fb.group({});
        this.form.addControl(field.name, group);
        (field.children ?? []).forEach(ch =>
          group.addControl(ch.name, new FormControl({ value: '', disabled: !!ch.disabled }, { validators: buildValidators(ch), nonNullable: true }))
        );
        continue;
      }
      if (field.type === 'array') {
        // you can extend here with FormArray logic as you had before
        this.form.addControl(field.name, this.fb.control([]));
        continue;
      }

      this.form.addControl(
        field.name,
        new FormControl({ value: '', disabled: !!field.disabled }, { validators: buildValidators(field), nonNullable: true })
      );
    }
  }

  controlOf(name: string): FormControl {
    return this.form.get(name) as FormControl;
  }
}