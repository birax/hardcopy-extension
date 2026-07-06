import { describe, expect, it } from 'vitest';

import { reconstructArtifacts } from '../src/lib/model';
import { parseConversation } from '../src/lib/parser';
import { loadFixture, loadFixtures } from './harness';

// Snapshot every fixture. New fixtures are picked up automatically; a snapshot
// diff here is the early-warning signal that parser behaviour changed.
describe('parseConversation fixture snapshots', () => {
  for (const fixture of loadFixtures()) {
    it(`parses ${fixture.name}`, () => {
      expect(parseConversation(fixture.raw)).toMatchSnapshot();
    });
  }
});

describe('fixture expectations', () => {
  it('parses every fixture except unknown-block without issues', () => {
    for (const fixture of loadFixtures()) {
      const { issues } = parseConversation(fixture.raw);
      if (fixture.name === 'unknown-block') {
        continue;
      }
      expect(issues, `unexpected issues in ${fixture.name}`).toEqual([]);
    }
  });

  it('reconstructs both branches of the edited conversation', () => {
    const { conversation } = parseConversation(loadFixture('branched-tree').raw);

    expect(conversation.hasBranches).toBe(true);
    expect(conversation.branches).toHaveLength(2);

    // Both branches share the first two messages by reference.
    const [first, second] = conversation.branches;
    expect(first?.slice(0, 2)).toEqual(second?.slice(0, 2));
    expect(first).toHaveLength(4);
    expect(second).toHaveLength(4);

    // The default path is the branch ending at current_leaf_message_uuid.
    expect(conversation.defaultBranchIndex).toBe(1);
    expect(conversation.messages).toBe(conversation.branches[1]);
    expect(conversation.messages[3]?.id).toBe('e5a7c9b1-3d6f-4e8a-b2c4-7f0d2b4e6a83');
  });

  it('replays the artifact create/update chain into versions', () => {
    const { conversation } = parseConversation(loadFixture('artifacts').raw);
    const artifacts = reconstructArtifacts(conversation.messages);

    expect(artifacts).toHaveLength(1);
    const [artifact] = artifacts;
    expect(artifact?.id).toBe('tip-calculator');
    expect(artifact?.title).toBe('Tip calculator');
    expect(artifact?.language).toBe('python');
    expect(artifact?.issues).toEqual([]);

    // create + two updates → three accessible versions.
    expect(artifact?.versions).toHaveLength(3);
    expect(artifact?.versions[0]?.content).toContain('percent: float = 12.5');
    expect(artifact?.versions[1]?.content).toContain('percent: float = 15.0');
    expect(artifact?.finalContent).toContain('Each pays');
    expect(artifact?.finalContent).toContain('percent: float = 15.0');
  });

  it('preserves unknown blocks with their raw JSON and reports an issue', () => {
    const { conversation, issues } = parseConversation(loadFixture('unknown-block').raw);

    const blocks = conversation.messages.flatMap((message) => message.blocks);
    const unknown = blocks.find((block) => block.type === 'unknown');
    expect(unknown).toBeDefined();
    expect(unknown?.blockType).toBe('weather_card');
    // The raw block is retained verbatim — nothing is dropped silently.
    expect(unknown?.raw).toMatchObject({
      type: 'weather_card',
      location: 'Portsmouth, UK',
    });

    expect(issues).toEqual([
      {
        path: 'chat_messages[1].content[0]',
        message: 'Unknown content block type "weather_card"',
      },
    ]);
  });

  it('captures tool_result errors', () => {
    const { conversation } = parseConversation(loadFixture('tool-use').raw);
    const results = conversation.messages
      .flatMap((message) => message.blocks)
      .filter((block) => block.type === 'toolResult');

    expect(results).toHaveLength(2);
    expect(results[0]?.isError).toBe(false);
    expect(results[1]?.isError).toBe(true);
    expect(results[1]?.content).toContain('ReferenceError');
  });

  it('maps attachments and files_v2 onto messages', () => {
    const { conversation } = parseConversation(loadFixture('attachments-files').raw);
    const [human] = conversation.messages;

    expect(human?.attachments).toEqual([
      {
        fileName: 'meeting-notes.txt',
        fileType: 'text/plain',
        fileSize: 482,
        extractedContent: expect.stringContaining('Sprint review 12 June'),
      },
    ]);
    expect(human?.files).toEqual([
      {
        fileName: 'budget-q3.xlsx',
        fileKind: 'document',
        id: 'b7d9f1a3-5c8e-4b0d-9a2c-8e4f0b6d2a75',
        previewUrl: '/api/b7d9f1a3-5c8e-4b0d-9a2c-8e4f0b6d2a75/preview',
        thumbnailUrl: '/api/b7d9f1a3-5c8e-4b0d-9a2c-8e4f0b6d2a75/thumbnail',
      },
    ]);
  });

  it('keeps thinking blocks, with and without summaries', () => {
    const { conversation } = parseConversation(loadFixture('thinking').raw);
    const thinking = conversation.messages
      .flatMap((message) => message.blocks)
      .filter((block) => block.type === 'thinking');

    expect(thinking).toHaveLength(2);
    expect(thinking[0]?.summaries).toEqual([
      'Calculating wall area minus doors and window',
      'Converting coverage into litres for two coats',
    ]);
    expect(thinking[1]?.summaries).toEqual([]);
    expect(thinking[1]?.thinking).toContain('Ceiling area');
  });
});
