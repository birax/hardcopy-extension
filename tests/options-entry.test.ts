// @vitest-environment happy-dom
/**
 * Smoke test for the options entrypoint: importing it renders the settings
 * page into the document with the defaults on screen, even under the fake
 * browser (empty storage, no manifest).
 */

import { describe, expect, it, vi } from 'vitest';

import { DEFAULT_FILENAME_TEMPLATE } from '../src/lib/export/filename';
import { t } from '../src/lib/i18n';

describe('options entrypoint', () => {
  it('renders the settings page on import with the defaults loaded', async () => {
    await import('../src/entrypoints/options/main');
    await vi.waitFor(() => {
      const main = document.querySelector('main.options-page');
      expect(main).not.toBeNull();
      expect(main?.querySelector<HTMLInputElement>('input[name="filenameTemplate"]')?.value).toBe(
        DEFAULT_FILENAME_TEMPLATE,
      );
    });
    expect(document.querySelector('h1')?.textContent).toBe(t('optionsTitle'));
    expect(
      document.querySelector<HTMLInputElement>('input[name="format"][value="markdown"]')?.checked,
    ).toBe(true);
    expect(document.querySelector('footer .disclaimer')?.textContent).toBe(t('disclaimer'));
  });
});
