// @ts-check
import js from '@eslint/js';
import globals from 'globals';
import reactHooks from 'eslint-plugin-react-hooks';
import tseslint from 'typescript-eslint';

/**
 * The `apps/worker` overrides are COST INVARIANTS, not style rules.
 * A timer, a `ws.accept()`, an in-flight fetch or an alarm used as a ticker makes a
 * Durable Object ineligible for hibernation, which means it is billed 24/7 for as long
 * as a client is connected. See docs/decisions/0002-hub-durable-object-and-cost-model.md.
 * Never disable these.
 */
export default tseslint.config(
  { ignores: ['**/dist/**', '**/node_modules/**', '**/.wrangler/**', '**/playwright-report/**'] },
  js.configs.recommended,
  ...tseslint.configs.strict,
  {
    languageOptions: {
      globals: { ...globals.browser, ...globals.node },
      parserOptions: { ecmaVersion: 2022, sourceType: 'module' },
    },
    rules: {
      '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_' }],
      '@typescript-eslint/consistent-type-imports': 'error',
      'no-console': ['warn', { allow: ['warn', 'error'] }],
    },
  },
  {
    files: ['apps/web/src/**/*.{ts,tsx}'],
    plugins: { 'react-hooks': reactHooks },
    rules: {
      ...reactHooks.configs.recommended.rules,
    },
  },
  {
    // Development tooling, not shipped code.
    files: ['apps/worker/scripts/**/*.ts', 'scripts/**'],
    rules: { 'no-console': 'off', '@typescript-eslint/no-non-null-assertion': 'off' },
  },
  {
    files: ['apps/worker/src/**/*.ts'],
    rules: {
      'no-restricted-globals': [
        'error',
        {
          name: 'setTimeout',
          message:
            'Timers keep a Durable Object ineligible for hibernation: billed 24/7. Ticks are message-driven.',
        },
        {
          name: 'setInterval',
          message:
            'Timers keep a Durable Object ineligible for hibernation: billed 24/7. Ticks are message-driven.',
        },
        {
          name: 'setImmediate',
          message: 'Timers keep a Durable Object ineligible for hibernation: billed 24/7.',
        },
      ],
      'no-restricted-syntax': [
        'error',
        {
          selector:
            "CallExpression[callee.type='MemberExpression'][callee.property.name='accept']",
          message:
            'Use ctx.acceptWebSocket() (hibernation API), never ws.accept(): ws.accept() bills duration for the whole connection.',
        },
        {
          selector: "CallExpression[callee.property.name='setAlarm']",
          message: 'Alarms are allowed only in src/stats.ts (one per day). See ADR-0002.',
        },
      ],
    },
  },
  {
    files: ['apps/worker/src/stats.ts'],
    rules: { 'no-restricted-syntax': 'off' },
  },
  {
    files: ['apps/worker/src/hub-do.ts'],
    rules: {
      'no-restricted-syntax': [
        'error',
        {
          selector:
            "CallExpression[callee.type='MemberExpression'][callee.property.name='accept']",
          message: 'Use ctx.acceptWebSocket() (hibernation API), never ws.accept().',
        },
        {
          selector: "CallExpression[callee.property.name='setAlarm']",
          message: 'Alarms are allowed only in src/stats.ts. See ADR-0002.',
        },
        {
          selector: "CallExpression[callee.name='fetch']",
          message:
            'An in-flight fetch() makes the Durable Object ineligible for hibernation: billed 24/7. Never call fetch from the hub.',
        },
        {
          selector: "MemberExpression[object.name='env'][property.name='DB']",
          message:
            'D1 from a message handler blocks hibernation and burns row writes. Counters go to ctx.storage, debounced.',
        },
      ],
    },
  },
  {
    files: ['**/*.test.ts', '**/*.test.tsx', 'scripts/**', '**/e2e/**', '**/*.config.*'],
    rules: {
      'no-console': 'off',
      'no-restricted-globals': 'off',
      'no-restricted-syntax': 'off',
      '@typescript-eslint/no-non-null-assertion': 'off',
    },
  },
);
