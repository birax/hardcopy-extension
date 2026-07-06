/**
 * The options page's DOM: build it once, then let the controller drive it.
 *
 * Kept out of the entrypoint so the whole surface is testable under
 * happy-dom, exactly like the popup (src/lib/popup/view.ts). Everything
 * follows docs/design/design-system.md: native form controls, all strings
 * through {@link t}, save-on-change with a visible "Saved" indicator that is
 * also the `aria-live="polite"` announcement, and the ADR 0004 disclaimer
 * verbatim in the footer.
 */

import { DEFAULT_EXPORT_OPTIONS, EXPORT_FORMAT_LIST, isExportFormat } from '../export/options';
import type { ExportFormat, ExportOptions } from '../export/options';
import { t } from '../i18n';
import { DEFAULT_EXPORT_FORMAT } from '../popup/preferences';
import { FORMAT_LABEL_KEYS, INCLUDE_OPTIONS } from '../ui/option-labels';

/** Where "Source code on GitHub" points. */
export const REPO_URL = 'https://github.com/birax/hardcopy-extension';

/** Where "Privacy policy" points (PRIVACY.md on GitHub). */
export const PRIVACY_URL = 'https://github.com/birax/hardcopy-extension/blob/main/PRIVACY.md';

/** Everything the options page edits. */
export interface OptionsSettings {
  /** The default output format (shared with the popup's last-chosen format). */
  format: ExportFormat;
  /** The shared export options (same `storage.local` key as the popup). */
  options: ExportOptions;
  /** The filename template, verbatim (possibly invalid while being typed). */
  template: string;
}

/** The built options surface plus everything the controller needs. */
export interface OptionsView {
  /** The `<main>` landmark containing the whole page. */
  readonly main: HTMLElement;
  /** The settings form. */
  readonly form: HTMLFormElement;
  /** The filename template input. */
  readonly templateInput: HTMLInputElement;
  /** The visible saved indicator; also the `aria-live` status region. */
  readonly saveIndicator: HTMLElement;
  /** Read the current form values (unknown values fall back to defaults). */
  readSettings(): OptionsSettings;
  /** Set the form values (used to restore persisted settings). */
  writeSettings(settings: OptionsSettings): void;
  /** Show the filename preview. */
  renderPreview(filename: string): void;
  /** Show a template validation error, or clear it with `null`. */
  renderTemplateError(message: string | null): void;
  /** Show the saved/reset indicator text (announced politely). */
  showStatus(message: string): void;
  /** Clear the saved/reset indicator. */
  clearStatus(): void;
  /** Called when any format/include/branches control changes. */
  onControlsChanged(handler: () => void): void;
  /** Called on every keystroke in the template input. */
  onTemplateInput(handler: () => void): void;
  /** Called when the user resets the template to its default. */
  onTemplateReset(handler: () => void): void;
  /** Called when the user asks to reset all settings. */
  onResetAll(handler: () => void): void;
}

/** What the view needs from the environment to render the About section. */
export interface OptionsViewContext {
  /** Extension version for the About section; omitted → no version line. */
  version?: string | undefined;
}

/** Build the options page DOM inside `doc.body` and return its handle. */
export function createOptionsView(doc: Document, context: OptionsViewContext = {}): OptionsView {
  doc.title = t('optionsTitle');

  const header = el(doc, 'header', { class: 'header' }, [
    el(doc, 'img', { class: 'mark', src: '/icon/48.png', alt: '', width: '32', height: '32' }),
    el(doc, 'h1', { class: 'title' }, [t('optionsTitle')]),
  ]);
  const intro = el(doc, 'p', { class: 'intro' }, [t('optionsIntro')]);

  const templateInput = el(doc, 'input', {
    class: 'text-input',
    type: 'text',
    id: 'filename-template',
    name: 'filenameTemplate',
    spellcheck: 'false',
    autocomplete: 'off',
    'aria-describedby': 'template-help template-error template-preview',
  });
  // A permanent polite live region (never `hidden`, never removed): showing
  // a validation message by setting its text is what makes screen readers
  // announce it without stealing focus (WCAG 4.1.3 — status messages).
  const templateError = el(doc, 'p', {
    class: 'field-error',
    id: 'template-error',
    role: 'status',
    'aria-live': 'polite',
  });
  const previewValue = el(doc, 'span', { class: 'filename' });
  const templateReset = el(doc, 'button', { class: 'button-secondary', type: 'button' }, [
    t('filenameResetButton'),
  ]);

  const filenameFieldset = el(doc, 'fieldset', { class: 'group' }, [
    el(doc, 'legend', { class: 'legend' }, [t('filenameLegend')]),
    el(doc, 'div', { class: 'field' }, [
      el(doc, 'label', { class: 'field-label', for: 'filename-template' }, [
        t('filenameTemplateLabel'),
      ]),
      templateInput,
      el(doc, 'p', { class: 'caption', id: 'template-help' }, [t('filenameTemplateHelp')]),
      templateError,
      el(doc, 'p', { class: 'preview', id: 'template-preview' }, [
        el(doc, 'span', { class: 'preview-label' }, [`${t('filenamePreviewLabel')} `]),
        previewValue,
      ]),
      templateReset,
    ]),
  ]);

  const resetAllButton = el(doc, 'button', { class: 'button-secondary', type: 'button' }, [
    t('resetAllButton'),
  ]);

  const form = el(doc, 'form', { class: 'settings' }, [
    buildFormatFieldset(doc),
    buildIncludeFieldset(doc),
    buildBranchesFieldset(doc),
    filenameFieldset,
  ]);

  const resetSection = el(
    doc,
    'section',
    { class: 'section', 'aria-labelledby': 'reset-heading' },
    [el(doc, 'h2', { class: 'legend', id: 'reset-heading' }, [t('resetHeading')]), resetAllButton],
  );

  const aboutChildren: (HTMLElement | string)[] = [
    el(doc, 'h2', { class: 'legend', id: 'about-heading' }, [t('aboutHeading')]),
  ];
  if (context.version !== undefined && context.version !== '') {
    aboutChildren.push(el(doc, 'p', { class: 'caption' }, [t('aboutVersion', context.version)]));
  }
  aboutChildren.push(
    el(doc, 'ul', { class: 'about-links' }, [
      el(doc, 'li', {}, [externalLink(doc, REPO_URL, t('aboutRepoLink'))]),
      el(doc, 'li', {}, [externalLink(doc, PRIVACY_URL, t('aboutPrivacyLink'))]),
    ]),
  );
  const aboutSection = el(
    doc,
    'section',
    { class: 'section', 'aria-labelledby': 'about-heading' },
    aboutChildren,
  );

  const saveIndicator = el(doc, 'p', {
    class: 'save-indicator',
    role: 'status',
    'aria-live': 'polite',
  });

  const footer = el(doc, 'footer', { class: 'footer' }, [
    el(doc, 'p', { class: 'disclaimer' }, [t('disclaimer')]),
  ]);

  const main = el(doc, 'main', { class: 'options-page' }, [
    header,
    intro,
    form,
    resetSection,
    aboutSection,
    saveIndicator,
    footer,
  ]);
  doc.body.append(main);

  // Save-on-change: submitting must never navigate (Enter in the template
  // input fires submit in most browsers).
  form.addEventListener('submit', (event) => {
    event.preventDefault();
  });

  function inputsNamed(name: string): HTMLInputElement[] {
    return Array.from(form.querySelectorAll<HTMLInputElement>(`input[name="${name}"]`));
  }

  function checkedValue(name: string): string | undefined {
    return inputsNamed(name).find((input) => input.checked)?.value;
  }

  function readSettings(): OptionsSettings {
    const options: ExportOptions = { ...DEFAULT_EXPORT_OPTIONS };
    for (const { option } of INCLUDE_OPTIONS) {
      options[option] = inputsNamed(option)[0]?.checked ?? DEFAULT_EXPORT_OPTIONS[option];
    }
    options.branches = checkedValue('branches') === 'all' ? 'all' : 'current';
    const format = checkedValue('format');
    return {
      format: isExportFormat(format) ? format : DEFAULT_EXPORT_FORMAT,
      options,
      template: templateInput.value,
    };
  }

  function writeSettings(settings: OptionsSettings): void {
    for (const input of inputsNamed('format')) {
      input.checked = input.value === settings.format;
    }
    for (const { option } of INCLUDE_OPTIONS) {
      const input = inputsNamed(option)[0];
      if (input !== undefined) {
        input.checked = settings.options[option];
      }
    }
    for (const input of inputsNamed('branches')) {
      input.checked = input.value === settings.options.branches;
    }
    templateInput.value = settings.template;
  }

  return {
    main,
    form,
    templateInput,
    saveIndicator,
    readSettings,
    writeSettings,
    renderPreview(filename: string): void {
      previewValue.textContent = filename;
    },
    renderTemplateError(message: string | null): void {
      if (message === null) {
        templateError.textContent = '';
        templateInput.removeAttribute('aria-invalid');
      } else {
        templateError.textContent = message;
        templateInput.setAttribute('aria-invalid', 'true');
      }
    },
    showStatus(message: string): void {
      saveIndicator.textContent = message;
    },
    clearStatus(): void {
      saveIndicator.textContent = '';
    },
    onControlsChanged(handler: () => void): void {
      form.addEventListener('change', (event) => {
        // The template input has its own input/debounce path.
        if (event.target !== templateInput) {
          handler();
        }
      });
    },
    onTemplateInput(handler: () => void): void {
      templateInput.addEventListener('input', () => {
        handler();
      });
    },
    onTemplateReset(handler: () => void): void {
      templateReset.addEventListener('click', () => {
        handler();
      });
    },
    onResetAll(handler: () => void): void {
      resetAllButton.addEventListener('click', () => {
        handler();
      });
    },
  };
}

/** The default-format radio group. */
function buildFormatFieldset(doc: Document): HTMLFieldSetElement {
  return el(doc, 'fieldset', { class: 'group' }, [
    el(doc, 'legend', { class: 'legend' }, [t('optionsFormatLegend')]),
    el(
      doc,
      'div',
      { class: 'option-grid' },
      EXPORT_FORMAT_LIST.map((info) =>
        optionRow(doc, 'radio', 'format', info.format, t(FORMAT_LABEL_KEYS[info.format])),
      ),
    ),
  ]);
}

/** The "Include" checkbox group (same controls and keys as the popup). */
function buildIncludeFieldset(doc: Document): HTMLFieldSetElement {
  return el(doc, 'fieldset', { class: 'group' }, [
    el(doc, 'legend', { class: 'legend' }, [t('includeLegend')]),
    el(
      doc,
      'div',
      { class: 'option-grid' },
      INCLUDE_OPTIONS.map(({ option, labelKey }) =>
        optionRow(doc, 'checkbox', option, 'on', t(labelKey)),
      ),
    ),
  ]);
}

/** The branches radio group. */
function buildBranchesFieldset(doc: Document): HTMLFieldSetElement {
  return el(doc, 'fieldset', { class: 'group' }, [
    el(doc, 'legend', { class: 'legend' }, [t('branchesLegend')]),
    el(doc, 'div', { class: 'option-grid' }, [
      optionRow(doc, 'radio', 'branches', 'current', t('branchCurrent')),
      optionRow(doc, 'radio', 'branches', 'all', t('branchAll')),
    ]),
  ]);
}

/** One labelled control row; the whole label is the hit target. */
function optionRow(
  doc: Document,
  type: 'radio' | 'checkbox',
  name: string,
  value: string,
  label: string,
): HTMLLabelElement {
  return el(doc, 'label', { class: 'option' }, [
    el(doc, 'input', { type, name, value }),
    el(doc, 'span', { class: 'option-label' }, [label]),
  ]);
}

/** An external link that opens in a new tab without an opener. */
function externalLink(doc: Document, href: string, label: string): HTMLAnchorElement {
  return el(doc, 'a', { href, target: '_blank', rel: 'noopener noreferrer' }, [label]);
}

/** Create an element with attributes and children. */
function el<K extends keyof HTMLElementTagNameMap>(
  doc: Document,
  tag: K,
  attrs: Readonly<Record<string, string>> = {},
  children: ReadonlyArray<Node | string> = [],
): HTMLElementTagNameMap[K] {
  const node = doc.createElement(tag);
  for (const [name, value] of Object.entries(attrs)) {
    node.setAttribute(name, value);
  }
  node.append(...children);
  return node;
}
