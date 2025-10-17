import { ChangeDetectionStrategy, Component, DestroyRef, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { SeoComponent } from '@cadai/pxs-ng-core/shared';
import { LayoutService, ToolbarActionsService } from '@cadai/pxs-ng-core/services';
import { TranslateModule } from '@ngx-translate/core';
import { ToolbarAction } from '@cadai/pxs-ng-core/interfaces';
import { Router } from '@angular/router';
import { MatButtonModule } from '@angular/material/button';
import { WorkflowCanvasDfComponent } from './sub/workflow-canvas.component';
import { ActionDefinitionLite, PaletteType, WorkflowEdge, WorkflowNode } from './sub/utils/workflow.interface';
import { Validators } from '@angular/forms';
import { ActionFormSpec } from './sub/utils/action-forms';

@Component({
    selector: 'app-workflows',
    standalone: true,
    imports: [
        SeoComponent,
        CommonModule,
        TranslateModule,
        MatButtonModule,
        WorkflowCanvasDfComponent
    ],
    templateUrl: './workflows.component.html',
    styleUrls: ['./workflows.component.scss'],
    changeDetection: ChangeDetectionStrategy.OnPush
})
export class WorkflowsComponent {
    private router = inject(Router);
    private toolbar = inject(ToolbarActionsService);
    private destroyRef = inject(DestroyRef);

    nodes: WorkflowNode[] = [{
        id: 'input-node',
        type: 'input',
        x: 0, y: 0,
        data: { label: 'Checkpoint' },
        ports: { inputs: [], outputs: [{ id: 'out', label: 'out', type: 'json' }] },
    }, {
        id: 'result-node',
        type: 'result',
        x: 760, y: 0,
        data: { label: 'Result' },
        ports: { inputs: [{ id: 'in', label: 'in', type: 'json' }], outputs: [] },
    }];
    edges: WorkflowEdge[] = [];

    actionsNodes: Record<string, ActionFormSpec> = {
        'chat': {
            make: (F) => [
                F.getTextAreaField({
                    name: 'system_prompt',
                    label: 'system_prompt',
                    placeholder: 'System prompt…',
                    rows: 10,
                    required: true,
                    validators: [Validators.required,Validators.maxLength(500)],
                    maxLength:500
                }),
                F.getTextAreaField({
                    name: 'chat_message',
                    label: 'chat_message',
                    placeholder: 'Ask anything…',
                    rows: 10,
                    required: true,
                    validators: [Validators.required,Validators.maxLength(2000)],
                    maxLength:2000
                }),
                F.getDropdownField({
                    name: 'temperature',
                    label: 'Temperature',
                    options: [
                        { label: '0 – Deterministic', value: 0 },
                        { label: '0.3', value: 0.3 },
                        { label: '0.7', value: 0.7 },
                        { label: '1.0 – Creative', value: 1 },
                    ],
                    required: true,
                    validators: [Validators.required],
                    errorMessages: { required: "Temperature is required" },
                    defaultValue: 0.3,
                    helperText: "Saisissez la temperature",
                }),
            ],
            defaults: {
                temperature: 0.3
            },
        },

        compare: {
            make: (F) => [
                F.getRangeField({
                    name: 'threshold',
                    label: 'form.labels.threshold',
                    min: 0,
                    max: 100,
                    color: "primary",
                    layoutClass: "primary",
                    helperText: "form.hints.threshold",
                    validators: [Validators.required],
                    required: true,
                    errorMessages: { required: "form.errors.threshold" },
                    placeholder: "form.placeholders.threshold",
                }),
            ],
            defaults: {
                threshold: 20,
            },
        },

        summarize: {
            make: (F) => [
                F.getDropdownField({
                    name: 'summary_length',
                    label: 'Summary length',
                    options: [
                        { label: 'Key bullets', value: 'bullets' },
                        { label: 'Short (1–2 paragraphs)', value: 'short' },
                        { label: 'Detailed (4–6 paragraphs)', value: 'detailed' },
                    ],
                    validators: [Validators.required],
                    errorMessages: { required: "Length is required" },
                    required: true,
                    helperText: "Select a sumamry length",
                    defaultValue: "short"
                }),
            ],
            defaults: {
                summary_length: "short",
            },
        },

        extract: {
            make: (F) => [
                F.getTextAreaField({
                    name: 'text',
                    label: 'Text',
                    placeholder: 'Paste the text to analyze…',
                    required: false,
                    rows: 6,
                }),
                F.getTextField({
                    name: 'entities',
                    label: 'Entities (comma separated)',
                    helperText: 'Entities (comma separated)',
                    placeholder: 'person, location, organization',
                    required: true,
                    validators: [Validators.required],
                    errorMessages: { required: "Entities is required" },
                }),
                F.getDropdownField({
                    name: 'format',
                    label: 'Return format',
                    options: [
                        { label: 'JSON', value: 'json' },
                        { label: 'CSV', value: 'csv' },
                    ],
                    required: true,
                    validators: [Validators.required],
                    helperText: "Select the return format",
                    errorMessages: { required: "Return format is required" },
                    defaultValue: "json"
                }),
            ],
            defaults: {
                format: "json",
            },
        },

        jira: {
            make: (F) => [
                F.getTextField({
                    name: 'site',
                    label: 'Jira site (cloud)',
                    placeholder: 'your-domain.atlassian.net',
                    validators: [Validators.required],
                    required: true,
                    errorMessages: { required: 'Enter your Jira site' },
                    helperText: 'Cloud domain without protocol.',
                }),
                F.getTextField({
                    name: 'email',
                    label: 'Account email',
                    placeholder: 'you@example.com',
                    required: true,
                    validators: [Validators.required, Validators.email],
                    errorMessages: { required: 'Email required', email: 'Invalid email' },
                }),
                F.getPasswordField({
                    name: 'apiToken',
                    label: 'API token',
                    placeholder: '************************',
                    required: true,
                    validators: [Validators.required],
                    errorMessages: { required: 'API token required' },
                    helperText: 'Create a token in https://id.atlassian.com/manage-profile/security/api-tokens',
                }),

                F.getTextField({
                    name: 'projectKey',
                    label: 'Project key',
                    placeholder: 'ABC',
                    required: true,
                    validators: [Validators.required],
                    errorMessages: { required: 'Project key required' },
                }),
                F.getDropdownField({
                    name: 'issueType',
                    label: 'Issue type',
                    options: [
                        { label: 'Task', value: 'Task' },
                        { label: 'Bug', value: 'Bug' },
                        { label: 'Story', value: 'Story' },
                        { label: 'Epic', value: 'Epic' },
                    ],
                    required: true,
                    validators: [Validators.required],
                    errorMessages: { required: 'Choose an issue type' },
                    defaultValue: "Task"
                }),
                F.getTextField({
                    name: 'summary',
                    label: 'Summary',
                    placeholder: 'Short title…',
                    required: true,
                    validators: [Validators.required, Validators.maxLength(255)],
                    errorMessages: { required: 'Summary required', maxLength: 'Max 255 chars' },
                }),
                F.getTextAreaField({
                    name: 'description',
                    label: 'Description',
                    placeholder: 'Describe the issue…',
                    rows: 6,
                    required: false
                }),
                F.getTextField({
                    name: 'assignee',
                    label: 'Assignee (accountId or email)',
                    placeholder: 'user@example.com',
                    helperText: "Use email",
                    required: true,
                    validators: [Validators.required, Validators.email],
                    errorMessages: { required: 'Email required', email: 'Invalid email' },
                }),
                F.getDropdownField({
                    name: 'priority',
                    label: 'Priority',
                    options: [
                        { label: 'Highest', value: 'Highest' },
                        { label: 'High', value: 'High' },
                        { label: 'Medium', value: 'Medium' },
                        { label: 'Low', value: 'Low' },
                        { label: 'Lowest', value: 'Lowest' },
                    ],
                    helperText: "Choose the priority that you want",
                    defaultValue: "Medium"
                }),
            ],
            defaults: {
                issueType: 'Task',
                priority: 'Medium',
            },
        },
    };

    availableActions: ActionDefinitionLite[] = [
        { type: 'chat', params: { icon: "chat" } },
        { type: 'compare', params: { icon: "compare" } },
        { type: 'summarize', params: { icon: "article_shortcut" } },
        { type: 'extract', params: { icon: "tag" } },
        { type: 'jira', params: { icon: "confirmation_number", class: "warn" } },
    ];
    
    ExecNodes = new Set<PaletteType>([
        'chat', 'compare', 'summarize', 'extract', 'jira'
    ]);

    constructor(
        private layoutService: LayoutService
    ) {

        const newWorkflow: ToolbarAction = {
            id: 'new_workflow',
            icon: 'add',
            tooltip: 'new_workflow',
            click: () => this.router.navigate(["/workflows/new"]),
            variant: "flat",
            label: 'new_workflow',
            class: "primary"
        };
        this.toolbar.scope(this.destroyRef, [newWorkflow]);
    }

    public onTitleChange(title: string): void {
        this.layoutService.setTitle(title);
    }

    onChange(e: { nodes: WorkflowNode[]; edges: WorkflowEdge[] }) {
        this.nodes = e.nodes;
        this.edges = e.edges;
    }
}
