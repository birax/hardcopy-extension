// @vitest-environment happy-dom
/**
 * DOM tests for the options view (issue #15): structure and ARIA
 * correctness, popup↔options control parity (same names and values), the
 * filename-template field with validation and preview surfaces, the About
 * section, and the settings round trip — all under happy-dom, no browser.
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';

import { DEFAULT_FILENAME_TEMPLATE } from '../src/lib/export/filename';
import { DEFAULT_EXPORT_OPTIONS, EXPORT_FORMAT_LIST } from '../src/lib/export/options';
import { t } from '../src/lib/i18n';
import { createOptionsView, PRIVACY_URL, REPO_URL } from '../src/lib/options/view';
import type { OptionsSettings, OptionsView } from '../src/lib/options/view';

const DEFAULT_SETTINGS: OptionsSettings = {
  format: 'markdown',
  options: { ...DEFAULT_EXPORT_OPTIONS },
  template: DEFAULT_FILENAME_TEMPLATE,
};

function makeView(version?: string): OptionsView {
  document.body.innerHTML = '';
  return createOptionsView(document, { version });
}

function templateResetButton(view: OptionsView): HTMLButtonElement | null {
  return view.form.querySelector<HTMLButtonElement>('.field .button-secondary');
}

function resetAllButton(view: OptionsView): HTMLButtonElement | null {
  return view.main.querySelector<HTMLButtonElement>(
    'section[aria-labelledby="reset-heading"] .button-secondary',
  );
}

describe('options view', () => {
  let view: OptionsView;

  beforeEach(() => {
    view = makeView('1.2.3');
  });

  describe('structure and ARIA', () => {
    it('builds a main landmark with header, intro, form, sections, and footer', () => {
      expect(document.querySelector('main.options-page')).toBe(view.main);
      expect(document.title).toBe(t('optionsTitle'));
      expect(view.main.querySelector('header h1')?.textContent).toBe(t('optionsTitle'));
      expect(view.main.querySelector('.intro')?.textContent).toBe(t('optionsIntro'));
      expect(view.main.querySelector('form')).toBe(view.form);
      expect(view.main.querySelector('footer .disclaimer')?.textContent).toBe(t('disclaimer'));
    });

    it('groups the form controls in four fieldsets, each with a legend', () => {
      const fieldsets = Array.from(view.form.querySelectorAll('fieldset'));
      expect(fieldsets).toHaveLength(4);
      expect(fieldsets.map((fs) => fs.querySelector('legend')?.textContent)).toEqual([
        t('optionsFormatLegend'),
        t('includeLegend'),
        t('branchesLegend'),
        t('filenameLegend'),
      ]);
    });

    it('renders the same format, include, and branch controls as the popup', () => {
      const radios = Array.from(
        view.form.querySelectorAll<HTMLInputElement>('input[name="format"]'),
      );
      expect(radios.map((radio) => radio.value)).toEqual(
        EXPORT_FORMAT_LIST.map((info) => info.format),
      );
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
      // Every control row is a labelled hit target.
      for (const input of [...radios, ...checkboxes, ...branches]) {
        expect(input.closest('label')?.textContent).not.toBe('');
      }
    });

    it('labels the template input and describes it with help, error, and preview', () => {
      const label = view.form.querySelector<HTMLLabelElement>('label[for="filename-template"]');
      expect(label?.textContent).toBe(t('filenameTemplateLabel'));
      expect(view.templateInput.id).toBe('filename-template');
      expect(view.templateInput.getAttribute('aria-describedby')).toBe(
        'template-help template-error template-preview',
      );
      expect(view.form.querySelector('#template-help')?.textContent).toBe(
        t('filenameTemplateHelp'),
      );
      expect(view.form.querySelector('#template-preview')).not.toBeNull();
      // The error region is a permanent polite live region that starts empty:
      // it must already be in the DOM (and never display:none) for screen
      // readers to announce validation messages when they appear (WCAG 4.1.3).
      const error = view.form.querySelector<HTMLElement>('#template-error');
      expect(error?.getAttribute('role')).toBe('status');
      expect(error?.getAttribute('aria-live')).toBe('polite');
      expect(error?.hasAttribute('hidden')).toBe(false);
      expect(error?.textContent).toBe('');
    });

    it('marks the saved indicator as a polite status region', () => {
      expect(view.saveIndicator.getAttribute('role')).toBe('status');
      expect(view.saveIndicator.getAttribute('aria-live')).toBe('polite');
      expect(view.saveIndicator.textContent).toBe('');
    });

    it('shows the reset section with its labelled heading and button', () => {
      const section = view.main.querySelector('section[aria-labelledby="reset-heading"]');
      expect(section?.querySelector('h2')?.textContent).toBe(t('resetHeading'));
      expect(resetAllButton(view)?.textContent).toBe(t('resetAllButton'));
      expect(resetAllButton(view)?.type).toBe('button');
    });
  });

  describe('about section', () => {
    it('shows the version and safe external links to the repo and privacy policy', () => {
      const section = view.main.querySelector('section[aria-labelledby="about-heading"]');
      expect(section?.querySelector('h2')?.textContent).toBe(t('aboutHeading'));
      expect(section?.querySelector('.caption')?.textContent).toBe(t('aboutVersion', '1.2.3'));
      const links = Array.from(section?.querySelectorAll('a') ?? []);
      expect(links.map((link) => link.getAttribute('href'))).toEqual([REPO_URL, PRIVACY_URL]);
      expect(links.map((link) => link.textContent)).toEqual([
        t('aboutRepoLink'),
        t('aboutPrivacyLink'),
      ]);
      for (const link of links) {
        expect(link.getAttribute('target')).toBe('_blank');
        expect(link.getAttribute('rel')).toBe('noopener noreferrer');
      }
      expect(PRIVACY_URL).toContain('PRIVACY.md');
    });

    it('omits the version line when the version is unknown or blank', () => {
      for (const version of [undefined, '']) {
        const versionless = makeView(version);
        const section = versionless.main.querySelector('section[aria-labelledby="about-heading"]');
        expect(section?.querySelector('.caption')).toBeNull();
        expect(section?.querySelectorAll('a')).toHaveLength(2);
      }
    });
  });

  describe('settings round trip', () => {
    it('round-trips settings through the form, template included', () => {
      const settings: OptionsSettings = {
        format: 'pdf',
        options: {
          ...DEFAULT_EXPORT_OPTIONS,
          includeThinking: true,
          includeArtifacts: false,
          branches: 'all',
        },
        template: '{date} {title}.{ext}',
      };
      view.writeSettings(settings);
      expect(view.readSettings()).toEqual(settings);
    });

    it('reads defaults from a form written with defaults', () => {
      view.writeSettings(DEFAULT_SETTINGS);
      expect(view.readSettings()).toEqual(DEFAULT_SETTINGS);
    });

    it('falls back to safe values on a completely untouched form', () => {
      // Nothing checked yet, template empty: readSettings must still return
      // usable values (default format and branches, unchecked toggles read
      // as off), never undefined.
      expect(view.readSettings()).toEqual({
        format: 'markdown',
        options: {
          ...DEFAULT_EXPORT_OPTIONS,
          includeArtifacts: false,
          includeConversationMetadata: false,
        },
        template: '',
      });
    });
  });

  describe('template error and preview rendering', () => {
    it('shows and clears the validation error, toggling aria-invalid', () => {
      view.renderTemplateError('That placeholder is unknown.');
      const error = view.form.querySelector<HTMLElement>('#template-error');
      expect(error?.textContent).toBe('That placeholder is unknown.');
      expect(view.templateInput.getAttribute('aria-invalid')).toBe('true');

      view.renderTemplateError(null);
      // Cleared by emptying the live region, never by hiding it: toggling
      // `hidden` on a live region makes announcements unreliable.
      expect(error?.hasAttribute('hidden')).toBe(false);
      expect(error?.textContent).toBe('');
      expect(view.templateInput.hasAttribute('aria-invalid')).toBe(false);
    });

    it('renders the preview filename next to its label', () => {
      view.renderPreview('Birthday cake ideas - 2026-07-06.md');
      const preview = view.form.querySelector('#template-preview');
      expect(preview?.textContent).toContain(t('filenamePreviewLabel'));
      expect(preview?.querySelector('.filename')?.textContent).toBe(
        'Birthday cake ideas - 2026-07-06.md',
      );
    });
  });

  describe('status indicator', () => {
    it('shows and clears status text', () => {
      view.showStatus(t('savedIndicator'));
      expect(view.saveIndicator.textContent).toBe(t('savedIndicator'));
      view.clearStatus();
      expect(view.saveIndicator.textContent).toBe('');
    });
  });

  describe('events', () => {
    it('reports control changes, but not ones from the template input', () => {
      const handler = vi.fn();
      view.onControlsChanged(handler);

      const pdfRadio = view.form.querySelector<HTMLInputElement>(
        'input[name="format"][value="pdf"]',
      );
      pdfRadio?.dispatchEvent(new Event('change', { bubbles: true }));
      expect(handler).toHaveBeenCalledTimes(1);

      view.templateInput.dispatchEvent(new Event('change', { bubbles: true }));
      expect(handler).toHaveBeenCalledTimes(1);
    });

    it('reports template keystrokes, template reset, and reset-all clicks', () => {
      const onInput = vi.fn();
      const onReset = vi.fn();
      const onResetAll = vi.fn();
      view.onTemplateInput(onInput);
      view.onTemplateReset(onReset);
      view.onResetAll(onResetAll);

      view.templateInput.dispatchEvent(new Event('input', { bubbles: true }));
      expect(onInput).toHaveBeenCalledTimes(1);

      templateResetButton(view)?.click();
      expect(onReset).toHaveBeenCalledTimes(1);
      expect(onResetAll).not.toHaveBeenCalled();

      resetAllButton(view)?.click();
      expect(onResetAll).toHaveBeenCalledTimes(1);
    });

    it('prevents form submission from navigating (Enter in the template input)', () => {
      const event = new Event('submit', { cancelable: true });
      view.form.dispatchEvent(event);
      expect(event.defaultPrevented).toBe(true);
    });
  });
});
