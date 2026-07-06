# Claude Session Exporter (working title)

> **Status:** pre-alpha — project bootstrap. Naming, branding, and architecture research in progress; the repo will be renamed when the final brand is chosen.

A browser extension for **Chrome, Firefox, Edge, and Safari** (macOS, Linux, Windows) that exports your **Claude Chat, Cowork, and Claude Code** sessions from claude.ai as:

- Markdown
- PDF
- Word (.docx)
- RTF
- Plain text

With optional inclusion of **thinking blocks, tool use and results, timestamps**, and other metadata not shown in the main chat flow.

## Principles

1. **Everything runs in your browser.** Parsing and every export format are generated entirely client-side. The only network contact is claude.ai itself, using your own existing session.
2. **No external dependencies at runtime.** All libraries are bundled at build time. No CDNs, no remote fonts, no telemetry, no analytics, no update phone-home. The shipped artifact is fully self-contained.
3. **Your data stays yours.** Nothing is collected, stored, or transmitted by this extension — exports go straight to your Downloads folder.
4. **IP-clean and permissively licensed.** Independent project, not affiliated with or endorsed by Anthropic.
5. **Maintainable by humans and AI agents alike.** Fully documented decisions (see `docs/decisions/`), high test coverage, and a curated backlog in GitHub Issues.

## Repository layout

| Path | Purpose |
| --- | --- |
| `docs/decisions/` | Architecture Decision Records (ADRs) — why things are the way they are |
| `docs/research/` | Research reports that informed the design |
| `docs/` | User and developer documentation (grows with the project) |

Source, build, and packaging directories will be added once the architecture ADR is accepted.

## Installing / building

Not yet — watch this space. Local installation instructions for all four browsers, and store listings, are part of the v1 milestone.

## License

To be finalised in the licensing ADR (MIT or Apache-2.0 — permissive either way).
