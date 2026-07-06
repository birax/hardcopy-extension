import { describe, expect, it } from 'vitest';

import { DEFAULT_BASENAME, MAX_BASENAME_LENGTH, sanitizeBasename } from './filename';

describe('sanitizeBasename', () => {
  it('leaves ordinary titles alone', () => {
    expect(sanitizeBasename('Weekly planning notes')).toBe('Weekly planning notes');
  });

  it('replaces characters that are forbidden on Windows, macOS, or Linux', () => {
    expect(sanitizeBasename('a/b\\c:d*e?f"g<h>i|j')).toBe('a b c d e f g h i j');
  });

  it('strips control characters', () => {
    expect(sanitizeBasename('tabs\tand\nnewlines')).toBe('tabs and newlines');
  });

  it('collapses whitespace runs and trims', () => {
    expect(sanitizeBasename('  too   many    spaces  ')).toBe('too many spaces');
  });

  it('strips leading and trailing dots', () => {
    expect(sanitizeBasename('...hidden file...')).toBe('hidden file');
  });

  it('truncates very long titles', () => {
    const result = sanitizeBasename('x'.repeat(500));
    expect(result).toHaveLength(MAX_BASENAME_LENGTH);
  });

  it('falls back to the default for empty or unusable input', () => {
    expect(sanitizeBasename('')).toBe(DEFAULT_BASENAME);
    expect(sanitizeBasename('   ')).toBe(DEFAULT_BASENAME);
    expect(sanitizeBasename('???')).toBe(DEFAULT_BASENAME);
  });

  it('falls back to the default for Windows reserved device names', () => {
    expect(sanitizeBasename('CON')).toBe(DEFAULT_BASENAME);
    expect(sanitizeBasename('aux')).toBe(DEFAULT_BASENAME);
    expect(sanitizeBasename('COM1')).toBe(DEFAULT_BASENAME);
  });

  it('preserves non-ASCII text', () => {
    expect(sanitizeBasename('Résumé — 履歴書')).toBe('Résumé — 履歴書');
  });
});
