/**
 * In-page download trigger: Blob → object URL → synthetic anchor click,
 * executed in the content script's DOM.
 *
 * Why this mechanism (and not `browser.downloads.download`):
 *
 * - MV3 background service workers have no `URL.createObjectURL`, so handing
 *   bytes to the background to download would force a data: URL round-trip
 *   (slow, memory-doubling) or an offscreen document (Chrome-only).
 * - Clicking an anchor in the page that created the blob URL sidesteps
 *   Firefox's cross-context blob-URL restrictions: a blob URL minted in the
 *   content script is only reliably fetchable from that same page context.
 * - The anchor's `download` attribute works on a same-origin blob URL without
 *   any extension permission.
 *
 * NOTE for manifest review: because this path needs no extension API at all,
 * the `downloads` permission in wxt.config.ts is currently unused by the
 * export flow. If this in-page approach holds through store review and the
 * background never grows a download path, `downloads` can be dropped from the
 * manifest (smaller permission prompt). Deliberately not changed here — the
 * manifest is owned by wxt.config.ts and should be trimmed as its own change.
 */

/** Everything needed to trigger one download. */
export interface DownloadRequest {
  /** Download filename, from `buildExportFilename`. */
  filename: string;
  /** File contents. */
  bytes: Uint8Array;
  /** Blob MIME type, e.g. `'application/pdf'`. */
  mimeType: string;
}

/** Injectable pieces of {@link triggerDownload}, for tests. */
export interface DownloadDeps {
  /** Document used to create and click the anchor; defaults to the page's. */
  document?: Document;
  /** Object-URL factory; defaults to `URL.createObjectURL`. */
  createObjectUrl?: (blob: Blob) => string;
  /** Object-URL disposer; defaults to `URL.revokeObjectURL`. */
  revokeObjectUrl?: (url: string) => void;
}

/**
 * Save `bytes` as a file from the page context.
 *
 * Creates a Blob, mints an object URL, clicks a detached anchor pointing at
 * it, and always revokes the URL afterwards (the browser snapshots the blob
 * at click time, so immediate revocation is safe and avoids leaking the
 * conversation bytes in memory for the page's lifetime).
 */
export function triggerDownload(request: DownloadRequest, deps: DownloadDeps = {}): void {
  const doc = deps.document ?? globalThis.document;
  const createObjectUrl = deps.createObjectUrl ?? URL.createObjectURL.bind(URL);
  const revokeObjectUrl = deps.revokeObjectUrl ?? URL.revokeObjectURL.bind(URL);

  // Copy into a fresh ArrayBuffer-backed view: Blob accepts only
  // ArrayBuffer-backed BufferSources, and `bytes` may be SharedArrayBuffer- or
  // resizable-buffer-backed in exotic contexts.
  const blob = new Blob([Uint8Array.from(request.bytes)], { type: request.mimeType });
  const url = createObjectUrl(blob);
  try {
    const anchor = doc.createElement('a');
    anchor.href = url;
    anchor.download = request.filename;
    anchor.rel = 'noopener';
    anchor.style.display = 'none';
    // Firefox requires the anchor to be in a document for a synthetic click
    // to start a download; Chrome does not care. Append, click, remove.
    doc.body.append(anchor);
    try {
      anchor.click();
    } finally {
      anchor.remove();
    }
  } finally {
    revokeObjectUrl(url);
  }
}
