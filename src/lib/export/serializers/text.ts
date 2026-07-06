/**
 * Plain-text serializer (issue #9): renders a {@link PreparedConversation}
 * as clean, human-readable text for maximum portability — it should look
 * good in any editor and paste well into an email.
 *
 * Layout:
 * - conversation title underlined with `=`, metadata line beneath;
 * - each message preceded by a light horizontal rule and its speaker label
 *   (plus timestamp when present);
 * - branch markers as heavy-rule labelled dividers;
 * - non-text blocks as `[Label]` sections with their content indented.
 *
 * Line-wrapping policy: none. Text blocks keep their Markdown source
 * verbatim (it reads fine as plain text) and long lines — prose or code —
 * are never hard-wrapped; that is the reader's/editor's job.
 *
 * The serializer renders the prepared items in order, verbatim, and never
 * re-interprets export options (ADR 0006). Unknown blocks always render as
 * clearly-marked placeholders with their raw JSON — nothing is dropped.
 *
 * Output is deterministic: no trailing whitespace on any line and exactly
 * one trailing newline.
 */

import type {
  BranchStartItem,
  MessageItem,
  MetadataItem,
  PreparedArtifactBlock,
  PreparedAttachmentBlock,
  PreparedBlock,
  PreparedConversation,
  PreparedFileBlock,
  PreparedImageBlock,
  PreparedThinkingBlock,
  PreparedToolResultBlock,
  PreparedToolUseBlock,
  PreparedUnknownBlock,
} from '../prepare';

/** Light rule introducing each message turn. */
const MESSAGE_RULE = '─'.repeat(24);

/** Heavy rule delimiting branch markers, visually distinct from messages. */
const BRANCH_RULE = '═'.repeat(24);

/** Indentation prefix for content nested under a `[Label]` line. */
const INDENT = '    ';

/**
 * Serialize a prepared conversation to plain text.
 *
 * Deterministic; returns text with no trailing whitespace on any line and a
 * single trailing newline (or the empty string when there is nothing at all
 * to render).
 */
export function serializeText(prepared: PreparedConversation): string {
  const chunks: string[] = [];

  for (const item of prepared.items) {
    switch (item.kind) {
      case 'metadata':
        chunks.push(renderMetadata(item));
        break;
      case 'branchStart':
        chunks.push(renderBranchStart(item));
        break;
      case 'message':
        chunks.push(renderMessage(item));
        break;
    }
  }

  const body = chunks.join('\n\n');
  if (body === '') {
    return '';
  }
  // Normalise: strip trailing whitespace per line, end with one newline.
  return (
    body
      .split('\n')
      .map((line) => line.replace(/\s+$/u, ''))
      .join('\n')
      .replace(/\n+$/u, '') + '\n'
  );
}

/** Title underlined with `=`, then a created/updated line when known. */
function renderMetadata(item: MetadataItem): string {
  const lines = [item.title, '='.repeat(Math.max([...item.title].length, 1))];
  const dates: string[] = [];
  if (item.createdAt !== undefined) {
    dates.push(`Created: ${item.createdAt.display}`);
  }
  if (item.updatedAt !== undefined) {
    dates.push(`Updated: ${item.updatedAt.display}`);
  }
  if (dates.length > 0) {
    lines.push(dates.join(' · '));
  }
  return lines.join('\n');
}

/** Heavy-rule divider naming the branch, e.g. `Branch 2 of 3 (current)`. */
function renderBranchStart(item: BranchStartItem): string {
  const label = `Branch ${item.branchIndex + 1} of ${item.branchCount}${
    item.isDefaultBranch ? ' (current)' : ''
  }`;
  return [BRANCH_RULE, label, BRANCH_RULE].join('\n');
}

/** Rule + speaker header, then the message's blocks separated by blank lines. */
function renderMessage(item: MessageItem): string {
  const header =
    item.timestamp === undefined
      ? item.senderLabel
      : `${item.senderLabel} · ${item.timestamp.display}`;
  const blocks = item.blocks.map((block) => renderBlock(block).replace(/\s+$/u, ''));
  return [MESSAGE_RULE, header, '', blocks.join('\n\n')].join('\n');
}

/** Render one prepared block. Every kind renders — nothing is dropped. */
function renderBlock(block: PreparedBlock): string {
  switch (block.kind) {
    case 'text':
      // Markdown source verbatim: no re-wrapping, no hard line width.
      return block.text;
    case 'thinking':
      return renderThinking(block);
    case 'toolUse':
      return renderToolUse(block);
    case 'toolResult':
      return renderToolResult(block);
    case 'artifact':
      return renderArtifact(block);
    case 'image':
      return renderImage(block);
    case 'attachment':
      return renderAttachment(block);
    case 'file':
      return renderFile(block);
    case 'unknown':
      return renderUnknown(block);
  }
}

/** `[Thinking]` with summaries as indented bullets, then the thinking text. */
function renderThinking(block: PreparedThinkingBlock): string {
  const parts: string[] = [];
  if (block.summaries.length > 0) {
    parts.push(block.summaries.map((summary) => `- ${summary}`).join('\n'));
  }
  if (block.thinking !== '') {
    parts.push(block.thinking);
  }
  return labelled('[Thinking]', parts.join('\n\n'));
}

/** `[Tool: name]` with the invocation input pretty-printed as JSON. */
function renderToolUse(block: PreparedToolUseBlock): string {
  return labelled(`[Tool: ${block.name}]`, prettyJson(block.input));
}

/** `[Tool result: name (error)]` with the flattened output text. */
function renderToolResult(block: PreparedToolResultBlock): string {
  const name = block.name === undefined ? '' : `: ${block.name}`;
  const error = block.isError ? ' (error)' : '';
  return labelled(`[Tool result${name}${error}]`, block.content);
}

/** `[Artifact: title (language)]` with the full snapshot content. */
function renderArtifact(block: PreparedArtifactBlock): string {
  const title = block.title ?? block.id;
  const language = block.language === undefined ? '' : ` (${block.language})`;
  return labelled(`[Artifact: ${title}${language}]`, block.content);
}

/** One-line image placeholder with the best identifier available. */
function renderImage(block: PreparedImageBlock): string {
  if (block.fileName !== undefined) {
    return `[Image: ${block.fileName}]`;
  }
  if (block.mediaType !== undefined) {
    return `[Image (${block.mediaType})]`;
  }
  return '[Image]';
}

/** `[Attachment: name (type)]` with the extracted text indented beneath. */
function renderAttachment(block: PreparedAttachmentBlock): string {
  const fileType = block.fileType === undefined ? '' : ` (${block.fileType})`;
  return labelled(`[Attachment: ${block.fileName}${fileType}]`, block.extractedContent ?? '');
}

/** One-line uploaded-file reference. */
function renderFile(block: PreparedFileBlock): string {
  const fileKind = block.fileKind === undefined ? '' : ` (${block.fileKind})`;
  return `[File: ${block.fileName}${fileKind}]`;
}

/** Clearly-marked placeholder plus the raw JSON — never silently lost. */
function renderUnknown(block: PreparedUnknownBlock): string {
  return labelled(`[Unrecognised content: ${block.label}]`, prettyJson(block.raw));
}

/** A `[Label]` line with `content` indented beneath (label only when empty). */
function labelled(label: string, content: string): string {
  if (content === '') {
    return label;
  }
  return `${label}\n${indent(content)}`;
}

/** Indent every non-empty line by {@link INDENT}, leaving blank lines blank. */
function indent(text: string): string {
  return text
    .split('\n')
    .map((line) => (line === '' ? '' : `${INDENT}${line}`))
    .join('\n');
}

/** Pretty-print any value as two-space JSON; `String(...)` as a last resort. */
function prettyJson(value: unknown): string {
  try {
    return JSON.stringify(value, null, 2) ?? String(value);
  } catch {
    return String(value);
  }
}
