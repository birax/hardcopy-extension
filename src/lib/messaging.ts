/**
 * Message contract between the extension UI (popup/background) and the
 * content script, plus the content-script-side handlers. Kept out of the
 * entrypoint so it is unit-testable and importable by both sides.
 */

import { ApiError, fetchOrganizations, getCurrentConversationId } from './api';
import { isExportFormat } from './export/options';
import type { ExportOptions } from './export/options';
import { EXPORT_FAILURE_MESSAGES, runExport } from './flow/export';
import type { ExportFlowDeps, ExportOutcome } from './flow/export';

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
  /**
   * The open conversation's title, when it can be read cheaply (from the
   * document title — no extra API call is ever made for it). `null` when
   * unavailable or when the tab is not on a conversation.
   */
  conversationTitle: string | null;
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
  /** Document title to derive the conversation title from; defaults to the page's. */
  documentTitle?: string;
}

/**
 * Answer a probe: which conversation is open, is the session logged in, and
 * (when cheaply readable) what the conversation is called.
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

  const conversationTitle =
    conversationId === null
      ? null
      : titleFromDocumentTitle(options?.documentTitle ?? globalThis.document?.title);

  return { conversationId, loggedIn, conversationTitle };
}

/**
 * Derive the conversation title from the page's document title, stripping
 * claude.ai's `" - Claude"` style suffix. Returns `null` when the result is
 * empty or is just the product name (a new/blank page).
 */
function titleFromDocumentTitle(documentTitle: string | undefined): string | null {
  const stripped = (documentTitle ?? '').replace(/\s*[-–—|]\s*Claude(\.ai)?\s*$/i, '').trim();
  if (stripped === '' || stripped.toLowerCase() === 'claude') {
    return null;
  }
  return stripped;
}

/** Message type sent to the content script to run one export end to end. */
export const EXPORT_MESSAGE_TYPE = 'hardcopy:export';

/** Request payload for an export. The response is an `ExportOutcome`. */
export interface ExportRequest {
  type: typeof EXPORT_MESSAGE_TYPE;
  /** Output format; must satisfy `isExportFormat`. */
  format: string;
  /** Export option overrides; omitted keys take their defaults. */
  options?: Partial<ExportOptions>;
}

/** True when `message` is a well-formed {@link ExportRequest}. */
export function isExportRequest(message: unknown): message is ExportRequest {
  return (
    typeof message === 'object' &&
    message !== null &&
    'type' in message &&
    message.type === EXPORT_MESSAGE_TYPE &&
    'format' in message &&
    isExportFormat(message.format)
  );
}

/**
 * Handle an export request: run the orchestrator and return its outcome.
 * `runExport` already maps every predictable failure into the outcome; the
 * catch here additionally converts *unexpected* rejections (programming
 * errors) into a `serializer-failure` outcome, because a rejection would
 * otherwise leave the popup's message channel hanging with no response —
 * a silent failure, which issue #7 forbids. `deps` exists for tests.
 */
export async function handleExport(
  request: ExportRequest,
  deps?: ExportFlowDeps,
): Promise<ExportOutcome> {
  if (!isExportFormat(request.format)) {
    // Unreachable behind isExportRequest; guarded for direct callers.
    throw new Error(`Unsupported export format: ${String(request.format)}`);
  }
  try {
    return await runExport({ format: request.format, options: request.options }, deps);
  } catch (error) {
    return {
      ok: false,
      kind: 'serializer-failure',
      message: EXPORT_FAILURE_MESSAGES['serializer-failure'],
      detail: error instanceof Error ? error.message : String(error),
    };
  }
}
