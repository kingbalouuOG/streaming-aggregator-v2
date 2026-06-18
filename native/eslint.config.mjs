import js from '@eslint/js';
import tseslint from 'typescript-eslint';
import reactHooks from 'eslint-plugin-react-hooks';
import react from 'eslint-plugin-react';
import globals from 'globals';

// Native (RN/Expo) ESLint flat config.
//
// The repo-root eslint.config.mjs deliberately ignores `native/**` (it's a
// browser/Vite-scoped config). Without a config of its own, `expo lint` resolves
// that root config up-tree and reports "all of native/src is ignored" — i.e. the
// native tree had no working lint gate at all. This file shadows the root config
// for the native project and reuses the SAME plugins the web config uses (hoisted
// to the root node_modules), so the rules stay consistent across web + native
// without pulling in eslint-config-expo.
export default tseslint.config(
  {
    ignores: [
      'android/**',
      'ios/**',
      'dist/**',
      '.expo/**',
      'node_modules/**',
      'src/lib/**', // junction to the shared engine tree — linted by the root config
      'expo-env.d.ts',
      'metro.config.js',
      'babel.config.js',
      'plugins/**', // Node build-time config plugins, not app code
    ],
  },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    files: ['app/**/*.{ts,tsx}', 'src/**/*.{ts,tsx}'],
    languageOptions: {
      ecmaVersion: 2021,
      sourceType: 'module',
      globals: {
        ...globals.node, // RN/Hermes runtime: __DEV__, console, timers, global, process
        __DEV__: 'readonly',
      },
    },
    settings: { react: { version: 'detect' } },
    plugins: { 'react-hooks': reactHooks, react },
    rules: {
      // TypeScript resolves identifiers; no-undef false-positives on RN/Hermes globals.
      'no-undef': 'off',
      // RN references static image assets via require('./x.png') — idiomatic, not a smell.
      '@typescript-eslint/no-require-imports': 'off',
      'react-hooks/rules-of-hooks': 'error',
      'react-hooks/exhaustive-deps': 'warn',
      // `count && <X/>` renders a literal 0 — same post-mortem rule as web.
      'react/jsx-no-leaked-render': 'error',
      '@typescript-eslint/no-explicit-any': 'error',
      '@typescript-eslint/no-unused-vars': [
        'error',
        { argsIgnorePattern: '^_', varsIgnorePattern: '^_', caughtErrorsIgnorePattern: '^_' },
      ],
    },
  },
);
