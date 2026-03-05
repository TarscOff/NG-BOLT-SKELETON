import {
    ChangeDetectionStrategy,
    Component,
    DestroyRef,
    OnInit,
    computed,
    effect,
    inject,
    input,
    output,
    signal,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormBuilder, ReactiveFormsModule } from '@angular/forms';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { TranslateModule, TranslateService } from '@ngx-translate/core';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatTooltipModule } from '@angular/material/tooltip';
import { ToastService } from '@cadai/pxs-ng-core/services';
import { TemplateAssignment } from '@shared/types';

@Component({
    selector: 'app-template-code-editor',
    standalone: true,
    imports: [
        CommonModule,
        ReactiveFormsModule,
        TranslateModule,
        MatButtonModule,
        MatIconModule,
        MatTooltipModule,
    ],
    template: `
        <div class="code-editor-container">
            <!-- Assignment Editor -->
            <div class="code-editor-section">
                <div class="editor-header">
                    <h3>{{ 'templates.code_editor.template_assignment' | translate }}</h3>
                    <button
                        mat-icon-button
                        color="primary"
                        (click)="triggerFileUpload()"
                        [matTooltip]="'templates.code_editor.upload_assignment' | translate">
                        <mat-icon>upload_file</mat-icon>
                    </button>
                </div>

                <textarea
                    class="code-editor"
                    [formControl]="assignmentControl"
                    [placeholder]="'templates.code_editor.assignment_placeholder' | translate"
                    spellcheck="false"></textarea>

                @if (assignmentError()) {
                    <div class="error-message">
                        <mat-icon>error</mat-icon>
                        <span>{{ assignmentError() }}</span>
                    </div>
                }

                @if (isAssignmentValid()) {
                    <div class="success-message">
                        <mat-icon>check_circle</mat-icon>
                        <span>{{ 'templates.code_editor.valid_json_message' | translate }}</span>
                    </div>
                }
            </div>

            <!-- Hidden file input -->
            <input
                type="file"
                accept=".json"
                #assignmentFileInput
                (change)="onFileSelected($event)"
                style="display: none;">
        </div>
    `,
    styles: [`
        :host {
            flex: 1;
            display: flex;
            flex-direction: column;
        }

        .code-editor-container {
            display: flex;
            flex-direction: column;
            flex: 1;
        }

        .code-editor-section {
            display: flex;
            flex-direction: column;
            gap: 1rem;
            flex: 1;
            min-height: 0;
        }

        .editor-header {
            display: flex;
            align-items: center;
            gap: 0.5rem;
            margin-top: 1rem;

            h3 {
                display: flex;
                align-items: center;
                gap: 0.5rem;
                margin: 0;
                font-size: 1rem;
                font-weight: 600;
                flex: 1;

                mat-icon {
                    font-size: 1.25rem;
                    width: 1.25rem;
                    height: 1.25rem;
                }
            }
        }

        .code-editor {
            flex: 1;
            min-height: 350px;
            font-family: 'Consolas', 'Monaco', 'Courier New', monospace;
            font-size: 13px;
            line-height: 1.5;
            padding: 1rem;
            border: 2px solid color-mix(in srgb, var(--mat-neutral) 30%, transparent);
            border-radius: 8px;
            background: color-mix(in srgb, var(--mat-neutral) 5%, transparent);
            color: var(--mat-on-surface);
            resize: vertical;
            transition: border-color 0.2s ease;

            &:focus {
                outline: none;
                border-color: var(--mat-primary);
            }

            &::placeholder {
                color: var(--mat-on-surface-variant);
                opacity: 0.6;
            }
        }

        .error-message,
        .success-message {
            display: flex;
            align-items: center;
            gap: 0.5rem;
            padding: 0.75rem 1rem;
            border-radius: 8px;
            font-size: 0.875rem;

            mat-icon {
                font-size: 1.25rem;
                width: 1.25rem;
                height: 1.25rem;
            }
        }

        .error-message {
            background: color-mix(in srgb, var(--mat-sys-error) 10%, transparent);
            color: var(--mat-sys-error);
            border: 1px solid color-mix(in srgb, var(--mat-sys-error) 30%, transparent);
        }

        .success-message {
            background: color-mix(in srgb, var(--mat-sys-primary) 10%, transparent);
            color: var(--mat-sys-primary);
            border: 1px solid color-mix(in srgb, var(--mat-sys-primary) 30%, transparent);
        }
    `],
    changeDetection: ChangeDetectionStrategy.OnPush,
})
export class TemplateCodeEditorComponent implements OnInit {
    // Inputs
    readonly projectId = input.required<string>();
    readonly initialAssignment = input<string>('');

    // Outputs
    readonly assignmentParsed = output<TemplateAssignment[] | null>();
    readonly assignmentStringChanged = output<string>();
    readonly validationStateChange = output<boolean>();

    // Services
    private readonly fb = inject(FormBuilder);
    private readonly translateService = inject(TranslateService);
    private readonly toast = inject(ToastService);
    private readonly destroyRef = inject(DestroyRef);

    // State
    readonly assignmentError = signal<string | null>(null);
    readonly parsedAssignment = signal<TemplateAssignment[] | null>(null);
    readonly isAssignmentValid = computed(() => !!this.parsedAssignment() && !this.assignmentError());

    // Forms
    readonly assignmentControl = this.fb.nonNullable.control('');
    private hasUserEdited = false; // Track if user has manually edited the content

    constructor() {
        // Watch for initial assignment changes - but only update if user hasn't edited
        effect(() => {
            const initialData = this.initialAssignment();
            // Only auto-update the editor if the user hasn't started editing manually
            if (initialData && !this.hasUserEdited) {
                this.assignmentControl.setValue(initialData, { emitEvent: false });
                this.validateAssignment(initialData);
            }
        }, { allowSignalWrites: true });
    }

    ngOnInit(): void {
        this.setupFormListeners();
    }

    private setupFormListeners(): void {
        // Watch assignment changes
        this.assignmentControl.valueChanges
            .pipe(takeUntilDestroyed(this.destroyRef))
            .subscribe(code => {
                // Mark that user has started editing
                this.hasUserEdited = true;
                // Emit the raw string change so parent can detect dirty state
                this.assignmentStringChanged.emit(code);
                this.validateAssignment(code);
            });
    }

    private validateAssignment(code: string): void {
        if (!code.trim()) {
            this.assignmentError.set(null);
            this.parsedAssignment.set(null);
            this.emitValidationState();
            return;
        }

        try {
            const parsed: TemplateAssignment[] = JSON.parse(code);
            
            // Validate assignment structure
            const validationError = this.validateAssignmentStructure(parsed);
            if (validationError) {
                this.assignmentError.set(validationError);
                this.parsedAssignment.set(null);
                this.emitValidationState();
                return;
            }

            this.assignmentError.set(null);
            this.parsedAssignment.set(parsed);
            this.emitParsedData();
        } catch (error) {
            const errorMessage = error instanceof Error ? error.message : 'Invalid JSON';
            this.assignmentError.set(this.translateService.instant('templates.code_editor.parse_error', { error: errorMessage }));
            this.parsedAssignment.set(null);
        }

        this.emitValidationState();
    }

    private validateAssignmentStructure(assignments: TemplateAssignment[]): string | null {
        // Check if it's an array
        if (!Array.isArray(assignments)) {
            return 'Root must be an array of template assignments';
        }

        if (assignments.length === 0) {
            return 'At least one template assignment is required';
        }

        // Validate each assignment in the array
        for (let idx = 0; idx < assignments.length; idx++) {
            const assignment = assignments[idx];

            if (!assignment || typeof assignment !== 'object') {
                return `Assignment [${idx}] must be an object`;
            }

            // Validate required templateId
            if (!assignment.templateId || typeof assignment.templateId !== 'string') {
                return `Assignment [${idx}] must have a string templateId`;
            }

            // Validate required templateName
            if (!assignment.templateName || typeof assignment.templateName !== 'string') {
                return `Assignment [${idx}] must have a string templateName`;
            }

            // Validate portDataScopes array
            if (!assignment.portDataScopes || !Array.isArray(assignment.portDataScopes)) {
                return `Assignment [${idx}] must have a portDataScopes array`;
            }

            for (let i = 0; i < assignment.portDataScopes.length; i++) {
                const portScope = assignment.portDataScopes[i];
                
                if (!portScope || typeof portScope !== 'object') {
                    return `Assignment [${idx}]: Port scope [${i}] must be an object`;
                }

                if (!portScope.portId || typeof portScope.portId !== 'string') {
                    return `Assignment [${idx}]: Port scope [${i}] must have a string portId`;
                }

                if (!portScope.scope || typeof portScope.scope !== 'string') {
                    return `Assignment [${idx}]: Port scope [${i}] must have a string scope`;
                }

                const validScopes = ['session', 'project', 'both'];
                if (!validScopes.includes(portScope.scope)) {
                    return `Assignment [${idx}]: Port scope [${i}].scope must be one of: ${validScopes.join(', ')}`;
                }
            }

            // Validate configuration if present
            const config = assignment.configuration;
            if (!config || typeof config !== 'object') {
                return `Assignment [${idx}] must have a configuration object`;
            }

            const configError = this.validateConfigurationStructure(config, idx);
            if (configError) {
                return configError;
            }
        }

        return null;
    }

    private validateConfigurationStructure(config: unknown, assignmentIndex?: number): string | null {
        const prefix = assignmentIndex !== undefined ? `Assignment [${assignmentIndex}]: ` : '';
        
        if (!config || typeof config !== 'object') {
            return `${prefix}Configuration must be an object`;
        }

        const configObj = config as Record<string, unknown>;

        // Validate projectCanvas structure if present
        if (configObj['projectCanvas']) {
            if (typeof configObj['projectCanvas'] !== 'object' || configObj['projectCanvas'] === null) {
                return `${prefix}projectCanvas must be an object`;
            }

            const canvas = configObj['projectCanvas'] as Record<string, unknown>;
            
            // Validate uiNodes array
            if (canvas['uiNodes'] && !Array.isArray(canvas['uiNodes'])) {
                return `${prefix}projectCanvas.uiNodes must be an array`;
            }

            if (Array.isArray(canvas['uiNodes'])) {
                const uiNodes = canvas['uiNodes'] as unknown[];
                for (let i = 0; i < uiNodes.length; i++) {
                    const node = uiNodes[i] as Record<string, unknown>;
                    if (!node['id'] || typeof node['id'] !== 'string') {
                        return `${prefix}projectCanvas.uiNodes[${i}] must have a string id`;
                    }
                    if (!node['type'] || typeof node['type'] !== 'string') {
                        return `${prefix}projectCanvas.uiNodes[${i}] must have a string type`;
                    }
                    if (!node['position'] || typeof node['position'] !== 'object') {
                        return `${prefix}projectCanvas.uiNodes[${i}] must have a position object`;
                    }
                    const position = node['position'] as Record<string, unknown>;
                    if (typeof position['x'] !== 'number' || typeof position['y'] !== 'number') {
                        return `${prefix}projectCanvas.uiNodes[${i}].position must have numeric x and y`;
                    }
                }
            }

            // Validate connections array
            if (canvas['connections'] && !Array.isArray(canvas['connections'])) {
                return `${prefix}projectCanvas.connections must be an array`;
            }

            if (Array.isArray(canvas['connections'])) {
                const connections = canvas['connections'] as unknown[];
                for (let i = 0; i < connections.length; i++) {
                    const conn = connections[i] as Record<string, unknown>;
                    if (!conn['sourceNodeId'] || typeof conn['sourceNodeId'] !== 'string') {
                        return `${prefix}projectCanvas.connections[${i}] must have a string sourceNodeId`;
                    }
                    if (!conn['sourceConnectorId'] || typeof conn['sourceConnectorId'] !== 'string') {
                        return `${prefix}projectCanvas.connections[${i}] must have a string sourceConnectorId`;
                    }
                    if (!conn['targetNodeId'] || typeof conn['targetNodeId'] !== 'string') {
                        return `${prefix}projectCanvas.connections[${i}] must have a string targetNodeId`;
                    }
                    if (!conn['targetConnectorId'] || typeof conn['targetConnectorId'] !== 'string') {
                        return `${prefix}projectCanvas.connections[${i}] must have a string targetConnectorId`;
                    }
                }
            }

            // Validate viewMode
            if (canvas['viewMode'] && (typeof canvas['viewMode'] !== 'string' || !['single', 'tabs'].includes(canvas['viewMode']))) {
                return `${prefix}projectCanvas.viewMode must be either "single" or "tabs"`;
            }
        }

        // Validate uiTemplate structure if present
        if (configObj['uiTemplate']) {
            if (typeof configObj['uiTemplate'] !== 'object' || configObj['uiTemplate'] === null) {
                return `${prefix}uiTemplate must be an object`;
            }

            const uiTemplate = configObj['uiTemplate'] as Record<string, unknown>;

            if (uiTemplate['layout'] && (typeof uiTemplate['layout'] !== 'string' || !['standalone-single', 'standalone-tabs'].includes(uiTemplate['layout']))) {
                return `${prefix}uiTemplate.layout must be either "standalone-single" or "standalone-tabs"`;
            }

            if (uiTemplate['components'] && !Array.isArray(uiTemplate['components'])) {
                return `${prefix}uiTemplate.components must be an array`;
            }

            if (Array.isArray(uiTemplate['components'])) {
                const components = uiTemplate['components'] as unknown[];
                for (let i = 0; i < components.length; i++) {
                    const comp = components[i] as Record<string, unknown>;
                    if (!comp['id'] || typeof comp['id'] !== 'string') {
                        return `${prefix}uiTemplate.components[${i}] must have a string id`;
                    }
                    if (!comp['type'] || typeof comp['type'] !== 'string') {
                        return `${prefix}uiTemplate.components[${i}] must have a string type`;
                    }
                    if (comp['bindings'] && !Array.isArray(comp['bindings'])) {
                        return `${prefix}uiTemplate.components[${i}].bindings must be an array`;
                    }
                }
            }
        }

        return null;
    }

    private emitParsedData(): void {
        const assignment = this.parsedAssignment();
        
        if (assignment) {
            this.assignmentParsed.emit(assignment);
        }
    }

    private emitValidationState(): void {
        const isValid = this.isAssignmentValid();
        this.validationStateChange.emit(isValid);
    }

    triggerFileUpload(): void {
        const fileInput = document.querySelector('input[type="file"]') as HTMLInputElement;
        if (fileInput) {
            fileInput.click();
        }
    }

    onFileSelected(event: Event): void {
        const input = event.target as HTMLInputElement;
        const file = input.files?.[0];

        if (!file) return;

        if (!file.name.endsWith('.json')) {
            this.toast.showError(this.translateService.instant('templates.code_editor.invalid_file_type'));
            return;
        }

        const reader = new FileReader();
        reader.onload = (e) => {
            const content = e.target?.result as string;
            if (content) {
                this.assignmentControl.setValue(content);
                this.toast.show(this.translateService.instant('templates.code_editor.upload_success'));
            }
        };
        reader.onerror = () => {
            this.toast.showError(this.translateService.instant('templates.code_editor.upload_error'));
        };
        reader.readAsText(file);

        // Reset input value so the same file can be selected again
        input.value = '';
    }
}
