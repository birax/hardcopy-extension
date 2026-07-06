/**
 * Escaping suite for the RTF serializer (threat model T1: RTF control-word
 * injection). Hostile conversation content must never become live RTF: the
 * output stays structurally valid and the content round-trips as plain text.
 */
import { describe, expect, it } from 'vitest';

import type { PreparedBlock, PreparedConversation } from '../src/lib/export';
import { resolveExportOptions } from '../src/lib/export';
import {
  escapeRtfText,
  serializeRtf,
  validateRtfStructure,
} from '../src/lib/export/serializers/rtf';

// --- Test-side inverse of the escaper / mini RTF text extractor ---------------

/**
 * Decode exactly the escape alphabet `escapeRtfText` emits. Used to prove the
 * escaper round-trips: decode(escape(s)) === s.
 */
function decodeEscapes(escaped: string): string {
  let out = '';
  let i = 0;
  while (i < escaped.length) {
    const ch = escaped.charAt(i);
    if (ch !== '\\') {
      out += ch;
      i += 1;
      continue;
    }
    const rest = escaped.slice(i);
    if (rest.startsWith('\\\\')) {
      out += '\\';
      i += 2;
    } else if (rest.startsWith('\\{')) {
      out += '{';
      i += 2;
    } else if (rest.startsWith('\\}')) {
      out += '}';
      i += 2;
    } else if (rest.startsWith('\\tab ')) {
      out += '\t';
      i += 5;
    } else if (rest.startsWith('\\par ')) {
      out += '\n';
      i += 5;
    } else if (rest.startsWith('\\line ')) {
      out += '\n';
      i += 6;
    } else {
      const unicode = /^\\u(-?\d+)\?/.exec(rest);
      if (unicode === null) {
        throw new Error(`unexpected escape at offset ${i}: ${rest.slice(0, 16)}`);
      }
      const n = Number(unicode[1]);
      out += String.fromCharCode(n < 0 ? n + 65536 : n);
      i += unicode[0].length;
    }
  }
  return out;
}

/**
 * Extract the plain text an RTF reader would show: decodes `\uN?` (consuming
 * the one `\uc1` fallback char), maps `\tab`/`\par`/`\line` to whitespace,
 * treats every other control word as non-text, and drops group braces. If any
 * content character leaked through as a control word, it disappears from this
 * extraction and the containment assertions below fail.
 */
function extractText(rtf: string): string {
  let out = '';
  let i = 0;
  while (i < rtf.length) {
    const ch = rtf.charAt(i);
    if (ch === '{' || ch === '}') {
      i += 1;
      continue;
    }
    if (ch !== '\\') {
      out += ch;
      i += 1;
      continue;
    }
    const rest = rtf.slice(i);
    const escaped = /^\\([\\{}])/.exec(rest);
    if (escaped !== null) {
      out += escaped[1];
      i += 2;
      continue;
    }
    const unicode = /^\\u(-?\d+)\?/.exec(rest);
    if (unicode !== null) {
      const n = Number(unicode[1]);
      out += String.fromCharCode(n < 0 ? n + 65536 : n);
      i += unicode[0].length;
      continue;
    }
    const word = /^\\([a-z]+)(-?\d+)? ?/.exec(rest);
    if (word !== null) {
      if (word[1] === 'tab') {
        out += '\t';
      } else if (word[1] === 'par' || word[1] === 'line') {
        out += '\n';
      }
      i += word[0].length;
      continue;
    }
    // \* and any other control symbol: skip both characters.
    i += 2;
  }
  return out;
}

function conversationWith(blocks: PreparedBlock[], title = 'Escaping test'): PreparedConversation {
  return {
    options: resolveExportOptions(),
    title,
    items: [
      { kind: 'metadata', title, createdAt: undefined, updatedAt: undefined },
      { kind: 'message', sender: 'human', senderLabel: 'Human', timestamp: undefined, blocks },
    ],
  };
}

/**
 * What the escaper documents it preserves: CRLF collapses to `\n`, and C0
 * controls other than tab/newline are dropped.
 */
function normalizeForRtf(text: string): string {
  return text
    .replace(/\r\n/g, '\n')
    // eslint-disable-next-line no-control-regex -- testing C0 control handling is the point
    .replace(/[\u0000-\u0008\u000b-\u001f]/g, '');
}

const collapse = (text: string): string => text.replace(/\s+/g, ' ').trim();

// --- Hostile payloads ----------------------------------------------------------

const HOSTILE_PAYLOADS: readonly { name: string; payload: string }[] = [
  {
    name: 'field/hyperlink injection',
    payload: '{\\field{\\*\\fldinst HYPERLINK "http://evil.example/x"}{\\fldrslt click}}',
  },
  { name: 'objdata injection', payload: '{\\object\\objemb{\\*\\objdata 0105}}' },
  { name: 'bin skip attack', payload: '\\bin128 AAAAAAAA' },
  { name: 'unbalanced closers', payload: '}}}}} escape the group }}}' },
  { name: 'unbalanced openers', payload: '{{{{{ open forever {{{' },
  { name: 'backslash storm', payload: '\\\\\\\\\\rtf1\\\\ansi\\\\\\' },
  { name: 'unicode escape smuggling', payload: '\\u8232?\\u-257? and \\uc0' },
  { name: 'null-ish and controls', payload: 'a\u0000b\u0007c\u001bd\u000ee' },
  { name: 'emoji', payload: 'Faces: \u{1F600}\u{1F914} flags: \u{1F1EC}\u{1F1E7} done' },
  { name: 'CJK', payload: '你好世界 こんにちは' },
  { name: 'RTL', payload: 'שלום مرحبا end' },
  { name: 'tabs and CRLF', payload: 'col1\tcol2\r\nrow2\tvalue' },
];

// --- Escaper unit tests ----------------------------------------------------------

describe('escapeRtfText', () => {
  it('escapes the three RTF metacharacters', () => {
    expect(escapeRtfText('\\')).toBe('\\\\');
    expect(escapeRtfText('{')).toBe('\\{');
    expect(escapeRtfText('}')).toBe('\\}');
    expect(escapeRtfText('a{b}c\\d')).toBe('a\\{b\\}c\\\\d');
  });

  it('maps tabs and newlines to \\tab and \\par (or \\line when asked)', () => {
    expect(escapeRtfText('a\tb')).toBe('a\\tab b');
    expect(escapeRtfText('a\nb')).toBe('a\\par b');
    expect(escapeRtfText('a\r\nb')).toBe('a\\par b');
    expect(escapeRtfText('a\nb', '\\line ')).toBe('a\\line b');
  });

  it('drops C0 control characters other than tab and newline', () => {
    expect(escapeRtfText('a\u0000b\u0007c\u001bd')).toBe('abcd');
  });

  it('emits non-ASCII as signed 16-bit \\uN? escapes', () => {
    expect(escapeRtfText('é')).toBe('\\u233?'); // é
    expect(escapeRtfText('你')).toBe('\\u20320?'); // 你 (positive, ≤ 0x7FFF)
    expect(escapeRtfText('א')).toBe('\\u1488?'); // א
    expect(escapeRtfText('�')).toBe('\\u-3?'); // U+FFFD wraps negative
  });

  it('emits astral characters as two \\u escapes (UTF-16 surrogate pair)', () => {
    // U+1F600 GRINNING FACE = D83D DE00 = -10179, -8704 signed.
    expect(escapeRtfText('\u{1F600}')).toBe('\\u-10179?\\u-8704?');
  });

  it('round-trips every hostile payload through decode(escape(s))', () => {
    for (const { payload } of HOSTILE_PAYLOADS) {
      expect(decodeEscapes(escapeRtfText(payload))).toBe(normalizeForRtf(payload));
    }
  });

  it('round-trips seeded pseudo-random hostile strings (property-style)', () => {
    // Deterministic mulberry32 PRNG so failures reproduce exactly.
    let state = 0xdecafbad;
    const random = (): number => {
      state = (state + 0x6d2b79f5) | 0;
      let t = Math.imul(state ^ (state >>> 15), 1 | state);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
    const alphabet = [
      ...'\\{}\t\n abAB19_%;\'"<>&#*`-|',
      'é',
      '你',
      '好',
      'א',
      'م',
      '\u{1F600}',
      '\u{1F9E0}',
    ];
    for (let round = 0; round < 300; round += 1) {
      const length = Math.floor(random() * 40);
      let value = '';
      for (let i = 0; i < length; i += 1) {
        value += alphabet[Math.floor(random() * alphabet.length)];
      }
      const escaped = escapeRtfText(value);
      expect(decodeEscapes(escaped), JSON.stringify(value)).toBe(value);
      // The escaped form must be brace-balanced on its own.
      expect(
        validateRtfStructure(
          `{\\rtf1\\ansi\\ansicpg1252{\\fonttbl x}{\\colortbl;}${escaped}}`,
        ),
      ).toEqual([]);
    }
  });
});

// --- Full-document hostile-content tests -------------------------------------------

describe('serializeRtf under hostile content', () => {
  for (const { name, payload } of HOSTILE_PAYLOADS) {
    it(`stays structurally valid with ${name} in every untrusted slot`, () => {
      const rtf = serializeRtf(
        conversationWith(
          [
            { kind: 'text', text: payload },
            { kind: 'toolResult', name: payload, content: payload, isError: false },
            { kind: 'thinking', thinking: payload, summaries: [payload] },
            { kind: 'unknown', blockType: payload, raw: { nested: payload }, label: payload },
            {
              kind: 'artifact',
              id: payload,
              title: payload,
              artifactType: undefined,
              language: undefined,
              command: payload,
              content: payload,
              isFinal: true,
            },
          ],
          `Title ${payload}`,
        ),
      );
      expect(validateRtfStructure(rtf)).toEqual([]);
    });

    it(`round-trips ${name} as plain text through a mono inset`, () => {
      // toolResult content bypasses markdown tokenization, so the extracted
      // text must contain the payload verbatim (modulo dropped C0 controls
      // and CRLF normalization — exactly what the escaper documents).
      const rtf = serializeRtf(
        conversationWith([
          { kind: 'toolResult', name: undefined, content: payload, isError: false },
        ]),
      );
      expect(extractText(rtf)).toContain(normalizeForRtf(payload));
    });

    it(`keeps ${name} readable when rendered as markdown text`, () => {
      const rtf = serializeRtf(conversationWith([{ kind: 'text', text: payload }]));
      expect(validateRtfStructure(rtf)).toEqual([]);
      // Text blocks are interpreted as markdown, which may fold whitespace
      // and apply backslash-escape semantics (`\*` → `*`), so compare with
      // whitespace collapsed and backslashes ignored: every payload character
      // must still be visible text, never a live control word.
      const seen = collapse(extractText(rtf)).replace(/\\/g, '');
      expect(seen).toContain(collapse(normalizeForRtf(payload)).replace(/\\/g, ''));
    });
  }

  it('never emits an unescaped group-opening control word from content', () => {
    const rtf = serializeRtf(
      conversationWith([
        {
          kind: 'toolResult',
          name: undefined,
          content: HOSTILE_PAYLOADS[0]?.payload ?? '',
          isError: false,
        },
      ]),
    );
    // The literal sequences an RTF reader would act on must not appear...
    expect(rtf).not.toContain('{\\field');
    expect(rtf).not.toContain('{\\object');
    // ...while the escaped, inert forms do.
    expect(rtf).toContain('\\{\\\\field');
  });

  it('emits no raw non-ASCII bytes anywhere in the document', () => {
    for (const { payload } of HOSTILE_PAYLOADS) {
      const rtf = serializeRtf(conversationWith([{ kind: 'text', text: payload }], payload));
      // eslint-disable-next-line no-control-regex -- asserting the output is pure ASCII
      expect(/[^\u0000-\u007f]/.test(rtf)).toBe(false);
    }
  });
});
