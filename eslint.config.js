// @ts-check
const eslint = require('@eslint/js');
const tseslint = require('typescript-eslint');
const angular = require('angular-eslint');

module.exports = tseslint.config(
  // 1) Base TS rules (inline template processor here)
  {
    files: ['**/*.ts'],
    extends: [
      eslint.configs.recommended,
      ...tseslint.configs.recommended,
      ...tseslint.configs.stylistic,
      ...angular.configs.tsRecommended,
    ],
    processor: angular.processInlineTemplates,
    rules: {
      // default off; we’ll turn it on for src/** below
      'no-restricted-imports': 'off',

      '@angular-eslint/directive-selector': [
        'error',
        { type: 'attribute', prefix: 'app', style: 'camelCase' },
      ],
      '@angular-eslint/component-selector': [
        'error',
        { type: 'element', prefix: 'app', style: 'kebab-case' },
      ],
    },
  },

  // 2) Enforce barrels for everyone in src/** (general rule)
  {
    files: ['src/**/*.ts'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          patterns: [
          // ❌ Disallow deep alias imports for these (use their barrels)
          { group: ['@features/*'], message: 'Import from @features barrel only (no subpaths).' },
          { group: ['@store/*'],    message: 'Import from @store barrel only (no subpaths).' },

          // ❌ Disallow deep *relative* paths – use aliases instead
          { group: ['src/app/core/**'],     message: 'Use @core alias (deep allowed) instead of relative path.' },
          { group: ['src/app/shared/**'],   message: 'Use @shared alias (deep allowed) instead of relative path.' },
          { group: ['src/app/features/**'], message: 'Use @features barrel instead of relative path.' },
          { group: ['src/app/store/**'],    message: 'Use @store barrel instead of relative path.' },
          ],
        },
      ],
    },
  },

  // 3) Inside each package, allow internal imports (override by turning the rule off)
  { files: ['src/app/core/**'],     rules: { 'no-restricted-imports': 'off' } },
  { files: ['src/app/shared/**'],   rules: { 'no-restricted-imports': 'off' } },
  { files: ['src/app/features/**'], rules: { 'no-restricted-imports': 'off' } },
  { files: ['src/app/store/**'],    rules: { 'no-restricted-imports': 'off' } },

  // 4) HTML templates
  {
    files: ['**/*.html'],
    extends: [
      ...angular.configs.templateRecommended,
      ...angular.configs.templateAccessibility,
    ],
    rules: {},
  }
);
