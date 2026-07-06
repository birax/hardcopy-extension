import { resolve } from 'node:path';
import { build as viteBuild } from 'vite';
import { defineConfig } from 'wxt';

// See docs/decisions/0006-core-architecture.md for the reasoning behind
// the stack, permissions, and manifest choices recorded here.
export default defineConfig({
  srcDir: 'src',
  // Auto-imports off: explicit imports keep the code greppable and lintable.
  imports: false,
  // MV3 everywhere, including Firefox (WXT would otherwise default Firefox to MV2).
  manifestVersion: 3,
  manifest: ({ browser }) => ({
    // Name and description resolve from public/_locales/<locale>/messages.json
    // (issue #18); the canonical English strings live in _locales/en.
    name: '__MSG_extName__',
    description: '__MSG_extDescription__',
    default_locale: 'en',
    host_permissions: ['https://claude.ai/*'],
    // NOTE: the export flow downloads via an in-page blob + anchor click
    // (src/lib/flow/download.ts), so `downloads` is currently unused by it.
    // If that approach holds through store review, `downloads` can be dropped
    // here for a smaller permission prompt.
    permissions: ['storage', 'downloads'],
    // The lazily-loaded serializer bundle (see the hooks below) is imported
    // by the content script at export time via
    // `import(browser.runtime.getURL('/serializers/serialize.js'))`; Chrome
    // requires dynamically imported extension files to be web-accessible to
    // the pages the content script runs in.
    web_accessible_resources: [
      {
        resources: ['serializers/*.js'],
        matches: ['https://claude.ai/*'],
      },
    ],
    // Firefox-only keys; Chrome/Edge would warn on unknown manifest keys.
    ...(browser === 'firefox' && {
      browser_specific_settings: {
        gecko: {
          // An explicit add-on ID is required for Firefox MV3.
          id: 'hardcopy@calverley.me.uk',
          // AMO requires a data-collection declaration; Hardcopy collects nothing (ADR 0002).
          data_collection_permissions: {
            required: ['none'],
          },
        },
      },
    }),
  }),
  hooks: {
    // WXT builds content scripts as a single-file IIFE (Vite lib mode), which
    // cannot code-split — a plain `import('./serializers/pdf')` would inline
    // pdf-lib plus ~2 MB of fonts into content.js, paid on every claude.ai
    // page load. Instead, the serializer registry
    // (src/lib/export/serialize.ts) is built here as a standalone ESM bundle
    // under <outDir>/serializers/, where its per-format dynamic imports
    // code-split properly, and the content script loads it on demand with a
    // native `import(browser.runtime.getURL(...))`
    // (src/lib/flow/serializer-loader.ts).
    'build:done': async (wxt) => {
      await viteBuild({
        configFile: false,
        logLevel: 'warn',
        root: wxt.config.root,
        mode: wxt.config.mode,
        define: { 'process.env.NODE_ENV': JSON.stringify(wxt.config.mode) },
        build: {
          outDir: resolve(wxt.config.outDir, 'serializers'),
          emptyOutDir: true,
          copyPublicDir: false,
          // Plain relative `import('./chunk.js')` between the emitted files —
          // no preload helper, so chunk URLs resolve against the entry's own
          // chrome-extension:// URL.
          modulePreload: false,
          rollupOptions: {
            input: { serialize: resolve(wxt.config.srcDir, 'lib/export/serialize.ts') },
            // Keep the entry's exports: the whole point of this bundle is the
            // `serializeConversation` export the content script imports.
            preserveEntrySignatures: 'strict',
            output: {
              format: 'es',
              // Stable entry name (the loader hard-codes it); heavy
              // per-format chunks hang off it with hashed names.
              entryFileNames: '[name].js',
              chunkFileNames: '[name]-[hash].js',
            },
          },
        },
      });
    },
  },
});
