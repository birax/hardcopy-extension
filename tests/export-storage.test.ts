import { beforeEach, describe, expect, it } from 'vitest';
import { fakeBrowser } from 'wxt/testing';

import {
  DEFAULT_EXPORT_OPTIONS,
  EXPORT_OPTIONS_STORAGE_KEY,
  loadExportOptions,
  saveExportOptions,
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
