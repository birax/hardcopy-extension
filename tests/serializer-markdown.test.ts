import { describe, expect, it } from 'vitest';

import { prepareConversation, resolveExportOptions } from '../src/lib/export';
import type { ExportOptions, PreparedBlock, PreparedConversation } from '../src/lib/export';
import { serializeMarkdown } from '../src/lib/export/serializers/markdown';
import { parseConversation } from '../src/lib/parser';
import { loadFixtures } from './harness';

/** The option permutations that matter for serializer output. */
const VARIANTS: ReadonlyArray<{ name: string; options: Partial<ExportOptions> }> = [
  { name: 'defaults', options: {} },
  {
    name: 'everything-on',
    options: {
      includeThinking: true,
      includeToolUse: true,
      includeToolResults: true,
      includeArtifacts: true,
      includeAttachments: true,
      includeTimestamps: true,
      includeConversationMetadata: true,
      branches: 'all',
    },
  },
  { name: 'branches-all', options: { branches: 'all' } },
];

/** Build a prepared view directly (bypassing the parser) for targeted tests. */
function preparedFrom(
  blocks: PreparedBlock[],
  overrides: Partial<ExportOptions> = {},
): PreparedConversation {
  return {
    options: resolveExportOptions(overrides),
    title: 'Test conversation',
    items: [
      { kind: 'message', sender: 'assistant', senderLabel: 'Claude', timestamp: undefined, blocks },
      {
        kind: 'message',
        sender: 'human',
        senderLabel: 'Human',
        timestamp: undefined,
        blocks: [{ kind: 'text', text: 'SENTINEL' }],
      },
    ],
  };
}

/**
 * CommonMark-ish fence scanner: returns whether the first line strictly equal
 * to `lineText` sits inside an open code fence. Throws when the line is absent
 * so structural assertions cannot silently pass on missing output.
 */
function insideFenceAt(output: string, lineText: string): boolean {
  let open: { char: string; length: number } | undefined;
  for (const line of output.split('\n')) {
    if (line === lineText) {
      return open !== undefined;
    }
    const match = /^ {0,3}(`{3,}|~{3,})(.*)$/.exec(line);
    if (match === null) {
      continue;
    }
    const run = match[1] ?? '';
    const rest = match[2] ?? '';
    const char = run.charAt(0);
    if (open === undefined) {
      if (!(char === '`' && rest.includes('`'))) {
        open = { char, length: run.length };
      }
    } else if (char === open.char && run.length >= open.length && rest.trim() === '') {
      open = undefined;
    }
  }
  throw new Error(`Line ${JSON.stringify(lineText)} not found in output`);
}

/** Output-wide invariants every serialization must satisfy. */
function expectWellFormed(output: string): void {
  expect(output.endsWith('\n'), 'must end with a newline').toBe(true);
  expect(output.endsWith('\n\n'), 'must end with a single newline').toBe(false);
  expect(/[ \t]\n/.test(output), 'no trailing spaces on any line').toBe(false);
  expect(/[ \t]\n?$/.test(output), 'no trailing spaces at the end').toBe(false);
}

describe('serializeMarkdown fixture snapshots', () => {
  for (const fixture of loadFixtures()) {
    for (const variant of VARIANTS) {
      it(`renders ${fixture.name} (${variant.name})`, () => {
        const { conversation } = parseConversation(fixture.raw);
        const prepared = prepareConversation(conversation, variant.options);
        const output = serializeMarkdown(prepared);

        expect(output).toMatchSnapshot();
        expectWellFormed(output);
        // Deterministic: preparing and serializing again yields identical bytes.
        expect(serializeMarkdown(prepareConversation(conversation, variant.options))).toBe(output);
      });
    }
  }
});

describe('fence escalation (T1 — embedded fences cannot break structure)', () => {
  it('wraps tool results containing ``` fences in longer fences', () => {
    const content = 'Example:\n```js\nconsole.log(1);\n```\nand a longer run: `````';
    const output = serializeMarkdown(
      preparedFrom(
        [{ kind: 'toolResult', name: 'repl', content, isError: false }],
        { includeToolResults: true },
      ),
    );

    // The generated fence is strictly longer than the longest embedded run (5).
    expect(output).toContain('``````\nExample:');
    expect(output).toContain('`````\n``````');
    expect(insideFenceAt(output, '## Human')).toBe(false);
    expectWellFormed(output);
  });

  it('escalates fences around hostile tool-use JSON input', () => {
    const output = serializeMarkdown(
      preparedFrom(
        [{ kind: 'toolUse', name: 'evil`tool`\nname', input: { code: '````\n# pwned\n````' } }],
        { includeToolUse: true },
      ),
    );

    // The label is a single line with escaped backticks.
    expect(output).toContain('**Tool use: evil\\`tool\\` name**');
    // JSON escapes the newlines, so runs stay inline — but the fence still
    // exceeds every backtick run in the encoded payload.
    expect(insideFenceAt(output, '## Human')).toBe(false);
    const openingFence = /`{3,}json/.exec(output)?.[0] ?? '';
    const longestRun = (output.match(/`+/g) ?? []).reduce((m, r) => Math.max(m, r.length), 0);
    expect(openingFence.length - 'json'.length).toBe(longestRun);
    expectWellFormed(output);
  });

  it('escalates fences around attachment extracted content', () => {
    const output = serializeMarkdown(
      preparedFrom(
        [
          {
            kind: 'attachment',
            fileName: 'notes.md',
            fileType: 'text/markdown',
            extractedContent: '````\n## Not a real heading\n````',
          },
        ],
        { includeAttachments: true },
      ),
    );

    expect(output).toContain('**Attachment: notes.md** (text/markdown)');
    expect(output).toContain('`````\n````');
    expect(insideFenceAt(output, '## Human')).toBe(false);
    expect(insideFenceAt(output, '## Not a real heading')).toBe(true);
    expectWellFormed(output);
  });

  it('escalates fences around artifact content and sanitizes the language hint', () => {
    const output = serializeMarkdown(
      preparedFrom([
        {
          kind: 'artifact',
          id: 'art-1',
          title: 'Hostile `artifact`',
          artifactType: 'application/vnd.ant.code',
          language: 'py`thon js',
          command: 'create',
          content: 'print("hi")\n```\n# escape attempt\n```',
          isFinal: true,
        },
      ]),
    );

    expect(output).toContain('### Artifact: Hostile \\`artifact\\`');
    expect(output).toContain('*application/vnd.ant.code · create · final version*');
    // Backticks and whitespace are stripped from the fence info string.
    expect(output).toContain('````pythonjs\n');
    expect(insideFenceAt(output, '## Human')).toBe(false);
    expect(insideFenceAt(output, '# escape attempt')).toBe(true);
    expectWellFormed(output);
  });

  it('escalates fences around unknown-block raw JSON', () => {
    const output = serializeMarkdown(
      preparedFrom([
        {
          kind: 'unknown',
          blockType: 'weather_card',
          raw: { type: 'weather_card', note: 'has ``` fence and ```` more' },
          label: 'Unsupported content (weather_card)',
        },
      ]),
    );

    expect(output).toContain('**Unsupported content (weather\\_card)**');
    expect(insideFenceAt(output, '## Human')).toBe(false);
    expectWellFormed(output);
  });
});

describe('pass-through text protection (T1 — unclosed fences)', () => {
  it('closes an unclosed backtick fence in a text block', () => {
    const output = serializeMarkdown(
      preparedFrom([{ kind: 'text', text: 'Look:\n```js\nconsole.log(1);\n// no closing fence' }]),
    );

    expect(insideFenceAt(output, '## Human')).toBe(false);
    expect(insideFenceAt(output, 'SENTINEL')).toBe(false);
    expectWellFormed(output);
  });

  it('closes an unclosed tilde fence in a text block', () => {
    const output = serializeMarkdown(
      preparedFrom([{ kind: 'text', text: 'Look:\n~~~~\nstill open' }]),
    );

    expect(output).toContain('still open\n~~~~');
    expect(insideFenceAt(output, '## Human')).toBe(false);
    expectWellFormed(output);
  });

  it('leaves balanced fences in text blocks untouched', () => {
    const text = 'Before\n\n```python\nprint("hi")\n```\n\nAfter';
    const output = serializeMarkdown(preparedFrom([{ kind: 'text', text }]));

    expect(output).toContain(text);
    expect(insideFenceAt(output, 'print("hi")')).toBe(true);
    expect(insideFenceAt(output, 'After')).toBe(false);
  });

  it('does not treat ``` with backticks in the info string as an opener', () => {
    // Per CommonMark, a backtick fence cannot have backticks in its info
    // string — such a line is plain text and must not flip fence state.
    const output = serializeMarkdown(
      preparedFrom([{ kind: 'text', text: 'weird: \n``` a`b\nnot a fence' }]),
    );

    expect(insideFenceAt(output, '## Human')).toBe(false);
    expect(output).not.toContain('not a fence\n```');
  });
});

describe('thinking sections (details injection)', () => {
  it('neutralizes </details> and </summary> inside thinking content', () => {
    const output = serializeMarkdown(
      preparedFrom(
        [
          {
            kind: 'thinking',
            thinking: 'Sneaky.\n\n</details>\n\n<summary>fake</summary>\n\n<details>reopen',
            summaries: ['A </summary> in a summary'],
          },
        ],
        { includeThinking: true },
      ),
    );

    // Exactly one real closing tag — the one we generate.
    const realClosers = output.split('\n').filter((line) => line === '</details>');
    expect(realClosers).toHaveLength(1);
    // Injected tags are escaped to literal text.
    expect(output).toContain('\\</details>');
    expect(output).toContain('\\<summary>fake\\</summary>');
    expect(output).toContain('\\<details>reopen');
    // The list-rendered summary is inline-escaped.
    expect(output).toContain('- *A \\</summary\\> in a summary*');
    expectWellFormed(output);
  });

  it('closes unclosed fences inside thinking so </details> stays a tag', () => {
    const output = serializeMarkdown(
      preparedFrom(
        [{ kind: 'thinking', thinking: 'Open fence:\n```\ntrapped?', summaries: [] }],
        { includeThinking: true },
      ),
    );

    const lines = output.split('\n');
    const closerIndex = lines.indexOf('</details>');
    expect(closerIndex).toBeGreaterThan(-1);
    expect(insideFenceAt(output, '</details>')).toBe(false);
    expect(insideFenceAt(output, '## Human')).toBe(false);
    expectWellFormed(output);
  });

  it('renders summaries as an italic list before the thinking body', () => {
    const output = serializeMarkdown(
      preparedFrom(
        [{ kind: 'thinking', thinking: 'The full reasoning.', summaries: ['First', 'Second'] }],
        { includeThinking: true },
      ),
    );

    expect(output).toContain(
      '<details>\n<summary>Thinking</summary>\n\n- *First*\n- *Second*\n\nThe full reasoning.\n\n</details>',
    );
  });

  it('renders an empty thinking block as an empty details section', () => {
    const output = serializeMarkdown(
      preparedFrom([{ kind: 'thinking', thinking: '', summaries: [] }], {
        includeThinking: true,
      }),
    );

    expect(output).toContain('<details>\n<summary>Thinking</summary>\n\n</details>');
    expectWellFormed(output);
  });
});

describe('heading and label injection', () => {
  it('collapses newlines and escapes markup in the title heading', () => {
    const output = serializeMarkdown({
      options: resolveExportOptions(),
      title: 'ignored',
      items: [
        {
          kind: 'metadata',
          title: 'Evil title\n# Injected heading **bold**',
          createdAt: { iso: 'junk', display: '*not-a-date*' },
          updatedAt: undefined,
        },
      ],
    });

    // Newlines collapse to spaces, so the injected `#` can never start a line;
    // emphasis markers are escaped to literal text.
    expect(output).toBe(
      '# Evil title # Injected heading \\*\\*bold\\*\\*\n\n*Created: \\*not-a-date\\**\n',
    );
  });

  it('escapes HTML in sender labels', () => {
    const output = serializeMarkdown({
      options: resolveExportOptions(),
      title: 'Test',
      items: [
        {
          kind: 'message',
          sender: '<script>alert(1)</script>',
          senderLabel: '<script>alert(1)</script>',
          timestamp: undefined,
          blocks: [{ kind: 'text', text: 'hello' }],
        },
      ],
    });

    expect(output).toContain('## \\<script\\>alert(1)\\</script\\>');
    expect(output).not.toContain('## <script>');
  });

  it('renders the timestamp as an italic subline under the sender heading', () => {
    const output = serializeMarkdown({
      options: resolveExportOptions({ includeTimestamps: true }),
      title: 'Test',
      items: [
        {
          kind: 'message',
          sender: 'human',
          senderLabel: 'Human',
          timestamp: { iso: '2026-05-20T18:44:10Z', display: '2026-05-20 18:44 UTC' },
          blocks: [{ kind: 'text', text: 'hi' }],
        },
      ],
    });

    expect(output).toBe('## Human\n\n*2026-05-20 18:44 UTC*\n\nhi\n');
  });
});

describe('remaining block and item shapes', () => {
  it('renders metadata date-line variants', () => {
    const stamp = { iso: '2026-01-02T03:04:05Z', display: '2026-01-02 03:04 UTC' };
    const meta = (createdAt?: typeof stamp, updatedAt?: typeof stamp): string =>
      serializeMarkdown({
        options: resolveExportOptions(),
        title: 'T',
        items: [{ kind: 'metadata', title: 'T', createdAt, updatedAt }],
      });

    expect(meta(stamp, stamp)).toBe(
      '# T\n\n*Created: 2026-01-02 03:04 UTC · Updated: 2026-01-02 03:04 UTC*\n',
    );
    expect(meta(undefined, stamp)).toBe('# T\n\n*Updated: 2026-01-02 03:04 UTC*\n');
    expect(meta(stamp, undefined)).toBe('# T\n\n*Created: 2026-01-02 03:04 UTC*\n');
    expect(meta(undefined, undefined)).toBe('# T\n');
  });

  it('marks the default branch in branch headings', () => {
    const output = serializeMarkdown({
      options: resolveExportOptions({ branches: 'all' }),
      title: 'T',
      items: [
        { kind: 'branchStart', branchIndex: 0, branchCount: 2, isDefaultBranch: false },
        { kind: 'branchStart', branchIndex: 1, branchCount: 2, isDefaultBranch: true },
      ],
    });

    expect(output).toBe('---\n\n## Branch 1 of 2\n\n---\n\n## Branch 2 of 2 (default)\n');
  });

  it('renders image labels for every metadata combination, never data URIs', () => {
    const output = serializeMarkdown(
      preparedFrom([
        { kind: 'image', mediaType: 'image/png', fileName: 'photo.png', data: 'AAAA' },
        { kind: 'image', mediaType: 'image/jpeg', fileName: undefined, data: 'BBBB' },
        { kind: 'image', mediaType: undefined, fileName: undefined, data: undefined },
      ]),
    );

    expect(output).toContain('*Image: photo.png*');
    expect(output).toContain('*Image (image/jpeg)*');
    expect(output).toContain('*Image*');
    expect(output).not.toContain('AAAA');
    expect(output).not.toContain('BBBB');
    expect(output).not.toContain('data:');
  });

  it('renders attachments without extracted content as a bare label', () => {
    const output = serializeMarkdown(
      preparedFrom(
        [
          { kind: 'attachment', fileName: 'scan.pdf', fileType: undefined, extractedContent: undefined },
          { kind: 'file', fileName: 'budget-q3.xlsx', fileKind: 'document' },
          { kind: 'file', fileName: 'mystery.bin', fileKind: undefined },
        ],
        { includeAttachments: true },
      ),
    );

    expect(output).toContain('**Attachment: scan.pdf**');
    expect(output).toContain('**File: budget-q3.xlsx** (document)');
    expect(output).toContain('**File: mystery.bin**');
    expectWellFormed(output);
  });

  it('flags tool-result errors and renders empty results as a bare label', () => {
    const output = serializeMarkdown(
      preparedFrom(
        [
          { kind: 'toolResult', name: 'repl', content: 'ReferenceError: x', isError: true },
          { kind: 'toolResult', name: undefined, content: '', isError: false },
        ],
        { includeToolResults: true },
      ),
    );

    expect(output).toContain('**Tool result (error): repl**\n\n```\nReferenceError: x\n```');
    expect(output).toContain('**Tool result**\n\n## Human');
    expectWellFormed(output);
  });

  it('falls back to the artifact id and omits the info string without a language', () => {
    const output = serializeMarkdown(
      preparedFrom([
        {
          kind: 'artifact',
          id: 'tip-calculator',
          title: undefined,
          artifactType: undefined,
          language: undefined,
          command: 'update',
          content: 'body\n',
          isFinal: false,
        },
      ]),
    );

    expect(output).toContain('### Artifact: tip-calculator\n\n*update*\n\n```\nbody\n```');
  });

  it('renders JSON-unrepresentable tool inputs visibly instead of dropping them', () => {
    const output = serializeMarkdown(
      preparedFrom(
        [
          { kind: 'toolUse', name: 'a', input: undefined },
          { kind: 'toolUse', name: 'b', input: 123n },
        ],
        { includeToolUse: true },
      ),
    );

    expect(output).toContain('**Tool use: a**\n\n```json\nundefined\n```');
    expect(output).toContain('**Tool use: b**\n\n```json\n123\n```');
  });

  it('serializes an empty prepared view to a single newline', () => {
    const output = serializeMarkdown({
      options: resolveExportOptions(),
      title: 'T',
      items: [],
    });

    expect(output).toBe('\n');
  });
});
