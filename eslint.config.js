import js from '@eslint/js'
import globals from 'globals'
import reactHooks from 'eslint-plugin-react-hooks'
import reactRefresh from 'eslint-plugin-react-refresh'
import tseslint from 'typescript-eslint'
import { defineConfig, globalIgnores } from 'eslint/config'

export default defineConfig([
  // Build and report output, plus `videos/` — a separate Remotion workspace
  // with its own package.json, node_modules, tsconfig and test runner. All
  // three are gitignored; linting them only ever reported on code this
  // project does not build, against a React version it does not use.
  globalIgnores(['dist', 'coverage', 'videos']),
  {
    files: ['**/*.{ts,tsx}'],
    extends: [
      js.configs.recommended,
      tseslint.configs.recommended,
      reactHooks.configs.flat.recommended,
      reactRefresh.configs.vite,
    ],
    languageOptions: {
      ecmaVersion: 2020,
      globals: globals.browser,
    },
    rules: {
      // Allow unused variables/args starting with _ (conventional placeholder prefix).
      '@typescript-eslint/no-unused-vars': ['error', {
        argsIgnorePattern: '^_',
        varsIgnorePattern: '^_',
        caughtErrorsIgnorePattern: '^_',
      }],
      // Forbid deep imports into superdough's source files (e.g.
      // `superdough/superdoughoutput.mjs`, `superdough/nodePools.mjs`).
      // The npm package ships a bundled `dist/index.mjs` as its `main`;
      // importing source paths creates a *second* module graph with its
      // own module-level `audioContext` / `controller` state that the
      // bundled `setAudioContext` never updates, leading to silent
      // cross-context AudioNode connect failures during WAV export.
      // Always import from the package root: `import { ... } from 'superdough'`.
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            {
              group: ['superdough/*'],
              message:
                'Import from the "superdough" package entry only. Deep imports into source files create a duplicate module graph and break offline rendering (cross-AudioContext connect errors).',
            },
          ],
        },
      ],
    },
  },
])
