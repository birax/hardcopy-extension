/**
 * Persistence for the user's export options via `storage.local` (issue #13).
 * The popup and options page (M3) read and write through these helpers, so
 * defaults, validation, and forward compatibility live in exactly one place.
 */

import { browser } from 'wxt/browser';

import { DEFAULT_FILENAME_TEMPLATE, isValidFilenameTemplate } from './filename';
import { DEFAULT_EXPORT_OPTIONS } from './options';
import type { ExportOptions } from './options';

/** The `storage.local` key export options are stored under. */
export const EXPORT_OPTIONS_STORAGE_KEY = 'exportOptions';

/** The boolean toggles of {@link ExportOptions}, for stored-value validation. */
const BOOLEAN_OPTION_KEYS = [
  'includeThinking',
  'includeToolUse',
  'includeToolResults',
  'includeArtifacts',
  'includeAttachments',
  'includeTimestamps',
  'includeConversationMetadata',
] as const satisfies readonly (keyof ExportOptions)[];

/**
 * Load the persisted export options, merged onto
 * {@link DEFAULT_EXPORT_OPTIONS}. Missing keys, unknown keys, and values of
 * the wrong type are ignored (each falls back to its default), so options
 * added or removed in future versions degrade gracefully.
 */
export async function loadExportOptions(): Promise<ExportOptions> {
  const stored = await browser.storage.local.get(EXPORT_OPTIONS_STORAGE_KEY);
  return coerceStoredOptions(stored[EXPORT_OPTIONS_STORAGE_KEY]);
}

/** Persist export options to `storage.local` for future sessions. */
export async function saveExportOptions(options: ExportOptions): Promise<void> {
  await browser.storage.local.set({ [EXPORT_OPTIONS_STORAGE_KEY]: options });
}

/** The `storage.local` key the filename template is stored under. */
export const FILENAME_TEMPLATE_STORAGE_KEY = 'filenameTemplate';

/**
 * Load the persisted filename template. Missing, non-string, or invalid
 * values (per {@link isValidFilenameTemplate}) fall back to
 * {@link DEFAULT_FILENAME_TEMPLATE}, so a bad stored value can never break
 * an export.
 */
export async function loadFilenameTemplate(): Promise<string> {
  const stored = await browser.storage.local.get(FILENAME_TEMPLATE_STORAGE_KEY);
  const raw: unknown = stored[FILENAME_TEMPLATE_STORAGE_KEY];
  return typeof raw === 'string' && isValidFilenameTemplate(raw) ? raw : DEFAULT_FILENAME_TEMPLATE;
}

/** Persist the filename template to `storage.local` for future exports. */
export async function saveFilenameTemplate(template: string): Promise<void> {
  await browser.storage.local.set({ [FILENAME_TEMPLATE_STORAGE_KEY]: template });
}

/** Validate a stored value field-by-field, defaulting anything unusable. */
function coerceStoredOptions(raw: unknown): ExportOptions {
  const options: ExportOptions = { ...DEFAULT_EXPORT_OPTIONS };
  if (typeof raw !== 'object' || raw === null) {
    return options;
  }
  const record = raw as Record<string, unknown>;
  for (const key of BOOLEAN_OPTION_KEYS) {
    const value = record[key];
    if (typeof value === 'boolean') {
      options[key] = value;
    }
  }
  const branches = record['branches'];
  if (branches === 'current' || branches === 'all') {
    options.branches = branches;
  }
  return options;
}
