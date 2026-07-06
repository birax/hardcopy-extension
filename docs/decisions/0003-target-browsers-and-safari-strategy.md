# ADR 0003: Target browsers and Safari strategy

- **Status:** accepted
- **Date:** 2026-07-06
- **Deciders:** Laurie Calverley (owner)

## Context

Target browsers are Chrome, Firefox, Edge, and Safari across macOS, Linux, and Windows. Chrome, Edge, and Firefox share the WebExtensions model and can ship from one codebase. Safari requires the extension to be wrapped in a native Mac app via Xcode (`safari-web-extension-converter`), and App Store distribution additionally requires a paid Apple Developer Program membership ($99/yr).

## Decision

- Single WebExtensions (Manifest V3) codebase targeting all four browsers.
- **Chrome, Firefox, Edge:** first-class targets — local install and store submission from day one of release.
- **Safari:** built and documented for **local installation via Xcode (free)** from the start. App Store packaging is prepared (docs, asset checklists) but actual submission is deferred until the owner enrols in the Apple Developer Program.

## Consequences

- CI builds four artifacts; the Safari wrapper project lives in the repo but signing/notarisation steps are documented rather than automated initially.
- Mac + Safari users get a documented manual install path; other browsers get both local and store paths.
