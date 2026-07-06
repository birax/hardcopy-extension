import { describe, expect, it, vi } from 'vitest';

import { handleProbe, isProbeRequest, PROBE_MESSAGE_TYPE } from './messaging';

const CONV = 'aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee';
const ORG = '11111111-2222-4333-8444-555555555555';

function fetchReturning(body: unknown, status = 200): typeof fetch {
  return vi.fn(async () => new Response(JSON.stringify(body), { status })) as typeof fetch;
}

describe('isProbeRequest', () => {
  it('accepts a probe message', () => {
    expect(isProbeRequest({ type: PROBE_MESSAGE_TYPE })).toBe(true);
  });

  it('rejects everything else', () => {
    expect(isProbeRequest(undefined)).toBe(false);
    expect(isProbeRequest(null)).toBe(false);
    expect(isProbeRequest('hardcopy:probe')).toBe(false);
    expect(isProbeRequest({ type: 'hardcopy:export' })).toBe(false);
  });
});

describe('handleProbe', () => {
  it('reports the conversation and a logged-in session', async () => {
    await expect(
      handleProbe({ fetchImpl: fetchReturning([{ uuid: ORG }]), pathname: `/chat/${CONV}` }),
    ).resolves.toEqual({ conversationId: CONV, loggedIn: true });
  });

  it('degrades API failures to loggedIn: false', async () => {
    await expect(
      handleProbe({ fetchImpl: fetchReturning({}, 401), pathname: `/chat/${CONV}` }),
    ).resolves.toEqual({ conversationId: CONV, loggedIn: false });

    const offline = vi.fn(async () => {
      throw new TypeError('Failed to fetch');
    }) as unknown as typeof fetch;
    await expect(handleProbe({ fetchImpl: offline, pathname: '/new' })).resolves.toEqual({
      conversationId: null,
      loggedIn: false,
    });
  });

  it('rethrows non-API errors instead of masking them as logged-out', async () => {
    // A fetch impl that resolves to a non-Response makes the client blow up
    // with a plain TypeError (not an ApiError), which must propagate.
    const broken = vi.fn(async () => undefined) as unknown as typeof fetch;
    await expect(handleProbe({ fetchImpl: broken, pathname: '/new' })).rejects.toThrow(TypeError);
  });
});
