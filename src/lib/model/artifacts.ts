/**
 * Artifact reconstruction: replay the create/rewrite/update command stream
 * found in `tool_use` blocks named "artifacts" into full artifact versions.
 */

import type { ArtifactCommand, Message } from './types';

/** One snapshot of an artifact's content after applying a command. */
export interface ArtifactVersion {
  /** The command that produced this version. */
  command: ArtifactCommand;
  /** Full artifact content after applying the command. */
  content: string;
  /** UUID of the message whose tool_use block carried the command. */
  messageId: string;
}

/** An artifact reconstructed from its command stream. */
export interface Artifact {
  id: string;
  /** Latest title seen across the command stream. */
  title: string | undefined;
  /** Latest artifact type seen, e.g. `'application/vnd.ant.code'`. */
  artifactType: string | undefined;
  /** Latest language hint seen, for code artifacts. */
  language: string | undefined;
  /**
   * Every intermediate version in order; `versions[versions.length - 1]` is
   * the final one.
   */
  versions: ArtifactVersion[];
  /** Content of the last version. Empty string when nothing applied. */
  finalContent: string;
  /**
   * Human-readable notes about commands that could not be applied cleanly
   * (e.g. an `update` whose `oldStr` was not found). The replay is
   * best-effort: a broken command still produces a version so nothing is lost.
   */
  issues: string[];
}

/**
 * Replay artifact commands from the given messages (in order) into final
 * artifacts, keeping every intermediate version accessible.
 *
 * Pass `conversation.messages` for the default branch, or any other branch
 * from `conversation.branches` — artifacts are branch-relative, since an
 * edited message can fork an artifact's history.
 */
export function reconstructArtifacts(messages: Message[]): Artifact[] {
  const artifacts = new Map<string, Artifact>();

  for (const message of messages) {
    for (const block of message.blocks) {
      if (block.type !== 'toolUse' || block.artifactCommand === undefined) {
        continue;
      }
      applyCommand(artifacts, block.artifactCommand, message.id);
    }
  }

  return [...artifacts.values()];
}

function applyCommand(
  artifacts: Map<string, Artifact>,
  command: ArtifactCommand,
  messageId: string,
): void {
  let artifact = artifacts.get(command.id);
  if (artifact === undefined) {
    artifact = {
      id: command.id,
      title: undefined,
      artifactType: undefined,
      language: undefined,
      versions: [],
      finalContent: '',
      issues: [],
    };
    artifacts.set(command.id, artifact);
    if (command.command !== 'create') {
      artifact.issues.push(
        `First command for artifact "${command.id}" was "${command.command}", expected "create"`,
      );
    }
  }

  artifact.title = command.title ?? artifact.title;
  artifact.artifactType = command.artifactType ?? artifact.artifactType;
  artifact.language = command.language ?? artifact.language;

  const previous = artifact.finalContent;
  let content: string;
  switch (command.command) {
    case 'create':
    case 'rewrite':
      content = command.content ?? '';
      break;
    case 'update': {
      const oldStr = command.oldStr ?? '';
      const newStr = command.newStr ?? '';
      if (oldStr !== '' && previous.includes(oldStr)) {
        content = previous.replace(oldStr, newStr);
      } else {
        artifact.issues.push(
          `Update to artifact "${command.id}" did not match its current content; appended instead`,
        );
        content = previous === '' ? newStr : `${previous}\n${newStr}`;
      }
      break;
    }
    default:
      artifact.issues.push(`Unknown artifact command "${command.command}" for "${command.id}"`);
      content = command.content ?? previous;
      break;
  }

  artifact.versions.push({ command, content, messageId });
  artifact.finalContent = content;
}
