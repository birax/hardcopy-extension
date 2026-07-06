# Changelog

All notable changes to Hardcopy will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

Release mechanics (how entries here become GitHub Releases) are documented in
[docs/RELEASING.md](docs/RELEASING.md).

## [Unreleased]

### Added

- Conversation data layer: claude.ai API client running in the content script,
  a defensive parser into a shared document model (AST), and sanitized
  conversation fixtures with a snapshot test harness (#3, #4, #5).
- DOM/copy-button fallback extraction so exports degrade gracefully when the
  API shape changes (#6).
- Five serializers from the shared document model: plain text (#9),
  Markdown (#8), hand-rolled RTF with injection-safe escaping (#10),
  Word/.docx via the `docx` package (#11), and PDF via pdf-lib with a pure
  layout engine and bundled font subsets (#12).
- Shared export-options model, prepare pre-pass, and filename templating
  used by every serializer (#13).
- Hardcopy visual identity: icon, rasterized assets, and design system (#17).
- Privacy policy, security policy, threat model, and draft store data-use
  disclosures (#19).
- Project foundation: WXT + TypeScript (strict) extension scaffold with
  pnpm, ESLint, Prettier, and Vitest (#1); GitHub Actions CI running
  typecheck, lint, and tests, then a chrome/firefox/edge build matrix with
  zip artifacts (#2).
- Tag-driven release automation: gates, store zips (including the AMO
  sources zip), SHA-256 checksums, and GitHub Releases with notes pulled
  from this changelog (#26).

[Unreleased]: https://github.com/birax/hardcopy-extension/commits/main
