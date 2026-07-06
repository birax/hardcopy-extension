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

/** The placeholder names a filename template may use. */
export const FILENAME_TEMPLATE_PLACEHOLDERS: readonly string[] = Object.freeze([
  'title',
  'date',
  'ext',
]);

/**
 * Why a filename template is unusable:
 *
 * - `'empty'`               — nothing but whitespace.
 * - `'unknown-placeholder'` — a `{...}` token that is not a supported
 *                             placeholder; `placeholder` carries it verbatim
 *                             (e.g. `'{foo}'`) for the error message.
 * - `'unbalanced-braces'`   — a stray `{` or `}` outside any placeholder.
 */
export type FilenameTemplateIssue =
  | { kind: 'empty' }
  | { kind: 'unknown-placeholder'; placeholder: string }
  | { kind: 'unbalanced-braces' };

/**
 * Validate a filename template: only `{title}`, `{date}` and `{ext}` are
 * allowed as placeholders, and braces must pair up. Returns the first issue
 * found, or `null` for a usable template. (Filesystem safety is not checked
 * here — {@link buildExportFilename} sanitizes whatever the template renders.)
 */
export function validateFilenameTemplate(template: string): FilenameTemplateIssue | null {
  if (template.trim() === '') {
    return { kind: 'empty' };
  }
  for (const match of template.matchAll(/\{([^{}]*)\}/g)) {
    const name = match[1] ?? '';
    if (!FILENAME_TEMPLATE_PLACEHOLDERS.includes(name)) {
      return { kind: 'unknown-placeholder', placeholder: `{${name}}` };
    }
  }
  if (/[{}]/.test(template.replace(/\{[^{}]*\}/g, ''))) {
    return { kind: 'unbalanced-braces' };
  }
  return null;
}

/** True when {@link validateFilenameTemplate} finds nothing wrong. */
export function isValidFilenameTemplate(template: string): boolean {
  return validateFilenameTemplate(template) === null;
}

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
