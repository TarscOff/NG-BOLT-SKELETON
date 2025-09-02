// depcheck.config.cjs
const ALWAYS_KEEP = [
  // Framework/DI-sensitive & typical peers (guard them even if depcheck flags them)
  '@angular/animations',
  '@angular/cdk',
  '@angular/common',
  '@angular/compiler',
  '@angular/core',
  '@angular/forms',
  '@angular/material',
  '@angular/platform-browser',
  '@angular/platform-browser-dynamic',
  '@angular/router',
  '@ngrx/store',
  '@ngrx/effects',
  '@ngrx/store-devtools',
  '@ngx-translate/core',
  '@ngx-translate/http-loader',
  'keycloak-js',
  'ngrx-store-localstorage',
  'rxjs',
  'tslib',
  'zone.js',

  // Build/test tools you may reference only in configs
  '@angular/cli',
  '@angular/compiler-cli',
  '@angular/build',
  'ng-packagr',
  'typescript',
  'karma',
  'jasmine-core',
  'eslint',
  'prettier',
  '@angular-eslint/eslint-plugin',
  '@angular-eslint/eslint-plugin-template',
  '@angular-eslint/template-parser',
  '@typescript-eslint/eslint-plugin',
  '@typescript-eslint/parser',
  'husky',
  'lint-staged',
  '@commitlint/cli',
  '@commitlint/config-conventional',
];

module.exports = {
  // Files to analyze
  specials: [
    // Let depcheck read configs (Angular, TS, ESLint, Karma)
    require('depcheck/dist/special/eslint').default,
    require('depcheck/dist/special/webpack').default,
    require('depcheck/dist/special/tslint').default, // harmless if absent
    require('depcheck/dist/special/babel').default,
    require('depcheck/dist/special/karma').default,
    require('depcheck/dist/special/prettier').default,
    require('depcheck/dist/special/typescript').default,
  ],
  detectors: [
    require('depcheck/dist/detector/importDeclaration').default,
    require('depcheck/dist/detector/requireCallExpression').default,
    require('depcheck/dist/detector/typescriptImportEqualsDeclaration').default,
    require('depcheck/dist/detector/exportDeclaration').default,
    require('depcheck/dist/detector/typescriptEnumMember').default,
    require('depcheck/dist/detector/typescriptTypeImport').default,
  ],
  ignoreMatches: [
    // Ignore meta packages and anything you know is injected by tooling
    ...ALWAYS_KEEP,

    // Angular workspace files that aren’t statically traceable
    '@angular-devkit/*',
  ],
  // Expose the keep-list so our scripts can reuse it
  _internal_keep: ALWAYS_KEEP,
};
