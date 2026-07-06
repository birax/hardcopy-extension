/**
 * Full export E2E specs (issue #31): click Export in the real popup, let the
 * content script fetch from the mocked claude.ai API, serialize, and trigger
 * the in-page download — then assert on the actual downloaded bytes.
 *
 * The PDF spec is the important one architecturally: PDF only works if the
 * content script's *native* dynamic `import()` of the serializer side-bundle
 * (`/serializers/serialize.js`, plus its lazy pdf chunk and fonts) resolves
 * inside a real browser — the project's biggest assumption that unit tests
 * cannot touch (see src/lib/flow/serializer-loader.ts).
 */

import { readFileSync } from 'node:fs';

import type { Page } from '@playwright/test';

import { expectedSerializedText } from './expected-output';
import { expect, loadConversationFixture, test } from './fixtures';

const simpleText = loadConversationFixture('simple-text');

/** Pick a format in the popup, click Export, and capture the download. */
async function exportAs(popup: Page, claudePage: Page, format: 'markdown' | 'pdf') {
  await popup.locator(`input[name="format"][value="${format}"]`).check();
  // The download is triggered by an in-page anchor click in the *claude.ai*
  // tab (src/lib/flow/download.ts), so the event fires there, not on the popup.
  const downloadPromise = claudePage.waitForEvent('download');
  await popup.getByRole('button', { name: 'Export' }).click();
  return downloadPromise;
}

test('markdown export downloads exactly the serializer output', async ({
  openConversationPage,
  openPopupFor,
}) => {
  const claudePage = await openConversationPage(simpleText);
  const popup = await openPopupFor(claudePage);
  await expect(popup.getByRole('button', { name: 'Export' })).toBeEnabled();

  const download = await exportAs(popup, claudePage, 'markdown');

  // Filename: default template `{title} - {date}.{ext}` with the fixture's
  // title and created_at date.
  expect(download.suggestedFilename()).toBe('Planning a vegetable garden - 2026-05-14.md');

  // Byte-for-byte what the serializer produces for this fixture with the
  // default options (computed by running the same pipeline in Node).
  const downloaded = readFileSync(await download.path(), 'utf8');
  expect(downloaded).toBe(await expectedSerializedText(simpleText, 'markdown'));

  await expect(popup.locator('.banner--success')).toContainText('Saved to Downloads');
  await expect(popup.locator('.banner--success .filename')).toHaveText(
    download.suggestedFilename(),
  );
});

test('PDF export lazy-loads the serializer bundle in the content script', async ({
  openConversationPage,
  openPopupFor,
}) => {
  const claudePage = await openConversationPage(simpleText);
  const popup = await openPopupFor(claudePage);
  await expect(popup.getByRole('button', { name: 'Export' })).toBeEnabled();

  const download = await exportAs(popup, claudePage, 'pdf');

  expect(download.suggestedFilename()).toBe('Planning a vegetable garden - 2026-05-14.pdf');

  // A real PDF came out the other end: the dynamic import of
  // /serializers/serialize.js (and its lazy pdf-lib chunk) worked in the
  // content-script context of a real browser.
  const bytes = readFileSync(await download.path());
  expect(bytes.subarray(0, 5).toString('latin1')).toBe('%PDF-');
  expect(bytes.byteLength).toBeGreaterThan(1_000);

  await expect(popup.locator('.banner--success')).toContainText('Saved to Downloads');
});
