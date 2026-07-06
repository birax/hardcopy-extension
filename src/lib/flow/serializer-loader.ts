/**
 * Runtime loader for the packaged serializer registry.
 *
 * Why this exists: WXT bundles content scripts as a single-file IIFE, so a
 * regular `import('./serializers/pdf')` would be *inlined*, dragging pdf-lib
 * and ~2 MB of bundled fonts into content.js on every claude.ai page load.
 * Instead, wxt.config.ts builds src/lib/export/serialize.ts as a standalone
 * ESM bundle at `/serializers/serialize.js` (with the heavy formats as
 * hash-named sibling chunks, listed in `web_accessible_resources`), and this
 * loader pulls it in with a **native** dynamic import at export time. The
 * `@vite-ignore` keeps Vite's hands off the call so it survives the IIFE
 * build as a real runtime `import()` — supported in content scripts by
 * Chrome (MV3) and Firefox (since 89).
 */

import { browser } from 'wxt/browser';
import type { PublicPath } from 'wxt/browser';

import type { ExportFormat } from '../export/options';
import type { PreparedConversation } from '../export/prepare';
import type { ExportPayload } from '../export/serialize';

/** The registry function's shape; see `serializeConversation`. */
export type SerializeFn = (
  prepared: PreparedConversation,
  format: ExportFormat,
) => Promise<ExportPayload>;

/** Extension-relative path of the packaged registry entry (see wxt.config.ts). */
export const SERIALIZER_BUNDLE_PATH = '/serializers/serialize.js';

let cached: Promise<SerializeFn> | undefined;

/**
 * Load the packaged serializer registry, caching the module across exports.
 * A failed load is not cached, so a transient failure can be retried.
 */
export function loadPackagedSerializer(): Promise<SerializeFn> {
  cached ??= importPackagedSerializer().catch((error: unknown) => {
    cached = undefined;
    throw error;
  });
  return cached;
}

async function importPackagedSerializer(): Promise<SerializeFn> {
  // Cast: WXT generates the PublicPath union from the entrypoints it builds
  // itself; this bundle comes from the side-build in wxt.config.ts, which
  // WXT cannot see at prepare time.
  const url = browser.runtime.getURL(SERIALIZER_BUNDLE_PATH as PublicPath);
  const module = (await import(/* @vite-ignore */ url)) as {
    serializeConversation: SerializeFn;
  };
  return module.serializeConversation;
}
