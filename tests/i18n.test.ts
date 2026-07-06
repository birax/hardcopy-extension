/**
 * i18n scaffolding tests (issue #18):
 *
 * 1. The English catalogue is well-formed.
 * 2. Every key referenced from source exists in the catalogue (the type
 *    system enforces this too; the test guards non-TS consumers and CI).
 * 3. Every catalogue key is actually used — by a `t()` call, a typed key
 *    map in source, or the manifest's `__MSG_*__` wiring — so dead
 *    messages cannot accumulate.
 * 4. The `t()` helper resolves messages and substitutions, with the bundled
 *    English catalogue as the fallback outside an extension context.
 */

import { readdirSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { afterEach, describe, expect, it, vi } from 'vitest';
import { browser } from 'wxt/browser';

import { MESSAGE_KEYS, t } from '../src/lib/i18n';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const CATALOGUE_PATH = join(ROOT, 'public/_locales/en/messages.json');

interface CatalogueEntry {
  message: string;
  description?: string;
}

const catalogue = JSON.parse(readFileSync(CATALOGUE_PATH, 'utf8')) as Record<
  string,
  CatalogueEntry
>;

/** Every .ts source file under src/, recursively. */
function sourceFiles(dir = join(ROOT, 'src')): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) {
      return sourceFiles(path);
    }
    return entry.name.endsWith('.ts') ? [path] : [];
  });
}

const sources = sourceFiles().map((path) => ({ path, text: readFileSync(path, 'utf8') }));
const manifestConfig = readFileSync(join(ROOT, 'wxt.config.ts'), 'utf8');

describe('the English catalogue', () => {
  it('has a non-empty message for every key', () => {
    expect(Object.keys(catalogue).length).toBeGreaterThan(0);
    for (const [key, entry] of Object.entries(catalogue)) {
      expect(key, `key "${key}" must be a valid i18n key`).toMatch(/^[a-zA-Z][a-zA-Z0-9_]*$/);
      expect(entry.message, `key "${key}" must have a message`).toBeTypeOf('string');
      expect(entry.message.trim(), `key "${key}" must not be blank`).not.toBe('');
    }
  });

  it('matches the typed key list exported by src/lib/i18n.ts', () => {
    expect([...MESSAGE_KEYS].sort()).toEqual(Object.keys(catalogue).sort());
  });

  it('keeps the voice: no exclamation marks anywhere (design system §9)', () => {
    for (const [key, entry] of Object.entries(catalogue)) {
      expect(entry.message, `key "${key}" must not shout`).not.toContain('!');
    }
  });
});

describe('key usage across the source tree', () => {
  // Literal t('...') call sites.
  const referenced = new Set<string>();
  for (const { text } of sources) {
    for (const match of text.matchAll(/(?<![A-Za-z0-9_$.])t\(\s*'([^']+)'/g)) {
      referenced.add(match[1] ?? '');
    }
  }

  it('every t() call uses a key that exists in the catalogue', () => {
    const unknown = [...referenced].filter((key) => !(key in catalogue));
    expect(
      unknown,
      `t() called with keys missing from messages.json: ${unknown.join(', ')}`,
    ).toEqual([]);
  });

  it('every catalogue key is referenced from source or the manifest', () => {
    const unused = Object.keys(catalogue).filter((key) => {
      const inSource = sources.some(({ text }) => text.includes(`'${key}'`));
      const inManifest = manifestConfig.includes(`__MSG_${key}__`);
      return !inSource && !inManifest;
    });
    expect(unused, `unused catalogue keys: ${unused.join(', ')}`).toEqual([]);
  });

  it('the manifest name and description come from the catalogue', () => {
    expect(manifestConfig).toContain("name: '__MSG_extName__'");
    expect(manifestConfig).toContain("description: '__MSG_extDescription__'");
    expect(manifestConfig).toContain("default_locale: 'en'");
  });
});

describe('t()', () => {
  const browserWithI18n = browser as unknown as {
    i18n?: { getMessage: (key: string, substitutions?: string | string[]) => string };
  };
  const originalI18n = browserWithI18n.i18n;

  afterEach(() => {
    browserWithI18n.i18n = originalI18n;
  });

  it('falls back to the bundled English catalogue outside an extension', () => {
    expect(t('exportButton')).toBe('Export');
    expect(t('successHeading')).toBe('Saved to Downloads');
  });

  it('applies $1-style substitutions in the fallback', () => {
    expect(t('warningsSummary', '3')).toBe('Warnings (3)');
    expect(t('savedAnnouncement', ['report.pdf'])).toBe('Saved to Downloads — report.pdf');
  });

  it('prefers browser.i18n.getMessage when it answers', () => {
    const getMessage = vi.fn().mockReturnValue('translated');
    browserWithI18n.i18n = { getMessage };
    expect(t('exportButton')).toBe('translated');
    expect(getMessage).toHaveBeenCalledWith('exportButton', undefined);
  });

  it('passes substitutions through to browser.i18n.getMessage as an array', () => {
    const getMessage = vi.fn().mockReturnValue('x');
    browserWithI18n.i18n = { getMessage };
    t('warningsSummary', '3');
    expect(getMessage).toHaveBeenCalledWith('warningsSummary', ['3']);
  });

  it('falls back when browser.i18n has no translation for the key', () => {
    browserWithI18n.i18n = { getMessage: vi.fn().mockReturnValue('') };
    expect(t('exportButton')).toBe('Export');
  });
});
