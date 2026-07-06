/**
 * Packaged-serializer loader tests. The real bundle only exists inside a
 * built extension, so the loader is pointed at data: URLs (which node's
 * native import() accepts) to exercise the load, caching, and retry paths.
 */

import { afterEach, describe, expect, it, vi } from 'vitest';
import { fakeBrowser } from 'wxt/testing';

import { loadPackagedSerializer, SERIALIZER_BUNDLE_PATH } from '../src/lib/flow/serializer-loader';

const FAKE_MODULE =
  'data:text/javascript,export const serializeConversation = ' +
  '(prepared, format) => Promise.resolve({ bytes: new Uint8Array([1]), mimeType: format, extension: format });';

describe('loadPackagedSerializer', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('imports the packaged bundle from its runtime URL and caches it', async () => {
    const getURL = vi
      .spyOn(fakeBrowser.runtime, 'getURL')
      .mockReturnValue(FAKE_MODULE as ReturnType<typeof fakeBrowser.runtime.getURL>);

    const first = await loadPackagedSerializer();
    const second = await loadPackagedSerializer();

    expect(getURL).toHaveBeenCalledWith(SERIALIZER_BUNDLE_PATH);
    expect(getURL).toHaveBeenCalledTimes(1); // cached after the first load
    expect(second).toBe(first);

    const payload = await first(undefined as never, 'pdf');
    expect(payload).toMatchObject({ mimeType: 'pdf', extension: 'pdf' });
  });

  it('does not cache a failed load, so the next export can retry', async () => {
    // The cache was primed by the previous test within this module's
    // lifetime; a failing URL must not poison it — force a fresh module.
    vi.resetModules();
    const loader = await import('../src/lib/flow/serializer-loader');

    const getURL = vi
      .spyOn(fakeBrowser.runtime, 'getURL')
      .mockReturnValue('data:text/javascript,throw new Error("boom")' as ReturnType<
        typeof fakeBrowser.runtime.getURL
      >);

    await expect(loader.loadPackagedSerializer()).rejects.toThrow();
    expect(getURL).toHaveBeenCalledTimes(1);

    // Retry succeeds and is then cached.
    getURL.mockReturnValue(FAKE_MODULE as ReturnType<typeof fakeBrowser.runtime.getURL>);
    const serialize = await loader.loadPackagedSerializer();
    await expect(loader.loadPackagedSerializer()).resolves.toBe(serialize);
    expect(getURL).toHaveBeenCalledTimes(2);
  });
});
