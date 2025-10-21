import { FieldConfig } from '@cadai/pxs-ng-core/interfaces';
import { FieldConfigService } from '@cadai/pxs-ng-core/services';

export type ActionFormFactory = (f: FieldConfigService) => FieldConfig[];

export interface ActionFormSpec {
  make: ActionFormFactory;
  defaults?: Record<string, unknown>;
}

/** Fallback for unknown action types */
export function makeFallback(F: FieldConfigService): FieldConfig[] {
  return [
    F.getTextAreaField({
      name: 'text',
      label: 'text',
      rows: 8,
    }),
  ];
}
