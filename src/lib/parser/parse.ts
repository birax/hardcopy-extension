/**
 * Conversation parser: raw claude.ai API JSON in, Hardcopy AST out.
 *
 * Pure functions only — no browser APIs — so the parser runs identically in
 * the content script, tests, and any future context. It is deliberately
 * defensive: unknown block types are preserved (never dropped), missing or
 * renamed fields degrade gracefully, and everything unexpected is reported on
 * {@link ParseResult.issues}, which doubles as our API-shape-change detection.
 */

import type {
  ArtifactCommand,
  AttachmentNode,
  ContentBlock,
  Conversation,
  ConversationSource,
  FileNode,
  Message,
} from '../model';
import { asArray, asNumber, asString, firstString, isObject, type JsonObject } from './json';

/** Something unexpected the parser encountered (and worked around). */
export interface ParseIssue {
  /** JSON-path-ish locator, e.g. `chat_messages[3].content[1]`. */
  path: string;
  /** Human-readable description of what was unexpected. */
  message: string;
}

/** The parser's output: the conversation AST plus anything unexpected. */
export interface ParseResult {
  conversation: Conversation;
  /**
   * Unexpected shapes encountered while parsing. A non-empty list on a
   * previously-working conversation is the signal that claude.ai's API shape
   * changed (fed into shape-change reporting, issue #7).
   */
  issues: ParseIssue[];
}

export interface ParseOptions {
  /** Where this conversation came from. Defaults to `'chat'`. */
  source?: ConversationSource;
}

/** `parent_message_uuid` sentinel claude.ai uses for root messages. */
const ROOT_PARENT_UUID = '00000000-0000-0000-0000-000000000000';

/**
 * Parse a raw conversation payload (as returned by
 * `GET .../chat_conversations/{id}?tree=True&rendering_mode=messages&render_all_tools=true`)
 * into the Hardcopy AST.
 *
 * Never throws on unexpected shapes: it degrades gracefully and reports what
 * it saw via {@link ParseResult.issues}.
 */
export function parseConversation(raw: unknown, options?: ParseOptions): ParseResult {
  const issues: ParseIssue[] = [];
  const root: JsonObject = isObject(raw) ? raw : {};
  if (!isObject(raw)) {
    issues.push({ path: '', message: `Conversation payload is ${describe(raw)}, expected object` });
  }

  const id = firstString(root, 'uuid', 'id');
  if (id === undefined && isObject(raw)) {
    issues.push({ path: 'uuid', message: 'Conversation has no uuid' });
  }

  const { messages, messagesPath } = extractRawMessages(root, issues);
  const parsed = messages.map((message, index) =>
    parseMessage(message, `${messagesPath}[${index}]`, issues),
  );

  const { branches, defaultBranchIndex } = reconstructBranches(
    parsed,
    asString(root['current_leaf_message_uuid']),
    issues,
  );

  const conversation: Conversation = {
    id: id ?? '',
    title: firstString(root, 'name', 'title') ?? '',
    summary: asString(root['summary']) ?? '',
    createdAt: asString(root['created_at']),
    updatedAt: asString(root['updated_at']),
    source: options?.source ?? 'chat',
    messages: branches[defaultBranchIndex] ?? [],
    branches,
    defaultBranchIndex,
    hasBranches: branches.length > 1,
  };

  return { conversation, issues };
}

/** Pull the raw message list out, tolerating the `messages` fallback key. */
function extractRawMessages(
  root: JsonObject,
  issues: ParseIssue[],
): { messages: unknown[]; messagesPath: string } {
  const chatMessages = asArray(root['chat_messages']);
  if (chatMessages !== undefined) {
    return { messages: chatMessages, messagesPath: 'chat_messages' };
  }
  const fallback = asArray(root['messages']);
  if (fallback !== undefined) {
    return { messages: fallback, messagesPath: 'messages' };
  }
  if ('chat_messages' in root || 'messages' in root) {
    issues.push({
      path: 'chat_messages',
      message: 'Message list is not an array',
    });
  } else if (Object.keys(root).length > 0) {
    issues.push({
      path: 'chat_messages',
      message: 'Conversation has neither chat_messages nor messages',
    });
  }
  return { messages: [], messagesPath: 'chat_messages' };
}

function parseMessage(raw: unknown, path: string, issues: ParseIssue[]): Message {
  const obj: JsonObject = isObject(raw) ? raw : {};
  if (!isObject(raw)) {
    issues.push({ path, message: `Message is ${describe(raw)}, expected object` });
  }

  const id = asString(obj['uuid']);
  if (id === undefined && isObject(raw)) {
    issues.push({ path: `${path}.uuid`, message: 'Message has no uuid' });
  }

  const sender = asString(obj['sender']);
  if (sender === undefined && isObject(raw)) {
    issues.push({ path: `${path}.sender`, message: 'Message has no sender' });
  }

  const parentId = asString(obj['parent_message_uuid']) ?? null;

  const blocks: ContentBlock[] = [];
  const content = asArray(obj['content']);
  if (content !== undefined) {
    content.forEach((block, index) => {
      blocks.push(parseBlock(block, `${path}.content[${index}]`, issues));
    });
  } else if (typeof obj['text'] === 'string') {
    // Older payloads carried a plain `text` field instead of content blocks.
    blocks.push({ type: 'text', text: obj['text'] });
  } else if (isObject(raw)) {
    issues.push({ path: `${path}.content`, message: 'Message has no content blocks' });
  }

  return {
    id: id ?? '',
    parentId: parentId === ROOT_PARENT_UUID ? null : parentId,
    sender: sender ?? 'unknown',
    createdAt: asString(obj['created_at']),
    updatedAt: asString(obj['updated_at']),
    blocks,
    attachments: parseAttachments(obj, path, issues),
    files: parseFiles(obj, path, issues),
  };
}

function parseBlock(raw: unknown, path: string, issues: ParseIssue[]): ContentBlock {
  if (!isObject(raw)) {
    issues.push({ path, message: `Content block is ${describe(raw)}, expected object` });
    return { type: 'unknown', blockType: null, raw };
  }

  const type = asString(raw['type']);
  switch (type) {
    case 'text': {
      const text = asString(raw['text']);
      if (text === undefined) {
        issues.push({ path: `${path}.text`, message: 'Text block has no text' });
      }
      return { type: 'text', text: text ?? '' };
    }

    case 'thinking': {
      const thinking = firstString(raw, 'thinking', 'text');
      if (thinking === undefined) {
        issues.push({ path: `${path}.thinking`, message: 'Thinking block has no thinking text' });
      }
      return {
        type: 'thinking',
        thinking: thinking ?? '',
        summaries: parseThinkingSummaries(raw, path, issues),
      };
    }

    case 'tool_use': {
      const name = asString(raw['name']);
      if (name === undefined) {
        issues.push({ path: `${path}.name`, message: 'tool_use block has no name' });
      }
      const input = raw['input'];
      const artifactCommand =
        name === 'artifacts' ? parseArtifactCommand(input, path, issues) : undefined;
      return {
        type: 'toolUse',
        name: name ?? '',
        input,
        ...(artifactCommand !== undefined && { artifactCommand }),
      };
    }

    case 'tool_result': {
      const name = asString(raw['name']);
      return {
        type: 'toolResult',
        ...(name !== undefined && { name }),
        content: flattenToolResultContent(raw['content'] ?? raw['text'], path, issues),
        isError: raw['is_error'] === true,
      };
    }

    case 'image': {
      const source = isObject(raw['source']) ? raw['source'] : {};
      return {
        type: 'image',
        mediaType: firstString(source, 'media_type') ?? firstString(raw, 'media_type'),
        data: asString(source['data']),
        fileName: firstString(raw, 'file_name', 'name'),
        raw,
      };
    }

    default: {
      issues.push({
        path,
        message:
          type === undefined ? 'Content block has no type' : `Unknown content block type "${type}"`,
      });
      return { type: 'unknown', blockType: type ?? null, raw };
    }
  }
}

function parseThinkingSummaries(block: JsonObject, path: string, issues: ParseIssue[]): string[] {
  if (!('summaries' in block)) {
    return [];
  }
  const rawSummaries = asArray(block['summaries']);
  if (rawSummaries === undefined) {
    issues.push({ path: `${path}.summaries`, message: 'Thinking summaries is not an array' });
    return [];
  }
  const summaries: string[] = [];
  rawSummaries.forEach((entry, index) => {
    const summary = asString(entry) ?? (isObject(entry) ? asString(entry['summary']) : undefined);
    if (summary === undefined) {
      issues.push({
        path: `${path}.summaries[${index}]`,
        message: `Thinking summary is ${describe(entry)}, expected string or { summary }`,
      });
    } else if (summary !== '') {
      summaries.push(summary);
    }
  });
  return summaries;
}

function parseArtifactCommand(
  input: unknown,
  path: string,
  issues: ParseIssue[],
): ArtifactCommand | undefined {
  if (!isObject(input)) {
    issues.push({
      path: `${path}.input`,
      message: `artifacts tool_use input is ${describe(input)}, expected object`,
    });
    return undefined;
  }
  const command = asString(input['command']);
  const id = asString(input['id']);
  if (command === undefined || id === undefined) {
    issues.push({
      path: `${path}.input`,
      message: 'artifacts tool_use input is missing command or id',
    });
    return undefined;
  }
  return {
    command,
    id,
    title: asString(input['title']),
    artifactType: asString(input['type']),
    language: asString(input['language']),
    content: asString(input['content']),
    oldStr: asString(input['old_str']),
    newStr: asString(input['new_str']),
  };
}

/** Flatten a tool_result `content` (string, block list, or object) to text. */
function flattenToolResultContent(content: unknown, path: string, issues: ParseIssue[]): string {
  if (content === undefined || content === null) {
    return '';
  }
  if (typeof content === 'string') {
    return content;
  }
  if (Array.isArray(content)) {
    return content
      .map((entry, index) => flattenToolResultContent(entry, `${path}.content[${index}]`, issues))
      .filter((text) => text !== '')
      .join('\n\n');
  }
  if (isObject(content)) {
    const text = asString(content['text']);
    if (text !== undefined) {
      return text;
    }
  }
  issues.push({
    path: `${path}.content`,
    message: `Unrecognised tool_result content ${describe(content)}; kept as JSON`,
  });
  return JSON.stringify(content);
}

function parseAttachments(
  message: JsonObject,
  path: string,
  issues: ParseIssue[],
): AttachmentNode[] {
  const rawAttachments = asArray(message['attachments']) ?? [];
  return rawAttachments.map((raw, index) => {
    const obj: JsonObject = isObject(raw) ? raw : {};
    if (!isObject(raw)) {
      issues.push({
        path: `${path}.attachments[${index}]`,
        message: `Attachment is ${describe(raw)}, expected object`,
      });
    }
    return {
      fileName: firstString(obj, 'file_name', 'name') ?? '',
      fileType: firstString(obj, 'file_type'),
      fileSize: asNumber(obj['file_size']),
      extractedContent: asString(obj['extracted_content']),
    };
  });
}

/** Map `files_v2` (preferred) and legacy `files` entries to file nodes. */
function parseFiles(message: JsonObject, path: string, issues: ParseIssue[]): FileNode[] {
  const filesV2 = asArray(message['files_v2']);
  const files = filesV2 ?? asArray(message['files']) ?? [];
  const key = filesV2 !== undefined ? 'files_v2' : 'files';
  return files.map((raw, index) => {
    const obj: JsonObject = isObject(raw) ? raw : {};
    if (!isObject(raw)) {
      issues.push({
        path: `${path}.${key}[${index}]`,
        message: `File entry is ${describe(raw)}, expected object`,
      });
    }
    return {
      fileName: firstString(obj, 'file_name', 'name') ?? '',
      fileKind: firstString(obj, 'file_kind', 'kind'),
      id: firstString(obj, 'file_uuid', 'uuid', 'id'),
      previewUrl: firstString(obj, 'preview_url'),
      thumbnailUrl: firstString(obj, 'thumbnail_url'),
    };
  });
}

/**
 * Rebuild the branch structure of a `tree=True` payload via
 * `parent_message_uuid`, returning every root-to-leaf path plus which one is
 * the default (the current/latest branch).
 */
function reconstructBranches(
  messages: Message[],
  currentLeafId: string | undefined,
  issues: ParseIssue[],
): { branches: Message[][]; defaultBranchIndex: number } {
  if (messages.length === 0) {
    return { branches: [], defaultBranchIndex: 0 };
  }

  const byId = new Map<string, Message>();
  for (const message of messages) {
    if (message.id !== '' && byId.has(message.id)) {
      issues.push({
        path: 'chat_messages',
        message: `Duplicate message uuid "${message.id}"; keeping the first`,
      });
      continue;
    }
    byId.set(message.id, message);
  }

  const children = new Map<string, Message[]>();
  const roots: Message[] = [];
  for (const message of byId.values()) {
    const parent = message.parentId !== null ? byId.get(message.parentId) : undefined;
    if (parent === undefined || parent === message) {
      if (message.parentId !== null && parent === undefined) {
        issues.push({
          path: 'chat_messages',
          message: `Message "${message.id}" has unknown parent "${message.parentId}"; treating as root`,
        });
      }
      roots.push(message);
    } else {
      const siblings = children.get(parent.id);
      if (siblings === undefined) {
        children.set(parent.id, [message]);
      } else {
        siblings.push(message);
      }
    }
  }

  const branches: Message[][] = [];
  const reached = new Set<Message>();
  const walk = (message: Message, path: Message[]): void => {
    if (path.includes(message)) {
      issues.push({
        path: 'chat_messages',
        message: `Cycle detected at message "${message.id}"; truncating branch`,
      });
      branches.push([...path]);
      return;
    }
    reached.add(message);
    const nextPath = [...path, message];
    const kids = children.get(message.id) ?? [];
    if (kids.length === 0) {
      branches.push(nextPath);
      return;
    }
    for (const kid of kids) {
      walk(kid, nextPath);
    }
  };
  for (const root of roots) {
    walk(root, []);
  }
  // A parent cycle can leave messages unreachable from every root; never drop
  // them — walk each as its own branch start (the cycle guard truncates it).
  for (const message of byId.values()) {
    if (!reached.has(message)) {
      issues.push({
        path: 'chat_messages',
        message: `Message "${message.id}" is not reachable from any root; starting a new branch`,
      });
      walk(message, []);
    }
  }

  return { branches, defaultBranchIndex: pickDefaultBranch(branches, currentLeafId, issues) };
}

/**
 * Choose the default branch: the one ending at `current_leaf_message_uuid`
 * when the API provides it, otherwise the branch with the newest leaf.
 */
function pickDefaultBranch(
  branches: Message[][],
  currentLeafId: string | undefined,
  issues: ParseIssue[],
): number {
  if (branches.length <= 1) {
    return 0;
  }

  if (currentLeafId !== undefined) {
    const byLeaf = branches.findIndex((branch) => branch[branch.length - 1]?.id === currentLeafId);
    if (byLeaf !== -1) {
      return byLeaf;
    }
    const containing = branches.findIndex((branch) =>
      branch.some((message) => message.id === currentLeafId),
    );
    if (containing !== -1) {
      return containing;
    }
    issues.push({
      path: 'current_leaf_message_uuid',
      message: `current_leaf_message_uuid "${currentLeafId}" not found in any branch; using newest leaf`,
    });
  }

  let best = 0;
  let bestCreatedAt = '';
  branches.forEach((branch, index) => {
    const createdAt = branch[branch.length - 1]?.createdAt ?? '';
    if (createdAt >= bestCreatedAt) {
      best = index;
      bestCreatedAt = createdAt;
    }
  });
  return best;
}

/** Short human-readable description of a value's type for issue messages. */
function describe(value: unknown): string {
  if (value === null) {
    return 'null';
  }
  if (Array.isArray(value)) {
    return 'an array';
  }
  return `a ${typeof value}`;
}
