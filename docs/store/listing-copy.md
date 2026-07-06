# Store listing copy

Ready-to-paste listing copy for Chrome Web Store, Firefox Add-ons (AMO),
Microsoft Edge Add-ons, and the Apple App Store (issue #20). Naming follows
[ADR 0004](../decisions/0004-name-and-brand-hardcopy.md) — brand first,
"Claude" only as a nominative descriptor, never leading — and the store
requirements in
[the naming research §4](../research/2026-07-06-naming-branding-stores.md).

Companion documents:

- **Privacy questionnaires** (dashboard data-use forms, permission
  justifications, nutrition label): use
  [docs/security/store-data-disclosures.md](../security/store-data-disclosures.md)
  verbatim — not duplicated here.
- **Asset inventory and regeneration**: [assets-README.md](assets-README.md).

Voice rules apply to every string here (design system §9): sentence case, no
exclamation marks, facts not feelings.

## Name

The canonical full title and its within-limit variants. Character counts are
exact; a store's name limit is the binding constraint noted per store below.

| Variant | Text | Length |
| --- | --- | --- |
| Full title | `Hardcopy — Export Claude chats to Markdown, PDF & Word` | 54 |
| ≤ 45 (manifest/CWS/Edge) | `Hardcopy — Export Claude chats as PDF & Word` | 44 |
| Apple app name (≤ 30, no "Claude") | `Hardcopy — Chat Exporter` | 24 |
| Apple subtitle (≤ 30) | `Export chats from Claude` | 24 |

Never any form where "Claude" precedes "Hardcopy".

## The disclaimer

Verbatim, in **every** store description, as the first paragraph after the
summary (ADR 0004; never shortened or paraphrased):

> Hardcopy is an independent open-source project, not affiliated with,
> endorsed by, or sponsored by Anthropic. Claude is a trademark of
> Anthropic, PBC.

## Shared full description

The base description used by every store (per-store deltas follow). Plain
text; blank lines separate paragraphs.

```text
Hardcopy saves a Claude conversation as a real document on your machine — Markdown, PDF, Word (DOCX), Rich Text (RTF) or plain text — in one click, without the conversation ever leaving your browser.

Hardcopy is an independent open-source project, not affiliated with, endorsed by, or sponsored by Anthropic. Claude is a trademark of Anthropic, PBC.

What it does

• Five formats: Markdown, PDF, Word (DOCX), Rich Text (RTF) and plain text
• Choose what to include: thinking blocks, tool use and tool results, artifacts, attachments, per-message timestamps, and the title and date header
• Edited conversations: export the branch claude.ai currently shows, or every branch
• Filename templates with {title}, {date} and {ext} placeholders, with a live preview
• Follows your browser's light or dark theme, and meets WCAG 2.2 AA accessibility

Private by design

• Everything runs locally in your browser: the conversation is fetched from claude.ai with your own session and turned into a file on your device
• No data collection, no telemetry, no analytics, no account
• Minimal permissions: storage (for your preferences) and access to claude.ai — nothing else
• Free and open source (MIT): https://github.com/birax/hardcopy-extension
• Privacy policy: https://github.com/birax/hardcopy-extension/blob/main/PRIVACY.md

Support

Questions or problems: https://github.com/birax/hardcopy-extension/issues
```

## Chrome Web Store

- **Name** — comes from the manifest (`extName` in
  `public/_locales/en/messages.json`); Chrome caps the manifest `name` at
  **45 characters**, so the 54-character full title does not fit. At
  submission time set `extName` to the 44-character variant
  `Hardcopy — Export Claude chats as PDF & Word` and add
  `"short_name": "Hardcopy"` to the manifest so toolbar/chrome UI surfaces
  keep the plain brand.
- **Summary** (≤ 132 characters) — the manifest description, 100 characters:

  ```text
  Export your Claude conversations as Markdown, PDF, Word, RTF and plain text — fully in your browser.
  ```

- **Description** — the shared full description above, unchanged.
- **Category** — Productivity → Tools.
- **Language** — English.
- **Assets** — `cws-store-icon-128.png` (listing icon),
  `cws-small-tile-440x280.png` (required), `cws-marquee-1400x560.png`
  (optional marquee), screenshots 01–05 in order (below).
- **Privacy tab** — copy from
  [store-data-disclosures.md](../security/store-data-disclosures.md).

## Firefox Add-ons (AMO)

- **Name** — the AMO listing name is editable independently of the manifest;
  AMO truncates long names in listings around 50 characters, so use the same
  44-character variant: `Hardcopy — Export Claude chats as PDF & Word`.
- **Summary** (≤ 250 characters) — 176 characters:

  ```text
  Export your Claude conversations from claude.ai as Markdown, PDF, Word, RTF or plain text. Everything runs locally in your browser — no account, no servers, no data collection.
  ```

- **Description** — the shared full description, plus this AMO-specific
  closing paragraph (source submission is an AMO review requirement):

  ```text
  Hardcopy ships bundled code, so the full source and build instructions are submitted to Mozilla with every release and are public at https://github.com/birax/hardcopy-extension.
  ```

- **Categories** — Download Management (primary), Other (secondary).
- **Assets** — screenshots 01–05 (AMO recommends 1280×800; no tiles needed).
- **Data disclosure** — "does not collect data"; see
  [store-data-disclosures.md](../security/store-data-disclosures.md).

## Microsoft Edge Add-ons

- **Name** — from the manifest, same 45-character cap and same resolution as
  Chrome: `Hardcopy — Export Claude chats as PDF & Word`.
- **Short description** (≤ 132 characters) — same 100-character summary as
  Chrome.
- **Description** — the shared full description, unchanged.
- **Category** — Productivity.
- **Assets** — `edge-store-logo-300x300.png` (store logo, required),
  `edge-small-promo-tile-440x280.png` (small promo tile), screenshots 01–05.
- **Privacy** — privacy policy URL is a required field:
  `https://github.com/birax/hardcopy-extension/blob/main/PRIVACY.md`.

## Apple App Store (Safari web extension)

Per ADR 0004 and the naming research, "Claude" stays **out of the app
name** here entirely — subtitle and description only.

- **App name** (≤ 30 characters) — `Hardcopy — Chat Exporter` (24).
- **Subtitle** (≤ 30 characters) — `Export chats from Claude` (24).
- **Promotional text** (≤ 170 characters) — 129 characters:

  ```text
  Turn a Claude conversation into a permanent document — Markdown, PDF, Word, RTF or plain text, generated entirely on your device.
  ```

- **Description** (≤ 4,000 characters) — the shared full description, with
  one Safari-specific paragraph appended before "Support":

  ```text
  How to use it: after installing, enable Hardcopy in Safari's Extensions settings and allow it on claude.ai. Open a conversation, click the Hardcopy toolbar button, choose a format, and export.
  ```

- **Keywords** (≤ 100 characters) — 85 characters:

  ```text
  claude,export,markdown,pdf,word,docx,chat,transcript,conversation,archive,backup,save
  ```

- **Categories** — Productivity (primary), Utilities (secondary).
- **Assets** — `apple-app-icon-1024.png` (App Store icon; Apple applies the
  corner mask); per-platform screenshots are captured from the packaged app
  at submission time (App Store Connect sizes differ from the 1280×800 web
  store shots).
- **Privacy nutrition label** — "Data Not Collected"; see
  [store-data-disclosures.md](../security/store-data-disclosures.md).

## Screenshots — upload order and captions

Files live in `assets/store/screenshots/` (1280×800 PNG, light theme except
05). The caption is baked into each image's teal band; if a store offers a
separate caption field, reuse the same text.

| Order | File | Caption |
| --- | --- | --- |
| 1 | `01-popup-ready.png` | Export chats from Claude to Markdown, PDF, Word, RTF or plain text |
| 2 | `02-saved-to-downloads.png` | One click, saved to Downloads — nothing leaves your browser |
| 3 | `03-markdown-export.png` | Exports keep the details — tables, code, thinking blocks, timestamps |
| 4 | `04-options.png` | Choose your defaults once — format, filename and what to include |
| 5 | `05-dark-mode.png` | At home in light and dark — the popup follows your browser theme |

## Keyword and discoverability notes (all stores)

Keyword-aware, not spammy: the descriptor and summaries already contain the
search phrases that matter — "export", "Claude", "claude.ai", "Markdown",
"PDF", "Word", "DOCX", "transcript", "conversation". Do not repeat "Claude"
beyond its natural nominative uses, and never in a way that implies
affiliation (that is what the verbatim disclaimer is for).
