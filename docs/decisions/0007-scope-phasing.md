# ADR 0007: Scope phasing — Chat first, Code/Cowork experimental in phase 2

- **Status:** accepted
- **Date:** 2026-07-06
- **Deciders:** Laurie Calverley (owner)

## Context

The product vision covers Claude Chat, Claude Code web sessions, and Cowork sessions. But the [technical research](../research/2026-07-06-technical-architecture.md) §1.4 found the latter two rest on undocumented, unstable ground: Claude Code web rides a private API that has **already broken the only known third-party tool** (simonw/claude-code-transcripts flags its web commands as broken after upstream changes, Dec 2025–2026), and Cowork is desktop-app-first with no documented web endpoint at all. Claude Chat's internal API, by contrast, has been stable across independent exporters since 2024. Tying the v1 release to reverse-engineering two moving targets would delay the well-understood 90% and risk shipping features that break within weeks.

## Decision

- **Phase 1 (v1):** Claude Chat export only, all five formats (Markdown, PDF, DOCX, RTF, plain text) with all metadata options; Chrome, Firefox, and Edge store submissions plus documented Safari local install (per ADR 0003).
- **Phase 2:** Claude Code web and Cowork session export — **experimental, best-effort**, implemented behind a `SessionSource` interface so each source is an isolated adapter feeding the shared AST (ADR 0006). Clearly labelled experimental in the UI; breakage of an experimental source must never affect Chat export. Phase 2 also includes bulk export and the Safari App Store submission.

## Consequences

- v1 ships on the stable surface without waiting on reverse-engineering; the Code/Cowork gap (no extension supports them today) remains the phase-2 differentiator.
- The `SessionSource` interface must be designed in phase 1 even though only one implementation ships — a small upfront cost that keeps phase 2 additive.
- Users are never given the impression Code/Cowork export is production-grade until the underlying APIs prove stable; expectation-setting lives in the UI label and README.
