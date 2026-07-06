// @vitest-environment happy-dom
/**
 * Controller tests (issue #14): the open → probe → export → outcome flow
 * with injected deps, preference persistence, and the guards in the real
 * browser wiring (createDefaultDeps) against a patched fake browser.
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fakeBrowser } from 'wxt/testing';

import { DEFAULT_EXPORT_OPTIONS } from '../src/lib/export/options';
import type { ExportOutcome, ExportSuccess } from '../src/lib/flow/export';
import { t } from '../src/lib/i18n';
import { EXPORT_MESSAGE_TYPE, PROBE_MESSAGE_TYPE } from '../src/lib/messaging';
import type { ProbeResponse } from '../src/lib/messaging';
import { createDefaultDeps, initPopup } from '../src/lib/popup/controller';
import type { PopupControllerDeps } from '../src/lib/popup/controller';
import type { PopupPreferences } from '../src/lib/popup/preferences';

const PROBE: ProbeResponse = {
  conversationId: 'aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee',
  loggedIn: true,
  conversationTitle: 'Birthday cake ideas',
};

const SUCCESS: ExportSuccess = {
  ok: true,
  filename: 'Birthday cake ideas - 2026-07-06.md',
  byteCount: 2048,
  warnings: [],
};

const DEFAULT_PREFERENCES: PopupPreferences = {
  format: 'markdown',
  options: { ...DEFAULT_EXPORT_OPTIONS },
};

function makeDeps(overrides: Partial<PopupControllerDeps> = {}): PopupControllerDeps {
  return {
    queryActiveTab: vi.fn(async () => ({ id: 7, url: 'https://claude.ai/chat/xyz' })),
    sendProbe: vi.fn(async () => PROBE),
    sendExport: vi.fn(async (): Promise<ExportOutcome> => SUCCESS),
    loadPreferences: vi.fn(async () => DEFAULT_PREFERENCES),
    savePreferences: vi.fn(async () => undefined),
    ...overrides,
  };
}

beforeEach(() => {
  document.body.innerHTML = '';
  fakeBrowser.reset();
});

describe('initPopup', () => {
  it('probes the active tab and lands in ready with the title shown', async () => {
    const deps = makeDeps();
    const controller = await initPopup(document, deps);
    expect(deps.sendProbe).toHaveBeenCalledWith(7);
    expect(controller.getState()).toEqual({
      status: 'ready',
      conversationTitle: 'Birthday cake ideas',
    });
    expect(controller.view.exportButton.disabled).toBe(false);
  });

  it('restores persisted preferences into the form', async () => {
    const stored: PopupPreferences = {
      format: 'pdf',
      options: { ...DEFAULT_EXPORT_OPTIONS, includeThinking: true, branches: 'all' },
    };
    const deps = makeDeps({ loadPreferences: vi.fn(async () => stored) });
    const controller = await initPopup(document, deps);
    expect(controller.view.readPreferences()).toEqual(stored);
  });

  it('maps a logged-out probe to the logged-out state', async () => {
    const deps = makeDeps({ sendProbe: vi.fn(async () => ({ ...PROBE, loggedIn: false })) });
    const controller = await initPopup(document, deps);
    expect(controller.getState()).toEqual({ status: 'logged-out' });
  });

  it('maps a conversation-less probe to no-conversation', async () => {
    const deps = makeDeps({
      sendProbe: vi.fn(async () => ({ ...PROBE, conversationId: null, conversationTitle: null })),
    });
    const controller = await initPopup(document, deps);
    expect(controller.getState()).toEqual({ status: 'no-conversation' });
  });

  it('treats a rejected probe on a claude.ai tab as a stale tab', async () => {
    const deps = makeDeps({ sendProbe: vi.fn(async () => Promise.reject(new Error('no rx'))) });
    const controller = await initPopup(document, deps);
    expect(controller.getState()).toEqual({ status: 'unsupported-page', onClaudeAi: true });
  });

  it('treats a rejected probe elsewhere as not-a-claude.ai page', async () => {
    const deps = makeDeps({
      queryActiveTab: vi.fn(async () => ({ id: 7, url: 'https://example.com/' })),
      sendProbe: vi.fn(async () => Promise.reject(new Error('no rx'))),
    });
    const controller = await initPopup(document, deps);
    expect(controller.getState()).toEqual({ status: 'unsupported-page', onClaudeAi: false });
  });

  it('handles a missing active tab and a rejected tab query', async () => {
    const noTab = await initPopup(
      document,
      makeDeps({ queryActiveTab: vi.fn(async () => undefined) }),
    );
    expect(noTab.getState()).toEqual({ status: 'unsupported-page', onClaudeAi: false });

    document.body.innerHTML = '';
    const rejected = await initPopup(
      document,
      makeDeps({ queryActiveTab: vi.fn(async () => Promise.reject(new Error('nope'))) }),
    );
    expect(rejected.getState()).toEqual({ status: 'unsupported-page', onClaudeAi: false });
  });

  it('handles a tab without an id (no content script possible)', async () => {
    const deps = makeDeps({
      queryActiveTab: vi.fn(async () => ({ id: undefined, url: undefined })),
    });
    const controller = await initPopup(document, deps);
    expect(controller.getState()).toEqual({ status: 'unsupported-page', onClaudeAi: false });
    expect(deps.sendProbe).not.toHaveBeenCalled();
  });
});

describe('exporting', () => {
  it('runs the full export flow: busy state, then success, preferences saved', async () => {
    let resolveExport: (outcome: ExportOutcome) => void = () => undefined;
    const deps = makeDeps({
      sendExport: vi.fn(() => new Promise<ExportOutcome>((resolve) => (resolveExport = resolve))),
    });
    const controller = await initPopup(document, deps);

    const running = controller.requestExport();
    await vi.waitFor(() => {
      expect(controller.getState().status).toBe('exporting');
    });
    expect(controller.view.form.getAttribute('aria-busy')).toBe('true');
    expect(controller.view.exportButton.disabled).toBe(true);

    resolveExport(SUCCESS);
    await running;
    expect(controller.getState()).toMatchObject({ status: 'success', result: SUCCESS });
    expect(controller.view.statusRegion.textContent).toBe(t('savedAnnouncement', SUCCESS.filename));
    expect(deps.savePreferences).toHaveBeenCalledWith(DEFAULT_PREFERENCES);
    expect(deps.sendExport).toHaveBeenCalledWith(7, DEFAULT_PREFERENCES);
  });

  it('is triggered by submitting the form', async () => {
    const deps = makeDeps();
    const controller = await initPopup(document, deps);
    controller.view.form.dispatchEvent(new Event('submit', { cancelable: true }));
    await vi.waitFor(() => {
      expect(controller.getState().status).toBe('success');
    });
    expect(deps.sendExport).toHaveBeenCalledTimes(1);
  });

  it('shows the outcome message when the export fails', async () => {
    const failure: ExportOutcome = {
      ok: false,
      kind: 'not-found',
      message: 'This conversation could not be found.',
      detail: 'HTTP 404',
    };
    const deps = makeDeps({ sendExport: vi.fn(async () => failure) });
    const controller = await initPopup(document, deps);
    await controller.requestExport();
    expect(controller.getState()).toMatchObject({ status: 'failure', failure });
    expect(controller.view.main.querySelector('.banner--error')?.textContent).toContain(
      failure.message,
    );
  });

  it('maps a dead message channel to a calm failure, not a hang', async () => {
    const deps = makeDeps({
      sendExport: vi.fn(async () => Promise.reject(new Error('channel closed'))),
    });
    const controller = await initPopup(document, deps);
    await controller.requestExport();
    expect(controller.getState()).toMatchObject({
      status: 'failure',
      failure: { kind: 'network', message: t('exportNoResponse'), detail: 'channel closed' },
    });
  });

  it('does nothing when the state cannot export', async () => {
    const deps = makeDeps({ sendProbe: vi.fn(async () => ({ ...PROBE, loggedIn: false })) });
    const controller = await initPopup(document, deps);
    await controller.requestExport();
    expect(deps.sendExport).not.toHaveBeenCalled();
    expect(controller.getState()).toEqual({ status: 'logged-out' });
  });

  it('supports exporting again after a result', async () => {
    const deps = makeDeps();
    const controller = await initPopup(document, deps);
    await controller.requestExport();
    await controller.requestExport();
    expect(deps.sendExport).toHaveBeenCalledTimes(2);
    expect(controller.getState().status).toBe('success');
  });
});

describe('preference persistence on change', () => {
  it('saves the current form values whenever a control changes', async () => {
    const deps = makeDeps();
    const controller = await initPopup(document, deps);
    const pdfRadio = controller.view.form.querySelector<HTMLInputElement>(
      'input[name="format"][value="pdf"]',
    );
    pdfRadio?.click();
    controller.view.form.dispatchEvent(new Event('change', { bubbles: true }));
    await vi.waitFor(() => {
      expect(deps.savePreferences).toHaveBeenCalledWith(expect.objectContaining({ format: 'pdf' }));
    });
  });
});

describe('createDefaultDeps', () => {
  interface PatchedTabs {
    query: ReturnType<typeof vi.fn>;
    sendMessage: ReturnType<typeof vi.fn>;
  }

  function patchTabs(): PatchedTabs {
    const tabs: PatchedTabs = { query: vi.fn(), sendMessage: vi.fn() };
    (fakeBrowser as unknown as { tabs: PatchedTabs }).tabs = tabs;
    return tabs;
  }

  it('queries the active tab of the current window', async () => {
    const tabs = patchTabs();
    tabs.query.mockResolvedValue([{ id: 4, url: 'https://claude.ai/chat/abc' }]);
    const deps = createDefaultDeps();
    await expect(deps.queryActiveTab()).resolves.toEqual({
      id: 4,
      url: 'https://claude.ai/chat/abc',
    });
    expect(tabs.query).toHaveBeenCalledWith({ active: true, currentWindow: true });

    tabs.query.mockResolvedValue([]);
    await expect(deps.queryActiveTab()).resolves.toBeUndefined();
  });

  it('sends a probe message and validates the response shape', async () => {
    const tabs = patchTabs();
    tabs.sendMessage.mockResolvedValue(PROBE);
    const deps = createDefaultDeps();
    await expect(deps.sendProbe(4)).resolves.toEqual(PROBE);
    expect(tabs.sendMessage).toHaveBeenCalledWith(4, { type: PROBE_MESSAGE_TYPE });

    // Chrome resolves with undefined when nothing answered — that must throw.
    tabs.sendMessage.mockResolvedValue(undefined);
    await expect(deps.sendProbe(4)).rejects.toThrow('did not answer');
  });

  it('sends the export request and validates the outcome shape', async () => {
    const tabs = patchTabs();
    tabs.sendMessage.mockResolvedValue(SUCCESS);
    const deps = createDefaultDeps();
    await expect(deps.sendExport(4, DEFAULT_PREFERENCES)).resolves.toEqual(SUCCESS);
    expect(tabs.sendMessage).toHaveBeenCalledWith(4, {
      type: EXPORT_MESSAGE_TYPE,
      format: 'markdown',
      options: DEFAULT_PREFERENCES.options,
    });

    tabs.sendMessage.mockResolvedValue(null);
    await expect(deps.sendExport(4, DEFAULT_PREFERENCES)).rejects.toThrow('did not answer');
  });
});
