import { describe, expect, it, vi } from 'vitest';

import {
  CLAUDE_ORIGIN,
  fetchConversation,
  fetchOrganizations,
  getCurrentConversationId,
  resolveOrgId,
} from './client';
import { NetworkError, NotFoundError, NotLoggedInError, UnexpectedShapeError } from './errors';

const ORG_A = '11111111-2222-4333-8444-555555555555';
const ORG_B = '99999999-8888-4777-8666-555555555555';
const CONV = 'aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee';

/** A `fetch` stub returning the given JSON (or status) for every request. */
function fetchReturning(body: unknown, status = 200): typeof fetch {
  return vi.fn(async () => new Response(JSON.stringify(body), { status })) as typeof fetch;
}

describe('fetchOrganizations', () => {
  it('returns organizations and preserves the raw entries', async () => {
    const fetchImpl = fetchReturning([
      { uuid: ORG_A, name: 'Personal', capabilities: ['chat'] },
      { uuid: ORG_B },
    ]);
    const orgs = await fetchOrganizations({ fetchImpl });

    expect(orgs).toHaveLength(2);
    expect(orgs[0]).toMatchObject({ uuid: ORG_A, name: 'Personal' });
    expect(orgs[0]?.raw).toMatchObject({ capabilities: ['chat'] });
    expect(orgs[1]).toMatchObject({ uuid: ORG_B, name: undefined });

    expect(fetchImpl).toHaveBeenCalledWith(
      `${CLAUDE_ORIGIN}/api/organizations`,
      expect.objectContaining({ credentials: 'include' }),
    );
  });

  it('throws NotLoggedInError on 401 and 403', async () => {
    await expect(fetchOrganizations({ fetchImpl: fetchReturning({}, 401) })).rejects.toThrow(
      NotLoggedInError,
    );
    await expect(fetchOrganizations({ fetchImpl: fetchReturning({}, 403) })).rejects.toThrow(
      NotLoggedInError,
    );
  });

  it('throws NotLoggedInError when the organization list is empty', async () => {
    await expect(fetchOrganizations({ fetchImpl: fetchReturning([]) })).rejects.toThrow(
      NotLoggedInError,
    );
  });

  it('throws UnexpectedShapeError on a non-array payload', async () => {
    await expect(
      fetchOrganizations({ fetchImpl: fetchReturning({ error: 'nope' }) }),
    ).rejects.toThrow(UnexpectedShapeError);
  });

  it('throws UnexpectedShapeError when an entry has no uuid', async () => {
    await expect(
      fetchOrganizations({ fetchImpl: fetchReturning([{ name: 'no uuid here' }]) }),
    ).rejects.toThrow(UnexpectedShapeError);
  });

  it('throws UnexpectedShapeError on non-JSON responses', async () => {
    const fetchImpl = vi.fn(
      async () => new Response('<html>maintenance</html>', { status: 200 }),
    ) as typeof fetch;
    await expect(fetchOrganizations({ fetchImpl })).rejects.toThrow(UnexpectedShapeError);
  });

  it('wraps transport failures in NetworkError', async () => {
    const fetchImpl = vi.fn(async () => {
      throw new TypeError('Failed to fetch');
    }) as unknown as typeof fetch;
    const error = await fetchOrganizations({ fetchImpl }).catch((caught: unknown) => caught);
    expect(error).toBeInstanceOf(NetworkError);
    expect((error as NetworkError).cause).toBeInstanceOf(TypeError);
  });

  it('throws NetworkError on unexpected HTTP statuses', async () => {
    await expect(fetchOrganizations({ fetchImpl: fetchReturning({}, 500) })).rejects.toThrow(
      NetworkError,
    );
  });
});

describe('resolveOrgId', () => {
  const twoOrgs = [{ uuid: ORG_A }, { uuid: ORG_B }];

  it('uses the lastActiveOrg cookie hint when it matches an org', async () => {
    await expect(
      resolveOrgId({ fetchImpl: fetchReturning(twoOrgs), cookie: `foo=1; lastActiveOrg=${ORG_B}` }),
    ).resolves.toBe(ORG_B);
  });

  it('decodes an URL-encoded cookie value', async () => {
    await expect(
      resolveOrgId({
        fetchImpl: fetchReturning(twoOrgs),
        cookie: `lastActiveOrg=${encodeURIComponent(ORG_A)}`,
      }),
    ).resolves.toBe(ORG_A);
  });

  it('falls back to the first org when the hint matches nothing', async () => {
    await expect(
      resolveOrgId({
        fetchImpl: fetchReturning(twoOrgs),
        cookie: 'lastActiveOrg=not-a-real-org',
      }),
    ).resolves.toBe(ORG_A);
  });

  it('falls back to the first org when there is no cookie', async () => {
    await expect(resolveOrgId({ fetchImpl: fetchReturning(twoOrgs), cookie: '' })).resolves.toBe(
      ORG_A,
    );
  });

  it('propagates NotLoggedInError from the org fetch', async () => {
    await expect(
      resolveOrgId({ fetchImpl: fetchReturning({}, 403), cookie: `lastActiveOrg=${ORG_A}` }),
    ).rejects.toThrow(NotLoggedInError);
  });
});

describe('fetchConversation', () => {
  it('requests the tree rendering of the conversation and returns raw JSON', async () => {
    const payload = { uuid: CONV, chat_messages: [] };
    const fetchImpl = fetchReturning(payload);

    await expect(fetchConversation(ORG_A, CONV, { fetchImpl })).resolves.toEqual(payload);
    expect(fetchImpl).toHaveBeenCalledWith(
      `${CLAUDE_ORIGIN}/api/organizations/${ORG_A}/chat_conversations/${CONV}` +
        '?tree=True&rendering_mode=messages&render_all_tools=true',
      expect.objectContaining({ credentials: 'include', method: 'GET' }),
    );
  });

  it('throws NotFoundError for deleted conversations', async () => {
    await expect(
      fetchConversation(ORG_A, CONV, { fetchImpl: fetchReturning({}, 404) }),
    ).rejects.toThrow(NotFoundError);
  });

  it('throws NotLoggedInError on 401', async () => {
    await expect(
      fetchConversation(ORG_A, CONV, { fetchImpl: fetchReturning({}, 401) }),
    ).rejects.toThrow(NotLoggedInError);
  });

  it('throws UnexpectedShapeError on a non-object payload', async () => {
    await expect(
      fetchConversation(ORG_A, CONV, { fetchImpl: fetchReturning([1, 2, 3]) }),
    ).rejects.toThrow(UnexpectedShapeError);
  });
});

describe('getCurrentConversationId', () => {
  it('extracts the uuid from a conversation pathname', () => {
    expect(getCurrentConversationId(`/chat/${CONV}`)).toBe(CONV);
  });

  it('accepts trailing path segments and uppercase hex', () => {
    expect(getCurrentConversationId(`/chat/${CONV.toUpperCase()}/whatever`)).toBe(
      CONV.toUpperCase(),
    );
  });

  it('returns null for non-conversation pages', () => {
    expect(getCurrentConversationId('/')).toBeNull();
    expect(getCurrentConversationId('/new')).toBeNull();
    expect(getCurrentConversationId('/chat/')).toBeNull();
    expect(getCurrentConversationId('/chat/not-a-uuid')).toBeNull();
    expect(getCurrentConversationId('/code/session_0123')).toBeNull();
  });

  it('returns null when no pathname is available at all', () => {
    expect(getCurrentConversationId(undefined)).toBeNull();
  });
});
