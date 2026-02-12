import { Component, OnDestroy, inject } from '@angular/core';
import {
    Status,
    WorkflowPorts,
} from '../../../templates/utils/workflow.interface';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatTabsModule } from '@angular/material/tabs';
import { MatCheckboxModule } from '@angular/material/checkbox';
import { TranslateModule, TranslateService } from '@ngx-translate/core';
import { AbstractControl, FormBuilder, FormControl, FormGroup, ReactiveFormsModule, FormsModule, Validators } from '@angular/forms';
import { FieldConfigService } from '@cadai/pxs-ng-core/services';
import { WfCanvasBus } from '../../../templates/utils/wf-canvas-bus';
import { debounceTime, distinctUntilChanged, Subscription } from 'rxjs';
import { DynamicFormComponent, FieldHostComponent } from '@cadai/pxs-ng-core/shared';
import { FieldConfig } from '@cadai/pxs-ng-core/interfaces';
import { MatDialogModule, MAT_DIALOG_DATA, MatDialogRef } from '@angular/material/dialog';
import { CommonModule } from '@angular/common';
import { Inject } from '@angular/core';

export interface NodeDetailsDialogData {
    nodeId: string;
    label: string;
    icon: string | null;
    status: Status | null;
    pinned: boolean;
    disabled: boolean;
    ports: WorkflowPorts;
    form: FormGroup;
    config: FieldConfig[];
    portTypeOptions: { value: string; label: string }[];
}

@Component({
    selector: 'app-node-details-dialog',
    standalone: true,
    imports: [CommonModule, FormsModule, ReactiveFormsModule, MatDialogModule, MatButtonModule, MatIconModule, MatTabsModule, MatCheckboxModule, DynamicFormComponent, FieldHostComponent, TranslateModule],
    template: `
    <h2 mat-dialog-title class="dialog-title">
      <mat-icon *ngIf="data.icon">{{ data.icon }}</mat-icon>
      <app-dynamic-form class="title-form" [form]="labelForm" [config]="labelConfig"></app-dynamic-form>
    </h2>
    <div mat-dialog-content class="dialog-content">
      <div class="badges">
        <span class="badge status" *ngIf="data.status">{{ ('status.' + data.status) | translate }}</span>
        <span class="badge" *ngIf="data.pinned">{{ 'workflow.node.pinned' | translate }}</span>
        <span class="badge" *ngIf="data.disabled">{{ 'workflow.node.disabled' | translate }}</span>
      </div>

      <mat-tab-group>
        <mat-tab>
          <ng-template mat-tab-label>{{ 'workflow.dialog.params' | translate }}</ng-template>
          <app-dynamic-form [form]="data.form" [config]="data.config"></app-dynamic-form>
        </mat-tab>
        <mat-tab>
          <ng-template mat-tab-label>{{ 'workflow.dialog.ports' | translate }}</ng-template>
          <div class="ports-editor">
            <div class="ports-section">
              <div class="ports-title">{{ 'workflow.dialog.inputs' | translate }}</div>
              <div class="port-row" *ngFor="let p of inputs; let i = index">
                <form [formGroup]="p.form" class="port-form">
                  @for (field of p.config; track field.name) {
                    @if (p.form.get(field.name); as ctl) {
                      <app-field-host [field]="field" [control]="ctl"></app-field-host>
                    } @else {
                      <div class="port-field-placeholder"></div>
                    }
                  }
                </form>
                <button mat-icon-button color="warn" (click)="removeInput(i)" [disabled]="inputs.length <= 1">
                  <mat-icon>close</mat-icon>
                </button>
              </div>
              <button mat-flat-button color="primary" (click)="addInput()">
                <mat-icon>add</mat-icon>
                {{ 'workflow.dialog.add_input' | translate }}
              </button>
            </div>

            <div class="ports-section">
              <div class="ports-title">{{ 'workflow.dialog.outputs' | translate }}</div>
              <div class="port-row" *ngFor="let p of outputs; let i = index">
                <form [formGroup]="p.form" class="port-form">
                  @for (field of p.config; track field.name) {
                    @if (p.form.get(field.name); as ctl) {
                      <app-field-host [field]="field" [control]="ctl"></app-field-host>
                    } @else {
                      <div class="port-field-placeholder"></div>
                    }
                  }
                </form>
                <button mat-icon-button color="warn" (click)="removeOutput(i)" [disabled]="outputs.length <= 1">
                  <mat-icon>close</mat-icon>
                </button>
              </div>
              <button mat-flat-button color="primary" (click)="addOutput()">
                <mat-icon>add</mat-icon>
                {{ 'workflow.dialog.add_output' | translate }}
              </button>
            </div>
          </div>
        </mat-tab>
      </mat-tab-group>
    </div>
    <div mat-dialog-actions align="end">
      <button mat-flat-button mat-dialog-close>
        <mat-icon>close</mat-icon>
        {{ 'close' | translate }}
      </button>
    </div>
  `,
    styles: [`
    :host { display: block; }
    .dialog-title { display:flex; align-items:center; gap:8px; }
    .title-form { flex: 1; }
    .badges { display:flex; gap:6px; margin-bottom:8px; }
    .badge { padding:3px 8px; border-radius:12px; font-size:12px; background: color-mix(in srgb, var(--mat-neutral) 25%, transparent); }
    .ports { display:flex; gap:12px; margin: 0 0 12px; }
    .ports-label { font-weight: 600; margin-bottom:4px; }
    .port-chip { padding:4px 8px; border-radius:8px; background: color-mix(in srgb, var(--mat-neutral) 18%, transparent); }
    .ports-editor { display:flex; flex-direction:column; gap:16px; padding:8px 2px 2px; }
    .ports-section { display:flex; flex-direction:column; gap:8px; }
    .ports-title { font-weight:600; font-size:12px; text-transform: uppercase; opacity:0.7; }
    .port-row { display:flex; gap:8px; align-items:flex-start; flex-wrap:wrap; }
    .port-form { flex: 1; display:grid; grid-template-columns: minmax(140px, 1fr) minmax(160px, 1fr) auto; gap:8px; align-items:center; }
    .port-form app-field-host { min-width: 0; }
    .port-field-placeholder { min-height: 48px; }
    :host ::ng-deep .mat-mdc-tab-body-content { padding: 12px 4px 4px; box-sizing: border-box; }
    :host ::ng-deep .mat-mdc-tab-group { flex: 1; display: flex; flex-direction: column; min-height: 0; }
    :host ::ng-deep .mat-mdc-tab-body-wrapper { flex: 1; min-height: 0; }
    :host ::ng-deep .mat-mdc-tab-body { flex: 1; min-height: 0; }
    :host ::ng-deep .mat-mdc-tab-body-content { height: 100%; overflow: auto; }
  `]
})
export class NodeDetailsDialogComponent implements OnDestroy {
    private fb = inject(FormBuilder);
    private fields = inject(FieldConfigService);
    private translate = inject(TranslateService);
    private subs = new Subscription();
    private portSubs = new Map<string, Subscription>();
    labelForm!: FormGroup;
    labelControl!: FormControl<string>;
    labelConfig: FieldConfig[] = [];

    inputs: { id: string; form: FormGroup; config: FieldConfig[] }[] = [];
    outputs: { id: string; form: FormGroup; config: FieldConfig[] }[] = [];
    private emitTimer: number | null = null;
    private get portTypeOptions(): { value: string; label: string }[] {
        return (this.data.portTypeOptions ?? []).length
            ? this.data.portTypeOptions
            : [
                { value: 'string', label: 'workflow.dialog.port_type_options.string' },
                { value: 'json', label: 'workflow.dialog.port_type_options.json' },
                { value: 'file', label: 'workflow.dialog.port_type_options.file' },
                { value: 'boolean', label: 'workflow.dialog.port_type_options.boolean' },
                { value: 'collection', label: 'workflow.dialog.port_type_options.collection' },
                { value: 'embeddings', label: 'workflow.dialog.port_type_options.embeddings' },
                { value: 'query_string', label: 'workflow.dialog.port_type_options.query_string' },
            ];
    }

    constructor(
        @Inject(MAT_DIALOG_DATA) public data: NodeDetailsDialogData,
        public dialogRef: MatDialogRef<NodeDetailsDialogComponent>,
        private bus: WfCanvasBus,
    ) {
        this.inputs = (data.ports?.inputs ?? []).map(p =>
            this.buildPortForm({ ...p, required: p.required ?? false })
        );

        this.outputs = (data.ports?.outputs ?? []).map(p =>
            this.buildPortForm({ ...p, required: p.required ?? false })
        );
        this.markDirtyTree(data.form);

        const labelValue = (data.label ?? '').toString();
        const labelText = this.translate.instant('workflow.dialog.node_name');
        this.labelConfig = [
            this.fields.getTextField({
                name: 'label',
                label: labelText,
                placeholder: labelText,
                required: true,
                validators: [Validators.required, Validators.minLength(2), Validators.maxLength(60)],
                errorMessages: {
                    required: this.translate.instant('form.errors.input.required'),
                    minlength: this.translate.instant('form.errors.input.minlength'),
                    maxlength: this.translate.instant('form.errors.input.maxlength'),
                },
                layoutClass: 'primary',
                color: 'primary',
                defaultValue: labelValue,
            })
        ];
        this.labelControl = this.fb.control(labelValue, {
            nonNullable: true,
            validators: [Validators.required, Validators.minLength(2), Validators.maxLength(60)],
        });
        this.labelForm = this.fb.group({ label: this.labelControl });

        this.subs.add(
            this.labelControl.valueChanges
                .pipe(debounceTime(150), distinctUntilChanged())
                .subscribe(value => {
                    const next = (value ?? '').toString();
                    this.bus.nodeLabelChanged$.next({ nodeId: this.data.nodeId, label: next });
                })
        );
    }

    ngOnDestroy(): void {
        this.subs.unsubscribe();
        this.portSubs.forEach(sub => sub.unsubscribe());
        this.portSubs.clear();
    }

    private nextId(prefix: 'in' | 'out'): string {
        const existing = new Set([...this.inputs, ...this.outputs].map(p => p.id));
        let i = existing.size + 1;
        let id = `${prefix}-${i}`;
        while (existing.has(id)) {
            i += 1;
            id = `${prefix}-${i}`;
        }
        return id;
    }

    addInput(): void {
        const port = { id: this.nextId('in'), label: `in ${this.inputs.length + 1}`, type: 'json', required: false };
        this.inputs = [...this.inputs, this.buildPortForm(port)];
        this.queueEmit();
    }

    addOutput(): void {
        const port = { id: this.nextId('out'), label: `out ${this.outputs.length + 1}`, type: 'json', required: false };
        this.outputs = [...this.outputs, this.buildPortForm(port)];
        this.queueEmit();
    }

    removeInput(i: number): void {
        const next = this.inputs.slice();
        const removed = next[i];
        next.splice(i, 1);
        this.inputs = next;
        if (removed) {
            this.portSubs.get(removed.id)?.unsubscribe();
            this.portSubs.delete(removed.id);
        }
        this.queueEmit();
    }

    removeOutput(i: number): void {
        const next = this.outputs.slice();
        const removed = next[i];
        next.splice(i, 1);
        this.outputs = next;
        if (removed) {
            this.portSubs.get(removed.id)?.unsubscribe();
            this.portSubs.delete(removed.id);
        }
        this.queueEmit();
    }

    queueEmit(): void {
        if (this.emitTimer) {
            window.clearTimeout(this.emitTimer);
        }
        this.emitTimer = window.setTimeout(() => {
            this.bus.nodePortsChanged$.next({
                nodeId: this.data.nodeId,
                inputs: this.inputs.map(p => this.portFromForm(p)),
                outputs: this.outputs.map(p => this.portFromForm(p)),
            });
            this.emitTimer = null;
        }, 150);
    }

    private buildPortForm(port: WorkflowPorts['inputs'][number]): { id: string; form: FormGroup; config: FieldConfig[] } {
        const labelMin = 2;
        const labelMax = 40;
        const form = this.fb.group({
            label: [port.label ?? '', [Validators.required, Validators.minLength(labelMin), Validators.maxLength(labelMax)]],
            type: [port.type ?? 'json', Validators.required],
            required: [{ value: port.required === true, disabled: !!port.readonly }],
        });

        const config: FieldConfig[] = [
            this.fields.getTextField({
                name: 'label',
                label: 'workflow.dialog.port_name',
                placeholder: 'workflow.dialog.port_name_placeholder',
                helperText: 'workflow.dialog.port_name_help',
                defaultValue: port.label ?? '',
                required: true,
                minLength: labelMin,
                maxLength: labelMax,
                validators: [Validators.required, Validators.minLength(labelMin), Validators.maxLength(labelMax)],
                errorMessages: {
                    required: 'form.errors.input.required',
                    minlength: 'form.errors.input.minlength',
                    maxlength: 'form.errors.input.maxlength',
                },
                layoutClass: 'primary',
                color: 'primary',
            }),
            this.fields.getDropdownField({
                name: 'type',
                label: 'workflow.dialog.port_type',
                placeholder: 'workflow.dialog.port_type_placeholder',
                helperText: 'workflow.dialog.port_type_help',
                options: this.portTypeOptions.map(o => ({ label: this.translate.instant(o.label), value: o.value })),
                multiple: false,
                required: true,
                validators: [Validators.required],
                errorMessages: { required: 'form.errors.input.required' },
                layoutClass: 'primary',
                color: 'primary',
                defaultValue: port.type ?? 'json',
            }),
            this.fields.getToggleField({
                name: 'required',
                label: 'workflow.dialog.required',
                helperText: 'workflow.dialog.port_required_help',
                required: false,
                layoutClass: 'primary',
                color: 'primary',
                defaultValue: port.required === true,
                disabled: !!port.readonly,
            }),
        ];

        const sub = form.valueChanges.pipe(debounceTime(150)).subscribe(() => this.queueEmit());
        this.subs.add(sub);
        this.portSubs.set(port.id, sub);

        return { id: port.id, form, config };
    }

    private portFromForm(p: { id: string; form: FormGroup }): WorkflowPorts['inputs'][number] {
        const raw = p.form.getRawValue() as { label?: string; type?: string; required?: boolean };
        return {
            id: p.id,
            label: (raw.label ?? '').toString().trim() || p.id,
            type: raw.type ?? 'json',
            required: raw.required === true,
        };
    }

    private markDirtyTree(control: AbstractControl | null): void {
        if (!control) return;

        const anyControl = control as AbstractControl & { controls?: Record<string, AbstractControl> | AbstractControl[] };
        const childControls = anyControl.controls;

        if (Array.isArray(childControls)) {
            childControls.forEach(child => this.markDirtyTree(child));
        } else if (childControls && typeof childControls === 'object') {
            Object.values(childControls).forEach(child => this.markDirtyTree(child));
        }

        control.markAsTouched({ onlySelf: true });
        control.markAsDirty({ onlySelf: true });
        control.updateValueAndValidity({ emitEvent: false });
    }
}
