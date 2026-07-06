# Draft store data-use disclosure answers

Draft answers for the four stores' privacy/data questionnaires, prepared for issue #19. Copy these into the dashboards at submission time; keep them in sync with [PRIVACY.md](../../PRIVACY.md) and the [threat model](threat-model.md). Privacy policy URL for all stores:

```
https://github.com/birax/hardcopy-extension/blob/main/PRIVACY.md
```

## Chrome Web Store — Privacy tab

- **Single purpose description:** "Export your Claude conversations from claude.ai to local files (Markdown, PDF, Word, RTF, plain text). All processing happens locally in your browser."
- **Data collection disclosures:** check **none** of the data categories. The extension does not collect or transmit any user data.
- **Certifications:** certify that the extension (1) does **not** sell data to third parties, (2) does **not** use or transfer data for purposes unrelated to its single purpose, (3) does **not** use or transfer data to determine creditworthiness or for lending. Certify **Limited Use** compliance (trivially satisfied: no data leaves the device).
- **Permission justifications:**
  - `https://claude.ai/*` — "Required to run on claude.ai and fetch the user's own conversation from claude.ai (using their existing session) so it can be exported. The extension contacts no other host."
  - `storage` — "Stores the user's export preferences (format, metadata options) locally."
  - `downloads` — "Saves the generated export file to the user's device."
- **Remote code:** No.

## Firefox Add-ons (AMO) — data collection disclosure

- **Does the add-on collect or transmit user data?** No. All processing is local; the only network requests go to claude.ai using the user's own session; no analytics, telemetry, or error reporting.
- **Data collection permissions (manifest `browser_specific_settings` data disclosure, if prompted):** none / "does not collect data".
- **Source code submission:** required (bundled/minified build). Submit WXT's generated source zip with build instructions: `pnpm install && pnpm zip:firefox` (Node + pnpm versions pinned in repo).

## Microsoft Edge Add-ons

- **Privacy policy URL:** as above (required field).
- **Data collection questions:** mirror the CWS answers — no data collected, sold, or shared; permissions justified identically.

## Apple App Store — privacy nutrition label

- **Data collection:** select **"Data Not Collected"** (no data collected from this app).
- **Privacy policy URL:** as above (mandatory field in App Store Connect).
- **Note:** keep "Claude" out of the app *name* (subtitle/description only) per [ADR 0004](../decisions/0004-name-and-brand-hardcopy.md).

## Listing boilerplate (all stores)

Include verbatim in every listing description:

> Hardcopy is an independent open-source project, not affiliated with, endorsed by, or sponsored by Anthropic. Claude is a trademark of Anthropic, PBC.

And a privacy summary line:

> No data collected. Everything runs locally in your browser; the only network requests go to claude.ai using your own session. Open source: https://github.com/birax/hardcopy-extension
