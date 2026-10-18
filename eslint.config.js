import js from '@eslint/js';
import globals from 'globals';
import prettier from 'eslint-config-prettier';

const DOM_GLOBALS = ['document', 'window', 'localStorage', 'requestAnimationFrame', 'performance', 'Image'];

export default [
  { ignores: ['dist/', 'node_modules/', 'reference/', 'coverage/'] },
  js.configs.recommended,
  {
    files: ['**/*.js'],
    languageOptions: { ecmaVersion: 'latest', sourceType: 'module', globals: { ...globals.browser } },
    rules: {
      'no-unused-vars': ['error', { argsIgnorePattern: '^_' }],
    },
  },
  // All randomness goes through src/core/rng.js.
  {
    files: ['src/**/*.js'],
    ignores: ['src/core/rng.js'],
    rules: {
      'no-restricted-properties': [
        'error',
        { object: 'Math', property: 'random', message: 'Use src/core/rng.js.' },
      ],
    },
  },
  // Pure layers never touch the DOM or canvas.
  {
    files: ['src/core/**/*.js', 'src/systems/**/*.js', 'src/world/**/*.js'],
    ignores: ['src/core/loop.js', 'src/core/storage.js'],
    languageOptions: { globals: { ...globals.es2021 } },
    rules: {
      'no-restricted-globals': ['error', ...DOM_GLOBALS],
    },
  },
  {
    files: ['tools/**/*.js', 'tests/**/*.js', '*.config.js'],
    languageOptions: { globals: { ...globals.node } },
  },
  prettier,
];
