/**
 * Pure helpers behind the options page's filename-template field: the live
 * preview (a real {@link buildExportFilename} run over a sample title) and
 * the mapping from a validation issue to its user-facing message.
 */

import { buildExportFilename } from '../export/filename';
import type { FilenameTemplateIssue } from '../export/filename';
import type { ExportFormat } from '../export/options';
import { t } from '../i18n';

/**
 * Render the live preview for a template: the exact filename an export of a
 * sample conversation would produce today, with the user's default format
 * supplying the extension.
 */
export function buildFilenamePreview(
  template: string,
  format: ExportFormat,
  now: () => Date = () => new Date(),
): string {
  return buildExportFilename({
    title: t('filenamePreviewSampleTitle'),
    date: now(),
    format,
    template,
  });
}

/** The user-facing message for a template validation issue. */
export function templateIssueMessage(issue: FilenameTemplateIssue): string {
  switch (issue.kind) {
    case 'empty':
      return t('filenameTemplateErrorEmpty');
    case 'unknown-placeholder':
      return t('filenameTemplateErrorUnknownPlaceholder', issue.placeholder);
    case 'unbalanced-braces':
      return t('filenameTemplateErrorUnbalanced');
  }
}
