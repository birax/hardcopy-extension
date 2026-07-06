/**
 * Thin client for claude.ai's internal REST API (see
 * docs/decisions/0006-core-architecture.md and issue #3).
 *
 * Designed to run in the content script, where same-origin fetches with
 * `credentials: 'include'` ride the user's own session — but every function
 * takes an injectable `fetch` implementation so it is testable anywhere.
 * This module only fetches; parsing lives in src/lib/parser.
 */

import { NetworkError, NotFoundError, NotLoggedInError, UnexpectedShapeError } from './errors';

/** Origin all requests go to. The extension talks to no other host. */
export const CLAUDE_ORIGIN = 'https://claude.ai';

/** Options accepted by every fetching function. */
export interface RequestOptions {
  /** `fetch` implementation; defaults to the global `fetch`. */
  fetchImpl?: typeof fetch;
}

/** One organization from `GET /api/organizations`. Extra fields are preserved in `raw`. */
export interface Organization {
  uuid: string;
  name: string | undefined;
  /** The raw organization JSON, for fields this client does not model. */
  raw: unknown;
}

/**
 * Fetch the user's organizations. Doubles as the login check: throws
 * {@link NotLoggedInError} on 401/403 or when the list is empty.
 */
export async function fetchOrganizations(options?: RequestOptions): Promise<Organization[]> {
  const json = await getJson('/api/organizations', options);
  if (!Array.isArray(json)) {
    throw new UnexpectedShapeError('Expected /api/organizations to return an array');
  }
  const organizations: Organization[] = [];
  for (const entry of json) {
    const uuid =
      typeof entry === 'object' && entry !== null && 'uuid' in entry ? entry.uuid : undefined;
    if (typeof uuid !== 'string') {
      throw new UnexpectedShapeError('Organization entry has no uuid');
    }
    const name = 'name' in entry ? entry.name : undefined;
    organizations.push({ uuid, name: typeof name === 'string' ? name : undefined, raw: entry });
  }
  if (organizations.length === 0) {
    throw new NotLoggedInError('No organizations for this session');
  }
  return organizations;
}

export interface ResolveOrgIdOptions extends RequestOptions {
  /**
   * Cookie string to read the `lastActiveOrg` hint from (the format of
   * `document.cookie`). Defaults to `document.cookie` when available.
   */
  cookie?: string;
}

/**
 * Resolve the organization to export from: the `lastActiveOrg` cookie hint
 * when it matches one of the session's organizations, otherwise the first
 * organization. Always validates against {@link fetchOrganizations}, so it
 * also serves as a login check.
 */
export async function resolveOrgId(options?: ResolveOrgIdOptions): Promise<string> {
  const organizations = await fetchOrganizations(options);
  const cookie = options?.cookie ?? globalThis.document?.cookie ?? '';
  const hint = readLastActiveOrg(cookie);
  if (hint !== undefined && organizations.some((org) => org.uuid === hint)) {
    return hint;
  }
  // fetchOrganizations guarantees at least one entry.
  return organizations[0]!.uuid;
}

/** Extract the `lastActiveOrg` cookie value, when present. */
function readLastActiveOrg(cookie: string): string | undefined {
  const match = /(?:^|;\s*)lastActiveOrg=([^;]+)/.exec(cookie);
  if (match?.[1] === undefined) {
    return undefined;
  }
  try {
    return decodeURIComponent(match[1]);
  } catch {
    return match[1];
  }
}

/**
 * Fetch one conversation with all branches, thinking, and tool renderings.
 * Returns the raw JSON payload — feed it to `parseConversation`.
 */
export async function fetchConversation(
  orgId: string,
  conversationId: string,
  options?: RequestOptions,
): Promise<unknown> {
  const path =
    `/api/organizations/${encodeURIComponent(orgId)}` +
    `/chat_conversations/${encodeURIComponent(conversationId)}` +
    '?tree=True&rendering_mode=messages&render_all_tools=true';
  const json = await getJson(path, options);
  if (typeof json !== 'object' || json === null || Array.isArray(json)) {
    throw new UnexpectedShapeError('Expected conversation payload to be an object');
  }
  return json;
}

/** Matches `/chat/{uuid}` at the start of a claude.ai pathname. */
const CHAT_PATH_PATTERN =
  /^\/chat\/([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})(?:\/|$)/i;

/**
 * Extract the conversation UUID from a claude.ai pathname
 * (`https://claude.ai/chat/{uuid}`). Defaults to the current page's pathname;
 * returns `null` when the path is not a conversation page.
 */
export function getCurrentConversationId(
  pathname: string | undefined = globalThis.location?.pathname,
): string | null {
  if (pathname === undefined) {
    return null;
  }
  const match = CHAT_PATH_PATTERN.exec(pathname);
  return match?.[1] ?? null;
}

/** GET a claude.ai API path and return its JSON, mapping failures to typed errors. */
async function getJson(path: string, options?: RequestOptions): Promise<unknown> {
  const fetchImpl = options?.fetchImpl ?? fetch;

  let response: Response;
  try {
    response = await fetchImpl(`${CLAUDE_ORIGIN}${path}`, {
      method: 'GET',
      credentials: 'include',
      headers: { accept: 'application/json' },
    });
  } catch (cause) {
    throw new NetworkError(`Request to ${path} failed`, { cause });
  }

  if (response.status === 401 || response.status === 403) {
    throw new NotLoggedInError();
  }
  if (response.status === 404) {
    throw new NotFoundError();
  }
  if (!response.ok) {
    throw new NetworkError(`Request to ${path} failed with HTTP ${response.status}`);
  }

  try {
    return await response.json();
  } catch (cause) {
    throw new UnexpectedShapeError(`Response from ${path} is not JSON`, { cause });
  }
}
