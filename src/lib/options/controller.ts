/**
 * The options page's controller: glue between the view, the shared settings
 * storage, and the browser. Every browser touchpoint is injectable, so the
 * full load → edit → persist → indicate flow is testable without a real
 * browser (same discipline as src/lib/popup/controller.ts).
 *
 * Persistence model (issue #15): format and include-options go through the
 * exact helpers the popup uses — same `storage.local` keys, so the two
 * surfaces can never disagree — and the filename template has its own key
 * with the same validate-or-default reading. Everything saves on change;
 * the template save is debounced while the user types, and every persist
 * flashes a "Saved" indicator that doubles as the polite live announcement.
 */

import { browser } from 'wxt/browser';

import { DEFAULT_FILENAME_TEMPLATE, validateFilenameTemplate } from '../export/filename';
import { DEFAULT_EXPORT_OPTIONS } from '../export/options';
import {
  EXPORT_OPTIONS_STORAGE_KEY,
  FILENAME_TEMPLATE_STORAGE_KEY,
  loadFilenameTemplate,
  saveFilenameTemplate,
} from '../export/storage';
import { t } from '../i18n';
import {
  DEFAULT_EXPORT_FORMAT,
  EXPORT_FORMAT_STORAGE_KEY,
  loadPreferences,
  savePreferences,
} from '../popup/preferences';
import { buildFilenamePreview, templateIssueMessage } from './template';
import { createOptionsView } from './view';
import type { OptionsSettings, OptionsView } from './view';

/** How long the template input stays quiet before its value is persisted. */
export const TEMPLATE_SAVE_DEBOUNCE_MS = 400;

/** How long the "Saved" indicator stays visible after a persist. */
export const SAVED_INDICATOR_MS = 2000;

/** Every setting at its default (what "Reset all settings" restores). */
export const DEFAULT_SETTINGS: Readonly<OptionsSettings> = Object.freeze({
  format: DEFAULT_EXPORT_FORMAT,
  options: DEFAULT_EXPORT_OPTIONS,
  template: DEFAULT_FILENAME_TEMPLATE,
});

/** The controller's browser touchpoints, injectable for tests. */
export interface OptionsControllerDeps {
  /** Load the shared format + include-options (popup's keys). */
  loadPreferences: typeof loadPreferences;
  /** Persist the shared format + include-options (popup's keys). */
  savePreferences: typeof savePreferences;
  /** Load the filename template (validated, defaulted). */
  loadTemplate(): Promise<string>;
  /** Persist the filename template. */
  saveTemplate(template: string): Promise<void>;
  /** Remove every Hardcopy setting from storage. */
  clearStoredSettings(): Promise<void>;
  /** Ask the user to confirm the reset; `true` proceeds. */
  confirmReset(message: string): boolean;
  /** The extension version for the About section, when known. */
  getVersion(): string | undefined;
  /**
   * Subscribe to `storage.local` changes so edits made elsewhere (the popup)
   * appear here without a reload.
   */
  subscribeToStorageChanges(listener: () => void): void;
  /** Clock for the filename preview's `{date}`. */
  now(): Date;
}

/** A running options page, exposed for tests. */
export interface OptionsController {
  /** The rendered view. */
  view: OptionsView;
  /** The settings as last loaded/edited. */
  getSettings(): OptionsSettings;
}

/** The real browser wiring; separated so tests can cover its guards. */
export function createDefaultDeps(): OptionsControllerDeps {
  return {
    loadPreferences,
    savePreferences,
    loadTemplate: loadFilenameTemplate,
    saveTemplate: saveFilenameTemplate,
    async clearStoredSettings(): Promise<void> {
      await browser.storage.local.remove([
        EXPORT_OPTIONS_STORAGE_KEY,
        EXPORT_FORMAT_STORAGE_KEY,
        FILENAME_TEMPLATE_STORAGE_KEY,
      ]);
    },
    confirmReset(message: string): boolean {
      return globalThis.confirm(message);
    },
    getVersion(): string | undefined {
      try {
        return browser.runtime.getManifest().version;
      } catch {
        // Outside an extension context (tests) there is no manifest.
        return undefined;
      }
    },
    subscribeToStorageChanges(listener: () => void): void {
      browser.storage.onChanged.addListener((_changes, area) => {
        if (area === 'local') {
          listener();
        }
      });
    },
    now: () => new Date(),
  };
}

/**
 * Build the options page inside `doc`, restore persisted settings, and wire
 * up save-on-change. Resolves once the stored settings are on screen.
 */
export async function initOptions(
  doc: Document,
  deps: OptionsControllerDeps = createDefaultDeps(),
): Promise<OptionsController> {
  const view = createOptionsView(doc, { version: deps.getVersion() });

  let settings: OptionsSettings = {
    ...DEFAULT_SETTINGS,
    options: { ...DEFAULT_SETTINGS.options },
  };
  let templateTimer: ReturnType<typeof setTimeout> | undefined;
  let indicatorTimer: ReturnType<typeof setTimeout> | undefined;

  function renderPreview(): void {
    view.renderPreview(buildFilenamePreview(settings.template, settings.format, deps.now));
  }

  function showStatus(message: string): void {
    view.showStatus(message);
    clearTimeout(indicatorTimer);
    indicatorTimer = setTimeout(() => {
      view.clearStatus();
    }, SAVED_INDICATOR_MS);
  }

  async function loadAll(): Promise<OptionsSettings> {
    const [preferences, template] = await Promise.all([
      deps.loadPreferences(),
      deps.loadTemplate(),
    ]);
    return { format: preferences.format, options: preferences.options, template };
  }

  settings = await loadAll();
  view.writeSettings(settings);
  renderPreview();

  view.onControlsChanged(() => {
    const read = view.readSettings();
    settings = { ...settings, format: read.format, options: read.options };
    renderPreview();
    void deps.savePreferences({ format: settings.format, options: settings.options }).then(() => {
      showStatus(t('savedIndicator'));
    });
  });

  view.onTemplateInput(() => {
    const template = view.templateInput.value;
    const issue = validateFilenameTemplate(template);
    clearTimeout(templateTimer);
    if (issue !== null) {
      // Invalid input is flagged but never persisted; the last good template
      // stays in effect until the user fixes it.
      view.renderTemplateError(templateIssueMessage(issue));
      return;
    }
    view.renderTemplateError(null);
    settings = { ...settings, template };
    renderPreview();
    templateTimer = setTimeout(() => {
      void deps.saveTemplate(template).then(() => {
        showStatus(t('savedIndicator'));
      });
    }, TEMPLATE_SAVE_DEBOUNCE_MS);
  });

  view.onTemplateReset(() => {
    clearTimeout(templateTimer);
    settings = { ...settings, template: DEFAULT_FILENAME_TEMPLATE };
    view.writeSettings(settings);
    view.renderTemplateError(null);
    renderPreview();
    void deps.saveTemplate(DEFAULT_FILENAME_TEMPLATE).then(() => {
      showStatus(t('savedIndicator'));
    });
  });

  view.onResetAll(() => {
    if (!deps.confirmReset(t('resetAllConfirm'))) {
      return;
    }
    clearTimeout(templateTimer);
    void deps.clearStoredSettings().then(() => {
      settings = { ...DEFAULT_SETTINGS, options: { ...DEFAULT_SETTINGS.options } };
      view.writeSettings(settings);
      view.renderTemplateError(null);
      renderPreview();
      showStatus(t('resetAllDone'));
    });
  });

  deps.subscribeToStorageChanges(() => {
    void loadAll().then((loaded) => {
      // Never clobber a template mid-edit; the storage echo of our own saves
      // lands here too, so the focused input keeps the user's keystrokes.
      const template =
        doc.activeElement === view.templateInput ? view.templateInput.value : loaded.template;
      settings = { ...loaded, template };
      view.writeSettings(settings);
      renderPreview();
    });
  });

  return {
    view,
    getSettings: () => settings,
  };
}
