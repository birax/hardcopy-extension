/**
 * Word (.docx) serializer (issue #11): render a {@link PreparedConversation}
 * into a Word document with the `docx` package.
 *
 * Serializers render prepared items verbatim, in order — option semantics
 * were already applied by `prepareConversation`, and unknown blocks always
 * render visibly (never dropped). Text blocks are tokenized with
 * `marked.lexer()` so the document carries real Word structure (headings,
 * lists, tables, hyperlinks) instead of raw Markdown syntax.
 *
 * Security (threat model T1): conversation-derived strings only ever enter
 * the document as `TextRun` text — the docx library performs all XML
 * escaping, and we never hand-build XML from content. See
 * `./docx/markdown.ts` for control-character sanitisation and the hyperlink
 * scheme allow-list.
 *
 * Packing uses `Packer.toArrayBuffer`, which is backed by JSZip's
 * platform-neutral ArrayBuffer output — no Node-only globals on the shipped
 * path, so the same code runs in unit tests and the browser bundle. Callers
 * lazy-load this module (`import('./serializers/docx')`) so the `docx`
 * bundle cost is only paid when a Word export runs.
 */

import {
  AlignmentType,
  Document,
  Footer,
  Header,
  HeadingLevel,
  PageNumber,
  Packer,
  Paragraph,
  TextRun,
} from 'docx';

import type {
  BranchStartItem,
  MessageItem,
  MetadataItem,
  PreparedBlock,
  PreparedConversation,
} from '../prepare';
import { codeParagraph, createRenderContext, markdownToDocx, sanitizeText } from './docx/markdown';
import type { DocxBlockChild, DocxRenderContext } from './docx/markdown';
import { createDocxNumbering, createDocxStyles, DOCX_COLORS, DOCX_STYLE } from './docx/styles';

export { DOCX_COLORS, DOCX_FONTS, DOCX_NUMBERING, DOCX_STYLE } from './docx/styles';
export type { DocxBlockChild } from './docx/markdown';

/** Single-line sanitized text (control characters out, newlines to spaces). */
function line(text: string): string {
  return sanitizeText(text).replace(/\r?\n/g, ' ');
}

/** The small-caps label paragraph that opens a thinking/tool/etc. section. */
function labelParagraph(text: string, options?: { error?: boolean }): Paragraph {
  return new Paragraph({
    style: options?.error === true ? DOCX_STYLE.blockLabelError : DOCX_STYLE.blockLabel,
    children: [new TextRun({ text: line(text) })],
  });
}

/** A muted italic placeholder paragraph (images, file references). */
function placeholderParagraph(text: string): Paragraph {
  return new Paragraph({
    children: [new TextRun({ text: line(text), italics: true, color: DOCX_COLORS.muted })],
  });
}

/** Multi-line plain text in a given paragraph style, one paragraph per line. */
function styledLines(text: string, style: string): Paragraph[] {
  return text
    .replace(/\r\n/g, '\n')
    .split('\n')
    .map(
      (textLine) =>
        new Paragraph({ style, children: [new TextRun({ text: sanitizeText(textLine) })] }),
    );
}

/** JSON-serialize an arbitrary value for display in a code block. */
function jsonText(value: unknown): string {
  return JSON.stringify(value, null, 2) ?? String(value);
}

/** The conversation-metadata header: Title paragraph plus muted dates. */
function renderMetadata(item: MetadataItem): DocxBlockChild[] {
  const children: DocxBlockChild[] = [
    new Paragraph({
      heading: HeadingLevel.TITLE,
      children: [new TextRun({ text: line(item.title) })],
    }),
  ];
  const dates: string[] = [];
  if (item.createdAt !== undefined) {
    dates.push(`Created ${item.createdAt.display}`);
  }
  if (item.updatedAt !== undefined) {
    dates.push(`Updated ${item.updatedAt.display}`);
  }
  if (dates.length > 0) {
    children.push(
      new Paragraph({
        style: DOCX_STYLE.timestamp,
        children: [new TextRun({ text: line(dates.join(' · ')) })],
      }),
    );
  }
  return children;
}

/** The heading-like divider that opens one branch under `branches: 'all'`. */
function renderBranchStart(item: BranchStartItem): DocxBlockChild[] {
  const label = `Branch ${item.branchIndex + 1} of ${item.branchCount}${
    item.isDefaultBranch ? ' (current branch)' : ''
  }`;
  return [
    new Paragraph({ heading: HeadingLevel.HEADING_1, children: [new TextRun({ text: label })] }),
  ];
}

/** Render one prepared block verbatim; every kind renders something. */
function renderBlock(block: PreparedBlock, context: DocxRenderContext): DocxBlockChild[] {
  switch (block.kind) {
    case 'text':
      return markdownToDocx(block.text, context);

    case 'thinking':
      return [
        labelParagraph('Thinking'),
        ...block.summaries.map(
          (summary) =>
            new Paragraph({
              style: DOCX_STYLE.thinking,
              children: [new TextRun({ text: line(summary), bold: true })],
            }),
        ),
        ...styledLines(block.thinking, DOCX_STYLE.thinking),
      ];

    case 'toolUse':
      return [labelParagraph(`Tool use: ${block.name}`), codeParagraph(jsonText(block.input))];

    case 'toolResult':
      return [
        labelParagraph(
          `Tool result${block.name === undefined ? '' : `: ${block.name}`}${
            block.isError ? ' (error)' : ''
          }`,
          { error: block.isError },
        ),
        codeParagraph(block.content),
      ];

    case 'artifact': {
      const qualifiers = [
        block.command,
        block.language,
        block.isFinal ? 'final version' : undefined,
      ]
        .filter((part): part is string => part !== undefined)
        .join(' · ');
      return [
        labelParagraph(`Artifact: ${block.title ?? block.id} (${qualifiers})`),
        codeParagraph(block.content),
      ];
    }

    case 'image': {
      const detail = [block.fileName, block.mediaType]
        .filter((part): part is string => part !== undefined)
        .join(', ');
      return [
        placeholderParagraph(
          `[Image${detail === '' ? '' : `: ${detail}`} — not embedded in this export]`,
        ),
      ];
    }

    case 'attachment':
      return [
        labelParagraph(
          `Attachment: ${block.fileName}${block.fileType === undefined ? '' : ` (${block.fileType})`}`,
        ),
        block.extractedContent === undefined
          ? placeholderParagraph('No extracted content.')
          : codeParagraph(block.extractedContent),
      ];

    case 'file':
      return [
        placeholderParagraph(
          `Attached file: ${block.fileName}${block.fileKind === undefined ? '' : ` (${block.fileKind})`}`,
        ),
      ];

    case 'unknown':
      return [labelParagraph(block.label), codeParagraph(jsonText(block.raw))];
  }
}

/** One message turn: accent sender heading, optional timestamp, blocks. */
function renderMessage(item: MessageItem, context: DocxRenderContext): DocxBlockChild[] {
  const children: DocxBlockChild[] = [
    new Paragraph({
      style: DOCX_STYLE.senderHeading,
      children: [new TextRun({ text: line(item.senderLabel) })],
    }),
  ];
  if (item.timestamp !== undefined) {
    children.push(
      new Paragraph({
        style: DOCX_STYLE.timestamp,
        children: [new TextRun({ text: line(item.timestamp.display) })],
      }),
    );
  }
  for (const block of item.blocks) {
    children.push(...renderBlock(block, context));
  }
  return children;
}

/**
 * Build the document body: every prepared item rendered verbatim, in order.
 * Exposed for structural unit tests; {@link buildDocxDocument} wraps it.
 */
export function buildDocxChildren(prepared: PreparedConversation): DocxBlockChild[] {
  const context = createRenderContext();
  return prepared.items.flatMap((item) => {
    switch (item.kind) {
      case 'metadata':
        return renderMetadata(item);
      case 'branchStart':
        return renderBranchStart(item);
      case 'message':
        return renderMessage(item, context);
    }
  });
}

/**
 * Build the complete Word document for a prepared conversation: design-system
 * styles, a page header carrying the conversation title, a footer with
 * `Page X of Y`, and the rendered body. Pure — no I/O, no browser APIs.
 */
export function buildDocxDocument(prepared: PreparedConversation): Document {
  return new Document({
    title: prepared.title,
    creator: 'Hardcopy',
    styles: createDocxStyles(),
    numbering: createDocxNumbering(),
    sections: [
      {
        headers: {
          default: new Header({
            children: [
              new Paragraph({
                style: DOCX_STYLE.timestamp,
                alignment: AlignmentType.RIGHT,
                children: [new TextRun({ text: line(prepared.title) })],
              }),
            ],
          }),
        },
        footers: {
          default: new Footer({
            children: [
              new Paragraph({
                style: DOCX_STYLE.timestamp,
                alignment: AlignmentType.CENTER,
                children: [
                  new TextRun({
                    children: ['Page ', PageNumber.CURRENT, ' of ', PageNumber.TOTAL_PAGES],
                  }),
                ],
              }),
            ],
          }),
        },
        children: buildDocxChildren(prepared),
      },
    ],
  });
}

/**
 * Serialize a prepared conversation to .docx bytes. Uses the packer's
 * ArrayBuffer output, which works identically in Node tests and the browser.
 */
export async function serializeDocx(prepared: PreparedConversation): Promise<Uint8Array> {
  const buffer = await Packer.toArrayBuffer(buildDocxDocument(prepared));
  return new Uint8Array(buffer);
}
