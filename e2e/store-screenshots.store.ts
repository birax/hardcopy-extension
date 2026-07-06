/**
 * Store-screenshot generator (issue #20) — `pnpm store:screenshots`.
 *
 * NOT part of the CI E2E suite: only playwright.store.config.ts matches
 * `*.store.ts`. It reuses the E2E fixtures (built extension + fully mocked
 * claude.ai, e2e/fixtures.ts) to capture the real popup and options page,
 * lays each capture into a 1280×800 composition (e2e/store/composition.ts),
 * renders that composition at 2×, and downscales with sharp to the exact
 * 1280×800 PNGs committed under assets/store/screenshots/.
 *
 * Everything visible comes from the synthetic garden-planning fixture
 * (tests/fixtures/simple-text.json) — no real user data, no Anthropic
 * branding (ADR 0004).
 */

import { mkdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import type { BrowserContext } from '@playwright/test';
import sharp from 'sharp';

import { expect, loadConversationFixture, test } from './fixtures';
import {
  SHOT_HEIGHT,
  SHOT_WIDTH,
  documentScene,
  optionsScene,
  popupOverChatScene,
} from './store/composition';

// The context fixture reads this before launching Chromium: render at 2×,
// then downscale — supersampled text stays crisp at 1280×800.
process.env.HARDCOPY_STORE_SCALE = '2';

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const OUT_DIR = path.join(REPO_ROOT, 'assets', 'store', 'screenshots');

const simpleText = loadConversationFixture('simple-text');

/**
 * Captions, one benefit statement per shot (docs/design/design-system.md §9:
 * sentence case, no exclamation marks). The two-digit prefix is the intended
 * store upload order — see docs/store/listing-copy.md.
 */
const CAPTIONS = {
  ready: 'Export chats from Claude to Markdown, PDF, Word, RTF or plain text',
  saved: 'One click, saved to Downloads — nothing leaves your browser',
  document: 'Exports keep the details — tables, code, thinking blocks, timestamps',
  options: 'Choose your defaults once — format, filename and what to include',
  dark: 'At home in light and dark — the popup follows your browser theme',
} as const;

/** Encode a PNG capture for direct embedding in a composition page. */
function toDataUri(png: Buffer): string {
  return `data:image/png;base64,${png.toString('base64')}`;
}

/** Render a composition page and write it as an exact 1280×800 PNG. */
async function renderShot(context: BrowserContext, html: string, filename: string): Promise<void> {
  mkdirSync(OUT_DIR, { recursive: true });
  const page = await context.newPage();
  await page.setViewportSize({ width: SHOT_WIDTH, height: SHOT_HEIGHT });
  await page.setContent(html);
  const raw = await page.screenshot({ type: 'png' });
  await sharp(raw).resize(SHOT_WIDTH, SHOT_HEIGHT).png().toFile(path.join(OUT_DIR, filename));
  await page.close();
}

test('popup ready state, light (01) and dark (05)', async ({
  context,
  openConversationPage,
  openPopupFor,
}) => {
  const claudePage = await openConversationPage(simpleText);
  const popup = await openPopupFor(claudePage);
  await expect(popup.locator('.conversation')).toHaveText(simpleText.title);
  await expect(popup.getByRole('button', { name: 'Export' })).toBeEnabled();

  const light = await popup.locator('body').screenshot();
  await renderShot(
    context,
    popupOverChatScene({
      theme: 'light',
      caption: CAPTIONS.ready,
      popupDataUri: toDataUri(light),
      conversationTitle: simpleText.title,
    }),
    '01-popup-ready.png',
  );

  await popup.emulateMedia({ colorScheme: 'dark' });
  const dark = await popup.locator('body').screenshot();
  await renderShot(
    context,
    popupOverChatScene({
      theme: 'dark',
      caption: CAPTIONS.dark,
      popupDataUri: toDataUri(dark),
      conversationTitle: simpleText.title,
    }),
    '05-dark-mode.png',
  );
});

test('export success state (02) and the exported Markdown document (03)', async ({
  context,
  openConversationPage,
  openPopupFor,
}) => {
  const claudePage = await openConversationPage(simpleText);
  const popup = await openPopupFor(claudePage);
  await expect(popup.getByRole('button', { name: 'Export' })).toBeEnabled();

  await popup.locator('input[name="format"][value="markdown"]').check();
  // The download fires in the claude.ai tab (in-page anchor click), not the popup.
  const downloadPromise = claudePage.waitForEvent('download');
  await popup.getByRole('button', { name: 'Export' }).click();
  const download = await downloadPromise;
  await expect(popup.locator('.banner--success')).toContainText('Saved to Downloads');

  const success = await popup.locator('body').screenshot();
  await renderShot(
    context,
    popupOverChatScene({
      theme: 'light',
      caption: CAPTIONS.saved,
      popupDataUri: toDataUri(success),
      conversationTitle: simpleText.title,
      // The success banner makes this state taller — shrink and raise the
      // popup so the Export button is not sliced by the bottom edge.
      popupWidth: 328,
      popupTop: 20,
    }),
    '02-saved-to-downloads.png',
  );

  const markdown = readFileSync(await download.path(), 'utf8');
  await renderShot(
    context,
    documentScene({
      caption: CAPTIONS.document,
      filename: download.suggestedFilename(),
      markdown,
    }),
    '03-markdown-export.png',
  );
});

test('options page (04)', async ({ context, extensionId }) => {
  const page = await context.newPage();
  // Capture a little more than is displayed (950 CSS px wide below), so the
  // whole window card fits inside the stage with the filename section visible.
  await page.setViewportSize({ width: 1000, height: 640 });
  await page.goto(`chrome-extension://${extensionId}/options.html`);
  await expect(page.getByRole('heading', { name: 'Hardcopy settings' })).toBeVisible();

  const capture = await page.screenshot({ type: 'png' });
  await renderShot(
    context,
    optionsScene({
      caption: CAPTIONS.options,
      optionsDataUri: toDataUri(capture),
      width: 950,
    }),
    '04-options.png',
  );
});
