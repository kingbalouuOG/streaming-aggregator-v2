import js from '@eslint/js';
import tseslint from 'typescript-eslint';
import reactHooks from 'eslint-plugin-react-hooks';
import react from 'eslint-plugin-react';
import globals from 'globals';

export default tseslint.config(
  {
    ignores: [
      'dist/**',
      'android/**',
      '_archive/**',
      'node_modules/**',
      'supabase/functions/**', // Deno runtime, separate type system — PLAT-3 dissolves this
      'tests/**',
      '.claude/**',
      'capacitor.config.ts',
      'vite.config.ts',
      '*.config.js',
    ],
  },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    files: ['src/**/*.{ts,tsx}'],
    languageOptions: {
      ecmaVersion: 2020,
      sourceType: 'module',
      globals: {
        ...globals.browser,
        __DEV__: 'readonly',
      },
    },
    settings: {
      react: { version: 'detect' },
    },
    plugins: {
      'react-hooks': reactHooks,
      react,
    },
    rules: {
      'react-hooks/rules-of-hooks': 'error',
      'react-hooks/exhaustive-deps': 'warn',

      // REPO-1 ratchet: `count && <X/>` renders a literal 0 — our own
      // post-mortem rule (docs/solutions/logic-errors/
      // react-numeric-falsy-renders-zero.md); bit production once.
      'react/jsx-no-leaked-render': 'error',

      // REPO-1 ratchet: burned down to 0 (was 72) — promoted warn → error
      // so PLAT-1 is written under the rule.
      '@typescript-eslint/no-explicit-any': 'error',

      // Allow underscore-prefixed args/vars as intentionally-unused convention.
      '@typescript-eslint/no-unused-vars': [
        'error',
        { argsIgnorePattern: '^_', varsIgnorePattern: '^_', caughtErrorsIgnorePattern: '^_' },
      ],
    },
  },
  {
    // REPO-1: scripts/** un-ignored with a relaxed profile — Node
    // tooling, not app code. `any` surfaces as warn (visible, not
    // blocking); console is the scripts' UI.
    files: ['scripts/**/*.{ts,mjs,js}'],
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: 'module',
      globals: {
        ...globals.node,
      },
    },
    rules: {
      '@typescript-eslint/no-explicit-any': 'warn',
      '@typescript-eslint/no-unused-vars': [
        'warn',
        { argsIgnorePattern: '^_', varsIgnorePattern: '^_', caughtErrorsIgnorePattern: '^_' },
      ],
      // debug-server.js is intentionally CommonJS (plain node dev tool)
      '@typescript-eslint/no-require-imports': 'off',
    },
  },
);
