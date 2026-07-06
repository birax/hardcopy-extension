// @vitest-environment happy-dom
/**
 * In-page download trigger tests: blob -> object URL -> anchor click, with
 * the URL always revoked and the anchor never left in the DOM.
 */

import { afterEach, describe, expect, it, vi } from 'vitest';

import { triggerDownload } from '../src/lib/flow/download';

const BYTES = new Uint8Array([0x25, 0x50, 0x44, 0x46, 0x2d]); // "%PDF-"

interface ClickedAnchor {
  href: string;
  download: string;
  rel: string;
  connectedAtClick: boolean;
}

/** Capture anchor clicks document-wide (the anchor is removed right after). */
function captureClicks(clicks: ClickedAnchor[]): () => void {
  const listener = (event: Event): void => {
    const anchor = event.target;
    if (anchor instanceof HTMLAnchorElement) {
      event.preventDefault();
      clicks.push({
        href: anchor.getAttribute('href') ?? '',
        download: anchor.download,
        rel: anchor.rel,
        connectedAtClick: anchor.isConnected,
      });
    }
  };
  document.addEventListener('click', listener, true);
  return () => document.removeEventListener('click', listener, true);
}

describe('triggerDownload', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('clicks a hidden in-document anchor at an object URL for the blob', () => {
    const clicks: ClickedAnchor[] = [];
    const stop = captureClicks(clicks);
    const revoked: string[] = [];
    let blobbed: Blob | undefined;

    triggerDownload(
      { filename: 'My chat - 2026-07-06.pdf', bytes: BYTES, mimeType: 'application/pdf' },
      {
        document,
        createObjectUrl: (blob) => {
          blobbed = blob;
          return 'blob:https://claude.ai/fake-url';
        },
        revokeObjectUrl: (url) => revoked.push(url),
      },
    );
    stop();

    expect(clicks).toEqual([
      {
        href: 'blob:https://claude.ai/fake-url',
        download: 'My chat - 2026-07-06.pdf',
        rel: 'noopener',
        connectedAtClick: true,
      },
    ]);
    expect(blobbed?.type).toBe('application/pdf');
    expect(blobbed?.size).toBe(BYTES.byteLength);
    // The URL is revoked and the anchor is gone.
    expect(revoked).toEqual(['blob:https://claude.ai/fake-url']);
    expect(document.querySelectorAll('a')).toHaveLength(0);
  });

  it('revokes the object URL even when the click throws', () => {
    const revoked: string[] = [];
    vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {
      throw new Error('click blocked');
    });

    expect(() =>
      triggerDownload(
        { filename: 'x.txt', bytes: BYTES, mimeType: 'text/plain' },
        {
          document,
          createObjectUrl: () => 'blob:https://claude.ai/leaky',
          revokeObjectUrl: (url) => revoked.push(url),
        },
      ),
    ).toThrow('click blocked');

    expect(revoked).toEqual(['blob:https://claude.ai/leaky']);
    expect(document.querySelectorAll('a')).toHaveLength(0);
  });

  it('uses the global document and URL factory by default', () => {
    const clicks: ClickedAnchor[] = [];
    const stop = captureClicks(clicks);
    const create = vi
      .spyOn(URL, 'createObjectURL')
      .mockReturnValue('blob:https://claude.ai/default');
    const revoke = vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => undefined);

    triggerDownload({ filename: 'notes.md', bytes: BYTES, mimeType: 'text/markdown' });
    stop();

    expect(clicks).toHaveLength(1);
    expect(clicks[0]?.download).toBe('notes.md');
    expect(create).toHaveBeenCalledOnce();
    expect(revoke).toHaveBeenCalledWith('blob:https://claude.ai/default');
  });
});
