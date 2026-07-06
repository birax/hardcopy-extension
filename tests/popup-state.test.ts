/**
 * The popup state machine (issue #14): every transition, including probe
 * failures and every ExportFailureKind, is exercised here — pure functions,
 * no DOM.
 */

import { describe, expect, it } from 'vitest';

import { EXPORT_FAILURE_MESSAGES } from '../src/lib/flow/export';
import type { ExportFailure, ExportFailureKind, ExportSuccess } from '../src/lib/flow/export';
import type { ProbeResponse } from '../src/lib/messaging';
import {
  canExport,
  conversationTitleOf,
  INITIAL_POPUP_STATE,
  reducePopupState,
  stateFromProbe,
} from '../src/lib/popup/state';
import type { PopupState } from '../src/lib/popup/state';

const ALL_FAILURE_KINDS: readonly ExportFailureKind[] = [
  'logged-out',
  'no-conversation',
  'not-found',
  'network',
  'api-shape-change',
  'serializer-failure',
];

function probe(overrides: Partial<ProbeResponse> = {}): ProbeResponse {
  return {
    conversationId: 'aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee',
    loggedIn: true,
    conversationTitle: 'Birthday cake ideas',
    ...overrides,
  };
}

function failure(kind: ExportFailureKind, detail?: string): ExportFailure {
  return {
    ok: false,
    kind,
    message: EXPORT_FAILURE_MESSAGES[kind],
    ...(detail !== undefined && { detail }),
  };
}

const SUCCESS: ExportSuccess = {
  ok: true,
  filename: 'Birthday cake ideas - 2026-07-06.md',
  byteCount: 2048,
  warnings: [],
};

const READY: PopupState = { status: 'ready', conversationTitle: 'Birthday cake ideas' };
const EXPORTING: PopupState = { status: 'exporting', conversationTitle: 'Birthday cake ideas' };

describe('popup state machine', () => {
  it('starts probing', () => {
    expect(INITIAL_POPUP_STATE).toEqual({ status: 'probing' });
  });

  describe('probe results', () => {
    it('maps a failed probe to unsupported-page, keeping the claude.ai flag', () => {
      expect(
        reducePopupState(INITIAL_POPUP_STATE, { type: 'probe-failed', onClaudeAi: false }),
      ).toEqual({ status: 'unsupported-page', onClaudeAi: false });
      expect(
        reducePopupState(INITIAL_POPUP_STATE, { type: 'probe-failed', onClaudeAi: true }),
      ).toEqual({ status: 'unsupported-page', onClaudeAi: true });
    });

    it('maps a logged-out probe to logged-out, even with a conversation open', () => {
      expect(stateFromProbe(probe({ loggedIn: false }))).toEqual({ status: 'logged-out' });
      expect(
        stateFromProbe(probe({ loggedIn: false, conversationId: null, conversationTitle: null })),
      ).toEqual({ status: 'logged-out' });
    });

    it('maps a conversation-less probe to no-conversation', () => {
      expect(stateFromProbe(probe({ conversationId: null, conversationTitle: null }))).toEqual({
        status: 'no-conversation',
      });
    });

    it('maps a good probe to ready, with and without a title', () => {
      expect(
        reducePopupState(INITIAL_POPUP_STATE, { type: 'probe-succeeded', probe: probe() }),
      ).toEqual({ status: 'ready', conversationTitle: 'Birthday cake ideas' });
      expect(stateFromProbe(probe({ conversationTitle: null }))).toEqual({
        status: 'ready',
        conversationTitle: null,
      });
    });
  });

  describe('export lifecycle', () => {
    it('starts exporting from ready, carrying the title', () => {
      expect(reducePopupState(READY, { type: 'export-started' })).toEqual(EXPORTING);
    });

    it('allows re-export from success and failure states', () => {
      const success: PopupState = {
        status: 'success',
        conversationTitle: 'Birthday cake ideas',
        result: SUCCESS,
      };
      const failed: PopupState = {
        status: 'failure',
        conversationTitle: 'Birthday cake ideas',
        failure: failure('network'),
      };
      expect(reducePopupState(success, { type: 'export-started' })).toEqual(EXPORTING);
      expect(reducePopupState(failed, { type: 'export-started' })).toEqual(EXPORTING);
    });

    it('ignores export-started in states that cannot export', () => {
      const blocked: PopupState[] = [
        { status: 'probing' },
        { status: 'unsupported-page', onClaudeAi: false },
        { status: 'no-conversation' },
        { status: 'logged-out' },
        EXPORTING,
      ];
      for (const state of blocked) {
        expect(reducePopupState(state, { type: 'export-started' })).toBe(state);
      }
    });

    it('maps a successful outcome to the success state', () => {
      expect(reducePopupState(EXPORTING, { type: 'export-finished', outcome: SUCCESS })).toEqual({
        status: 'success',
        conversationTitle: 'Birthday cake ideas',
        result: SUCCESS,
      });
    });

    it('keeps degraded results and warnings verbatim', () => {
      const degraded: ExportSuccess = {
        ...SUCCESS,
        degraded: true,
        warnings: ['Exported from the rendered page', 'thinking blocks unavailable'],
      };
      const next = reducePopupState(EXPORTING, { type: 'export-finished', outcome: degraded });
      expect(next).toMatchObject({ status: 'success', result: degraded });
    });

    it.each(ALL_FAILURE_KINDS)('maps a %s failure to the failure state', (kind) => {
      const outcome = failure(kind, 'HTTP 500');
      expect(reducePopupState(EXPORTING, { type: 'export-finished', outcome })).toEqual({
        status: 'failure',
        conversationTitle: 'Birthday cake ideas',
        failure: outcome,
      });
    });

    it('ignores an export-finished that arrives when not exporting', () => {
      expect(reducePopupState(READY, { type: 'export-finished', outcome: SUCCESS })).toBe(READY);
      expect(
        reducePopupState(INITIAL_POPUP_STATE, { type: 'export-finished', outcome: SUCCESS }),
      ).toBe(INITIAL_POPUP_STATE);
    });
  });

  describe('helpers', () => {
    it('canExport is true exactly for ready, success, and failure', () => {
      const exportable: PopupState[] = [
        READY,
        { status: 'success', conversationTitle: null, result: SUCCESS },
        { status: 'failure', conversationTitle: null, failure: failure('network') },
      ];
      const blocked: PopupState[] = [
        { status: 'probing' },
        { status: 'unsupported-page', onClaudeAi: true },
        { status: 'no-conversation' },
        { status: 'logged-out' },
        EXPORTING,
      ];
      for (const state of exportable) {
        expect(canExport(state)).toBe(true);
      }
      for (const state of blocked) {
        expect(canExport(state)).toBe(false);
      }
    });

    it('conversationTitleOf reads the title where one exists', () => {
      expect(conversationTitleOf(READY)).toBe('Birthday cake ideas');
      expect(conversationTitleOf({ status: 'ready', conversationTitle: null })).toBeNull();
      expect(conversationTitleOf({ status: 'probing' })).toBeNull();
      expect(conversationTitleOf({ status: 'logged-out' })).toBeNull();
    });
  });
});
