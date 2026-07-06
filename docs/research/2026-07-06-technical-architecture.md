# Research: Technical Architecture & Data Extraction

- **Date:** 2026-07-06
- **Researcher:** Claude (background research agent)
- **Purpose:** Ground the architecture ADRs — data extraction from claude.ai, cross-browser stack, format libraries, testing, security.

---

## Recommended architecture (summary)

- **Data extraction**: Use claude.ai's **internal REST API from a content script** (same-origin `fetch` with `credentials: 'include'`) as the primary path; keep a minimal DOM/copy-button fallback. The API is the only approach that captures thinking blocks, tool_use/tool_result, timestamps, artifacts, attachments, and branch trees.
- **Core endpoint**: `GET https://claude.ai/api/organizations/{orgId}/chat_conversations/{convId}?tree=True&rendering_mode=messages&render_all_tools=true`; org ID from the `lastActiveOrg` cookie with `GET /api/organizations` as fallback; list endpoint `GET .../chat_conversations` for bulk export.
- **Framework**: **WXT (wxt.dev)** + TypeScript — single codebase, per-browser MV3 manifests (Chrome/Edge service worker vs Firefox event page handled automatically), built-in `zip` commands incl. AMO source zip; Safari via `xcrun safari-web-extension-converter` on a macOS CI runner.
- **Internal design**: parse API JSON into a small **intermediate document model (AST)**; all five serializers (MD, TXT, RTF, PDF, DOCX) render from that AST — one parser to maintain against upstream changes.
- **Format libraries** (all MIT, all browser-native): hand-rolled Markdown/plain-text serializers; **`docx`** (npm) for Word; **`pdf-lib`** with bundled Unicode font subsets (incl. monospace for code) for PDF; **hand-rolled RTF writer** (~200 lines; existing JS RTF libs are stale).
- **Testing**: **Vitest** with WXT's `WxtVitest` plugin + `@webext-core/fake-browser`; **fixture-based parser tests** on recorded conversation JSON (this is the highest-value test surface); **Playwright** `launchPersistentContext` E2E on Chromium; `web-ext lint`/load for Firefox; GitHub Actions matrix building chrome/firefox/edge/safari targets (safari job on `macos-latest`).
- **Privacy posture**: host permission only `https://claude.ai/*` (+ `storage`, `downloads`), zero remote code, zero telemetry, no external network requests at all — which satisfies Chrome Web Store, AMO, and App Store review, and makes a "no data collected" privacy policy literally verifiable from the source.
- **Cowork & Claude Code web sessions**: treat as **phase 2 / best-effort**. Claude Code web (`https://claude.ai/code/session_…`) rides a private API that has already broken third-party tools once (Dec 2025–2026); Cowork is desktop-app-first with no documented web API. Ship chat export first; add these behind the same AST.

---

## 1. Data extraction from claude.ai

### 1.1 The two approaches in the wild

**(a) DOM scraping** — [ryanschiang/claude-export](https://github.com/ryanschiang/claude-export) (MIT) is the canonical example: a console script that walks the rendered chat DOM into Markdown/JSON/PNG. Findings: it captures text, code blocks, and tables, but **not thinking blocks, artifacts, or timestamps**; the README itself warns it "may break with future changes" and its "working as of" badge dates to Sep 2024. DOM scraping is the fragile option — claude.ai's class names are compiled/obfuscated and change regularly.

**(b) Internal REST API** — every serious 2025/2026-era exporter converged on this. Evidence from four independent codebases:

| Project | Approach |
|---|---|
| [Emnolope/claude-conversation-export](https://github.com/Emnolope/claude-conversation-export) (bookmarklet) | API, tree mode, branch reconstruction |
| [socketteer/Claude-Conversation-Exporter](https://github.com/socketteer/Claude-Conversation-Exporter) (Chrome ext) | API, incl. bulk list endpoint |
| [Claude AI Chat Exporter (greasyfork 574914)](https://greasyfork.org/en/scripts/574914-claude-ai-chat-exporter) | API-first with DOM fallback |
| [Claude API Exporter Minimal (greasyfork 555168)](https://greasyfork.org/en/scripts/555168-claude-api-exporter-minimal) | API, artifact version tracking |

There is also a **third technique**: [legoktm/claude-to-markdown](https://github.com/legoktm/claude-to-markdown) (Apache-2.0, Firefox WebExtension, release Mar 2025) *passively observes the JSON the server already returns* to the page and converts that — zero extra requests, but you only see what the page loaded.

### 1.2 Verified endpoints (current as of these 2025/26 projects)

```
GET https://claude.ai/api/organizations
    → [{ uuid, ... }]                        # org discovery + login check

GET https://claude.ai/api/organizations/{orgId}/chat_conversations
    → list of conversations                  # used for bulk export (socketteer content.js)

GET https://claude.ai/api/organizations/{orgId}/chat_conversations/{convId}
        ?tree=True&rendering_mode=messages&render_all_tools=true
    → full conversation incl. all branches, thinking, tools
```

- `tree=True` returns **all branches** (edited/regenerated messages), reconstructable via `parent_message_uuid`.
- `render_all_tools=true` makes tool invocations fully present in `content`.
- **Auth**: pure session-cookie auth — every project fetches with `credentials: "include"`. From a content script running on claude.ai this works with no extra permissions beyond the host.
- **Org ID discovery**, two methods observed: (1) cookie `lastActiveOrg=<uuid>` via `document.cookie.match(/lastActiveOrg=([^;]+)/)` (both greasyfork scripts); (2) `GET /api/organizations` → `[0].uuid` (Emnolope). Recommend (2) with (1) as a hint, since (2) also validates the session. (socketteer makes users paste the org ID manually — avoid that UX.)
- **Current conversation identification**: URL pattern `https://claude.ai/chat/{uuid}` — extract the UUID from `location.pathname`.

### 1.3 Message JSON shape (fields confirmed across projects)

Conversation: `{ uuid, name, summary, created_at, updated_at, chat_messages: [...] }` (some code falls back to `messages`). Each message:

```jsonc
{
  "uuid": "...", "parent_message_uuid": "...",
  "sender": "human" | "assistant",
  "created_at": "ISO-8601", "updated_at": "...",
  "content": [ /* blocks, see below */ ],
  "attachments": [ { "file_name", "extracted_content", ... } ],
  "files_v2":    [ { "file_name" | "name", ... } ]
}
```

Content block types handled by the exporters (greasyfork 574914 + 555168 source analysis):

- `text` — `{ type:"text", text }`
- `thinking` — `{ type:"thinking", thinking, summaries?: [{ summary }] }`
- `tool_use` — `{ type:"tool_use", name, input }`. **Artifacts are `tool_use` blocks with `name === "artifacts"`**, `input = { command: "create"|"rewrite"|"update", id, title, type, language, content, old_str?, new_str? }` — i.e. artifact reconstruction requires replaying create/update commands. `web_search` appears as `{ name:"web_search", input:{ query } }`.
- `tool_result` — `{ type:"tool_result", content|text, is_error }`
- `image` — image attachments.

**Timestamps, model info**: `created_at` per message from the API; DOM scraping has none of this. This confirms all export options (thinking / tools / timestamps / artifacts / attachments) are only fully served by the API path.

**Stability**: the endpoint shape (`tree`, `rendering_mode`, `render_all_tools`) has been stable across projects spanning 2024→2026, and is far more stable than the DOM. Best-practice fallback observed (greasyfork 574914): intercept Claude's own copy button (`button[data-testid="action-bar-copy"]`, `[role="group"][aria-label="Message actions"]`) if the API call fails.

### 1.4 Cowork and Claude Code web sessions

- **Claude Code on the web** lives at `https://claude.ai/code`; session URLs follow `https://claude.ai/code/session_…` ([Claude Code docs](https://code.claude.com/docs/en/claude-code-on-the-web)). Simon Willison's [claude-code-transcripts](https://github.com/simonw/claude-code-transcripts) fetched these via the **private `https://api.anthropic.com/v1/sessions`** endpoint (OAuth Bearer token from the Claude Code keychain entry, `anthropic-version: 2023-06-01`, org UUID header) — reverse-engineered from obfuscated JS ([writeup](https://simonwillison.net/2025/dec/25/claude-code-transcripts/)). **Its README now flags the `web` commands as broken** due to changes in the undocumented API. For a browser extension the more promising route is whatever same-origin calls the claude.ai/code SPA itself makes (observable via DevTools/network interception, like legoktm's approach) — but expect churn. Recommendation: isolate this behind a `SessionSource` interface and ship it clearly labelled experimental.
- **Cowork** ([product page](https://www.anthropic.com/product/claude-cowork), [help center](https://support.claude.com/en/articles/13345190-get-started-with-claude-cowork)) is a working-session product surfaced primarily via the desktop app; no open-source exporter or documented claude.ai web endpoint for Cowork sessions was found. If/where Cowork sessions render on claude.ai, they will need live network inspection to map; plan the same experimental-source treatment. Local Claude Code CLI transcripts (`~/.claude/projects/<project>/<session>.jsonl`) exist but are out of reach for a browser extension.

## 2. Cross-browser extension architecture (2026)

- **MV3 state**: Chrome/Edge are MV3-only for new store submissions. Firefox supports MV3 but **runs the background as a non-persistent event page, not a service worker** (`background.scripts` vs Chrome's `background.service_worker`); since Chrome 121/Firefox 121 you can declare both keys ([MDN background key](https://developer.mozilla.org/en-US/docs/Mozilla/Add-ons/WebExtensions/manifest.json/background), [Firefox MV3 migration guide](https://extensionworkshop.com/documentation/develop/manifest-v3-migration-guide/)). Firefox still allows MV2, but a new project should be MV3-first.
- **Namespace**: Firefox provides promise-based `browser.*`; Chrome MV3 now has promises on `chrome.*`, so [mozilla/webextension-polyfill](https://github.com/mozilla/webextension-polyfill) is less essential than it was — and WXT has moved off it by default in favour of its own typed [`@wxt-dev/browser`](https://www.npmjs.com/package/@wxt-dev/browser) shim ([wxt issue #784](https://github.com/wxt-dev/wxt/issues/784)). Use WXT's `browser` import and don't touch namespaces directly.
- **Framework — WXT recommended**: 2025/26 comparisons consistently rank [WXT](https://wxt.dev/) ([repo](https://github.com/wxt-dev/wxt)) first for multi-browser work: auto-generated per-browser manifests, `wxt build -b chrome|firefox|edge|safari`, `wxt zip` (incl. the **separate source zip AMO requires**), HMR incl. background, TS-first, framework-agnostic. [@crxjs/vite-plugin](https://github.com/crxjs/chrome-extension-tools) is a fine minimal Vite plugin but Chrome-centric; Plasmo's maintenance reputation has slipped. Sources: [2025 framework comparison](https://redreamality.com/blog/the-2025-state-of-browser-extension-frameworks-a-comparative-analysis-of-plasmo-wxt-and-crxjs/), [2026 comparison](https://optymized.net/blog/crxjs-vs-plasmo-vs-wxt), [WXT vs crxjs discussion](https://github.com/wxt-dev/wxt/discussions/496).
- **Safari**: no direct store upload of a zip from CI tooling — run `xcrun safari-web-extension-converter <dist> --copy-resources --swift`, producing an Xcode wrapper app for macOS (and optionally iOS), then sign/notarize and ship via App Store Connect ([Apple docs](https://developer.apple.com/documentation/safariservices/packaging-and-distributing-safari-web-extensions-with-app-store-connect), [practical guide](https://rxliuli.com/blog/convert-chrome-extension-to-safari/)). Requires an Apple Developer account ($99/yr) for store distribution and a macOS build machine (GitHub Actions `macos-latest`). Safari supports MV3 web extensions; keep the converter project committed so CI only rebuilds resources. (Note: naming/stores research found Apple now also accepts direct extension ZIP upload via App Store Connect — reconcile when packaging.)
- **Design consequence for this extension**: do the API fetches **in the content script** (same-origin cookies "just work"), keep the background script thin (downloads, coordination), do format generation in the popup/offscreen context — this sidesteps most SW-lifetime and CORS pain across all four browsers.

## 3. Format generation libraries

| Format | Choice | License | Notes |
|---|---|---|---|
| Markdown | hand-rolled | — | Trivial from the AST; every studied exporter hand-rolls this |
| Plain text | hand-rolled | — | `Human:`/`Assistant:` style |
| DOCX | [`docx`](https://www.npmjs.com/package/docx) v9.x | MIT | Actively maintained (dolanmiu), ~15M weekly downloads, works in browser (`Packer.toBlob`); full support for heading styles, monospace character styles for code blocks, tables, hyperlinks, page headers/footers. Clear winner. |
| PDF | [`pdf-lib`](https://github.com/Hopding/pdf-lib) | MIT | Best Unicode story: embed any TTF/OTF via `embedFont` (fontkit), so code blocks/emoji/CJK work with bundled font subsets — required anyway since stores forbid remote fonts. Caveat: no layout engine — you write the word-wrap/pagination layer (fine for linear transcripts). [jsPDF](https://www.npmjs.com/package/jspdf) (MIT) needs its legacy fontconverter for UTF-8 and its HTML mode rasterizes via html2canvas — worse text quality, larger output. Hidden-iframe `window.print()` gives the best typography for free but **cannot silently save** (native print dialog) — worth offering as a bonus "Print…" action, not as the PDF export. Comparisons: [dev.to 6-library comparison](https://dev.to/handdot/generate-a-pdf-in-js-summary-and-comparison-of-libraries-3k0p), [Nutrient 2026 roundup](https://www.nutrient.io/blog/top-js-pdf-libraries/). |
| RTF | hand-rolled writer | — | Only candidates are stale: [jsrtf](https://github.com/lilliputten/jsrtf) (port of an old node-rtf, minimal maintenance), [html-to-rtf](https://www.npmjs.com/package/html-to-rtf) (indirect, lossy). RTF is a plain-text format: `{\rtf1\ansi\deff0{\fonttbl...}...}`, escape `\ { }`, non-ASCII as `\uN?`; headings/bold/mono/colors are a handful of control words. A ~150–250-line serializer over the same AST is more maintainable than any dependency. |

All chosen libraries are permissive (MIT), run fully in-browser, need no server. Bundle weight (docx + pdf-lib + fonts) is irrelevant to page load if generators are lazy-loaded only when an export is requested.

## 4. Testing & quality

- **Unit**: Vitest with WXT's first-class integration — `WxtVitest` plugin wires WXT's vite config and polyfills `browser` with [`@webext-core/fake-browser`](https://www.npmjs.com/package/@webext-core/fake-browser) (in-memory storage etc., no manual mocks). Docs: [wxt.dev/guide/essentials/unit-testing](https://wxt.dev/guide/essentials/unit-testing), [official example](https://github.com/wxt-dev/examples/tree/main/examples/vitest-unit-testing).
- **Fixture-based parser tests** are the project's backbone: commit sanitized recorded conversation JSON (plain text, thinking, artifacts create/update chains, tool_use/tool_result incl. `is_error`, branched trees, attachments/files_v2, images) and snapshot-test every serializer against them. When claude.ai changes, you add a fixture and fix one parser.
- **E2E**: [Playwright's chrome-extensions recipe](https://playwright.dev/docs/chrome-extensions) — `chromium.launchPersistentContext('', { args: ['--disable-extensions-except=…', '--load-extension=…'] })`, grab the MV3 worker via `context.serviceWorkers()[0] ?? await context.waitForEvent('serviceworker')`. Constraints: bundled Chromium only (branded Chrome/Edge dropped the side-load flags), headed mode (xvfb on CI), and treat SW state as ephemeral. Firefox/WebKit can't load Chrome extensions in Playwright — cover Firefox with `web-ext lint` + `web-ext run` smoke and rely on the browser-neutral unit/fixture suite. E2E should run against a **mocked claude.ai** (Playwright `route()` serving fixtures), not real accounts.
- **Coverage**: `@vitest/coverage-v8` + Codecov badge.
- **CI (GitHub Actions)**: lint/typecheck → vitest+coverage → `wxt build -b chrome|firefox|edge` + `wxt zip` (matrix, ubuntu) → Playwright E2E (ubuntu, xvfb) → Safari job on `macos-latest` running `safari-web-extension-converter` + `xcodebuild`. Release automation: `wxt submit` supports CWS/AMO/Edge store uploads.

## 5. Security & privacy best practices

- **Permissions**: `host_permissions: ["https://claude.ai/*"]` only, plus `storage` (preferences) and `downloads` (or anchor-click blob download to avoid even that). No `tabs`, no `<all_urls>`, no `scripting` if content scripts are declared statically. Chrome requires the narrowest permissions that work and rejects unjustified ones ([CWS program policies](https://developer.chrome.com/docs/webstore/program-policies/policies)); AMO likewise ([Add-on policies](https://extensionworkshop.com/documentation/publish/add-on-policies-faq/)).
- **No remote code**: MV3 forbids it in Chrome outright; extensions using remotely hosted code face rejection/extra scrutiny ([CWS review process](https://developer.chrome.com/docs/webstore/review-process)); AMO requires add-ons to be self-contained. Bundle everything (fonts, libs); default MV3 CSP (`script-src 'self'`) — don't loosen it.
- **AMO source submission**: since the build is bundled/minified, submit a source zip with reproducible build instructions (`pnpm install && pnpm zip:firefox`); all deps must come from official package registries ([source code submission](https://extensionworkshop.com/documentation/publish/source-code-submission/)). WXT's `zip` command produces this automatically.
- **Store data disclosures**: CWS Privacy tab — declare single purpose ("export your Claude conversations to local files"), certify **no data collected/sold/transferred**; because the extension makes zero non-claude.ai requests, reviewers can verify this statically ([privacy fields guide](https://developer.chrome.com/docs/webstore/cws-dashboard-privacy), [user-data FAQ](https://developer.chrome.com/docs/webstore/program-policies/user-data-faq)). Apple's App Store nutrition label: "Data Not Collected".
- **Privacy policy** (self-hosted in the repo/GitHub Pages, linked from all stores): state that all processing is local; the only network requests are to claude.ai using the user's own session; no analytics/telemetry/error reporting; exported files are written only to the user's disk; and the code is open source for verification. This mirrors the strongest projects surveyed (legoktm's explicitly commits to no third-party transmission).
- **Extra credit**: pin CI dependency review, `npm audit` gate, and consider signing releases; never store the org ID/session data beyond `storage.local` preferences.

### Key source list

Extraction: [Emnolope/claude-conversation-export](https://github.com/Emnolope/claude-conversation-export) · [socketteer/Claude-Conversation-Exporter](https://github.com/socketteer/Claude-Conversation-Exporter) · [agoramachina/claude-exporter](https://github.com/agoramachina/claude-exporter) · [ryanschiang/claude-export](https://github.com/ryanschiang/claude-export) · [legoktm/claude-to-markdown](https://github.com/legoktm/claude-to-markdown) · [greasyfork 574914](https://greasyfork.org/en/scripts/574914-claude-ai-chat-exporter) · [greasyfork 555168](https://greasyfork.org/en/scripts/555168-claude-api-exporter-minimal) · [simonw/claude-code-transcripts](https://github.com/simonw/claude-code-transcripts) + [writeup](https://simonwillison.net/2025/dec/25/claude-code-transcripts/) · [Claude Code on the web docs](https://code.claude.com/docs/en/claude-code-on-the-web) · [Cowork](https://www.anthropic.com/product/claude-cowork).
Architecture: [wxt.dev](https://wxt.dev/) · [framework comparison 2025](https://redreamality.com/blog/the-2025-state-of-browser-extension-frameworks-a-comparative-analysis-of-plasmo-wxt-and-crxjs/) · [MDN background key](https://developer.mozilla.org/en-US/docs/Mozilla/Add-ons/WebExtensions/manifest.json/background) · [Firefox MV3 guide](https://extensionworkshop.com/documentation/develop/manifest-v3-migration-guide/) · [webextension-polyfill](https://github.com/mozilla/webextension-polyfill) · [Apple Safari packaging](https://developer.apple.com/documentation/safariservices/packaging-and-distributing-safari-web-extensions-with-app-store-connect).
Formats: [docx npm](https://www.npmjs.com/package/docx) · [pdf-lib](https://github.com/Hopding/pdf-lib) · [jsPDF](https://www.npmjs.com/package/jspdf) · [PDF lib comparison](https://dev.to/handdot/generate-a-pdf-in-js-summary-and-comparison-of-libraries-3k0p) · [jsrtf](https://github.com/lilliputten/jsrtf).
Testing/stores: [WXT unit testing](https://wxt.dev/guide/essentials/unit-testing) · [fake-browser](https://www.npmjs.com/package/@webext-core/fake-browser) · [Playwright chrome-extensions](https://playwright.dev/docs/chrome-extensions) · [CWS policies](https://developer.chrome.com/docs/webstore/program-policies/policies) · [CWS privacy fields](https://developer.chrome.com/docs/webstore/cws-dashboard-privacy) · [AMO source submission](https://extensionworkshop.com/documentation/publish/source-code-submission/).
