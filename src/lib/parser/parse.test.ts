import { describe, expect, it } from 'vitest';

import { parseConversation } from './parse';

/** Minimal message factory for tree tests. */
function message(
  uuid: string,
  parent: string | null,
  overrides: Record<string, unknown> = {},
): Record<string, unknown> {
  return {
    uuid,
    parent_message_uuid: parent ?? '00000000-0000-0000-0000-000000000000',
    sender: 'human',
    created_at: '2026-01-01T00:00:00Z',
    content: [{ type: 'text', text: `message ${uuid}` }],
    attachments: [],
    files_v2: [],
    ...overrides,
  };
}

describe('parseConversation', () => {
  it('degrades gracefully on a non-object payload', () => {
    const { conversation, issues } = parseConversation(null);
    expect(conversation.id).toBe('');
    expect(conversation.messages).toEqual([]);
    expect(conversation.branches).toEqual([]);
    expect(issues).toEqual([
      { path: '', message: 'Conversation payload is null, expected object' },
    ]);
  });

  it('reports missing uuid, message list, and sender', () => {
    const { issues } = parseConversation({ chat_messages: [{ content: [] }] });
    const messages = issues.map((issue) => issue.message);
    expect(messages).toContain('Conversation has no uuid');
    expect(messages).toContain('Message has no uuid');
    expect(messages).toContain('Message has no sender');
  });

  it('reports a conversation with neither chat_messages nor messages', () => {
    const { issues } = parseConversation({ uuid: 'x' });
    expect(issues).toEqual([
      { path: 'chat_messages', message: 'Conversation has neither chat_messages nor messages' },
    ]);
  });

  it('reports a non-array message list', () => {
    const { issues } = parseConversation({ uuid: 'x', chat_messages: 'nope' });
    expect(issues).toEqual([{ path: 'chat_messages', message: 'Message list is not an array' }]);
  });

  it('falls back from chat_messages to messages', () => {
    const { conversation, issues } = parseConversation({
      uuid: 'c0ffee00-0000-4000-8000-000000000001',
      messages: [message('m1', null)],
    });
    expect(conversation.messages).toHaveLength(1);
    expect(conversation.messages[0]?.blocks).toEqual([{ type: 'text', text: 'message m1' }]);
    expect(issues).toEqual([]);
  });

  it('accepts a legacy plain-text message body', () => {
    const { conversation } = parseConversation({
      uuid: 'c',
      chat_messages: [{ uuid: 'm1', sender: 'human', text: 'plain body' }],
    });
    expect(conversation.messages[0]?.blocks).toEqual([{ type: 'text', text: 'plain body' }]);
  });

  it('preserves non-object blocks as unknown', () => {
    const { conversation, issues } = parseConversation({
      uuid: 'c',
      chat_messages: [message('m1', null, { content: ['just a string'] })],
    });
    expect(conversation.messages[0]?.blocks).toEqual([
      { type: 'unknown', blockType: null, raw: 'just a string' },
    ]);
    expect(issues[0]?.message).toBe('Content block is a string, expected object');
  });

  it('flags text, thinking, and tool_use blocks with missing fields', () => {
    const { conversation, issues } = parseConversation({
      uuid: 'c',
      chat_messages: [
        message('m1', null, {
          content: [{ type: 'text' }, { type: 'thinking' }, { type: 'tool_use' }, {}],
        }),
      ],
    });
    expect(conversation.messages[0]?.blocks.map((block) => block.type)).toEqual([
      'text',
      'thinking',
      'toolUse',
      'unknown',
    ]);
    expect(issues.map((issue) => issue.message)).toEqual([
      'Text block has no text',
      'Thinking block has no thinking text',
      'tool_use block has no name',
      'Content block has no type',
    ]);
  });

  it('reports malformed thinking summaries but keeps good ones', () => {
    const { conversation, issues } = parseConversation({
      uuid: 'c',
      chat_messages: [
        message('m1', null, {
          content: [
            { type: 'thinking', thinking: 't', summaries: ['plain string', { summary: 'ok' }, 7] },
          ],
        }),
      ],
    });
    const block = conversation.messages[0]?.blocks[0];
    expect(block).toMatchObject({ type: 'thinking', summaries: ['plain string', 'ok'] });
    expect(issues).toEqual([
      {
        path: 'chat_messages[0].content[0].summaries[2]',
        message: 'Thinking summary is a number, expected string or { summary }',
      },
    ]);
  });

  it('reports a non-array summaries field', () => {
    const { issues } = parseConversation({
      uuid: 'c',
      chat_messages: [
        message('m1', null, { content: [{ type: 'thinking', thinking: 't', summaries: 'x' }] }),
      ],
    });
    expect(issues[0]?.message).toBe('Thinking summaries is not an array');
  });

  it('reports malformed artifacts input but keeps the toolUse block', () => {
    const { conversation, issues } = parseConversation({
      uuid: 'c',
      chat_messages: [
        message('m1', null, {
          content: [
            { type: 'tool_use', name: 'artifacts', input: 'not an object' },
            { type: 'tool_use', name: 'artifacts', input: { command: 'create' } },
          ],
        }),
      ],
    });
    const blocks = conversation.messages[0]?.blocks;
    expect(blocks).toHaveLength(2);
    expect(blocks?.every((block) => block.type === 'toolUse')).toBe(true);
    expect(blocks?.some((block) => block.type === 'toolUse' && block.artifactCommand)).toBe(false);
    expect(issues.map((issue) => issue.message)).toEqual([
      'artifacts tool_use input is a string, expected object',
      'artifacts tool_use input is missing command or id',
    ]);
  });

  it('flattens string, object, and unrecognised tool_result content', () => {
    const { conversation, issues } = parseConversation({
      uuid: 'c',
      chat_messages: [
        message('m1', null, {
          content: [
            { type: 'tool_result', content: 'plain' },
            { type: 'tool_result', content: { type: 'text', text: 'from object' } },
            { type: 'tool_result', content: 42 },
            { type: 'tool_result' },
          ],
        }),
      ],
    });
    const contents = conversation.messages[0]?.blocks.map(
      (block) => block.type === 'toolResult' && block.content,
    );
    expect(contents).toEqual(['plain', 'from object', '42', '']);
    expect(issues.map((issue) => issue.message)).toEqual([
      'Unrecognised tool_result content a number; kept as JSON',
    ]);
  });

  it('parses image blocks with a base64 source', () => {
    const { conversation } = parseConversation({
      uuid: 'c',
      chat_messages: [
        message('m1', null, {
          content: [
            { type: 'image', source: { type: 'base64', media_type: 'image/png', data: 'AAAA' } },
          ],
        }),
      ],
    });
    expect(conversation.messages[0]?.blocks[0]).toMatchObject({
      type: 'image',
      mediaType: 'image/png',
      data: 'AAAA',
    });
  });

  it('reports non-object attachments and file entries', () => {
    const { issues } = parseConversation({
      uuid: 'c',
      chat_messages: [message('m1', null, { attachments: [1], files_v2: ['x'] })],
    });
    expect(issues.map((issue) => issue.message)).toEqual([
      'Attachment is a number, expected object',
      'File entry is a string, expected object',
    ]);
  });

  it('falls back to legacy files when files_v2 is absent', () => {
    const { conversation } = parseConversation({
      uuid: 'c',
      chat_messages: [
        message('m1', null, { files_v2: undefined, files: [{ file_name: 'old.pdf' }] }),
      ],
    });
    expect(conversation.messages[0]?.files).toMatchObject([{ fileName: 'old.pdf' }]);
  });

  it('honours the source option', () => {
    const { conversation } = parseConversation(
      { uuid: 'c', chat_messages: [] },
      { source: 'code' },
    );
    expect(conversation.source).toBe('code');
  });

  describe('branch reconstruction', () => {
    it('treats a message with an unknown parent as a root, with an issue', () => {
      const { conversation, issues } = parseConversation({
        uuid: 'c',
        chat_messages: [message('m1', null), message('m2', 'ghost')],
      });
      expect(conversation.branches).toHaveLength(2);
      expect(issues[0]?.message).toBe('Message "m2" has unknown parent "ghost"; treating as root');
    });

    it('reports duplicate message uuids and keeps the first', () => {
      const { conversation, issues } = parseConversation({
        uuid: 'c',
        chat_messages: [
          message('m1', null),
          message('m1', null, { content: [{ type: 'text', text: 'duplicate' }] }),
        ],
      });
      expect(conversation.messages).toHaveLength(1);
      expect(conversation.messages[0]?.blocks).toEqual([{ type: 'text', text: 'message m1' }]);
      expect(issues[0]?.message).toBe('Duplicate message uuid "m1"; keeping the first');
    });

    it('survives a parent cycle', () => {
      const { conversation, issues } = parseConversation({
        uuid: 'c',
        chat_messages: [message('m1', null), message('m2', 'm3'), message('m3', 'm2')],
      });
      // m2/m3 reference each other; m1 is the only clean branch.
      expect(conversation.branches.length).toBeGreaterThan(0);
      expect(issues.some((issue) => issue.message.includes('Cycle detected'))).toBe(true);
    });

    it('picks the branch containing current_leaf_message_uuid even mid-branch', () => {
      const { conversation } = parseConversation({
        uuid: 'c',
        current_leaf_message_uuid: 'm2',
        chat_messages: [
          message('m1', null),
          message('m2', 'm1'),
          message('m2a', 'm2'),
          message('m3', 'm1', { created_at: '2026-02-01T00:00:00Z' }),
        ],
      });
      expect(conversation.messages.map((m) => m.id)).toEqual(['m1', 'm2', 'm2a']);
    });

    it('falls back to the newest leaf when current_leaf_message_uuid is unknown', () => {
      const { conversation, issues } = parseConversation({
        uuid: 'c',
        current_leaf_message_uuid: 'ghost',
        chat_messages: [
          message('m1', null),
          message('m2', 'm1', { created_at: '2026-03-01T00:00:00Z' }),
          message('m3', 'm1', { created_at: '2026-01-15T00:00:00Z' }),
        ],
      });
      expect(conversation.messages.map((m) => m.id)).toEqual(['m1', 'm2']);
      expect(issues[0]?.message).toContain('not found in any branch');
    });

    it('falls back to the newest leaf when current_leaf_message_uuid is absent', () => {
      const { conversation, issues } = parseConversation({
        uuid: 'c',
        chat_messages: [
          message('m1', null),
          message('m2', 'm1', { created_at: '2026-01-10T00:00:00Z' }),
          message('m3', 'm1', { created_at: '2026-04-01T00:00:00Z' }),
        ],
      });
      expect(conversation.messages.map((m) => m.id)).toEqual(['m1', 'm3']);
      expect(issues).toEqual([]);
    });
  });
});
