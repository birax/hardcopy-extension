// @vitest-environment happy-dom
/**
 * Automated accessibility audit (issue #16): axe-core runs against the fully
 * rendered popup and options DOM in every reachable state, and any WCAG A/AA
 * violation fails the suite.
 *
 * What this covers and what it cannot (see docs/accessibility.md):
 *
 * - happy-dom parses CSS but does not lay anything out, so axe's
 *   `color-contrast` and `target-size` checks cannot compute real pixels or
 *   colors here. Both are disabled explicitly below. Contrast is covered
 *   instead by tests/a11y-contrast.test.ts, which recomputes every token
 *   pairing from the stylesheets; target size is held by the design-system
 *   CSS rules (24px+ hit areas) and the manual audit notes.
 * - Everything structural — names, roles, ARIA attribute validity, labels,
 *   nesting, live regions — is enforced here, in every UI state.
 *
 * The suite is strict about `incomplete` results too: if axe cannot decide a
 * rule (beyond the two knowingly disabled ones), that is a finding to
 * investigate, not something to scroll past.
 */

import axe from 'axe-core';
import { beforeEach, describe, expect, it } from 'vitest';

import type { ExportFailure, ExportSuccess } from '../src/lib/flow/export';
import { createOptionsView } from '../src/lib/options/view';
import type { OptionsView } from '../src/lib/options/view';
import { createPopupView } from '../src/lib/popup/view';
import type { PopupView } from '../src/lib/popup/view';
import type { PopupState } from '../src/lib/popup/state';

/** Run axe over the whole document at WCAG A/AA and return its results. */
async function audit(): Promise<axe.AxeResults> {
  return axe.run(document, {
    runOnly: {
      type: 'tag',
      values: ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'],
    },
    rules: {
      // happy-dom has no layout engine or color resolution; these two are
      // covered by tests/a11y-contrast.test.ts and the manual audit instead.
      'color-contrast': { enabled: false },
      'target-size': { enabled: false },
    },
  });
}

/** Assert an axe result is fully clean: no violations, nothing undecided. */
function expectClean(results: axe.AxeResults): void {
  const violations = results.violations.map((violation) => ({
    id: violation.id,
    impact: violation.impact,
    help: violation.help,
    nodes: violation.nodes.map((node) => node.target.join(' ')),
  }));
  expect(violations).toEqual([]);
  const undecided = results.incomplete.map((check) => check.id);
  expect(undecided).toEqual([]);
}

/**
 * Mirror the entrypoint HTML shells (src/entrypoints/{popup,options}/index.html),
 * which declare the language and title that the happy-dom document lacks.
 */
function resetDocument(): void {
  document.body.innerHTML = '';
  document.documentElement.setAttribute('lang', 'en');
  document.title = 'Hardcopy';
}

const SUCCESS: ExportSuccess = {
  ok: true,
  filename: 'Birthday cake ideas - 2026-07-06.md',
  byteCount: 12345,
  warnings: [],
};

const DEGRADED: ExportSuccess = {
  ...SUCCESS,
  degraded: true,
  warnings: ['Exported from the rendered page', 'attachments unavailable'],
};

const FAILURE: ExportFailure = {
  ok: false,
  kind: 'network',
  message: 'claude.ai could not be reached — check your connection and try again.',
  detail: 'HTTP 503',
};

/** Every state the popup can render, by name. */
const POPUP_STATES: ReadonlyArray<[string, PopupState]> = [
  ['probing', { status: 'probing' }],
  ['unsupported page (not claude.ai)', { status: 'unsupported-page', onClaudeAi: false }],
  ['unsupported page (stale claude.ai tab)', { status: 'unsupported-page', onClaudeAi: true }],
  ['no conversation', { status: 'no-conversation' }],
  ['logged out', { status: 'logged-out' }],
  ['ready', { status: 'ready', conversationTitle: 'Birthday cake ideas' }],
  ['ready without a title', { status: 'ready', conversationTitle: null }],
  ['exporting', { status: 'exporting', conversationTitle: 'Birthday cake ideas' }],
  ['success', { status: 'success', conversationTitle: 'T', result: SUCCESS }],
  ['success with warnings and degradation', { status: 'success', conversationTitle: 'T', result: DEGRADED }],
  ['failure', { status: 'failure', conversationTitle: 'T', failure: FAILURE }],
  [
    'failure without detail',
    {
      status: 'failure',
      conversationTitle: null,
      failure: { ok: false, kind: 'no-conversation', message: 'No conversation.' },
    },
  ],
];

describe('popup: axe audit (WCAG 2.2 A/AA)', () => {
  let view: PopupView;

  beforeEach(() => {
    resetDocument();
    view = createPopupView(document);
  });

  it.each(POPUP_STATES)('passes in the %s state', async (_name, state) => {
    view.render(state);
    expectClean(await audit());
  });

  it('passes with the disclosure widgets expanded', async () => {
    view.render({ status: 'success', conversationTitle: 'T', result: DEGRADED });
    view.render({ status: 'failure', conversationTitle: 'T', failure: FAILURE });
    for (const details of document.querySelectorAll('details')) {
      details.setAttribute('open', '');
    }
    expectClean(await audit());
  });
});

describe('options page: axe audit (WCAG 2.2 A/AA)', () => {
  let view: OptionsView;

  beforeEach(() => {
    resetDocument();
    view = createOptionsView(document, { version: '1.2.3' });
  });

  it('passes freshly rendered', async () => {
    expectClean(await audit());
  });

  it('passes with settings restored and a preview shown', async () => {
    view.writeSettings({
      format: 'pdf',
      options: view.readSettings().options,
      template: '{date} {title}.{ext}',
    });
    view.renderPreview('Birthday cake ideas - 2026-07-06.pdf');
    expectClean(await audit());
  });

  it('passes while a template validation error is showing', async () => {
    view.renderTemplateError('That placeholder is unknown.');
    expectClean(await audit());
  });

  it('passes while the saved indicator is showing', async () => {
    view.showStatus('Saved');
    expectClean(await audit());
  });

  it('passes without a version line', async () => {
    resetDocument();
    createOptionsView(document, {});
    expectClean(await audit());
  });
});
