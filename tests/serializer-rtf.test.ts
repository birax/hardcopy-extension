import { describe, expect, it } from 'vitest';

import type { ExportOptions } from '../src/lib/export';
import { prepareConversation } from '../src/lib/export';
import type { PreparedBlock, PreparedConversation } from '../src/lib/export';
import { serializeRtf, validateRtfStructure } from '../src/lib/export/serializers/rtf';
import { parseConversation } from '../src/lib/parser';
import { loadFixture, loadFixtures } from './harness';

/** The everything-on options matrix leg: exercises every prepared block kind. */
const EVERYTHING: Partial<ExportOptions> = {
  includeThinking: true,
  includeToolUse: true,
  includeToolResults: true,
  includeArtifacts: true,
  includeAttachments: true,
  includeTimestamps: true,
  includeConversationMetadata: true,
  branches: 'all',
};

function prepare(raw: unknown, options?: Partial<ExportOptions>): PreparedConversation {
  return prepareConversation(parseConversation(raw).conversation, options);
}

/** Hand-build a prepared conversation around a list of blocks. */
function preparedWith(blocks: PreparedBlock[]): PreparedConversation {
  const conversation = prepare({
    uuid: '00000000-0000-4000-8000-000000000000',
    name: 'Handmade conversation',
    chat_messages: [],
  });
  return {
    ...conversation,
    items: [
      ...conversation.items,
      { kind: 'message', sender: 'human', senderLabel: 'Human', timestamp: undefined, blocks },
    ],
  };
}

describe('serializeRtf fixture snapshots', () => {
  for (const fixture of loadFixtures()) {
    it(`serializes ${fixture.name} with default options`, () => {
      const rtf = serializeRtf(prepare(fixture.raw));
      expect(validateRtfStructure(rtf)).toEqual([]);
      expect(rtf).toMatchSnapshot();
    });

    it(`serializes ${fixture.name} with everything on`, () => {
      const rtf = serializeRtf(prepare(fixture.raw, EVERYTHING));
      expect(validateRtfStructure(rtf)).toEqual([]);
      expect(rtf).toMatchSnapshot();
    });
  }
});

describe('document shell', () => {
  const rtf = serializeRtf(prepare(loadFixture('simple-text').raw));

  it('opens with the RTF 1.x header', () => {
    expect(rtf.startsWith('{\\rtf1\\ansi\\ansicpg1252\\deff0')).toBe(true);
    expect(rtf.endsWith('}')).toBe(true);
  });

  it('declares a body font and a monospace font with fallbacks', () => {
    expect(rtf).toContain('{\\f0\\fswiss\\fcharset0 Helvetica{\\*\\falt Calibri};}');
    expect(rtf).toContain('{\\f1\\fmodern\\fcharset0 Courier New{\\*\\falt Menlo};}');
  });

  it('declares the design-palette color table (ink, teal, red, grey, subtle bg)', () => {
    expect(rtf).toContain(
      '{\\colortbl;\\red23\\green37\\blue43;\\red10\\green91\\blue85;' +
        '\\red180\\green34\\blue55;\\red66\\green85\\blue92;\\red242\\green247\\blue246;}',
    );
  });

  it('sets \\uc1 so every \\uN escape carries one fallback character', () => {
    expect(rtf).toContain('\\uc1');
  });
});

describe('deterministic output', () => {
  it('produces byte-identical output across runs', () => {
    for (const fixture of loadFixtures()) {
      const a = serializeRtf(prepare(fixture.raw, EVERYTHING));
      const b = serializeRtf(prepare(fixture.raw, EVERYTHING));
      expect(a).toBe(b);
    }
  });
});

describe('conversation structure', () => {
  it('renders the title as a large bold heading', () => {
    const rtf = serializeRtf(prepare(loadFixture('simple-text').raw));
    expect(rtf).toMatch(/\{\\pard[^ ]*\\b\\cf1\\f0\\fs40 /);
  });

  it('renders sender labels bold in the accent color', () => {
    const rtf = serializeRtf(prepare(loadFixture('simple-text').raw));
    expect(rtf).toContain('{\\b\\cf2\\fs26 Human}');
    expect(rtf).toContain('{\\b\\cf2\\fs26 Claude}');
  });

  it('renders timestamps small and muted when enabled', () => {
    const rtf = serializeRtf(prepare(loadFixture('simple-text').raw, { includeTimestamps: true }));
    expect(rtf).toMatch(/\{\\cf4\\fs16 {2}\\u8212\? {2}\d{4}-\d{2}-\d{2} \d{2}:\d{2} UTC\}/);
  });

  it('renders branch markers when exporting all branches of a branched tree', () => {
    const rtf = serializeRtf(prepare(loadFixture('branched-tree').raw, { branches: 'all' }));
    expect(rtf).toContain('Branch 1 of 2');
    expect(rtf).toContain('Branch 2 of 2 (current)');
  });

  it('labels thinking blocks as italic muted insets', () => {
    const rtf = serializeRtf(prepare(loadFixture('thinking').raw, { includeThinking: true }));
    expect(rtf).toMatch(/\{\\pard\\li360[^ ]*\\b\\cf4\\f1\\fs20 Thinking\\par\}/);
    expect(rtf).toMatch(/\\li360[^ ]*\\i\\cf4/);
  });

  it('renders unknown blocks as visible labelled placeholders', () => {
    const rtf = serializeRtf(prepare(loadFixture('unknown-block').raw));
    expect(rtf).toContain('Unsupported content');
  });
});

describe('markdown rendering', () => {
  const markdown = [
    '# Heading one',
    '',
    '###### Heading six',
    '',
    'Body with **bold**, *italic*, `code span`, ~~gone~~, and a [named link](https://example.com/a).',
    '',
    'Autolink: <https://example.com/self>',
    '',
    'An image ![alt text](https://example.com/pic.png) inline, plus <b>raw html</b> and \\* an escape.',
    '',
    '- bullet one',
    '- bullet two',
    '  1. nested ordered',
    '  2. second',
    '',
    '- [x] done task',
    '- [ ] open task',
    '',
    '> A quote with **bold** inside.',
    '>',
    '> Second quoted paragraph.',
    '',
    '```python',
    'def hi():',
    '',
    '    return "two\\tblank lines kept"',
    '```',
    '',
    '---',
    '',
    '| Left | Centered | Right |',
    '| :--- | :------: | ----: |',
    '| a    |    b     |     c |',
    '| d    |    e     |     f |',
    '',
    '<div>block html</div>',
    '',
    'Entities: &#123;decimal&#125; and &#x2192; and &amp;.',
    '',
    'hard break line one  ',
    'hard break line two',
    '',
    '[ref]: https://example.com/definition',
  ].join('\n');

  const rtf = serializeRtf(preparedWith([{ kind: 'text', text: markdown }]));

  it('stays structurally valid and snapshots the full feature set', () => {
    expect(validateRtfStructure(rtf)).toEqual([]);
    expect(rtf).toMatchSnapshot();
  });

  it('sizes headings by depth', () => {
    expect(rtf).toMatch(/\\fs32 Heading one/);
    expect(rtf).toMatch(/\\fs22 Heading six/);
  });

  it('renders inline styles', () => {
    expect(rtf).toContain('{\\b bold}');
    expect(rtf).toContain('{\\i italic}');
    expect(rtf).toContain('{\\strike gone}');
    expect(rtf).toContain('{\\f1\\fs20 code span}');
  });

  it('renders links as accent text with the URL kept visible', () => {
    expect(rtf).toContain('{\\ul\\cf2 named link}{\\cf4  (https://example.com/a)}');
    expect(rtf).toContain('{\\ul\\cf2 https://example.com/self}');
  });

  it('renders bulleted and numbered lists with hanging indents', () => {
    expect(rtf).toMatch(/\\li360\\fi-360\\tx360[^ ]* \\bullet\\tab bullet one/);
    expect(rtf).toMatch(/\\li720\\fi-360\\tx720[^ ]* 1\.\\tab nested ordered/);
    expect(rtf).toContain('[x]\\tab done task');
    expect(rtf).toContain('[ ]\\tab open task');
  });

  it('indents blockquotes and mutes their color', () => {
    expect(rtf).toMatch(/\\li720[^ ]*\\cf4\\f0\\fs22 A quote with \{\\b bold\} inside\./);
  });

  it('renders code fences in shaded monospace with line breaks preserved exactly', () => {
    expect(rtf).toContain(
      '\\cbpat5\\cf1\\f1\\fs20 def hi():\\line \\line ' +
        '    return "two\\\\tblank lines kept"\\par}',
    );
  });

  it('renders real RTF tables with bordered cells and a shaded bold header row', () => {
    expect(rtf).toContain('\\trowd\\trgaph108\\trleft0');
    expect((rtf.match(/\\row/g) ?? []).length).toBe(3);
    expect(rtf).toContain('\\clcbpat5');
    expect(rtf).toMatch(/\\pard\\intbl\\ql\{\\b\\cf1\\f0\\fs22 Left\}\\cell/);
    expect(rtf).toMatch(/\\pard\\intbl\\qc\{\\cf1\\f0\\fs22 b\}\\cell/);
    expect(rtf).toMatch(/\\pard\\intbl\\qr\{\\cf1\\f0\\fs22 c\}\\cell/);
  });

  it('renders horizontal rules as a bottom-bordered paragraph', () => {
    expect(rtf).toContain('\\brdrb\\brdrs\\brdrw15\\brdrcf4');
  });

  it('renders raw HTML visibly as monospace text, never interpreted', () => {
    expect(rtf).toContain('<div>block html</div>');
    expect(rtf).toContain('<b>raw html</b>');
    expect(rtf).not.toContain('\\field');
  });

  it('renders markdown images as labelled placeholders', () => {
    expect(rtf).toContain('[image: alt text]');
  });

  it('decodes HTML entities before escaping (numeric ones re-escaped safely)', () => {
    expect(rtf).toContain('Entities: \\{decimal\\} and \\u8594? and &.');
  });

  it('renders hard line breaks as \\line within the paragraph', () => {
    expect(rtf).toContain('hard break line one\\line hard break line two');
  });

  it('renders link reference definitions as nothing (invisible in markdown too)', () => {
    expect(rtf).not.toContain('example.com/definition');
  });

  it('renders tight task lists (checkbox tokens) with their markers', () => {
    const tight = serializeRtf(
      preparedWith([{ kind: 'text', text: '- [x] tight done\n- [ ] tight open' }]),
    );
    expect(validateRtfStructure(tight)).toEqual([]);
    expect(tight).toContain('[x]\\tab tight done');
    expect(tight).toContain('[ ]\\tab tight open');
  });

  it('shows a marker even for a list item with no leading text', () => {
    const bare = serializeRtf(preparedWith([{ kind: 'text', text: '-\n  - inner item' }]));
    expect(validateRtfStructure(bare)).toEqual([]);
    // Outer bare item still gets its bullet paragraph; inner renders indented.
    expect(bare).toMatch(/\\li360\\fi-360\\tx360[^ ]* \\bullet\\tab \\par\}/);
    expect(bare).toContain('\\bullet\\tab inner item');
  });

  it('renders markdown structure inside thinking insets italic and muted', () => {
    const rtf = serializeRtf(
      preparedWith([
        {
          kind: 'thinking',
          thinking: '# Plan\n\n- step one\n- step two\n\n> inner quote',
          summaries: [],
        },
      ]),
    );
    expect(validateRtfStructure(rtf)).toEqual([]);
    // Heading, list, and quote all inherit the italic muted inset context.
    expect(rtf).toMatch(/\\keepn\\b\\i\\cf4\\f0\\fs32 Plan/);
    expect(rtf).toMatch(/\\li720\\fi-360\\tx720\\sa60\\i\\cf4\\f0\\fs20 \\bullet\\tab step one/);
    expect(rtf).toMatch(/\\li1080\\sa120\\i\\cf4\\f0\\fs20 inner quote/);
  });
});

describe('non-text prepared blocks', () => {
  it('renders tool use, tool results, and errors as labelled mono insets', () => {
    const rtf = serializeRtf(
      preparedWith([
        { kind: 'toolUse', name: 'web_search', input: { query: 'rtf spec' } },
        { kind: 'toolUse', name: 'no_input', input: undefined },
        { kind: 'toolResult', name: 'web_search', content: 'ok result', isError: false },
        { kind: 'toolResult', name: undefined, content: 'it broke', isError: true },
      ]),
    );
    expect(validateRtfStructure(rtf)).toEqual([]);
    expect(rtf).toContain('Tool use: web_search');
    expect(rtf).toContain('"query": "rtf spec"');
    expect(rtf).toContain('undefined');
    expect(rtf).toContain('Tool result: web_search');
    // Error results use the error color for label and content.
    expect(rtf).toMatch(/\\b\\cf3\\f1\\fs20 Tool result \(error\)\\par\}/);
    expect(rtf).toMatch(/\\cbpat5\\cf3\\f1\\fs20 it broke/);
  });

  it('renders artifacts as labelled mono insets with id, command, and language', () => {
    const rtf = serializeRtf(
      preparedWith([
        {
          kind: 'artifact',
          id: 'tip-calc',
          title: 'Tip calculator',
          artifactType: 'application/vnd.ant.code',
          language: 'python',
          command: 'create',
          content: 'print("hi")',
          isFinal: false,
        },
        {
          kind: 'artifact',
          id: 'tip-calc',
          title: undefined,
          artifactType: undefined,
          language: undefined,
          command: 'update',
          content: 'print("bye")',
          isFinal: true,
        },
      ]),
    );
    expect(validateRtfStructure(rtf)).toEqual([]);
    expect(rtf).toContain('Artifact: Tip calculator (tip-calc, create, python)');
    expect(rtf).toContain('Artifact (tip-calc, update, final version)');
    expect(rtf).toContain('print("hi")');
  });

  it('renders attachments, files, and images as labelled placeholders', () => {
    const rtf = serializeRtf(
      preparedWith([
        { kind: 'attachment', fileName: 'notes.txt', fileType: 'text/plain', extractedContent: 'file body' },
        { kind: 'attachment', fileName: 'empty.bin', fileType: undefined, extractedContent: undefined },
        { kind: 'file', fileName: 'photo.jpg', fileKind: 'image' },
        { kind: 'file', fileName: 'mystery', fileKind: undefined },
        { kind: 'image', mediaType: 'image/png', fileName: 'shot.png', data: 'aGk=' },
        { kind: 'image', mediaType: undefined, fileName: undefined, data: undefined },
      ]),
    );
    expect(validateRtfStructure(rtf)).toEqual([]);
    expect(rtf).toContain('Attachment: notes.txt (text/plain)');
    expect(rtf).toContain('file body');
    expect(rtf).toContain('Attachment: empty.bin');
    expect(rtf).toContain('[File: photo.jpg (image)]');
    expect(rtf).toContain('[File: mystery]');
    expect(rtf).toContain('[Image: shot.png (image/png)]');
    expect(rtf).toContain('[Image: inline image]');
    // Base64 image payloads are never inlined into the document.
    expect(rtf).not.toContain('aGk=');
  });

  it('renders unknown blocks with their label and raw JSON', () => {
    const rtf = serializeRtf(
      preparedWith([
        {
          kind: 'unknown',
          blockType: 'weather_card',
          raw: { type: 'weather_card', temp: 21 },
          label: 'Unsupported content (weather_card)',
        },
      ]),
    );
    expect(validateRtfStructure(rtf)).toEqual([]);
    expect(rtf).toContain('Unsupported content (weather_card)');
    expect(rtf).toContain('"temp": 21');
  });

  it('renders thinking summaries before the thinking body', () => {
    const rtf = serializeRtf(
      preparedWith([
        { kind: 'thinking', thinking: 'Deep thought body.', summaries: ['Summary one', 'Summary two'] },
      ]),
    );
    expect(validateRtfStructure(rtf)).toEqual([]);
    const posLabel = rtf.indexOf('Thinking');
    const posSummary = rtf.indexOf('Summary one');
    const posBody = rtf.indexOf('Deep thought body.');
    expect(posLabel).toBeGreaterThan(-1);
    expect(posSummary).toBeGreaterThan(posLabel);
    expect(posBody).toBeGreaterThan(posSummary);
  });
});

describe('validateRtfStructure', () => {
  it('flags a missing shell', () => {
    expect(validateRtfStructure('{\\pard hi\\par}')).toContain(
      'missing RTF shell prefix {\\rtf1\\ansi\\ansicpg1252',
    );
  });

  it('flags unbalanced braces', () => {
    expect(
      validateRtfStructure('{\\rtf1\\ansi\\ansicpg1252{\\fonttbl}{\\colortbl;}{open'),
    ).toEqual(['unbalanced braces: 2 group(s) left open']);
    expect(
      validateRtfStructure('{\\rtf1\\ansi\\ansicpg1252{\\fonttbl}{\\colortbl;}}}'),
    ).toEqual(['unbalanced closing brace at offset 46']);
  });

  it('ignores escaped braces when balancing', () => {
    expect(
      validateRtfStructure('{\\rtf1\\ansi\\ansicpg1252{\\fonttbl}{\\colortbl;}\\{\\}\\\\}'),
    ).toEqual([]);
  });
});
