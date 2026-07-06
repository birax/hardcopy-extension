/**
 * The end-to-end export orchestrator (issue #7): resolve the org and current
 * conversation, fetch it from the claude.ai API, parse → prepare → serialize,
 * and trigger the download — mapping every predictable failure to a typed,
 * user-presentable {@link ExportOutcome} instead of a thrown error.
 *
 * Runs in the content script (same-origin fetches ride the user's session;
 * the DOM fallback needs the rendered page), but every dependency — fetch,
 * DOM root, download, clock, serializer — is injectable for tests.
 *
 * Failure ladder (issue #7):
 *
 * - `NotLoggedInError`  → `logged-out` (actionable: log in; no fallback —
 *   the DOM has no conversation to scrape either).
 * - no `/chat/{uuid}` in the URL → `no-conversation`.
 * - `NotFoundError`     → `not-found` (deleted/foreign conversation; the
 *   fallback is pointless because the page shows the same error state).
 * - `UnexpectedShapeError` / `NetworkError` → attempt the DOM fallback; if it
 *   yields content, the export succeeds with `degraded: true` plus the
 *   fallback's limitations as warnings, else the original error kind is
 *   returned (`api-shape-change` / `network`).
 * - serializer or download throw → `serializer-failure`.
 *
 * Parser issues (and any degraded-extraction reasons) always propagate into
 * `warnings` — a non-empty list on a previously-clean conversation is the
 * early-warning signal that claude.ai's API shape changed.
 *
 * Privacy: nothing here writes conversation content anywhere except the
 * downloaded file. Failure `detail` strings carry only error metadata (HTTP
 * status, JSON paths), never message text — safe for a prefilled
 * "report this" GitHub issue.
 */

import {
  ApiError,
  fetchConversation,
  getCurrentConversationId,
  resolveOrgId,
} from '../api';
import { extractConversationFromDom } from '../dom-fallback';
import { buildExportFilename } from '../export/filename';
import type { ExportFormat, ExportOptions } from '../export/options';
import { prepareConversation } from '../export/prepare';
import type { Conversation } from '../model';
import { parseConversation } from '../parser';
import { triggerDownload } from './download';
import type { DownloadRequest } from './download';
import { loadPackagedSerializer } from './serializer-loader';
import type { SerializeFn } from './serializer-loader';

/** What the user asked to export: the format plus any option overrides. */
export interface ExportRequestSpec {
  /** Output format. */
  format: ExportFormat;
  /** Export option overrides; omitted keys take their defaults. */
  options?: Partial<ExportOptions>;
}

/**
 * Every way an export can fail, mapped 1:1 to a UI state (issue #7):
 *
 * - `'logged-out'`         — the claude.ai session is not authenticated.
 * - `'no-conversation'`    — the tab is not on a `/chat/{uuid}` page.
 * - `'not-found'`          — the conversation does not exist (deleted?).
 * - `'network'`            — claude.ai could not be reached (and the DOM
 *                            fallback produced nothing).
 * - `'api-shape-change'`   — claude.ai answered with a shape Hardcopy does
 *                            not recognise (and the DOM fallback produced
 *                            nothing); the "report this" path.
 * - `'serializer-failure'` — building or saving the export file failed.
 */
export type ExportFailureKind =
  | 'logged-out'
  | 'no-conversation'
  | 'not-found'
  | 'network'
  | 'api-shape-change'
  | 'serializer-failure';

/** A finished export: the file was handed to the browser for download. */
export interface ExportSuccess {
  ok: true;
  /** The download's filename, e.g. `'Birthday cake ideas - 2026-06-25.pdf'`. */
  filename: string;
  /** Size of the exported file in bytes. */
  byteCount: number;
  /**
   * Present and `true` when the export came from the DOM fallback instead of
   * the API — the file is incomplete by construction (see `warnings`), and
   * the UI must label it as degraded.
   */
  degraded?: boolean;
  /**
   * Human-readable caveats: parser issues (unexpected API shapes that were
   * worked around) and, for degraded exports, everything the DOM fallback
   * could not recover. Empty for a fully clean export. Contains paths and
   * descriptions only — never conversation content.
   */
  warnings: string[];
}

/** A failed export, typed for direct mapping to a UI failure state. */
export interface ExportFailure {
  ok: false;
  /** Which failure state to show. See {@link ExportFailureKind}. */
  kind: ExportFailureKind;
  /** Plain-language description with a next step, ready to display. */
  message: string;
  /**
   * Technical detail (error text, HTTP status) for diagnostics and the
   * prefilled "report this" issue. Never contains conversation content.
   */
  detail?: string;
}

/**
 * The orchestrator's result — a discriminated union on `ok`. This is the
 * exact shape the popup consumes; extend it, never repurpose fields.
 */
export type ExportOutcome = ExportSuccess | ExportFailure;

/** Injectable dependencies of {@link runExport}. Defaults suit the content script. */
export interface ExportFlowDeps {
  /** `fetch` for all API calls; defaults to the global `fetch`. */
  fetchImpl?: typeof fetch;
  /** Pathname the conversation id is read from; defaults to the page's. */
  pathname?: string;
  /** Cookie string for the org hint; defaults to `document.cookie`. */
  cookie?: string;
  /** Root the DOM fallback scrapes; defaults to the page `document`. */
  domRoot?: Document | HTMLElement;
  /** Download trigger; defaults to {@link triggerDownload}. */
  download?: (request: DownloadRequest) => void;
  /**
   * Serializer registry (`serializeConversation`'s shape). Defaults to the
   * packaged registry bundle, loaded lazily on first use — see
   * {@link loadPackagedSerializer} for why it is not imported statically.
   */
  serialize?: SerializeFn;
  /** Clock for the filename's date fallback; defaults to `new Date()`. */
  now?: () => Date;
}

/** Ready-to-display failure messages, each with a concrete next step. */
export const EXPORT_FAILURE_MESSAGES: Readonly<Record<ExportFailureKind, string>> = Object.freeze({
  'logged-out': "You're logged out of claude.ai — log in and try again.",
  'no-conversation': 'No conversation is open in this tab — open one on claude.ai and try again.',
  'not-found':
    'This conversation could not be found — it may have been deleted. Reload the page and try again.',
  network: 'claude.ai could not be reached — check your connection and try again.',
  'api-shape-change':
    'claude.ai sent back something Hardcopy does not recognise — the site may have changed. Please report this so it can be fixed.',
  'serializer-failure':
    'The export file could not be created — try again, or pick a different format. If it keeps failing, please report it.',
});

/**
 * Run one export end to end. Never rejects for a predictable failure —
 * inspect the returned {@link ExportOutcome}. Only programming errors
 * (violated invariants, broken injected deps) propagate as rejections.
 */
export async function runExport(
  request: ExportRequestSpec,
  deps: ExportFlowDeps = {},
): Promise<ExportOutcome> {
  const conversationId = getCurrentConversationId(deps.pathname);
  if (conversationId === null) {
    return failure('no-conversation');
  }

  let raw: unknown;
  try {
    const orgId = await resolveOrgId({ fetchImpl: deps.fetchImpl, cookie: deps.cookie });
    raw = await fetchConversation(orgId, conversationId, { fetchImpl: deps.fetchImpl });
  } catch (error) {
    if (!(error instanceof ApiError)) {
      throw error;
    }
    switch (error.kind) {
      case 'not-logged-in':
        return failure('logged-out', error.message);
      case 'not-found':
        return failure('not-found', error.message);
      case 'unexpected-shape':
        return fallbackExport(request, deps, 'api-shape-change', error.message);
      case 'network':
        return fallbackExport(request, deps, 'network', error.message);
    }
  }

  const { conversation, issues } = parseConversation(raw);
  const warnings = issues.map((issue) =>
    issue.path === '' ? issue.message : `${issue.path}: ${issue.message}`,
  );
  return finishExport(request, deps, conversation, { warnings });
}

/**
 * The API path failed with a shape/network error: scrape the rendered page
 * instead. Content found → degraded success (with the fallback's limitations
 * as warnings, after a note about why the fallback ran); nothing found → the
 * original failure.
 */
async function fallbackExport(
  request: ExportRequestSpec,
  deps: ExportFlowDeps,
  kind: 'api-shape-change' | 'network',
  detail: string,
): Promise<ExportOutcome> {
  const root = deps.domRoot ?? globalThis.document;
  const extraction = root === undefined ? undefined : extractConversationFromDom(root);
  const hasContent =
    extraction !== undefined &&
    extraction.conversation.messages.some((message) => message.blocks.length > 0);
  if (extraction === undefined || !hasContent) {
    return failure(kind, detail);
  }

  const warnings = [
    `Exported from the rendered page because the claude.ai API could not be used (${detail})`,
    ...extraction.issues.map((issue) =>
      issue.path === '' ? issue.message : `${issue.path}: ${issue.message}`,
    ),
  ];
  return finishExport(request, deps, extraction.conversation, { warnings, degraded: true });
}

/** Shared tail of both paths: prepare → serialize → download → outcome. */
async function finishExport(
  request: ExportRequestSpec,
  deps: ExportFlowDeps,
  conversation: Conversation,
  context: { warnings: string[]; degraded?: boolean },
): Promise<ExportOutcome> {
  const serialize: SerializeFn =
    deps.serialize ?? (async (prepared, format) => (await loadPackagedSerializer())(prepared, format));
  const download = deps.download ?? triggerDownload;
  const now = deps.now ?? ((): Date => new Date());

  const prepared = prepareConversation(conversation, request.options);
  const filename = buildExportFilename({
    title: prepared.title,
    date: conversation.createdAt ?? now(),
    format: request.format,
  });

  try {
    const payload = await serialize(prepared, request.format);
    download({ filename, bytes: payload.bytes, mimeType: payload.mimeType });
    return {
      ok: true,
      filename,
      byteCount: payload.bytes.byteLength,
      ...(context.degraded === true && { degraded: true }),
      warnings: context.warnings,
    };
  } catch (error) {
    return failure('serializer-failure', error instanceof Error ? error.message : String(error));
  }
}

/** Build an {@link ExportFailure} with its canonical user-facing message. */
function failure(kind: ExportFailureKind, detail?: string): ExportFailure {
  return {
    ok: false,
    kind,
    message: EXPORT_FAILURE_MESSAGES[kind],
    ...(detail !== undefined && { detail }),
  };
}
