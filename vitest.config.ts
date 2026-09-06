// vitest.config.ts
import { defineConfig } from 'vitest/config';

export default defineConfig({
  // `@kabelsalat/web` has no `exports` map, so Node resolution picks its `main`
  // (CJS) while the browser build picks `module` (ESM) — and @strudel/core
  // imports a named export that only the ESM build has. Pointing straight at
  // that build is what lets a test import @strudel/* at all; without it the
  // import fails before any assertion runs. `inline` is needed alongside it so
  // Vite processes those packages rather than handing them to Node, which is
  // what makes the alias apply.
  resolve: {
    alias: {
      '@kabelsalat/web': new URL('./node_modules/@kabelsalat/web/dist/index.mjs', import.meta.url).pathname,
    },
  },
  test: {
    environment: 'node',
    include: ['src/**/*.{test,spec}.{ts,tsx}', 'tests/**/*.{test,spec}.{ts,tsx}'],
    server: { deps: { inline: [/@strudel/, /@kabelsalat/] } },
  },
});
