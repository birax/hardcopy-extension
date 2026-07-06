# DOM fixtures

Hand-built HTML pages exercising the DOM fallback extractor
(`src/lib/dom-fallback`, tested by `tests/dom-fallback.test.ts`). They exist so
selector breakage is caught in CI (issue #6).

## Provenance — read this before trusting the fixtures

Like the API fixtures (see `../README.md`), these pages are **synthesized from
documented hooks**, not saved from a live claude.ai session: this repository's
development environment cannot log in to claude.ai. The hooks come from
`docs/research/2026-07-06-technical-architecture.md` (§1.1, §1.3 "Stability"):
`[data-testid="user-message"]`, `button[data-testid="action-bar-copy"]`,
`[role="group"][aria-label="Message actions"]`, `[data-is-streaming]`, and the
legacy `font-claude-message` class used by prior DOM exporters.

**They must be validated against the live claude.ai DOM** before the first
release; replace them with sanitized captures of real rendered markup (same
sanitization checklist as `../README.md`) as soon as one is available.

## What each fixture covers

| Fixture | Covers |
| --- | --- |
| `full-conversation.html` | Happy path: action-bar anchored turns, user testids, sender inference for assistant turns, headings, nested/ordered lists, `pre code` with a language class, tables, blockquotes, inline code/bold/em/links, title suffix stripping |
| `minimal-partial.html` | Partial markup: no action bars, direct sender hooks only (`user-message`, `font-claude-message`, `data-is-streaming`), no usable title |
| `unrelated-page.html` | A page matching no hooks: empty conversation + issues, never a throw |
