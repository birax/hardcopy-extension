/**
 * Markdown → docx: tokenize prepared text blocks with `marked.lexer()` and
 * build real Word structure — headings, lists with numbering, tables,
 * blockquotes, code blocks, hyperlinks — instead of raw Markdown syntax.
 *
 * Security (threat model T1): conversation-derived text only ever enters the
 * document as `TextRun` text, so the docx library performs all XML escaping.
 * We never hand-build XML from content strings. The only extra handling is
 * {@link sanitizeText}, which strips control characters that are illegal in
 * XML 1.0 (the escaper cannot represent them), and a scheme allow-list for
 * hyperlink targets.
 */

import {
  AlignmentType,
  BorderStyle,
  ExternalHyperlink,
  HeadingLevel,
  Paragraph,
  ShadingType,
  Table,
  TableCell,
  TableRow,
  TextRun,
  WidthType,
} from 'docx';
import type { ParagraphChild } from 'docx';
import { marked } from 'marked';
import type { Token, Tokens } from 'marked';

import { DOCX_COLORS, DOCX_NUMBERING, DOCX_STYLE } from './styles';

/** A top-level document child produced by the builder. */
export type DocxBlockChild = Paragraph | Table;

/**
 * Mutable per-document state threaded through Markdown rendering. Each
 * ordered list needs its own concrete numbering instance (so numbering
 * restarts per list rather than continuing document-wide).
 */
export interface DocxRenderContext {
  /** Next unused ordered-list numbering instance. */
  orderedInstance: number;
}

/** Create the render context one document build shares. */
export function createRenderContext(): DocxRenderContext {
  return { orderedInstance: 0 };
}

/** Inline formatting accumulated while walking nested inline tokens. */
interface InlineState {
  bold?: boolean;
  italics?: boolean;
  strike?: boolean;
  /** Character style id, e.g. `'Hyperlink'` inside links. */
  style?: string;
}

/** Options applied to paragraph-level tokens while rendering a subtree. */
interface BlockState {
  /** Paragraph style for plain paragraphs (used inside blockquotes). */
  paragraphStyle?: string;
}

/**
 * Strip characters that are illegal in XML 1.0 text (C0 controls except tab,
 * LF, CR, plus DEL). The docx library escapes markup characters but cannot
 * escape these, so they must never reach a `TextRun`.
 */
export function sanitizeText(text: string): string {
  // eslint-disable-next-line no-control-regex
  return text.replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, '');
}

/** Sanitize for a single-line run: control chars out, newlines become spaces. */
function inlineText(text: string): string {
  return sanitizeText(text).replace(/\r?\n/g, ' ');
}

const ENTITIES: Readonly<Record<string, string>> = Object.freeze({
  '&amp;': '&',
  '&lt;': '<',
  '&gt;': '>',
  '&quot;': '"',
  '&#39;': "'",
});

/**
 * Decode the basic HTML entities in Markdown plain text. Markdown renders
 * entity references as their characters; marked leaves them (and the entities
 * it adds itself for `escaped` tokens) for an HTML renderer to resolve — we
 * are not one, so resolve them here. Code spans/fences are never decoded.
 */
function decodeEntities(text: string): string {
  return text.replace(/&(?:amp|lt|gt|quot|#39);/g, (match) => ENTITIES[match] as string);
}

/** One formatted text run of untrusted content. */
function run(text: string, state: InlineState): TextRun {
  return new TextRun({
    text: inlineText(text),
    bold: state.bold,
    italics: state.italics,
    strike: state.strike,
    style: state.style,
  });
}

/**
 * A code block as a single `CodeBlock`-styled paragraph: one run per line
 * separated by hard breaks, so line breaks are preserved exactly and the
 * shading/border wraps the block as one unit.
 */
export function codeParagraph(code: string): Paragraph {
  const lines = code.replace(/\r\n/g, '\n').split('\n');
  return new Paragraph({
    style: DOCX_STYLE.codeBlock,
    children: lines.map(
      (line, index) => new TextRun({ text: sanitizeText(line), break: index > 0 ? 1 : undefined }),
    ),
  });
}

/** Hyperlink targets must be plainly navigable — never script or data URIs. */
function isSafeLinkTarget(href: string): boolean {
  return /^(?:https?:|mailto:)/i.test(href.trim());
}

/** Render one inline token into runs (or a hyperlink wrapping runs). */
function renderInlineToken(token: Token, state: InlineState): ParagraphChild[] {
  switch (token.type) {
    case 'text': {
      const text = token as Tokens.Text;
      // Defensive: block-level `text` tokens are unwrapped before they
      // reach inline rendering.
      if (text.tokens !== undefined) {
        return renderInline(text.tokens, state);
      }
      return [run(decodeEntities(text.text), state)];
    }
    case 'escape':
      return [run((token as Tokens.Escape).text, state)];
    case 'strong':
      return renderInline((token as Tokens.Strong).tokens, { ...state, bold: true });
    case 'em':
      return renderInline((token as Tokens.Em).tokens, { ...state, italics: true });
    case 'del':
      return renderInline((token as Tokens.Del).tokens, { ...state, strike: true });
    case 'codespan':
      return [
        new TextRun({
          text: inlineText((token as Tokens.Codespan).text),
          style: DOCX_STYLE.codeInline,
          bold: state.bold,
          italics: state.italics,
          strike: state.strike,
        }),
      ];
    case 'link': {
      const link = token as Tokens.Link;
      const label = renderInline(link.tokens, { ...state, style: 'Hyperlink' });
      if (!isSafeLinkTarget(link.href)) {
        // Neutralized target: keep the label plus the literal href as text.
        return [...renderInline(link.tokens, state), run(` (${link.href})`, state)];
      }
      return [new ExternalHyperlink({ link: link.href, children: label })];
    }
    case 'image': {
      const image = token as Tokens.Image;
      const alt = image.text.trim() === '' ? image.href : image.text;
      return [
        new TextRun({
          text: inlineText(`[Image: ${alt}]`),
          italics: true,
          color: DOCX_COLORS.muted,
        }),
      ];
    }
    case 'br':
      return [new TextRun({ break: 1 })];
    case 'html':
      // Inline HTML is not interpreted — show it verbatim as text.
      return [run((token as Tokens.HTML).raw, state)];
    // Defensive: every current marked inline token type is handled above;
    // future token kinds render their source, never dropped.
    default:
      return [run(token.raw, state)];
  }
}

/** Render a list of inline tokens into paragraph children. */
function renderInline(tokens: Token[], state: InlineState): ParagraphChild[] {
  return tokens.flatMap((token) => renderInlineToken(token, state));
}

/** The inline tokens of a paragraph-like token. */
function inlineTokensOf(token: Tokens.Text | Tokens.Paragraph): Token[] {
  // `Text.tokens` is optional in marked's types but always present on the
  // block-level text tokens handled here.
  return token.tokens ?? [token];
}

/** Markdown heading depths map one level down under the sender headings. */
function headingLevelForDepth(depth: number): (typeof HeadingLevel)[keyof typeof HeadingLevel] {
  if (depth <= 1) {
    return HeadingLevel.HEADING_2;
  }
  if (depth === 2) {
    return HeadingLevel.HEADING_3;
  }
  return HeadingLevel.HEADING_4;
}

function headingParagraph(token: Tokens.Heading): Paragraph {
  return new Paragraph({
    heading: headingLevelForDepth(token.depth),
    children: renderInline(token.tokens, {}),
  });
}

const TABLE_BORDER = {
  style: BorderStyle.SINGLE,
  size: 4,
  color: DOCX_COLORS.border,
} as const;

const CELL_MARGINS = { top: 60, bottom: 60, left: 100, right: 100 } as const;

function cellAlignment(
  align: 'left' | 'center' | 'right' | null,
): (typeof AlignmentType)[keyof typeof AlignmentType] | undefined {
  if (align === 'center') {
    return AlignmentType.CENTER;
  }
  if (align === 'right') {
    return AlignmentType.RIGHT;
  }
  return undefined;
}

/** A Markdown table as a real Word table; header row bold on subtle shading. */
function renderTable(token: Tokens.Table): Table {
  const headerRow = new TableRow({
    tableHeader: true,
    children: token.header.map(
      (cell, column) =>
        new TableCell({
          shading: { type: ShadingType.CLEAR, fill: DOCX_COLORS.subtleBg },
          margins: CELL_MARGINS,
          children: [
            new Paragraph({
              alignment: cellAlignment(token.align[column] ?? null),
              children: renderInline(cell.tokens, { bold: true }),
            }),
          ],
        }),
    ),
  });
  const bodyRows = token.rows.map(
    (row) =>
      new TableRow({
        children: row.map(
          (cell, column) =>
            new TableCell({
              margins: CELL_MARGINS,
              children: [
                new Paragraph({
                  alignment: cellAlignment(token.align[column] ?? null),
                  children: renderInline(cell.tokens, {}),
                }),
              ],
            }),
        ),
      }),
  );
  return new Table({
    width: { size: 100, type: WidthType.PERCENTAGE },
    borders: {
      top: TABLE_BORDER,
      bottom: TABLE_BORDER,
      left: TABLE_BORDER,
      right: TABLE_BORDER,
      insideHorizontal: TABLE_BORDER,
      insideVertical: TABLE_BORDER,
    },
    rows: [headerRow, ...bodyRows],
  });
}

/** Render one list (possibly nested) into numbered/bulleted paragraphs. */
function renderList(
  token: Tokens.List,
  context: DocxRenderContext,
  level: number,
): DocxBlockChild[] {
  const clamped = Math.min(level, DOCX_NUMBERING.maxLevel);
  const numbering = token.ordered
    ? { reference: DOCX_NUMBERING.ordered, level: clamped, instance: context.orderedInstance++ }
    : { reference: DOCX_NUMBERING.bullet, level: clamped, instance: 0 };

  const children: DocxBlockChild[] = [];
  for (const item of token.items) {
    let firstLine = true;
    for (const itemToken of item.tokens) {
      if (itemToken.type === 'checkbox') {
        // The checkbox glyph is rendered from `item.task`/`item.checked`.
        continue;
      }
      if (itemToken.type === 'list') {
        children.push(...renderList(itemToken as Tokens.List, context, level + 1));
        continue;
      }
      if (itemToken.type === 'text' || itemToken.type === 'paragraph') {
        const inline = renderInline(
          inlineTokensOf(itemToken as Tokens.Text | Tokens.Paragraph),
          {},
        );
        const checkbox =
          firstLine && item.task ? [run(item.checked === true ? '☑ ' : '☐ ', {})] : [];
        children.push(
          new Paragraph({
            numbering: firstLine ? numbering : undefined,
            indent: firstLine ? undefined : { left: 720 * (clamped + 1) },
            children: [...checkbox, ...inline],
          }),
        );
        firstLine = false;
        continue;
      }
      // Any other block inside a list item (code fence, blockquote, table…)
      // renders with its normal structure below the item.
      children.push(...renderBlockToken(itemToken, context, {}));
      firstLine = false;
    }
  }
  return children;
}

/** Render one block-level token into document children. */
function renderBlockToken(
  token: Token,
  context: DocxRenderContext,
  state: BlockState,
): DocxBlockChild[] {
  switch (token.type) {
    case 'heading':
      return [headingParagraph(token as Tokens.Heading)];
    case 'paragraph':
    case 'text': {
      const block = token as Tokens.Paragraph | Tokens.Text;
      return [
        new Paragraph({
          style: state.paragraphStyle,
          children: renderInline(inlineTokensOf(block), {}),
        }),
      ];
    }
    case 'code':
      return [codeParagraph((token as Tokens.Code).text)];
    case 'blockquote':
      return renderBlockTokens((token as Tokens.Blockquote).tokens, context, {
        paragraphStyle: DOCX_STYLE.blockquote,
      });
    case 'list':
      return renderList(token as Tokens.List, context, 0);
    case 'table':
      return [renderTable(token as Tokens.Table)];
    case 'hr':
      return [new Paragraph({ thematicBreak: true })];
    case 'space':
      return [];
    case 'html':
      // Block HTML is not interpreted — show the source verbatim.
      return [
        new Paragraph({
          style: state.paragraphStyle,
          children: [run((token as Tokens.HTML).raw, {})],
        }),
      ];
    case 'def':
      // Link reference definitions are consumed by the lexer; the links that
      // use them already resolved. Nothing visible to render.
      return [];
    // Defensive: every current marked block token type is handled above;
    // future token kinds render their source, never dropped.
    default:
      return [new Paragraph({ style: state.paragraphStyle, children: [run(token.raw, {})] })];
  }
}

/** Render a token list into document children. */
function renderBlockTokens(
  tokens: Token[],
  context: DocxRenderContext,
  state: BlockState,
): DocxBlockChild[] {
  return tokens.flatMap((token) => renderBlockToken(token, context, state));
}

/**
 * Convert one prepared text block's Markdown into Word document children.
 * `context` is shared across the whole document build (numbering instances).
 */
export function markdownToDocx(markdown: string, context: DocxRenderContext): DocxBlockChild[] {
  return renderBlockTokens(marked.lexer(markdown), context, {});
}
