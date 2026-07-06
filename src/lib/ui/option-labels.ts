/**
 * The i18n label keys for the export-format and include-option controls,
 * shared by the popup and the options page so the two surfaces render the
 * same options with the same names and can never drift apart.
 */

import type { ExportFormat, ExportOptions } from '../export/options';
import type { MessageKey } from '../i18n';

/** Label key for each export format (labels ship in the i18n catalogue). */
export const FORMAT_LABEL_KEYS: Readonly<Record<ExportFormat, MessageKey>> = Object.freeze({
  markdown: 'formatMarkdown',
  text: 'formatText',
  rtf: 'formatRtf',
  docx: 'formatDocx',
  pdf: 'formatPdf',
});

/** The boolean "Include" toggles, in display order, with their label keys. */
export const INCLUDE_OPTIONS: ReadonlyArray<{
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
