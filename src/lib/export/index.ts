export {
  DEFAULT_CONVERSATION_TITLE,
  DEFAULT_EXPORT_OPTIONS,
  EXPORT_FORMAT_LIST,
  EXPORT_FORMATS,
  isExportFormat,
  resolveExportOptions,
} from './options';
export type { BranchMode, ExportFormat, ExportFormatInfo, ExportOptions } from './options';

export { prepareConversation } from './prepare';
export type {
  BranchStartItem,
  MessageItem,
  MetadataItem,
  PreparedArtifactBlock,
  PreparedAttachmentBlock,
  PreparedBlock,
  PreparedConversation,
  PreparedFileBlock,
  PreparedImageBlock,
  PreparedTextBlock,
  PreparedThinkingBlock,
  PreparedToolResultBlock,
  PreparedToolUseBlock,
  PreparedUnknownBlock,
  RenderItem,
  ResolvedTimestamp,
} from './prepare';

export {
  buildExportFilename,
  DEFAULT_FILENAME_TEMPLATE,
  FILENAME_TEMPLATE_PLACEHOLDERS,
  isValidFilenameTemplate,
  validateFilenameTemplate,
} from './filename';
export type { ExportFilenameInput, FilenameTemplateIssue } from './filename';

export {
  EXPORT_OPTIONS_STORAGE_KEY,
  FILENAME_TEMPLATE_STORAGE_KEY,
  loadExportOptions,
  loadFilenameTemplate,
  saveExportOptions,
  saveFilenameTemplate,
} from './storage';

export { serializeConversation } from './serialize';
export type { ExportPayload } from './serialize';

// Serializer public APIs. These static re-exports exist for direct consumers
// (tests, tooling); runtime export paths MUST go through
// `serializeConversation`, whose per-format dynamic imports keep the heavy
// formats (PDF fonts, docx) out of eagerly-loaded bundles. The modules are
// side-effect-free, so bundlers tree-shake these bindings out of any chunk
// that does not use them.
export { serializeMarkdown } from './serializers/markdown';
export { serializeText } from './serializers/text';
export { escapeRtfText, serializeRtf, validateRtfStructure } from './serializers/rtf';
export { buildDocxChildren, buildDocxDocument, serializeDocx } from './serializers/docx';
export { serializePdf } from './serializers/pdf';
export type { PdfSerializeOptions } from './serializers/pdf';
