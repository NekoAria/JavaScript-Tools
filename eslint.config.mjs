import js from '@eslint/js';
import { defineConfig, globalIgnores } from 'eslint/config';
import eslintConfigPrettier from 'eslint-config-prettier';
import { importX } from 'eslint-plugin-import-x';
import nodePlugin from 'eslint-plugin-n';
import oxlint from 'eslint-plugin-oxlint';
import perfectionist from 'eslint-plugin-perfectionist';
import unicorn from 'eslint-plugin-unicorn';
import unusedImports from 'eslint-plugin-unused-imports';
import globals from 'globals';
import * as tseslint from 'typescript-eslint';

export default defineConfig([
  // ━━ Global ignores ━━━━━━━━━━━━━━━━━━━━━━
  globalIgnores(['**/*.min.js', '**/*.d.ts', '**/userscripts/**', '**/dist/**']),

  // ━━ Presets ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  js.configs.recommended,
  ...tseslint.configs.recommendedTypeChecked,
  importX.flatConfigs.recommended,
  importX.flatConfigs.typescript,
  unicorn.configs.recommended,
  eslintConfigPrettier,

  // Disable type-checked rules for plain JS/MJS and build config TS files
  { files: ['**/*.{js,mjs}', '**/vite.config.ts'], ...tseslint.configs.disableTypeChecked },

  // ━━ Node environment ━━━━━━━━━━━━━━━━━━━━
  {
    languageOptions: {
      globals: {
        ...globals.browser,
        ...globals.greasemonkey,
      },
    },
  },

  // ━━ Build tooling (Node.js context) ━━━━━
  {
    files: ['shared/**/*.js', 'scripts/**/*.js', '**/vite.config.{js,ts}'],
    plugins: { n: nodePlugin },
    languageOptions: {
      globals: {
        ...globals.node,
        Buffer: 'readonly',
      },
    },
    rules: {
      'import-x/no-unresolved': 'off', // pnpm workspace: sub-package deps not resolvable from shared/
      'n/no-missing-import': 'off',
      'n/no-process-exit': 'warn',
      'n/no-unpublished-import': 'off',
      'n/no-unsupported-features/es-syntax': 'off',
      'no-console': 'off',
    },
  },

  // ━━ Shared rules (all JS / TS) ━━━━
  {
    files: ['**/*.{js,mjs,ts}'],
    plugins: {
      perfectionist,
      'unused-imports': unusedImports,
    },
    settings: { 'import-x/resolver': { typescript: true, node: true } },
    rules: {
      // ── Formatting / consistency ──────────
      curly: ['error', 'all'],
      'no-console': ['warn', { allow: ['warn', 'error'] }],
      'no-multiple-empty-lines': ['warn', { max: 1 }],
      'no-unused-vars': 'off',
      'operator-assignment': 'error',
      'prefer-template': 'error',
      'prefer-destructuring': ['error', { VariableDeclarator: { array: false, object: true } }],
      'padding-line-between-statements': [
        'warn',
        { blankLine: 'always', prev: '*', next: 'return' },
        { blankLine: 'always', prev: 'export', next: 'export' },
        { blankLine: 'always', prev: 'function', next: 'function' },
        { blankLine: 'always', prev: ['const', 'let', 'var'], next: '*' },
        {
          blankLine: 'any',
          prev: ['const', 'let', 'var'],
          next: ['const', 'let', 'var'],
        },
      ],

      // ── Unused Imports ────────────────────
      'unused-imports/no-unused-imports': 'warn',
      'unused-imports/no-unused-vars': 'off',

      // ── Import ordering (import-x) ────────
      'import-x/no-anonymous-default-export': 'error',
      'import-x/no-cycle': 'error',
      'import-x/no-duplicates': 'error',
      'import-x/no-self-import': 'error',
      'import-x/no-useless-path-segments': ['error', { noUselessIndex: true }],
      'import-x/order': [
        'warn',
        {
          alphabetize: { caseInsensitive: true, order: 'asc' },
          groups: [
            'type',
            'builtin',
            'object',
            'external',
            'internal',
            'parent',
            'sibling',
            'index',
          ],
          named: true,
          'newlines-between': 'always',
        },
      ],

      // ── Perfectionist ─────────────────────
      'perfectionist/sort-modules': [
        'warn',
        {
          type: 'natural',
          order: 'asc',
          groups: [
            'declare-enum',
            'export-enum',
            'enum',
            ['declare-interface', 'declare-type'],
            ['export-interface', 'export-type'],
            ['interface', 'type'],
            'declare-class',
            'class',
            'export-class',
            ['declare-function', 'export-function', 'function'],
          ],
        },
      ],

      // ── Unicorn overrides ─────────────────
      'unicorn/name-replacements': 'off',
      'unicorn/no-array-reduce': 'off',
      'unicorn/no-null': 'off',
      'unicorn/no-useless-undefined': 'warn',
      'unicorn/prefer-module': 'off',
      'unicorn/prefer-top-level-await': 'off',
      'unicorn/filename-case': ['warn', { cases: { kebabCase: true } }],

      // Keep the lint baseline stable after the Unicorn recommended preset became stricter.
      'unicorn/consistent-boolean-name': 'off',
      'unicorn/consistent-conditional-object-spread': 'off',
      'unicorn/no-break-in-nested-loop': 'off',
      'unicorn/no-computed-property-existence-check': 'off',
      'unicorn/no-declarations-before-early-exit': 'off',
      'unicorn/no-negated-array-predicate': 'off',
      'unicorn/no-top-level-assignment-in-function': 'off',
      'unicorn/no-unnecessary-global-this': 'off',
      'unicorn/no-unreadable-for-of-expression': 'off',
      'unicorn/no-unsafe-string-replacement': 'off',
      'unicorn/no-useless-else': 'off',
      'unicorn/prefer-await': 'off',
      'unicorn/prefer-continue': 'off',
      'unicorn/prefer-early-return': 'off',
      'unicorn/prefer-scoped-selector': 'off',
      'unicorn/prefer-url-href': 'off',
      'unicorn/require-array-sort-compare': 'off',
    },
  },

  // ━━ TypeScript-specific rules ━━━━━━━━━━━━
  {
    files: ['**/*.ts'],
    ignores: ['**/vite.config.ts'],
    languageOptions: {
      parserOptions: {
        projectService: true,
        tsconfigRootDir: import.meta.dirname,
      },
    },
    rules: {
      '@typescript-eslint/no-unused-vars': [
        'warn',
        {
          args: 'after-used',
          ignoreRestSiblings: false,
          argsIgnorePattern: '^_.*?$',
        },
      ],
      '@typescript-eslint/no-non-null-assertion': 'error',
      '@typescript-eslint/consistent-type-imports': [
        'error',
        {
          prefer: 'type-imports',
          disallowTypeAnnotations: true,
          fixStyle: 'separate-type-imports',
        },
      ],
    },
  },

  // ━━ Bookmarklets override ━━━━━━━━━━━━━━━
  {
    files: ['bookmarklets/**/*.js'],
    rules: {
      'no-unused-labels': 'off',
    },
  },

  // ━━ Scripts override (after shared rules) ━
  {
    files: ['scripts/**/*.js'],
    rules: {
      'no-console': 'off',
    },
  },

  // Disable ESLint rules already covered by Oxlint; keep ESLint for unsupported/plugin/type-aware rules.
  ...oxlint.buildFromOxlintConfigFile('./.oxlintrc.json'),

  // Keep ESLint's no-console checks because existing eslint-disable comments document debug logging.
  {
    files: ['**/*.{js,mjs,ts}'],
    ignores: ['shared/**/*.js', 'scripts/**/*.js', '**/vite.config.{js,ts}'],
    rules: {
      'no-console': ['warn', { allow: ['warn', 'error'] }],
    },
  },
]);
