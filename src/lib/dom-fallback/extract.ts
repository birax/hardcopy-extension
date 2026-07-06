/**
 * DOM fallback extraction: rendered claude.ai chat DOM in, degraded Hardcopy
 * AST out.
 *
 * This is the last-resort path used only when the internal API path fails
 * (endpoint moved, shape change — see `src/lib/api` and ADR 0006). It walks
 * the rendered page instead of the API JSON, so the result is inherently
 * degraded: no thinking blocks, no timestamps, no tool inputs/results, no
 * attachment metadata, and only the currently displayed branch. Every one of
 * those limitations is reported on {@link DomExtractionResult.issues} so the
 * export can be clearly labelled (issue #6).
 *
 * Selector strategy, in resilience order (never obfuscated utility classes):
 *
 * 1. `[data-testid]` hooks — the user-message container
 *    (`[data-testid="user-message"]`) and Claude's own copy affordance
 *    (`button[data-testid="action-bar-copy"]`), the hooks existing exporters
 *    converged on (docs/research/2026-07-06-technical-architecture.md, §1.3
 *    "Stability").
 * 2. ARIA landmarks — each message's action bar is
 *    `[role="group"][aria-label="Message actions"]`; the nearest enclosing
 *    element with content is treated as that message's container.
 * 3. Structural heuristics — senders that cannot be read off a hook are
 *    inferred from the alternating human/assistant turn order (reported as an
 *    issue).
 *
 * **Selector provenance.** Like the API fixtures (see
 * tests/fixtures/README.md), these hooks are synthesized from documented
 * exporter behaviour, not captured from a live claude.ai session — this
 * development environment cannot log in to claude.ai. They MUST be validated
 * against the live site before the first release, and the DOM fixtures under
 * tests/fixtures/dom/ replaced with sanitized captures of the real markup.
 *
 * Everything here is defensive: every hook is optional, and the function
 * never throws — a page that matches nothing yields an empty conversation
 * plus issues explaining why.
 */

import type { Conversation, Message, Sender } from '../model';

/** Something the DOM extraction could not provide or had to guess. */
export interface DomExtractionIssue {
  /** CSS-selector-ish locator of where the issue arose; empty for page-wide issues. */
  path: string;
  /** Human-readable description. */
  message: string;
}

/** The DOM fallback's output: a degraded conversation AST plus its caveats. */
export interface DomExtractionResult {
  conversation: Conversation;
  /**
   * Always `true`: DOM extraction can never be complete. Serializers and UI
   * must label exports produced from this result as degraded.
   */
  degraded: true;
  /**
   * What this extraction could not provide (thinking blocks, timestamps,
   * tool internals, branches, attachments) plus anything page-specific that
   * had to be guessed or was missing.
   */
  issues: DomExtractionIssue[];
}

/** Hook for user-authored message containers (data-testid, most stable). */
const USER_MESSAGE_SELECTOR = '[data-testid="user-message"]';

/**
 * Hooks for assistant message containers, most-stable first: a testid (in
 * case one exists/appears), the streaming marker attribute, and the
 * `font-claude-message` class used by prior DOM exporters (semantic, not an
 * obfuscated utility class — but still the weakest hook here).
 */
const ASSISTANT_MESSAGE_SELECTOR =
  '[data-testid="assistant-message"], [data-is-streaming], .font-claude-message';

/** Each rendered message carries an action bar with this ARIA shape. */
const ACTION_BAR_SELECTOR = '[role="group"][aria-label="Message actions"]';

/** Claude's own copy button inside the action bar; used as a message anchor. */
const COPY_BUTTON_SELECTOR = 'button[data-testid="action-bar-copy"]';

/** Block-level content we can map to Markdown-ish text. */
const BLOCK_SELECTOR = 'p, pre, ul, ol, table, blockquote, h1, h2, h3, h4, h5, h6';

/** Elements that are UI chrome, never conversation content. */
const SKIP_TAGS = new Set([
  'BUTTON',
  'DIALOG',
  'INPUT',
  'NOSCRIPT',
  'SCRIPT',
  'SELECT',
  'STYLE',
  'SVG',
  'TEXTAREA',
]);

const ELEMENT_NODE = 1;
const TEXT_NODE = 3;

/**
 * Placeholder emitted for `<br>` while flattening inline content, so that an
 * intentional line break survives whitespace collapsing while newlines that
 * are mere HTML source formatting collapse to spaces.
 */
const LINE_BREAK = '\u0000';
/** Bit returned by compareDocumentPosition when the argument follows the receiver. */
const DOCUMENT_POSITION_FOLLOWING = 0x04;

/**
 * Extract the currently rendered conversation from the claude.ai DOM into the
 * Hardcopy AST, marked as degraded.
 *
 * Never throws: unexpected page structure degrades to an empty conversation
 * with explanatory {@link DomExtractionResult.issues}.
 *
 * @param root - The page `document`, or an element containing the chat.
 */
export function extractConversationFromDom(root: Document | HTMLElement): DomExtractionResult {
  const issues: DomExtractionIssue[] = capabilityIssues();
  try {
    return { conversation: extract(root, issues), degraded: true, issues };
  } catch (error) {
    issues.push({
      path: '',
      message: `DOM extraction failed unexpectedly: ${error instanceof Error ? error.message : String(error)}`,
    });
    return { conversation: emptyConversation(), degraded: true, issues };
  }
}

/**
 * Extract the conversation UUID from a claude.ai chat pathname
 * (`/chat/{uuid}`), or `undefined` when the path is not a chat URL.
 */
export function conversationIdFromPathname(pathname: string): string | undefined {
  const match =
    /\/chat\/([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})(?:[/?#]|$)/i.exec(
      pathname,
    );
  return match?.[1];
}

/** The limitations inherent to every DOM extraction, reported up front. */
function capabilityIssues(): DomExtractionIssue[] {
  const cannot = [
    'thinking blocks are not rendered in the page and are omitted',
    'message timestamps (created/updated) are not available',
    'tool use inputs, tool results, and artifact internals are not visible',
    'only the currently displayed branch is captured; edited/regenerated branches are lost',
    'attachment and uploaded-file metadata cannot be recovered',
  ];
  return cannot.map((message) => ({ path: '', message: `Degraded DOM extraction: ${message}` }));
}

function emptyConversation(): Conversation {
  return {
    id: '',
    title: '',
    summary: '',
    createdAt: undefined,
    updatedAt: undefined,
    source: 'chat',
    messages: [],
    branches: [],
    defaultBranchIndex: 0,
    hasBranches: false,
  };
}

function extract(root: Document | HTMLElement, issues: DomExtractionIssue[]): Conversation {
  const doc = isDocument(root) ? root : (root.ownerDocument ?? undefined);
  const candidates = collectCandidates(root, issues);
  const messages = candidates.map((candidate, index) =>
    toMessage(candidate, index, candidates, issues),
  );
  if (messages.length === 0) {
    issues.push({
      path: '',
      message:
        'No chat messages found in the DOM (no user-message testids, message action bars, or assistant containers matched); claude.ai may have changed its markup',
    });
  }

  return {
    id: extractConversationId(doc, issues),
    title: extractTitle(root, doc, issues),
    summary: '',
    createdAt: undefined,
    updatedAt: undefined,
    source: 'chat',
    messages,
    branches: messages.length > 0 ? [messages] : [],
    defaultBranchIndex: 0,
    hasBranches: false,
  };
}

function isDocument(root: Document | HTMLElement): root is Document {
  return root.nodeType === 9;
}

function extractConversationId(doc: Document | undefined, issues: DomExtractionIssue[]): string {
  let pathname: string | undefined;
  try {
    pathname = doc?.defaultView?.location?.pathname ?? doc?.location?.pathname ?? undefined;
  } catch {
    pathname = undefined; // Detached documents may not expose a location at all.
  }
  const id = pathname !== undefined ? conversationIdFromPathname(pathname) : undefined;
  if (id === undefined) {
    issues.push({
      path: 'location',
      message: 'Conversation id could not be determined from the page URL (/chat/{uuid})',
    });
  }
  return id ?? '';
}

function extractTitle(
  root: Document | HTMLElement,
  doc: Document | undefined,
  issues: DomExtractionIssue[],
): string {
  // Prefer the document title, stripping claude.ai's " - Claude" style suffix.
  const documentTitle = (doc?.title ?? '').replace(/\s*[-–—|]\s*Claude(\.ai)?\s*$/i, '').trim();
  if (documentTitle !== '' && documentTitle.toLowerCase() !== 'claude') {
    return documentTitle;
  }
  // Fall back to a page heading outside the messages (the header shows the
  // conversation name); never a heading inside message content.
  const heading = root.querySelector('header h1, header h2, [data-testid="chat-title"]');
  const headingText = tidyInline(heading?.textContent ?? '');
  if (headingText !== '') {
    return headingText;
  }
  issues.push({
    path: 'title',
    message: 'Conversation title not found (document title and page headings were empty)',
  });
  return '';
}

/** A message container found in the DOM, with its sender when a hook said so. */
interface Candidate {
  el: Element;
  sender: Sender | undefined;
}

/**
 * Find message containers: action-bar anchored containers first (every
 * message has one), then direct user/assistant hook matches not already
 * covered. Returned in document order.
 */
function collectCandidates(root: ParentNode, issues: DomExtractionIssue[]): Candidate[] {
  const candidates: Candidate[] = [];
  const covered = (el: Element): boolean =>
    candidates.some(
      (candidate) => candidate.el === el || candidate.el.contains(el) || el.contains(candidate.el),
    );

  for (const bar of findActionBars(root)) {
    const container = containerForActionBar(bar, root);
    if (container === undefined) {
      issues.push({
        path: ACTION_BAR_SELECTOR,
        message: 'Found a message action bar but no enclosing element with message content',
      });
      continue;
    }
    if (container.querySelectorAll(ACTION_BAR_SELECTOR).length > 1) {
      // Climbed past a single message; extracting here would duplicate content.
      issues.push({
        path: ACTION_BAR_SELECTOR,
        message: 'Could not isolate a single message around an action bar; skipped it',
      });
      continue;
    }
    const user = matchWithin(container, USER_MESSAGE_SELECTOR, bar);
    const assistant = matchWithin(container, ASSISTANT_MESSAGE_SELECTOR, bar);
    const el = user ?? assistant ?? container;
    if (!covered(el)) {
      candidates.push({ el, sender: user ? 'human' : assistant ? 'assistant' : undefined });
    }
  }

  // Hook matches with no action bar around them (partial or changed markup).
  for (const el of Array.from(root.querySelectorAll(USER_MESSAGE_SELECTOR))) {
    if (!covered(el)) {
      candidates.push({ el, sender: 'human' });
    }
  }
  for (const el of Array.from(root.querySelectorAll(ASSISTANT_MESSAGE_SELECTOR))) {
    if (!covered(el)) {
      candidates.push({ el, sender: 'assistant' });
    }
  }

  return candidates.sort((a, b) =>
    (a.el.compareDocumentPosition(b.el) & DOCUMENT_POSITION_FOLLOWING) !== 0 ? -1 : 1,
  );
}

/** All action bars: by ARIA shape, plus any found via the copy button anchor. */
function findActionBars(root: ParentNode): Element[] {
  const bars = new Set<Element>(Array.from(root.querySelectorAll(ACTION_BAR_SELECTOR)));
  for (const copyButton of Array.from(root.querySelectorAll(COPY_BUTTON_SELECTOR))) {
    const bar = copyButton.closest('[role="group"]') ?? copyButton.parentElement;
    if (bar !== null) {
      bars.add(bar);
    }
  }
  return Array.from(bars);
}

/**
 * Climb from an action bar to the nearest ancestor that has message content
 * beyond the bar itself — that ancestor is the message container.
 */
function containerForActionBar(bar: Element, root: ParentNode): Element | undefined {
  let el: Element | null = bar.parentElement;
  while (el !== null && (el as unknown) !== root) {
    const tag = el.tagName.toUpperCase();
    if (tag === 'BODY' || tag === 'HTML') {
      return undefined;
    }
    if (hasContentBesides(el, bar)) {
      return el;
    }
    el = el.parentElement;
  }
  return undefined;
}

/** Does `el` contain block content or text that is not inside `bar`? */
function hasContentBesides(el: Element, bar: Element): boolean {
  for (const block of Array.from(el.querySelectorAll(BLOCK_SELECTOR))) {
    if (!bar.contains(block)) {
      return true;
    }
  }
  const total = (el.textContent ?? '').replace(/\s+/g, '').length;
  const barOnly = (bar.textContent ?? '').replace(/\s+/g, '').length;
  return total > barOnly;
}

/** First match of `selector` within `scope` (or `scope` itself), outside `exclude`. */
function matchWithin(scope: Element, selector: string, exclude: Element): Element | undefined {
  if (scope.matches(selector)) {
    return scope;
  }
  for (const match of Array.from(scope.querySelectorAll(selector))) {
    if (!exclude.contains(match)) {
      return match;
    }
  }
  return undefined;
}

function toMessage(
  candidate: Candidate,
  index: number,
  all: Candidate[],
  issues: DomExtractionIssue[],
): Message {
  let sender = candidate.sender;
  if (sender === undefined) {
    // Structural heuristic: turns alternate human/assistant.
    const previous = index > 0 ? all[index - 1]?.sender : undefined;
    sender = previous === 'human' ? 'assistant' : 'human';
    candidate.sender = sender; // So the next unknown alternates off this one.
    issues.push({
      path: `message[${index}]`,
      message: `Sender of message ${index + 1} inferred from turn order (no user/assistant hook matched)`,
    });
  }

  const text = extractRichText(candidate.el);
  if (text === '') {
    issues.push({
      path: `message[${index}]`,
      message: `Message ${index + 1} matched a container but no text could be extracted from it`,
    });
  }

  return {
    id: `dom-message-${index + 1}`,
    parentId: index === 0 ? null : `dom-message-${index}`,
    sender,
    createdAt: undefined,
    updatedAt: undefined,
    blocks: text === '' ? [] : [{ type: 'text', text }],
    attachments: [],
    files: [],
  };
}

// ---------------------------------------------------------------------------
// Rendered HTML → Markdown-ish text
// ---------------------------------------------------------------------------

/** Map a message container's rendered content to Markdown-ish text. */
function extractRichText(container: Element): string {
  return blockSegments(container).join('\n\n').trim();
}

function shouldSkip(el: Element): boolean {
  if (SKIP_TAGS.has(el.tagName.toUpperCase())) {
    return true;
  }
  if (el.getAttribute('aria-hidden') === 'true') {
    return true;
  }
  // The action bar (copy/edit/retry buttons) is chrome, not content.
  return el.getAttribute('role') === 'group' && el.getAttribute('aria-label') === 'Message actions';
}

/** Walk children, mapping block-level elements and flushing inline runs. */
function blockSegments(el: Element): string[] {
  const out: string[] = [];
  let run = '';
  const flush = (): void => {
    const text = tidyInline(run);
    if (text !== '') {
      out.push(text);
    }
    run = '';
  };

  for (const node of Array.from(el.childNodes)) {
    if (node.nodeType === TEXT_NODE) {
      run += node.textContent ?? '';
      continue;
    }
    if (node.nodeType !== ELEMENT_NODE) {
      continue;
    }
    const child = node as Element;
    if (shouldSkip(child)) {
      continue;
    }
    const tag = child.tagName.toUpperCase();
    const headingLevel = /^H([1-6])$/.exec(tag)?.[1];

    if (tag === 'BR') {
      run += LINE_BREAK;
    } else if (tag === 'P') {
      flush();
      const text = tidyInline(inlineText(child));
      if (text !== '') {
        out.push(text);
      }
    } else if (headingLevel !== undefined) {
      flush();
      const text = tidyInline(inlineText(child));
      if (text !== '') {
        out.push(`${'#'.repeat(Number(headingLevel))} ${text}`);
      }
    } else if (tag === 'PRE') {
      flush();
      out.push(codeFence(child));
    } else if (tag === 'UL' || tag === 'OL') {
      flush();
      const text = listText(child, 0);
      if (text !== '') {
        out.push(text);
      }
    } else if (tag === 'TABLE') {
      flush();
      const text = tableText(child);
      if (text !== '') {
        out.push(text);
      }
    } else if (tag === 'BLOCKQUOTE') {
      flush();
      const inner = blockSegments(child).join('\n\n');
      if (inner !== '') {
        out.push(
          inner
            .split('\n')
            .map((line) => (line === '' ? '>' : `> ${line}`))
            .join('\n'),
        );
      }
    } else if (child.querySelector(BLOCK_SELECTOR) !== null) {
      // A wrapper around further block content: recurse as blocks.
      flush();
      out.push(...blockSegments(child));
    } else {
      // Leaf container: treat as inline content.
      run += inlineText(child);
    }
  }
  flush();
  return out;
}

/** Flatten an element to inline Markdown-ish text (code/bold/italic/links). */
function inlineText(node: Node): string {
  if (node.nodeType === TEXT_NODE) {
    return node.textContent ?? '';
  }
  if (node.nodeType !== ELEMENT_NODE) {
    return '';
  }
  const el = node as Element;
  if (shouldSkip(el)) {
    return '';
  }
  const tag = el.tagName.toUpperCase();
  if (tag === 'BR') {
    return LINE_BREAK;
  }
  const inner = Array.from(el.childNodes).map(inlineText).join('');
  switch (tag) {
    case 'CODE':
      return inner.trim() === '' ? '' : `\`${inner.trim()}\``;
    case 'STRONG':
    case 'B':
      return inner.trim() === '' ? '' : `**${inner.trim()}**`;
    case 'EM':
    case 'I':
      return inner.trim() === '' ? '' : `*${inner.trim()}*`;
    case 'A': {
      const href = el.getAttribute('href') ?? '';
      const text = inner.trim();
      if (text === '') {
        return '';
      }
      return href === '' || href.startsWith('#') ? text : `[${text}](${href})`;
    }
    default:
      return inner;
  }
}

/**
 * Collapse whitespace (rendered HTML treats source newlines as spaces) and
 * turn `<br>` placeholders into real newlines.
 */
function tidyInline(text: string): string {
  return text
    .split(LINE_BREAK)
    .map((line) => line.replace(/\s+/g, ' ').trim())
    .join('\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

/** `pre > code` → fenced code block, with the language class when present. */
function codeFence(pre: Element): string {
  const code = pre.querySelector('code') ?? pre;
  const language = /(?:language|lang)-([A-Za-z0-9#+._-]+)/.exec(code.className)?.[1] ?? '';
  const text = (code.textContent ?? '').replace(/\n+$/, '');
  let fence = '```';
  while (text.includes(fence)) {
    fence += '`';
  }
  return `${fence}${language}\n${text}\n${fence}`;
}

/** `ul`/`ol` → Markdown list, recursing into nested lists. */
function listText(list: Element, depth: number): string {
  const ordered = list.tagName.toUpperCase() === 'OL';
  const indent = '  '.repeat(depth);
  const lines: string[] = [];
  let index = 1;
  for (const item of Array.from(list.children)) {
    if (item.tagName.toUpperCase() !== 'LI' || shouldSkip(item)) {
      continue;
    }
    const text = tidyInline(itemInlineText(item)).replace(/\n+/g, ' ');
    if (text !== '') {
      lines.push(`${indent}${ordered ? `${index}. ` : '- '}${text}`);
    }
    index += 1;
    for (const nested of Array.from(item.children)) {
      const tag = nested.tagName.toUpperCase();
      if ((tag === 'UL' || tag === 'OL') && !shouldSkip(nested)) {
        const nestedText = listText(nested, depth + 1);
        if (nestedText !== '') {
          lines.push(nestedText);
        }
      }
    }
  }
  return lines.join('\n');
}

/** An `li`'s own inline text, excluding any nested lists (rendered separately). */
function itemInlineText(item: Element): string {
  return Array.from(item.childNodes)
    .filter((node) => {
      if (node.nodeType !== ELEMENT_NODE) {
        return true;
      }
      const tag = (node as Element).tagName.toUpperCase();
      return tag !== 'UL' && tag !== 'OL';
    })
    .map(inlineText)
    .join('');
}

/** `table` → Markdown pipe table (header separator after the first row). */
function tableText(table: Element): string {
  const rows = Array.from(table.querySelectorAll('tr')).filter((row) => !shouldSkip(row));
  const lines: string[] = [];
  rows.forEach((row, rowIndex) => {
    const cells = Array.from(row.children).filter((cell) => {
      const tag = cell.tagName.toUpperCase();
      return (tag === 'TH' || tag === 'TD') && !shouldSkip(cell);
    });
    if (cells.length === 0) {
      return;
    }
    const texts = cells.map((cell) =>
      tidyInline(inlineText(cell)).replace(/\n+/g, ' ').replaceAll('|', '\\|'),
    );
    lines.push(`| ${texts.join(' | ')} |`);
    if (rowIndex === 0) {
      lines.push(`| ${texts.map(() => '---').join(' | ')} |`);
    }
  });
  return lines.join('\n');
}
