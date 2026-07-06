/**
 * The Hardcopy document model (AST).
 *
 * One parser (src/lib/parser) converts raw claude.ai API JSON into this model;
 * every serializer (Markdown, plain text, RTF, PDF, DOCX) renders from it. See
 * docs/decisions/0006-core-architecture.md. Keep this model small, format-neutral,
 * and free of browser APIs.
 */

/**
 * Where a conversation was captured from. Only `'chat'` is produced today;
 * `'code'` (Claude Code web sessions) and `'cowork'` are reserved for future
 * sources behind the same AST (ADR 0007).
 */
export type ConversationSource = 'chat' | 'code' | 'cowork';

/** Who authored a message. Unrecognised senders are preserved verbatim. */
export type Sender = 'human' | 'assistant' | (string & {});

/** A parsed conversation: metadata plus the reconstructed message tree. */
export interface Conversation {
  /** claude.ai conversation UUID. */
  id: string;
  /** Conversation title (claude.ai calls this `name`). Empty string when absent. */
  title: string;
  /** Auto-generated summary, when present. Empty string when absent. */
  summary: string;
  /** ISO-8601 creation timestamp, when present. */
  createdAt: string | undefined;
  /** ISO-8601 last-update timestamp, when present. */
  updatedAt: string | undefined;
  source: ConversationSource;
  /**
   * Messages on the default export path: the current/latest branch through the
   * tree, root first. Identical to `branches[defaultBranchIndex]`.
   */
  messages: Message[];
  /**
   * Every root-to-leaf path through the message tree, in tree order. A linear
   * conversation has exactly one branch. Messages shared by several branches
   * appear (by reference) in each of them.
   */
  branches: Message[][];
  /** Index into {@link branches} of the default/latest path. */
  defaultBranchIndex: number;
  /** True when the tree has more than one leaf (edited or regenerated messages). */
  hasBranches: boolean;
}

/** A single message (one turn) in a conversation. */
export interface Message {
  /** Message UUID. */
  id: string;
  /** UUID of the parent message, or `null` for a root message. */
  parentId: string | null;
  sender: Sender;
  /** ISO-8601 timestamp, when present. */
  createdAt: string | undefined;
  /** ISO-8601 timestamp, when present. */
  updatedAt: string | undefined;
  /** Ordered content blocks. Never `undefined`; may be empty. */
  blocks: ContentBlock[];
  /** Pasted/uploaded attachments with extracted text (API `attachments`). */
  attachments: AttachmentNode[];
  /** Uploaded files (API `files` / `files_v2`), e.g. images and documents. */
  files: FileNode[];
}

/**
 * A content block inside a message. Discriminated on `type`. Unrecognised
 * upstream block types are preserved as {@link UnknownBlock} — never dropped.
 */
export type ContentBlock =
  TextBlock | ThinkingBlock | ToolUseBlock | ToolResultBlock | ImageBlock | UnknownBlock;

/** Plain (Markdown-ish) text authored by the human or the assistant. */
export interface TextBlock {
  type: 'text';
  text: string;
}

/** Extended-thinking content, optionally with UI summaries ("Pondered…"). */
export interface ThinkingBlock {
  type: 'thinking';
  thinking: string;
  /** Zero or more short summaries of the thinking, in order. */
  summaries: string[];
}

/**
 * A tool invocation by the assistant. Artifacts are tool_use blocks with
 * `name === 'artifacts'`; for those, {@link artifactCommand} carries the parsed
 * create/rewrite/update command (see src/lib/model/artifacts.ts for replay).
 */
export interface ToolUseBlock {
  type: 'toolUse';
  /** Tool name, e.g. `'artifacts'` or `'web_search'`. */
  name: string;
  /** Raw tool input as sent by the assistant. */
  input: unknown;
  /** Present iff `name === 'artifacts'` and the input could be interpreted. */
  artifactCommand?: ArtifactCommand;
}

/** The result returned to the assistant for a preceding tool invocation. */
export interface ToolResultBlock {
  type: 'toolResult';
  /** Tool name, when the API includes it. */
  name?: string;
  /** Result content flattened to text. */
  content: string;
  /** True when the tool run failed (API `is_error`). */
  isError: boolean;
}

/** An inline image. */
export interface ImageBlock {
  type: 'image';
  /** MIME type such as `'image/png'`, when known. */
  mediaType: string | undefined;
  /** Base64 payload when the API inlines one (`source.data`). */
  data: string | undefined;
  /** Original file name, when known. */
  fileName: string | undefined;
  /** The raw block, kept for serializers that can do more with it. */
  raw: unknown;
}

/**
 * An upstream block type this parser does not recognise. The raw JSON is
 * retained so no content is ever dropped silently; the parser also reports a
 * {@code ParseIssue} for it (our API-shape-change detection).
 */
export interface UnknownBlock {
  type: 'unknown';
  /** The upstream `type` value, or `null` when it was missing entirely. */
  blockType: string | null;
  /** The complete raw block JSON. */
  raw: unknown;
}

/** A pasted/uploaded attachment whose text claude.ai extracted. */
export interface AttachmentNode {
  fileName: string;
  /** MIME type or upstream `file_type`, when present. */
  fileType: string | undefined;
  /** Size in bytes, when present. */
  fileSize: number | undefined;
  /** Text content extracted by claude.ai, when present. */
  extractedContent: string | undefined;
}

/** An uploaded file reference (API `files` / `files_v2`). */
export interface FileNode {
  fileName: string;
  /** Upstream `file_kind`, e.g. `'image'` or `'document'`, when present. */
  fileKind: string | undefined;
  /** File UUID, when present. */
  id: string | undefined;
  /** Preview URL path, when present (relative to claude.ai). */
  previewUrl: string | undefined;
  /** Thumbnail URL path, when present (relative to claude.ai). */
  thumbnailUrl: string | undefined;
}

/**
 * One artifact command decoded from a `tool_use` block named `'artifacts'`.
 * `create` starts an artifact, `rewrite` replaces its content wholesale, and
 * `update` applies an `oldStr` → `newStr` replacement.
 */
export interface ArtifactCommand {
  command: 'create' | 'rewrite' | 'update' | (string & {});
  /** Artifact identifier the commands are keyed on. */
  id: string;
  title: string | undefined;
  /** Artifact MIME-ish type, e.g. `'application/vnd.ant.code'`. */
  artifactType: string | undefined;
  /** Language hint for code artifacts, e.g. `'typescript'`. */
  language: string | undefined;
  /** Full content for `create`/`rewrite`. */
  content: string | undefined;
  /** Replacement source for `update`. */
  oldStr: string | undefined;
  /** Replacement target for `update`. */
  newStr: string | undefined;
}
