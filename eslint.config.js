// https://docs.expo.dev/guides/using-eslint/
const { defineConfig } = require('eslint/config');
const expoConfig = require('eslint-config-expo/flat');
const globals = require('globals');

module.exports = defineConfig([
  expoConfig,
  {
    ignores: ['node_modules/*', 'build/*', 'dist/*', 'ios/*', 'android/*', 'coverage/*', '.expo/*'],
  },
  {
    rules: {
      // Les logs passent par src/services/log.ts (filtrage du contenu personnel).
      'no-console': 'error',
    },
  },
  {
    // Linting typé : une promesse non attendue (ex. File.write() asynchrone,
    // finalisation audio) est une perte de données potentielle.
    files: ['src/**/*.ts', 'src/**/*.tsx'],
    languageOptions: {
      parserOptions: { projectService: true, tsconfigRootDir: __dirname },
    },
    rules: {
      '@typescript-eslint/no-floating-promises': 'error',
      '@typescript-eslint/no-misused-promises': ['error', { checksVoidReturn: { attributes: false } }],
    },
  },
  {
    files: ['scripts/**', 'plugins/**', 'tests/node/**', '*.config.js'],
    languageOptions: { globals: globals.node },
    rules: { 'no-console': 'off' },
  },
  {
    files: ['src/services/log.ts'],
    rules: { 'no-console': 'off' },
  },
]);
