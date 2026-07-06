import { beforeEach, describe, expect, it } from 'vitest';
import { fakeBrowser } from 'wxt/testing';

import {
  DEFAULT_EXPORT_OPTIONS,
  DEFAULT_FILENAME_TEMPLATE,
  EXPORT_OPTIONS_STORAGE_KEY,
  FILENAME_TEMPLATE_STORAGE_KEY,
  loadExportOptions,
  loadFilenameTemplate,
  saveExportOptions,
  saveFilenameTemplate,
} from '../src/lib/export';
import type { ExportOptions } from '../src/lib/export';

describe('export options storage', () => {
  beforeEach(() => {
    fakeBrowser.reset();
  });

  it('returns the defaults when nothing is stored', async () => {
    await expect(loadExportOptions()).resolves.toEqual(DEFAULT_EXPORT_OPTIONS);
  });

  it('round-trips saved options through storage.local', async () => {
    const options: ExportOptions = {
      ...DEFAULT_EXPORT_OPTIONS,
      includeThinking: true,
      includeTimestamps: true,
      branches: 'all',
    };
    await saveExportOptions(options);
    await expect(loadExportOptions()).resolves.toEqual(options);

    // Stored under the documented key, as a plain object.
    const stored = await fakeBrowser.storage.local.get(EXPORT_OPTIONS_STORAGE_KEY);
    expect(stored[EXPORT_OPTIONS_STORAGE_KEY]).toEqual(options);
  });

  it('defaults fields whose stored values have the wrong type', async () => {
    await fakeBrowser.storage.local.set({
      [EXPORT_OPTIONS_STORAGE_KEY]: {
        includeThinking: 'yes',
        includeToolUse: true,
        branches: 'weird',
      },
    });
    await expect(loadExportOptions()).resolves.toEqual({
      ...DEFAULT_EXPORT_OPTIONS,
      includeToolUse: true,
    });
  });

  it('ignores stored values that are not objects', async () => {
    await fakeBrowser.storage.local.set({ [EXPORT_OPTIONS_STORAGE_KEY]: 'corrupted' });
    await expect(loadExportOptions()).resolves.toEqual(DEFAULT_EXPORT_OPTIONS);
  });

  it('drops unknown stored keys (options removed in future versions)', async () => {
    await fakeBrowser.storage.local.set({
      [EXPORT_OPTIONS_STORAGE_KEY]: { includeFooter: true, includeArtifacts: false },
    });
    const loaded = await loadExportOptions();
    expect(loaded).toEqual({ ...DEFAULT_EXPORT_OPTIONS, includeArtifacts: false });
    expect('includeFooter' in loaded).toBe(false);
  });
});

describe('filename template storage', () => {
  beforeEach(() => {
    fakeBrowser.reset();
  });

  it('returns the default template when nothing is stored', async () => {
    await expect(loadFilenameTemplate()).resolves.toBe(DEFAULT_FILENAME_TEMPLATE);
  });

  it('round-trips a saved template through storage.local', async () => {
    await saveFilenameTemplate('{date} {title}.{ext}');
    await expect(loadFilenameTemplate()).resolves.toBe('{date} {title}.{ext}');

    // Stored under the documented key, as a plain string.
    const stored = await fakeBrowser.storage.local.get(FILENAME_TEMPLATE_STORAGE_KEY);
    expect(stored[FILENAME_TEMPLATE_STORAGE_KEY]).toBe('{date} {title}.{ext}');
  });

  it('falls back to the default for non-string stored values', async () => {
    await fakeBrowser.storage.local.set({ [FILENAME_TEMPLATE_STORAGE_KEY]: 42 });
    await expect(loadFilenameTemplate()).resolves.toBe(DEFAULT_FILENAME_TEMPLATE);
  });

  it('falls back to the default for stored templates that fail validation', async () => {
    for (const bad of ['', '   ', '{nope}', '{title']) {
      await fakeBrowser.storage.local.set({ [FILENAME_TEMPLATE_STORAGE_KEY]: bad });
      await expect(loadFilenameTemplate()).resolves.toBe(DEFAULT_FILENAME_TEMPLATE);
    }
  });
});
