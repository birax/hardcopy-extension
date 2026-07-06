// @vitest-environment happy-dom
/**
 * DOM tests for the popup view (issue #14): structure and ARIA correctness,
 * a render per state, aria-live updates across transitions, and the
 * preferences round trip — all under happy-dom, no browser.
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';

import { DEFAULT_EXPORT_OPTIONS, EXPORT_FORMAT_LIST } from '../src/lib/export/options';
import type { ExportFailure, ExportSuccess } from '../src/lib/flow/export';
import { t } from '../src/lib/i18n';
import { formatByteCount } from '../src/lib/popup/format-bytes';
import type { PopupPreferences } from '../src/lib/popup/preferences';
import { createPopupView } from '../src/lib/popup/view';
import type { PopupView } from '../src/lib/popup/view';

const SUCCESS: ExportSuccess = {
  ok: true,
  filename: 'Birthday cake ideas - 2026-07-06.md',
  byteCount: 12345,
  warnings: [],
};

const FAILURE: ExportFailure = {
  ok: false,
  kind: 'network',
  message: 'claude.ai could not be reached — check your connection and try again.',
  detail: 'HTTP 503',
};

function makeView(): PopupView {
  document.body.innerHTML = '';
  return createPopupView(document);
}

describe('popup view', () => {
  let view: PopupView;

  beforeEach(() => {
    view = makeView();
  });

  describe('structure and ARIA', () => {
    it('builds a main landmark with header, form, live region, and footer', () => {
      expect(document.querySelector('main.popup')).toBe(view.main);
      expect(view.main.querySelector('header h1')?.textContent).toBe(t('popupTitle'));
      expect(view.main.querySelector('form')).toBe(view.form);
      expect(view.main.querySelector('footer .disclaimer')?.textContent).toBe(t('disclaimer'));
    });

    it('marks the live region as a polite status region', () => {
      expect(view.statusRegion.getAttribute('role')).toBe('status');
      expect(view.statusRegion.getAttribute('aria-live')).toBe('polite');
      // Visually hidden, but never display:none — it must stay announceable.
      expect(view.statusRegion.classList.contains('visually-hidden')).toBe(true);
      expect(view.statusRegion.hasAttribute('hidden')).toBe(false);
    });

    it('groups controls in three fieldsets, each with a legend', () => {
      const fieldsets = Array.from(view.form.querySelectorAll('fieldset'));
      expect(fieldsets).toHaveLength(3);
      expect(fieldsets.map((fs) => fs.querySelector('legend')?.textContent)).toEqual([
        t('formatLegend'),
        t('includeLegend'),
        t('branchesLegend'),
      ]);
    });

    it('renders one labelled radio per export format', () => {
      const radios = Array.from(
        view.form.querySelectorAll<HTMLInputElement>('input[name="format"]'),
      );
      expect(radios.map((radio) => radio.value)).toEqual(
        EXPORT_FORMAT_LIST.map((info) => info.format),
      );
      for (const radio of radios) {
        expect(radio.type).toBe('radio');
        // The wrapping <label> is the accessible name and the hit target.
        expect(radio.closest('label')?.textContent).not.toBe('');
      }
    });

    it('renders the seven include checkboxes and the two branch radios', () => {
      const checkboxes = Array.from(
        view.form.querySelectorAll<HTMLInputElement>('input[type="checkbox"]'),
      );
      expect(checkboxes.map((box) => box.name)).toEqual([
        'includeThinking',
        'includeToolUse',
        'includeToolResults',
        'includeArtifacts',
        'includeAttachments',
        'includeTimestamps',
        'includeConversationMetadata',
      ]);
      const branches = Array.from(
        view.form.querySelectorAll<HTMLInputElement>('input[name="branches"]'),
      );
      expect(branches.map((radio) => radio.value)).toEqual(['current', 'all']);
      expect(branches.every((radio) => radio.type === 'radio')).toBe(true);
    });
  });

  describe('state rendering', () => {
    it('probing: shows the checking notice with controls disabled', () => {
      view.render({ status: 'probing' });
      expect(view.main.querySelector('.banner')?.textContent).toContain(t('statusProbing'));
      expect(view.exportButton.disabled).toBe(true);
      for (const fieldset of view.form.querySelectorAll('fieldset')) {
        expect(fieldset.disabled).toBe(true);
      }
    });

    it('unsupported-page (not claude.ai): explains where Hardcopy works', () => {
      view.render({ status: 'unsupported-page', onClaudeAi: false });
      const banner = view.main.querySelector('.banner');
      expect(banner?.textContent).toContain(t('unsupportedHeading'));
      expect(banner?.textContent).toContain(t('unsupportedBody'));
      expect(view.exportButton.disabled).toBe(true);
    });

    it('unsupported-page (stale claude.ai tab): suggests a reload', () => {
      view.render({ status: 'unsupported-page', onClaudeAi: true });
      const banner = view.main.querySelector('.banner');
      expect(banner?.textContent).toContain(t('staleTabHeading'));
      expect(banner?.textContent).toContain(t('staleTabBody'));
    });

    it('no-conversation: explains what to open', () => {
      view.render({ status: 'no-conversation' });
      expect(view.main.querySelector('.banner')?.textContent).toContain(t('noConversationHeading'));
    });

    it('logged-out: shows the warn banner with an icon, not color alone', () => {
      view.render({ status: 'logged-out' });
      const banner = view.main.querySelector('.banner--warn');
      expect(banner?.textContent).toContain(t('loggedOutHeading'));
      expect(banner?.textContent).toContain(t('loggedOutBody'));
      expect(banner?.querySelector('svg[aria-hidden="true"]')).not.toBeNull();
    });

    it('ready: shows the conversation title and enables the controls', () => {
      view.render({ status: 'ready', conversationTitle: 'Birthday cake ideas' });
      const conversation = view.main.querySelector<HTMLElement>('.conversation');
      expect(conversation?.hidden).toBe(false);
      expect(conversation?.textContent).toBe('Birthday cake ideas');
      expect(view.main.querySelector<HTMLElement>('.feedback')?.hidden).toBe(true);
      expect(view.exportButton.disabled).toBe(false);
      for (const fieldset of view.form.querySelectorAll('fieldset')) {
        expect(fieldset.disabled).toBe(false);
      }
    });

    it('ready without a title: falls back to "Untitled conversation"', () => {
      view.render({ status: 'ready', conversationTitle: null });
      expect(view.main.querySelector('.conversation')?.textContent).toBe(t('untitledConversation'));
    });

    it('exporting: disables controls, sets aria-busy, and shows progress', () => {
      view.render({ status: 'exporting', conversationTitle: 'Birthday cake ideas' });
      expect(view.form.getAttribute('aria-busy')).toBe('true');
      expect(view.exportButton.disabled).toBe(true);
      for (const fieldset of view.form.querySelectorAll('fieldset')) {
        expect(fieldset.disabled).toBe(true);
      }
      const progress = view.form.querySelector<HTMLElement>('.progress');
      expect(progress?.hidden).toBe(false);
      expect(progress?.textContent).toContain(t('statusExporting'));
    });

    it('success: shows filename, formatted byte count, and a check icon', () => {
      view.render({ status: 'success', conversationTitle: 'T', result: SUCCESS });
      const banner = view.main.querySelector('.banner--success');
      expect(banner?.textContent).toContain(t('successHeading'));
      expect(banner?.querySelector('.filename')?.textContent).toBe(SUCCESS.filename);
      expect(banner?.querySelector('.caption')?.textContent).toBe(
        formatByteCount(SUCCESS.byteCount),
      );
      expect(banner?.querySelector('svg')).not.toBeNull();
      expect(view.form.hasAttribute('aria-busy')).toBe(false);
      expect(view.exportButton.disabled).toBe(false);
      // A clean export shows no warnings disclosure and no degraded note.
      expect(banner?.querySelector('details')).toBeNull();
      expect(banner?.querySelector('.banner-note--warn')).toBeNull();
    });

    it('success with warnings and degradation: surfaces both, calmly', () => {
      const degraded: ExportSuccess = {
        ...SUCCESS,
        degraded: true,
        warnings: ['Exported from the rendered page', 'attachments unavailable'],
      };
      view.render({ status: 'success', conversationTitle: 'T', result: degraded });
      const banner = view.main.querySelector('.banner--success');
      expect(banner?.querySelector('.banner-note--warn')?.textContent).toContain(
        t('successDegraded'),
      );
      const details = banner?.querySelector('details');
      expect(details?.querySelector('summary')?.textContent).toBe(t('warningsSummary', '2'));
      const items = Array.from(details?.querySelectorAll('li') ?? []);
      expect(items.map((item) => item.textContent)).toEqual(degraded.warnings);
    });

    it('failure: shows the outcome message with the detail behind a disclosure', () => {
      view.render({ status: 'failure', conversationTitle: 'T', failure: FAILURE });
      const banner = view.main.querySelector('.banner--error');
      expect(banner?.textContent).toContain(t('failureHeading'));
      expect(banner?.textContent).toContain(FAILURE.message);
      const details = banner?.querySelector('details');
      expect(details?.querySelector('summary')?.textContent).toBe(t('technicalDetail'));
      expect(details?.querySelector('pre')?.textContent).toBe('HTTP 503');
      expect(view.exportButton.disabled).toBe(false);
    });

    it('failure without detail: omits the disclosure entirely', () => {
      const bare: ExportFailure = {
        ok: false,
        kind: 'no-conversation',
        message: 'No conversation.',
      };
      view.render({ status: 'failure', conversationTitle: null, failure: bare });
      expect(view.main.querySelector('.banner--error details')).toBeNull();
    });
  });

  describe('aria-live announcements', () => {
    it('announces exporting, then the saved filename, then clears', () => {
      view.render({ status: 'ready', conversationTitle: 'T' });
      expect(view.statusRegion.textContent).toBe('');

      view.render({ status: 'exporting', conversationTitle: 'T' });
      expect(view.statusRegion.textContent).toBe(t('statusExporting'));

      view.render({ status: 'success', conversationTitle: 'T', result: SUCCESS });
      expect(view.statusRegion.textContent).toBe(t('savedAnnouncement', SUCCESS.filename));

      view.render({ status: 'ready', conversationTitle: 'T' });
      expect(view.statusRegion.textContent).toBe('');
    });

    it('announces failures with the outcome message', () => {
      view.render({ status: 'exporting', conversationTitle: 'T' });
      view.render({ status: 'failure', conversationTitle: 'T', failure: FAILURE });
      expect(view.statusRegion.textContent).toBe(t('failedAnnouncement', FAILURE.message));
    });
  });

  describe('preferences', () => {
    it('round-trips preferences through the form', () => {
      const preferences: PopupPreferences = {
        format: 'pdf',
        options: {
          ...DEFAULT_EXPORT_OPTIONS,
          includeThinking: true,
          includeTimestamps: true,
          includeArtifacts: false,
          branches: 'all',
        },
      };
      view.writePreferences(preferences);
      expect(view.readPreferences()).toEqual(preferences);
    });

    it('reads defaults from an untouched form', () => {
      view.writePreferences({ format: 'markdown', options: { ...DEFAULT_EXPORT_OPTIONS } });
      expect(view.readPreferences()).toEqual({
        format: 'markdown',
        options: DEFAULT_EXPORT_OPTIONS,
      });
    });
  });

  describe('events', () => {
    it('reports form submission with the default action prevented', () => {
      const handler = vi.fn();
      view.onExportRequested(handler);
      const event = new Event('submit', { cancelable: true });
      view.form.dispatchEvent(event);
      expect(handler).toHaveBeenCalledTimes(1);
      expect(event.defaultPrevented).toBe(true);
    });

    it('reports control changes', () => {
      const handler = vi.fn();
      view.onPreferencesChanged(handler);
      view.form.dispatchEvent(new Event('change', { bubbles: true }));
      expect(handler).toHaveBeenCalledTimes(1);
    });
  });
});

describe('formatByteCount', () => {
  it('formats bytes, kilobytes, and megabytes for a pinned locale', () => {
    expect(formatByteCount(0, 'en-US')).toBe('0 bytes');
    expect(formatByteCount(1, 'en-US')).toBe('1 byte');
    expect(formatByteCount(999, 'en-US')).toBe('999 bytes');
    expect(formatByteCount(2048, 'en-US')).toBe('2 kB');
    expect(formatByteCount(2480, 'en-US')).toBe('2.5 kB');
    expect(formatByteCount(123456, 'en-US')).toBe('123 kB');
    expect(formatByteCount(12345678, 'en-US')).toBe('12 MB');
    expect(formatByteCount(9876543210, 'en-US')).toBe('9.9 GB');
  });

  it('respects other locales', () => {
    expect(formatByteCount(2480, 'de-DE')).toBe('2,5 kB');
  });
});
