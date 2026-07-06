/**
 * The popup's DOM: build it once, then re-render it from a {@link PopupState}.
 *
 * Kept out of the entrypoint so the whole surface is testable under
 * happy-dom. Everything follows docs/design/design-system.md: native form
 * controls only, all strings through {@link t}, no color-only signaling
 * (every semantic banner carries an icon and words), and a single
 * `aria-live="polite"` status region announcing export transitions.
 */

import { DEFAULT_EXPORT_OPTIONS, EXPORT_FORMAT_LIST, isExportFormat } from '../export/options';
import type { ExportFormat, ExportOptions } from '../export/options';
import type { ExportFailure, ExportSuccess } from '../flow/export';
import { t } from '../i18n';
import type { MessageKey } from '../i18n';
import { formatByteCount } from './format-bytes';
import { DEFAULT_EXPORT_FORMAT } from './preferences';
import type { PopupPreferences } from './preferences';
import { canExport, conversationTitleOf } from './state';
import type { PopupState } from './state';

/** Label key for each export format (labels ship in the i18n catalogue). */
const FORMAT_LABEL_KEYS: Readonly<Record<ExportFormat, MessageKey>> = Object.freeze({
  markdown: 'formatMarkdown',
  text: 'formatText',
  rtf: 'formatRtf',
  docx: 'formatDocx',
  pdf: 'formatPdf',
});

/** The boolean "Include" toggles, in display order, with their label keys. */
const INCLUDE_OPTIONS: ReadonlyArray<{
  option: Exclude<keyof ExportOptions, 'branches'>;
  labelKey: MessageKey;
}> = Object.freeze([
  { option: 'includeThinking', labelKey: 'optionThinking' },
  { option: 'includeToolUse', labelKey: 'optionToolUse' },
  { option: 'includeToolResults', labelKey: 'optionToolResults' },
  { option: 'includeArtifacts', labelKey: 'optionArtifacts' },
  { option: 'includeAttachments', labelKey: 'optionAttachments' },
  { option: 'includeTimestamps', labelKey: 'optionTimestamps' },
  { option: 'includeConversationMetadata', labelKey: 'optionMetadata' },
]);

type BannerKind = 'info' | 'warn' | 'success' | 'error';

/** 16×16 icon paths; drawn with `currentColor` next to their banner text. */
const ICON_PATHS: Readonly<Record<BannerKind, string>> = Object.freeze({
  info: 'M8 1.5a6.5 6.5 0 1 0 0 13 6.5 6.5 0 0 0 0-13Zm.75 10h-1.5V7h1.5Zm0-6h-1.5V4h1.5Z',
  warn: 'M8 1.5 15.5 14H.5Zm.75 8.5V6h-1.5v4Zm0 2.5v-1.5h-1.5V12.5Z',
  success: 'M6.3 11.4 3.3 8.4l1-1 2 2 5.4-5.4 1 1Z',
  error: 'M12.6 4.4 11.6 3.4 8 7 4.4 3.4 3.4 4.4 7 8l-3.6 3.6 1 1L8 9l3.6 3.6 1-1L9 8Z',
});

/** The built popup surface plus everything the controller needs to drive it. */
export interface PopupView {
  /** The `<main>` landmark containing the whole popup. */
  readonly main: HTMLElement;
  /** The options form. */
  readonly form: HTMLFormElement;
  /** The primary action. */
  readonly exportButton: HTMLButtonElement;
  /** The visually hidden `aria-live` announcer. */
  readonly statusRegion: HTMLElement;
  /** Re-render the whole surface for `state`. */
  render(state: PopupState): void;
  /** Read the current form values (unknown values fall back to defaults). */
  readPreferences(): PopupPreferences;
  /** Set the form values (used to restore persisted preferences). */
  writePreferences(preferences: PopupPreferences): void;
  /** Called when the user submits the form (click or keyboard). */
  onExportRequested(handler: () => void): void;
  /** Called whenever any form control changes. */
  onPreferencesChanged(handler: () => void): void;
}

/** Build the popup DOM inside `doc.body` and return its handle. */
export function createPopupView(doc: Document): PopupView {
  const heading = el(doc, 'h1', { class: 'title' }, [t('popupTitle')]);
  const header = el(doc, 'header', { class: 'header' }, [
    el(doc, 'img', {
      class: 'mark',
      src: '/icon/32.png',
      alt: '',
      width: '20',
      height: '20',
    }),
    heading,
  ]);

  const conversation = el(doc, 'p', { class: 'conversation', hidden: '' });
  const feedback = el(doc, 'div', { class: 'feedback', hidden: '' });

  const formatFieldset = buildFormatFieldset(doc);
  const includeFieldset = buildIncludeFieldset(doc);
  const branchesFieldset = buildBranchesFieldset(doc);

  const exportButton = el(
    doc,
    'button',
    { class: 'button-primary', type: 'submit', disabled: '' },
    [t('exportButton')],
  );

  const progressLabel = el(doc, 'p', { class: 'progress-label' }, [t('statusExporting')]);
  const progress = el(doc, 'div', { class: 'progress', hidden: '' }, [
    progressLabel,
    el(doc, 'div', { class: 'progress-track' }, [el(doc, 'div', { class: 'progress-fill' })]),
  ]);

  const form = el(doc, 'form', { class: 'options' }, [
    formatFieldset,
    includeFieldset,
    branchesFieldset,
    exportButton,
    progress,
  ]);

  const statusRegion = el(doc, 'p', {
    class: 'visually-hidden',
    role: 'status',
    'aria-live': 'polite',
  });

  const footer = el(doc, 'footer', { class: 'footer' }, [
    el(doc, 'p', { class: 'disclaimer' }, [t('disclaimer')]),
  ]);

  const main = el(doc, 'main', { class: 'popup' }, [
    header,
    conversation,
    feedback,
    form,
    statusRegion,
    footer,
  ]);
  doc.body.append(main);

  const fieldsets = [formatFieldset, includeFieldset, branchesFieldset];

  function render(state: PopupState): void {
    renderConversation(state);
    renderFeedback(state);
    renderControls(state);
    renderStatus(state);
  }

  function renderConversation(state: PopupState): void {
    const title = 'conversationTitle' in state ? conversationTitleOf(state) : undefined;
    if (title === undefined) {
      conversation.hidden = true;
      conversation.textContent = '';
      return;
    }
    conversation.hidden = false;
    conversation.textContent = title ?? t('untitledConversation');
  }

  function renderFeedback(state: PopupState): void {
    feedback.replaceChildren();
    feedback.hidden = false;
    switch (state.status) {
      case 'probing':
        feedback.append(banner(doc, 'info', undefined, t('statusProbing')));
        break;
      case 'unsupported-page':
        feedback.append(
          state.onClaudeAi
            ? banner(doc, 'info', t('staleTabHeading'), t('staleTabBody'))
            : banner(doc, 'info', t('unsupportedHeading'), t('unsupportedBody')),
        );
        break;
      case 'no-conversation':
        feedback.append(banner(doc, 'info', t('noConversationHeading'), t('noConversationBody')));
        break;
      case 'logged-out':
        feedback.append(banner(doc, 'warn', t('loggedOutHeading'), t('loggedOutBody')));
        break;
      case 'success':
        feedback.append(successBanner(doc, state.result));
        break;
      case 'failure':
        feedback.append(failureBanner(doc, state.failure));
        break;
      case 'ready':
      case 'exporting':
        feedback.hidden = true;
        break;
    }
  }

  function renderControls(state: PopupState): void {
    const exporting = state.status === 'exporting';
    const interactive = canExport(state);
    for (const fieldset of fieldsets) {
      fieldset.disabled = !interactive;
    }
    exportButton.disabled = !interactive;
    if (exporting) {
      form.setAttribute('aria-busy', 'true');
    } else {
      form.removeAttribute('aria-busy');
    }
    progress.hidden = !exporting;
  }

  function renderStatus(state: PopupState): void {
    switch (state.status) {
      case 'exporting':
        statusRegion.textContent = t('statusExporting');
        break;
      case 'success':
        statusRegion.textContent = t('savedAnnouncement', state.result.filename);
        break;
      case 'failure':
        statusRegion.textContent = t('failedAnnouncement', state.failure.message);
        break;
      default:
        statusRegion.textContent = '';
    }
  }

  function inputsNamed(name: string): HTMLInputElement[] {
    return Array.from(form.querySelectorAll<HTMLInputElement>(`input[name="${name}"]`));
  }

  function checkedValue(name: string): string | undefined {
    return inputsNamed(name).find((input) => input.checked)?.value;
  }

  function readPreferences(): PopupPreferences {
    const options: ExportOptions = { ...DEFAULT_EXPORT_OPTIONS };
    for (const { option } of INCLUDE_OPTIONS) {
      options[option] = inputsNamed(option)[0]?.checked ?? DEFAULT_EXPORT_OPTIONS[option];
    }
    options.branches = checkedValue('branches') === 'all' ? 'all' : 'current';
    const format = checkedValue('format');
    return {
      format: isExportFormat(format) ? format : DEFAULT_EXPORT_FORMAT,
      options,
    };
  }

  function writePreferences(preferences: PopupPreferences): void {
    for (const input of inputsNamed('format')) {
      input.checked = input.value === preferences.format;
    }
    for (const { option } of INCLUDE_OPTIONS) {
      const input = inputsNamed(option)[0];
      if (input !== undefined) {
        input.checked = preferences.options[option];
      }
    }
    for (const input of inputsNamed('branches')) {
      input.checked = input.value === preferences.options.branches;
    }
  }

  return {
    main,
    form,
    exportButton,
    statusRegion,
    render,
    readPreferences,
    writePreferences,
    onExportRequested(handler: () => void): void {
      form.addEventListener('submit', (event) => {
        event.preventDefault();
        handler();
      });
    },
    onPreferencesChanged(handler: () => void): void {
      form.addEventListener('change', () => {
        handler();
      });
    },
  };
}

/** The format radio group. */
function buildFormatFieldset(doc: Document): HTMLFieldSetElement {
  return el(doc, 'fieldset', { class: 'group', disabled: '' }, [
    el(doc, 'legend', { class: 'legend' }, [t('formatLegend')]),
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

/** The "Include" checkbox group. */
function buildIncludeFieldset(doc: Document): HTMLFieldSetElement {
  return el(doc, 'fieldset', { class: 'group', disabled: '' }, [
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
  return el(doc, 'fieldset', { class: 'group', disabled: '' }, [
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

/** A banner: icon + optional heading + body, colored by kind. */
function banner(
  doc: Document,
  kind: BannerKind,
  heading: string | undefined,
  body?: string,
): HTMLElement {
  const node = el(doc, 'div', { class: `banner banner--${kind}` });
  if (heading !== undefined) {
    node.append(
      el(doc, 'p', { class: 'banner-heading' }, [icon(doc, kind), el(doc, 'span', {}, [heading])]),
    );
  }
  if (body !== undefined) {
    node.append(el(doc, 'p', { class: 'banner-body' }, [body]));
  }
  return node;
}

/** The success banner: filename, size, degraded note, warnings disclosure. */
function successBanner(doc: Document, result: ExportSuccess): HTMLElement {
  const node = banner(doc, 'success', t('successHeading'));
  node.append(
    el(doc, 'p', { class: 'filename' }, [result.filename]),
    el(doc, 'p', { class: 'caption' }, [formatByteCount(result.byteCount)]),
  );
  if (result.degraded === true) {
    node.append(
      el(doc, 'p', { class: 'banner-note banner-note--warn' }, [
        icon(doc, 'warn'),
        el(doc, 'span', {}, [t('successDegraded')]),
      ]),
    );
  }
  if (result.warnings.length > 0) {
    node.append(
      el(doc, 'details', { class: 'disclosure' }, [
        el(doc, 'summary', {}, [t('warningsSummary', String(result.warnings.length))]),
        el(
          doc,
          'ul',
          { class: 'warning-list' },
          result.warnings.map((warning) => el(doc, 'li', {}, [warning])),
        ),
      ]),
    );
  }
  return node;
}

/** The failure banner: outcome message plus the detail behind a disclosure. */
function failureBanner(doc: Document, failure: ExportFailure): HTMLElement {
  const node = banner(doc, 'error', t('failureHeading'), failure.message);
  if (failure.detail !== undefined) {
    node.append(
      el(doc, 'details', { class: 'disclosure' }, [
        el(doc, 'summary', {}, [t('technicalDetail')]),
        el(doc, 'pre', { class: 'detail' }, [failure.detail]),
      ]),
    );
  }
  return node;
}

/** A 16×16 decorative icon drawn with `currentColor`. */
function icon(doc: Document, kind: BannerKind): SVGSVGElement {
  const SVG_NS = 'http://www.w3.org/2000/svg';
  const svg = doc.createElementNS(SVG_NS, 'svg');
  svg.setAttribute('class', 'icon');
  svg.setAttribute('viewBox', '0 0 16 16');
  svg.setAttribute('width', '16');
  svg.setAttribute('height', '16');
  svg.setAttribute('aria-hidden', 'true');
  svg.setAttribute('focusable', 'false');
  const path = doc.createElementNS(SVG_NS, 'path');
  path.setAttribute('d', ICON_PATHS[kind]);
  path.setAttribute('fill', 'currentColor');
  svg.append(path);
  return svg;
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
