import { Component, OnDestroy, inject, signal, Signal, OnInit, DoCheck, Input, ViewChild, ElementRef } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import {
  DfConnectorPosition,
  DfInputComponent,
  DfOutputComponent,
  DrawFlowBaseNode,
} from '@ng-draw-flow/core';
import {
  hasProp,
  isObject,
  PaletteType,
  RESERVED_KEYS,
  RunNodeDTO,
  Status,
  WorkflowNodeDataBaseParams,
  WorkflowPorts,
} from '../../templates/utils/workflow.interface';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatTabsModule } from '@angular/material/tabs';
import { MatCheckboxModule } from '@angular/material/checkbox';
import { TranslateModule, TranslateService } from '@ngx-translate/core';
import { AbstractControl, FormArray, FormBuilder, FormControl, FormGroup, ReactiveFormsModule, FormsModule, Validators } from '@angular/forms';
import { FieldConfigService } from '@cadai/pxs-ng-core/services';
import { WfCanvasBus } from '../../templates/utils/wf-canvas-bus';
import { ActionFormSpec, makeFallback } from '../../templates/utils/action-forms';
import { debounceTime, distinctUntilChanged, Subscription } from 'rxjs';
import { DynamicFormComponent, FieldHostComponent } from '@cadai/pxs-ng-core/shared';
import { FieldConfig } from '@cadai/pxs-ng-core/interfaces';
import { MatTooltipModule } from '@angular/material/tooltip';
import { MatDialog, MatDialogModule, MAT_DIALOG_DATA, MatDialogRef } from '@angular/material/dialog';
import type { ReplaceBinary, ReservedKeys, StripReservedShallow } from '../../templates/utils/workflow.interface';
import { Store } from '@ngrx/store';
import { AppSelectors } from '@cadai/pxs-ng-core/store';
import { CommonModule } from '@angular/common';
import { Inject } from '@angular/core';
import { PortTypeOption, WorkflowsStore } from '../../data/workflows.store';
import { buildValidators } from '@cadai/pxs-ng-core/utils';

@Component({
  selector: 'app-wf-node',
  standalone: true,
  imports: [
    CommonModule,
    DfInputComponent,
    DfOutputComponent,
    MatButtonModule,
    MatIconModule,
    MatTabsModule,
    MatCheckboxModule,
    TranslateModule,
    FormsModule,
    ReactiveFormsModule,
    MatTooltipModule,
    MatDialogModule,
    DynamicFormComponent
  ],
  templateUrl: "./action-node.component.html",
  styleUrls: ["./action-node.component.scss"],
  host: {
    '(keydown.delete.stop)': '0',
    '(keydown.backspace.stop)': '0',
  },
})
export class WfNodeComponent extends DrawFlowBaseNode implements OnDestroy, OnInit, DoCheck {
  private bus = inject(WfCanvasBus);
  private fb = inject(FormBuilder);
  private fields = inject(FieldConfigService);
  private dialog = inject(MatDialog);
  graphValidSig = signal<boolean>(false);
  positions = DfConnectorPosition;
  statusSig = signal<Status | null>(null);
  form: FormGroup = this.fb.group({});
  config: FieldConfig[] = [];
  formInputs: FormGroup = this.fb.group({});
  configInputs: FieldConfig[] = [];
  private subs = new Subscription();
  private valueChangesHooked = false;
  private inputValueChangesHooked = false;
  private labelInlineValueChangesHooked = false;
  private readonly hookedForms = new WeakSet<FormGroup>();
  private lastModelRef: unknown = null;
  private lastModelKey = '';
  private lastFlagsKey = '';
  private lastPortsKey = '';
  private portsOverride: WorkflowPorts | null = null;
  private pointerDownAt: { x: number; y: number } | null = null;
  private dragDetected = false;
  private suppressClickUntil = 0;
  labelEditing = false;
  labelInlineForm: FormGroup = this.fb.group({});
  labelInlineConfig: FieldConfig[] = [];
  private labelEditBackup = '';
  @ViewChild('labelEditHost') private labelEditHost?: ElementRef<HTMLElement>;

  private get safeModel() {
    return this.coerceModel(this.model);
  }
  missingInSig = signal<boolean>(false);
  missingOutSig = signal<boolean>(false);
  missingInPortsSig = signal<Set<string>>(new Set());
  missingOutPortsSig = signal<Set<string>>(new Set());
  private formFlags = { invalid: false };
  private disabledSig = signal<boolean>(false);
  pinnedSig = signal<boolean>(false);

  @Input({ required: true }) actionsNodes!: Record<string, ActionFormSpec>;

  translate = inject(TranslateService);
  store = inject(Store);
  private workflowsStore = inject(WorkflowsStore);
  public isDark: Signal<boolean> = toSignal(this.store.select(AppSelectors.ThemeSelectors.selectIsDark), { initialValue: false });
  private portTypeOptionsSig: Signal<PortTypeOption[]> = toSignal(this.workflowsStore.portTypes$, { initialValue: [] });

  ngOnInit(): void {

    // Always trigger UI update on graph validation, even if value is unchanged
    this.subs.add(
      this.bus.graphValid$.subscribe(ok => {
        this.graphValidSig.set(!!ok);
        this.markForCheck();
      })
    );
    queueMicrotask(() => this.tryBuildFromModel());

    this.subs.add(
      this.bus.nodeConnectivity$.subscribe(({ nodeId, missingIn, missingOut }) => {
        if (nodeId !== this.nodeId) return;
        const changed = (this.missingInSig() !== missingIn) || (this.missingOutSig() !== missingOut);
        if (changed) {
          this.missingInSig.set(missingIn);
          this.missingOutSig.set(missingOut);
          this.markForCheck();
        }
      })
    );

    this.subs.add(
      this.bus.nodePortStatus$.subscribe(({ nodeId, missingInputs, missingOutputs }) => {
        if (nodeId !== this.nodeId) return;
        this.missingInPortsSig.set(new Set(missingInputs));
        this.missingOutPortsSig.set(new Set(missingOutputs));
        this.markForCheck();
      })
    );

    this.subs.add(
      this.bus.nodePortsChanged$.subscribe(({ nodeId, inputs, outputs }) => {
        if (nodeId !== this.nodeId) return;
        this.portsOverride = {
          inputs: (inputs ?? []).map(p => ({ ...p, required: p.required === true })),
          outputs: (outputs ?? []).map(p => ({ ...p, required: p.required === true })),
        };
        this.connectorsUpdated?.emit();
        this.markForCheck();
      })
    );
    this.subs.add(
      this.bus.nodeMoved$.subscribe(({ nodeId, at }) => {
        if (nodeId !== this.nodeId) return;
        this.suppressClickUntil = Math.max(this.suppressClickUntil, at + 300);
      })
    );

    this.subs.add(
      this.bus.nodeFlagsPatch$.subscribe(({ nodeId, flags }) => {
        if (nodeId !== this.nodeId) return;
        if ('__formInvalid' in flags) {
          const inv = !!flags['__formInvalid'];
          if (inv !== this.formFlags.invalid) {
            this.formFlags.invalid = inv;
            this.markForCheck();
          }
        }
      })
    );
    this.subs.add(
      this.bus.nodeLabelChanged$.subscribe(({ nodeId, label }) => {
        if (nodeId !== this.nodeId) return;
        const current = (this.safeModel.label ?? '').toString();
        if (current === label) return;
        const target = (this.model ?? null) as Record<string, unknown> | null;
        if (target && typeof target === 'object') {
          const data = target['data'] as Record<string, unknown> | undefined;
          if (data) {
            target['data'] = { ...data, label };
          } else {
            target['label'] = label;
          }
        }
        this.markForCheck();
      })
    );

    this.subs.add(
      this.bus.graphValid$.subscribe(ok => {
        this.graphValidSig.set(!!ok);
        this.markForCheck();
      })
    );

    this.subs.add(
      this.bus.runState$.subscribe(state => {
        const s = state?.[this.nodeId] as Status | undefined;
        this.statusSig.set(s ?? null);
        this.markForCheck();
      })
    );

    this.subs.add(
      this.bus.formsReset$.subscribe(({ includeInputs }) => this.resetFormsAfterRun(!!includeInputs))
    );

    this.actionsNodes = this.model?.['actionsNodes'];
  }

  ngDoCheck(): void {
    const currentRef = this.model;
    const currentKey = this.resolveActionKey();

    const m = this.model || {};
    const d = m?.['data'] || {};
    const flagsKey = `${d?.__missingIn ? 1 : 0}-${d?.__missingOut ? 1 : 0}`;
    const portsKey = this.computePortsKey();
    if (
      currentRef !== this.lastModelRef ||
      currentKey !== this.lastModelKey
    ) {
      this.portsOverride = null;
      this.tryBuildFromModel();
    }

    if (flagsKey !== this.lastFlagsKey) {
      this.lastFlagsKey = flagsKey;
      this.markForCheck();
    }

    if (portsKey !== this.lastPortsKey) {
      this.lastPortsKey = portsKey;
      this.connectorsUpdated?.emit();
      this.markForCheck();
    }

    this.lastModelRef = currentRef;
    this.lastModelKey = currentKey;
  }

  ngOnDestroy(): void {
    this.subs.unsubscribe();
  }

  openQuickAdd(p: { id: string; type?: string }, ev: MouseEvent) {
    ev.stopPropagation();
    const anchorEl = (ev.currentTarget as HTMLElement) ?? (ev.target as HTMLElement);
    this.bus.openQuickAdd$.next({
      nodeId: this.nodeId,
      portId: p.id,
      portType: p?.type,
      anchorEl,
    });
  }

  private wireFormToCanvas(form: FormGroup | null) {
    this.emitFormStatus(form);
    if (!form) return;
    if (this.hookedForms.has(form)) return;
    this.hookedForms.add(form);
    this.subs.add(
      form.statusChanges.subscribe(() => this.emitFormStatus(form))
    );
  }

  private emitFormStatus(form: FormGroup | null) {
    if (!form) {
      this.bus.nodeFormStatus$.next({ nodeId: this.nodeId, invalid: false, invalidFields: [] });
      return;
    }

    const invalidFields = Object.entries(form.controls)
      .filter(([, c]) => c.invalid)
      .map(([name]) => name);

    this.bus.nodeFormStatus$.next({
      nodeId: this.nodeId,
      invalid: form.invalid,
      invalidFields,
    });
  }

  private ensureFormControls(form: FormGroup, config: FieldConfig[]) {
    if (!form) return;
    for (const field of config ?? []) {
      if (form.get(field.name)) continue;
      if (field.type === 'group') {
        const group = this.fb.group({});
        (field.children ?? []).forEach(ch => group.addControl(ch.name, this.createControl(ch)));
        form.addControl(field.name, group);
        continue;
      }
      if (field.type === 'array') {
        const arr = new FormArray<FormGroup>([]);
        if (field.children?.length) {
          const g = this.fb.group({});
          field.children.forEach(ch => g.addControl(ch.name, this.createControl(ch)));
          arr.push(g);
        }
        form.addControl(field.name, arr);
        continue;
      }
      form.addControl(field.name, this.createControl(field));
    }
  }

  private createControl(field: FieldConfig): FormControl {
    const validators = buildValidators(field);
    switch (field.type) {
      case 'toggle':
        return new FormControl(
          { value: field.defaultValue ? !!field.defaultValue : false, disabled: !!field.disabled },
          { nonNullable: true, validators }
        );
      case 'range':
        return new FormControl(
          {
            value:
              field.defaultValue && field.defaultValue != null
                ? Number(field.defaultValue)
                : (field.min ?? 0),
            disabled: !!field.disabled,
          },
          { validators }
        );
      case 'datepicker':
        return new FormControl({ value: null, disabled: !!field.disabled }, { validators });
      case 'chips':
      case 'dropdown': {
        const multiple = field.multiple === true;
        const { single, multi } = this.normalizeSelectDefault(field);
        if (multiple) {
          return new FormControl({ value: multi, disabled: !!field.disabled }, { validators });
        }
        return new FormControl({ value: single, disabled: !!field.disabled }, { validators });
      }
      case 'file': {
        const multiple = field.multiple === true;
        if (multiple) {
          return new FormControl(
            { value: Array.isArray(field.defaultValue) ? field.defaultValue : [], disabled: !!field.disabled },
            { validators }
          );
        }
        const initial =
          typeof field.defaultValue === 'string'
            ? field.defaultValue
            : field.defaultValue instanceof File
              ? field.defaultValue
              : null;
        return new FormControl({ value: initial, disabled: !!field.disabled }, { validators });
      }
      default:
        return new FormControl(
          { value: field.defaultValue?.toString() ?? '', disabled: !!field.disabled },
          { nonNullable: true, validators }
        );
    }
  }

  private normalizeSelectDefault(field: FieldConfig): { single: unknown | null; multi: unknown[] } {
    const multiple = field.multiple === true;
    const opts = field.options;
    if (multiple) {
      const raws = this.asArray(field.defaultValue);
      if (!raws.length) return { single: null, multi: [] };
      const values = raws
        .map(r => this.findOptionByValue(opts, r))
        .filter(v => v != null);
      return { single: null, multi: values };
    }
    const raw = field.defaultValue;
    if (raw == null || raw === '') return { single: null, multi: [] };
    const value = this.findOptionByValue(opts, raw);
    return { single: value ?? null, multi: [] };
  }

  private findOptionByValue(opts: FieldConfig['options'], raw: unknown) {
    if (!opts?.length) return raw;
    const hit = opts.find(o => this.eq(o.value, raw) || this.eq(o.label, raw));
    return hit ? hit.value : raw;
  }

  private asArray(v: unknown): unknown[] {
    if (v == null) return [];
    if (Array.isArray(v)) return v;
    if (v instanceof Set) return Array.from(v);
    if (typeof v === 'string') {
      return v.split(',').map(s => s.trim());
    }
    return [v];
  }

  private eq(a: unknown, b: unknown): boolean {
    if (a === b) return true;
    if (
      (typeof a === 'string' || typeof a === 'number') &&
      (typeof b === 'string' || typeof b === 'number')
    ) {
      return Number(a) == Number(b);
    }
    if (a && b && typeof a === 'object' && typeof b === 'object') {
      const av = this.valueOrId(a);
      const bv = this.valueOrId(b);
      return av === bv;
    }
    return false;
  }

  private valueOrId(v: unknown): unknown {
    if (!v || typeof v !== 'object') return v;
    const rec = v as Record<string, unknown>;
    if ('value' in rec) return rec['value'];
    if ('id' in rec) return rec['id'];
    return v;
  }

  private currentForm(): FormGroup {
    return this.visualType() === 'input' ? this.formInputs : this.form;
  }
  private currentConfig(): FieldConfig[] {
    return this.visualType() === 'input' ? this.configInputs : this.config;
  }

  hasInvalidParams(): boolean {
    const f = this.currentForm();
    return this.formFlags.invalid || (!!f && f.invalid);
  }

  hasPortIssues(): boolean {
    return this.missingInPortsSig().size > 0 || this.missingOutPortsSig().size > 0;
  }

  validationTooltip(): string {
    const parts: string[] = [];
    const missingIn = this.missingPortLabels('in');
    const missingOut = this.missingPortLabels('out');
    const invalidFields = this.getInvalidFieldLabels();

    if (missingIn.length) {
      parts.push(`${this.translate.instant('workflow.validation.missing_inputs')}: ${missingIn.join(', ')}`);
    }
    if (missingOut.length) {
      parts.push(`${this.translate.instant('workflow.validation.missing_outputs')}: ${missingOut.join(', ')}`);
    }
    if (invalidFields.length) {
      parts.push(`${this.translate.instant('workflow.validation.invalid_fields')}: ${invalidFields.join(', ')}`);
    }

    return parts.join('\n');
  }

  isPortMissing(p: WorkflowPorts['inputs'][number], side: 'in' | 'out'): boolean {
    if (p.required !== true) return false;
    const set = side === 'in' ? this.missingInPortsSig() : this.missingOutPortsSig();
    return set.has(p.id);
  }

  isPortConnected(p: WorkflowPorts['inputs'][number], side: 'in' | 'out'): boolean {
    return p.required === true && !this.isPortMissing(p, side);
  }

  portCount(): number {
    const ins = this.inPorts()?.length ?? 0;
    const outs = this.outPorts()?.length ?? 0;
    return Math.max(1, ins, outs);
  }

  onNodeClick(ev: MouseEvent): void {
    if (Date.now() < this.suppressClickUntil) return;
    const target = ev.target as HTMLElement;
    if (this.labelEditing || target.closest('.label-editor')) return;
    if (target.closest('button') || target.closest('.ports')) return;
    this.openDetailsDialog();
  }

  onPointerDown(ev: PointerEvent): void {
    if (ev.button !== 0) return;
    this.pointerDownAt = { x: ev.clientX, y: ev.clientY };
    this.dragDetected = false;
  }

  onPointerMove(ev: PointerEvent): void {
    if (!this.pointerDownAt || this.dragDetected) return;
    const dx = ev.clientX - this.pointerDownAt.x;
    const dy = ev.clientY - this.pointerDownAt.y;
    if (Math.hypot(dx, dy) > 4) {
      this.dragDetected = true;
      this.suppressClickUntil = Date.now() + 250;
    }
  }

  onPointerUp(): void {
    if (this.dragDetected) {
      this.suppressClickUntil = Date.now() + 250;
    }
    this.pointerDownAt = null;
    this.dragDetected = false;
  }

  onPointerLeave(): void {
    this.pointerDownAt = null;
    this.dragDetected = false;
  }

  onNodeKeydown(ev: KeyboardEvent): void {
    if (ev.key === 'Enter' || ev.key === ' ') {
      ev.preventDefault();
      this.onNodeClick(ev as unknown as MouseEvent);
    }
  }

  startLabelEdit(ev: MouseEvent): void {
    ev.stopPropagation();
    const current = (this.safeModel.label ?? this.displayLabel() ?? '').toString();
    this.labelEditBackup = current;
    this.labelInlineConfig = [
      this.fields.getTextField({
        name: 'label',
        label: 'workflow.dialog.node_name',
        placeholder: 'workflow.dialog.node_name',
        required: true,
        validators: [Validators.required, Validators.minLength(2), Validators.maxLength(60)],
        errorMessages: {
          required: 'form.errors.input.required',
          minlength: 'form.errors.input.minlength',
          maxlength: 'form.errors.input.maxlength',
        },
        layoutClass: 'primary',
        color: 'primary',
        defaultValue: current,
      }),
    ];
    this.labelInlineForm.reset({}, { emitEvent: false });
    queueMicrotask(() => {
      if (this.labelInlineForm.get('label')) {
        this.labelInlineForm.patchValue({ label: current }, { emitEvent: false });
      }
    });
    if (!this.labelInlineValueChangesHooked) {
      this.labelInlineValueChangesHooked = true;
      this.subs.add(
        this.labelInlineForm.valueChanges
          .pipe(debounceTime(150), distinctUntilChanged((a, b) => (a?.['label'] ?? '') === (b?.['label'] ?? '')))
          .subscribe(value => {
            if (!this.labelEditing) return;
            const next = (value?.['label'] ?? '').toString();
            if (!next.trim()) return;
            this.bus.nodeLabelChanged$.next({ nodeId: this.nodeId, label: next });
          })
      );
    }
    this.labelEditing = true;
    queueMicrotask(() => {
      const host = this.labelEditHost?.nativeElement;
      const input = host?.querySelector('input,textarea') as HTMLInputElement | null;
      input?.focus();
      input?.select();
    });
  }

  onLabelTriggerKeydown(ev: KeyboardEvent): void {
    if (this.labelEditing) return;
    if (ev.key === 'Enter' || ev.key === ' ') {
      ev.preventDefault();
      this.startLabelEdit(ev as unknown as MouseEvent);
    }
  }

  commitLabelEdit(): void {
    if (this.labelInlineForm.invalid) {
      this.labelInlineForm.markAllAsTouched();
      return;
    }
    const raw = this.labelInlineForm.get('label')?.value;
    const next = (raw ?? '').toString().trim();
    this.labelEditing = false;
    const current = (this.safeModel.label ?? '').toString();
    if (next === current) return;
    this.bus.nodeLabelChanged$.next({ nodeId: this.nodeId, label: next || this.displayLabel() });
  }

  cancelLabelEdit(): void {
    this.labelEditing = false;
    if (this.labelEditBackup) {
      this.labelInlineForm.patchValue({ label: this.labelEditBackup }, { emitEvent: false });
    }
  }

  onLabelKeydown(ev: KeyboardEvent): void {
    ev.stopPropagation();
    if (ev.key === 'Enter') {
      ev.preventDefault();
      this.commitLabelEdit();
    } else if (ev.key === 'Escape') {
      ev.preventDefault();
      this.cancelLabelEdit();
    }
  }

  getInvalidFieldLabels(): string[] {
    const form = this.currentForm();
    if (!form) return [];

    const cfg = this.currentConfig();
    const labelsByName = new Map(cfg.map(f => [f.name, f.label]));

    return Object.entries(form.controls)
      .filter(([, c]) => c.invalid)
      .map(([name]) => this.translate.instant(labelsByName.get(name) ?? name));
  }

  openDetailsDialog(): void {
    const dialogData: NodeDetailsDialogData = {
      nodeId: this.nodeId,
      label: this.safeModel.label ?? this.displayLabel(),
      icon: this.getIcon(),
      status: this.statusSig(),
      pinned: this.isPinned(),
      disabled: this.isDisabled(),
      ports: { inputs: this.inPorts(), outputs: this.outPorts() },
      form: this.currentForm(),
      config: this.currentConfig(),
      portTypeOptions: this.portTypeOptionsSig(),
    };

    this.dialog.open(NodeDetailsDialogComponent, {
      data: dialogData,
      width: '90vw',
      maxWidth: '90vw',
      height: '90vh',
      maxHeight: '90vh',
      panelClass: 'wf-node-dialog',
      autoFocus: false,
    });
  }

  private coerceModel(raw: unknown): RunNodeDTO {
    const rawObj = isObject(raw) ? raw : {};
    const dataObj = isObject(rawObj['data']) ? (rawObj['data'] as Record<string, unknown>) : rawObj;
    const type = (dataObj['type'] ?? dataObj['aiType'] ?? rawObj['type'] ?? 'input') as PaletteType;
    const ports = (dataObj['ports'] as WorkflowPorts | undefined) ?? (rawObj['ports'] as WorkflowPorts | undefined);
    const params = (dataObj['params'] as WorkflowNodeDataBaseParams | undefined)
      ?? (rawObj['params'] as WorkflowNodeDataBaseParams | undefined);
    const aiType = (dataObj['aiType'] as RunNodeDTO['aiType']) ?? (rawObj['aiType'] as RunNodeDTO['aiType']);
    const label = (dataObj['label'] as string | undefined) ?? (rawObj['label'] as string | undefined);
    const position = (dataObj['position'] as { x?: number; y?: number } | undefined)
      ?? (rawObj['position'] as { x?: number; y?: number } | undefined);
    const actionsNodes = (dataObj['actionsNodes'] as Record<string, ActionFormSpec> | undefined)
      ?? (rawObj['actionsNodes'] as Record<string, ActionFormSpec> | undefined);
    return { type, ports, params, aiType, label, position, actionsNodes };
  }

  private computePortsKey(): string {
    const ins = this.inPorts() ?? [];
    const outs = this.outPorts() ?? [];
    const norm = (p: WorkflowPorts['inputs'][number]) => `${p.id}:${p.label}:${p.type ?? ''}:${p.required === true ? 1 : 0}`;
    return `${ins.map(norm).join('|')}__${outs.map(norm).join('|')}`;
  }

  visualType(): PaletteType | undefined {
    return this.safeModel.type;
  }

  displayLabel(): string {
    if (this.safeModel.label) return this.safeModel.label;
    const t = (this.safeModel.type ?? '').toLowerCase();
    if (t === 'input' || t === 'result') return "";
    return t;
  }

  getIcon(): string | null {
    const data = this.safeModel;
    return data?.params?.icon ?? null;
  }

  inPorts(): WorkflowPorts['inputs'] {
    return this.activePorts().inputs ?? [];
  }

  outPorts(): WorkflowPorts['outputs'] {
    return this.activePorts().outputs ?? [];
  }

  hasMissingIn(): boolean {
    return this.missingInSig();
  }

  hasMissingOut(): boolean {
    return this.missingOutSig();
  }

  private activePorts(): WorkflowPorts {
    return this.portsOverride ?? this.safeModel.ports ?? { inputs: [], outputs: [] };
  }

  private missingPortLabels(side: 'in' | 'out'): string[] {
    const set = side === 'in' ? this.missingInPortsSig() : this.missingOutPortsSig();
    const ports = side === 'in' ? this.inPorts() : this.outPorts();
    return ports.filter(p => set.has(p.id)).map(p => p.label || p.id);
  }

  isDisabled(): boolean {
    return this.disabledSig();
  }

  isPinned(): boolean {
    return this.pinnedSig();
  }

  runDisabled(): boolean {
    const graphInvalid = !this.graphValidSig();
    const anyMissing = this.hasMissingIn() || this.hasMissingOut();
    return graphInvalid || anyMissing || this.isDisabled();
  }

  private tryBuildFromModel(): void {
    const vt = this.visualType();
    if (vt === 'result') {
      this.config = [];
      this.wireFormToCanvas(null);
      this.lastModelRef = this.model;
      this.lastModelKey = '';
      return;
    } else if (vt === 'input') {
      this.disabledSig.set(!!this.safeModel.params?.['__disabled']);
      this.pinnedSig.set(!!this.safeModel.params?.['__pinned']);
      this.configInputs = [
        this.fields.getFileField({
          name: 'files',
          label: 'form.labels.files',
          multiple: true,
          accept: '.pdf,.docx,image/*',
          required: false,
          fileVariant: 'dropzone',
          validators: undefined,
          errorMessages: { required: "files are mandatory" }
        }),
        /*  this.fields.getDropdownField({
           name: 'workflows',
           label: 'Based on workflow',
           placeholder: 'form.placeholders.role',
           options: [
             { label: 'WF1', value: 'WF1' },
             { label: 'WF2', value: 'WF2' },
           ],
           multiple: false,
           required: false,
           color: "primary",
           layoutClass: "primary",
           validators: undefined
         }),
         this.fields.getToggleField({
           name: 'file_mandatory',
           label: 'Files mandatory',
           helperText: undefined,
           required: false,
           validators: undefined,
           color: "primary",
           layoutClass: "primary",
         }), */
      ];

      this.ensureFormControls(this.formInputs, this.configInputs);
      this.formInputs.reset({}, { emitEvent: false });
      this.formInputs.updateValueAndValidity({ emitEvent: false });
      queueMicrotask(() => {
        const payload = this.stripReserved(this.formInputs.getRawValue());
        this.bus.nodeParamsChanged$.next({ nodeId: this.nodeId, params: payload });
      });

      if (!this.inputValueChangesHooked) {
        this.inputValueChangesHooked = true;
        this.subs.add(
          this.formInputs.valueChanges
            .pipe(
              debounceTime(150),
              distinctUntilChanged((a, b) => this.valuesEqual(a, b))
            )
            .subscribe(params => {
              if (!params || typeof params !== 'object') return;
              const payload = this.stripReserved(params);
              this.bus.nodeParamsChanged$.next({ nodeId: this.nodeId, params: payload });
            })
        );
      }
      this.wireFormToCanvas(this.formInputs);

      this.lastModelRef = this.model;
      this.lastModelKey = '';
      return;
    }

    const key = this.resolveActionKey();
    this.lastModelRef = this.model;
    this.lastModelKey = key;

    this.disabledSig.set(!!this.safeModel.params?.['__disabled']);
    this.pinnedSig.set(!!this.safeModel.params?.['__pinned']);

    const spec = this.actionsNodes?.[key];
    if (!spec) {
      this.config = makeFallback(this.fields);
    } else {
      const built = spec.make(this.fields);
      this.config = (built ?? []).filter(Boolean) as FieldConfig[];
      if (!this.config.length) {
        this.config = makeFallback(this.fields);
      }
    }

    this.ensureFormControls(this.form, this.config);

    const dataAny = (this.safeModel?.params ?? {}) as WorkflowNodeDataBaseParams;
    const defaults = spec?.defaults ?? {};
    const RESERVED = new Set(['ui', '__missingIn', '__missingOut']);
    const current = Object.fromEntries(
      Object.entries(dataAny).filter(([k]) => !RESERVED.has(k))
    );
    const initial = { ...defaults, ...current };

    this.form.reset({}, { emitEvent: false });

    if (Object.keys(initial).length) {
      this.form.patchValue(initial, { emitEvent: false });

      const payload = this.stripReserved(initial);
      const currentParams = (this.safeModel?.params ?? {});
      if (!this.valuesEqual(currentParams, payload)) {
        this.bus.nodeParamsChanged$.next({ nodeId: this.nodeId, params: payload });
      }
    }
    this.form.updateValueAndValidity({ emitEvent: false });

    if (!this.valueChangesHooked) {
      this.valueChangesHooked = true;
      this.subs.add(
        this.form.valueChanges
          .pipe(
            debounceTime(150),
            distinctUntilChanged((prev, curr) => this.valuesEqual(prev, curr))
          )
          .subscribe(params => {
            if (!params || typeof params !== 'object') return;
            const payload = this.stripReserved(params);
            this.bus.nodeParamsChanged$.next({ nodeId: this.nodeId, params: payload });
          })
      );
    }
    this.wireFormToCanvas(this.form);

    this.markForCheck();
  }

  private resetFormsAfterRun(includeInputs: boolean) {
    const vt = this.visualType();

    if (vt === 'result') return;

    const targetForm = vt === 'input' ? this.formInputs : this.form;

    if (vt === 'input' && !includeInputs) return;
    targetForm.reset({}, { emitEvent: false });
    targetForm.markAsPristine();
    targetForm.markAsUntouched();
    targetForm.updateValueAndValidity({ emitEvent: false });
    this.wireFormToCanvas(targetForm);

    this.bus.nodeParamsChanged$.next({ nodeId: this.nodeId, params: {} });

    this.markForCheck();
  }

  private resolveActionKey(): string {
    const data = this.safeModel;
    const keyRaw = data.aiType ?? this.safeModel.type ?? '';
    return this.normalizeActionKey(keyRaw);
  }

  private normalizeActionKey(x: unknown): string {
    let k = (x ?? '').toString().trim();
    k = k.replace(/[\s_]+/g, '-');
    k = k.replace(/([a-z0-9])([A-Z])/g, '$1-$2');
    k = k.replace(/-+/g, '-').toLowerCase();
    return k;
  }

  runSchedule(): void {
    if (this.isDisabled()) return;
    this.bus.runRequested$.next({ nodeId: this.nodeId });
  }

  runFromHere(): void {
    if (this.isDisabled()) return;
    this.bus.runFromNode$.next({ nodeId: this.nodeId });
  }

  togglePin(): void {
    const next = !this.isPinned();
    this.pinnedSig.set(next);
    this.patchParams({ __pinned: next });
  }

  toggleDisable(): void {
    const next = !this.isDisabled();
    this.disabledSig.set(next);
    this.patchParams({ __disabled: next });
  }

  replaceNode(ev: MouseEvent): void {
    ev.stopPropagation();
    const out = this.outPorts()?.[0] ?? this.inPorts()?.[0];
    if (!out) return;
    const anchorEl = (ev.currentTarget as HTMLElement) ?? (ev.target as HTMLElement);
    this.bus.openQuickAdd$.next({
      nodeId: this.nodeId,
      portId: out.id,
      portType: out.type,
      anchorEl,
      replaceMode: true,
    });
  }

  displayRUnsPanel(ev?: MouseEvent): void {
    ev?.stopPropagation();
    this.bus.toggleRunPanel$.next({ anchorNodeId: this.nodeId });
  }

  private isLikeFile(v: unknown): v is File {
    if (!isObject(v)) return false;

    if (!hasProp(v, 'slice') || typeof v?.['slice'] !== 'function') return false;
    if (!hasProp(v, 'size') || typeof v?.['size'] !== 'number') return false;
    if (!hasProp(v, 'type') || typeof v?.['type'] !== 'string') return false;
    if (!hasProp(v, 'name') || typeof v?.['name'] !== 'string') return false;

    return true;
  }

  private isLikeBlob(v: unknown): v is Blob {
    if (!isObject(v)) return false;

    if (!hasProp(v, 'slice') || typeof v?.['slice'] !== 'function') return false;
    if (!hasProp(v, 'size') || typeof v?.['size'] !== 'number') return false;
    if (!hasProp(v, 'type') || typeof v?.['type'] !== 'string') return false;

    if (hasProp(v, 'name') && typeof v?.['name'] === 'string') return false;

    return true;
  }

  private normalizeForCompare<T>(v: T): ReplaceBinary<T> {
    if (this.isLikeFile(v)) {
      const f = v as unknown as File;
      return { __file: true, name: f.name, size: f.size, type: f.type } as ReplaceBinary<T>;
    }
    if (this.isLikeBlob(v)) {
      const b = v as unknown as Blob;
      return { __blob: true, size: b.size, type: b.type } as ReplaceBinary<T>;
    }
    if (Array.isArray(v)) {
      return (v as unknown[]).map(x => this.normalizeForCompare(x)) as ReplaceBinary<T>;
    }
    if (v !== null && typeof v === 'object') {
      const out: Record<string, unknown> = {};
      for (const k of Object.keys(v as Record<string, unknown>)) {
        out[k] = this.normalizeForCompare((v as Record<string, unknown>)[k]);
      }
      return out as ReplaceBinary<T>;
    }
    return v as ReplaceBinary<T>;
  }

  private valuesEqual<T>(a: T, b: T): boolean {
    return JSON.stringify(this.normalizeForCompare(a)) === JSON.stringify(this.normalizeForCompare(b));
  }

  private stripReserved<T>(obj: T): StripReservedShallow<T> {
    if (obj === null || typeof obj !== 'object') {
      return obj as StripReservedShallow<T>;
    }
    const RESERVED_SET: ReadonlySet<ReservedKeys> = new Set(RESERVED_KEYS);

    const entries = Object
      .entries(obj as Record<string, unknown>)
      .filter(([k]) => !RESERVED_SET.has(k as ReservedKeys));

    return Object.fromEntries(entries) as StripReservedShallow<T>;
  }

  closePanel() {
    this.bus.onNodeDelete$.next({
      nodeId: this.nodeId
    });
  }

  deleteNode(ev: MouseEvent): void {
    ev.stopPropagation();
    this.bus.onNodeDelete$.next({ nodeId: this.nodeId });
  }

  statusClass(): string {
    const s = this.statusSig();
    if (!s) return '';
    return s;
  }

  private patchParams(params: Record<string, unknown>): void {
    const prev = this.safeModel.params ?? {};
    const merged = { ...prev, ...params } as WorkflowNodeDataBaseParams;
    this.bus.nodeParamsChanged$.next({ nodeId: this.nodeId, params: merged });
  }
}

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
    .dialog-title { display:flex; align-items:center; gap:8px; padding: 15px;}
    .title-form { flex: 1; }
    .dialog-content { padding: 8px 16px 16px; box-sizing: border-box; }
    .badges { display:flex; gap:6px; margin-bottom:8px; }
    .badge { padding:3px 8px; border-radius:12px; font-size:12px; background: color-mix(in srgb, var(--mat-neutral) 25%, #fff); }
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
    :host ::ng-deep .mat-mdc-dialog-container .mat-mdc-dialog-surface { height: 100%; display: flex; flex-direction: column; }
    :host ::ng-deep .mat-mdc-dialog-content { flex: 1; display: flex; flex-direction: column; min-height: 0; }
    :host ::ng-deep .mat-mdc-dialog-actions { margin-top: auto; }
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
        { value: 'query_string', label: 'workflow.dialog.port_type_options.query_string' },
        { value: 'embeddings', label: 'workflow.dialog.port_type_options.embeddings' },
        { value: 'json', label: 'workflow.dialog.port_type_options.json' },
        { value: 'collection', label: 'workflow.dialog.port_type_options.collection' },
        { value: 'string', label: 'workflow.dialog.port_type_options.string' },
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
      required: [port.required === true],
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
        options: this.portTypeOptions.map(o => ({ label: o.label, value: o.value })),
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
