// @vitest-environment happy-dom
/**
 * Smoke test for the popup entrypoint: importing it renders the popup into
 * the document and settles in a helpful state even when the tabs API is
 * unavailable (as it is under the fake browser).
 */

import { describe, expect, it, vi } from 'vitest';

import { t } from '../src/lib/i18n';

describe('popup entrypoint', () => {
  it('renders the popup on import and settles in an explainer state', async () => {
    await import('../src/entrypoints/popup/main');
    await vi.waitFor(() => {
      const main = document.querySelector('main.popup');
      expect(main).not.toBeNull();
      expect(main?.querySelector('.banner')?.textContent).toContain(t('unsupportedHeading'));
    });
    expect(document.querySelector('h1')?.textContent).toBe(t('popupTitle'));
  });
});
