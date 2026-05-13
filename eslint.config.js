import js from '@eslint/js';

export default [
  {
    ignores: ['coverage/**', 'dist/**', 'node_modules/**', '.web-ext-artifacts/**'],
  },
  js.configs.recommended,
  {
    files: ['**/*.{js,mjs}'],
    languageOptions: {
      ecmaVersion: 2023,
      sourceType: 'module',
      globals: {
        AbortController: 'readonly',
        DOMParser: 'readonly',
        TextDecoder: 'readonly',
        TextEncoder: 'readonly',
        URL: 'readonly',
        browser: 'readonly',
        chrome: 'readonly',
        clearTimeout: 'readonly',
        console: 'readonly',
        crypto: 'readonly',
        document: 'readonly',
        fetch: 'readonly',
        globalThis: 'readonly',
        messenger: 'readonly',
        process: 'readonly',
        setTimeout: 'readonly',
      },
    },
    rules: {
      'no-restricted-globals': ['error', 'eval', 'Function'],
      'no-unused-vars': 'error',
    },
  },
];
