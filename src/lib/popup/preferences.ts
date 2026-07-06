/**
 * The popup's persisted preferences: the shared export options (issue #13's
 * model, stored via `src/lib/export/storage.ts`) plus the chosen format,
 * which is popup-specific and therefore stored under its own key with the
 * same validate-or-default reading discipline.
 */

import { browser } from 'wxt/browser';

import { isExportFormat } from '../export/options';
import type { ExportFormat, ExportOptions } from '../export/options';
import { loadExportOptions, saveExportOptions } from '../export/storage';

/** The `storage.local` key the chosen export format is stored under. */
export const EXPORT_FORMAT_STORAGE_KEY = 'exportFormat';

/** The format every fresh install starts on. */
export const DEFAULT_EXPORT_FORMAT: ExportFormat = 'markdown';

/** Everything the popup remembers between opens. */
export interface PopupPreferences {
  /** The chosen output format. */
  format: ExportFormat;
  /** The shared export options (issue #13). */
  options: ExportOptions;
}

/**
 * Load the persisted preferences. Anything missing or unusable falls back to
 * its default, so stored values from other versions degrade gracefully.
 */
export async function loadPreferences(): Promise<PopupPreferences> {
  const [options, stored] = await Promise.all([
    loadExportOptions(),
    browser.storage.local.get(EXPORT_FORMAT_STORAGE_KEY),
  ]);
  const rawFormat: unknown = stored[EXPORT_FORMAT_STORAGE_KEY];
  return {
    format: isExportFormat(rawFormat) ? rawFormat : DEFAULT_EXPORT_FORMAT,
    options,
  };
}

/** Persist the preferences for future popup opens. */
export async function savePreferences(preferences: PopupPreferences): Promise<void> {
  await Promise.all([
    saveExportOptions(preferences.options),
    browser.storage.local.set({ [EXPORT_FORMAT_STORAGE_KEY]: preferences.format }),
  ]);
}
