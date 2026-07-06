// @vitest-environment happy-dom
/**
 * Controller tests for the options page (issue #15): load → edit → persist
 * with injected deps, the debounced template save with validation, the
 * saved indicator lifecycle, reset flows, popup↔options storage consistency
 * (same keys through the same helpers), and the real browser wiring guards.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { fakeBrowser } from 'wxt/testing';

import { DEFAULT_FILENAME_TEMPLATE } from '../src/lib/export/filename';
import { DEFAULT_EXPORT_OPTIONS } from '../src/lib/export/options';
import {
  EXPORT_OPTIONS_STORAGE_KEY,
  FILENAME_TEMPLATE_STORAGE_KEY,
  loadFilenameTemplate,
  saveFilenameTemplate,
} from '../src/lib/export/storage';
import { t } from '../src/lib/i18n';
import {
  createDefaultDeps,
  initOptions,
  SAVED_INDICATOR_MS,
  TEMPLATE_SAVE_DEBOUNCE_MS,
} from '../src/lib/options/controller';
import type { OptionsControllerDeps } from '../src/lib/options/controller';
import { buildFilenamePreview, templateIssueMessage } from '../src/lib/options/template';
import type { OptionsView } from '../src/lib/options/view';
import {
  EXPORT_FORMAT_STORAGE_KEY,
  loadPreferences,
  savePreferences,
} from '../src/lib/popup/preferences';
import type { PopupPreferences } from '../src/lib/popup/preferences';

const NOW = (): Date => new Date('2026-07-06T12:00:00Z');

function makeDeps(overrides: Partial<OptionsControllerDeps> = {}): OptionsControllerDeps {
  return {
    loadPreferences: vi.fn(async () => ({
      format: 'markdown' as const,
      options: { ...DEFAULT_EXPORT_OPTIONS },
    })),
    savePreferences: vi.fn(async () => undefined),
    loadTemplate: vi.fn(async () => DEFAULT_FILENAME_TEMPLATE),
    saveTemplate: vi.fn(async () => undefined),
    clearStoredSettings: vi.fn(async () => undefined),
    confirmReset: vi.fn(() => true),
    getVersion: vi.fn(() => '9.9.9'),
    subscribeToStorageChanges: vi.fn(),
    now: NOW,
    ...overrides,
  };
}

function previewText(view: OptionsView): string | null | undefined {
  return view.form.querySelector('#template-preview .filename')?.textContent;
}

function errorText(view: OptionsView): string | null | undefined {
  return view.form.querySelector('#template-error')?.textContent;
}

function setTemplate(view: OptionsView, value: string): void {
  view.templateInput.value = value;
  view.templateInput.dispatchEvent(new Event('input', { bubbles: true }));
}

function changeControls(view: OptionsView): void {
  view.form.dispatchEvent(new Event('change', { bubbles: true }));
}

beforeEach(() => {
  document.body.innerHTML = '';
  fakeBrowser.reset();
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
});

describe('initOptions', () => {
  it('restores stored settings into the form and renders the preview', async () => {
    const deps = makeDeps({
      loadPreferences: vi.fn(async () => ({
        format: 'pdf' as const,
        options: { ...DEFAULT_EXPORT_OPTIONS, includeThinking: true, branches: 'all' as const },
      })),
      loadTemplate: vi.fn(async () => '{date} {title}.{ext}'),
    });
    const controller = await initOptions(document, deps);
    expect(controller.view.readSettings()).toEqual({
      format: 'pdf',
      options: { ...DEFAULT_EXPORT_OPTIONS, includeThinking: true, branches: 'all' },
      template: '{date} {title}.{ext}',
    });
    expect(previewText(controller.view)).toBe('2026-07-06 Birthday cake ideas.pdf');
  });

  it('passes the version through to the About section', async () => {
    const controller = await initOptions(document, makeDeps());
    const about = controller.view.main.querySelector('section[aria-labelledby="about-heading"]');
    expect(about?.querySelector('.caption')?.textContent).toBe(t('aboutVersion', '9.9.9'));
  });
});

describe('save-on-change', () => {
  it('persists control changes with the popup helpers and flashes Saved', async () => {
    const deps = makeDeps();
    const controller = await initOptions(document, deps);

    const markdown = controller.view.form.querySelector<HTMLInputElement>(
      'input[name="format"][value="markdown"]',
    );
    const pdf = controller.view.form.querySelector<HTMLInputElement>(
      'input[name="format"][value="pdf"]',
    );
    if (markdown === null || pdf === null) throw new Error('format radios missing');
    markdown.checked = false;
    pdf.checked = true;
    changeControls(controller.view);
    await vi.advanceTimersByTimeAsync(0);

    expect(deps.savePreferences).toHaveBeenCalledWith({
      format: 'pdf',
      options: DEFAULT_EXPORT_OPTIONS,
    });
    expect(controller.view.saveIndicator.textContent).toBe(t('savedIndicator'));

    // The indicator clears itself; the settings stay saved.
    await vi.advanceTimersByTimeAsync(SAVED_INDICATOR_MS);
    expect(controller.view.saveIndicator.textContent).toBe('');
    expect(controller.getSettings().format).toBe('pdf');
  });

  it('updates the preview extension when the default format changes', async () => {
    const controller = await initOptions(document, makeDeps());
    expect(previewText(controller.view)).toBe('Birthday cake ideas - 2026-07-06.md');

    const markdown = controller.view.form.querySelector<HTMLInputElement>(
      'input[name="format"][value="markdown"]',
    );
    const docx = controller.view.form.querySelector<HTMLInputElement>(
      'input[name="format"][value="docx"]',
    );
    if (markdown === null || docx === null) throw new Error('format radios missing');
    markdown.checked = false;
    docx.checked = true;
    changeControls(controller.view);
    await vi.advanceTimersByTimeAsync(0);
    expect(previewText(controller.view)).toBe('Birthday cake ideas - 2026-07-06.docx');
  });
});

describe('filename template editing', () => {
  it('saves a valid template once the input goes quiet (debounced)', async () => {
    const deps = makeDeps();
    const controller = await initOptions(document, deps);

    setTemplate(controller.view, '{title}');
    setTemplate(controller.view, '{title}.{ext}');
    expect(deps.saveTemplate).not.toHaveBeenCalled();
    expect(previewText(controller.view)).toBe('Birthday cake ideas.md');

    await vi.advanceTimersByTimeAsync(TEMPLATE_SAVE_DEBOUNCE_MS);
    expect(deps.saveTemplate).toHaveBeenCalledTimes(1);
    expect(deps.saveTemplate).toHaveBeenCalledWith('{title}.{ext}');
    expect(controller.view.saveIndicator.textContent).toBe(t('savedIndicator'));
    expect(controller.getSettings().template).toBe('{title}.{ext}');
  });

  it('flags invalid templates and never persists them', async () => {
    const deps = makeDeps();
    const controller = await initOptions(document, deps);

    setTemplate(controller.view, '{oops}');
    expect(errorText(controller.view)).toBe(
      templateIssueMessage({ kind: 'unknown-placeholder', placeholder: '{oops}' }),
    );
    expect(controller.view.templateInput.getAttribute('aria-invalid')).toBe('true');

    setTemplate(controller.view, '');
    expect(errorText(controller.view)).toBe(templateIssueMessage({ kind: 'empty' }));

    setTemplate(controller.view, '{title');
    expect(errorText(controller.view)).toBe(templateIssueMessage({ kind: 'unbalanced-braces' }));

    await vi.advanceTimersByTimeAsync(TEMPLATE_SAVE_DEBOUNCE_MS);
    expect(deps.saveTemplate).not.toHaveBeenCalled();
    // The last good template stays in effect.
    expect(controller.getSettings().template).toBe(DEFAULT_FILENAME_TEMPLATE);
  });

  it('clears the error and resumes saving once the template is fixed', async () => {
    const deps = makeDeps();
    const controller = await initOptions(document, deps);

    setTemplate(controller.view, '{oops}');
    setTemplate(controller.view, '{title}.{ext}');
    expect(errorText(controller.view)).toBe('');
    expect(controller.view.templateInput.hasAttribute('aria-invalid')).toBe(false);

    await vi.advanceTimersByTimeAsync(TEMPLATE_SAVE_DEBOUNCE_MS);
    expect(deps.saveTemplate).toHaveBeenCalledWith('{title}.{ext}');
  });

  it('resets the template to its default and saves immediately', async () => {
    const deps = makeDeps({ loadTemplate: vi.fn(async () => '{date}.{ext}') });
    const controller = await initOptions(document, deps);
    // Leave an invalid draft behind, then reset.
    setTemplate(controller.view, '{oops}');

    controller.view.form.querySelector<HTMLButtonElement>('.field .button-secondary')?.click();
    await vi.advanceTimersByTimeAsync(0);

    expect(controller.view.templateInput.value).toBe(DEFAULT_FILENAME_TEMPLATE);
    expect(errorText(controller.view)).toBe('');
    expect(deps.saveTemplate).toHaveBeenCalledWith(DEFAULT_FILENAME_TEMPLATE);
    expect(previewText(controller.view)).toBe('Birthday cake ideas - 2026-07-06.md');
    // The abandoned invalid draft must not get saved later.
    await vi.advanceTimersByTimeAsync(TEMPLATE_SAVE_DEBOUNCE_MS);
    expect(deps.saveTemplate).toHaveBeenCalledTimes(1);
  });
});

describe('reset all settings', () => {
  it('asks for confirmation and does nothing when declined', async () => {
    const deps = makeDeps({ confirmReset: vi.fn(() => false) });
    const controller = await initOptions(document, deps);
    controller.view.main
      .querySelector<HTMLButtonElement>('section[aria-labelledby="reset-heading"] button')
      ?.click();
    await vi.advanceTimersByTimeAsync(0);
    expect(deps.confirmReset).toHaveBeenCalledWith(t('resetAllConfirm'));
    expect(deps.clearStoredSettings).not.toHaveBeenCalled();
  });

  it('clears storage, restores defaults, and announces the reset', async () => {
    const deps = makeDeps({
      loadPreferences: vi.fn(async () => ({
        format: 'pdf' as const,
        options: { ...DEFAULT_EXPORT_OPTIONS, includeThinking: true },
      })),
      loadTemplate: vi.fn(async () => '{date}.{ext}'),
    });
    const controller = await initOptions(document, deps);

    controller.view.main
      .querySelector<HTMLButtonElement>('section[aria-labelledby="reset-heading"] button')
      ?.click();
    await vi.advanceTimersByTimeAsync(0);

    expect(deps.clearStoredSettings).toHaveBeenCalledTimes(1);
    expect(controller.view.readSettings()).toEqual({
      format: 'markdown',
      options: DEFAULT_EXPORT_OPTIONS,
      template: DEFAULT_FILENAME_TEMPLATE,
    });
    expect(controller.view.saveIndicator.textContent).toBe(t('resetAllDone'));
    expect(previewText(controller.view)).toBe('Birthday cake ideas - 2026-07-06.md');
  });
});

describe('external storage changes', () => {
  it('re-reads settings when storage changes elsewhere (the popup)', async () => {
    let listener: (() => void) | undefined;
    const loadPrefs = vi.fn(async (): Promise<PopupPreferences> => ({
      format: 'markdown',
      options: { ...DEFAULT_EXPORT_OPTIONS },
    }));
    const deps = makeDeps({
      loadPreferences: loadPrefs,
      subscribeToStorageChanges: vi.fn((subscriber: () => void) => {
        listener = subscriber;
      }),
    });
    const controller = await initOptions(document, deps);

    loadPrefs.mockResolvedValue({
      format: 'rtf' as const,
      options: { ...DEFAULT_EXPORT_OPTIONS, includeTimestamps: true },
    });
    listener?.();
    await vi.advanceTimersByTimeAsync(0);

    expect(controller.view.readSettings()).toMatchObject({
      format: 'rtf',
      options: { ...DEFAULT_EXPORT_OPTIONS, includeTimestamps: true },
    });
  });

  it('never clobbers the template input while the user is typing in it', async () => {
    let listener: (() => void) | undefined;
    const loadTemplate = vi.fn(async () => DEFAULT_FILENAME_TEMPLATE);
    const deps = makeDeps({
      loadTemplate,
      subscribeToStorageChanges: vi.fn((subscriber: () => void) => {
        listener = subscriber;
      }),
    });
    const controller = await initOptions(document, deps);

    controller.view.templateInput.focus();
    setTemplate(controller.view, '{title} draft');
    loadTemplate.mockResolvedValue('{date}.{ext}');
    listener?.();
    await vi.advanceTimersByTimeAsync(0);

    expect(controller.view.templateInput.value).toBe('{title} draft');
  });
});

describe('popup↔options consistency (real storage round trip)', () => {
  function realStorageDeps(): OptionsControllerDeps {
    return makeDeps({
      loadPreferences,
      savePreferences,
      loadTemplate: loadFilenameTemplate,
      saveTemplate: saveFilenameTemplate,
    });
  }

  it('options edits land under the keys the popup reads', async () => {
    const controller = await initOptions(document, realStorageDeps());

    const markdown = controller.view.form.querySelector<HTMLInputElement>(
      'input[name="format"][value="markdown"]',
    );
    const pdf = controller.view.form.querySelector<HTMLInputElement>(
      'input[name="format"][value="pdf"]',
    );
    const thinking = controller.view.form.querySelector<HTMLInputElement>(
      'input[name="includeThinking"]',
    );
    if (markdown === null || pdf === null || thinking === null) throw new Error('controls missing');
    markdown.checked = false;
    pdf.checked = true;
    thinking.checked = true;
    changeControls(controller.view);
    setTemplate(controller.view, '{date} {title}.{ext}');
    await vi.advanceTimersByTimeAsync(TEMPLATE_SAVE_DEBOUNCE_MS);

    // Exactly what the popup (and the export flow) will read.
    const popupView = await loadPreferences();
    expect(popupView.format).toBe('pdf');
    expect(popupView.options.includeThinking).toBe(true);
    await expect(loadFilenameTemplate()).resolves.toBe('{date} {title}.{ext}');
  });

  it('popup edits show up in the options form on load', async () => {
    await savePreferences({
      format: 'docx',
      options: { ...DEFAULT_EXPORT_OPTIONS, includeAttachments: true },
    });
    const controller = await initOptions(document, realStorageDeps());
    expect(controller.view.readSettings()).toMatchObject({
      format: 'docx',
      options: { ...DEFAULT_EXPORT_OPTIONS, includeAttachments: true },
    });
  });
});

describe('createDefaultDeps', () => {
  it('clearStoredSettings removes every Hardcopy key', async () => {
    await fakeBrowser.storage.local.set({
      [EXPORT_OPTIONS_STORAGE_KEY]: { includeThinking: true },
      [EXPORT_FORMAT_STORAGE_KEY]: 'pdf',
      [FILENAME_TEMPLATE_STORAGE_KEY]: '{date}.{ext}',
      unrelated: 'kept',
    });
    await createDefaultDeps().clearStoredSettings();
    const remaining = await fakeBrowser.storage.local.get([
      EXPORT_OPTIONS_STORAGE_KEY,
      EXPORT_FORMAT_STORAGE_KEY,
      FILENAME_TEMPLATE_STORAGE_KEY,
      'unrelated',
    ]);
    expect(remaining[EXPORT_OPTIONS_STORAGE_KEY]).toBeUndefined();
    expect(remaining[EXPORT_FORMAT_STORAGE_KEY]).toBeUndefined();
    expect(remaining[FILENAME_TEMPLATE_STORAGE_KEY]).toBeUndefined();
    expect(remaining['unrelated']).toBe('kept');
  });

  it('reads the version from the manifest, degrading to undefined', () => {
    const runtime = fakeBrowser.runtime as unknown as { getManifest: () => unknown };
    const original = runtime.getManifest;
    try {
      runtime.getManifest = () => ({ version: '1.2.3' });
      expect(createDefaultDeps().getVersion()).toBe('1.2.3');
      runtime.getManifest = () => {
        throw new Error('no manifest outside an extension');
      };
      expect(createDefaultDeps().getVersion()).toBeUndefined();
    } finally {
      runtime.getManifest = original;
    }
  });

  it('confirmReset delegates to the global confirm dialog', () => {
    const confirmSpy = vi.fn(() => true);
    vi.stubGlobal('confirm', confirmSpy);
    try {
      expect(createDefaultDeps().confirmReset('sure?')).toBe(true);
      expect(confirmSpy).toHaveBeenCalledWith('sure?');
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it('notifies subscribers on local storage changes only', async () => {
    const listener = vi.fn();
    createDefaultDeps().subscribeToStorageChanges(listener);
    await fakeBrowser.storage.local.set({ ping: 1 });
    expect(listener).toHaveBeenCalledTimes(1);
    await fakeBrowser.storage.sync.set({ pong: 2 });
    expect(listener).toHaveBeenCalledTimes(1);
  });
});

describe('template helpers', () => {
  it('buildFilenamePreview renders a real filename for the sample title', () => {
    expect(buildFilenamePreview(DEFAULT_FILENAME_TEMPLATE, 'markdown', NOW)).toBe(
      'Birthday cake ideas - 2026-07-06.md',
    );
    expect(buildFilenamePreview('{date}/{title}', 'pdf', NOW)).toBe(
      '2026-07-06 Birthday cake ideas.pdf',
    );
  });

  it('buildFilenamePreview defaults the {date} to today', () => {
    vi.useRealTimers();
    const today = new Date().toISOString().slice(0, 10);
    expect(buildFilenamePreview('{date}.{ext}', 'text')).toBe(`${today}.txt`);
  });

  it('templateIssueMessage maps every issue to its catalogue message', () => {
    expect(templateIssueMessage({ kind: 'empty' })).toBe(t('filenameTemplateErrorEmpty'));
    expect(templateIssueMessage({ kind: 'unknown-placeholder', placeholder: '{x}' })).toBe(
      t('filenameTemplateErrorUnknownPlaceholder', '{x}'),
    );
    expect(templateIssueMessage({ kind: 'unbalanced-braces' })).toBe(
      t('filenameTemplateErrorUnbalanced'),
    );
  });
});
