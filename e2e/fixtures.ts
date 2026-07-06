/**
 * Shared Playwright fixtures for the Hardcopy E2E suite (issue #31).
 *
 * What they provide:
 *
 * - A persistent Chromium context with the built `.output/chrome-mv3`
 *   extension loaded (Playwright's chrome-extensions recipe; `channel:
 *   'chromium'` so the new headless mode — which supports extensions —
 *   is used).
 * - A fully mocked claude.ai: `context.route()` serves a minimal
 *   conversation page at `/chat/{uuid}` and answers the two API endpoints
 *   the extension calls (`/api/organizations` and the conversation fetch)
 *   from `tests/fixtures/*.json`. A catch-all route aborts everything else,
 *   so no request can escape to the real network — `escapedRequests` is
 *   asserted empty after every test.
 * - Popup-opening helpers. The popup decides what to show from the *active
 *   tab*, so:
 *   - `openPopupAsActiveTab()` opens `chrome-extension://<id>/popup.html`
 *     in a tab of its own; that tab is then the active one, which is exactly
 *     the "not on claude.ai" case.
 *   - `openPopupFor(claudePage)` opens the popup page, waits (from inside
 *     the extension context) until the claude.ai tab's content script
 *     answers probes, re-activates the claude.ai tab, and reloads the popup
 *     so its startup probe targets that tab — the same shape as clicking the
 *     toolbar icon on a claude.ai tab.
 */

import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { chromium, expect, test as base } from '@playwright/test';
import type { BrowserContext, Page } from '@playwright/test';

import { EXTENSION_ID_ENV } from './global-setup';

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const EXTENSION_PATH = path.join(REPO_ROOT, '.output', 'chrome-mv3');
const FIXTURES_DIR = path.join(REPO_ROOT, 'tests', 'fixtures');

/** The one organization the mocked `/api/organizations` returns. */
export const MOCK_ORG_ID = 'e2e0f00d-1111-4222-8333-444444444444';

/** A conversation fixture from tests/fixtures, ready to serve and assert on. */
export interface ConversationFixture {
  /** Basename under tests/fixtures, e.g. `'simple-text'`. */
  name: string;
  /** The conversation UUID (the payload's `uuid`) — also the page URL's id. */
  id: string;
  /** The conversation title (the payload's `name`). */
  title: string;
  /** The full payload the mocked conversation endpoint serves. */
  payload: Record<string, unknown>;
}

/** Load one of the sanitized conversation payloads from tests/fixtures. */
export function loadConversationFixture(name: string): ConversationFixture {
  const raw = readFileSync(path.join(FIXTURES_DIR, `${name}.json`), 'utf8');
  const payload = JSON.parse(raw) as Record<string, unknown>;
  const { uuid, name: title } = payload;
  if (typeof uuid !== 'string' || typeof title !== 'string') {
    throw new Error(`Fixture ${name}.json has no string uuid/name`);
  }
  return { name, id: uuid, title, payload };
}

/** Minimal conversation page: enough DOM for a real claude.ai tab to exist. */
function conversationPageHtml(title: string): string {
  const safeTitle = title.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  return [
    '<!doctype html>',
    '<html lang="en">',
    `<head><meta charset="utf-8"><title>${safeTitle} - Claude</title></head>`,
    '<body><main><p>Mocked claude.ai conversation page for the Hardcopy E2E suite.</p></main></body>',
    '</html>',
  ].join('\n');
}

const CONVERSATION_API_PATTERN = /^\/api\/organizations\/[^/]+\/chat_conversations\/([^/]+)$/;
const CONVERSATION_PAGE_PATTERN = /^\/chat\/([^/]+)$/;

interface HardcopyFixtures {
  /** Persistent Chromium context with the built extension loaded. */
  context: BrowserContext;
  /** The extension's ID, computed by global setup from the manifest key. */
  extensionId: string;
  /** URLs of requests that tried to leave the mocked claude.ai (must stay empty). */
  escapedRequests: string[];
  /** The mocked claude.ai: conversations served, keyed by conversation UUID. */
  mockedClaude: Map<string, ConversationFixture>;
  /** Open a mocked claude.ai tab showing `fixture`'s conversation. */
  openConversationPage: (fixture: ConversationFixture) => Promise<Page>;
  /** Open popup.html as the active tab — the "not on claude.ai" shape. */
  openPopupAsActiveTab: () => Promise<Page>;
  /** Open the popup with `claudePage`'s tab active, like the toolbar click. */
  openPopupFor: (claudePage: Page) => Promise<Page>;
}

export const test = base.extend<HardcopyFixtures>({
  // eslint-disable-next-line no-empty-pattern -- Playwright fixture signature
  context: async ({}, use, testInfo) => {
    const context = await chromium.launchPersistentContext('', {
      channel: 'chromium', // full Chromium: the headless shell cannot load extensions
      headless: true,
      acceptDownloads: true,
      // 1 for the E2E suite; the store-screenshot generator renders at 2×
      // and downscales, so listing images come out supersampled and crisp
      // (playwright.store.config.ts sets the variable).
      deviceScaleFactor: Number(process.env.HARDCOPY_STORE_SCALE ?? '1'),
      args: [`--disable-extensions-except=${EXTENSION_PATH}`, `--load-extension=${EXTENSION_PATH}`],
    });
    // We create the context ourselves, so the runner's `trace` option cannot
    // manage tracing — do it manually and keep the trace only on failure.
    await context.tracing.start({ screenshots: true, snapshots: true });
    await use(context);
    if (testInfo.status === testInfo.expectedStatus) {
      await context.tracing.stop();
    } else {
      const tracePath = testInfo.outputPath('trace.zip');
      await context.tracing.stop({ path: tracePath });
      testInfo.attachments.push({
        name: 'trace',
        path: tracePath,
        contentType: 'application/zip',
      });
    }
    await context.close();
  },

  // eslint-disable-next-line no-empty-pattern -- Playwright fixture signature
  extensionId: async ({}, use) => {
    const id = process.env[EXTENSION_ID_ENV];
    if (id === undefined || id === '') {
      throw new Error(`${EXTENSION_ID_ENV} is not set — did global setup run?`);
    }
    await use(id);
  },

  // eslint-disable-next-line no-empty-pattern -- Playwright fixture signature
  escapedRequests: async ({}, use) => {
    const escaped: string[] = [];
    await use(escaped);
    expect(escaped, 'no request may escape the mocked claude.ai').toEqual([]);
  },

  mockedClaude: [
    async ({ context, escapedRequests }, use) => {
      /** Conversations the mock serves, keyed by conversation UUID. */
      const conversations = new Map<string, ConversationFixture>();

      // Routes are matched newest-first, so the catch-all goes in first.
      await context.route('**/*', async (route) => {
        const url = new URL(route.request().url());
        if (url.protocol !== 'https:' && url.protocol !== 'http:') {
          // chrome-extension:// and other internal schemes — not network.
          await route.continue();
        } else if (url.origin === 'https://claude.ai') {
          // Unmocked claude.ai path (favicon and friends): harmless, block it.
          await route.fulfill({ status: 404, body: 'Not mocked' });
        } else {
          escapedRequests.push(url.href);
          await route.abort();
        }
      });

      await context.route('https://claude.ai/api/organizations', async (route) => {
        await route.fulfill({
          json: [{ uuid: MOCK_ORG_ID, name: 'Hardcopy E2E', capabilities: ['chat'] }],
        });
      });

      await context.route(
        (url) => url.origin === 'https://claude.ai' && CONVERSATION_API_PATTERN.test(url.pathname),
        async (route) => {
          const url = new URL(route.request().url());
          const id = CONVERSATION_API_PATTERN.exec(url.pathname)?.[1] ?? '';
          const fixture = conversations.get(id);
          if (fixture === undefined) {
            await route.fulfill({ status: 404, json: { error: 'Unknown conversation' } });
          } else {
            await route.fulfill({ json: fixture.payload });
          }
        },
      );

      await context.route(
        (url) => url.origin === 'https://claude.ai' && CONVERSATION_PAGE_PATTERN.test(url.pathname),
        async (route) => {
          const url = new URL(route.request().url());
          const id = CONVERSATION_PAGE_PATTERN.exec(url.pathname)?.[1] ?? '';
          const title = conversations.get(id)?.title ?? 'Unknown conversation';
          await route.fulfill({ contentType: 'text/html', body: conversationPageHtml(title) });
        },
      );

      await use(conversations);
    },
    { auto: true },
  ],

  openConversationPage: async ({ context, mockedClaude }, use) => {
    await use(async (fixture) => {
      mockedClaude.set(fixture.id, fixture);
      const page = await context.newPage();
      await page.goto(`https://claude.ai/chat/${fixture.id}`);
      return page;
    });
  },

  openPopupAsActiveTab: async ({ context, extensionId }, use) => {
    await use(async () => {
      const popup = await context.newPage();
      await popup.goto(`chrome-extension://${extensionId}/popup.html`);
      return popup;
    });
  },

  openPopupFor: async ({ context, extensionId }, use) => {
    await use(async (claudePage) => {
      const claudeUrl = claudePage.url();
      const popup = await context.newPage();
      await popup.goto(`chrome-extension://${extensionId}/popup.html`);
      // From inside the extension context: wait until the claude.ai tab's
      // content script answers a probe (so the popup's startup probe cannot
      // race its injection), then make that tab the active one again.
      await popup.evaluate(async (targetUrl) => {
        interface TabsApi {
          query(info: { url: string }): Promise<{ id?: number; url?: string }[]>;
          sendMessage(tabId: number, message: unknown): Promise<unknown>;
          update(tabId: number, props: { active: boolean }): Promise<unknown>;
        }
        const { tabs } = (globalThis as unknown as { chrome: { tabs: TabsApi } }).chrome;
        const matches = await tabs.query({ url: 'https://claude.ai/*' });
        const tab = matches.find((candidate) => candidate.url === targetUrl);
        if (tab?.id === undefined) {
          throw new Error(`No claude.ai tab found for ${targetUrl}`);
        }
        for (let attempt = 0; ; attempt += 1) {
          try {
            await tabs.sendMessage(tab.id, { type: 'hardcopy:probe' });
            break;
          } catch (error) {
            if (attempt >= 100) {
              throw error;
            }
            await new Promise((resolve) => setTimeout(resolve, 50));
          }
        }
        await tabs.update(tab.id, { active: true });
      }, claudeUrl);
      // Re-run the popup's startup probe now that the claude.ai tab is active.
      await popup.reload();
      return popup;
    });
  },
});

export { expect } from '@playwright/test';
