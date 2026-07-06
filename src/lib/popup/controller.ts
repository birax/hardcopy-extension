/**
 * The popup's controller: glue between the pure state machine, the DOM view,
 * and the browser (active-tab probing, content-script messaging, preference
 * storage). Every browser touchpoint is injectable, so the full open →
 * probe → export → outcome flow is testable without a real browser.
 */

import { browser } from 'wxt/browser';

import type { ExportOutcome } from '../flow/export';
import { t } from '../i18n';
import { EXPORT_MESSAGE_TYPE, PROBE_MESSAGE_TYPE } from '../messaging';
import type { ProbeResponse } from '../messaging';
import { loadPreferences, savePreferences } from './preferences';
import type { PopupPreferences } from './preferences';
import { canExport, INITIAL_POPUP_STATE, reducePopupState } from './state';
import type { PopupEvent, PopupState } from './state';
import { createPopupView } from './view';
import type { PopupView } from './view';

/** What the controller needs to know about the active tab. */
export interface ActiveTabInfo {
  /** Tab id for messaging; `undefined` for tabs that cannot receive messages. */
  id: number | undefined;
  /**
   * Tab URL. Only populated for hosts the extension has permission for
   * (claude.ai), which is exactly the signal the controller needs.
   */
  url: string | undefined;
}

/** The controller's browser touchpoints, injectable for tests. */
export interface PopupControllerDeps {
  /** The active tab of the current window, if any. */
  queryActiveTab(): Promise<ActiveTabInfo | undefined>;
  /** Send `hardcopy:probe`; rejects when the tab has no content script. */
  sendProbe(tabId: number): Promise<ProbeResponse>;
  /** Send `hardcopy:export`; resolves with the export's outcome. */
  sendExport(tabId: number, preferences: PopupPreferences): Promise<ExportOutcome>;
  /** Load persisted preferences. */
  loadPreferences(): Promise<PopupPreferences>;
  /** Persist preferences. */
  savePreferences(preferences: PopupPreferences): Promise<void>;
}

/** A running popup, exposed for tests. */
export interface PopupController {
  /** The rendered view. */
  view: PopupView;
  /** The current state. */
  getState(): PopupState;
  /** Run an export with the current form values (what submitting does). */
  requestExport(): Promise<void>;
}

/** The real browser wiring; separated so tests can cover its guards. */
export function createDefaultDeps(): PopupControllerDeps {
  return {
    async queryActiveTab(): Promise<ActiveTabInfo | undefined> {
      const [tab] = await browser.tabs.query({ active: true, currentWindow: true });
      return tab === undefined ? undefined : { id: tab.id, url: tab.url };
    },
    async sendProbe(tabId: number): Promise<ProbeResponse> {
      const response: unknown = await browser.tabs.sendMessage(tabId, {
        type: PROBE_MESSAGE_TYPE,
      });
      if (!isProbeResponse(response)) {
        throw new Error('The page did not answer the probe.');
      }
      return response;
    },
    async sendExport(tabId: number, preferences: PopupPreferences): Promise<ExportOutcome> {
      const response: unknown = await browser.tabs.sendMessage(tabId, {
        type: EXPORT_MESSAGE_TYPE,
        format: preferences.format,
        options: preferences.options,
      });
      if (!isExportOutcome(response)) {
        throw new Error('The page did not answer the export request.');
      }
      return response;
    },
    loadPreferences,
    savePreferences,
  };
}

/**
 * Build the popup inside `doc`, restore preferences, probe the active tab,
 * and wire up exporting. Resolves once the initial probe has settled.
 */
export async function initPopup(
  doc: Document,
  deps: PopupControllerDeps = createDefaultDeps(),
): Promise<PopupController> {
  const view = createPopupView(doc);
  let state: PopupState = INITIAL_POPUP_STATE;
  let tabId: number | undefined;
  view.render(state);

  function dispatch(event: PopupEvent): void {
    state = reducePopupState(state, event);
    view.render(state);
  }

  view.writePreferences(await deps.loadPreferences());

  view.onPreferencesChanged(() => {
    void deps.savePreferences(view.readPreferences());
  });

  async function requestExport(): Promise<void> {
    if (!canExport(state) || tabId === undefined) {
      return;
    }
    const preferences = view.readPreferences();
    await deps.savePreferences(preferences);
    dispatch({ type: 'export-started' });
    let outcome: ExportOutcome;
    try {
      outcome = await deps.sendExport(tabId, preferences);
    } catch (error) {
      // The message channel died (tab closed or navigated mid-export): a
      // predictable failure, surfaced like any other rather than left hanging.
      outcome = {
        ok: false,
        kind: 'network',
        message: t('exportNoResponse'),
        detail: error instanceof Error ? error.message : String(error),
      };
    }
    dispatch({ type: 'export-finished', outcome });
  }

  view.onExportRequested(() => {
    void requestExport();
  });

  const tab = await deps.queryActiveTab().catch(() => undefined);
  const onClaudeAi = tab?.url?.startsWith('https://claude.ai/') ?? false;
  if (tab?.id === undefined) {
    dispatch({ type: 'probe-failed', onClaudeAi });
  } else {
    tabId = tab.id;
    try {
      dispatch({ type: 'probe-succeeded', probe: await deps.sendProbe(tab.id) });
    } catch {
      dispatch({ type: 'probe-failed', onClaudeAi });
    }
  }

  return { view, getState: () => state, requestExport };
}

/** Loose structural check on what came back over the message channel. */
function isProbeResponse(value: unknown): value is ProbeResponse {
  return (
    typeof value === 'object' &&
    value !== null &&
    'loggedIn' in value &&
    typeof (value as { loggedIn: unknown }).loggedIn === 'boolean' &&
    'conversationId' in value
  );
}

/** Loose structural check on the export response. */
function isExportOutcome(value: unknown): value is ExportOutcome {
  return (
    typeof value === 'object' &&
    value !== null &&
    'ok' in value &&
    typeof (value as { ok: unknown }).ok === 'boolean'
  );
}
