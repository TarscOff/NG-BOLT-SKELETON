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
import { FormArray, FormBuilder, FormControl, FormGroup, ReactiveFormsModule, FormsModule, Validators } from '@angular/forms';
import { FieldConfigService } from '@cadai/pxs-ng-core/services';
import { WfCanvasBus } from '../../templates/utils/wf-canvas-bus';
import { ActionFormSpec } from '../../templates/utils/action-forms';
import { debounceTime, distinctUntilChanged, Subscription } from 'rxjs';
import { DynamicFormComponent } from '@cadai/pxs-ng-core/shared';
import { FieldConfig } from '@cadai/pxs-ng-core/interfaces';
import { MatTooltipModule } from '@angular/material/tooltip';
import { MatDialog, MatDialogModule } from '@angular/material/dialog';
import type { ReplaceBinary, ReservedKeys, StripReservedShallow, ActionDefinitionLite } from '../../templates/utils/workflow.interface';
import { Store } from '@ngrx/store';
import { AppSelectors } from '@cadai/pxs-ng-core/store';
import { CommonModule } from '@angular/common';
import { PortTypeOption, WorkflowsStore } from '../../data/workflows.store';
import { buildValidators } from '@cadai/pxs-ng-core/utils';
import { NodeDetailsDialogComponent, NodeDetailsDialogData } from './node-details-dialog/node-details-dialog.component';

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
/**
 * Component representing a workflow action node in the canvas.
 * Handles node rendering, form management, validation, user interactions,
 * and integration with the workflow canvas bus for real-time updates.
 */
export class WfNodeComponent extends DrawFlowBaseNode implements OnDestroy, OnInit, DoCheck {
  // Injected services
  private readonly bus = inject(WfCanvasBus);
  private readonly fb = inject(FormBuilder);
  private readonly fields = inject(FieldConfigService);
  private readonly dialog = inject(MatDialog);
  private readonly translate = inject(TranslateService);
  private readonly store = inject(Store);
  private readonly workflowsStore = inject(WorkflowsStore);

  // Inputs
  /** @Input Configuration for action nodes used to build forms */
  @Input({ required: true }) actionsNodes!: Record<string, ActionFormSpec>;

  // ViewChild
  @ViewChild('labelEditHost') private labelEditHost?: ElementRef<HTMLElement>;

  // Public properties
  public readonly positions = DfConnectorPosition;
  public labelEditing = false;

  // Private properties
  private readonly subs = new Subscription();
  private valueChangesHooked = false;
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
  private labelEditBackup = '';

  private formFlags = { invalid: false };

  // Signals
  private readonly graphValidSig = signal<boolean>(false);
  private readonly statusSig = signal<Status | null>(null);
  private readonly missingInSig = signal<boolean>(false);
  private readonly missingOutSig = signal<boolean>(false);
  private readonly missingInPortsSig = signal<Set<string>>(new Set());
  private readonly missingOutPortsSig = signal<Set<string>>(new Set());
  private readonly disabledSig = signal<boolean>(false);
  readonly pinnedSig = signal<boolean>(false);
  private readonly portTypeOptionsSig: Signal<PortTypeOption[]> = toSignal(this.workflowsStore.portTypes$, { initialValue: [] });
  private readonly catalogSig = toSignal(this.workflowsStore.catalog$, { initialValue: [] as ActionDefinitionLite[] });
  public readonly isDark: Signal<boolean> = toSignal(this.store.select(AppSelectors.ThemeSelectors.selectIsDark), { initialValue: false });

  // Forms and configs
  public form: FormGroup = this.fb.group({});
  public config: FieldConfig[] = [];
  public formInputs: FormGroup = this.fb.group({});
  public configInputs: FieldConfig[] = [];
  public labelInlineForm: FormGroup = this.fb.group({});
  public labelInlineConfig: FieldConfig[] = [];

  // Getters
  private get safeModel(): RunNodeDTO {
    return this.coerceModel(this.model);
  }

  /**
   * Lifecycle hook: Initializes the component, sets up subscriptions to the canvas bus
   * for graph validation, node connectivity, port status, and other real-time updates.
   */
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
        console.debug('[WfNode] nodeConnectivity:', { nodeId, missingIn, missingOut, changed });
        if (changed) {
          this.missingInSig.set(!!missingIn);
          this.missingOutSig.set(!!missingOut);
          this.markForCheck();
          console.debug('[WfNode] signals updated:', { missingIn: this.missingInSig(), missingOut: this.missingOutSig() });
        }
      })
    );

    this.subs.add(
      this.bus.nodePortStatus$.subscribe(({ nodeId, missingInputs, missingOutputs }) => {
        if (nodeId !== this.nodeId) return;
        console.debug('[WfNode] nodePortStatus:', { nodeId, missingInputs, missingOutputs });
        this.missingInPortsSig.set(new Set(missingInputs));
        this.missingOutPortsSig.set(new Set(missingOutputs));
        this.markForCheck();
        console.debug('[WfNode] missing ports updated:', { in: Array.from(this.missingInPortsSig()), out: Array.from(this.missingOutPortsSig()) });
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

    this.actionsNodes = this.model?.['actionsNodes'];
  }

  /**
   * Lifecycle hook: Performs change detection checks, rebuilds forms when model changes,
   * and updates flags and ports keys for efficient re-rendering.
   */
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

  /**
   * Lifecycle hook: Cleans up subscriptions when the component is destroyed.
   */
  ngOnDestroy(): void {
    this.subs.unsubscribe();
  }

  /**
   * Opens the quick add menu for a port.
   * @param p Port information
   * @param ev Mouse event
   */
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

  private normalizeInitialValuesForConfig(
    values: Record<string, unknown>,
    config: FieldConfig[]
  ): Record<string, unknown> {
    const normalized: Record<string, unknown> = { ...values };

    for (const field of config ?? []) {
      if (!Object.prototype.hasOwnProperty.call(normalized, field.name)) continue;
      normalized[field.name] = this.normalizeFieldValueForPatch(field, normalized[field.name]);
    }

    return normalized;
  }

  private normalizeFieldValueForPatch(field: FieldConfig, value: unknown): unknown {
    switch (field.type) {
      case 'toggle':
        return !!value;
      case 'range': {
        if (value === null || value === undefined || value === '') {
          if (typeof field.defaultValue === 'number') return field.defaultValue;
          if (typeof field.defaultValue === 'string') {
            const parsedDefault = Number(field.defaultValue);
            if (Number.isFinite(parsedDefault)) return parsedDefault;
          }
          return field.min ?? 0;
        }
        const parsed = Number(value);
        return Number.isFinite(parsed) ? parsed : (field.min ?? 0);
      }
      case 'dropdown':
      case 'chips':
        return field.multiple === true ? this.asArray(value) : (value ?? null);
      case 'file':
        return field.multiple === true ? this.asArray(value) : (value ?? null);
      case 'group': {
        const groupValue = isObject(value) && !Array.isArray(value)
          ? (value as Record<string, unknown>)
          : {};
        return this.normalizeInitialValuesForConfig(groupValue, field.children ?? []);
      }
      case 'array': {
        const list = Array.isArray(value) ? value : [];
        if (!field.children?.length) return list;
        return list.map(item =>
          this.normalizeInitialValuesForConfig(
            isObject(item) && !Array.isArray(item)
              ? (item as Record<string, unknown>)
              : {},
            field.children ?? []
          )
        );
      }
      default:
        if (this.isTextLikeFieldType(field.type)) {
          return value === null || value === undefined ? '' : String(value);
        }
        return value;
    }
  }

  private isTextLikeFieldType(type: string | undefined): boolean {
    return ['text', 'email', 'phone', 'password', 'textarea', 'autocomplete'].includes((type ?? '').toLowerCase());
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
    return this.form;
  }
  private currentConfig(): FieldConfig[] {
    return this.config;
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

  /**
   * Handles node click events, opens details dialog if not suppressed.
   * @param ev Mouse event
   */
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

  /**
   * Opens the node details dialog with current node information.
   */
  openDetailsDialog(): void {
    const dialogData: NodeDetailsDialogData = {
      nodeId: this.nodeId,
      label: this.safeModel.label ?? this.displayLabel(),
      icon: this.getIcon(),
      status: this.statusSig(),
      pinned: this.isPinned(),
      disabled: this.isDisabled(),
      // compute effective ports merging model, extensions and library defaults
      ports: this.computeDialogPorts(),
      form: this.currentForm(),
      config: this.currentConfig(),
      portTypeOptions: this.portTypeOptionsSig(),
    };

    this.dialog.open(NodeDetailsDialogComponent, {
      data: dialogData,
      width: '100vw',
      maxWidth: '100vw',
      height: '100vh',
      maxHeight: '100vh',
      panelClass: ['wf-node-dialog', 'full-window-dialog', 'action-node-dialog'],
      autoFocus: false,
    });
  }

  /**
   * Coerces the raw model data into a structured RunNodeDTO.
   * @param raw Raw model data
   * @returns Structured node data
   */
  private coerceModel(raw: unknown): RunNodeDTO {
    const rawObj = isObject(raw) ? raw : {};
    const dataObj = isObject(rawObj['data']) ? (rawObj['data'] as Record<string, unknown>) : rawObj;
    const type = (dataObj['type'] ?? dataObj['aiType'] ?? rawObj['type']) as PaletteType;
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

  displayLabel(): string {
    if (this.safeModel.label) return this.safeModel.label;
    const t = (this.safeModel.type ?? '').toLowerCase();
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

  private computeDialogPorts(): WorkflowPorts {
    // If portsOverride exists (from previous dialog changes), use it directly
    if (this.portsOverride) {
      return this.portsOverride;
    }
    
    const original = (this.model as Record<string, unknown> | null) ?? null;
    const base: WorkflowPorts = this.safeModel.ports ?? { inputs: [], outputs: [] };

    type PortMapValue = { required?: boolean; readonly?: boolean } | boolean;

    const asRecord = (v: unknown) => {
      if (!v || typeof v !== 'object' || Array.isArray(v)) return undefined;
      return v as Record<string, unknown>;
    };

    const asWorkflowPorts = (v: unknown) => {
      const r = asRecord(v);
      if (!r) return undefined;
      const ins = r['inputs'];
      const outs = r['outputs'];
      if (Array.isArray(ins) && Array.isArray(outs)) {
        return { inputs: ins as WorkflowPorts['inputs'], outputs: outs as WorkflowPorts['outputs'] };
      }
      return undefined;
    };

    const collectCandidates = (): (WorkflowPorts | Record<string, unknown>)[] => {
      const out: (WorkflowPorts | Record<string, unknown>)[] = [];
      const data = asRecord(original?.['data']);

      const maybePush = (v: unknown): void => {
        const wp = asWorkflowPorts(v);
        if (wp) { out.push(wp); return; }
        const rec = asRecord(v);
        if (rec) { out.push(rec); return; }
        return;
      };

      maybePush(asRecord(data?.['config'])?.['ports']);
      maybePush(data?.['portsConfig']);
      maybePush(data?.['ports']);
      maybePush(asRecord(original?.['config'])?.['ports']);
      maybePush(original?.['ports']);
      maybePush(asRecord(original?.['extensions'])?.['ports']);
      // actionsNodes entries may not expose `ports` in their spec type; skip pushing here

      // catalog defaults (ports or ports_map)
      try {
        const cat = this.catalogSig();
        const t = (this.safeModel.type ?? '').toString();
        if (Array.isArray(cat) && t) {
          const def = cat.find(a => ((a.type ?? '').toString() === t));
          if (def && def.params) {
            maybePush(def.params['ports']);
            maybePush(def.params['ports_map']);
          }
        }
      } catch {
        // ignore catalog failures
      }

      return out;
    };

    const findFlag = (portId: string, flag: 'required' | 'readonly'): boolean | undefined => {
      const candidates = collectCandidates();
      for (const c of candidates) {
        // array-style ports
        if (Array.isArray(c)) {
          const hit = (c as WorkflowPorts['inputs']).find(p => p.id === portId);
          if (hit) {
            const val = flag === 'required'
              ? hit.required
              : ('readonly' in hit ? (hit as { readonly?: boolean }).readonly : undefined);
            if (typeof val === 'boolean') return val;
          }
        } else {
          // map-style: portId -> metadata or boolean
          if (Object.prototype.hasOwnProperty.call(c, portId)) {
            const v = (c as Record<string, unknown>)[portId] as PortMapValue | undefined;
            if (typeof v === 'boolean' && flag === 'required') return v;
            if (v && typeof v === 'object') {
              const meta = v as { required?: unknown; readonly?: unknown };
              const maybe = flag === 'required' ? meta.required : meta.readonly;
              if (typeof maybe === 'boolean') return maybe;
            }
          }
        }
      }
      return undefined;
    };

    const mapPort = (p: WorkflowPorts['inputs'][number]) => {
      const explicitRequired = findFlag(p.id, 'required');
      const required = explicitRequired === undefined ? (p.required === true) : explicitRequired;

      // readonly can be provided by extensions map or catalog map
      const ext = asRecord(original?.['extensions']);
      const extPorts = asRecord(ext?.['ports']);
      const extReadonly = extPorts && Object.prototype.hasOwnProperty.call(extPorts, p.id)
        ? (() => {
            const v = extPorts[p.id] as Record<string, unknown> | undefined;
            return v && typeof v['readonly'] === 'boolean' ? v['readonly'] as boolean : undefined;
          })()
        : undefined;

      const explicitReadonly = extReadonly ?? findFlag(p.id, 'readonly');
      const readonly = explicitReadonly === true;

      return { ...p, required, readonly } as WorkflowPorts['inputs'][number];
    };

    return {
      inputs: (base.inputs ?? []).map(mapPort),
      outputs: (base.outputs ?? []).map(mapPort),
    };
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

  /**
   * Builds the form configuration and controls based on the current model.
   * Sets up form value change subscriptions and updates node parameters.
   */
  private tryBuildFromModel(): void {
    const key = this.resolveActionKey();
    this.lastModelRef = this.model;
    this.lastModelKey = key;

    this.disabledSig.set(!!this.safeModel.params?.['__disabled']);
    this.pinnedSig.set(!!this.safeModel.params?.['__pinned']);

    const spec = this.actionsNodes?.[key];
    if (spec) {
      const built = spec.make(this.fields);
      this.config = (built ?? []).filter(Boolean) as FieldConfig[];
    }

    this.ensureFormControls(this.form, this.config);

    const dataAny = (this.safeModel?.params ?? {}) as WorkflowNodeDataBaseParams;
    const defaults = spec?.defaults ?? {};
    const RESERVED = new Set(['ui', '__missingIn', '__missingOut']);
    const current = Object.fromEntries(
      Object.entries(dataAny).filter(([k]) => !RESERVED.has(k))
    );
    const initial = { ...defaults, ...current };
    const normalizedInitial = this.normalizeInitialValuesForConfig(initial, this.config);

    this.form.reset({}, { emitEvent: false });

    if (Object.keys(normalizedInitial).length) {
      this.form.patchValue(normalizedInitial, { emitEvent: false });

      const payload = this.stripReserved(normalizedInitial);
      const currentParams = (this.safeModel?.params ?? {}) as Record<string, unknown>;
      const comparableCurrent = this.stripReserved(
        this.normalizeInitialValuesForConfig(currentParams, this.config)
      );
      if (!this.valuesEqual(comparableCurrent, payload)) {
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

  /**
   * Schedules the node for execution.
   */
  runSchedule(): void {
    if (this.isDisabled()) return;
    this.bus.runRequested$.next({ nodeId: this.nodeId });
  }

  /**
   * Runs the workflow from this node onwards.
   */
  runFromHere(): void {
    if (this.isDisabled()) return;
    this.bus.runFromNode$.next({ nodeId: this.nodeId });
  }

  /**
   * Toggles the pinned state of the node.
   */
  togglePin(): void {
    const next = !this.isPinned();
    this.pinnedSig.set(next);
    this.patchParams({ __pinned: next });
  }

  /**
   * Toggles the disabled state of the node.
   */
  toggleDisable(): void {
    const next = !this.isDisabled();
    this.disabledSig.set(next);
    this.patchParams({ __disabled: next });
  }

  /**
   * Replaces the current node with a new one via quick add menu.
   * @param ev Mouse event
   */
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

  /**
   * Closes the panel by deleting the node.
   */
  closePanel() {
    this.bus.onNodeDelete$.next({
      nodeId: this.nodeId
    });
  }

  /**
   * Deletes the node.
   * @param ev Mouse event
   */
  deleteNode(ev: MouseEvent): void {
    ev.stopPropagation();
    this.bus.onNodeDelete$.next({ nodeId: this.nodeId });
  }

  statusClass(): string {
    const s = this.statusSig();
    if (!s) return '';
    return s;
  }

  /**
   * Gets the Material icon name based on the current node status.
   */
  getStatusIcon(): string {
    const status = this.statusSig();
    switch (status) {
      case 'queued':
        return 'schedule';
      case 'running':
        return 'hourglass_empty';
      case 'success':
        return 'check_circle';
      case 'error':
        return 'error';
      case 'skipped':
        return 'skip_next';
      default:
        return '';
    }
  }

  /**
   * Gets the tooltip text based on the current node status.
   */
  getStatusTooltip(): string {
    const status = this.statusSig();
    switch (status) {
      case 'queued':
        return 'workflow.status.queued';
      case 'running':
        return 'workflow.status.running';
      case 'success':
        return 'workflow.status.success';
      case 'error':
        return 'workflow.status.error';
      case 'skipped':
        return 'workflow.status.skipped';
      default:
        return '';
    }
  }

  /**
   * Checks if the node has an active status to display.
   */
  hasStatus(): boolean {
    return this.statusSig() !== null;
  }

  private patchParams(params: Record<string, unknown>): void {
    const prev = this.safeModel.params ?? {};
    const merged = { ...prev, ...params } as WorkflowNodeDataBaseParams;
    this.bus.nodeParamsChanged$.next({ nodeId: this.nodeId, params: merged });
  }
}
