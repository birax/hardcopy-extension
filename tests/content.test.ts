import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { fakeBrowser } from 'wxt/testing';

import { EXPORT_MESSAGE_TYPE, PROBE_MESSAGE_TYPE } from '../src/lib/messaging';
import content from '../src/entrypoints/content';
import { loadFixture } from './harness';

// The content script's default deps reach for the packaged serializer bundle
// (import(browser.runtime.getURL(...))) and the in-page download anchor;
// neither exists under node, so pin them to the real registry and a spy.
vi.mock('../src/lib/flow/serializer-loader', async () => {
  const { serializeConversation } = await import('../src/lib/export/serialize');
  return {
    SERIALIZER_BUNDLE_PATH: '/serializers/serialize.js',
    loadPackagedSerializer: vi.fn(async () => serializeConversation),
  };
});

vi.mock('../src/lib/flow/download', () => ({
  triggerDownload: vi.fn(),
}));

const ORG = '11111111-2222-4333-8444-555555555555';
const CONV = 'aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee';

type OnMessageListener = (
  message: unknown,
  sender: unknown,
  sendResponse: (response: unknown) => void,
) => unknown;

/** Run the content script and capture the listener it registers. */
function registerContentScript(): OnMessageListener {
  const addListener = vi.spyOn(fakeBrowser.runtime.onMessage, 'addListener');
  content.main(undefined as never);
  const listener = addListener.mock.calls[0]?.[0];
  if (listener === undefined) {
    throw new Error('content script registered no onMessage listener');
  }
  return listener as OnMessageListener;
}

/** Serve /api/organizations and the conversation payload like claude.ai. */
function stubClaudeApi(): void {
  vi.stubGlobal(
    'fetch',
    vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      // Order matters: the conversation URL contains /api/organizations/ too.
      if (url.includes('/chat_conversations/')) {
        return new Response(JSON.stringify(loadFixture('simple-text').raw), { status: 200 });
      }
      if (url.includes('/api/organizations')) {
        return new Response(JSON.stringify([{ uuid: ORG }]), { status: 200 });
      }
      throw new Error(`Unexpected fetch: ${url}`);
    }),
  );
}

describe('content script', () => {
  beforeEach(() => {
    fakeBrowser.reset();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it('declares claude.ai as its only match', () => {
    expect(content.matches).toEqual(['https://claude.ai/*']);
  });

  it('answers hardcopy:probe and keeps the channel open for the async response', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response(JSON.stringify([{ uuid: ORG }]), { status: 200 })),
    );
    const listener = registerContentScript();

    const sendResponse = vi.fn();
    const result = listener({ type: PROBE_MESSAGE_TYPE }, {}, sendResponse);

    // Chrome MV3 contract: `true` keeps the message channel open.
    expect(result).toBe(true);
    await vi.waitFor(() => {
      expect(sendResponse).toHaveBeenCalledWith({
        conversationId: null,
        loggedIn: true,
        conversationTitle: null,
      });
    });
  });

  it('reports loggedIn: false when the session is rejected', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response('{}', { status: 403 })),
    );
    const listener = registerContentScript();

    const sendResponse = vi.fn();
    listener({ type: PROBE_MESSAGE_TYPE }, {}, sendResponse);

    await vi.waitFor(() => {
      expect(sendResponse).toHaveBeenCalledWith({
        conversationId: null,
        loggedIn: false,
        conversationTitle: null,
      });
    });
  });

  it('runs hardcopy:export end to end and answers with a success outcome', async () => {
    stubClaudeApi();
    vi.stubGlobal('location', { pathname: `/chat/${CONV}` });
    const { triggerDownload } = await import('../src/lib/flow/download');
    const listener = registerContentScript();

    const sendResponse = vi.fn();
    const result = listener({ type: EXPORT_MESSAGE_TYPE, format: 'markdown' }, {}, sendResponse);

    expect(result).toBe(true);
    await vi.waitFor(() => {
      expect(sendResponse).toHaveBeenCalledWith(
        expect.objectContaining({
          ok: true,
          filename: 'Planning a vegetable garden - 2026-05-14.md',
          warnings: [],
        }),
      );
    });
    expect(triggerDownload).toHaveBeenCalledWith(
      expect.objectContaining({
        filename: 'Planning a vegetable garden - 2026-05-14.md',
        mimeType: 'text/markdown',
      }),
    );
  });

  it('answers hardcopy:export with a typed failure when logged out', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response('{}', { status: 401 })),
    );
    vi.stubGlobal('location', { pathname: `/chat/${CONV}` });
    const listener = registerContentScript();

    const sendResponse = vi.fn();
    const result = listener({ type: EXPORT_MESSAGE_TYPE, format: 'pdf' }, {}, sendResponse);

    expect(result).toBe(true);
    await vi.waitFor(() => {
      expect(sendResponse).toHaveBeenCalledWith(
        expect.objectContaining({ ok: false, kind: 'logged-out' }),
      );
    });
  });

  it('rejects malformed export messages without opening the channel', () => {
    const listener = registerContentScript();

    const sendResponse = vi.fn();
    expect(listener({ type: EXPORT_MESSAGE_TYPE, format: 'epub' }, {}, sendResponse)).toBe(
      undefined,
    );
    expect(sendResponse).not.toHaveBeenCalled();
  });

  it('ignores unrelated messages', () => {
    const listener = registerContentScript();

    const sendResponse = vi.fn();
    const result = listener({ type: 'something-else' }, {}, sendResponse);

    expect(result).toBeUndefined();
    expect(sendResponse).not.toHaveBeenCalled();
  });
});
