import { describe, expect, it } from 'vitest';

import {
  DEFAULT_CONVERSATION_TITLE,
  DEFAULT_EXPORT_OPTIONS,
  EXPORT_FORMAT_LIST,
  EXPORT_FORMATS,
  isExportFormat,
  prepareConversation,
  resolveExportOptions,
} from '../src/lib/export';
import type {
  ExportOptions,
  MessageItem,
  PreparedBlock,
  PreparedConversation,
} from '../src/lib/export';
import type { Conversation, Message } from '../src/lib/model';
import { parseConversation } from '../src/lib/parser';
import { loadFixture, loadFixtures } from './harness';

/** Parse a fixture into its conversation AST. */
function conversationFrom(name: string): Conversation {
  return parseConversation(loadFixture(name).raw).conversation;
}

/** All message items of a prepared view, in order. */
function messageItems(prepared: PreparedConversation): MessageItem[] {
  return prepared.items.filter((item): item is MessageItem => item.kind === 'message');
}

/** All prepared blocks across all message items, in order. */
function allBlocks(prepared: PreparedConversation): PreparedBlock[] {
  return messageItems(prepared).flatMap((message) => message.blocks);
}

/** All prepared blocks of one kind. */
function blocksOf<K extends PreparedBlock['kind']>(
  prepared: PreparedConversation,
  kind: K,
): Extract<PreparedBlock, { kind: K }>[] {
  return allBlocks(prepared).filter(
    (block): block is Extract<PreparedBlock, { kind: K }> => block.kind === kind,
  );
}

const EVERYTHING_ON: Partial<ExportOptions> = {
  includeThinking: true,
  includeToolUse: true,
  includeToolResults: true,
  includeArtifacts: true,
  includeAttachments: true,
  includeTimestamps: true,
  includeConversationMetadata: true,
};

const EVERYTHING_OFF: Partial<ExportOptions> = {
  includeThinking: false,
  includeToolUse: false,
  includeToolResults: false,
  includeArtifacts: false,
  includeAttachments: false,
  includeTimestamps: false,
  includeConversationMetadata: false,
};

describe('DEFAULT_EXPORT_OPTIONS', () => {
  it('matches the agreed defaults', () => {
    expect(DEFAULT_EXPORT_OPTIONS).toEqual({
      includeThinking: false,
      includeToolUse: false,
      includeToolResults: false,
      includeArtifacts: true,
      includeAttachments: false,
      includeTimestamps: false,
      includeConversationMetadata: true,
      branches: 'current',
    });
  });

  it('is frozen against accidental mutation', () => {
    expect(() => {
      (DEFAULT_EXPORT_OPTIONS as ExportOptions).includeThinking = true;
    }).toThrow(TypeError);
  });
});

describe('resolveExportOptions', () => {
  it('returns a fresh copy of the defaults with no overrides', () => {
    const resolved = resolveExportOptions();
    expect(resolved).toEqual(DEFAULT_EXPORT_OPTIONS);
    expect(resolved).not.toBe(DEFAULT_EXPORT_OPTIONS);
  });

  it('applies overrides on top of the defaults', () => {
    const resolved = resolveExportOptions({ includeThinking: true, branches: 'all' });
    expect(resolved.includeThinking).toBe(true);
    expect(resolved.branches).toBe('all');
    expect(resolved.includeArtifacts).toBe(true);
  });

  it('ignores keys set to undefined', () => {
    const resolved = resolveExportOptions({ includeArtifacts: undefined });
    expect(resolved.includeArtifacts).toBe(true);
  });

  it('ignores unknown keys', () => {
    const resolved = resolveExportOptions({ bogus: true } as Partial<ExportOptions>);
    expect(resolved).toEqual(DEFAULT_EXPORT_OPTIONS);
  });
});

describe('EXPORT_FORMATS', () => {
  it('registers all five formats with consistent keys and extensions', () => {
    expect(Object.keys(EXPORT_FORMATS).sort()).toEqual(['docx', 'markdown', 'pdf', 'rtf', 'text']);
    for (const [key, info] of Object.entries(EXPORT_FORMATS)) {
      expect(info.format).toBe(key);
      expect(info.label).not.toBe('');
      expect(info.extension).toMatch(/^[a-z0-9]+$/);
      expect(info.mimeType).toContain('/');
    }
    expect(EXPORT_FORMATS.markdown.extension).toBe('md');
    expect(EXPORT_FORMATS.text.extension).toBe('txt');
    expect(EXPORT_FORMAT_LIST).toHaveLength(5);
  });

  it('detects supported format names', () => {
    expect(isExportFormat('markdown')).toBe(true);
    expect(isExportFormat('pdf')).toBe(true);
    expect(isExportFormat('html')).toBe(false);
    expect(isExportFormat(42)).toBe(false);
    expect(isExportFormat(undefined)).toBe(false);
  });
});

describe('prepareConversation metadata and timestamps', () => {
  it('emits a metadata header first by default', () => {
    const prepared = prepareConversation(conversationFrom('simple-text'));
    const [first] = prepared.items;
    expect(first).toEqual({
      kind: 'metadata',
      title: 'Planning a vegetable garden',
      createdAt: { iso: '2026-05-14T09:12:03.512847Z', display: '2026-05-14 09:12 UTC' },
      updatedAt: expect.objectContaining({ display: expect.stringContaining('UTC') }),
    });
    expect(prepared.title).toBe('Planning a vegetable garden');
  });

  it('omits the metadata header when includeConversationMetadata is off', () => {
    const prepared = prepareConversation(conversationFrom('simple-text'), {
      includeConversationMetadata: false,
    });
    expect(prepared.items.every((item) => item.kind !== 'metadata')).toBe(true);
  });

  it('omits message timestamps by default and resolves them when asked', () => {
    const conversation = conversationFrom('thinking');

    const withoutTimestamps = prepareConversation(conversation);
    for (const message of messageItems(withoutTimestamps)) {
      expect(message.timestamp).toBeUndefined();
    }

    const withTimestamps = prepareConversation(conversation, { includeTimestamps: true });
    const [first] = messageItems(withTimestamps);
    expect(first?.timestamp).toEqual({
      iso: '2026-05-20T18:44:10.038512Z',
      display: '2026-05-20 18:44 UTC',
    });
  });

  it('echoes the fully-resolved options on the prepared view', () => {
    const prepared = prepareConversation(conversationFrom('simple-text'), { branches: 'all' });
    expect(prepared.options).toEqual({ ...DEFAULT_EXPORT_OPTIONS, branches: 'all' });
  });
});

describe('prepareConversation block filtering', () => {
  it('excludes thinking by default and includes it (with summaries) on request', () => {
    const conversation = conversationFrom('thinking');

    expect(blocksOf(prepareConversation(conversation), 'thinking')).toEqual([]);

    const thinking = blocksOf(
      prepareConversation(conversation, { includeThinking: true }),
      'thinking',
    );
    expect(thinking).toHaveLength(2);
    expect(thinking[0]?.summaries).toEqual([
      'Calculating wall area minus doors and window',
      'Converting coverage into litres for two coats',
    ]);
    expect(thinking[1]?.thinking).toContain('Ceiling area');
  });

  it('excludes tool use and results by default and includes them on request', () => {
    const conversation = conversationFrom('tool-use');

    const withDefaults = prepareConversation(conversation);
    expect(blocksOf(withDefaults, 'toolUse')).toEqual([]);
    expect(blocksOf(withDefaults, 'toolResult')).toEqual([]);

    const withTools = prepareConversation(conversation, {
      includeToolUse: true,
      includeToolResults: true,
    });
    const toolUse = blocksOf(withTools, 'toolUse');
    expect(toolUse.map((block) => block.name)).toEqual(['web_search', 'repl']);
    expect(toolUse[0]?.input).toBeDefined();

    const results = blocksOf(withTools, 'toolResult');
    expect(results).toHaveLength(2);
    expect(results[0]?.isError).toBe(false);
    expect(results[1]?.isError).toBe(true);
    expect(results[1]?.content).toContain('ReferenceError');
  });

  it('keeps blocks in message order (tool use interleaved with text)', () => {
    const prepared = prepareConversation(conversationFrom('tool-use'), {
      includeToolUse: true,
      includeToolResults: true,
    });
    const [, assistant] = messageItems(prepared);
    expect(assistant?.blocks.map((block) => block.kind)).toEqual([
      'toolUse',
      'toolResult',
      'toolUse',
      'toolResult',
      'text',
    ]);
  });

  it('excludes attachments and files by default and lists them first on request', () => {
    const conversation = conversationFrom('attachments-files');

    const withDefaults = prepareConversation(conversation);
    expect(blocksOf(withDefaults, 'attachment')).toEqual([]);
    expect(blocksOf(withDefaults, 'file')).toEqual([]);

    const withAttachments = prepareConversation(conversation, { includeAttachments: true });
    const [human] = messageItems(withAttachments);
    expect(human?.blocks.map((block) => block.kind)).toEqual(['attachment', 'file', 'text']);
    expect(human?.blocks[0]).toEqual({
      kind: 'attachment',
      fileName: 'meeting-notes.txt',
      fileType: 'text/plain',
      extractedContent: expect.stringContaining('Sprint review 12 June'),
    });
    expect(human?.blocks[1]).toEqual({
      kind: 'file',
      fileName: 'budget-q3.xlsx',
      fileKind: 'document',
    });
  });

  it('always includes inline images', () => {
    const prepared = prepareConversation(conversationFrom('images'), EVERYTHING_OFF);
    const images = blocksOf(prepared, 'image');
    expect(images).toHaveLength(1);
    expect(images[0]?.mediaType).toBe('image/png');
    expect(images[0]?.data).toBeDefined();
  });

  it('never drops unknown blocks, whatever the options', () => {
    const conversation = conversationFrom('unknown-block');
    for (const overrides of [undefined, EVERYTHING_OFF, EVERYTHING_ON]) {
      const unknown = blocksOf(prepareConversation(conversation, overrides), 'unknown');
      expect(unknown).toHaveLength(1);
      expect(unknown[0]?.blockType).toBe('weather_card');
      expect(unknown[0]?.label).toBe('Unsupported content (weather_card)');
      expect(unknown[0]?.raw).toMatchObject({ type: 'weather_card' });
    }
  });
});

describe('prepareConversation artifacts', () => {
  it('renders every artifact command as a full-content snapshot by default', () => {
    const prepared = prepareConversation(conversationFrom('artifacts'));

    expect(blocksOf(prepared, 'toolUse')).toEqual([]);
    expect(blocksOf(prepared, 'toolResult')).toEqual([]);

    const artifacts = blocksOf(prepared, 'artifact');
    expect(artifacts.map((block) => block.command)).toEqual(['create', 'update', 'update']);
    expect(artifacts.map((block) => block.isFinal)).toEqual([false, false, true]);
    expect(artifacts[0]?.content).toContain('percent: float = 12.5');
    expect(artifacts[1]?.content).toContain('percent: float = 15.0');
    expect(artifacts[2]?.content).toContain('Each pays');
    for (const block of artifacts) {
      expect(block.id).toBe('tip-calculator');
      expect(block.title).toBe('Tip calculator');
      expect(block.language).toBe('python');
    }
  });

  it('renders artifact commands as plain tool use when artifacts are off but tool use is on', () => {
    const prepared = prepareConversation(conversationFrom('artifacts'), {
      includeArtifacts: false,
      includeToolUse: true,
    });
    expect(blocksOf(prepared, 'artifact')).toEqual([]);
    expect(blocksOf(prepared, 'toolUse').map((block) => block.name)).toEqual([
      'artifacts',
      'artifacts',
      'artifacts',
    ]);
  });

  it('never renders an artifact command twice when both toggles are on', () => {
    const prepared = prepareConversation(conversationFrom('artifacts'), {
      includeToolUse: true,
    });
    expect(blocksOf(prepared, 'artifact')).toHaveLength(3);
    expect(blocksOf(prepared, 'toolUse')).toEqual([]);
  });

  it('drops artifact commands entirely when both toggles are off', () => {
    const prepared = prepareConversation(conversationFrom('artifacts'), {
      includeArtifacts: false,
    });
    expect(blocksOf(prepared, 'artifact')).toEqual([]);
    expect(blocksOf(prepared, 'toolUse')).toEqual([]);
  });
});

describe('prepareConversation branches', () => {
  it("renders only the current branch with branches: 'current'", () => {
    const conversation = conversationFrom('branched-tree');
    const prepared = prepareConversation(conversation);

    expect(prepared.items.every((item) => item.kind !== 'branchStart')).toBe(true);
    const messages = messageItems(prepared);
    expect(messages).toHaveLength(4);

    // The rendered messages are the default branch, not the first one.
    const defaultBranch = conversation.branches[conversation.defaultBranchIndex];
    expect(messages.map((message) => message.blocks[0])).toEqual(
      defaultBranch?.map((message) => ({
        kind: 'text',
        text: (message.blocks[0]?.type === 'text' && message.blocks[0].text) || '',
      })),
    );
  });

  it("renders every branch, marker first, with branches: 'all'", () => {
    const prepared = prepareConversation(conversationFrom('branched-tree'), { branches: 'all' });

    expect(prepared.items.map((item) => item.kind)).toEqual([
      'metadata',
      'branchStart',
      'message',
      'message',
      'message',
      'message',
      'branchStart',
      'message',
      'message',
      'message',
      'message',
    ]);

    const markers = prepared.items.filter((item) => item.kind === 'branchStart');
    expect(markers).toEqual([
      { kind: 'branchStart', branchIndex: 0, branchCount: 2, isDefaultBranch: false },
      { kind: 'branchStart', branchIndex: 1, branchCount: 2, isDefaultBranch: true },
    ]);
  });

  it("adds no branch markers to a linear conversation, even with branches: 'all'", () => {
    const prepared = prepareConversation(conversationFrom('simple-text'), { branches: 'all' });
    expect(prepared.items.every((item) => item.kind !== 'branchStart')).toBe(true);
    expect(messageItems(prepared)).toHaveLength(2);
  });
});

describe('prepareConversation degenerate inputs', () => {
  const thinkingOnlyMessage: Message = {
    id: 'm1',
    parentId: null,
    sender: 'assistant',
    createdAt: undefined,
    updatedAt: undefined,
    blocks: [{ type: 'thinking', thinking: 'private reasoning', summaries: [] }],
    attachments: [],
    files: [],
  };
  const systemMessage: Message = {
    id: 'm2',
    parentId: 'm1',
    sender: 'system',
    createdAt: undefined,
    updatedAt: undefined,
    blocks: [{ type: 'text', text: 'A system note.' }],
    attachments: [],
    files: [],
  };
  const synthetic: Conversation = {
    id: 'c1',
    title: '   ',
    summary: '',
    createdAt: undefined,
    updatedAt: 'not-a-date',
    source: 'chat',
    messages: [thinkingOnlyMessage, systemMessage],
    branches: [[thinkingOnlyMessage, systemMessage]],
    defaultBranchIndex: 0,
    hasBranches: false,
  };

  it('falls back to the default title and tolerates missing/invalid dates', () => {
    const prepared = prepareConversation(synthetic);
    expect(prepared.title).toBe(DEFAULT_CONVERSATION_TITLE);

    const [metadata] = prepared.items;
    expect(metadata).toEqual({
      kind: 'metadata',
      title: DEFAULT_CONVERSATION_TITLE,
      createdAt: undefined,
      updatedAt: { iso: 'not-a-date', display: 'not-a-date' },
    });
  });

  it('omits messages whose blocks were all filtered out', () => {
    const prepared = prepareConversation(synthetic);
    const messages = messageItems(prepared);
    expect(messages).toHaveLength(1);
    expect(messages[0]?.sender).toBe('system');
  });

  it('labels human/assistant senders and passes unrecognised ones through', () => {
    const prepared = prepareConversation(synthetic, { includeThinking: true });
    expect(messageItems(prepared).map((message) => message.senderLabel)).toEqual([
      'Claude',
      'system',
    ]);
    const chat = prepareConversation(conversationFrom('simple-text'));
    expect(messageItems(chat).map((message) => message.senderLabel)).toEqual(['Human', 'Claude']);
  });

  it('omits the timestamp when a message has none, even with includeTimestamps', () => {
    const prepared = prepareConversation(synthetic, { includeTimestamps: true });
    expect(messageItems(prepared)[0]?.timestamp).toBeUndefined();
  });

  it('prepares an empty conversation to (at most) a metadata header', () => {
    const empty = parseConversation({}).conversation;
    expect(prepareConversation(empty).items).toEqual([
      {
        kind: 'metadata',
        title: DEFAULT_CONVERSATION_TITLE,
        createdAt: undefined,
        updatedAt: undefined,
      },
    ]);
    expect(prepareConversation(empty, EVERYTHING_OFF).items).toEqual([]);
  });
});

// The cross-fixture invariants every serializer relies on: whatever the
// options, preparation never throws, never emits an empty message, never
// loses unknown blocks or text, and only emits block kinds the options allow.
describe('prepareConversation invariants across all fixtures and option combinations', () => {
  const matrix: { label: string; overrides: Partial<ExportOptions> }[] = [
    { label: 'defaults', overrides: {} },
    { label: 'everything on', overrides: { ...EVERYTHING_ON, branches: 'all' } },
    { label: 'everything off', overrides: EVERYTHING_OFF },
    { label: 'thinking+timestamps', overrides: { includeThinking: true, includeTimestamps: true } },
    { label: 'all branches', overrides: { branches: 'all' } },
  ];

  for (const fixture of loadFixtures()) {
    for (const { label, overrides } of matrix) {
      it(`holds for ${fixture.name} with ${label}`, () => {
        const { conversation } = parseConversation(fixture.raw);
        const prepared = prepareConversation(conversation, overrides);
        const options = prepared.options;

        // Every message item has at least one block.
        for (const message of messageItems(prepared)) {
          expect(message.blocks.length).toBeGreaterThan(0);
        }

        // The rendered branches are exactly what the branch mode selects.
        const renderedBranches =
          options.branches === 'all' ? conversation.branches : [conversation.messages];
        const sourceBlocks = renderedBranches.flat().flatMap((message) => message.blocks);

        // Text and unknown content are never lost.
        const expectTextCount = sourceBlocks.filter((block) => block.type === 'text').length;
        expect(blocksOf(prepared, 'text')).toHaveLength(expectTextCount);
        const expectUnknownCount = sourceBlocks.filter((block) => block.type === 'unknown').length;
        expect(blocksOf(prepared, 'unknown')).toHaveLength(expectUnknownCount);

        // Disabled options never leak their block kinds.
        if (!options.includeThinking) expect(blocksOf(prepared, 'thinking')).toEqual([]);
        if (!options.includeToolUse) expect(blocksOf(prepared, 'toolUse')).toEqual([]);
        if (!options.includeToolResults) expect(blocksOf(prepared, 'toolResult')).toEqual([]);
        if (!options.includeArtifacts) expect(blocksOf(prepared, 'artifact')).toEqual([]);
        if (!options.includeAttachments) {
          expect(blocksOf(prepared, 'attachment')).toEqual([]);
          expect(blocksOf(prepared, 'file')).toEqual([]);
        }
        if (!options.includeTimestamps) {
          for (const message of messageItems(prepared)) {
            expect(message.timestamp).toBeUndefined();
          }
        }
        expect(prepared.items.some((item) => item.kind === 'metadata')).toBe(
          options.includeConversationMetadata,
        );
      });
    }
  }
});
