/**
 * Export filename templating, building on the cross-OS sanitizer in
 * src/lib/filename.ts. One function derives the download name for every
 * format: `{title} - {date}.{ext}` by default, e.g.
 * `Birthday cake ideas - 2026-06-25.md`.
 */

import { DEFAULT_BASENAME, sanitizeBasename } from '../filename';
import { DEFAULT_CONVERSATION_TITLE, EXPORT_FORMATS } from './options';
import type { ExportFormat } from './options';

/**
 * The default filename template. Placeholders: `{title}` (sanitized
 * conversation title), `{date}` (`YYYY-MM-DD`), `{ext}` (format extension,
 * no dot).
 */
export const DEFAULT_FILENAME_TEMPLATE = '{title} - {date}.{ext}';

/** Input to {@link buildExportFilename}. */
export interface ExportFilenameInput {
  /**
   * Conversation title. Empty, whitespace-only, missing, or wholly-unusable
   * titles fall back to {@link DEFAULT_CONVERSATION_TITLE}.
   */
  title: string | undefined;
  /**
   * Date for the `{date}` placeholder — a `Date` or an ISO-8601 string
   * (typically the conversation's `createdAt`). Missing or unparsable values
   * fall back to today. Rendered as `YYYY-MM-DD` in UTC.
   */
  date?: Date | string;
  /** Output format; determines the extension (and default MIME type). */
  format: ExportFormat;
  /** Filename template; defaults to {@link DEFAULT_FILENAME_TEMPLATE}. */
  template?: string;
}

/**
 * Build a download filename for an export.
 *
 * The rendered name (minus its extension) is passed through
 * {@link sanitizeBasename}, so the result is safe on Windows, macOS, and
 * Linux and capped in length; the correct extension for the format is always
 * appended, even when a custom template omits `.{ext}`.
 */
export function buildExportFilename(input: ExportFilenameInput): string {
  const { extension } = EXPORT_FORMATS[input.format];
  const template = input.template ?? DEFAULT_FILENAME_TEMPLATE;

  const rendered = template
    .replaceAll('{title}', resolveTitle(input.title))
    .replaceAll('{date}', formatDateStamp(input.date))
    .replaceAll('{ext}', extension);

  const suffix = `.${extension}`;
  const stem = rendered.endsWith(suffix) ? rendered.slice(0, -suffix.length) : rendered;
  return `${sanitizeBasename(stem)}${suffix}`;
}

/**
 * Sanitize the title, replacing the base sanitizer's generic fallback with
 * {@link DEFAULT_CONVERSATION_TITLE} — but only when the fallback was not
 * literally the user's own title.
 */
function resolveTitle(title: string | undefined): string {
  const trimmed = (title ?? '').trim();
  const sanitized = sanitizeBasename(trimmed);
  if (sanitized === DEFAULT_BASENAME && trimmed !== DEFAULT_BASENAME) {
    return DEFAULT_CONVERSATION_TITLE;
  }
  return sanitized;
}

/** Format a date as `YYYY-MM-DD` (UTC), falling back to today when unusable. */
function formatDateStamp(date: Date | string | undefined): string {
  const parsed = date instanceof Date ? date : date !== undefined ? new Date(date) : new Date();
  const valid = Number.isNaN(parsed.getTime()) ? new Date() : parsed;
  return valid.toISOString().slice(0, 10);
}
