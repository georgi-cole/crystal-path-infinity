import js from '@eslint/js';
import { defineConfig, globalIgnores } from 'eslint/config';
import prettier from 'eslint-config-prettier/flat';
import reactHooks from 'eslint-plugin-react-hooks';
import { reactRefresh } from 'eslint-plugin-react-refresh';
import globals from 'globals';
import { dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import tseslint from 'typescript-eslint';

const root = dirname(fileURLToPath(import.meta.url));

export default defineConfig(
  globalIgnores([
    '**/node_modules/**',
    '**/dist/**',
    '**/android/**',
    '**/ios/**',
    '**/build/**',
    '**/artifacts/**',
    '**/coverage/**',
    '**/native-locks/**',
    'spikes/**',
    'docs/**',
    'planning/**',
    'scripts/**',
    '.github/workflows/**',
    '.github/ISSUE_TEMPLATE/**',
  ]),
  { linterOptions: { reportUnusedDisableDirectives: 'error' } },
  {
    files: ['supabase/functions/**/*.ts'],
    extends: [js.configs.recommended, tseslint.configs.recommended],
    languageOptions: { globals: { ...globals.browser, Deno: 'readonly' } },
  },
  {
    files: [
      'eslint.config.mjs',
      'prettier.config.mjs',
      'apps/mobile/scripts/**/*.{js,cjs,mjs}',
      '.github/scripts/**/*.mjs',
    ],
    extends: [js.configs.recommended],
    languageOptions: { globals: globals.node },
  },
  {
    files: [
      'apps/mobile/**/*.{ts,tsx}',
      'packages/game-core/**/*.ts',
      'packages/server-core/**/*.ts',
    ],
    extends: [js.configs.recommended, tseslint.configs.recommendedTypeChecked],
    languageOptions: {
      parserOptions: { projectService: true, tsconfigRootDir: root },
    },
    rules: {
      '@typescript-eslint/consistent-type-imports': [
        'error',
        { prefer: 'type-imports', fixStyle: 'separate-type-imports' },
      ],
    },
  },
  {
    files: ['apps/mobile/src/**/*.{ts,tsx}'],
    extends: [reactHooks.configs.flat.recommended, reactRefresh.configs.vite()],
    languageOptions: { globals: globals.browser },
  },
  // Keep formatting in Prettier while retaining correctness and type-aware rules.
  prettier,
);
