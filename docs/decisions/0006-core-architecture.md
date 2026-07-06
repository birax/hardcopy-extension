# ADR 0006: Core architecture — WXT/TypeScript, API-first extraction, AST with five serializers

- **Status:** accepted
- **Date:** 2026-07-06
- **Deciders:** Laurie Calverley (owner), based on the [technical architecture research](../research/2026-07-06-technical-architecture.md)

## Context

We need one codebase producing Manifest V3 extensions for Chrome, Firefox, Edge, and Safari (ADR 0003), running fully client-side (ADR 0002), that reliably captures thinking blocks, tool use/results, timestamps, artifacts, and attachments — data that DOM scraping cannot see and that has caused competitors' breakage. The research report surveyed extraction techniques across every serious existing exporter, compared extension frameworks, and evaluated format libraries; see it for endpoints, JSON shapes, and comparisons. This ADR records the accepted stack.

## Decision

1. **Framework: WXT + TypeScript, MV3.** Single codebase; WXT generates per-browser manifests (Chrome/Edge service worker vs Firefox event page), provides `wxt build -b chrome|firefox|edge|safari` and `wxt zip` including the source zip AMO requires. Safari is wrapped via `safari-web-extension-converter`.
2. **Data extraction: claude.ai internal REST API, from a content script** using the user's own session cookies (`credentials: 'include'`). Core endpoint: `GET /api/organizations/{orgId}/chat_conversations/{convId}?tree=True&rendering_mode=messages&render_all_tools=true`; org ID via `GET /api/organizations` with the `lastActiveOrg` cookie as a hint. **Fallback:** a minimal DOM/copy-button path (intercepting Claude's own copy action) if the API call fails.
3. **Intermediate document model (AST).** One parser converts API JSON into a small internal AST; all five serializers (Markdown, plain text, RTF, PDF, DOCX) render from that AST. When claude.ai changes, only the parser changes.
4. **Format libraries** — all permissive, all fully in-browser, lazy-loaded on export:
   - Markdown, plain text, RTF: **hand-rolled serializers** (RTF ~150–250 lines; existing JS RTF libraries are stale).
   - Word: **`docx`** (npm, MIT).
   - PDF: **`pdf-lib`** (MIT) with bundled Unicode font subsets (including monospace for code) — stores forbid remote fonts anyway.
5. **Testing:** Vitest with WXT's `WxtVitest` plugin + `@webext-core/fake-browser` for units; **fixture-based parser/serializer tests** on sanitized recorded conversation JSON as the backbone; Playwright E2E on Chromium against a **mocked claude.ai** (routes serving fixtures, never real accounts); `web-ext lint`/run smoke for Firefox.
6. **CI: GitHub Actions** — lint/typecheck → tests + coverage → build/zip matrix for chrome/firefox/edge (ubuntu) → Playwright E2E → Safari converter + `xcodebuild` job on `macos-latest`.
7. **Permissions:** `host_permissions: ["https://claude.ai/*"]` plus `storage` and `downloads` only. No remote code, default MV3 CSP.

## Consequences

- API-first extraction is the only path that serves every export option (thinking/tools/timestamps/artifacts/branches), and its endpoint shape has been stable 2024→2026 — far more than the obfuscated DOM. It is still an unofficial API: the fixture suite exists precisely to make upstream changes a one-parser fix.
- The AST decouples five output formats from one fragile input; adding a format or a source (ADR 0007) never multiplies parsers.
- `pdf-lib` has no layout engine — we own word-wrap/pagination (acceptable for linear transcripts); bundled fonts add artifact size but not page-load cost.
- E2E never touches real claude.ai accounts; correctness against reality is maintained by refreshing fixtures.
