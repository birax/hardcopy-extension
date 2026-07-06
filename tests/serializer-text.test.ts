import { describe, expect, it } from 'vitest';

import type { ExportOptions } from '../src/lib/export/options';
import { DEFAULT_EXPORT_OPTIONS, resolveExportOptions } from '../src/lib/export/options';
import { prepareConversation } from '../src/lib/export/prepare';
import type { MessageItem, PreparedConversation } from '../src/lib/export/prepare';
import { serializeText } from '../src/lib/export/serializers/text';
import { parseConversation } from '../src/lib/parser';
import { loadFixture, loadFixtures } from './harness';

/** The options matrix every fixture is snapshotted under. */
const OPTION_MATRIX: ReadonlyArray<[name: string, overrides: Partial<ExportOptions>]> = [
  ['defaults', {}],
  [
    'everything-on',
    {
      includeThinking: true,
      includeToolUse: true,
      includeToolResults: true,
      includeArtifacts: true,
      includeAttachments: true,
      includeTimestamps: true,
      includeConversationMetadata: true,
      branches: 'all',
    },
  ],
  ['branches-all', { branches: 'all' }],
];

function serializeFixture(name: string, overrides: Partial<ExportOptions>): string {
  const { conversation } = parseConversation(loadFixture(name).raw);
  return serializeText(prepareConversation(conversation, overrides));
}

/** A minimal prepared conversation for direct edge-case tests. */
function prepared(overrides: Partial<PreparedConversation>): PreparedConversation {
  return {
    options: resolveExportOptions(),
    title: 'Test',
    items: [],
    ...overrides,
  };
}

/** A single-block assistant message item. */
function message(blocks: MessageItem['blocks'], timestamp?: MessageItem['timestamp']): MessageItem {
  return { kind: 'message', sender: 'assistant', senderLabel: 'Claude', timestamp, blocks };
}

describe('serializeText fixture snapshots', () => {
  for (const fixture of loadFixtures()) {
    for (const [matrixName, overrides] of OPTION_MATRIX) {
      it(`serializes ${fixture.name} (${matrixName})`, () => {
        expect(serializeFixture(fixture.name, overrides)).toMatchSnapshot();
      });
    }
  }
});

describe('serializeText output hygiene', () => {
  it('is deterministic, has no trailing whitespace, and ends with one newline', () => {
    for (const fixture of loadFixtures()) {
      for (const [, overrides] of OPTION_MATRIX) {
        const first = serializeFixture(fixture.name, overrides);
        const second = serializeFixture(fixture.name, overrides);
        expect(second).toBe(first);
        expect(first).toMatch(/[^\n]\n$/u);
        for (const line of first.split('\n')) {
          expect(line).toBe(line.replace(/\s+$/u, ''));
        }
      }
    }
  });

  it('returns the empty string when there is nothing to render', () => {
    expect(serializeText(prepared({ items: [] }))).toBe('');
  });
});

describe('serializeText header and metadata', () => {
  it('underlines the title with = and puts both dates beneath', () => {
    const output = serializeFixture('simple-text', {});
    expect(output.startsWith('Planning a vegetable garden\n' + '='.repeat(27) + '\n')).toBe(true);
    expect(output).toContain('Created: 2026-05-14 09:12 UTC · Updated: 2026-05-14 09:13 UTC');
  });

  it('falls back to the default title when the conversation has none', () => {
    const raw = loadFixture('simple-text').raw as Record<string, unknown>;
    const { conversation } = parseConversation({ ...raw, name: '' });
    const output = serializeText(prepareConversation(conversation));
    expect(output.startsWith('Claude conversation\n' + '='.repeat(19) + '\n')).toBe(true);
  });

  it('sizes the underline by code points for emoji/unicode titles', () => {
    const output = serializeText(
      prepared({
        title: 'Café ☕ plans',
        items: [
          { kind: 'metadata', title: 'Café ☕ plans', createdAt: undefined, updatedAt: undefined },
        ],
      }),
    );
    expect(output).toBe('Café ☕ plans\n============\n');
  });

  it('renders a metadata line with only the known date', () => {
    const output = serializeText(
      prepared({
        items: [
          {
            kind: 'metadata',
            title: 'T',
            createdAt: { iso: '2026-01-02T03:04:05Z', display: '2026-01-02 03:04 UTC' },
            updatedAt: undefined,
          },
        ],
      }),
    );
    expect(output).toBe('T\n=\nCreated: 2026-01-02 03:04 UTC\n');
  });

  it('omits the header entirely when includeConversationMetadata is off', () => {
    const output = serializeFixture('simple-text', { includeConversationMetadata: false });
    expect(output).not.toContain('Planning a vegetable garden\n===');
    expect(output.startsWith('────────────────────────\nHuman\n')).toBe(true);
  });
});

describe('serializeText message layout', () => {
  it('separates messages with a rule and the speaker label', () => {
    const output = serializeFixture('simple-text', {});
    expect(output).toContain('\n\n────────────────────────\nHuman\n\n');
    expect(output).toContain('\n\n────────────────────────\nClaude\n\n');
  });

  it('appends the timestamp to the speaker line when enabled', () => {
    const output = serializeFixture('simple-text', { includeTimestamps: true });
    expect(output).toContain('\nHuman · 2026-05-14 09:12 UTC\n');
  });

  it('marks every branch with a labelled heavy-rule divider', () => {
    const output = serializeFixture('branched-tree', { branches: 'all' });
    expect(output).toContain('════════════════════════\nBranch 1 of 2\n════════════════════════');
    expect(output).toContain(
      '════════════════════════\nBranch 2 of 2 (current)\n════════════════════════',
    );
  });

  it('emits no branch markers for linear conversations even with branches: all', () => {
    const output = serializeFixture('simple-text', { branches: 'all' });
    expect(output).not.toContain('Branch 1');
    expect(output).not.toContain('═');
  });
});

describe('serializeText blocks', () => {
  it('keeps markdown text verbatim without re-wrapping', () => {
    const longLine = `const x = ${'"a" + '.repeat(60)}'done'; // ${'y'.repeat(120)}`;
    const text = `Intro paragraph.\n\n\`\`\`js\n${longLine}\n\`\`\`\n\n- bullet **bold**`;
    const output = serializeText(prepared({ items: [message([{ kind: 'text', text }])] }));
    expect(output).toContain(text);
    expect(output.split('\n')).toContain(longLine);
  });

  it('renders thinking as an indented block with summary bullets', () => {
    const output = serializeFixture('thinking', { includeThinking: true });
    expect(output).toContain('[Thinking]\n    - Calculating wall area minus doors and window\n');
    expect(output).toMatch(/\[Thinking\]\n {4}\S/u);
  });

  it('renders tool use with pretty-printed JSON input', () => {
    const output = serializeFixture('tool-use', { includeToolUse: true });
    expect(output).toMatch(/\[Tool: \S+\]\n {4}\{\n {6}"/u);
  });

  it('labels tool results, flagging errors', () => {
    const output = serializeFixture('tool-use', { includeToolResults: true });
    expect(output).toContain('[Tool result');
    expect(output).toContain('(error)]');
    expect(output).toContain('ReferenceError');
  });

  it('renders artifacts with title, language, and indented content', () => {
    const output = serializeFixture('artifacts', {});
    expect(output).toContain('[Artifact: Tip calculator (python)]');
    expect(output).toContain('\n    def tip(');
    expect(output).toContain('percent: float = 12.5');
    expect(output).toContain('percent: float = 15.0');
  });

  it('renders artifact commands as plain tool use when artifacts are off', () => {
    const output = serializeFixture('artifacts', {
      includeArtifacts: false,
      includeToolUse: true,
    });
    expect(output).not.toContain('[Artifact:');
    expect(output).toContain('[Tool: artifacts]');
  });

  it('renders images and attachments as one-line labels with file names', () => {
    const images = serializeFixture('images', {});
    expect(images).toMatch(/\[Image[: (]/u);

    const attachments = serializeFixture('attachments-files', { includeAttachments: true });
    expect(attachments).toContain('[Attachment: meeting-notes.txt (text/plain)]');
    expect(attachments).toContain('    Sprint review 12 June');
    expect(attachments).toContain('[File: budget-q3.xlsx (document)]');
  });

  it('renders unknown blocks visibly with their raw JSON', () => {
    const output = serializeFixture('unknown-block', {});
    expect(output).toContain('[Unrecognised content: Unsupported content (weather_card)]');
    expect(output).toContain('"type": "weather_card"');
    expect(output).toContain('"location": "Portsmouth, UK"');
  });
});

describe('serializeText edge cases', () => {
  it('handles label-only fallbacks for sparse blocks', () => {
    const output = serializeText(
      prepared({
        items: [
          message(
            [
              { kind: 'image', mediaType: undefined, fileName: undefined, data: undefined },
              { kind: 'image', mediaType: 'image/png', fileName: undefined, data: undefined },
              { kind: 'image', mediaType: 'image/jpeg', fileName: 'holiday.jpg', data: undefined },
              { kind: 'file', fileName: 'notes.bin', fileKind: undefined },
              {
                kind: 'attachment',
                fileName: 'empty.txt',
                fileType: undefined,
                extractedContent: undefined,
              },
              { kind: 'toolResult', name: undefined, content: '', isError: false },
              {
                kind: 'artifact',
                id: 'art-1',
                title: undefined,
                artifactType: undefined,
                language: undefined,
                command: 'create',
                content: 'hello',
                isFinal: true,
              },
            ],
            { iso: '2026-01-01T00:00:00Z', display: '2026-01-01 00:00 UTC' },
          ),
        ],
      }),
    );
    expect(output).toContain('Claude · 2026-01-01 00:00 UTC');
    expect(output).toContain('\n[Image]\n');
    expect(output).toContain('[Image (image/png)]');
    expect(output).toContain('[Image: holiday.jpg]');
    expect(output).toContain('[File: notes.bin]');
    expect(output).toContain('[Attachment: empty.txt]');
    expect(output).toContain('[Tool result]');
    expect(output).toContain('[Artifact: art-1]\n    hello');
  });

  it('falls back to String() for non-JSON-serializable tool input', () => {
    const output = serializeText(
      prepared({
        items: [
          message([
            { kind: 'toolUse', name: 'noop', input: undefined },
            { kind: 'toolUse', name: 'bignum', input: 10n as unknown },
          ]),
        ],
      }),
    );
    expect(output).toContain('[Tool: noop]\n    undefined');
    expect(output).toContain('[Tool: bignum]\n    10');
  });

  it('preserves blank lines inside indented content without adding whitespace', () => {
    const output = serializeText(
      prepared({
        items: [
          message([
            {
              kind: 'thinking',
              thinking: 'first paragraph\n\nsecond paragraph',
              summaries: [],
            },
          ]),
        ],
      }),
    );
    expect(output).toContain('[Thinking]\n    first paragraph\n\n    second paragraph');
  });

  it('strips trailing whitespace introduced by source text', () => {
    const output = serializeText(
      prepared({ items: [message([{ kind: 'text', text: 'line one   \nline two\t\n\n\n' }])] }),
    );
    expect(output).toBe('────────────────────────\nClaude\n\nline one\nline two\n');
  });

  it('uses defaults that match DEFAULT_EXPORT_OPTIONS semantics', () => {
    // Defaults: no thinking/tools/timestamps, artifacts and metadata on.
    expect(DEFAULT_EXPORT_OPTIONS.includeArtifacts).toBe(true);
    const output = serializeFixture('thinking', {});
    expect(output).not.toContain('[Thinking]');
    expect(output).not.toContain('[Tool');
  });
});
