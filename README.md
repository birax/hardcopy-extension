# Hardcopy

**Turn your Claude conversations into documents.**

> **Status:** pre-alpha — decisions and design are recorded; implementation has not started. Watch this space.

> Hardcopy is an independent open-source project, not affiliated with, endorsed by, or sponsored by Anthropic. Claude is a trademark of Anthropic, PBC.

Hardcopy is a browser extension for **Chrome, Firefox, Edge, and Safari** (macOS, Linux, Windows) that exports your conversations from claude.ai as:

- Markdown
- PDF
- Word (.docx)
- RTF
- Plain text

with optional inclusion of **thinking blocks, tool use and results, timestamps**, and other metadata not shown in the main chat flow.

**Claude Chat** export is the current focus. **Claude Code web sessions and Cowork sessions** are planned as experimental phase-2 features (see [ADR 0007](docs/decisions/0007-scope-phasing.md)).

## Principles

1. **Everything runs in your browser.** Parsing and every export format are generated entirely client-side. The only network contact is claude.ai itself, using your own existing session.
2. **No external dependencies at runtime.** All libraries are bundled at build time. No CDNs, no remote fonts, no telemetry, no analytics, no update phone-home. The shipped artifact is fully self-contained.
3. **Your data stays yours.** Nothing is collected, stored, or transmitted by this extension — exports go straight to your Downloads folder.
4. **IP-clean and permissively licensed.** Independent project, not affiliated with or endorsed by Anthropic; MIT-licensed; no Anthropic branding anywhere.
5. **Maintainable by humans and AI agents alike.** Fully documented decisions (see `docs/decisions/`), high test coverage, and a curated backlog in GitHub Issues.

## Repository layout

| Path | Purpose |
| --- | --- |
| `LICENSE` | MIT license ([ADR 0005](docs/decisions/0005-mit-license.md)) |
| `src/entrypoints/` | Extension entrypoints (content script, popup) per [WXT](https://wxt.dev/) convention |
| `src/lib/` | Shared library code (parser, document model, serializers as they land) |
| `wxt.config.ts` | WXT / manifest configuration |
| `.github/workflows/` | CI: typecheck, lint, tests + coverage, chrome/firefox/edge build matrix |
| `docs/decisions/` | Architecture Decision Records (ADRs) — why things are the way they are |
| `docs/research/` | Research reports that informed the design |
| `docs/` | User and developer documentation (grows with the project) |

[ADR 0006](docs/decisions/0006-core-architecture.md) records the stack: WXT + TypeScript, MV3, API-first extraction, an intermediate document model with five serializers.

## Installing / building

Not yet — watch this space. Local installation instructions for all four browsers, and store listings for Chrome, Firefox, and Edge (Safari local install documented; App Store later), are part of the v1 milestone.

### Development

The WXT + TypeScript scaffold is in place: `pnpm install`, then `pnpm dev` for a live-reloading build, or `pnpm build` / `pnpm build:firefox` / `pnpm build:edge` for production builds in `.output/`. See [docs/CONTRIBUTING.md](docs/CONTRIBUTING.md) for full setup, commands, and how to load the unpacked extension in each browser.

## License

[MIT](LICENSE) © 2026 Laurie Calverley. See [ADR 0005](docs/decisions/0005-mit-license.md) for the reasoning.

---

*Hardcopy is an independent open-source project, not affiliated with, endorsed by, or sponsored by Anthropic. Claude is a trademark of Anthropic, PBC.*
