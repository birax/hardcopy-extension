/**
 * Popup-state E2E specs (issue #31): the two probe outcomes a user actually
 * sees first — "not on claude.ai" and "ready on a conversation" — exercised
 * against the built extension in a real Chromium.
 */

import { expect, loadConversationFixture, test } from './fixtures';

const simpleText = loadConversationFixture('simple-text');

test('popup on a non-claude.ai tab shows the "nothing to export" state', async ({
  openPopupAsActiveTab,
}) => {
  // The popup page itself is the active tab here — a chrome-extension:// URL,
  // which is exactly the "active tab is not claude.ai" case.
  const popup = await openPopupAsActiveTab();

  const banner = popup.locator('.banner');
  await expect(banner).toContainText('Nothing to export here');
  await expect(banner).toContainText('Hardcopy works on claude.ai conversations');
  await expect(popup.getByRole('button', { name: 'Export' })).toBeDisabled();
});

test('popup reaches ready on a mocked conversation tab and shows its title', async ({
  openConversationPage,
  openPopupFor,
}) => {
  const claudePage = await openConversationPage(simpleText);
  const popup = await openPopupFor(claudePage);

  // Ready state: the probe found the conversation (title comes from the
  // mocked page's <title>) and the session counts as logged in (the mocked
  // /api/organizations answered) — so the export controls are live.
  await expect(popup.locator('.conversation')).toHaveText(simpleText.title);
  await expect(popup.getByRole('button', { name: 'Export' })).toBeEnabled();
});
