/**
 * Message contract between the extension UI (popup/background) and the
 * content script, plus the content-script-side handlers. Kept out of the
 * entrypoint so it is unit-testable and importable by both sides.
 */

import { ApiError, fetchOrganizations, getCurrentConversationId } from './api';

/** Message type sent to the content script to ask "what page is this?". */
export const PROBE_MESSAGE_TYPE = 'hardcopy:probe';

/** Request payload for a probe. */
export interface ProbeRequest {
  type: typeof PROBE_MESSAGE_TYPE;
}

/** What the content script knows about the current page and session. */
export interface ProbeResponse {
  /** UUID of the conversation open in this tab, or `null` when not on one. */
  conversationId: string | null;
  /** True when the claude.ai session is authenticated. */
  loggedIn: boolean;
}

/** True when `message` is a {@link ProbeRequest}. */
export function isProbeRequest(message: unknown): message is ProbeRequest {
  return (
    typeof message === 'object' &&
    message !== null &&
    'type' in message &&
    message.type === PROBE_MESSAGE_TYPE
  );
}

export interface HandleProbeOptions {
  /** `fetch` implementation for the login check; defaults to the global `fetch`. */
  fetchImpl?: typeof fetch;
  /** Pathname to detect the conversation from; defaults to the page's. */
  pathname?: string;
}

/**
 * Answer a probe: which conversation is open, and is the session logged in.
 * The login check is `GET /api/organizations`; API failures degrade to
 * `loggedIn: false` rather than throwing across the messaging boundary.
 */
export async function handleProbe(options?: HandleProbeOptions): Promise<ProbeResponse> {
  const conversationId = getCurrentConversationId(options?.pathname);

  let loggedIn: boolean;
  try {
    await fetchOrganizations({ fetchImpl: options?.fetchImpl });
    loggedIn = true;
  } catch (error) {
    if (error instanceof ApiError) {
      loggedIn = false;
    } else {
      throw error;
    }
  }

  return { conversationId, loggedIn };
}
