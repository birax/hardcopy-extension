/**
 * Markdown serializer (issue #8): renders a {@link PreparedConversation} as
 * clean GitHub-flavored Markdown.
 *
 * The prepared view is rendered verbatim, in order — all option semantics
 * (branch selection, block filtering, artifact replay, labels, timestamps)
 * were already applied by {@link import('../prepare').prepareConversation}.
 * This module only decides how each item/block *looks* in Markdown.
 *
 * Document conventions (the "pick one and document it" of issue #8):
 * - Conversation title → `# {title}`, followed by an italic created/updated line.
 * - Branch marker → `---` divider + `## Branch {n} of {m}` (default branch marked).
 * - Message turn → `## Human` / `## Claude` heading, optional italic timestamp subline.
 * - Text blocks pass through as-is (they already are Markdown).
 * - Thinking → GitHub-renderable `<details><summary>Thinking</summary>` section.
 * - Tool use/results, attachments, and unknown blocks → bold label + fenced block.
 * - Artifacts → `### Artifact: {title}` heading + language-tagged fenced content.
 * - Images → italic label with the file name; data URIs are never embedded.
 *
 * Structure integrity (threat model T1 — export injection):
 * - Every fence this serializer generates is *escalated*: strictly longer than
 *   any backtick run inside the fenced content, so embedded ``` sequences can
 *   never close our fences.
 * - Conversation-derived strings interpolated into structural positions
 *   (headings, bold labels, italic sublines, fence info strings) are collapsed
 *   to one line and backslash-escaped so they render as literal text.
 * - Pass-through content (text and thinking bodies) that leaves a code fence
 *   unclosed gets a matching closing fence appended, so it cannot swallow the
 *   rest of the document.
 * - `<details>`/`<summary>` tags inside thinking content are neutralized so
 *   they cannot close (or nest into) the wrapper we generate.
 *
 * Output is deterministic, has no trailing spaces, and ends with exactly one
 * trailing newline.
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
  RenderItem,
} from '../prepare';

/**
 * Render a prepared conversation as GitHub-flavored Markdown.
 *
 * Deterministic: identical input always yields identical output. The result
 * has no trailing spaces on any line and ends with a single trailing newline.
 */
export function serializeMarkdown(prepared: PreparedConversation): string {
  const sections = prepared.items.map(renderItem).filter((section) => section !== '');
  const body = sections
    .join('\n\n')
    .replace(/[ \t]+$/gm, '')
    .replace(/\n+$/, '');
  return `${body}\n`;
}

/** Render one top-level item. */
function renderItem(item: RenderItem): string {
  switch (item.kind) {
    case 'metadata':
      return renderMetadata(item);
    case 'branchStart':
      return renderBranchStart(item);
    case 'message':
      return renderMessage(item);
  }
}

/** `# {title}` plus an italic created/updated line when dates are known. */
function renderMetadata(item: MetadataItem): string {
  const parts = [`# ${inline(item.title)}`];
  const dates: string[] = [];
  if (item.createdAt !== undefined) {
    dates.push(`Created: ${inline(item.createdAt.display)}`);
  }
  if (item.updatedAt !== undefined) {
    dates.push(`Updated: ${inline(item.updatedAt.display)}`);
  }
  if (dates.length > 0) {
    parts.push(`*${dates.join(' · ')}*`);
  }
  return parts.join('\n\n');
}

/** `---` divider plus a `## Branch {n} of {m}` heading (default branch marked). */
function renderBranchStart(item: BranchStartItem): string {
  const suffix = item.isDefaultBranch ? ' (default)' : '';
  return `---\n\n## Branch ${item.branchIndex + 1} of ${item.branchCount}${suffix}`;
}

/** `## {senderLabel}` heading, optional italic timestamp, then the blocks. */
function renderMessage(item: MessageItem): string {
  const parts = [`## ${inline(item.senderLabel)}`];
  if (item.timestamp !== undefined) {
    parts.push(`*${inline(item.timestamp.display)}*`);
  }
  for (const block of item.blocks) {
    const rendered = renderBlock(block);
    if (rendered !== '') {
      parts.push(rendered);
    }
  }
  return parts.join('\n\n');
}

/** Render one prepared block. */
function renderBlock(block: PreparedBlock): string {
  switch (block.kind) {
    case 'text':
      return closeOpenFences(trimBlockEdges(block.text));
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

/**
 * GitHub-renderable collapsible section. The blank lines around the body make
 * GitHub parse it as Markdown inside the `<details>` element; the body is
 * neutralized so embedded `</details>`/`</summary>` tags cannot break out.
 */
function renderThinking(block: PreparedThinkingBlock): string {
  const inner: string[] = [];
  if (block.summaries.length > 0) {
    inner.push(block.summaries.map((summary) => `- *${inline(summary)}*`).join('\n'));
  }
  const body = closeOpenFences(neutralizeDetailsTags(trimBlockEdges(block.thinking)));
  if (body !== '') {
    inner.push(body);
  }
  const lines = ['<details>', '<summary>Thinking</summary>', ''];
  if (inner.length > 0) {
    lines.push(inner.join('\n\n'), '');
  }
  lines.push('</details>');
  return lines.join('\n');
}

/** Bold tool label plus the raw input as escalated fenced JSON. */
function renderToolUse(block: PreparedToolUseBlock): string {
  return `**Tool use: ${inline(block.name)}**\n\n${fence(stringifyJson(block.input), 'json')}`;
}

/** Bold result label (error flagged) plus the output in an escalated fence. */
function renderToolResult(block: PreparedToolResultBlock): string {
  const label = block.isError ? 'Tool result (error)' : 'Tool result';
  const name = block.name === undefined ? '' : `: ${inline(block.name)}`;
  const content = trimBlockEdges(block.content);
  const heading = `**${label}${name}**`;
  return content === '' ? heading : `${heading}\n\n${fence(content)}`;
}

/** `### Artifact: {title}` heading, italic type/command line, fenced content. */
function renderArtifact(block: PreparedArtifactBlock): string {
  const title = inline(block.title ?? block.id);
  const meta: string[] = [];
  if (block.artifactType !== undefined) {
    meta.push(inline(block.artifactType));
  }
  meta.push(inline(block.command));
  if (block.isFinal) {
    meta.push('final version');
  }
  const info = block.language === undefined ? '' : sanitizeFenceInfo(block.language);
  return `### Artifact: ${title}\n\n*${meta.join(' · ')}*\n\n${fence(block.content, info)}`;
}

/** Italic image label with the file name; data URIs are never embedded. */
function renderImage(block: PreparedImageBlock): string {
  if (block.fileName !== undefined) {
    return `*Image: ${inline(block.fileName)}*`;
  }
  if (block.mediaType !== undefined) {
    return `*Image (${inline(block.mediaType)})*`;
  }
  return '*Image*';
}

/** Bold attachment label plus its extracted text in an escalated fence. */
function renderAttachment(block: PreparedAttachmentBlock): string {
  const type = block.fileType === undefined ? '' : ` (${inline(block.fileType)})`;
  const label = `**Attachment: ${inline(block.fileName)}**${type}`;
  const content = block.extractedContent === undefined ? '' : trimBlockEdges(block.extractedContent);
  return content === '' ? label : `${label}\n\n${fence(content)}`;
}

/** Bold label for an uploaded file reference (no extractable content). */
function renderFile(block: PreparedFileBlock): string {
  const kind = block.fileKind === undefined ? '' : ` (${inline(block.fileKind)})`;
  return `**File: ${inline(block.fileName)}**${kind}`;
}

/**
 * Unknown blocks are never dropped: bold placeholder label plus the complete
 * raw block JSON in an escalated fence, so nothing is silently lost.
 */
function renderUnknown(block: PreparedUnknownBlock): string {
  return `**${inline(block.label)}**\n\n${fence(stringifyJson(block.raw), 'json')}`;
}

/**
 * Make conversation-derived text safe for a structural inline position
 * (heading, bold/italic label, list item): collapse all whitespace runs —
 * including newlines, so multi-line values cannot inject new block structure —
 * and backslash-escape Markdown/HTML-significant punctuation so the value
 * renders as literal text.
 */
function inline(text: string): string {
  return text
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/([\\`*_[\]<>&~|])/g, '\\$1');
}

/**
 * Wrap content in a backtick code fence that embedded content can never
 * close: the fence is strictly longer than the longest backtick run anywhere
 * in the content (minimum three). Tilde runs cannot close a backtick fence,
 * so they need no escalation.
 */
function fence(content: string, info = ''): string {
  const longest = (content.match(/`+/g) ?? []).reduce((max, run) => Math.max(max, run.length), 0);
  const marker = '`'.repeat(Math.max(3, longest + 1));
  const body = content === '' || content.endsWith('\n') ? content : `${content}\n`;
  return `${marker}${info}\n${body}${marker}`;
}

/**
 * Sanitize a language hint for use as a fence info string: strip backticks
 * (forbidden in backtick-fence info strings) and whitespace.
 */
function sanitizeFenceInfo(info: string): string {
  return info.replace(/[`\s]/g, '');
}

/**
 * Scan pass-through Markdown for a code fence left open at the end and, when
 * found, append the matching closing fence — so hostile or truncated content
 * cannot swallow the rest of the document into a code block.
 */
function closeOpenFences(text: string): string {
  if (text === '') {
    return text;
  }
  let open: { char: string; length: number } | undefined;
  for (const line of text.split('\n')) {
    const match = /^ {0,3}(`{3,}|~{3,})(.*)$/.exec(line);
    if (match === null) {
      continue;
    }
    const run = match[1] ?? '';
    const rest = match[2] ?? '';
    const char = run.charAt(0);
    if (open === undefined) {
      // A backtick-fence opener cannot have backticks in its info string.
      if (char === '`' && rest.includes('`')) {
        continue;
      }
      open = { char, length: run.length };
    } else if (char === open.char && run.length >= open.length && rest.trim() === '') {
      open = undefined;
    }
  }
  return open === undefined ? text : `${text}\n${open.char.repeat(open.length)}`;
}

/**
 * Backslash-escape `<details>`/`</details>`/`<summary>`/`</summary>` tags in
 * thinking content so they cannot close — or nest another element into — the
 * `<details>` wrapper this serializer generates. The escaped form renders as
 * the literal tag text.
 */
function neutralizeDetailsTags(text: string): string {
  return text.replace(/<(?=\/?(?:details|summary)\b)/gi, '\\<');
}

/** Strip leading blank lines and all trailing whitespace from block content. */
function trimBlockEdges(text: string): string {
  return text.replace(/^\n+/, '').replace(/\s+$/, '');
}

/**
 * JSON-encode a value for a fenced `json` block. Falls back to `String(value)`
 * for values JSON cannot represent (`undefined`, BigInt, circular structures)
 * so the block always renders something visible.
 */
function stringifyJson(value: unknown): string {
  try {
    const json = JSON.stringify(value, null, 2);
    return json === undefined ? String(value) : json;
  } catch {
    return String(value);
  }
}
