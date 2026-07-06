/**
 * Typed wrapper around the WebExtension i18n API (issue #18).
 *
 * All user-visible strings live in `public/_locales/en/messages.json`; this
 * module is the only way UI code reads them. The English catalogue is also
 * imported at compile time, which gives:
 *
 * - **Exhaustiveness at dev time** — `t()` only accepts keys that exist in
 *   the catalogue ({@link MessageKey} is derived from the JSON), so a typo or
 *   a deleted message is a type error, not a blank string in production.
 * - **A test/dev fallback** — `browser.i18n` only exists inside a real
 *   extension context; everywhere else (unit tests) `t()` falls back to the
 *   bundled English messages, so rendered output stays assertable.
 *
 * The unit test in `tests/i18n.test.ts` closes the loop in the other
 * direction: every catalogue key must be referenced from source (or from the
 * manifest as `__MSG_key__`), so dead messages cannot accumulate.
 *
 * To add a locale, copy `public/_locales/en/` — see docs/CONTRIBUTING.md.
 */

import { browser } from 'wxt/browser';

import enMessages from '../../public/_locales/en/messages.json';

/** Every user-visible message key, derived from the English catalogue. */
export type MessageKey = keyof typeof enMessages;

/** All message keys, for the exhaustiveness checks in tests. */
export const MESSAGE_KEYS: readonly MessageKey[] = Object.freeze(
  Object.keys(enMessages) as MessageKey[],
);

/**
 * Resolve a message in the user's locale, `$1`–`$9` replaced by
 * `substitutions` in order. Falls back to the bundled English catalogue when
 * the extension i18n API is unavailable (unit tests) or has no translation.
 */
export function t(key: MessageKey, substitutions?: string | readonly string[]): string {
  const subs = substitutions === undefined ? undefined : toArray(substitutions);
  try {
    const message = browser.i18n.getMessage(key, subs === undefined ? undefined : [...subs]);
    if (message !== '') {
      return message;
    }
  } catch {
    // browser.i18n is unavailable outside an extension context — use the fallback.
  }
  return substitute(enMessages[key].message, subs ?? []);
}

/** Normalise the substitutions argument to an array. */
function toArray(substitutions: string | readonly string[]): readonly string[] {
  return typeof substitutions === 'string' ? [substitutions] : substitutions;
}

/** Replace `$1`–`$9` the way `browser.i18n.getMessage` does. */
function substitute(message: string, substitutions: readonly string[]): string {
  return message.replace(/\$(\d)/g, (_match, digit: string) => {
    return substitutions[Number(digit) - 1] ?? '';
  });
}
