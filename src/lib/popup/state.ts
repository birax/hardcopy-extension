/**
 * The popup's state machine (issue #14), kept pure so every transition is
 * unit-testable without a DOM or a browser: the controller feeds it events
 * (probe results, export lifecycle) and renders whatever state comes back.
 *
 * States map 1:1 to what the user sees:
 *
 * - `probing`          — just opened; asking the active tab what it is.
 * - `unsupported-page` — the probe failed. `onClaudeAi` distinguishes "not a
 *                        claude.ai tab at all" from "claude.ai tab Hardcopy
 *                        cannot reach yet" (open since before install — a
 *                        reload fixes it).
 * - `no-conversation`  — claude.ai, but no `/chat/{uuid}` conversation open.
 * - `logged-out`       — claude.ai, but the session is not authenticated.
 * - `ready`            — a conversation is open; controls are live.
 * - `exporting`        — an export is running; controls are disabled.
 * - `success`/`failure`— the export's {@link ExportOutcome}, verbatim.
 */

import type { ExportFailure, ExportSuccess, ExportOutcome } from '../flow/export';
import type { ProbeResponse } from '../messaging';

/** Everything the popup can be showing. See the module doc for the map. */
export type PopupState =
  | { status: 'probing' }
  | { status: 'unsupported-page'; onClaudeAi: boolean }
  | { status: 'no-conversation' }
  | { status: 'logged-out' }
  | { status: 'ready'; conversationTitle: string | null }
  | { status: 'exporting'; conversationTitle: string | null }
  | { status: 'success'; conversationTitle: string | null; result: ExportSuccess }
  | { status: 'failure'; conversationTitle: string | null; failure: ExportFailure };

/** The states from which the user can start (or retry) an export. */
export type ExportablePopupState = Extract<PopupState, { status: 'ready' | 'success' | 'failure' }>;

/** Everything that can happen to the popup. */
export type PopupEvent =
  | { type: 'probe-failed'; onClaudeAi: boolean }
  | { type: 'probe-succeeded'; probe: ProbeResponse }
  | { type: 'export-started' }
  | { type: 'export-finished'; outcome: ExportOutcome };

/** Where every popup starts: probing the active tab. */
export const INITIAL_POPUP_STATE: PopupState = Object.freeze({ status: 'probing' });

/**
 * Compute the next state. Events that make no sense in the current state
 * (an `export-started` while probing, an `export-finished` that arrives
 * after the state already moved on) are ignored rather than guessed at.
 */
export function reducePopupState(state: PopupState, event: PopupEvent): PopupState {
  switch (event.type) {
    case 'probe-failed':
      return { status: 'unsupported-page', onClaudeAi: event.onClaudeAi };
    case 'probe-succeeded':
      return stateFromProbe(event.probe);
    case 'export-started':
      return canExport(state)
        ? { status: 'exporting', conversationTitle: state.conversationTitle }
        : state;
    case 'export-finished':
      if (state.status !== 'exporting') {
        return state;
      }
      return event.outcome.ok
        ? { status: 'success', conversationTitle: state.conversationTitle, result: event.outcome }
        : { status: 'failure', conversationTitle: state.conversationTitle, failure: event.outcome };
  }
}

/**
 * Map a probe response to a state. Being logged out trumps having no
 * conversation open: logging in is the first thing to fix either way.
 */
export function stateFromProbe(probe: ProbeResponse): PopupState {
  if (!probe.loggedIn) {
    return { status: 'logged-out' };
  }
  if (probe.conversationId === null) {
    return { status: 'no-conversation' };
  }
  return { status: 'ready', conversationTitle: probe.conversationTitle };
}

/** True when the state allows starting (or retrying) an export. */
export function canExport(state: PopupState): state is ExportablePopupState {
  return state.status === 'ready' || state.status === 'success' || state.status === 'failure';
}

/** The conversation title carried by the state, when it has one. */
export function conversationTitleOf(state: PopupState): string | null {
  return 'conversationTitle' in state ? state.conversationTitle : null;
}
