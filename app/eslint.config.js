const { defineConfig } = require('eslint/config');
const expoConfig = require('eslint-config-expo/flat');
const prettierConfig = require('eslint-config-prettier/flat');

module.exports = defineConfig([
  expoConfig,
  // Turns off the lint rules that would fight Prettier's formatting.
  prettierConfig,
  {
    ignores: ['dist/*', '.expo/*', 'src/uniwind-types.d.ts', 'src/types/database.ts'],
  },
]);
