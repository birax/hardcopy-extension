# Hardcopy Privacy Policy

**Effective date: 6 July 2026**

Hardcopy is a browser extension that exports your conversations from [claude.ai](https://claude.ai) as Markdown, PDF, Word (.docx), RTF, or plain-text files.

**The short version: Hardcopy collects no data. Everything happens in your browser, and exports go straight to your own device.**

## What Hardcopy does

When you ask Hardcopy to export a conversation, it reads that conversation from claude.ai (the site you are already signed in to), converts it into the format you chose, and saves the resulting file to your device via your browser's normal download mechanism. That is the entire product.

## All processing happens on your device

Every step — fetching the conversation, parsing it, and generating the export file — runs locally inside your browser. Hardcopy has no servers, no backend, and no cloud component. Your conversations are never sent anywhere by this extension.

## Network requests

The only network requests Hardcopy ever makes are to **claude.ai itself**, using your own existing signed-in session — the same way the claude.ai page fetches your conversation when you open it. Hardcopy never contacts any other host. It never reads your password, session cookies, or other credentials; your browser attaches your claude.ai session to those requests automatically, exactly as it does when you browse claude.ai normally.

All code and assets (including fonts and libraries) are bundled inside the extension at build time. There are no CDN scripts, no remote fonts, no remote code, and no "phone home" of any kind.

## Data collection: none

Hardcopy does **not** collect, transmit, sell, or share any data. Specifically, there are:

- **No analytics** and no usage tracking
- **No telemetry**
- **No error or crash reporting**
- **No advertising or ad identifiers**
- **No third-party services** of any kind

There is no account, no sign-up, and no way for the developer to see anything about you or your conversations.

## What is stored locally

Hardcopy stores only your **export preferences** (for example, your preferred format and whether to include thinking blocks or timestamps) using your browser's built-in extension storage. This data stays on your device and is never transmitted.

**To remove it:** uninstall the extension. Your browser deletes the extension's storage automatically.

## Exported files

Exported files are written **only to your own device** (typically your Downloads folder). Hardcopy never receives a copy. Once a file is on your device, what you do with it — where you keep it, whom you share it with — is entirely under your control and your responsibility. Note that exports can include content not shown in the normal chat view (such as thinking blocks and tool results) if you choose to include it, so review a file before sharing it.

## Permissions and why they are needed

Hardcopy requests the minimum permissions that make the extension work:

| Permission | Why |
| --- | --- |
| Access to `https://claude.ai/*` | To run on claude.ai pages and fetch your conversation from claude.ai so it can be exported. Hardcopy cannot run on, or talk to, any other site. |
| `storage` | To remember your export preferences on your device. |
| `downloads` | To save the exported file to your device. |

No other permissions are requested — no access to your browsing history, other tabs, or other websites.

## Open source and verifiable

Hardcopy is open source under the MIT license. Every claim in this policy can be verified by reading the code:

**https://github.com/birax/hardcopy-extension**

Because the extension makes no network requests to anything other than claude.ai, the "no data collected" claim is checkable directly from the source.

## Changes to this policy

If this policy ever changes, the new version will be published at the same location in the repository, the effective date will be updated, and the change will be recorded below. Since Hardcopy collects nothing, changes are expected to be rare and editorial.

### Change log

- **2026-07-06** — Initial version.

## Contact

Questions about privacy? Email **laurie@calverley.me.uk** or open an issue at https://github.com/birax/hardcopy-extension/issues.

---

*Hardcopy is an independent open-source project, not affiliated with, endorsed by, or sponsored by Anthropic. Claude is a trademark of Anthropic, PBC.*
