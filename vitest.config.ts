import { defineConfig } from 'vitest/config';
import { WxtVitest } from 'wxt/testing';

// WxtVitest wires up WXT's Vite config (aliases, define, plugins) and polyfills
// the `browser` extension API with @webext-core/fake-browser.
// See https://wxt.dev/guide/essentials/unit-testing
export default defineConfig({
  plugins: [WxtVitest()],
  test: {
    coverage: {
      provider: 'v8',
      include: ['src/**'],
      reporter: ['text', 'lcov'],
    },
  },
});
