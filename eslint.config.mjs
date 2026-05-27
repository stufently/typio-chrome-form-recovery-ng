import tseslint from '@typescript-eslint/eslint-plugin';
import tsParser from '@typescript-eslint/parser';
import prettier from 'eslint-config-prettier';
import lit from 'eslint-plugin-lit';

export default [
  {
    ignores: ['.output/**', '.wxt/**', 'dist/**', 'node_modules/**', 'coverage/**'],
  },
  {
    files: ['**/*.{ts,tsx}'],
    languageOptions: {
      parser: tsParser,
      parserOptions: {
        ecmaVersion: 2023,
        sourceType: 'module',
      },
    },
    plugins: {
      '@typescript-eslint': tseslint,
      lit,
    },
    rules: {
      ...tseslint.configs.recommended.rules,
      '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_' }],
      '@typescript-eslint/consistent-type-imports': 'error',
      '@typescript-eslint/no-explicit-any': 'error',
      'no-console': ['warn', { allow: ['warn', 'error'] }],
      'no-restricted-syntax': [
        'error',
        {
          selector: "CallExpression[callee.name='eval']",
          message: 'eval is forbidden by MV3 CSP and our threat model.',
        },
        {
          selector: "MemberExpression[property.name='innerHTML']",
          message:
            'innerHTML is forbidden — use textContent or Lit templates. See docs/THREAT_MODEL.md.',
        },
      ],
    },
  },
  {
    // Tests need DOM teardown via innerHTML='' — the rule is meant for production code.
    files: ['tests/**/*.ts'],
    rules: {
      'no-restricted-syntax': 'off',
    },
  },
  prettier,
];
