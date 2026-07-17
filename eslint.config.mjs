import js from '@eslint/js';
import stylistic from '@stylistic/eslint-plugin';
import eslintConfigPrettier from 'eslint-config-prettier';
import nodePlugin from 'eslint-plugin-n';
import oxlint from 'eslint-plugin-oxlint';
import perfectionist from 'eslint-plugin-perfectionist';
import unicorn from 'eslint-plugin-unicorn';
import unusedImports from 'eslint-plugin-unused-imports';
import { defineConfig, globalIgnores } from 'eslint/config';
import globals from 'globals';
import * as tseslint from 'typescript-eslint';

export default defineConfig([
  // ━━ Global ignores ━━━━━━━━━━━━━━━━━━━━━━
  globalIgnores(['**/*.min.js', '**/*.d.ts', '**/userscripts/**', '**/dist/**']),

  // ━━ Presets ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  js.configs.recommended,
  ...tseslint.configs.recommendedTypeChecked,
  unicorn.configs.recommended,
  eslintConfigPrettier,

  // Disable type-checked rules for plain JS/MJS and build config TS files
  { files: ['**/*.{js,mjs}', '**/vite.config.ts'], ...tseslint.configs.disableTypeChecked },

  // Covered by equivalent Oxlint Unicorn rules
  {
    rules: {
      '@typescript-eslint/no-this-alias': 'off',
      'no-new-native-nonconstructor': 'off',
    },
  },

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
      'n/no-missing-import': 'off',
      'n/no-unpublished-import': 'off',
      'n/no-unsupported-features/es-syntax': 'off',
      'no-console': 'off',
    },
  },

  // ━━ Shared rules (all JS / TS) ━━━━
  {
    files: ['**/*.{js,mjs,ts}'],
    plugins: {
      '@stylistic': stylistic,
      perfectionist,
      'unused-imports': unusedImports,
    },
    rules: {
      // ── Formatting / consistency ──────────
      curly: ['error', 'all'],
      'no-console': ['warn', { allow: ['warn', 'error'] }],
      '@stylistic/no-multiple-empty-lines': ['warn', { max: 1 }],
      'no-unused-vars': 'off',
      'operator-assignment': 'error',
      'prefer-template': 'error',
      'prefer-destructuring': ['error', { VariableDeclarator: { array: false, object: true } }],
      '@stylistic/padding-line-between-statements': [
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

      // ── Perfectionist ─────────────────────
      'perfectionist/sort-named-exports': [
        'warn',
        { type: 'alphabetical', order: 'asc', ignoreCase: true, ignoreAlias: true },
      ],
      'perfectionist/sort-named-imports': [
        'warn',
        { type: 'alphabetical', order: 'asc', ignoreCase: true, ignoreAlias: true },
      ],
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
  ...oxlint.buildFromOxlintConfigFile('./.oxlintrc.json', { withNursery: true }),

  // Keep ESLint's no-console checks because existing eslint-disable comments document debug logging.
  {
    files: ['**/*.{js,mjs,ts}'],
    ignores: ['shared/**/*.js', 'scripts/**/*.js', '**/vite.config.{js,ts}'],
    rules: {
      'no-console': ['warn', { allow: ['warn', 'error'] }],
    },
  },
]);
