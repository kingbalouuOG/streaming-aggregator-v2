import js from '@eslint/js';
import tseslint from 'typescript-eslint';
import reactHooks from 'eslint-plugin-react-hooks';
import globals from 'globals';

export default tseslint.config(
  {
    ignores: [
      'dist/**',
      'android/**',
      '_archive/**',
      'node_modules/**',
      'supabase/functions/**', // Deno runtime, separate type system
      'scripts/**',            // Node scripts, less strict
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
    plugins: {
      'react-hooks': reactHooks,
    },
    rules: {
      'react-hooks/rules-of-hooks': 'error',
      'react-hooks/exhaustive-deps': 'warn',

      // Pre-existing surface area is large (TMDb/Supabase response shapes).
      // Demoted to warn so CI surfaces them without blocking. Tighten over time.
      '@typescript-eslint/no-explicit-any': 'warn',

      // Allow underscore-prefixed args/vars as intentionally-unused convention.
      '@typescript-eslint/no-unused-vars': [
        'error',
        { argsIgnorePattern: '^_', varsIgnorePattern: '^_', caughtErrorsIgnorePattern: '^_' },
      ],
    },
  },
);
