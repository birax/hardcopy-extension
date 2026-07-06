/**
 * Locale-aware byte-count formatting for the popup's success state, via
 * `Intl.NumberFormat`'s sanctioned digital units — no hand-rolled unit
 * strings to translate (issue #18).
 */

const UNITS = ['byte', 'kilobyte', 'megabyte', 'gigabyte'] as const;

/**
 * Format a byte count for display, e.g. `12 bytes`, `3.4 kB`, `120 MB`.
 * Decimal units (1 kB = 1000 bytes), matching what file managers show.
 * `locales` defaults to the browser UI locale.
 */
export function formatByteCount(byteCount: number, locales?: string | string[]): string {
  let value = byteCount;
  let index = 0;
  while (value >= 1000 && index < UNITS.length - 1) {
    value /= 1000;
    index += 1;
  }
  const unit = UNITS[index] ?? 'byte';
  return new Intl.NumberFormat(locales, {
    style: 'unit',
    unit,
    unitDisplay: unit === 'byte' ? 'long' : 'short',
    maximumFractionDigits: unit === 'byte' || value >= 10 ? 0 : 1,
  }).format(value);
}
