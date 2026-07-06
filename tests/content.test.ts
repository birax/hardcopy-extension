import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { fakeBrowser } from 'wxt/testing';

import { PROBE_MESSAGE_TYPE } from '../src/lib/messaging';
import content from '../src/entrypoints/content';

const ORG = '11111111-2222-4333-8444-555555555555';

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
      expect(sendResponse).toHaveBeenCalledWith({ conversationId: null, loggedIn: true });
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
      expect(sendResponse).toHaveBeenCalledWith({ conversationId: null, loggedIn: false });
    });
  });

  it('ignores unrelated messages', () => {
    const listener = registerContentScript();

    const sendResponse = vi.fn();
    const result = listener({ type: 'something-else' }, {}, sendResponse);

    expect(result).toBeUndefined();
    expect(sendResponse).not.toHaveBeenCalled();
  });
});
