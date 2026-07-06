/**
 * Option-application pre-pass: apply {@link ExportOptions} to a parsed
 * {@link Conversation} once, producing the ordered list of render items that
 * every serializer renders verbatim. Branch selection, block filtering,
 * artifact replay, sender labelling, and timestamp resolution all happen
 * here — so option semantics can never drift between output formats.
 *
 * Pure functions only — no browser APIs — mirroring the parser.
 */

import type { Artifact, Conversation, Message, Sender, ToolUseBlock } from '../model';
import { reconstructArtifacts } from '../model';
import { DEFAULT_CONVERSATION_TITLE, resolveExportOptions } from './options';
import type { ExportOptions } from './options';

/** A message or conversation timestamp resolved for rendering. */
export interface ResolvedTimestamp {
  /** The original ISO-8601 timestamp from the API. */
  iso: string;
  /**
   * Deterministic human-readable UTC form, e.g. `'2026-06-25 19:40 UTC'`.
   * Falls back to {@link iso} verbatim when the timestamp cannot be parsed.
   */
  display: string;
}

/**
 * The conversation header, emitted first when
 * {@link ExportOptions.includeConversationMetadata} is on.
 */
export interface MetadataItem {
  kind: 'metadata';
  /** Resolved title; {@link DEFAULT_CONVERSATION_TITLE} when the conversation has none. */
  title: string;
  /** When the conversation was created, when known. */
  createdAt: ResolvedTimestamp | undefined;
  /** When the conversation was last updated, when known. */
  updatedAt: ResolvedTimestamp | undefined;
}

/**
 * Marks the start of one branch. Emitted only when `branches: 'all'` is
 * rendering a conversation that actually has multiple branches; a linear
 * conversation never gets branch markers. Serializers render this as a
 * heading-like divider (e.g. `Branch 2 of 3`).
 */
export interface BranchStartItem {
  kind: 'branchStart';
  /** Zero-based index of this branch, in tree order. */
  branchIndex: number;
  /** Total number of branches being rendered. */
  branchCount: number;
  /** True for the current/latest path — the one `branches: 'current'` exports. */
  isDefaultBranch: boolean;
}

/**
 * One message turn. Messages whose blocks are all filtered out by the
 * options (e.g. a thinking-only turn with `includeThinking: false`) are
 * omitted entirely, so {@link blocks} is never empty.
 */
export interface MessageItem {
  kind: 'message';
  /** Raw sender from the AST (`'human'`, `'assistant'`, or unrecognised). */
  sender: Sender;
  /**
   * Ready-to-render speaker label — `'Human'`, `'Claude'`, or the raw sender
   * verbatim — identical across formats.
   */
  senderLabel: string;
  /**
   * Present iff {@link ExportOptions.includeTimestamps} is on and the message
   * has a creation timestamp.
   */
  timestamp: ResolvedTimestamp | undefined;
  /** Ordered, already-filtered blocks to render. Never empty. */
  blocks: PreparedBlock[];
}

/** A top-level render item. Serializers render these in order, verbatim. */
export type RenderItem = MetadataItem | BranchStartItem | MessageItem;

/** Plain (Markdown-ish) text. */
export interface PreparedTextBlock {
  kind: 'text';
  text: string;
}

/** Extended thinking. Present only when `includeThinking` is on. */
export interface PreparedThinkingBlock {
  kind: 'thinking';
  thinking: string;
  /** Zero or more short UI summaries of the thinking, in order. */
  summaries: string[];
}

/** A tool invocation. Present only when `includeToolUse` is on. */
export interface PreparedToolUseBlock {
  kind: 'toolUse';
  /** Tool name, e.g. `'web_search'`. */
  name: string;
  /** Raw tool input as sent by the assistant. */
  input: unknown;
}

/** A tool result. Present only when `includeToolResults` is on. */
export interface PreparedToolResultBlock {
  kind: 'toolResult';
  /** Tool name, when the API included it. */
  name: string | undefined;
  /** Result content flattened to text. */
  content: string;
  /** True when the tool run failed. */
  isError: boolean;
}

/**
 * One artifact snapshot: the artifact's full content after applying one
 * create/rewrite/update command. Present only when `includeArtifacts` is on;
 * every command in the branch yields one snapshot, so intermediate versions
 * are never lost.
 */
export interface PreparedArtifactBlock {
  kind: 'artifact';
  /** Artifact identifier the command stream is keyed on. */
  id: string;
  /** Latest title seen across the artifact's command stream, when any. */
  title: string | undefined;
  /** Latest artifact type seen, e.g. `'application/vnd.ant.code'`. */
  artifactType: string | undefined;
  /** Latest language hint seen, for code artifacts. */
  language: string | undefined;
  /** The command that produced this snapshot: `'create'`, `'rewrite'`, `'update'`, or unrecognised. */
  command: string;
  /** Full artifact content after applying the command. */
  content: string;
  /** True when this is the artifact's last snapshot within the rendered branch. */
  isFinal: boolean;
}

/** An inline image. Always included — images are message content. */
export interface PreparedImageBlock {
  kind: 'image';
  /** MIME type such as `'image/png'`, when known. */
  mediaType: string | undefined;
  /** Original file name, when known. */
  fileName: string | undefined;
  /** Base64 payload when the API inlined one. */
  data: string | undefined;
}

/**
 * A pasted/uploaded attachment with claude.ai-extracted text. Present only
 * when `includeAttachments` is on; listed before the message's content blocks.
 */
export interface PreparedAttachmentBlock {
  kind: 'attachment';
  fileName: string;
  /** MIME type or upstream file type, when present. */
  fileType: string | undefined;
  /** Text content extracted by claude.ai, when present. */
  extractedContent: string | undefined;
}

/**
 * An uploaded file reference (no extractable content). Present only when
 * `includeAttachments` is on; listed before the message's content blocks.
 */
export interface PreparedFileBlock {
  kind: 'file';
  fileName: string;
  /** Upstream file kind, e.g. `'image'` or `'document'`, when present. */
  fileKind: string | undefined;
}

/**
 * A block the parser did not recognise. ALWAYS included, regardless of
 * options — unknown content is never silently lost. Serializers render
 * {@link label} as a clearly-marked placeholder.
 */
export interface PreparedUnknownBlock {
  kind: 'unknown';
  /** The upstream block type, or `null` when it was missing entirely. */
  blockType: string | null;
  /** The complete raw block JSON, for serializers that can do more with it. */
  raw: unknown;
  /** Ready-to-render placeholder text, e.g. `'Unsupported content (weather_card)'`. */
  label: string;
}

/** A block inside a {@link MessageItem}, already filtered per the options. */
export type PreparedBlock =
  | PreparedTextBlock
  | PreparedThinkingBlock
  | PreparedToolUseBlock
  | PreparedToolResultBlock
  | PreparedArtifactBlock
  | PreparedImageBlock
  | PreparedAttachmentBlock
  | PreparedFileBlock
  | PreparedUnknownBlock;

/** The prepared view of a conversation: what every serializer renders. */
export interface PreparedConversation {
  /** The fully-resolved options this view was prepared with. */
  options: ExportOptions;
  /** Resolved title; {@link DEFAULT_CONVERSATION_TITLE} when the conversation has none. */
  title: string;
  /** Ordered render items. Serializers render these in order, verbatim. */
  items: RenderItem[];
}

/**
 * Apply export options to a parsed conversation, producing the single
 * prepared view all serializers share.
 *
 * - `branches: 'current'` renders `conversation.messages`; `'all'` renders
 *   every branch in tree order, each preceded by a {@link BranchStartItem}
 *   (unless the conversation is linear, which renders without markers).
 * - Blocks are filtered per the options; messages left with no blocks are omitted.
 * - Artifact commands are replayed per branch so each artifact block carries
 *   full content (see {@link PreparedArtifactBlock}).
 * - Unknown blocks are always kept, clearly marked (never silently lost).
 *
 * Omitted option keys take their defaults ({@link resolveExportOptions}).
 */
export function prepareConversation(
  conversation: Conversation,
  options?: Partial<ExportOptions>,
): PreparedConversation {
  const resolved = resolveExportOptions(options);
  const title = conversation.title.trim() === '' ? DEFAULT_CONVERSATION_TITLE : conversation.title;

  const items: RenderItem[] = [];

  if (resolved.includeConversationMetadata) {
    items.push({
      kind: 'metadata',
      title,
      createdAt: resolveTimestamp(conversation.createdAt),
      updatedAt: resolveTimestamp(conversation.updatedAt),
    });
  }

  if (resolved.branches === 'all' && conversation.hasBranches) {
    conversation.branches.forEach((branch, index) => {
      items.push({
        kind: 'branchStart',
        branchIndex: index,
        branchCount: conversation.branches.length,
        isDefaultBranch: index === conversation.defaultBranchIndex,
      });
      items.push(...prepareBranch(branch, resolved));
    });
  } else {
    items.push(...prepareBranch(conversation.messages, resolved));
  }

  return { options: resolved, title, items };
}

/** Per-branch replay state for one artifact: its versions and how many were consumed. */
interface ArtifactCursor {
  artifact: Artifact;
  /** Index into `artifact.versions` of the next snapshot to emit. */
  next: number;
}

/** Prepare one branch's messages, dropping any that end up with no blocks. */
function prepareBranch(messages: Message[], options: ExportOptions): MessageItem[] {
  const artifacts = indexArtifacts(messages, options);
  const items: MessageItem[] = [];
  for (const message of messages) {
    const blocks = prepareBlocks(message, options, artifacts);
    if (blocks.length === 0) {
      continue;
    }
    items.push({
      kind: 'message',
      sender: message.sender,
      senderLabel: resolveSenderLabel(message.sender),
      timestamp: options.includeTimestamps ? resolveTimestamp(message.createdAt) : undefined,
      blocks,
    });
  }
  return items;
}

/**
 * Replay the branch's artifact command stream (via {@link reconstructArtifacts})
 * and index the resulting versions by artifact id. The replay walks blocks in
 * the same order as {@link prepareBlocks}, so the n-th command block for an
 * artifact corresponds exactly to its n-th version.
 */
function indexArtifacts(messages: Message[], options: ExportOptions): Map<string, ArtifactCursor> {
  const index = new Map<string, ArtifactCursor>();
  if (!options.includeArtifacts) {
    return index;
  }
  for (const artifact of reconstructArtifacts(messages)) {
    index.set(artifact.id, { artifact, next: 0 });
  }
  return index;
}

/** Filter and convert one message's attachments, files, and blocks. */
function prepareBlocks(
  message: Message,
  options: ExportOptions,
  artifacts: Map<string, ArtifactCursor>,
): PreparedBlock[] {
  const blocks: PreparedBlock[] = [];

  if (options.includeAttachments) {
    for (const attachment of message.attachments) {
      blocks.push({
        kind: 'attachment',
        fileName: attachment.fileName,
        fileType: attachment.fileType,
        extractedContent: attachment.extractedContent,
      });
    }
    for (const file of message.files) {
      blocks.push({ kind: 'file', fileName: file.fileName, fileKind: file.fileKind });
    }
  }

  for (const block of message.blocks) {
    switch (block.type) {
      case 'text':
        blocks.push({ kind: 'text', text: block.text });
        break;

      case 'thinking':
        if (options.includeThinking) {
          blocks.push({ kind: 'thinking', thinking: block.thinking, summaries: block.summaries });
        }
        break;

      case 'toolUse': {
        const prepared = prepareToolUse(block, options, artifacts);
        if (prepared !== undefined) {
          blocks.push(prepared);
        }
        break;
      }

      case 'toolResult':
        if (options.includeToolResults) {
          blocks.push({
            kind: 'toolResult',
            name: block.name,
            content: block.content,
            isError: block.isError,
          });
        }
        break;

      case 'image':
        blocks.push({
          kind: 'image',
          mediaType: block.mediaType,
          fileName: block.fileName,
          data: block.data,
        });
        break;

      case 'unknown':
        blocks.push({
          kind: 'unknown',
          blockType: block.blockType,
          raw: block.raw,
          label:
            block.blockType === null
              ? 'Unsupported content'
              : `Unsupported content (${block.blockType})`,
        });
        break;
    }
  }

  return blocks;
}

/**
 * Convert one tool_use block. Artifact commands become content snapshots when
 * `includeArtifacts` is on (taking precedence over `includeToolUse`, so the
 * block is never rendered twice); otherwise tool_use blocks render as generic
 * invocations when `includeToolUse` is on, and are dropped when it is off.
 */
function prepareToolUse(
  block: ToolUseBlock,
  options: ExportOptions,
  artifacts: Map<string, ArtifactCursor>,
): PreparedBlock | undefined {
  const command = block.artifactCommand;
  if (command !== undefined && options.includeArtifacts) {
    const cursor = artifacts.get(command.id);
    const snapshot = cursor?.artifact.versions[cursor.next];
    if (cursor !== undefined) {
      cursor.next += 1;
    }
    return {
      kind: 'artifact',
      id: command.id,
      title: cursor?.artifact.title,
      artifactType: cursor?.artifact.artifactType,
      language: cursor?.artifact.language,
      command: command.command,
      content: snapshot?.content ?? command.content ?? '',
      isFinal: cursor !== undefined && cursor.next === cursor.artifact.versions.length,
    };
  }
  if (options.includeToolUse) {
    return { kind: 'toolUse', name: block.name, input: block.input };
  }
  return undefined;
}

/** The speaker label all serializers render for a sender. */
function resolveSenderLabel(sender: Sender): string {
  if (sender === 'human') {
    return 'Human';
  }
  if (sender === 'assistant') {
    return 'Claude';
  }
  return sender;
}

/** Resolve an ISO timestamp into render-ready forms; see {@link ResolvedTimestamp}. */
function resolveTimestamp(iso: string | undefined): ResolvedTimestamp | undefined {
  if (iso === undefined) {
    return undefined;
  }
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) {
    return { iso, display: iso };
  }
  const stamp = date.toISOString();
  return { iso, display: `${stamp.slice(0, 10)} ${stamp.slice(11, 16)} UTC` };
}
