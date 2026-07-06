/**
 * Popup preference persistence (issue #14): the format key plus the shared
 * export options round-trip through storage.local, and anything unusable
 * falls back to its default.
 */

import { beforeEach, describe, expect, it } from 'vitest';
import { fakeBrowser } from 'wxt/testing';

import { DEFAULT_EXPORT_OPTIONS } from '../src/lib/export/options';
import {
  DEFAULT_EXPORT_FORMAT,
  EXPORT_FORMAT_STORAGE_KEY,
  loadPreferences,
  savePreferences,
} from '../src/lib/popup/preferences';

describe('popup preferences', () => {
  beforeEach(() => {
    fakeBrowser.reset();
  });

  it('returns markdown and the default options on a fresh install', async () => {
    await expect(loadPreferences()).resolves.toEqual({
      format: DEFAULT_EXPORT_FORMAT,
      options: DEFAULT_EXPORT_OPTIONS,
    });
    expect(DEFAULT_EXPORT_FORMAT).toBe('markdown');
  });

  it('round-trips a full preference set', async () => {
    const preferences = {
      format: 'docx' as const,
      options: {
        ...DEFAULT_EXPORT_OPTIONS,
        includeThinking: true,
        includeTimestamps: true,
        branches: 'all' as const,
      },
    };
    await savePreferences(preferences);
    await expect(loadPreferences()).resolves.toEqual(preferences);
  });

  it('falls back to markdown when the stored format is unusable', async () => {
    await fakeBrowser.storage.local.set({ [EXPORT_FORMAT_STORAGE_KEY]: 'wordperfect' });
    await expect(loadPreferences()).resolves.toMatchObject({ format: 'markdown' });

    await fakeBrowser.storage.local.set({ [EXPORT_FORMAT_STORAGE_KEY]: 42 });
    await expect(loadPreferences()).resolves.toMatchObject({ format: 'markdown' });
  });
});
