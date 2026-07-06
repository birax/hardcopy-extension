/**
 * Playwright configuration for the store-screenshot generator (issue #20).
 *
 * This is NOT part of the CI E2E suite: the main playwright.config.ts only
 * matches `*.e2e.ts`, and this config only matches `*.store.ts`, so
 * `pnpm test:e2e` and `pnpm store:screenshots` never overlap. Run:
 *
 *   pnpm store:screenshots
 *
 * to (re)generate the committed listing screenshots in
 * assets/store/screenshots/ against the same mocked claude.ai the E2E suite
 * uses (e2e/fixtures.ts). See docs/store/assets-README.md.
 */

import { defineConfig } from '@playwright/test';

// Render the compositions at 2× and downscale to exactly 1280×800 — the text
// comes out supersampled and crisp. (Also set in the spec so the worker sees
// it before the browser context launches.)
process.env.HARDCOPY_STORE_SCALE = '2';

export default defineConfig({
  testDir: 'e2e',
  testMatch: /.*\.store\.ts$/,
  globalSetup: './e2e/global-setup',
  // One persistent context (one Chromium profile + extension) at a time,
  // same as the E2E suite.
  workers: 1,
  fullyParallel: false,
  retries: 0,
  timeout: 120_000,
  reporter: [['list']],
  projects: [{ name: 'store-screenshots' }],
});
