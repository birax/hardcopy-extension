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
    name: 'Hardcopy',
    description:
      'Export your Claude conversations as Markdown, PDF, Word, RTF and plain text — fully in your browser.',
    host_permissions: ['https://claude.ai/*'],
    permissions: ['storage', 'downloads'],
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
});
