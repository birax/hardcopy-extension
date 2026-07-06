/**
 * DOCX serializer tests (issue #11): structural unit tests on the builder,
 * pack smoke tests per fixture, and the T1 XML-injection test.
 *
 * Structural assertions unzip the packed .docx (a plain zip) with a minimal
 * store/deflate reader and inspect the OOXML parts as text — no extra test
 * dependencies, and it exercises the exact bytes a user's Word would read.
 */

import { inflateRawSync } from 'node:zlib';

import { Document, Paragraph, Table } from 'docx';
import { describe, expect, it } from 'vitest';

import { resolveExportOptions } from '../src/lib/export/options';
import type { ExportOptions } from '../src/lib/export/options';
import { prepareConversation } from '../src/lib/export/prepare';
import type {
  MessageItem,
  PreparedBlock,
  PreparedConversation,
  RenderItem,
} from '../src/lib/export/prepare';
import {
  buildDocxChildren,
  buildDocxDocument,
  DOCX_COLORS,
  DOCX_STYLE,
  serializeDocx,
} from '../src/lib/export/serializers/docx';
import { parseConversation } from '../src/lib/parser';
import { loadFixture, loadFixtures } from './harness';

/** Everything-on options: every include flag set, all branches. */
const EVERYTHING_ON: Partial<ExportOptions> = {
  includeThinking: true,
  includeToolUse: true,
  includeToolResults: true,
  includeArtifacts: true,
  includeAttachments: true,
  includeTimestamps: true,
  includeConversationMetadata: true,
  branches: 'all',
};

/** Minimal zip reader for the store/deflate entries JSZip emits. */
function unzip(bytes: Uint8Array): Map<string, string> {
  const files = new Map<string, string>();
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const decoder = new TextDecoder();
  let offset = 0;
  while (offset + 4 <= bytes.length && view.getUint32(offset, true) === 0x04034b50) {
    const method = view.getUint16(offset + 8, true);
    const compressedSize = view.getUint32(offset + 18, true);
    const nameLength = view.getUint16(offset + 26, true);
    const extraLength = view.getUint16(offset + 28, true);
    const name = decoder.decode(bytes.subarray(offset + 30, offset + 30 + nameLength));
    const dataStart = offset + 30 + nameLength + extraLength;
    const data = bytes.subarray(dataStart, dataStart + compressedSize);
    files.set(name, method === 8 ? inflateRawSync(data).toString('utf8') : decoder.decode(data));
    offset = dataStart + compressedSize;
  }
  return files;
}

/** Pack a prepared conversation and return the unzipped OOXML parts. */
async function packToParts(prepared: PreparedConversation): Promise<Map<string, string>> {
  return unzip(await serializeDocx(prepared));
}

function part(parts: Map<string, string>, name: string): string {
  const content = parts.get(name);
  if (content === undefined) {
    throw new Error(`missing zip entry ${name}`);
  }
  return content;
}

/** Build a PreparedConversation literal without going through the parser. */
function prepared(
  items: RenderItem[],
  options: Partial<ExportOptions> = {},
  title = 'Test conversation',
): PreparedConversation {
  return { options: resolveExportOptions(options), title, items };
}

/** One assistant message holding the given blocks. */
function message(blocks: PreparedBlock[], timestamp?: string): MessageItem {
  return {
    kind: 'message',
    sender: 'assistant',
    senderLabel: 'Claude',
    timestamp:
      timestamp === undefined ? undefined : { iso: timestamp, display: `${timestamp} UTC` },
    blocks,
  };
}

/** A single-text-block assistant message. */
function textMessage(markdown: string): MessageItem {
  return message([{ kind: 'text', text: markdown }]);
}

/** Prepare a fixture through the real parser + prepare pipeline. */
function prepareFixture(name: string, options: Partial<ExportOptions>): PreparedConversation {
  const { conversation } = parseConversation(loadFixture(name).raw);
  return prepareConversation(conversation, options);
}

describe('serializeDocx pack smoke tests', () => {
  for (const fixture of loadFixtures()) {
    it(`packs ${fixture.name} with default options`, async () => {
      const { conversation } = parseConversation(fixture.raw);
      const bytes = await serializeDocx(prepareConversation(conversation));
      expect([bytes[0], bytes[1], bytes[2], bytes[3]]).toEqual([0x50, 0x4b, 0x03, 0x04]);
      expect(bytes.length).toBeGreaterThan(2500);
    });

    it(`packs ${fixture.name} with everything on and branches 'all'`, async () => {
      const { conversation } = parseConversation(fixture.raw);
      const bytes = await serializeDocx(prepareConversation(conversation, EVERYTHING_ON));
      expect([bytes[0], bytes[1], bytes[2], bytes[3]]).toEqual([0x50, 0x4b, 0x03, 0x04]);
      expect(bytes.length).toBeGreaterThan(2500);
    });
  }
});

describe('buildDocxDocument structure', () => {
  it('returns a Document; the builder returns paragraphs and tables in item order', () => {
    const view = prepared([
      {
        kind: 'metadata',
        title: 'Garden notes',
        createdAt: { iso: '2026-05-14T09:12:03Z', display: '2026-05-14 09:12 UTC' },
        updatedAt: { iso: '2026-05-14T09:13:41Z', display: '2026-05-14 09:13 UTC' },
      },
      textMessage('Intro\n\n| A | B |\n| --- | --- |\n| 1 | 2 |'),
    ]);
    expect(buildDocxDocument(view)).toBeInstanceOf(Document);

    const children = buildDocxChildren(view);
    // Title, dates line, sender heading, intro paragraph, table.
    expect(children).toHaveLength(5);
    expect(children[0]).toBeInstanceOf(Paragraph);
    expect(children[1]).toBeInstanceOf(Paragraph);
    expect(children[2]).toBeInstanceOf(Paragraph);
    expect(children[3]).toBeInstanceOf(Paragraph);
    expect(children[4]).toBeInstanceOf(Table);
  });

  it('renders metadata without dates as just the Title paragraph', () => {
    const children = buildDocxChildren(
      prepared([
        { kind: 'metadata', title: 'Untitled', createdAt: undefined, updatedAt: undefined },
      ]),
    );
    expect(children).toHaveLength(1);
  });

  it('serializeDocx resolves to a Uint8Array', async () => {
    const bytes = await serializeDocx(prepared([textMessage('hi')]));
    expect(bytes).toBeInstanceOf(Uint8Array);
  });
});

describe('document body rendering', () => {
  it('renders the metadata header with Title style and both dates', async () => {
    const parts = await packToParts(
      prepared([
        {
          kind: 'metadata',
          title: 'Garden notes',
          createdAt: { iso: 'x', display: '2026-05-14 09:12 UTC' },
          updatedAt: { iso: 'y', display: '2026-05-14 09:13 UTC' },
        },
      ]),
    );
    const xml = part(parts, 'word/document.xml');
    expect(xml).toContain('w:pStyle w:val="Title"');
    expect(xml).toContain('Garden notes');
    expect(xml).toContain('Created 2026-05-14 09:12 UTC · Updated 2026-05-14 09:13 UTC');
    expect(xml).toContain(`w:pStyle w:val="${DOCX_STYLE.timestamp}"`);
  });

  it('renders sender headings with the accent style and optional timestamps', async () => {
    const parts = await packToParts(
      prepared([message([{ kind: 'text', text: 'Hello' }], '2026-05-14 09:12')]),
    );
    const xml = part(parts, 'word/document.xml');
    expect(xml).toContain(`w:pStyle w:val="${DOCX_STYLE.senderHeading}"`);
    expect(xml).toContain('>Claude<');
    expect(xml).toContain('2026-05-14 09:12 UTC');

    const styles = part(parts, 'word/styles.xml');
    expect(styles).toContain(`w:styleId="${DOCX_STYLE.senderHeading}"`);
    expect(styles).toContain(`w:color w:val="${DOCX_COLORS.accent}"`);
  });

  it('renders branch markers as Heading1 dividers, flagging the current branch', async () => {
    const view = prepareFixture('branched-tree', { ...EVERYTHING_ON, branches: 'all' });
    const parts = await packToParts(view);
    const xml = part(parts, 'word/document.xml');
    expect(xml).toContain('Branch 1 of 2');
    expect(xml).toContain('Branch 2 of 2 (current branch)');
    expect(xml).toContain('w:pStyle w:val="Heading1"');
  });

  it('renders items verbatim in order', async () => {
    const parts = await packToParts(
      prepared([
        textMessage('first message'),
        textMessage('second message'),
        textMessage('third message'),
      ]),
    );
    const xml = part(parts, 'word/document.xml');
    const positions = ['first message', 'second message', 'third message'].map((text) =>
      xml.indexOf(text),
    );
    expect(positions.every((position) => position >= 0)).toBe(true);
    expect([...positions].sort((a, b) => a - b)).toEqual(positions);
  });
});

describe('markdown structure', () => {
  it('maps markdown headings down one level, clamping at Heading4', async () => {
    const parts = await packToParts(
      prepared([textMessage('# One\n\n## Two\n\n### Three\n\n#### Four\n\n###### Six')]),
    );
    const xml = part(parts, 'word/document.xml');
    expect(xml).toContain('w:pStyle w:val="Heading2"');
    expect(xml).toContain('w:pStyle w:val="Heading3"');
    expect(xml).toContain('w:pStyle w:val="Heading4"');
    expect(xml).not.toContain('w:pStyle w:val="Heading5"');
    // Heading text is real content, not markdown syntax.
    expect(xml).toContain('>One<');
    expect(xml).not.toContain('# One');
  });

  it('renders bold, italic, strikethrough, and inline code runs', async () => {
    const parts = await packToParts(
      prepared([textMessage('**bold** *italic* ~~gone~~ `code()` plain')]),
    );
    const xml = part(parts, 'word/document.xml');
    expect(xml).toMatch(/<w:b\s*\/>[\s\S]*?>bold</);
    expect(xml).toMatch(/<w:i\s*\/>[\s\S]*?>italic</);
    expect(xml).toMatch(/<w:strike\s*\/>[\s\S]*?>gone</);
    expect(xml).toContain(`w:rStyle w:val="${DOCX_STYLE.codeInline}"`);
    expect(xml).toContain('code()');
    expect(xml).not.toContain('**bold**');
  });

  it('renders links as real external hyperlinks with the target in the rels part', async () => {
    const parts = await packToParts(
      prepared([textMessage('See [the docs](https://example.com/docs) for details.')]),
    );
    const xml = part(parts, 'word/document.xml');
    expect(xml).toContain('<w:hyperlink ');
    expect(xml).toContain('r:id=');
    expect(xml).toContain('w:rStyle w:val="Hyperlink"');
    expect(part(parts, 'word/_rels/document.xml.rels')).toContain('https://example.com/docs');
  });

  it('neutralizes non-http(s)/mailto link targets into visible text', async () => {
    const parts = await packToParts(prepared([textMessage('[click me](javascript:alert(1))')]));
    const xml = part(parts, 'word/document.xml');
    expect(xml).not.toContain('<w:hyperlink');
    expect(part(parts, 'word/_rels/document.xml.rels')).not.toContain('javascript:');
    expect(xml).toContain('click me');
    expect(xml).toContain('(javascript:alert(1))');
  });

  it('renders nested ordered/unordered lists with numbering levels and per-list instances', async () => {
    const parts = await packToParts(
      prepared([
        textMessage('1. first\n2. second\n   - nested bullet\n\ntext between\n\n1. restarted\n'),
      ]),
    );
    const xml = part(parts, 'word/document.xml');
    expect(xml).toContain('<w:numPr>');
    expect(xml).toContain('<w:ilvl w:val="0"');
    expect(xml).toContain('<w:ilvl w:val="1"');
    // Two ordered lists → two distinct concrete numbering instances, plus the
    // bullet instance: at least three numIds referenced.
    const numIds = new Set(xml.match(/w:numId w:val="\d+"/g));
    expect(numIds.size).toBeGreaterThanOrEqual(3);
    expect(part(parts, 'word/numbering.xml')).toContain('w:abstractNum');
  });

  it('renders task list items with a visible checkbox glyph', async () => {
    const parts = await packToParts(prepared([textMessage('- [x] done\n- [ ] todo')]));
    const xml = part(parts, 'word/document.xml');
    expect(xml).toContain('☑');
    expect(xml).toContain('☐');
  });

  it('renders blockquotes with the Blockquote style, including nested content', async () => {
    const parts = await packToParts(
      prepared([textMessage('> quoted wisdom\n>\n> ```\n> quoted code\n> ```')]),
    );
    const xml = part(parts, 'word/document.xml');
    expect(xml).toContain(`w:pStyle w:val="${DOCX_STYLE.blockquote}"`);
    expect(xml).toContain('quoted wisdom');
    expect(xml).toContain('quoted code');
    expect(xml).toContain(`w:pStyle w:val="${DOCX_STYLE.codeBlock}"`);
  });

  it('preserves code fence line breaks exactly, including blank lines', async () => {
    const code = 'line1\n\n    indented\nlast';
    const parts = await packToParts(prepared([textMessage(`\`\`\`text\n${code}\n\`\`\``)]));
    const xml = part(parts, 'word/document.xml');
    const codeBlock = xml.slice(xml.indexOf(`w:pStyle w:val="${DOCX_STYLE.codeBlock}"`));
    // Three breaks separate the four lines (one is blank).
    expect(codeBlock.match(/<w:br\s*\/>/g)?.length).toBe(3);
    expect(xml).toContain('line1');
    expect(xml).toContain('xml:space="preserve"');
    expect(xml).toContain('    indented');
    expect(xml).not.toContain('```');
  });

  it('renders markdown tables as Word tables with a shaded header row', async () => {
    const parts = await packToParts(
      prepared([textMessage('| Left | Center | Right |\n| :-- | :-: | --: |\n| a | b | c |')]),
    );
    const xml = part(parts, 'word/document.xml');
    expect(xml).toContain('<w:tbl>');
    expect(xml).toContain('<w:tblHeader');
    expect(xml).toContain(`w:fill="${DOCX_COLORS.subtleBg}"`);
    expect(xml).toMatch(/<w:jc w:val="center"\s*\/>/);
    expect(xml).toMatch(/<w:jc w:val="right"\s*\/>/);
    expect(xml).toContain('>Left<');
    expect(xml).toContain('>c<');
  });

  it('renders thematic breaks, raw HTML, and hard line breaks visibly', async () => {
    const parts = await packToParts(
      prepared([textMessage('above\n\n---\n\nbelow <kbd>K</kbd>\n\n<div>block html</div>')]),
    );
    const xml = part(parts, 'word/document.xml');
    expect(xml).toContain('above');
    expect(xml).toContain('&lt;kbd&gt;');
    expect(xml).toContain('&lt;div&gt;block html&lt;/div&gt;');
  });

  it('renders escapes, images, and reference links from markdown text', async () => {
    const parts = await packToParts(
      prepared([
        textMessage(
          'not \\*bold\\* and ![a chart](https://example.com/c.png)\n\nline one  \nline two\n\n[ref][1]\n\n[1]: https://example.com/ref',
        ),
      ]),
    );
    const xml = part(parts, 'word/document.xml');
    const visibleText = xml.replace(/<[^>]+>/g, '');
    expect(visibleText).toContain('not *bold* and');
    expect(xml).toContain('[Image: a chart]');
    expect(part(parts, 'word/_rels/document.xml.rels')).toContain('https://example.com/ref');
  });

  it('labels an alt-less image with its target', async () => {
    const parts = await packToParts(prepared([textMessage('![](https://example.com/pic.png)')]));
    expect(part(parts, 'word/document.xml')).toContain('[Image: https://example.com/pic.png]');
  });

  it('decodes markdown entity references in plain text but not in code', async () => {
    const parts = await packToParts(
      prepared([textMessage('AT&T meets &amp; and &lt;tag&gt;\n\n`&amp; stays`')]),
    );
    const xml = part(parts, 'word/document.xml');
    expect(xml).toContain('AT&amp;T meets &amp; and &lt;tag&gt;');
    expect(xml).toContain('&amp;amp; stays');
  });

  it('renders code fences and extra paragraphs inside list items', async () => {
    const parts = await packToParts(
      prepared([
        textMessage(
          '- first line\n\n  second paragraph\n\n- item with code\n\n  ```\n  fenced\n  ```\n',
        ),
      ]),
    );
    const xml = part(parts, 'word/document.xml');
    expect(xml).toContain('first line');
    expect(xml).toContain('second paragraph');
    expect(xml).toContain(`w:pStyle w:val="${DOCX_STYLE.codeBlock}"`);
    expect(xml).toContain('fenced');
    // The continuation paragraph is indented but not re-numbered.
    expect(xml).toContain('<w:ind w:left="720"/>');
  });
});

describe('prepared block rendering', () => {
  it('renders thinking as a labelled inset section with summaries', async () => {
    const parts = await packToParts(
      prepared([
        message([
          {
            kind: 'thinking',
            thinking: 'Deep thought line one.\nLine two.',
            summaries: ['Pondering the question'],
          },
        ]),
      ]),
    );
    const xml = part(parts, 'word/document.xml');
    expect(xml).toContain(`w:pStyle w:val="${DOCX_STYLE.blockLabel}"`);
    expect(xml).toContain('>Thinking<');
    expect(xml).toContain(`w:pStyle w:val="${DOCX_STYLE.thinking}"`);
    expect(xml).toContain('Pondering the question');
    expect(xml).toContain('Deep thought line one.');
    expect(xml).toContain('Line two.');

    const styles = part(parts, 'word/styles.xml');
    const thinkingStyle = styles.slice(styles.indexOf(`w:styleId="${DOCX_STYLE.thinking}"`));
    expect(thinkingStyle).toContain('<w:i/>');
    expect(thinkingStyle).toContain(`w:color w:val="${DOCX_COLORS.muted}"`);
  });

  it('renders tool use as a labelled JSON code block', async () => {
    const parts = await packToParts(
      prepared([
        message([{ kind: 'toolUse', name: 'web_search', input: { query: 'shade crops' } }]),
      ]),
    );
    const xml = part(parts, 'word/document.xml');
    expect(xml).toContain('Tool use: web_search');
    expect(xml).toContain('&quot;query&quot;: &quot;shade crops&quot;');
    expect(xml).toContain(`w:pStyle w:val="${DOCX_STYLE.codeBlock}"`);
  });

  it('renders non-serializable tool input via String()', async () => {
    const parts = await packToParts(
      prepared([message([{ kind: 'toolUse', name: 'noop', input: undefined }])]),
    );
    expect(part(parts, 'word/document.xml')).toContain('undefined');
  });

  it('renders tool results, using the error label style for failures', async () => {
    const parts = await packToParts(
      prepared([
        message([
          { kind: 'toolResult', name: 'web_search', content: 'All good', isError: false },
          { kind: 'toolResult', name: undefined, content: 'It broke', isError: true },
        ]),
      ]),
    );
    const xml = part(parts, 'word/document.xml');
    expect(xml).toContain('Tool result: web_search');
    expect(xml).toContain('Tool result (error)');
    expect(xml).toContain(`w:pStyle w:val="${DOCX_STYLE.blockLabelError}"`);
    const styles = part(parts, 'word/styles.xml');
    expect(styles).toContain(`w:color w:val="${DOCX_COLORS.error}"`);
  });

  it('renders artifacts as a labelled heading plus code block content', async () => {
    const view = prepareFixture('artifacts', EVERYTHING_ON);
    const parts = await packToParts(view);
    const xml = part(parts, 'word/document.xml');
    expect(xml).toContain('Artifact:');
    expect(xml).toContain('final version');
    expect(xml).toContain(`w:pStyle w:val="${DOCX_STYLE.codeBlock}"`);
  });

  it('labels artifacts with title, command, and language', async () => {
    const parts = await packToParts(
      prepared([
        message([
          {
            kind: 'artifact',
            id: 'art-1',
            title: 'Fibonacci',
            artifactType: 'application/vnd.ant.code',
            language: 'python',
            command: 'create',
            content: 'def fib(n):\n    return n',
            isFinal: false,
          },
        ]),
      ]),
    );
    const xml = part(parts, 'word/document.xml');
    expect(xml).toContain('Artifact: Fibonacci (create · python)');
    expect(xml).toContain('def fib(n):');
  });

  it('labels untitled artifacts by id, flagging the final version', async () => {
    const parts = await packToParts(
      prepared([
        message([
          {
            kind: 'artifact',
            id: 'art-2',
            title: undefined,
            artifactType: undefined,
            language: undefined,
            command: 'rewrite',
            content: 'body',
            isFinal: true,
          },
        ]),
      ]),
    );
    expect(part(parts, 'word/document.xml')).toContain('Artifact: art-2 (rewrite · final version)');
  });

  it('renders images as a labelled placeholder noting non-embedding', async () => {
    const parts = await packToParts(
      prepared([
        message([
          { kind: 'image', mediaType: 'image/png', fileName: 'photo.png', data: 'abc' },
          { kind: 'image', mediaType: undefined, fileName: undefined, data: undefined },
        ]),
      ]),
    );
    const xml = part(parts, 'word/document.xml');
    expect(xml).toContain('[Image: photo.png, image/png — not embedded in this export]');
    expect(xml).toContain('[Image — not embedded in this export]');
  });

  it('renders attachments with extracted content as a code block', async () => {
    const parts = await packToParts(
      prepared([
        message([
          {
            kind: 'attachment',
            fileName: 'notes.txt',
            fileType: 'text/plain',
            extractedContent: 'line a\nline b',
          },
          {
            kind: 'attachment',
            fileName: 'empty.bin',
            fileType: undefined,
            extractedContent: undefined,
          },
          { kind: 'file', fileName: 'scan.pdf', fileKind: 'document' },
          { kind: 'file', fileName: 'blob', fileKind: undefined },
        ]),
      ]),
    );
    const xml = part(parts, 'word/document.xml');
    expect(xml).toContain('Attachment: notes.txt (text/plain)');
    expect(xml).toContain('line a');
    expect(xml).toContain('Attachment: empty.bin');
    expect(xml).toContain('No extracted content.');
    expect(xml).toContain('Attached file: scan.pdf (document)');
    expect(xml).toContain('Attached file: blob');
  });

  it('renders unknown blocks as a labelled raw-JSON code block, never dropping them', async () => {
    const parts = await packToParts(
      prepared([
        message([
          {
            kind: 'unknown',
            blockType: 'weather_card',
            raw: { type: 'weather_card', city: 'Lisbon' },
            label: 'Unsupported content (weather_card)',
          },
        ]),
      ]),
    );
    const xml = part(parts, 'word/document.xml');
    expect(xml).toContain('Unsupported content (weather_card)');
    expect(xml).toContain('&quot;city&quot;: &quot;Lisbon&quot;');
  });
});

describe('page header and footer', () => {
  it('puts the conversation title in the page header', async () => {
    const parts = await packToParts(prepared([textMessage('hi')], {}, 'Garden notes'));
    const header = part(parts, 'word/header1.xml');
    expect(header).toContain('Garden notes');
  });

  it('numbers pages "Page X of Y" in the footer', async () => {
    const parts = await packToParts(prepared([textMessage('hi')]));
    const footer = part(parts, 'word/footer1.xml');
    expect(footer).toContain('PAGE');
    expect(footer).toContain('NUMPAGES');
    expect(footer).toContain('Page ');
    expect(footer).toContain(' of ');
  });
});

describe('style inventory', () => {
  it('defines every custom style with design-system fonts and colors', async () => {
    const parts = await packToParts(prepared([textMessage('hi')]));
    const styles = part(parts, 'word/styles.xml');
    for (const styleId of Object.values(DOCX_STYLE)) {
      expect(styles).toContain(`w:styleId="${styleId}"`);
    }
    expect(styles).toContain('w:ascii="Calibri"');
    expect(styles).toContain('w:ascii="Consolas"');
    // CodeBlock: subtle shading and a thin border.
    const codeStyle = styles.slice(styles.indexOf(`w:styleId="${DOCX_STYLE.codeBlock}"`));
    expect(codeStyle).toContain(`w:fill="${DOCX_COLORS.subtleBg}"`);
    expect(codeStyle).toContain(`w:color="${DOCX_COLORS.border}"`);
    // Hyperlinks are accent-colored and underlined.
    const linkStyle = styles.slice(styles.indexOf('w:styleId="Hyperlink"'));
    expect(linkStyle).toContain(`w:color w:val="${DOCX_COLORS.accent}"`);
  });
});

describe('XML injection resistance (threat model T1)', () => {
  const hostile =
    'Evil <w:evilTag w:val="pwn"/> &amp; & raw "quotes" </w:document> ]]> \u0007bell\u0000null';

  it('escapes markup-significant characters in message text', async () => {
    const parts = await packToParts(prepared([textMessage(hostile)]));
    const xml = part(parts, 'word/document.xml');
    // The markup never appears unescaped…
    expect(xml).not.toContain('<w:evilTag');
    expect(xml).not.toContain('</w:document> ]]>');
    // …but the visible text survives, escaped. (`&amp;` decodes to `&` per
    // Markdown entity semantics, then docx re-escapes both ampersands.)
    expect(xml).toContain('&lt;w:evilTag');
    expect(xml).toContain('&amp; &amp; raw');
    // Control characters that would corrupt the XML are stripped.
    expect(xml).not.toContain('\u0007');
    expect(xml).not.toContain('\u0000');
    expect(xml).toContain('bellnull');
  });

  it('escapes hostile content in code, thinking, tool, and unknown paths', async () => {
    const parts = await packToParts(
      prepared(
        [
          message([
            { kind: 'text', text: `\`\`\`\n${hostile}\n\`\`\`` },
            { kind: 'thinking', thinking: hostile, summaries: [hostile] },
            { kind: 'toolUse', name: hostile, input: { payload: hostile } },
            { kind: 'unknown', blockType: 'x', raw: { html: hostile }, label: hostile },
          ]),
        ],
        {},
        hostile,
      ),
    );
    for (const name of ['word/document.xml', 'word/header1.xml']) {
      const xml = part(parts, name);
      expect(xml, name).not.toContain('<w:evilTag');
      expect(xml, name).not.toContain('\u0007');
      expect(xml, name).not.toContain('\u0000');
    }
    expect(part(parts, 'word/document.xml')).toContain('&lt;w:evilTag');
  });

  it('keeps the document parseable as XML with hostile content everywhere', async () => {
    const parts = await packToParts(prepared([textMessage(hostile)], {}, hostile));
    const xml = part(parts, 'word/document.xml');
    // Well-formedness proxy: every opening angle bracket belongs to a real
    // element, i.e. tag characters balance and no stray raw '<' from content.
    const stripped = xml.replace(/<[^<>]+>/g, '');
    expect(stripped).not.toContain('<');
    expect(stripped).not.toContain('>');
  });
});
