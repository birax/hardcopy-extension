/**
 * Playwright configuration for the E2E suite (issue #31): the built
 * chrome-mv3 extension in a persistent Chromium context against a fully
 * mocked claude.ai. See e2e/fixtures.ts for the recipe and docs/CONTRIBUTING.md
 * for how to run it (`pnpm test:e2e`).
 */

import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: 'e2e',
  // `.e2e.ts`, not `.spec.ts`/`.test.ts`, so Vitest's default include never
  // picks these up (vitest.config.ts stays untouched).
  testMatch: /.*\.e2e\.ts$/,
  globalSetup: './e2e/global-setup',
  // One persistent context (one Chromium profile + extension) at a time:
  // parallel workers would each launch their own browser for little gain
  // across four specs, and CI runners are small.
  workers: 1,
  fullyParallel: false,
  forbidOnly: process.env.CI !== undefined,
  retries: process.env.CI === undefined ? 0 : 1,
  timeout: 60_000,
  reporter: process.env.CI === undefined ? [['list']] : [['list'], ['html', { open: 'never' }]],
  projects: [
    {
      // The browser is launched by the `context` fixture (persistent context
      // with --load-extension; bundled Chromium only — branded Chrome/Edge
      // dropped extension side-loading), so no `use.browserName` here.
      name: 'chromium-extension',
    },
  ],
});
