/**
 * Turn an arbitrary string (e.g. a conversation title) into a filename that is
 * safe on Windows, macOS, and Linux, and acceptable to the browser downloads API.
 */

/** Characters forbidden in filenames on at least one supported OS. */
// eslint-disable-next-line no-control-regex
const FORBIDDEN_CHARS = /[<>:"/\\|?*\u0000-\u001f]/g;

/** Windows reserved device names (case-insensitive, extension ignored). */
const RESERVED_NAMES = /^(con|prn|aux|nul|com[1-9]|lpt[1-9])$/i;

export const DEFAULT_BASENAME = 'conversation';

export const MAX_BASENAME_LENGTH = 120;

/**
 * Sanitize a string for use as the base name (no extension) of an exported file.
 *
 * - Replaces forbidden characters and whitespace runs with a single space
 * - Strips leading/trailing dots and spaces (Windows rejects them)
 * - Truncates to {@link MAX_BASENAME_LENGTH} characters
 * - Falls back to {@link DEFAULT_BASENAME} when nothing usable remains
 */
export function sanitizeBasename(input: string): string {
  let name = input
    .replace(FORBIDDEN_CHARS, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/^[. ]+|[. ]+$/g, '');

  if (name.length > MAX_BASENAME_LENGTH) {
    name = name.slice(0, MAX_BASENAME_LENGTH).trimEnd();
  }

  if (name.length === 0 || RESERVED_NAMES.test(name)) {
    return DEFAULT_BASENAME;
  }

  return name;
}
