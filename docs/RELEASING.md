# Releasing Hardcopy

The release pipeline is tag-driven: pushing a `vX.Y.Z` tag runs
[`.github/workflows/release.yml`](../.github/workflows/release.yml), which
gates, builds, zips, checksums, and publishes a GitHub Release. Store
submission is manual (per store, below). This runbook is written to be
followed by a human or an agent.

## Versioning

The version is **single-sourced from `package.json`**. WXT derives the
manifest `version` for every browser build from it (`wxt.config.ts` sets no
`manifest.version` override, so WXT falls back to the package version — see
[WXT's manifest docs](https://wxt.dev/guide/key-concepts/manifest.html#version-and-version-name)).
Never hand-edit a manifest version; bump `package.json` only.

Use [Semantic Versioning](https://semver.org/spec/v2.0.0.html). Note that
extension stores only accept plain `X.Y.Z(.W)` versions — WXT strips any
pre-release suffix from the manifest version, so avoid `-beta` style
versions for store-bound releases.

## Pre-release checklist

Automated gates run again in CI, but these need eyes:

- [ ] `pnpm typecheck && pnpm lint && pnpm test` green locally.
- [ ] **Document open-checks** — export a real conversation and open the
      results in actual apps, not just viewers that happen to be lenient:
  - [ ] `.docx` opens cleanly in **Word** and **LibreOffice Writer**
        (styles, code blocks, images, no repair prompt).
  - [ ] `.rtf` opens cleanly in **Word**, **LibreOffice Writer**, and
        **TextEdit** (TextEdit is the strictest about stray control words).
  - [ ] `.pdf` renders in a viewer with fonts embedded (no substitution).
  - [ ] `.md` / `.txt` spot-checked for structure and escaping.
- [ ] **Live-site validation** — claude.ai changes without notice:
  - [ ] The API client works against the live site (compare a live
        conversation payload with the shapes in the sanitized fixtures;
        refresh fixtures if drifted).
  - [ ] The DOM fallback selectors still match the live claude.ai DOM.
- [ ] **Store assets** up to date for any listing you will touch: icons
      (128×128 in-zip for CWS), screenshots (1280×800), CWS 440×280 small
      promo tile — requirements per store in
      [docs/research/2026-07-06-naming-branding-stores.md](research/2026-07-06-naming-branding-stores.md) §4.
- [ ] `CHANGELOG.md` `[Unreleased]` section actually reflects what shipped.

## Cutting the release

1. **Bump the version** in `package.json` (nothing else needs touching —
   see [Versioning](#versioning)).
2. **Update `CHANGELOG.md`**: rename `## [Unreleased]` to
   `## [X.Y.Z] - YYYY-MM-DD`, start a fresh empty `## [Unreleased]` above
   it, and update the link references at the bottom.
   **This is load-bearing**: the workflow builds the release notes from the
   `## [X.Y.Z]` section and **fails the release if the section is missing**.
   That guard is deliberate — every release ships human-written notes.
3. **Commit** the bump + changelog on `main` (via the normal PR/CI flow):
   `Release vX.Y.Z`.
4. **Tag and push** the commit that CI has passed on:

   ```sh
   git tag -a vX.Y.Z -m "Hardcopy vX.Y.Z"
   git push origin vX.Y.Z
   ```

5. **Watch the workflow** (`gh run watch`, or the Actions tab). What it does:
   - Runs the gates: typecheck, lint, tests.
   - **Guard**: verifies the tag equals the `package.json` version — a
     mismatched tag fails the run (delete the tag, fix, re-tag).
   - **Guard**: extracts the `## [X.Y.Z]` section from `CHANGELOG.md` as the
     release notes — a missing section fails the run.
   - Builds and zips chrome, firefox (including the **AMO sources zip**),
     and edge via `pnpm zip` / `zip:firefox` / `zip:edge`.
   - Generates `SHA256SUMS.txt` over all zips.
   - Creates the GitHub Release `vX.Y.Z` with the three store zips, the
     sources zip, and the checksums file attached.
6. **Verify** the release page: four zips + `SHA256SUMS.txt` attached, notes
   match the changelog.

### Smoke-testing the workflow without tagging

The workflow also has a `workflow_dispatch` trigger with a `dry_run` input:

```sh
gh workflow run release.yml -f dry_run=true
```

This runs the gates and all build/zip/checksum steps and uploads the zips as
a workflow artifact, but never creates a release (release creation requires a
tag ref, and `dry_run` skips it regardless).

## Store submission (manual)

Full requirements, review times, and asset specs per store:
[docs/research/2026-07-06-naming-branding-stores.md](research/2026-07-06-naming-branding-stores.md) §4.
Drafted answers for every store's privacy/data questionnaire:
[docs/security/store-data-disclosures.md](security/store-data-disclosures.md)
— copy those in verbatim and keep them in sync with `PRIVACY.md`.

Download the zips from the GitHub Release (not a local build) so every store
gets the same audited artifact; verify against `SHA256SUMS.txt` first:

```sh
sha256sum -c SHA256SUMS.txt   # shasum -a 256 -c on macOS
```

### Chrome Web Store

1. [Developer dashboard](https://chrome.google.com/webstore/devconsole) →
   the Hardcopy item → **Package** → upload `hardcopy-X.Y.Z-chrome.zip`.
2. Update the listing if screenshots/description changed; the **Privacy**
   tab answers are in the disclosures doc.
3. Submit for review (typically 1–3 business days).

### Firefox Add-ons (AMO)

1. [Developer hub](https://addons.mozilla.org/developers/) → Hardcopy →
   **Upload new version** → `hardcopy-X.Y.Z-firefox.zip`.
2. When prompted for source code (required — the build is bundled), upload
   `hardcopy-X.Y.Z-sources.zip` from the same release, with build
   instructions: `pnpm install && pnpm zip:firefox` (Node version per
   `.nvmrc`, pnpm version per `packageManager` in `package.json`).
3. Data-collection answers per the disclosures doc. Signing is usually
   minutes; human review may follow.

### Microsoft Edge Add-ons

1. [Partner Center](https://partner.microsoft.com/dashboard/microsoftedge/) →
   Hardcopy → new submission → upload `hardcopy-X.Y.Z-edge.zip`.
2. Privacy policy URL + data answers per the disclosures doc.
3. Review can take up to 7 business days.

### Safari

**Deferred** — see
[ADR 0003](decisions/0003-target-browsers-and-safari-strategy.md): local
Xcode installs are documented, but App Store submission waits on Apple
Developer Program enrolment. When that lands, follow the App Store notes in
the research doc §4 (keep "Claude" out of the app name).

## After the release

- Close the milestone / release issues if any remain open.
- Sanity-install one store build once each review clears (the stores serve
  their own repackaged artifacts).
- Store upload automation (`wxt submit`) is a possible follow-up (issue #26
  acceptance criteria list it as wire-or-document; it is documented here as
  manual for now).
