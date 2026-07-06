// @vitest-environment happy-dom
/**
 * DOM fallback extractor tests, against the hand-built fixtures in
 * tests/fixtures/dom (see that directory's README for provenance: the
 * fixtures mirror documented hooks and must be replaced with sanitized live
 * captures before release).
 */

import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

import {
  conversationIdFromPathname,
  extractConversationFromDom,
  type DomExtractionResult,
} from '../src/lib/dom-fallback';

const DOM_FIXTURES_DIR = join(dirname(fileURLToPath(import.meta.url)), 'fixtures', 'dom');

function loadDomFixture(name: string): Document {
  const html = readFileSync(join(DOM_FIXTURES_DIR, name), 'utf8');
  return new DOMParser().parseFromString(html, 'text/html');
}

function issueMessages(result: DomExtractionResult): string {
  return result.issues.map((issue) => issue.message).join('\n');
}

describe('extractConversationFromDom', () => {
  describe('full conversation fixture', () => {
    const result = extractConversationFromDom(loadDomFixture('full-conversation.html'));
    const { conversation } = result;

    it('is marked degraded with the inherent limitations listed', () => {
      expect(result.degraded).toBe(true);
      const messages = issueMessages(result);
      expect(messages).toMatch(/thinking blocks/i);
      expect(messages).toMatch(/timestamps/i);
      expect(messages).toMatch(/tool use inputs/i);
      expect(messages).toMatch(/branch/i);
      expect(messages).toMatch(/attachment/i);
    });

    it('produces a well-formed AST', () => {
      expect(conversation.source).toBe('chat');
      expect(conversation.hasBranches).toBe(false);
      expect(conversation.defaultBranchIndex).toBe(0);
      expect(conversation.branches).toHaveLength(1);
      expect(conversation.branches[0]).toBe(conversation.messages);
      expect(conversation.createdAt).toBeUndefined();
      expect(conversation.updatedAt).toBeUndefined();
      // Linear parent chain with synthesized ids.
      conversation.messages.forEach((message, index) => {
        expect(message.id).toBe(`dom-message-${index + 1}`);
        expect(message.parentId).toBe(index === 0 ? null : `dom-message-${index}`);
        expect(message.createdAt).toBeUndefined();
        expect(message.attachments).toEqual([]);
        expect(message.files).toEqual([]);
        for (const block of message.blocks) {
          expect(block.type).toBe('text');
        }
      });
    });

    it('strips the " - Claude" suffix from the document title', () => {
      expect(conversation.title).toBe('Weekend hiking plan');
    });

    it('finds all four turns with alternating senders', () => {
      expect(conversation.messages).toHaveLength(4);
      expect(conversation.messages.map((message) => message.sender)).toEqual([
        'human',
        'assistant',
        'human',
        'assistant',
      ]);
      // Assistant turns had no sender hook: inference must be reported.
      expect(issueMessages(result)).toMatch(/inferred from turn order/);
    });

    it('extracts user text with inline formatting, without action-bar chrome', () => {
      const first = conversation.messages[0];
      expect(first?.blocks).toHaveLength(1);
      const text = first?.blocks[0]?.type === 'text' ? first.blocks[0].text : '';
      expect(text).toContain('**weekend hike**');
      expect(text).toContain('`gpx`');
      expect(text).not.toContain('Copy');
      expect(text).not.toContain('Edit');
    });

    it('extracts assistant rich content: heading, lists, code, table, quote', () => {
      const second = conversation.messages[1];
      const text = second?.blocks[0]?.type === 'text' ? second.blocks[0].text : '';

      expect(text).toContain('*escape routes*');
      expect(text).toContain('[route notes](https://example.com/route)');
      expect(text).toContain('### Packing list');
      expect(text).toContain('- Water (2l minimum)');
      expect(text).toContain('- Map\n  - paper backup');
      expect(text).toContain('1. Drive to the trailhead\n2. Hike the horseshoe');
      expect(text).toContain('```python\ndef distance(a, b):\n    return abs(a - b)\n```');
      expect(text).toContain('| Day | Distance |\n| --- | --- |\n| Saturday | 12 km |');
      expect(text).toContain('| Sunday | 9 km |');
      expect(text).toContain('> Take the first day slowly.');
      expect(text).not.toContain('Retry');
    });

    it('keeps multiple paragraphs in one text block, blank-line separated', () => {
      const fourth = conversation.messages[3];
      const text = fourth?.blocks[0]?.type === 'text' ? fourth.blocks[0].text : '';
      expect(text).toBe(
        'Done. Sunday is now the Watkin valley path, about 6 km.\n\nTotal ascent drops to 400 m.',
      );
    });
  });

  describe('minimal/partial fixture (no action bars)', () => {
    const result = extractConversationFromDom(loadDomFixture('minimal-partial.html'));
    const { conversation } = result;

    it('finds messages through direct sender hooks alone', () => {
      expect(conversation.messages).toHaveLength(4);
      expect(conversation.messages.map((message) => message.sender)).toEqual([
        'human',
        'assistant',
        'human',
        'assistant',
      ]);
    });

    it('extracts code without a language class as a bare fence', () => {
      const second = conversation.messages[1];
      const text = second?.blocks[0]?.type === 'text' ? second.blocks[0].text : '';
      expect(text).toContain('`grid-template-columns`');
      expect(text).toContain('```\ndisplay: grid;\ngrid-template-columns: repeat(3, 1fr);\n```');
    });

    it('reports the missing title and conversation id', () => {
      expect(conversation.title).toBe('');
      expect(conversation.id).toBe('');
      const messages = issueMessages(result);
      expect(messages).toMatch(/title not found/i);
      expect(messages).toMatch(/Conversation id could not be determined/);
    });
  });

  describe('page matching no hooks', () => {
    const result = extractConversationFromDom(loadDomFixture('unrelated-page.html'));

    it('returns an empty degraded conversation and says why', () => {
      expect(result.degraded).toBe(true);
      expect(result.conversation.messages).toEqual([]);
      expect(result.conversation.branches).toEqual([]);
      expect(result.conversation.hasBranches).toBe(false);
      expect(issueMessages(result)).toMatch(/No chat messages found in the DOM/);
    });

    it('does not scrape unrelated page content into messages', () => {
      expect(result.conversation.messages).toHaveLength(0);
      expect(result.conversation.title).toBe('Completely unrelated page');
    });
  });

  describe('garbage and edge-case input (must never throw)', () => {
    it('handles an empty document', () => {
      const doc = new DOMParser().parseFromString('', 'text/html');
      const result = extractConversationFromDom(doc);
      expect(result.degraded).toBe(true);
      expect(result.conversation.messages).toEqual([]);
    });

    it('handles a detached element', () => {
      const el = document.createElement('div');
      el.innerHTML = '<p>loose paragraph</p>';
      const result = extractConversationFromDom(el);
      expect(result.conversation.messages).toEqual([]);
    });

    it('handles hooks with no content around them', () => {
      const el = document.createElement('div');
      el.innerHTML =
        '<div role="group" aria-label="Message actions">' +
        '<button data-testid="action-bar-copy">Copy</button></div>';
      const result = extractConversationFromDom(el);
      expect(result.conversation.messages).toEqual([]);
      expect(issueMessages(result)).toMatch(/no enclosing element with message content/);
    });

    it('handles deeply weird nesting and empty hook containers', () => {
      const el = document.createElement('div');
      el.innerHTML =
        '<div data-testid="user-message"></div>' +
        '<table><ul><li></li></ul></table>' +
        '<div data-is-streaming><div data-testid="user-message"><p>nested</p></div></div>';
      expect(() => extractConversationFromDom(el)).not.toThrow();
      const result = extractConversationFromDom(el);
      // The empty hook still yields a message (with no blocks) plus an issue.
      const empty = result.conversation.messages[0];
      expect(empty?.blocks).toEqual([]);
      expect(issueMessages(result)).toMatch(/no text could be extracted/);
    });

    it('handles a hostile root whose DOM methods throw', () => {
      const hostile = {
        nodeType: 9,
        querySelectorAll(): never {
          throw new Error('boom');
        },
      } as unknown as Document;
      const result = extractConversationFromDom(hostile);
      expect(result.degraded).toBe(true);
      expect(result.conversation.messages).toEqual([]);
      expect(issueMessages(result)).toMatch(/DOM extraction failed unexpectedly: boom/);
    });

    it('skips an action bar it cannot isolate to a single message', () => {
      const el = document.createElement('div');
      el.innerHTML =
        '<div class="turn"><p>two messages merged</p>' +
        '<div role="group" aria-label="Message actions"><button>Copy</button></div>' +
        '<div role="group" aria-label="Message actions"><button>Copy</button></div></div>';
      const result = extractConversationFromDom(el);
      expect(result.conversation.messages).toEqual([]);
      expect(issueMessages(result)).toMatch(/Could not isolate a single message/);
    });

    it('handles the live document with random junk in the body', () => {
      document.body.innerHTML = '<span>💥</span><p>not a chat</p><div role="group"></div>';
      expect(() => extractConversationFromDom(document)).not.toThrow();
      const result = extractConversationFromDom(document);
      expect(result.conversation.messages).toEqual([]);
    });
  });
  describe('structure handling details', () => {
    function extractSingleMessageText(bodyHtml: string): string {
      const el = document.createElement('div');
      el.innerHTML = `<div data-testid="user-message">${bodyHtml}</div>`;
      const result = extractConversationFromDom(el);
      const first = result.conversation.messages[0];
      return first?.blocks[0]?.type === 'text' ? first.blocks[0].text : '';
    }

    it('falls back to a page heading when the document title is unusable', () => {
      document.title = 'Claude';
      document.body.innerHTML =
        '<header><h1>Budget review</h1></header>' +
        '<div data-testid="user-message"><p>hello</p></div>';
      const result = extractConversationFromDom(document);
      expect(result.conversation.title).toBe('Budget review');
    });

    it('turns <br> into a newline but collapses source-formatting whitespace', () => {
      expect(extractSingleMessageText('<p>line one<br />line   two\n indented</p>')).toBe(
        'line one\nline two indented',
      );
    });

    it('extends the code fence when the code itself contains backtick fences', () => {
      const text = extractSingleMessageText('<pre><code>```md\nnested\n```</code></pre>');
      expect(text).toBe('````\n```md\nnested\n```\n````');
    });

    it('renders same-page anchors as plain text and skips aria-hidden chrome', () => {
      const text = extractSingleMessageText(
        '<p>see <a href="#footnote">the note</a><span aria-hidden="true">×</span></p>',
      );
      expect(text).toBe('see the note');
    });
  });
});

describe('conversationIdFromPathname', () => {
  it('extracts the uuid from a chat path', () => {
    expect(conversationIdFromPathname('/chat/123e4567-e89b-42d3-a456-426614174000')).toBe(
      '123e4567-e89b-42d3-a456-426614174000',
    );
    expect(conversationIdFromPathname('/chat/123E4567-E89B-42D3-A456-426614174000/')).toBe(
      '123E4567-E89B-42D3-A456-426614174000',
    );
  });

  it('returns undefined for non-chat paths', () => {
    expect(conversationIdFromPathname('/')).toBeUndefined();
    expect(conversationIdFromPathname('/new')).toBeUndefined();
    expect(conversationIdFromPathname('/chat/not-a-uuid')).toBeUndefined();
    expect(conversationIdFromPathname('/chat/123e4567-e89b-42d3-a456-42661417400')).toBeUndefined();
  });
});
