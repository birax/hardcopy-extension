import { describe, expect, it } from 'vitest';

import { reconstructArtifacts } from './artifacts';
import type { ArtifactCommand, Message } from './types';

function messageWithCommands(id: string, commands: Partial<ArtifactCommand>[]): Message {
  return {
    id,
    parentId: null,
    sender: 'assistant',
    createdAt: undefined,
    updatedAt: undefined,
    blocks: commands.map((command) => ({
      type: 'toolUse',
      name: 'artifacts',
      input: {},
      artifactCommand: {
        command: 'create',
        id: 'a1',
        title: undefined,
        artifactType: undefined,
        language: undefined,
        content: undefined,
        oldStr: undefined,
        newStr: undefined,
        ...command,
      },
    })),
    attachments: [],
    files: [],
  };
}

describe('reconstructArtifacts', () => {
  it('returns nothing for messages without artifact commands', () => {
    const plain: Message = {
      id: 'm1',
      parentId: null,
      sender: 'assistant',
      createdAt: undefined,
      updatedAt: undefined,
      blocks: [
        { type: 'text', text: 'no artifacts here' },
        { type: 'toolUse', name: 'web_search', input: { query: 'x' } },
      ],
      attachments: [],
      files: [],
    };
    expect(reconstructArtifacts([plain])).toEqual([]);
  });

  it('replays create, update, and rewrite keeping every version', () => {
    const messages = [
      messageWithCommands('m1', [
        { command: 'create', title: 'Notes', artifactType: 'text/markdown', content: 'alpha beta' },
      ]),
      messageWithCommands('m2', [
        { command: 'update', oldStr: 'beta', newStr: 'gamma' },
        { command: 'rewrite', content: 'rewritten', title: 'Notes v2' },
      ]),
    ];

    const [artifact] = reconstructArtifacts(messages);
    expect(artifact?.versions.map((version) => version.content)).toEqual([
      'alpha beta',
      'alpha gamma',
      'rewritten',
    ]);
    expect(artifact?.versions.map((version) => version.messageId)).toEqual(['m1', 'm2', 'm2']);
    expect(artifact?.finalContent).toBe('rewritten');
    expect(artifact?.title).toBe('Notes v2');
    expect(artifact?.artifactType).toBe('text/markdown');
    expect(artifact?.issues).toEqual([]);
  });

  it('tracks multiple artifacts independently', () => {
    const messages = [
      messageWithCommands('m1', [
        { command: 'create', id: 'a1', content: 'one' },
        { command: 'create', id: 'a2', content: 'two' },
      ]),
    ];
    const artifacts = reconstructArtifacts(messages);
    expect(artifacts.map((artifact) => [artifact.id, artifact.finalContent])).toEqual([
      ['a1', 'one'],
      ['a2', 'two'],
    ]);
  });

  it('appends and records an issue when an update does not match', () => {
    const messages = [
      messageWithCommands('m1', [
        { command: 'create', content: 'stable content' },
        { command: 'update', oldStr: 'missing text', newStr: 'patch' },
      ]),
    ];
    const [artifact] = reconstructArtifacts(messages);
    expect(artifact?.finalContent).toBe('stable content\npatch');
    expect(artifact?.issues).toEqual([
      'Update to artifact "a1" did not match its current content; appended instead',
    ]);
  });

  it('copes with an update arriving before any create', () => {
    const messages = [
      messageWithCommands('m1', [{ command: 'update', oldStr: 'x', newStr: 'started late' }]),
    ];
    const [artifact] = reconstructArtifacts(messages);
    expect(artifact?.finalContent).toBe('started late');
    expect(artifact?.issues).toEqual([
      'First command for artifact "a1" was "update", expected "create"',
      'Update to artifact "a1" did not match its current content; appended instead',
    ]);
  });

  it('records an issue for an unknown command but keeps going', () => {
    const messages = [
      messageWithCommands('m1', [
        { command: 'create', content: 'original' },
        { command: 'transmogrify' },
        { command: 'update', oldStr: 'original', newStr: 'patched' },
      ]),
    ];
    const [artifact] = reconstructArtifacts(messages);
    expect(artifact?.versions.map((version) => version.content)).toEqual([
      'original',
      'original',
      'patched',
    ]);
    expect(artifact?.issues).toEqual(['Unknown artifact command "transmogrify" for "a1"']);
  });
});
