# ADR 0002: Fully client-side, no external dependencies

- **Status:** accepted
- **Date:** 2026-07-06
- **Deciders:** Laurie Calverley (owner)

## Context

The extension handles private conversation data. Users must be able to trust that their chats never leave their machine. Store review processes (Chrome Web Store, AMO, Edge Add-ons, App Store) also strongly favour extensions that can declare "no data collected".

## Decision

1. All conversation parsing and all export-format generation (Markdown, PDF, DOCX, RTF, plain text) run **entirely in the user's browser**.
2. The only permitted network contact is **claude.ai itself** (the page the user is on and its backing API), using the user's own existing session. Host permissions are limited to `https://claude.ai/*`.
3. **No runtime external dependencies**: every library is vendored/bundled into the extension at build time. No CDN scripts, no remote fonts, no telemetry/analytics, no update or licence checks, no third-party services of any kind.
4. Exports are delivered via the browser's download mechanism to the user's own filesystem.

Build-time developer tooling (compiler, bundler, test runner) is exempt — it is pinned in the repo and never ships in the artifact.

## Consequences

- The privacy policy can truthfully declare zero data collection; store review friction is minimised.
- Format libraries must be chosen for permissive licences and full in-browser operation (informs ADR on format stack).
- No server costs, no uptime concerns, works offline for already-loaded conversations.
- PDF generation must be done in-browser, which constrains library choice (evaluated in research).
