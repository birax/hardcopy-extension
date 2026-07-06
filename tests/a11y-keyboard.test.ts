// @vitest-environment happy-dom
/**
 * Keyboard and focus-order heuristics (issue #16) — the mechanically
 * checkable half of the manual audit in docs/accessibility.md.
 *
 * Tab order follows DOM order unless something overrides it, so these tests
 * pin down the two ways it could break: a positive `tabindex` (none allowed,
 * anywhere, ever) and CSS visual reordering (`order`, `*-reverse` flows —
 * WCAG 2.4.3 focus order must match the visual order). With those excluded,
 * asserting the DOM sequence of focusable controls asserts the tab order.
 *
 * Keyboard traps (WCAG 2.1.2) are excluded by construction: the UI registers
 * no key-event handlers at all — navigation is native browser behavior —
 * and a source tripwire below keeps it that way.
 */

import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { beforeEach, describe, expect, it } from 'vitest';

import { createOptionsView } from '../src/lib/options/view';
import { createPopupView } from '../src/lib/popup/view';
import type { PopupView } from '../src/lib/popup/view';

const ROOT = resolve(__dirname, '..');

/** The document-order list of keyboard-focusable elements. */
function focusable(root: ParentNode): Element[] {
  return Array.from(
    root.querySelectorAll('a[href], button, input, select, textarea, summary, [tabindex]'),
  ).filter((element) => {
    if (element.getAttribute('tabindex') === '-1') {
      return false;
    }
    if (element.hasAttribute('disabled') || element.closest('fieldset[disabled]') !== null) {
      return false;
    }
    return element.closest('[hidden]') === null;
  });
}

describe('popup: keyboard access', () => {
  let view: PopupView;

  beforeEach(() => {
    document.body.innerHTML = '';
    view = createPopupView(document);
  });

  it('uses no positive tabindex anywhere', () => {
    for (const element of document.querySelectorAll('[tabindex]')) {
      expect(Number(element.getAttribute('tabindex'))).toBeLessThanOrEqual(0);
    }
  });

  it('has no focusable controls while probing (everything is disabled)', () => {
    view.render({ status: 'probing' });
    expect(focusable(view.main)).toEqual([]);
  });

  it('tab order in the ready state matches the visual order', () => {
    view.render({ status: 'ready', conversationTitle: 'T' });
    const sequence = focusable(view.main).map((element) =>
      element instanceof HTMLInputElement
        ? `${element.type}:${element.name}`
        : element.tagName.toLowerCase(),
    );
    expect(sequence).toEqual([
      'radio:format',
      'radio:format',
      'radio:format',
      'radio:format',
      'radio:format',
      'checkbox:includeThinking',
      'checkbox:includeToolUse',
      'checkbox:includeToolResults',
      'checkbox:includeArtifacts',
      'checkbox:includeAttachments',
      'checkbox:includeTimestamps',
      'checkbox:includeConversationMetadata',
      'radio:branches',
      'radio:branches',
      'button',
    ]);
  });

  it('disclosure summaries are focusable and carry a visible label', () => {
    view.render({
      status: 'failure',
      conversationTitle: 'T',
      failure: { ok: false, kind: 'network', message: 'm', detail: 'HTTP 503' },
    });
    const summaries = Array.from(view.main.querySelectorAll('summary'));
    expect(summaries.length).toBeGreaterThan(0);
    for (const summary of summaries) {
      expect(summary.textContent?.trim()).not.toBe('');
    }
  });

  it('the aria-live region is never focusable and never hidden', () => {
    expect(focusable(view.main)).not.toContain(view.statusRegion);
    for (const state of ['probing', 'exporting'] as const) {
      view.render(
        state === 'probing' ? { status: 'probing' } : { status: 'exporting', conversationTitle: null },
      );
      expect(view.statusRegion.hasAttribute('hidden')).toBe(false);
    }
  });
});

describe('options page: keyboard access', () => {
  beforeEach(() => {
    document.body.innerHTML = '';
  });

  it('tab order matches the visual order: controls, template field, reset, links', () => {
    const view = createOptionsView(document, { version: '1.2.3' });
    const sequence = focusable(view.main).map((element) => {
      if (element instanceof HTMLInputElement) {
        return `${element.type}:${element.name}`;
      }
      if (element instanceof HTMLAnchorElement) {
        return 'a';
      }
      return element.tagName.toLowerCase();
    });
    expect(sequence).toEqual([
      ...Array<string>(5).fill('radio:format'),
      'checkbox:includeThinking',
      'checkbox:includeToolUse',
      'checkbox:includeToolResults',
      'checkbox:includeArtifacts',
      'checkbox:includeAttachments',
      'checkbox:includeTimestamps',
      'checkbox:includeConversationMetadata',
      'radio:branches',
      'radio:branches',
      'text:filenameTemplate', // the template input…
      'button', // …then its reset button, in reading order
      'button', // reset all settings
      'a', // source code
      'a', // privacy policy
    ]);
  });

  it('uses no positive tabindex anywhere', () => {
    createOptionsView(document, {});
    for (const element of document.querySelectorAll('[tabindex]')) {
      expect(Number(element.getAttribute('tabindex'))).toBeLessThanOrEqual(0);
    }
  });
});

describe('source tripwires: what keeps the above true', () => {
  const VIEW_SOURCES = [
    'src/lib/popup/view.ts',
    'src/lib/popup/controller.ts',
    'src/lib/options/view.ts',
    'src/lib/options/controller.ts',
  ];

  it.each(VIEW_SOURCES)('%s registers no key-event handlers (no traps to create)', (path) => {
    const source = readFileSync(resolve(ROOT, path), 'utf8');
    expect(source).not.toMatch(/keydown|keyup|keypress/);
  });

  it.each(['src/entrypoints/popup/style.css', 'src/entrypoints/options/style.css'])(
    '%s never reorders content visually (focus order = DOM order)',
    (path) => {
      const css = readFileSync(resolve(ROOT, path), 'utf8');
      expect(css).not.toMatch(/-reverse|\border\s*:/);
    },
  );
});
