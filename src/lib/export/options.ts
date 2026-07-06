/**
 * The shared export-options model: one options object and one format registry
 * that every serializer (Markdown, plain text, RTF, DOCX, PDF) consumes with
 * identical semantics (issue #13, ADR 0006).
 *
 * Options are applied exactly once, by {@link import('./prepare').prepareConversation}:
 * serializers render the prepared view verbatim and must never re-interpret
 * options themselves — that is what keeps semantics from drifting between formats.
 */

/**
 * Which paths through an edited/regenerated conversation tree to export.
 *
 * - `'current'` — only the current/latest branch (what claude.ai shows).
 * - `'all'` — every root-to-leaf path, in tree order. Each branch is rendered
 *   in full (messages shared by several branches repeat in each), preceded by
 *   a branch marker item, so "all branches" reads identically in every format:
 *   a heading-like divider per branch, then that branch's complete transcript.
 */
export type BranchMode = 'current' | 'all';

/**
 * Everything the user can toggle about an export. One instance drives all
 * five serializers; the popup and options page (M3) edit and persist it via
 * {@link import('./storage').saveExportOptions}.
 */
export interface ExportOptions {
  /** Include extended-thinking blocks (with their summaries). */
  includeThinking: boolean;
  /**
   * Include tool invocations (tool name + raw input). Artifact invocations
   * are governed by {@link includeArtifacts} instead; see that flag.
   */
  includeToolUse: boolean;
  /** Include tool results (flattened output text, with error flag). */
  includeToolResults: boolean;
  /**
   * Include artifacts as reconstructed content snapshots: each artifact
   * command renders as the artifact's full content after applying it. When
   * this is on, artifact `tool_use` blocks always render as artifact
   * snapshots (never duplicated as raw tool use); when it is off but
   * {@link includeToolUse} is on, they render as ordinary tool invocations.
   */
  includeArtifacts: boolean;
  /**
   * Include attachments (pasted/uploaded text with extracted content) and
   * uploaded file references, listed at the start of the message they belong to.
   */
  includeAttachments: boolean;
  /** Include a per-message timestamp (ISO plus a human-readable UTC form). */
  includeTimestamps: boolean;
  /** Include the conversation header: title plus created/updated dates. */
  includeConversationMetadata: boolean;
  /** Which branches of the conversation tree to export. See {@link BranchMode}. */
  branches: BranchMode;
}

/**
 * The defaults every surface starts from: a clean transcript (no thinking,
 * tools, or timestamps) with artifacts and a title/date header, current
 * branch only.
 */
export const DEFAULT_EXPORT_OPTIONS: Readonly<ExportOptions> = Object.freeze({
  includeThinking: false,
  includeToolUse: false,
  includeToolResults: false,
  includeArtifacts: true,
  includeAttachments: false,
  includeTimestamps: false,
  includeConversationMetadata: true,
  branches: 'current',
});

/**
 * Merge partial overrides onto {@link DEFAULT_EXPORT_OPTIONS}. Keys that are
 * absent or explicitly `undefined` keep their default.
 */
export function resolveExportOptions(overrides: Partial<ExportOptions> = {}): ExportOptions {
  const resolved: ExportOptions = { ...DEFAULT_EXPORT_OPTIONS };
  for (const [key, value] of Object.entries(overrides)) {
    if (value !== undefined && key in resolved) {
      (resolved as unknown as Record<string, unknown>)[key] = value;
    }
  }
  return resolved;
}

/**
 * Title used wherever a conversation has none: the metadata header and the
 * export filename.
 */
export const DEFAULT_CONVERSATION_TITLE = 'Claude conversation';

/** The five output formats Hardcopy exports (ADR 0006). */
export type ExportFormat = 'markdown' | 'text' | 'rtf' | 'docx' | 'pdf';

/** Static metadata describing one export format. */
export interface ExportFormatInfo {
  /** The format identifier; same as its {@link EXPORT_FORMATS} key. */
  format: ExportFormat;
  /** Human-readable name for UI, e.g. `'Markdown'`. */
  label: string;
  /** File extension without the leading dot, e.g. `'md'`. */
  extension: string;
  /** MIME type for the download blob. */
  mimeType: string;
}

/** Registry of format metadata, keyed by {@link ExportFormat}. */
export const EXPORT_FORMATS: Readonly<Record<ExportFormat, ExportFormatInfo>> = Object.freeze({
  markdown: {
    format: 'markdown',
    label: 'Markdown',
    extension: 'md',
    mimeType: 'text/markdown',
  },
  text: {
    format: 'text',
    label: 'Plain text',
    extension: 'txt',
    mimeType: 'text/plain',
  },
  rtf: {
    format: 'rtf',
    label: 'Rich Text (RTF)',
    extension: 'rtf',
    mimeType: 'application/rtf',
  },
  docx: {
    format: 'docx',
    label: 'Word (DOCX)',
    extension: 'docx',
    mimeType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  },
  pdf: {
    format: 'pdf',
    label: 'PDF',
    extension: 'pdf',
    mimeType: 'application/pdf',
  },
});

/** Every format's metadata in stable display order (for UI menus). */
export const EXPORT_FORMAT_LIST: readonly ExportFormatInfo[] = Object.freeze(
  Object.values(EXPORT_FORMATS),
);

/** True when `value` names a supported export format. */
export function isExportFormat(value: unknown): value is ExportFormat {
  return typeof value === 'string' && value in EXPORT_FORMATS;
}
