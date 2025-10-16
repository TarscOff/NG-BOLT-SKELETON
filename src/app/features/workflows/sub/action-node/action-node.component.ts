import { Component, OnDestroy, inject, signal, OnInit, DoCheck, Input } from '@angular/core';
import {
  DfConnectorPosition,
  DfInputComponent,
  DfOutputComponent,
  DrawFlowBaseNode,
} from '@ng-draw-flow/core';
import {
  PaletteType,
  WorkflowNodeDataBase,
  WorkflowNodeDataBaseParams,
  WorkflowPorts,
} from '../utils/workflow.interface';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { TranslateModule } from '@ngx-translate/core';
import { FormBuilder, FormGroup, ReactiveFormsModule } from '@angular/forms';
import { FieldConfigService } from '@cadai/pxs-ng-core/services';
import { WfCanvasBus } from '../utils/wf-canvas-bus';
import { ActionFormSpec, makeFallback } from '../utils/action-forms';
import { debounceTime, distinctUntilChanged, map, startWith, Subscription } from 'rxjs';
import { DynamicFormComponent } from '@cadai/pxs-ng-core/shared';
import { FieldConfig } from '@cadai/pxs-ng-core/interfaces';
import { MatTooltipModule } from '@angular/material/tooltip';

@Component({
  selector: 'app-wf-node',
  standalone: true,
  imports: [
    DfInputComponent,
    DfOutputComponent,
    MatButtonModule,
    MatIconModule,
    TranslateModule,
    ReactiveFormsModule,
    DynamicFormComponent,
    MatTooltipModule
  ],
  templateUrl: "./action-node.component.html",
  styleUrls: ["./action-node.component.scss"],
})
export class WfNodeComponent extends DrawFlowBaseNode implements OnDestroy, OnInit, DoCheck {
  private bus = inject(WfCanvasBus);
  private fb = inject(FormBuilder);
  private fields = inject(FieldConfigService);
  graphValidSig = signal<boolean>(false);
  positions = DfConnectorPosition;
  expanded = signal<boolean>(true);
  form: FormGroup = this.fb.group({});
  config: FieldConfig[] = [];
  formInputs: FormGroup = this.fb.group({});
  configInputs: FieldConfig[] = [];
  private subs = new Subscription();
  private valueChangesHooked = false;

  private lastModelRef: unknown = null;
  private lastModelKey = '';
  private lastFlagsKey = '';

  private get safeModel() {
    return this.coerceModel(this.model);
  }
  missingInSig = signal<boolean>(false);
  missingOutSig = signal<boolean>(false);
  private formFlags = { invalid: false };

  @Input({ required: true }) actionsNodes!: Record<string, ActionFormSpec>;

  ngOnInit(): void {
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
      this.bus.graphValid$.subscribe(ok => {
        this.graphValidSig.set(!!ok);
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
    if (
      currentRef !== this.lastModelRef ||
      currentKey !== this.lastModelKey
    ) {
      this.tryBuildFromModel();
    }

    if (flagsKey !== this.lastFlagsKey) {
      this.lastFlagsKey = flagsKey;
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
    if (!form) {
      this.bus.nodeFormStatus$.next({ nodeId: this.nodeId, invalid: false });
      return;
    }
    const emit = () => {
      const invalid = form.invalid;
      this.bus.nodeFormStatus$.next({
        nodeId: this.nodeId,
        invalid,
        invalidFields: Object.entries(form.controls).filter(([, c]) => c.invalid && !c.value).map(([k]) => k),
      });
    };
    emit();
    this.subs.add(form.statusChanges.pipe(startWith(form.status)).subscribe(emit));
  }

  getInvalidFieldLabels(): string[] {
    if (!this.form) return [];
    const labelsByName = new Map(this.config.map(f => [f.name, f.label]));

    return Object.entries(this.form.controls)
      .filter(([, c]) => { return !c.valid })
      .map(([name]) => labelsByName.get(name) ?? name);
  }

  private coerceModel(raw: unknown): WorkflowNodeDataBase {
    const data = (raw ?? {}) as WorkflowNodeDataBase;
    const type = (data.type ?? data.aiType ?? 'input') as PaletteType;
    const ports = data.ports;
    return { type, ports, params: data.params, aiType: data.aiType, label: data.label, position: data?.['position'], actionsNodes: data?.['actionsNodes'] };
  }

  visualType(): PaletteType | undefined {
    return this.safeModel.type;
  }

  displayLabel(): string {
    const t = (this.safeModel.type ?? '').toLowerCase();
    if (t === 'input' || t === 'result') return this.safeModel.label || "";

    return t;
  }

  getIcon(): string | null {
    const data = this.safeModel;
    return data?.params?.icon ?? null;
  }

  inPorts(): WorkflowPorts['inputs'] {
    return this.safeModel.ports?.inputs ?? [];
  }

  outPorts(): WorkflowPorts['outputs'] {
    return this.safeModel.ports?.outputs ?? [];
  }

  toggleExpanded(): void {
    const next = !this.expanded();
    this.expanded.set(next);
    this.bus.nodeToggleExpand$.next({ nodeId: this.nodeId, expanded: next });
  }

  hasMissingIn(): boolean {
    return this.missingInSig();
  }

  hasMissingOut(): boolean {
    return this.missingOutSig();
  }

  runDisabled(): boolean {
    const graphInvalid = !this.graphValidSig();
    const anyMissing = this.hasMissingIn() || this.hasMissingOut();
    return graphInvalid || anyMissing;
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
      this.configInputs = [
        this.fields.getFileField({
          name: 'files',
          label: 'form.labels.files',
          multiple: true,
          accept: '.pdf,.docx,image/*',
          required: false,
          validators: undefined
        }),
        this.fields.getDropdownField({
          name: 'workflowas',
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
        }),
      ];
      this.wireFormToCanvas(this.formInputs);
      this.lastModelRef = this.model;
      this.lastModelKey = '';
      return;
    }
    const key = this.resolveActionKey();
    this.lastModelRef = this.model;
    this.lastModelKey = key;

    const spec = this.actionsNodes[key];
    if (!spec) {
      this.config = makeFallback(this.fields);
    } else {
      const built = spec.make(this.fields);
      this.config = (built ?? []).filter(Boolean) as FieldConfig[];
      if (!this.config.length) {
        this.config = makeFallback(this.fields);
      }
    }

    const dataAny = (this.safeModel?.params ?? {}) as WorkflowNodeDataBaseParams;
    const defaults = spec?.defaults ?? {};
    const RESERVED = new Set(['ui', '__missingIn', '__missingOut']);
    const current = Object.fromEntries(
      Object.entries(dataAny).filter(([k]) => !RESERVED.has(k))
    );
    const initial = { ...defaults, ...current };
    this.form.reset({}, { emitEvent: false });
    if (Object.keys(initial).length) {
      queueMicrotask(() => this.form.patchValue(initial, { emitEvent: false }));
    }

    if (!this.valueChangesHooked) {
      this.valueChangesHooked = true;
      this.subs.add(
        this.form.valueChanges
          .pipe(
            map(v => JSON.stringify(v ?? {})),
            distinctUntilChanged(),
            debounceTime(150),
            map(json => JSON.parse(json))
          )
          .subscribe(params => {
            if (!params || typeof params !== 'object') return;
            const RESERVED = new Set(['ui', '__missingIn', '__missingOut']);
            const payload = Object.fromEntries(
              Object.entries(params).filter(([k]) => !RESERVED.has(k))
            );

            this.bus.nodeParamsChanged$.next({ nodeId: this.nodeId, params: payload });
          })
      );

      this.wireFormToCanvas(this.form);
    }

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

  hasInvalidParams(): boolean {
    return this.formFlags.invalid;
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
    this.bus.runRequested$.next({ nodeId: this.nodeId });
  }

  displayRUnsPanel(ev?: MouseEvent): void {
    ev?.stopPropagation();
    this.bus.toggleRunPanel$.next({ anchorNodeId: this.nodeId });
  }
}
