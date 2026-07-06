import { describe, expect, it } from 'vitest';

import { resolveExportOptions } from '../src/lib/export';
import type {
  ExportOptions,
  MessageItem,
  PreparedBlock,
  PreparedConversation,
  RenderItem,
} from '../src/lib/export';
import {
  A4_PAGE_SETUP,
  layoutConversation,
  PDF_COLORS,
} from '../src/lib/export/serializers/pdf/layout';
import type {
  PdfLayout,
  PdfPageSetup,
  PdfTextElement,
  PdfTextShaper,
} from '../src/lib/export/serializers/pdf/layout';

/**
 * Fake shaper: every character is `size * 0.5` wide, sanitize is identity.
 * Deterministic and font-free, so the suite exercises pure layout logic.
 */
const fakeShaper: PdfTextShaper = {
  sanitize: (text) => text,
  measure: (text, _face, size) => text.length * size * 0.5,
};

const options: ExportOptions = resolveExportOptions({
  includeThinking: true,
  includeToolUse: true,
  includeToolResults: true,
  includeAttachments: true,
  includeTimestamps: true,
});

function prepared(items: RenderItem[], title = 'Test conversation'): PreparedConversation {
  return { options, title, items };
}

function message(blocks: PreparedBlock[], overrides: Partial<MessageItem> = {}): MessageItem {
  return {
    kind: 'message',
    sender: 'assistant',
    senderLabel: 'Claude',
    timestamp: undefined,
    blocks,
    ...overrides,
  };
}

function text(value: string): PreparedBlock {
  return { kind: 'text', text: value };
}

function allTexts(layout: PdfLayout): PdfTextElement[] {
  return layout.pages.flatMap((page) => page.texts);
}

function textsOn(layout: PdfLayout, pageIndex: number): PdfTextElement[] {
  return layout.pages[pageIndex]?.texts ?? [];
}

function joined(layout: PdfLayout): string {
  return allTexts(layout)
    .map((element) => element.text)
    .join('\n');
}

/** Assert no text element extends past the right content edge. */
function expectWithinMargins(layout: PdfLayout, setup: PdfPageSetup = A4_PAGE_SETUP): void {
  const rightEdge = setup.pageWidth - setup.marginRight;
  for (const element of allTexts(layout)) {
    const width = fakeShaper.measure(element.text, element.face, element.size);
    expect(element.x, `"${element.text}" overflows`).toBeGreaterThanOrEqual(0);
    expect(element.x + width, `"${element.text}" overflows right edge`).toBeLessThanOrEqual(
      rightEdge + 0.01,
    );
  }
}

const TINY_PAGE: PdfPageSetup = {
  pageWidth: 320,
  pageHeight: 220,
  marginTop: 20,
  marginRight: 20,
  marginBottom: 30,
  marginLeft: 20,
};

describe('word wrap', () => {
  it('wraps a long paragraph within the content width', () => {
    const words = Array.from({ length: 120 }, (_, i) => `word${i}`).join(' ');
    const layout = layoutConversation(prepared([message([text(words)])]), fakeShaper);

    expectWithinMargins(layout);
    // All 120 words survive the wrap.
    const rendered = joined(layout);
    for (const word of ['word0', 'word60', 'word119']) {
      expect(rendered).toContain(word);
    }
    // And it actually wrapped: more than one distinct baseline.
    const baselines = new Set(allTexts(layout).map((element) => element.baseline));
    expect(baselines.size).toBeGreaterThan(3);
  });

  it('character-breaks an unbroken string wider than the line', () => {
    const monster = 'x'.repeat(600);
    const layout = layoutConversation(prepared([message([text(monster)])]), fakeShaper);

    expectWithinMargins(layout);
    const total = allTexts(layout)
      .filter((element) => element.text.includes('x'))
      .reduce((sum, element) => sum + element.text.length, 0);
    expect(total).toBe(600); // nothing truncated
  });

  it('preserves forced line breaks inside plain paragraphs', () => {
    const layout = layoutConversation(prepared([message([text('alpha\nbeta')])]), fakeShaper);
    const alpha = allTexts(layout).find((element) => element.text.includes('alpha'));
    const beta = allTexts(layout).find((element) => element.text.includes('beta'));
    expect(alpha).toBeDefined();
    expect(beta).toBeDefined();
    expect(beta?.baseline).toBeGreaterThan(alpha?.baseline ?? Infinity);
  });

  it('applies the shaper sanitize step to every drawn string', () => {
    const shouting: PdfTextShaper = {
      sanitize: (input) => input.toUpperCase(),
      measure: fakeShaper.measure,
    };
    const layout = layoutConversation(prepared([message([text('quiet words')])]), shouting);
    expect(joined(layout)).toContain('QUIET WORDS');
    expect(joined(layout)).not.toContain('quiet words');
  });
});

describe('markdown rendering', () => {
  it('maps bold, italic, code spans, and links to faces and colors', () => {
    const md = 'plain **bold** *ital* `mono()` [link](https://example.com)';
    const layout = layoutConversation(prepared([message([text(md)])]), fakeShaper);
    const texts = allTexts(layout);

    expect(texts.find((t) => t.text.includes('bold'))?.face).toBe('bold');
    expect(texts.find((t) => t.text.includes('ital'))?.face).toBe('italic');
    expect(texts.find((t) => t.text.includes('mono()'))?.face).toBe('mono');
    const link = texts.find((t) => t.text.includes('link'));
    expect(link?.color).toEqual(PDF_COLORS.accent);
  });

  it('renders headings larger, bold, and never orphaned at a page bottom', () => {
    // Sweep filler sizes so the heading lands at every possible page offset:
    // whichever page holds the heading must also hold its first body line.
    for (let filler = 1; filler <= 14; filler += 1) {
      const paragraphs = Array.from({ length: filler }, (_, i) => `p${i}`).join('\n\n');
      const md = `${paragraphs}\n\n## Anchor heading\n\nAnchorbody follows here`;
      const layout = layoutConversation(prepared([message([text(md)])]), fakeShaper, TINY_PAGE);

      const headingPage = layout.pages.findIndex((page) =>
        page.texts.some((t) => t.text.includes('Anchor heading')),
      );
      expect(headingPage).toBeGreaterThanOrEqual(0);
      const heading = textsOn(layout, headingPage).find((t) => t.text.includes('Anchor heading'));
      expect(heading?.face).toBe('bold');
      expect(heading?.size).toBeGreaterThan(10.5);
      expect(
        textsOn(layout, headingPage).some((t) => t.text.includes('Anchorbody')),
        `filler=${filler}: heading orphaned on page ${headingPage}`,
      ).toBe(true);
    }
  });

  it('indents nested lists progressively and keeps their markers', () => {
    const md = '- one\n  - two\n    - three deep items';
    const layout = layoutConversation(prepared([message([text(md)])]), fakeShaper);
    const texts = allTexts(layout);

    const one = texts.find((t) => t.text.includes('one'));
    const two = texts.find((t) => t.text.includes('two'));
    const three = texts.find((t) => t.text.includes('three'));
    expect(one).toBeDefined();
    expect((two?.x ?? 0) > (one?.x ?? 0)).toBe(true);
    expect((three?.x ?? 0) > (two?.x ?? 0)).toBe(true);
    expect(texts.filter((t) => t.text.startsWith('•')).length).toBe(3);
    expectWithinMargins(layout);
  });

  it('renders ordered lists with numbering and task lists with checkboxes', () => {
    const md = '3. third\n4. fourth\n\n- [x] done\n- [ ] todo';
    const layout = layoutConversation(prepared([message([text(md)])]), fakeShaper);
    const rendered = joined(layout);
    expect(rendered).toContain('3.');
    expect(rendered).toContain('4.');
    expect(rendered).toContain('[x]');
    expect(rendered).toContain('[ ]');
  });

  it('renders deep list nesting without escaping the margins', () => {
    const md = ['- a', '  - b', '    - c', '      - d', '        - e', '          - f'].join('\n');
    const layout = layoutConversation(prepared([message([text(md)])]), fakeShaper);
    expectWithinMargins(layout);
    expect(joined(layout)).toContain('f');
  });

  it('renders blockquotes indented, muted, and with a rule', () => {
    const layout = layoutConversation(
      prepared([message([text('> quoted wisdom\n\nafter')])]),
      fakeShaper,
    );
    const quote = allTexts(layout).find((t) => t.text.includes('quoted wisdom'));
    const after = allTexts(layout).find((t) => t.text.includes('after'));
    expect(quote?.color).toEqual(PDF_COLORS.secondary);
    expect((quote?.x ?? 0) > (after?.x ?? 0)).toBe(true);
    const hasQuoteRule = layout.pages.some((page) =>
      page.rects.some((rect) => rect.width < 4 && rect.color === PDF_COLORS.border),
    );
    expect(hasQuoteRule).toBe(true);
  });

  it('renders horizontal rules and tables (pipe fallback)', () => {
    const md = 'above\n\n---\n\n| a | b |\n| - | - |\n| 1 | 2 |';
    const layout = layoutConversation(prepared([message([text(md)])]), fakeShaper);
    expect(joined(layout)).toContain('a | b');
    expect(joined(layout)).toContain('1 | 2');
    const table = allTexts(layout).find((t) => t.text.includes('1 | 2'));
    expect(table?.face).toBe('mono');
  });

  it('renders raw HTML blocks verbatim in monospace instead of dropping them', () => {
    const layout = layoutConversation(
      prepared([message([text('<video src="x.mp4"></video>')])]),
      fakeShaper,
    );
    const html = allTexts(layout).find((t) => t.text.includes('<video'));
    expect(html?.face).toBe('mono');
  });

  it('decodes the HTML entities marked escapes in text and code spans', () => {
    const layout = layoutConversation(
      prepared([message([text('a < b & `x < y` "quoted"')])]),
      fakeShaper,
    );
    const rendered = joined(layout);
    expect(rendered).toContain('a < b &');
    expect(rendered).toContain('x < y');
    expect(rendered).not.toContain('&lt;');
    expect(rendered).not.toContain('&amp;');
  });
});

describe('code blocks', () => {
  const fence = (body: string): string => '```\n' + body + '\n```';

  it('preserves code lines exactly, including empty lines', () => {
    const layout = layoutConversation(
      prepared([message([text(fence('first\n\n  indented'))])]),
      fakeShaper,
    );
    // Three source lines → three shaded slabs, blank line included.
    const slabs = layout.pages.flatMap((page) =>
      page.rects.filter((rect) => rect.color === PDF_COLORS.subtleBg),
    );
    expect(slabs.length).toBe(3);
    // Leading whitespace survives (line-exact rendering).
    expect(allTexts(layout).some((t) => t.text.startsWith('  indented'))).toBe(true);
  });

  it('wraps very long code lines instead of truncating them', () => {
    const long = 'const x = "' + 'y'.repeat(400) + '";';
    const layout = layoutConversation(prepared([message([text(fence(long))])]), fakeShaper);
    expectWithinMargins(layout);
    const rendered = allTexts(layout)
      .map((t) => t.text)
      .join('');
    expect(rendered).toContain('const x = "');
    expect((rendered.match(/y/g) ?? []).length).toBe(400);
  });

  it('paginates a code block taller than one page, keeping the shading', () => {
    const body = Array.from({ length: 60 }, (_, i) => `line ${i}`).join('\n');
    const layout = layoutConversation(
      prepared([message([text(fence(body))])]),
      fakeShaper,
      TINY_PAGE,
    );
    expect(layout.pages.length).toBeGreaterThan(1);
    for (const [index, page] of layout.pages.entries()) {
      const hasCode = page.texts.some((t) => t.face === 'mono');
      if (hasCode) {
        expect(
          page.rects.some((rect) => rect.color === PDF_COLORS.subtleBg),
          `page ${index} lost its code shading`,
        ).toBe(true);
      }
    }
    expect(joined(layout)).toContain('line 59');
  });
});

describe('conversation structure', () => {
  it('renders the title block with metadata timestamps and an accent rule', () => {
    const layout = layoutConversation(
      prepared([
        {
          kind: 'metadata',
          title: 'Grand unified theory',
          createdAt: { iso: '2026-06-25T19:40:00Z', display: '2026-06-25 19:40 UTC' },
          updatedAt: { iso: '2026-06-26T08:00:00Z', display: '2026-06-26 08:00 UTC' },
        },
      ]),
      fakeShaper,
    );
    const title = allTexts(layout).find((t) => t.text.includes('Grand unified theory'));
    expect(title?.face).toBe('bold');
    expect(title?.size).toBeGreaterThan(16);
    const created = allTexts(layout).find((t) => t.text.includes('Created 2026-06-25 19:40 UTC'));
    expect(created?.color).toEqual(PDF_COLORS.secondary);
    expect(joined(layout)).toContain('Updated 2026-06-26 08:00 UTC');
    const accentRule = layout.pages[0]?.rects.find((rect) => rect.color === PDF_COLORS.accent);
    expect(accentRule).toBeDefined();
  });

  it('renders sender headings in the accent color with muted timestamps', () => {
    const layout = layoutConversation(
      prepared([
        message([text('hello there')], {
          timestamp: { iso: '2026-06-25T19:41:00Z', display: '2026-06-25 19:41 UTC' },
        }),
      ]),
      fakeShaper,
    );
    const sender = allTexts(layout).find((t) => t.text === 'Claude');
    expect(sender?.color).toEqual(PDF_COLORS.accent);
    expect(sender?.face).toBe('bold');
    const stamp = allTexts(layout).find((t) => t.text.includes('19:41 UTC'));
    expect(stamp?.color).toEqual(PDF_COLORS.secondary);
    expect(stamp?.size).toBeLessThan(10);
  });

  it('never leaves a sender heading orphaned at the bottom of a page', () => {
    for (let filler = 1; filler <= 14; filler += 1) {
      const fillerText = Array.from({ length: filler }, (_, i) => `f${i}`).join('\n\n');
      const layout = layoutConversation(
        prepared([
          message([text(fillerText)]),
          message([text('Replybody starts here')], { senderLabel: 'Speakertwo' }),
        ]),
        fakeShaper,
        TINY_PAGE,
      );
      const senderPage = layout.pages.findIndex((page) =>
        page.texts.some((t) => t.text === 'Speakertwo'),
      );
      expect(senderPage).toBeGreaterThanOrEqual(0);
      expect(
        textsOn(layout, senderPage).some((t) => t.text.includes('Replybody')),
        `filler=${filler}: sender heading orphaned`,
      ).toBe(true);
    }
  });

  it('renders branch markers with the current-branch note', () => {
    const layout = layoutConversation(
      prepared([
        { kind: 'branchStart', branchIndex: 0, branchCount: 2, isDefaultBranch: false },
        message([text('first branch')]),
        { kind: 'branchStart', branchIndex: 1, branchCount: 2, isDefaultBranch: true },
        message([text('second branch')]),
      ]),
      fakeShaper,
    );
    const rendered = joined(layout);
    expect(rendered).toContain('Branch 1 of 2');
    expect(rendered).toContain('Branch 2 of 2');
    const marker = allTexts(layout).find((t) => t.text.includes('Branch 2 of 2'));
    expect(marker?.color).toEqual(PDF_COLORS.accent);
    expect(rendered).toContain('current branch');
  });

  it('numbers every page as "Page i of n"', () => {
    const long = Array.from({ length: 80 }, (_, i) => `paragraph ${i}`).join('\n\n');
    const layout = layoutConversation(prepared([message([text(long)])]), fakeShaper, TINY_PAGE);
    expect(layout.pages.length).toBeGreaterThan(1);
    layout.pages.forEach((page, index) => {
      const footer = page.texts.find((t) => t.text.startsWith('Page '));
      expect(footer?.text).toBe(`Page ${index + 1} of ${layout.pages.length}`);
      expect(footer?.color).toEqual(PDF_COLORS.secondary);
      // The footer sits below the content area, inside the bottom margin.
      expect(footer?.baseline).toBeGreaterThan(TINY_PAGE.pageHeight - TINY_PAGE.marginBottom);
    });
  });

  it('lays out an empty conversation as a single numbered page', () => {
    const layout = layoutConversation(prepared([]), fakeShaper);
    expect(layout.pages.length).toBe(1);
    expect(joined(layout)).toBe('Page 1 of 1');
  });
});

describe('labelled insets', () => {
  it('renders thinking blocks with a label, summaries, and muted body', () => {
    const layout = layoutConversation(
      prepared([
        message([
          {
            kind: 'thinking',
            thinking: 'Deliberating about turtles.',
            summaries: ['Pondering turtles'],
          },
        ]),
      ]),
      fakeShaper,
    );
    const label = allTexts(layout).find((t) => t.text === 'Thinking');
    expect(label?.face).toBe('bold');
    const summary = allTexts(layout).find((t) => t.text.includes('Pondering turtles'));
    expect(summary?.face).toBe('italic');
    const body = allTexts(layout).find((t) => t.text.includes('Deliberating'));
    expect(body?.color).toEqual(PDF_COLORS.secondary);
    // Inset rule present.
    const hasRule = layout.pages[0]?.rects.some(
      (rect) => rect.width < 4 && rect.color === PDF_COLORS.accentTint,
    );
    expect(hasRule).toBe(true);
  });

  it('renders tool use with its input JSON in monospace', () => {
    const layout = layoutConversation(
      prepared([
        message([{ kind: 'toolUse', name: 'web_search', input: { query: 'turtles', max: 5 } }]),
      ]),
      fakeShaper,
    );
    expect(joined(layout)).toContain('Tool call — web_search');
    const json = allTexts(layout).find((t) => t.text.includes('"query": "turtles"'));
    expect(json?.face).toBe('mono');
  });

  it('renders failed tool results with error colors', () => {
    const layout = layoutConversation(
      prepared([
        message([
          { kind: 'toolResult', name: 'web_search', content: 'boom', isError: true },
          { kind: 'toolResult', name: undefined, content: 'fine', isError: false },
        ]),
      ]),
      fakeShaper,
    );
    const failed = allTexts(layout).find((t) => t.text === 'Tool result — web_search (error)');
    expect(failed?.color).toEqual(PDF_COLORS.error);
    const ok = allTexts(layout).find((t) => t.text === 'Tool result');
    expect(ok?.color).toEqual(PDF_COLORS.secondary);
    const errorSlab = layout.pages[0]?.rects.some((rect) => rect.color === PDF_COLORS.errorBg);
    expect(errorSlab).toBe(true);
  });

  it('renders artifacts as labelled code with language and final marker', () => {
    const layout = layoutConversation(
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
            isFinal: true,
          },
        ]),
      ]),
      fakeShaper,
    );
    expect(joined(layout)).toContain('Artifact — Fibonacci (create, python, final version)');
    const code = allTexts(layout).find((t) => t.text.includes('def fib(n):'));
    expect(code?.face).toBe('mono');
  });

  it('falls back to the artifact id when there is no title', () => {
    const layout = layoutConversation(
      prepared([
        message([
          {
            kind: 'artifact',
            id: 'art-2',
            title: undefined,
            artifactType: undefined,
            language: undefined,
            command: 'update',
            content: 'x',
            isFinal: false,
          },
        ]),
      ]),
      fakeShaper,
    );
    expect(joined(layout)).toContain('Artifact — art-2 (update)');
  });

  it('renders attachments, files, and images as labelled lines', () => {
    const layout = layoutConversation(
      prepared([
        message([
          {
            kind: 'attachment',
            fileName: 'notes.txt',
            fileType: 'text/plain',
            extractedContent: 'extracted notes body',
          },
          {
            kind: 'attachment',
            fileName: 'blank.txt',
            fileType: undefined,
            extractedContent: undefined,
          },
          { kind: 'file', fileName: 'photo.jpg', fileKind: 'image' },
          { kind: 'image', mediaType: 'image/png', fileName: 'chart.png', data: 'aGk=' },
          { kind: 'image', mediaType: undefined, fileName: undefined, data: undefined },
        ]),
      ]),
      fakeShaper,
    );
    const rendered = joined(layout);
    expect(rendered).toContain('Attachment — notes.txt (text/plain)');
    expect(rendered).toContain('extracted notes body');
    expect(rendered).toContain('Attachment — blank.txt');
    expect(rendered).toContain('File — photo.jpg (image)');
    expect(rendered).toContain('Image — chart.png (image/png)');
    expect(rendered).toContain('Image — inline image');
  });

  it('renders inline token variants: del, hard breaks, images, escapes', () => {
    const md = '~~struck~~ stays  \nnextline ![diagram](https://x/y.png) \\*literal\\*';
    const layout = layoutConversation(prepared([message([text(md)])]), fakeShaper);
    const rendered = joined(layout);
    expect(rendered).toContain('struck');
    expect(rendered).toContain('[image: diagram]');
    expect(rendered).toContain('*literal*');
    const stays = allTexts(layout).find((t) => t.text.includes('stays'));
    const next = allTexts(layout).find((t) => t.text.includes('nextline'));
    expect(next?.baseline).toBeGreaterThan(stays?.baseline ?? Infinity); // hard break
    expect(allTexts(layout).find((t) => t.text.includes('[image: diagram]'))?.face).toBe('italic');
  });

  it('keeps bold when emphasis nests inside strong (no bold-italic face)', () => {
    const layout = layoutConversation(
      prepared([message([text('**bold *bothstyles* tail**')])]),
      fakeShaper,
    );
    expect(allTexts(layout).find((t) => t.text.includes('bothstyles'))?.face).toBe('bold');
  });

  it('renders inline HTML and heading levels 5-6 without dropping content', () => {
    const md = 'press <kbd>K</kbd> now\n\n##### deep heading';
    const layout = layoutConversation(prepared([message([text(md)])]), fakeShaper);
    const kbd = allTexts(layout).find((t) => t.text.includes('<kbd>'));
    expect(kbd?.face).toBe('mono');
    const deep = allTexts(layout).find((t) => t.text.includes('deep heading'));
    expect(deep?.face).toBe('bold');
  });

  it('renders unrecognised markdown constructs (link definitions) as raw text', () => {
    const layout = layoutConversation(
      prepared([message([text('[ref]: https://example.com "Title"')])]),
      fakeShaper,
    );
    expect(joined(layout)).toContain('[ref]: https://example.com');
  });

  it('decodes quote entities inside code spans', () => {
    const layout = layoutConversation(
      prepared([message([text('run `"x" & \'y\' <z>` now')])]),
      fakeShaper,
    );
    const code = allTexts(layout).find((t) => t.face === 'mono');
    expect(code?.text).toContain('"x" & \'y\' <z>');
  });

  it('drops leading whitespace on forced-break continuation lines', () => {
    const layout = layoutConversation(prepared([message([text('foo\n    bar')])]), fakeShaper);
    const bar = allTexts(layout).find((t) => t.text.includes('bar'));
    expect(bar?.text).toBe('bar');
  });

  it('renders thinking blocks with no summaries and empty thinking text', () => {
    const layout = layoutConversation(
      prepared([message([{ kind: 'thinking', thinking: '  ', summaries: [] }])]),
      fakeShaper,
    );
    expect(joined(layout)).toContain('Thinking');
  });

  it('stringifies undefined and circular tool inputs without crashing', () => {
    const circular: { self?: unknown } = {};
    circular.self = circular;
    const layout = layoutConversation(
      prepared([
        message([
          { kind: 'toolUse', name: 'mystery', input: undefined },
          { kind: 'toolUse', name: 'ouroboros', input: circular },
        ]),
      ]),
      fakeShaper,
    );
    const rendered = joined(layout);
    expect(rendered).toContain('undefined');
    expect(rendered).toContain('[object Object]');
  });

  it('renders future render-item and block kinds as labelled unknowns', () => {
    const futureItem = { kind: 'hologram', payload: 1 } as unknown as RenderItem;
    const futureBlock = { kind: 'smellovision' } as unknown as PreparedBlock;
    const layout = layoutConversation(prepared([futureItem, message([futureBlock])]), fakeShaper);
    const rendered = joined(layout);
    expect(rendered).toContain('Unsupported content (hologram)');
    expect(rendered).toContain('Unsupported content (smellovision)');
  });

  it('renders unknown blocks visibly with warning shading and the raw JSON', () => {
    const layout = layoutConversation(
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
      fakeShaper,
    );
    const label = allTexts(layout).find((t) => t.text === 'Unsupported content (weather_card)');
    expect(label?.color).toEqual(PDF_COLORS.warn);
    expect(joined(layout)).toContain('"city": "Lisbon"');
    const shaded = layout.pages[0]?.rects.some((rect) => rect.color === PDF_COLORS.warnBg);
    expect(shaded).toBe(true);
  });
});
