/**
 * Pure PDF layout engine: turns a {@link PreparedConversation} into positioned
 * page elements (text runs and rectangles) ready for a drawing backend.
 *
 * This module deliberately imports nothing from pdf-lib. All text measurement
 * and glyph handling is injected via {@link PdfTextShaper}, so the whole
 * engine — word-wrap, code blocks, insets, pagination, page numbers — is unit
 * testable with a fake measurer and no font files.
 *
 * Coordinates are top-down: `y` is the distance in points from the TOP of the
 * page; the renderer flips into PDF's bottom-up space. Colors and the type
 * scale come from the design system (docs/design/design-system.md, light
 * theme — print is paper).
 */

import { marked } from 'marked';
import type { Token, Tokens } from 'marked';

import type {
  MessageItem,
  PreparedArtifactBlock,
  PreparedAttachmentBlock,
  PreparedBlock,
  PreparedConversation,
  PreparedThinkingBlock,
  PreparedToolResultBlock,
  PreparedToolUseBlock,
  PreparedUnknownBlock,
  RenderItem,
  ResolvedTimestamp,
} from '../../prepare';

/** The four faces the serializer bundles (bold+italic falls back to bold). */
export type PdfFontFace = 'regular' | 'bold' | 'italic' | 'mono';

/** An RGB color with 0–1 channels (pdf-lib's `rgb()` convention). */
export interface PdfColor {
  r: number;
  g: number;
  b: number;
}

/**
 * Injected text services. `sanitize` must map every code point the face
 * cannot render to renderable output (the glyph-safety filter lives in the
 * renderer); `measure` must return the width in points of already-sanitized
 * text. Tests inject fakes for both.
 */
export interface PdfTextShaper {
  sanitize(text: string, face: PdfFontFace): string;
  measure(text: string, face: PdfFontFace, size: number): number;
}

/** Page geometry, injectable so pagination tests can use tiny pages. */
export interface PdfPageSetup {
  pageWidth: number;
  pageHeight: number;
  marginTop: number;
  marginRight: number;
  marginBottom: number;
  marginLeft: number;
}

/** A4 portrait with generous book-like margins. */
export const A4_PAGE_SETUP: Readonly<PdfPageSetup> = Object.freeze({
  pageWidth: 595.28,
  pageHeight: 841.89,
  marginTop: 64,
  marginRight: 56,
  marginBottom: 64,
  marginLeft: 56,
});

/** One positioned text run. `baseline` is measured from the page top. */
export interface PdfTextElement {
  x: number;
  baseline: number;
  text: string;
  face: PdfFontFace;
  size: number;
  color: PdfColor;
}

/** One filled rectangle (backgrounds, rules). `y` is the TOP edge. */
export interface PdfRectElement {
  x: number;
  y: number;
  width: number;
  height: number;
  color: PdfColor;
}

/** One laid-out page. Draw {@link rects} first, then {@link texts}. */
export interface PdfLaidOutPage {
  rects: PdfRectElement[];
  texts: PdfTextElement[];
}

/** The full laid-out document. */
export interface PdfLayout {
  setup: PdfPageSetup;
  pages: PdfLaidOutPage[];
}

const hex = (value: string): PdfColor => ({
  r: parseInt(value.slice(1, 3), 16) / 255,
  g: parseInt(value.slice(3, 5), 16) / 255,
  b: parseInt(value.slice(5, 7), 16) / 255,
});

/** Design-system light-theme palette (print output is always "light"). */
export const PDF_COLORS = Object.freeze({
  ink: hex('#17252b'),
  secondary: hex('#42555c'),
  accent: hex('#0a5b55'),
  accentTint: hex('#9bd4cc'),
  border: hex('#c6d4d2'),
  borderStrong: hex('#66807b'),
  subtleBg: hex('#f2f7f6'),
  warn: hex('#7a5000'),
  warnBg: hex('#fcf3e2'),
  error: hex('#b42237'),
  errorBg: hex('#fbebed'),
});

/** Point sizes for the PDF type scale (print-tuned, not the popup's px scale). */
const TYPE = {
  title: 19,
  h1: 16,
  h2: 14,
  h3: 12.5,
  h4: 11.5,
  body: 10.5,
  sender: 11.5,
  code: 9,
  meta: 8.5,
  label: 8.5,
  footer: 9,
} as const;

const BODY_LINE_FACTOR = 1.45;
const CODE_LINE_FACTOR = 1.4;
/** Baseline offset from the top of a line box, as a fraction of font size. */
const ASCENT_FACTOR = 1.0;

const LIST_INDENT = 16;
const INSET_RULE_WIDTH = 2.25;
const INSET_TEXT_GAP = 10;
const CODE_PAD_X = 8;
const CODE_PAD_Y = 6;
const BLOCK_SPACING = 8;
const MESSAGE_SPACING = 16;

/** A vertical rule decoration applied per line (insets, blockquotes). */
interface RuleDecor {
  x: number;
  width: number;
  color: PdfColor;
}

/** A background slab behind one line (code blocks, unknown-block shading). */
interface BgDecor {
  x: number;
  width: number;
  color: PdfColor;
}

/** A text segment within a flow line; `x` is relative to the content left edge. */
interface Segment {
  x: number;
  text: string;
  face: PdfFontFace;
  size: number;
  color: PdfColor;
}

/** One line of flowed content, the unit pagination works with. */
interface FlowLine {
  segments: Segment[];
  /** Text line-box height (excludes pads). */
  height: number;
  /** Baseline offset from the top of the line box (after padTop). */
  ascent: number;
  spacingBefore: number;
  keepWithNext: boolean;
  padTop: number;
  padBottom: number;
  background?: BgDecor;
  rules: RuleDecor[];
}

/** Styled inline run before wrapping. `'\n'` never appears inside `text`. */
interface InlineRun {
  text: string;
  face: PdfFontFace;
  color: PdfColor;
  /** True to force a line break before this run. */
  breakBefore?: boolean;
  /** Per-run size override (e.g. the muted timestamp beside a sender label). */
  size?: number;
}

/** Everything a block needs to know about where and how it flows. */
interface FlowCtx {
  indent: number;
  color: PdfColor;
  rules: RuleDecor[];
  bg?: BgDecor;
}

/**
 * Lay out a prepared conversation. Render items are flowed in order,
 * verbatim; nothing is dropped (unknown blocks become labelled insets).
 */
export function layoutConversation(
  prepared: PreparedConversation,
  shaper: PdfTextShaper,
  setup: PdfPageSetup = A4_PAGE_SETUP,
): PdfLayout {
  const composer = new Composer(shaper, setup);
  for (const item of prepared.items) {
    composer.addItem(item);
  }
  return composer.paginate();
}

/** Builds the flow-line list from render items, then paginates it. */
class Composer {
  private readonly lines: FlowLine[] = [];
  private pendingSpacing = 0;
  private readonly contentWidth: number;

  constructor(
    private readonly shaper: PdfTextShaper,
    private readonly setup: PdfPageSetup,
  ) {
    this.contentWidth = setup.pageWidth - setup.marginLeft - setup.marginRight;
  }

  // ----- render items ------------------------------------------------------

  addItem(item: RenderItem): void {
    switch (item.kind) {
      case 'metadata': {
        const ctx = this.baseCtx();
        this.emitRuns(
          [{ text: item.title, face: 'bold', color: PDF_COLORS.ink }],
          TYPE.title,
          ctx,
          { keepWithNext: true },
        );
        this.spacing(6);
        this.emitTimestampLine('Created', item.createdAt, ctx);
        this.emitTimestampLine('Updated', item.updatedAt, ctx);
        this.spacing(8);
        this.emitRule(ctx, PDF_COLORS.accent, 1.5);
        this.spacing(14);
        break;
      }
      case 'branchStart': {
        const ctx = this.baseCtx();
        this.spacing(20);
        const runs: InlineRun[] = [
          {
            text: `Branch ${item.branchIndex + 1} of ${item.branchCount}`,
            face: 'bold',
            color: PDF_COLORS.accent,
          },
        ];
        if (item.isDefaultBranch) {
          runs.push({ text: '  — current branch', face: 'italic', color: PDF_COLORS.secondary });
        }
        this.emitRuns(runs, TYPE.h2, ctx, { keepWithNext: true });
        this.spacing(4);
        this.emitRule(ctx, PDF_COLORS.border, 0.75, { keepWithNext: true });
        this.spacing(10);
        break;
      }
      case 'message':
        this.addMessage(item);
        break;
      /* v8 ignore next 4 -- RenderItem is a closed union; guards future kinds */
      default:
        this.emitUnknownItem(item);
        break;
    }
  }

  private addMessage(item: MessageItem): void {
    const ctx = this.baseCtx();
    this.spacing(MESSAGE_SPACING);
    this.emitRule(ctx, PDF_COLORS.border, 0.75, { keepWithNext: true });
    this.spacing(6);
    const runs: InlineRun[] = [{ text: item.senderLabel, face: 'bold', color: PDF_COLORS.accent }];
    if (item.timestamp !== undefined) {
      runs.push({
        text: `   ${item.timestamp.display}`,
        face: 'regular',
        color: PDF_COLORS.secondary,
        size: TYPE.meta,
      });
    }
    this.emitRuns(runs, TYPE.sender, ctx, { keepWithNext: true });
    this.spacing(7);

    let first = true;
    for (const block of item.blocks) {
      if (!first) {
        this.spacing(BLOCK_SPACING);
      }
      first = false;
      this.addBlock(block);
    }
  }

  // ----- prepared blocks ----------------------------------------------------

  private addBlock(block: PreparedBlock): void {
    switch (block.kind) {
      case 'text':
        this.emitMarkdown(block.text, this.baseCtx());
        break;
      case 'thinking':
        this.addThinking(block);
        break;
      case 'toolUse':
        this.addToolUse(block);
        break;
      case 'toolResult':
        this.addToolResult(block);
        break;
      case 'artifact':
        this.addArtifact(block);
        break;
      case 'image': {
        const inset = this.insetCtx(PDF_COLORS.border);
        const name = block.fileName ?? 'inline image';
        const type = block.mediaType === undefined ? '' : ` (${block.mediaType})`;
        this.emitLabel(`Image — ${name}${type}`, PDF_COLORS.secondary, inset);
        break;
      }
      case 'attachment':
        this.addAttachment(block);
        break;
      case 'file': {
        const inset = this.insetCtx(PDF_COLORS.border);
        const kind = block.fileKind === undefined ? '' : ` (${block.fileKind})`;
        this.emitLabel(`File — ${block.fileName}${kind}`, PDF_COLORS.secondary, inset);
        break;
      }
      case 'unknown':
        this.addUnknown(block);
        break;
      /* v8 ignore next 4 -- PreparedBlock is a closed union; guards future kinds */
      default:
        this.emitUnknownItem(block);
        break;
    }
  }

  private addThinking(block: PreparedThinkingBlock): void {
    const inset = this.insetCtx(PDF_COLORS.accentTint);
    this.emitLabel('Thinking', PDF_COLORS.secondary, inset);
    for (const summary of block.summaries) {
      this.spacing(3);
      this.emitPlainText(summary, { ...inset, color: PDF_COLORS.secondary }, 'italic');
    }
    if (block.thinking.trim() !== '') {
      this.spacing(5);
      this.emitPlainText(block.thinking, { ...inset, color: PDF_COLORS.secondary }, 'regular');
    }
  }

  private addToolUse(block: PreparedToolUseBlock): void {
    const inset = this.insetCtx(PDF_COLORS.accentTint);
    this.emitLabel(`Tool call — ${block.name}`, PDF_COLORS.secondary, inset);
    this.spacing(4);
    this.emitCodeBlock(stringifyJson(block.input), inset);
  }

  private addToolResult(block: PreparedToolResultBlock): void {
    const failed = block.isError;
    const inset = this.insetCtx(failed ? PDF_COLORS.error : PDF_COLORS.accentTint);
    const name = block.name === undefined ? '' : ` — ${block.name}`;
    const suffix = failed ? ' (error)' : '';
    this.emitLabel(
      `Tool result${name}${suffix}`,
      failed ? PDF_COLORS.error : PDF_COLORS.secondary,
      inset,
    );
    this.spacing(4);
    this.emitCodeBlock(block.content, inset, failed ? PDF_COLORS.errorBg : PDF_COLORS.subtleBg);
  }

  private addArtifact(block: PreparedArtifactBlock): void {
    const inset = this.insetCtx(PDF_COLORS.accent);
    const title = block.title ?? block.id;
    const details: string[] = [block.command];
    if (block.language !== undefined) {
      details.push(block.language);
    }
    if (block.isFinal) {
      details.push('final version');
    }
    this.emitLabel(`Artifact — ${title} (${details.join(', ')})`, PDF_COLORS.accent, inset);
    this.spacing(4);
    this.emitCodeBlock(block.content, inset);
  }

  private addAttachment(block: PreparedAttachmentBlock): void {
    const inset = this.insetCtx(PDF_COLORS.border);
    const type = block.fileType === undefined ? '' : ` (${block.fileType})`;
    this.emitLabel(`Attachment — ${block.fileName}${type}`, PDF_COLORS.secondary, inset);
    if (block.extractedContent !== undefined && block.extractedContent !== '') {
      this.spacing(4);
      this.emitPlainText(
        block.extractedContent,
        { ...inset, color: PDF_COLORS.secondary },
        'regular',
      );
    }
  }

  private addUnknown(block: PreparedUnknownBlock): void {
    const ctx = this.baseCtx();
    const inset: FlowCtx = {
      ...ctx,
      indent: ctx.indent + INSET_TEXT_GAP,
      rules: [{ x: 0, width: INSET_RULE_WIDTH, color: PDF_COLORS.warn }],
      bg: { x: 0, width: this.contentWidth, color: PDF_COLORS.warnBg },
    };
    this.emitLabel(block.label, PDF_COLORS.warn, inset, { padTop: CODE_PAD_Y });
    this.spacing(4);
    const raw = stringifyJson(block.raw);
    this.emitCodeBlock(raw, inset, PDF_COLORS.warnBg, { color: PDF_COLORS.warn });
  }

  /** Runtime fallback for item/block kinds newer than this serializer. */
  private emitUnknownItem(value: { kind: string }): void {
    const inset = this.insetCtx(PDF_COLORS.warn);
    this.emitLabel(`Unsupported content (${value.kind})`, PDF_COLORS.warn, inset);
    this.spacing(4);
    this.emitCodeBlock(stringifyJson(value), inset, PDF_COLORS.warnBg);
  }

  // ----- markdown -----------------------------------------------------------

  private emitMarkdown(text: string, ctx: FlowCtx): void {
    const tokens = marked.lexer(text);
    this.walkTokens(tokens, ctx, TYPE.body);
  }

  private walkTokens(tokens: Token[], ctx: FlowCtx, size: number): void {
    let first = true;
    for (const token of tokens) {
      if (token.type === 'space') {
        continue;
      }
      if (!first) {
        this.spacing(BLOCK_SPACING);
      }
      first = false;
      this.walkToken(token, ctx, size);
    }
  }

  private walkToken(token: Token, ctx: FlowCtx, size: number): void {
    switch (token.type) {
      case 'heading': {
        const heading = token as Tokens.Heading;
        const level = Math.min(heading.depth, 4) as 1 | 2 | 3 | 4;
        const headingSize = { 1: TYPE.h1, 2: TYPE.h2, 3: TYPE.h3, 4: TYPE.h4 }[level];
        this.spacing(4);
        this.emitRuns(this.inlineRuns(heading.tokens, ctx.color, 'bold'), headingSize, ctx, {
          keepWithNext: true,
        });
        break;
      }
      case 'paragraph': {
        const paragraph = token as Tokens.Paragraph;
        this.emitRuns(this.inlineRuns(paragraph.tokens, ctx.color, 'regular'), size, ctx, {});
        break;
      }
      case 'text': {
        // Loose/tight list item bodies surface as top-level `text` tokens.
        const text = token as Tokens.Text;
        const runs =
          text.tokens === undefined
            ? [{ text: decodeEntities(text.text), face: 'regular' as const, color: ctx.color }]
            : this.inlineRuns(text.tokens, ctx.color, 'regular');
        this.emitRuns(runs, size, ctx, {});
        break;
      }
      case 'code': {
        const code = token as Tokens.Code;
        this.emitCodeBlock(code.text, ctx);
        break;
      }
      case 'blockquote': {
        const quote = token as Tokens.Blockquote;
        const quoted: FlowCtx = {
          ...ctx,
          indent: ctx.indent + INSET_TEXT_GAP,
          color: PDF_COLORS.secondary,
          rules: [
            ...ctx.rules,
            { x: ctx.indent, width: INSET_RULE_WIDTH, color: PDF_COLORS.border },
          ],
        };
        this.walkTokens(quote.tokens, quoted, size);
        break;
      }
      case 'list': {
        const list = token as Tokens.List;
        const start = typeof list.start === 'number' ? list.start : 1;
        list.items.forEach((item, index) => {
          if (index > 0) {
            this.spacing(3);
          }
          this.emitListItem(item, ctx, size, list.ordered ? `${start + index}.` : '•');
        });
        break;
      }
      case 'hr':
        this.emitRule(ctx, PDF_COLORS.border, 0.75);
        break;
      case 'table': {
        this.emitTable(token as Tokens.Table, ctx);
        break;
      }
      case 'html': {
        // Raw HTML has no PDF rendering; show it verbatim in monospace.
        this.emitPlainText((token as Tokens.HTML).raw.trimEnd(), ctx, 'mono');
        break;
      }
      default:
        // Unknown markdown constructs are never dropped: render raw source.
        this.emitPlainText(token.raw, ctx, 'regular');
        break;
    }
  }

  private emitListItem(item: Tokens.ListItem, ctx: FlowCtx, size: number, marker: string): void {
    const checkbox = item.task === true ? (item.checked === true ? '[x] ' : '[ ] ') : '';
    const markerText = this.shaper.sanitize(marker, 'regular');
    const markerWidth = this.shaper.measure(markerText, 'regular', size);
    const bodyIndent = ctx.indent + Math.max(LIST_INDENT, markerWidth + 5);
    const bodyCtx: FlowCtx = { ...ctx, indent: bodyIndent };

    const before = this.lines.length;
    this.walkTokens(item.tokens, bodyCtx, size);
    const firstLine = this.lines[before];
    if (firstLine === undefined) {
      // Empty list item: emit the marker on its own line.
      this.emitRuns([{ text: marker, face: 'regular', color: ctx.color }], size, ctx, {});
      return;
    }
    firstLine.segments.unshift({
      x: ctx.indent,
      text: markerText,
      face: 'regular',
      size,
      color: ctx.color,
    });
    if (checkbox !== '') {
      const boxText = this.shaper.sanitize(checkbox, 'regular');
      const shift = this.shaper.measure(boxText, 'regular', size);
      for (const segment of firstLine.segments) {
        if (segment.x >= bodyIndent) {
          segment.x += shift;
        }
      }
      firstLine.segments.splice(1, 0, {
        x: bodyIndent,
        text: boxText,
        face: 'regular',
        size,
        color: ctx.color,
      });
    }
  }

  private emitTable(table: Tokens.Table, ctx: FlowCtx): void {
    // v1 table fallback: one monospace line per row, cells pipe-separated —
    // simple, lossless, and it wraps rather than clipping.
    const rowText = (cells: Tokens.TableCell[]): string =>
      cells.map((cell) => decodeEntities(cell.text)).join(' | ');
    this.emitPlainText(rowText(table.header), ctx, 'mono');
    this.emitRule(ctx, PDF_COLORS.border, 0.75);
    for (const row of table.rows) {
      this.spacing(2);
      this.emitPlainText(rowText(row), ctx, 'mono');
    }
  }

  /** Flatten marked inline tokens into styled runs (with forced breaks). */
  private inlineRuns(tokens: Token[], color: PdfColor, face: PdfFontFace): InlineRun[] {
    const runs: InlineRun[] = [];
    const push = (text: string, runFace: PdfFontFace, runColor: PdfColor): void => {
      const parts = text.split('\n');
      parts.forEach((part, index) => {
        runs.push({ text: part, face: runFace, color: runColor, breakBefore: index > 0 });
      });
    };
    const visit = (token: Token, currentFace: PdfFontFace, currentColor: PdfColor): void => {
      switch (token.type) {
        case 'strong':
          for (const child of (token as Tokens.Strong).tokens) {
            visit(child, 'bold', currentColor);
          }
          break;
        case 'em':
          for (const child of (token as Tokens.Em).tokens) {
            // No bold-italic face is bundled; bold wins when nested.
            visit(child, currentFace === 'bold' ? 'bold' : 'italic', currentColor);
          }
          break;
        case 'codespan':
          push(decodeEntities((token as Tokens.Codespan).text), 'mono', currentColor);
          break;
        case 'link':
          for (const child of (token as Tokens.Link).tokens) {
            visit(child, currentFace, PDF_COLORS.accent);
          }
          break;
        case 'del':
          for (const child of (token as Tokens.Del).tokens) {
            visit(child, currentFace, currentColor);
          }
          break;
        case 'br':
          runs.push({ text: '', face: currentFace, color: currentColor, breakBefore: true });
          break;
        case 'html':
          // Inline HTML has no PDF rendering; show the source in monospace.
          push((token as Tokens.HTML).raw, 'mono', currentColor);
          break;
        case 'image':
          push(`[image: ${(token as Tokens.Image).text}]`, 'italic', PDF_COLORS.secondary);
          break;
        case 'escape':
          push(decodeEntities((token as Tokens.Escape).text), currentFace, currentColor);
          break;
        case 'text': {
          const text = token as Tokens.Text;
          if (text.tokens !== undefined && text.tokens.length > 0) {
            for (const child of text.tokens) {
              visit(child, currentFace, currentColor);
            }
          } else {
            push(decodeEntities(text.text), currentFace, currentColor);
          }
          break;
        }
        default:
          // Unknown inline constructs render their raw source, never dropped.
          push(token.raw, currentFace, currentColor);
          break;
      }
    };
    for (const token of tokens) {
      visit(token, face, color);
    }
    return runs;
  }

  // ----- flow primitives ----------------------------------------------------

  private baseCtx(): FlowCtx {
    return { indent: 0, color: PDF_COLORS.ink, rules: [] };
  }

  /** A labelled-inset context: left rule + indented content. */
  private insetCtx(ruleColor: PdfColor): FlowCtx {
    const base = this.baseCtx();
    return {
      ...base,
      indent: base.indent + INSET_TEXT_GAP,
      rules: [{ x: 0, width: INSET_RULE_WIDTH, color: ruleColor }],
    };
  }

  private spacing(points: number): void {
    this.pendingSpacing = Math.max(this.pendingSpacing, points);
  }

  private emitTimestampLine(
    label: string,
    timestamp: ResolvedTimestamp | undefined,
    ctx: FlowCtx,
  ): void {
    if (timestamp === undefined) {
      return;
    }
    this.spacing(2);
    this.emitRuns(
      [{ text: `${label} ${timestamp.display}`, face: 'regular', color: PDF_COLORS.secondary }],
      TYPE.meta,
      ctx,
      {},
    );
  }

  private emitLabel(
    text: string,
    color: PdfColor,
    ctx: FlowCtx,
    options: { padTop?: number } = {},
  ): void {
    this.emitRuns([{ text, face: 'bold', color }], TYPE.label, ctx, {
      keepWithNext: true,
      padTop: options.padTop,
    });
  }

  /** Plain (non-markdown) text: newlines preserved, long lines wrapped. */
  private emitPlainText(text: string, ctx: FlowCtx, face: PdfFontFace): void {
    const runs: InlineRun[] = [];
    text.split('\n').forEach((line, index) => {
      runs.push({ text: line, face, color: ctx.color, breakBefore: index > 0 });
    });
    this.emitRuns(runs, TYPE.body, ctx, {});
  }

  /** A code block: monospace, line-exact, shaded slab, char-wrap fallback. */
  private emitCodeBlock(
    text: string,
    ctx: FlowCtx,
    bgColor: PdfColor = PDF_COLORS.subtleBg,
    options: { color?: PdfColor } = {},
  ): void {
    const codeCtx: FlowCtx = {
      ...ctx,
      indent: ctx.indent + CODE_PAD_X,
      color: options.color ?? PDF_COLORS.ink,
      bg: { x: ctx.indent, width: this.contentWidth - ctx.indent, color: bgColor },
    };
    const sourceLines = text.replace(/\r\n?/g, '\n').split('\n');
    const before = this.lines.length;
    for (const line of sourceLines) {
      const runs: InlineRun[] = [{ text: line, face: 'mono', color: codeCtx.color }];
      this.emitRuns(runs, TYPE.code, codeCtx, {
        lineFactor: CODE_LINE_FACTOR,
        preserveWhitespace: true,
        rightPad: CODE_PAD_X,
      });
    }
    const first = this.lines[before];
    const last = this.lines[this.lines.length - 1];
    if (first !== undefined && last !== undefined && this.lines.length > before) {
      first.padTop += CODE_PAD_Y;
      last.padBottom += CODE_PAD_Y;
    }
  }

  private emitRule(
    ctx: FlowCtx,
    color: PdfColor,
    height: number,
    options: { keepWithNext?: boolean } = {},
  ): void {
    this.pushLine({
      segments: [],
      height,
      ascent: height,
      spacingBefore: 0,
      keepWithNext: options.keepWithNext === true,
      padTop: 0,
      padBottom: 0,
      background: { x: ctx.indent, width: this.contentWidth - ctx.indent, color },
      rules: [...ctx.rules],
    });
  }

  /**
   * Word-wrap styled runs into flow lines. The workhorse: sanitizes each run,
   * measures with the injected shaper, breaks on whitespace, falls back to
   * character-level breaking for unbroken strings wider than the line.
   */
  private emitRuns(
    runs: InlineRun[],
    size: number,
    ctx: FlowCtx,
    options: {
      keepWithNext?: boolean;
      lineFactor?: number;
      preserveWhitespace?: boolean;
      padTop?: number;
      rightPad?: number;
    },
  ): void {
    const lineFactor = options.lineFactor ?? BODY_LINE_FACTOR;
    const maxWidth = Math.max(size, this.contentWidth - ctx.indent - (options.rightPad ?? 0));
    const height = size * lineFactor;
    const ascent = size * ASCENT_FACTOR;

    let segments: Segment[] = [];
    let cursor = 0;
    let emitted = 0;

    const flush = (): void => {
      this.pushLine({
        segments,
        height,
        ascent,
        spacingBefore: 0, // pushLine assigns the pending spacing to the first line
        keepWithNext: options.keepWithNext === true,
        padTop: emitted === 0 ? (options.padTop ?? 0) : 0,
        padBottom: 0,
        background: ctx.bg === undefined ? undefined : { ...ctx.bg },
        rules: [...ctx.rules],
      });
      emitted += 1;
      segments = [];
      cursor = 0;
    };

    const append = (
      text: string,
      face: PdfFontFace,
      color: PdfColor,
      width: number,
      runSize: number,
    ): void => {
      // Chunks are appended contiguously (cursor only advances here), so
      // adjacent same-styled segments can always be merged.
      const lastSegment = segments[segments.length - 1];
      if (
        lastSegment !== undefined &&
        lastSegment.face === face &&
        lastSegment.color === color &&
        lastSegment.size === runSize
      ) {
        lastSegment.text += text;
      } else {
        segments.push({ x: ctx.indent + cursor, text, face, size: runSize, color });
      }
      cursor += width;
    };

    for (const run of runs) {
      if (run.breakBefore === true) {
        flush();
      }
      const runSize = run.size ?? size;
      const sanitized = this.shaper.sanitize(run.text, run.face);
      const chunks = sanitized.match(/\s+|\S+/g) ?? [];
      for (const chunk of chunks) {
        const isSpace = /^\s+$/.test(chunk);
        const width = this.shaper.measure(chunk, run.face, runSize);
        if (isSpace) {
          if (cursor === 0 && !(options.preserveWhitespace === true)) {
            continue; // drop leading whitespace on (wrapped) lines
          }
          if (cursor + width > maxWidth && !(options.preserveWhitespace === true)) {
            flush();
            continue;
          }
          append(chunk, run.face, run.color, width, runSize);
          continue;
        }
        if (cursor + width <= maxWidth || cursor === 0) {
          if (width > maxWidth) {
            this.appendCharWrapped(chunk, run, runSize, maxWidth, append, flush, () => cursor);
            continue;
          }
          append(chunk, run.face, run.color, width, runSize);
          continue;
        }
        flush();
        if (width > maxWidth) {
          this.appendCharWrapped(chunk, run, runSize, maxWidth, append, flush, () => cursor);
        } else {
          append(chunk, run.face, run.color, width, runSize);
        }
      }
    }
    flush(); // always emit at least one line (preserves blank lines)
  }

  /** Character-level fallback for unbroken strings wider than the line. */
  private appendCharWrapped(
    chunk: string,
    run: InlineRun,
    runSize: number,
    maxWidth: number,
    append: (text: string, face: PdfFontFace, color: PdfColor, width: number, size: number) => void,
    flush: () => void,
    cursorNow: () => number,
  ): void {
    let piece = '';
    let pieceWidth = 0;
    for (const char of chunk) {
      const charWidth = this.shaper.measure(char, run.face, runSize);
      if (cursorNow() + pieceWidth + charWidth > maxWidth && piece !== '') {
        append(piece, run.face, run.color, pieceWidth, runSize);
        flush();
        piece = '';
        pieceWidth = 0;
      }
      piece += char;
      pieceWidth += charWidth;
    }
    if (piece !== '') {
      append(piece, run.face, run.color, pieceWidth, runSize);
    }
  }

  /** Append a flow line, assigning (and consuming) any pending spacing. */
  private pushLine(line: FlowLine): void {
    line.spacingBefore = this.pendingSpacing;
    this.pendingSpacing = 0;
    this.lines.push(line);
  }

  // ----- pagination ---------------------------------------------------------

  paginate(): PdfLayout {
    const { setup } = this;
    const contentHeight = setup.pageHeight - setup.marginTop - setup.marginBottom;
    const pages: PdfLaidOutPage[] = [{ rects: [], texts: [] }];
    let cursor = 0;

    const boxHeight = (line: FlowLine): number => line.padTop + line.height + line.padBottom;

    /** Height of `line` plus everything chained to it via keepWithNext. */
    const chainHeight = (start: number): number => {
      let total = 0;
      let index = start;
      while (index < this.lines.length) {
        const line = this.lines[index];
        /* v8 ignore next 3 -- index is bounded by the while condition */
        if (line === undefined) {
          break;
        }
        if (index > start) {
          total += line.spacingBefore;
        }
        total += boxHeight(line);
        if (!line.keepWithNext || total > contentHeight) {
          break;
        }
        index += 1;
      }
      return total;
    };

    this.lines.forEach((line, index) => {
      const spacing = cursor === 0 ? 0 : line.spacingBefore;
      const needed = spacing + boxHeight(line);
      const keepNeeded = spacing + chainHeight(index);
      if (
        cursor > 0 &&
        cursor + Math.min(Math.max(needed, keepNeeded), contentHeight) > contentHeight
      ) {
        pages.push({ rects: [], texts: [] });
        cursor = 0;
      }
      const top = setup.marginTop + cursor + (cursor === 0 ? 0 : spacing);
      const page = pages[pages.length - 1];
      /* v8 ignore next 3 -- pages is never empty */
      if (page === undefined) {
        return;
      }
      const slabHeight = boxHeight(line);
      if (line.background !== undefined) {
        page.rects.push({
          x: setup.marginLeft + line.background.x,
          y: top,
          width: line.background.width,
          height: slabHeight,
          color: line.background.color,
        });
      }
      for (const rule of line.rules) {
        page.rects.push({
          x: setup.marginLeft + rule.x,
          y: top,
          width: rule.width,
          height: slabHeight,
          color: rule.color,
        });
      }
      for (const segment of line.segments) {
        /* v8 ignore next 3 -- defensive: empty segments are never created */
        if (segment.text === '') {
          continue;
        }
        page.texts.push({
          x: setup.marginLeft + segment.x,
          baseline: top + line.padTop + line.ascent,
          text: segment.text,
          face: segment.face,
          size: segment.size,
          color: segment.color,
        });
      }
      cursor += (cursor === 0 ? 0 : spacing) + slabHeight;
    });

    this.addPageNumbers(pages);
    return { setup, pages };
  }

  private addPageNumbers(pages: PdfLaidOutPage[]): void {
    const { setup } = this;
    pages.forEach((page, index) => {
      const text = this.shaper.sanitize(`Page ${index + 1} of ${pages.length}`, 'regular');
      const width = this.shaper.measure(text, 'regular', TYPE.footer);
      page.texts.push({
        x: (setup.pageWidth - width) / 2,
        baseline: setup.pageHeight - setup.marginBottom + 12 + TYPE.footer,
        text,
        face: 'regular',
        size: TYPE.footer,
        color: PDF_COLORS.secondary,
      });
    });
  }
}

/** Stable JSON for tool inputs / raw unknown blocks (never throws). */
function stringifyJson(value: unknown): string {
  if (value === undefined) {
    return 'undefined';
  }
  try {
    return JSON.stringify(value, null, 2) ?? String(value);
  } catch {
    return String(value);
  }
}

/** Undo the HTML entity escaping marked's lexer applies to inline text. */
function decodeEntities(text: string): string {
  return text.replace(/&(amp|lt|gt|quot|#39);/g, (match) => {
    switch (match) {
      case '&amp;':
        return '&';
      case '&lt;':
        return '<';
      case '&gt;':
        return '>';
      case '&quot;':
        return '"';
      default:
        return "'";
    }
  });
}
