/**
 * Defensive accessors for untyped API JSON. The parser never trusts the
 * upstream shape: every read degrades to `undefined` instead of throwing.
 */

/** A JSON object with unknown values. */
export type JsonObject = Record<string, unknown>;

/** True when `value` is a non-null, non-array object. */
export function isObject(value: unknown): value is JsonObject {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/** `value` as a string, else `undefined`. */
export function asString(value: unknown): string | undefined {
  return typeof value === 'string' ? value : undefined;
}

/** `value` as a finite number, else `undefined`. */
export function asNumber(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isFinite(value) ? value : undefined;
}

/** `value` as an array, else `undefined`. */
export function asArray(value: unknown): unknown[] | undefined {
  return Array.isArray(value) ? value : undefined;
}

/** The first string found among `keys` on `obj`, else `undefined`. */
export function firstString(obj: JsonObject, ...keys: string[]): string | undefined {
  for (const key of keys) {
    const value = asString(obj[key]);
    if (value !== undefined) {
      return value;
    }
  }
  return undefined;
}
