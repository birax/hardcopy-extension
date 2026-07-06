/**
 * Hand-rolled RTF serializer (issue #10, ADR 0006).
 *
 * Renders a {@link PreparedConversation} — the option-applied view produced by
 * `prepareConversation` — into a self-contained RTF 1.5 document. Items and
 * blocks are rendered verbatim, in order; this module never re-interprets
 * export options, and unknown blocks always render as visible placeholders.
 *
 * Security (threat model T1): every conversation-derived string flows through
 * {@link escapeRtfText} exactly once. `\`, `{`, `}` are escaped, non-ASCII
 * characters are emitted as signed 16-bit `\uN?` escapes (astral characters as
 * a UTF-16 surrogate pair, i.e. two `\u` values), and C0 control characters
 * other than tab/newline are dropped. Raw control words from content can
 * therefore never reach the output.
 *
 * Manual verification checklist (issue #10 acceptance; re-run when the shell
 * or paragraph model changes):
 * - [x] macOS TextEdit opens the export; headings/bold/mono/colors render
 *       (`textutil -convert txt out.rtf` also parses it cleanly).
 * - [ ] Microsoft Word opens the export without a repair prompt; tables show
 *       borders and the code shading is visible.
 * - [ ] LibreOffice Writer opens the export; lists indent and emoji/CJK
 *       round-trip (the `\uN?` escapes reassemble).
 */

import { Marked } from 'marked';
import type { Token, Tokens } from 'marked';

import type {
  MessageItem,
  MetadataItem,
  PreparedBlock,
  PreparedConversation,
  ResolvedTimestamp,
} from '../prepare';

// --- Document constants ----------------------------------------------------

/**
 * Color table, from the light design palette (docs/design/design-system.md).
 * Index 0 is the RTF "auto" color; content colors start at 1.
 */
const COLORS: readonly { r: number; g: number; b: number }[] = [
  { r: 23, g: 37, b: 43 }, // 1 — ink (--hc-text)
  { r: 10, g: 91, b: 85 }, // 2 — teal accent (--hc-accent)
  { r: 180, g: 34, b: 55 }, // 3 — error red (--hc-error)
  { r: 66, g: 85, b: 92 }, // 4 — muted grey (--hc-text-secondary)
  { r: 242, g: 247, b: 246 }, // 5 — subtle background (--hc-bg-subtle)
];
const CF_INK = 1;
const CF_ACCENT = 2;
const CF_ERROR = 3;
const CF_MUTED = 4;
const CB_SUBTLE = 5;

/** Font sizes in half-points. */
const FS_TITLE = 40;
const FS_HEADINGS: readonly number[] = [32, 28, 26, 24, 23, 22];
const FS_BODY = 22;
const FS_SENDER = 26;
const FS_SMALL = 16;
const FS_CODE = 20;
const FS_INSET = 20;

/** Body font (f0) and monospace font (f1) indices in the font table. */
const F_BODY = 0;
const F_MONO = 1;

/** Usable text width in twips (US Letter/A4-safe: 6.5 inches). */
const TEXT_WIDTH_TWIPS = 9360;
/** One indent step (0.25 inch) for lists, quotes, and insets. */
const INDENT_STEP = 360;

/** Everything markdown/plain rendering needs to know about where it is. */
interface RenderCtx {
  /** Left indent in twips. */
  li: number;
  /** Color-table index for body text. */
  cf: number;
  /** Base font size in half-points. */
  fs: number;
  /** Render body text italic (thinking insets). */
  italic: boolean;
}

const BODY_CTX: RenderCtx = { li: 0, cf: CF_INK, fs: FS_BODY, italic: false };

/** A private Marked instance so other serializers' `marked.use()` config can never leak in. */
const markdown = new Marked({ gfm: true });

// --- Escaping (security-critical) -------------------------------------------

/**
 * Escape one conversation-derived string for interpolation into RTF. This is
 * the single choke point required by threat model T1:
 *
 * - `\`, `{`, `}` → `\\`, `\{`, `\}` (so content can never open/close groups
 *   or smuggle control words);
 * - tab → `\tab `, newline → `newline` (default `\par `); `\r` is dropped so
 *   CRLF collapses to one break; other C0 controls are dropped;
 * - every code unit ≥ 0x80 → `\uN?` with N as a SIGNED 16-bit value. Astral
 *   characters (emoji etc.) are two UTF-16 code units and therefore emit two
 *   consecutive `\u` escapes — RTF readers reassemble the surrogate pair.
 */
export function escapeRtfText(text: string, newline: '\\par ' | '\\line ' = '\\par '): string {
  let out = '';
  for (let i = 0; i < text.length; i += 1) {
    const code = text.charCodeAt(i);
    if (code === 0x5c) {
      out += '\\\\';
    } else if (code === 0x7b) {
      out += '\\{';
    } else if (code === 0x7d) {
      out += '\\}';
    } else if (code === 0x09) {
      out += '\\tab ';
    } else if (code === 0x0a) {
      out += newline;
    } else if (code < 0x20) {
      // \r (handled via \n for CRLF) and other C0 controls: dropped.
    } else if (code < 0x80) {
      out += text.charAt(i);
    } else {
      out += `\\u${code > 0x7fff ? code - 0x10000 : code}?`;
    }
  }
  return out;
}

/** Escape prose that lives inside a single paragraph (soft breaks → `\line`). */
function esc(text: string): string {
  return escapeRtfText(text, '\\line ');
}

/**
 * Decode the HTML entities marked leaves in inline `text`/`codespan` tokens
 * (`&amp;` etc. plus numeric forms) BEFORE RTF escaping, so exported prose
 * reads as the author intended. Decoding first is safe: anything a numeric
 * entity produces (e.g. `&#123;` → `{`) still goes through the escaper.
 */
function decodeEntities(text: string): string {
  return text
    .replace(/&#(\d+);/g, (_, dec: string) => String.fromCodePoint(Number(dec)))
    .replace(/&#x([0-9a-fA-F]+);/g, (_, hex: string) => String.fromCodePoint(parseInt(hex, 16)))
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&apos;/g, "'");
}

// --- Structural validator ----------------------------------------------------

/**
 * Cheap structural validation used by the test suites: verifies the document
 * shell is present and that braces balance, ignoring escaped `\{`/`\}`/`\\`
 * (the scan skips the character after any `\`, which is safe because control
 * words never contain braces). Returns a list of problems; empty means valid.
 */
export function validateRtfStructure(rtf: string): string[] {
  const problems: string[] = [];
  if (!rtf.startsWith('{\\rtf1\\ansi\\ansicpg1252')) {
    problems.push('missing RTF shell prefix {\\rtf1\\ansi\\ansicpg1252');
  }
  if (!rtf.includes('{\\fonttbl')) {
    problems.push('missing font table');
  }
  if (!rtf.includes('{\\colortbl;')) {
    problems.push('missing color table');
  }
  let depth = 0;
  for (let i = 0; i < rtf.length; i += 1) {
    const ch = rtf[i];
    if (ch === '\\') {
      i += 1; // skip the escaped char / first control-word letter
    } else if (ch === '{') {
      depth += 1;
    } else if (ch === '}') {
      depth -= 1;
      if (depth < 0) {
        problems.push(`unbalanced closing brace at offset ${i}`);
        return problems;
      }
    }
  }
  if (depth !== 0) {
    problems.push(`unbalanced braces: ${depth} group(s) left open`);
  }
  return problems;
}

// --- Public API --------------------------------------------------------------

/**
 * Serialize a prepared conversation to a complete RTF document. Pure and
 * deterministic: the same prepared view always yields the identical string.
 */
export function serializeRtf(prepared: PreparedConversation): string {
  let body = '';
  for (const item of prepared.items) {
    switch (item.kind) {
      case 'metadata':
        body += renderMetadata(item);
        break;
      case 'branchStart':
        body += paragraph(
          `\\sb360\\sa120\\keepn\\b\\cf${CF_ACCENT}\\f${F_BODY}\\fs${FS_HEADINGS[1]}`,
          esc(
            `Branch ${item.branchIndex + 1} of ${item.branchCount}` +
              (item.isDefaultBranch ? ' (current)' : ''),
          ),
        );
        break;
      case 'message':
        body += renderMessage(item);
        break;
    }
  }

  const fonttbl =
    '{\\fonttbl' +
    `{\\f${F_BODY}\\fswiss\\fcharset0 Helvetica{\\*\\falt Calibri};}` +
    `{\\f${F_MONO}\\fmodern\\fcharset0 Courier New{\\*\\falt Menlo};}` +
    '}';
  const colortbl =
    '{\\colortbl;' +
    COLORS.map((c) => `\\red${c.r}\\green${c.g}\\blue${c.b};`).join('') +
    '}';

  return `{\\rtf1\\ansi\\ansicpg1252\\deff0\\deflang1033\\uc1\n${fonttbl}\n${colortbl}\n${body}}`;
}

// --- Item rendering ----------------------------------------------------------

function renderMetadata(item: MetadataItem): string {
  let out = paragraph(`\\sa120\\keepn\\b\\cf${CF_INK}\\f${F_BODY}\\fs${FS_TITLE}`, esc(item.title));
  const dates = [stampLine('Created', item.createdAt), stampLine('Updated', item.updatedAt)].filter(
    (line) => line !== undefined,
  );
  if (dates.length > 0) {
    out += paragraph(
      `\\sa240\\cf${CF_MUTED}\\f${F_BODY}\\fs${FS_SMALL}`,
      dates.join(`\\u183? `), // " · " separator
    );
  }
  return out;
}

function stampLine(label: string, stamp: ResolvedTimestamp | undefined): string | undefined {
  return stamp === undefined ? undefined : `${label} ${esc(stamp.display)} `;
}

function renderMessage(item: MessageItem): string {
  const timestamp =
    item.timestamp === undefined
      ? ''
      : `{\\cf${CF_MUTED}\\fs${FS_SMALL}  \\u8212?  ${esc(item.timestamp.display)}}`;
  let out = paragraph(
    `\\sb240\\sa120\\keepn\\f${F_BODY}`,
    `{\\b\\cf${CF_ACCENT}\\fs${FS_SENDER} ${esc(item.senderLabel)}}${timestamp}`,
  );
  for (const block of item.blocks) {
    out += renderBlock(block);
  }
  return out;
}

function renderBlock(block: PreparedBlock): string {
  switch (block.kind) {
    case 'text':
      return renderMarkdown(block.text, BODY_CTX);

    case 'thinking': {
      const ctx: RenderCtx = { li: INDENT_STEP, cf: CF_MUTED, fs: FS_INSET, italic: true };
      let out = insetLabel('Thinking', CF_MUTED);
      for (const summary of block.summaries) {
        out += paragraph(
          `\\li${ctx.li}\\sa60\\i\\cf${CF_MUTED}\\f${F_BODY}\\fs${FS_SMALL}`,
          esc(summary),
        );
      }
      return out + renderMarkdown(block.thinking, ctx);
    }

    case 'toolUse':
      return insetLabel(`Tool use: ${block.name}`, CF_MUTED) + monoInset(stringify(block.input));

    case 'toolResult': {
      const name = block.name === undefined ? '' : `: ${block.name}`;
      return block.isError
        ? insetLabel(`Tool result (error)${name}`, CF_ERROR) + monoInset(block.content, CF_ERROR)
        : insetLabel(`Tool result${name}`, CF_MUTED) + monoInset(block.content);
    }

    case 'artifact': {
      const details = [
        block.id,
        block.command,
        ...(block.language === undefined ? [] : [block.language]),
        ...(block.isFinal ? ['final version'] : []),
      ].join(', ');
      const title = block.title === undefined ? 'Artifact' : `Artifact: ${block.title}`;
      return insetLabel(`${title} (${details})`, CF_ACCENT) + monoInset(block.content);
    }

    case 'image': {
      const name = block.fileName ?? 'inline image';
      const type = block.mediaType === undefined ? '' : ` (${block.mediaType})`;
      return paragraph(
        `\\li${INDENT_STEP}\\sa120\\i\\cf${CF_MUTED}\\f${F_BODY}\\fs${FS_INSET}`,
        esc(`[Image: ${name}${type}]`),
      );
    }

    case 'attachment': {
      const type = block.fileType === undefined ? '' : ` (${block.fileType})`;
      let out = insetLabel(`Attachment: ${block.fileName}${type}`, CF_MUTED);
      if (block.extractedContent !== undefined) {
        out += monoInset(block.extractedContent);
      }
      return out;
    }

    case 'file': {
      const kind = block.fileKind === undefined ? '' : ` (${block.fileKind})`;
      return paragraph(
        `\\li${INDENT_STEP}\\sa120\\i\\cf${CF_MUTED}\\f${F_BODY}\\fs${FS_INSET}`,
        esc(`[File: ${block.fileName}${kind}]`),
      );
    }

    case 'unknown':
      // Unknown content is never dropped: visible label plus the raw block.
      return insetLabel(block.label, CF_ERROR) + monoInset(stringify(block.raw));
  }
}

/** JSON-render arbitrary tool input / raw blocks; deterministic for a given value. */
function stringify(value: unknown): string {
  return JSON.stringify(value, null, 2) ?? String(value);
}

// --- Paragraph helpers -------------------------------------------------------

/** One self-contained paragraph group: `{\pard<format> <content>\par}`. */
function paragraph(format: string, content: string): string {
  return `{\\pard${format} ${content}\\par}\n`;
}

/** The bold label line above an inset (tool/artifact/attachment/unknown/thinking). */
function insetLabel(label: string, cf: number): string {
  return paragraph(
    `\\li${INDENT_STEP}\\sb120\\sa60\\keepn\\b\\cf${cf}\\f${F_MONO}\\fs${FS_INSET}`,
    esc(label),
  );
}

/**
 * A shaded monospace block that preserves line breaks exactly: one paragraph,
 * lines joined with `\line`, background via `\cbpat` paragraph shading.
 */
function monoBlock(content: string, li: number, cf: number = CF_INK): string {
  const lines = content
    .replace(/\r\n/g, '\n')
    .split('\n')
    .map((line) => escapeRtfText(line));
  return paragraph(
    `\\li${li}\\sa120\\cbpat${CB_SUBTLE}\\cf${cf}\\f${F_MONO}\\fs${FS_CODE}`,
    lines.join('\\line '),
  );
}

/** A mono block at the standard inset indent. */
function monoInset(content: string, cf: number = CF_INK): string {
  return monoBlock(content, INDENT_STEP, cf);
}

// --- Markdown rendering ------------------------------------------------------

/** Tokenize markdown-ish text with marked and render every token to RTF. */
function renderMarkdown(text: string, ctx: RenderCtx): string {
  return renderTokens(markdown.lexer(text), ctx);
}

function renderTokens(tokens: Token[], ctx: RenderCtx): string {
  let out = '';
  for (const token of tokens) {
    out += renderToken(token, ctx);
  }
  return out;
}

function renderToken(token: Token, ctx: RenderCtx): string {
  switch (token.type) {
    case 'space':
    case 'def':
      return '';

    case 'heading': {
      const t = token as Tokens.Heading;
      const fs = FS_HEADINGS[Math.min(t.depth, FS_HEADINGS.length) - 1] ?? FS_BODY;
      return paragraph(
        `\\li${ctx.li}\\sb240\\sa120\\keepn\\b${ctx.italic ? '\\i' : ''}\\cf${ctx.cf}\\f${F_BODY}\\fs${fs}`,
        renderInline(t.tokens, ctx),
      );
    }

    case 'paragraph':
    case 'text': {
      const t = token as Tokens.Paragraph | Tokens.Text;
      const inline = t.tokens === undefined ? esc(decodeEntities(t.text)) : renderInline(t.tokens, ctx);
      return paragraph(bodyFormat(ctx), inline);
    }

    case 'code':
      return monoBlock((token as Tokens.Code).text, ctx.li);

    case 'blockquote': {
      const t = token as Tokens.Blockquote;
      const inner: RenderCtx = { ...ctx, li: ctx.li + INDENT_STEP * 2, cf: CF_MUTED };
      return renderTokens(t.tokens, inner);
    }

    case 'list':
      return renderList(token as Tokens.List, ctx);

    case 'table':
      return renderTable(token as Tokens.Table, ctx);

    case 'hr':
      return paragraph(`\\li${ctx.li}\\sa120\\brdrb\\brdrs\\brdrw15\\brdrcf${CF_MUTED}\\brsp60`, '');

    case 'html':
      // Raw HTML renders visibly as monospace text — never interpreted, never dropped.
      return monoBlock((token as Tokens.HTML).text, ctx.li);

    default:
      // Unrecognised token types render their raw text so nothing is lost.
      return paragraph(bodyFormat(ctx), esc(decodeEntities(token.raw ?? '')));
  }
}

function bodyFormat(ctx: RenderCtx): string {
  return `\\li${ctx.li}\\sa120${ctx.italic ? '\\i' : ''}\\cf${ctx.cf}\\f${F_BODY}\\fs${ctx.fs}`;
}

// --- Lists -------------------------------------------------------------------

function renderList(list: Tokens.List, ctx: RenderCtx): string {
  const start = typeof list.start === 'number' ? list.start : 1;
  let out = '';
  list.items.forEach((item, index) => {
    out += renderListItem(item, list.ordered ? `${start + index}.` : '\\bullet', ctx);
  });
  return out;
}

function renderListItem(item: Tokens.ListItem, marker: string, ctx: RenderCtx): string {
  const li = ctx.li + INDENT_STEP;
  const inner: RenderCtx = { ...ctx, li };
  const markerText = item.task ? (item.checked === true ? '[x]' : '[ ]') : marker;
  const prefix = `${markerText}\\tab `;

  let out = '';
  let firstInlineRendered = false;
  for (const child of item.tokens) {
    if (child.type === 'checkbox') {
      // The checkbox is already rendered as this item's marker.
      continue;
    }
    if (!firstInlineRendered && (child.type === 'text' || child.type === 'paragraph')) {
      const t = child as Tokens.Text | Tokens.Paragraph;
      let inline = t.tokens === undefined ? esc(decodeEntities(t.text)) : renderInline(t.tokens, inner);
      if (item.task) {
        // Loose task items keep the raw "[x] " prefix inside the paragraph
        // token; drop it, since the marker above already shows it.
        inline = inline.replace(/^\[[ xX]\] /, '');
      }
      out += paragraph(
        `\\li${li}\\fi-${INDENT_STEP}\\tx${li}\\sa60${ctx.italic ? '\\i' : ''}\\cf${ctx.cf}\\f${F_BODY}\\fs${ctx.fs}`,
        `${prefix}${inline}`,
      );
      firstInlineRendered = true;
    } else {
      out += renderToken(child, inner);
    }
  }
  if (!firstInlineRendered) {
    // An item with no leading text (e.g. a bare nested list) still shows its marker.
    out = paragraph(`\\li${li}\\fi-${INDENT_STEP}\\tx${li}\\sa60\\cf${ctx.cf}\\f${F_BODY}\\fs${ctx.fs}`, prefix) + out;
  }
  return out;
}

// --- Tables ------------------------------------------------------------------

/**
 * Real RTF tables: one `\trowd` row definition per row with cumulative
 * `\cellx` boundaries, bordered cells, and a shaded bold header row.
 */
function renderTable(table: Tokens.Table, ctx: RenderCtx): string {
  const cols = table.header.length;
  if (cols === 0) {
    return '';
  }
  const width = Math.floor((TEXT_WIDTH_TWIPS - ctx.li) / cols);

  const row = (cells: Tokens.TableCell[], header: boolean): string => {
    let out = `\\trowd\\trgaph108\\trleft${ctx.li}`;
    for (let i = 0; i < cols; i += 1) {
      out +=
        `\\clbrdrt\\brdrs\\brdrw10\\brdrcf${CF_MUTED}` +
        `\\clbrdrl\\brdrs\\brdrw10\\brdrcf${CF_MUTED}` +
        `\\clbrdrb\\brdrs\\brdrw10\\brdrcf${CF_MUTED}` +
        `\\clbrdrr\\brdrs\\brdrw10\\brdrcf${CF_MUTED}` +
        (header ? `\\clcbpat${CB_SUBTLE}` : '') +
        `\\cellx${ctx.li + width * (i + 1)}`;
    }
    for (let i = 0; i < cols; i += 1) {
      const cell = cells[i];
      const align = cell?.align === 'center' ? '\\qc' : cell?.align === 'right' ? '\\qr' : '\\ql';
      const content = cell === undefined ? '' : renderInline(cell.tokens, ctx);
      out += `\\pard\\intbl${align}{${header ? '\\b' : ''}\\cf${ctx.cf}\\f${F_BODY}\\fs${ctx.fs} ${content}}\\cell`;
    }
    return `${out}\\row\n`;
  };

  let out = row(table.header, true);
  for (const cells of table.rows) {
    out += row(cells, false);
  }
  return `${out}\\pard\n`;
}

// --- Inline rendering ----------------------------------------------------------

function renderInline(tokens: Token[] | undefined, ctx: RenderCtx): string {
  if (tokens === undefined) {
    return '';
  }
  let out = '';
  for (const token of tokens) {
    out += renderInlineToken(token, ctx);
  }
  return out;
}

function renderInlineToken(token: Token, ctx: RenderCtx): string {
  switch (token.type) {
    case 'text': {
      const t = token as Tokens.Text;
      return t.tokens === undefined ? esc(decodeEntities(t.text)) : renderInline(t.tokens, ctx);
    }
    case 'escape':
      return esc(decodeEntities((token as Tokens.Escape).text));
    case 'strong':
      return `{\\b ${renderInline((token as Tokens.Strong).tokens, ctx)}}`;
    case 'em':
      return `{\\i ${renderInline((token as Tokens.Em).tokens, ctx)}}`;
    case 'del':
      return `{\\strike ${renderInline((token as Tokens.Del).tokens, ctx)}}`;
    case 'codespan':
      return `{\\f${F_MONO}\\fs${FS_CODE} ${esc(decodeEntities((token as Tokens.Codespan).text))}}`;
    case 'br':
      return '\\line ';
    case 'link': {
      const t = token as Tokens.Link;
      const href = esc(t.href);
      if (t.text === t.href) {
        return `{\\ul\\cf${CF_ACCENT} ${href}}`;
      }
      return `{\\ul\\cf${CF_ACCENT} ${renderInline(t.tokens, ctx)}}{\\cf${CF_MUTED}  (${href})}`;
    }
    case 'image': {
      const t = token as Tokens.Image;
      return `{\\i\\cf${CF_MUTED} [image: ${esc(t.text === '' ? t.href : t.text)}]}`;
    }
    case 'html':
      return esc((token as Tokens.HTML).text);
    default:
      return esc(decodeEntities(token.raw ?? ''));
  }
}
