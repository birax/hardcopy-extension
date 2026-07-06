/**
 * Document-level styling for the DOCX serializer: colors and fonts from the
 * Hardcopy design system (docs/design/design-system.md), the named paragraph
 * and character styles every builder function references, and the numbering
 * configuration for Markdown lists.
 *
 * Word has no system font stacks, so the design system's "system-ui" intent
 * maps to Calibri (the Office default; new Word versions substitute Aptos
 * automatically) and its mono stack to Consolas.
 */

import { AlignmentType, BorderStyle, LevelFormat, ShadingType } from 'docx';
import type { ILevelsOptions, INumberingOptions, IStylesOptions } from 'docx';

/** Design-system palette (light theme), as Word hex values without `#`. */
export const DOCX_COLORS = Object.freeze({
  /** `--hc-text` — primary ink. */
  text: '17252B',
  /** `--hc-text-secondary` — timestamps, labels, captions. */
  muted: '42555C',
  /** `--hc-accent` — sender headings and hyperlinks. */
  accent: '0A5B55',
  /** `--hc-accent-tint` — decorative only (blockquote bar). */
  accentTint: '9BD4CC',
  /** `--hc-bg-subtle` — code shading. */
  subtleBg: 'F2F7F6',
  /** `--hc-border` — hairlines around code and tables. */
  border: 'C6D4D2',
  /** `--hc-error` — failed tool results. */
  error: 'B42237',
});

/** Fonts: Calibri/Aptos-safe body, Consolas for code. */
export const DOCX_FONTS = Object.freeze({
  body: 'Calibri',
  mono: 'Consolas',
});

/** The style ids the builder attaches to paragraphs and runs. */
export const DOCX_STYLE = Object.freeze({
  /** Accent-colored per-message speaker heading. */
  senderHeading: 'SenderHeading',
  /** Muted small style for timestamps and the page header/footer. */
  timestamp: 'Timestamp',
  /** Monospace, shaded, thin-bordered block of preformatted text. */
  codeBlock: 'CodeBlock',
  /** Monospace shaded inline code (character style). */
  codeInline: 'CodeInline',
  /** Indented, tint-barred Markdown blockquote. */
  blockquote: 'Blockquote',
  /** Small-caps muted label above thinking/tool/artifact/attachment sections. */
  blockLabel: 'BlockLabel',
  /** The label variant for failed tool results (error color). */
  blockLabelError: 'BlockLabelError',
  /** Inset italic muted style for extended-thinking content. */
  thinking: 'Thinking',
});

/** Numbering references for Markdown lists (see {@link createDocxNumbering}). */
export const DOCX_NUMBERING = Object.freeze({
  bullet: 'hc-bullet',
  ordered: 'hc-ordered',
  /** Deepest configured list level; deeper nesting clamps to this. */
  maxLevel: 3,
});

const CODE_BORDER = {
  style: BorderStyle.SINGLE,
  size: 4, // eighths of a point — a hairline
  color: DOCX_COLORS.border,
  space: 4, // points between border and text
} as const;

/**
 * Build the document's style sheet: design-system defaults for body text,
 * Title, and Heading1–4, plus the custom styles in {@link DOCX_STYLE}.
 */
export function createDocxStyles(): IStylesOptions {
  return {
    default: {
      document: {
        run: { font: DOCX_FONTS.body, size: 22, color: DOCX_COLORS.text },
        paragraph: { spacing: { after: 160, line: 276 } },
      },
      title: {
        run: { font: DOCX_FONTS.body, size: 52, bold: true, color: DOCX_COLORS.text },
        paragraph: { spacing: { after: 120 } },
      },
      heading1: {
        run: { font: DOCX_FONTS.body, size: 32, bold: true, color: DOCX_COLORS.text },
        paragraph: { spacing: { before: 360, after: 120 }, keepNext: true },
      },
      heading2: {
        run: { font: DOCX_FONTS.body, size: 28, bold: true, color: DOCX_COLORS.text },
        paragraph: { spacing: { before: 280, after: 100 }, keepNext: true },
      },
      heading3: {
        run: { font: DOCX_FONTS.body, size: 26, bold: true, color: DOCX_COLORS.text },
        paragraph: { spacing: { before: 240, after: 80 }, keepNext: true },
      },
      heading4: {
        run: { font: DOCX_FONTS.body, size: 24, bold: true, color: DOCX_COLORS.text },
        paragraph: { spacing: { before: 200, after: 80 }, keepNext: true },
      },
      hyperlink: {
        run: { color: DOCX_COLORS.accent, underline: {} },
      },
    },
    paragraphStyles: [
      {
        id: DOCX_STYLE.senderHeading,
        name: 'Sender heading',
        basedOn: 'Normal',
        next: 'Normal',
        quickFormat: true,
        run: { bold: true, size: 26, color: DOCX_COLORS.accent },
        paragraph: { spacing: { before: 360, after: 100 }, keepNext: true, outlineLevel: 1 },
      },
      {
        id: DOCX_STYLE.timestamp,
        name: 'Timestamp',
        basedOn: 'Normal',
        next: 'Normal',
        run: { size: 18, color: DOCX_COLORS.muted },
        paragraph: { spacing: { before: 0, after: 120 } },
      },
      {
        id: DOCX_STYLE.codeBlock,
        name: 'Code block',
        basedOn: 'Normal',
        next: 'Normal',
        quickFormat: true,
        run: { font: DOCX_FONTS.mono, size: 20, color: DOCX_COLORS.text },
        paragraph: {
          shading: { type: ShadingType.CLEAR, fill: DOCX_COLORS.subtleBg },
          border: { top: CODE_BORDER, bottom: CODE_BORDER, left: CODE_BORDER, right: CODE_BORDER },
          spacing: { before: 120, after: 160, line: 240 },
        },
      },
      {
        id: DOCX_STYLE.blockquote,
        name: 'Block quote',
        basedOn: 'Normal',
        next: 'Normal',
        run: { color: DOCX_COLORS.muted },
        paragraph: {
          indent: { left: 480 },
          border: {
            left: {
              style: BorderStyle.SINGLE,
              size: 18,
              color: DOCX_COLORS.accentTint,
              space: 8,
            },
          },
          spacing: { after: 160 },
        },
      },
      {
        id: DOCX_STYLE.blockLabel,
        name: 'Block label',
        basedOn: 'Normal',
        next: 'Normal',
        run: { bold: true, size: 18, color: DOCX_COLORS.muted, allCaps: true },
        paragraph: { spacing: { before: 240, after: 40 }, keepNext: true },
      },
      {
        id: DOCX_STYLE.blockLabelError,
        name: 'Block label (error)',
        basedOn: DOCX_STYLE.blockLabel,
        next: 'Normal',
        run: { bold: true, size: 18, color: DOCX_COLORS.error, allCaps: true },
        paragraph: { spacing: { before: 240, after: 40 }, keepNext: true },
      },
      {
        id: DOCX_STYLE.thinking,
        name: 'Thinking',
        basedOn: 'Normal',
        next: 'Normal',
        run: { italics: true, color: DOCX_COLORS.muted },
        paragraph: { indent: { left: 360 }, spacing: { after: 120 } },
      },
    ],
    characterStyles: [
      {
        id: DOCX_STYLE.codeInline,
        name: 'Code inline',
        basedOn: 'DefaultParagraphFont',
        run: {
          font: DOCX_FONTS.mono,
          size: 20,
          shading: { type: ShadingType.CLEAR, fill: DOCX_COLORS.subtleBg },
        },
      },
    ],
  };
}

/** Glyph/number format per nesting level ({@link DOCX_NUMBERING.maxLevel} + 1 entries). */
const LIST_LEVELS = [
  { orderedFormat: LevelFormat.DECIMAL, bulletGlyph: '•' },
  { orderedFormat: LevelFormat.LOWER_LETTER, bulletGlyph: '◦' },
  { orderedFormat: LevelFormat.LOWER_ROMAN, bulletGlyph: '▪' },
  { orderedFormat: LevelFormat.DECIMAL, bulletGlyph: '▪' },
] as const;

function listLevels(kind: 'bullet' | 'ordered'): ILevelsOptions[] {
  return LIST_LEVELS.map((spec, level) => ({
    level,
    format: kind === 'bullet' ? LevelFormat.BULLET : spec.orderedFormat,
    text: kind === 'bullet' ? spec.bulletGlyph : `%${level + 1}.`,
    alignment: AlignmentType.START,
    style: {
      paragraph: {
        indent: { left: 720 * (level + 1), hanging: 360 },
      },
    },
  }));
}

/**
 * Numbering config for Markdown lists: one bullet reference and one ordered
 * reference, four levels deep. Each distinct ordered list gets its own
 * concrete numbering instance so numbering restarts per list.
 */
export function createDocxNumbering(): INumberingOptions {
  return {
    config: [
      { reference: DOCX_NUMBERING.bullet, levels: listLevels('bullet') },
      { reference: DOCX_NUMBERING.ordered, levels: listLevels('ordered') },
    ],
  };
}
