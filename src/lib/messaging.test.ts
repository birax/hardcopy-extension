import { describe, expect, it, vi } from 'vitest';

import { serializeConversation } from './export/serialize';
import type { ExportFlowDeps } from './flow/export';
import {
  EXPORT_MESSAGE_TYPE,
  handleExport,
  handleProbe,
  isExportRequest,
  isProbeRequest,
  PROBE_MESSAGE_TYPE,
} from './messaging';

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
    ).resolves.toEqual({ conversationId: CONV, loggedIn: true, conversationTitle: null });
  });

  it('reads the conversation title from the document title, stripping the suffix', async () => {
    await expect(
      handleProbe({
        fetchImpl: fetchReturning([{ uuid: ORG }]),
        pathname: `/chat/${CONV}`,
        documentTitle: 'Birthday cake ideas - Claude',
      }),
    ).resolves.toMatchObject({ conversationTitle: 'Birthday cake ideas' });
  });

  it('reports no title for bare or product-only document titles', async () => {
    const fetchImpl = fetchReturning([{ uuid: ORG }]);
    await expect(
      handleProbe({ fetchImpl, pathname: `/chat/${CONV}`, documentTitle: 'Claude' }),
    ).resolves.toMatchObject({ conversationTitle: null });
    await expect(
      handleProbe({ fetchImpl, pathname: `/chat/${CONV}`, documentTitle: '   ' }),
    ).resolves.toMatchObject({ conversationTitle: null });
  });

  it('never reports a title when the tab is not on a conversation', async () => {
    await expect(
      handleProbe({
        fetchImpl: fetchReturning([{ uuid: ORG }]),
        pathname: '/new',
        documentTitle: 'Some page - Claude',
      }),
    ).resolves.toEqual({ conversationId: null, loggedIn: true, conversationTitle: null });
  });

  it('degrades API failures to loggedIn: false', async () => {
    await expect(
      handleProbe({ fetchImpl: fetchReturning({}, 401), pathname: `/chat/${CONV}` }),
    ).resolves.toEqual({ conversationId: CONV, loggedIn: false, conversationTitle: null });

    const offline = vi.fn(async () => {
      throw new TypeError('Failed to fetch');
    }) as unknown as typeof fetch;
    await expect(handleProbe({ fetchImpl: offline, pathname: '/new' })).resolves.toEqual({
      conversationId: null,
      loggedIn: false,
      conversationTitle: null,
    });
  });

  it('rethrows non-API errors instead of masking them as logged-out', async () => {
    // A fetch impl that resolves to a non-Response makes the client blow up
    // with a plain TypeError (not an ApiError), which must propagate.
    const broken = vi.fn(async () => undefined) as unknown as typeof fetch;
    await expect(handleProbe({ fetchImpl: broken, pathname: '/new' })).rejects.toThrow(TypeError);
  });
});

describe('isExportRequest', () => {
  it('accepts a well-formed export message', () => {
    expect(isExportRequest({ type: EXPORT_MESSAGE_TYPE, format: 'markdown' })).toBe(true);
    expect(
      isExportRequest({
        type: EXPORT_MESSAGE_TYPE,
        format: 'pdf',
        options: { includeThinking: true },
      }),
    ).toBe(true);
  });

  it('rejects wrong types, missing formats, and unknown formats', () => {
    expect(isExportRequest(undefined)).toBe(false);
    expect(isExportRequest({ type: PROBE_MESSAGE_TYPE })).toBe(false);
    expect(isExportRequest({ type: EXPORT_MESSAGE_TYPE })).toBe(false);
    expect(isExportRequest({ type: EXPORT_MESSAGE_TYPE, format: 'epub' })).toBe(false);
    expect(isExportRequest({ type: EXPORT_MESSAGE_TYPE, format: 42 })).toBe(false);
  });
});

describe('handleExport', () => {
  function deps(fetchImpl: typeof fetch): ExportFlowDeps {
    return {
      fetchImpl,
      pathname: `/chat/${CONV}`,
      cookie: '',
      serialize: serializeConversation,
      download: vi.fn(),
      now: () => new Date('2026-07-06T00:00:00Z'),
    };
  }

  it('runs the orchestrator and relays its outcome', async () => {
    await expect(
      handleExport(
        { type: EXPORT_MESSAGE_TYPE, format: 'markdown' },
        deps(fetchReturning({}, 401)),
      ),
    ).resolves.toMatchObject({ ok: false, kind: 'logged-out' });
  });

  it('rejects formats that bypassed isExportRequest', async () => {
    await expect(
      handleExport({ type: EXPORT_MESSAGE_TYPE, format: 'epub' }, deps(fetchReturning([]))),
    ).rejects.toThrow(/unsupported export format/i);
  });

  it('maps unexpected orchestrator rejections to a serializer-failure outcome', async () => {
    // fetch resolving to a non-Response is a programming error: runExport
    // rethrows it, and handleExport must still answer the message channel.
    const broken = vi.fn(async () => undefined) as unknown as typeof fetch;
    await expect(
      handleExport({ type: EXPORT_MESSAGE_TYPE, format: 'markdown' }, deps(broken)),
    ).resolves.toMatchObject({
      ok: false,
      kind: 'serializer-failure',
      detail: expect.any(String) as string,
    });
  });
});
