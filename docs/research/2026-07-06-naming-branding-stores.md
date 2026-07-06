# Research: Naming, Branding & Store Requirements

- **Date:** 2026-07-06
- **Researcher:** Claude (background research agent)
- **Purpose:** Inform naming/branding decisions and store submission planning for the exporter extension.

---

## 1. Competitive Landscape

### Browser extensions (Chrome Web Store / AMO)

| Name | Formats | Popularity / notes | License / model |
|---|---|---|---|
| **Claude Exporter** (agoramachina/socketteer) — [CWS](https://chromewebstore.google.com/detail/claude-exporter/hebhnhibdecijopliikejmojkpkcelbc), [AMO](https://addons.mozilla.org/en-US/firefox/addon/claude-exporter/), [GitHub](https://github.com/agoramachina/claude-exporter) | JSON, Markdown, plain text; bulk ZIP export, branch-aware, artifact extraction, conversation browser with search | ~1,600 Firefox users, 3.5★ AMO / 4.7★ CWS; updated May 2026; upstream repo [socketteer/Claude-Conversation-Exporter](https://github.com/socketteer/Claude-Conversation-Exporter) has ~94 stars | **MIT, free** — the strongest open-source incumbent |
| **Claude Exporter: Claude Chat to PDF, Notion, Word & More** (backrun.co) — [CWS](https://chromewebstore.google.com/detail/claude-exporter-claude-ch/mhckealbblinipeplfddmbcohdidkfjf), [site](https://backrun.co/claude-exporter) | PDF, **Word**, Google Docs, Notion; font/style controls, per-message export | Commercial, closed-source | Freemium |
| **AI Chat Exporter: Save Claude as PDF, MD and more** — [CWS](https://chromewebstore.google.com/detail/ai-chat-exporter-save-cla/elhmfakncmnghlnabnolalcjkdpfjnin), [site](https://www.ai-chat-exporter.com/en/welcome) | PDF, MD, TXT, CSV, JSON | Commercial | Freemium |
| **Claude Conversation Exporter** — [CWS](https://chromewebstore.google.com/detail/claude-conversation-expor/ggbjcmihdajacjnpcaiocggagjecdfpp), [AMO](https://addons.mozilla.org/en-US/firefox/addon/claude-conversation-exporter/) | MD, PDF, HTML, JSON; projects export | AMO listing discloses license-key validation via api.polar.sh | **Paid tier** (closed) |
| **Claude Chat Exporter** — [AMO](https://addons.mozilla.org/en-US/firefox/addon/claude-chat-exporter/) | MD, JSON, HTML; **artifact extraction, thinking-block support**, timestamps | Small | — |
| **Claude to PDF** — [AMO](https://addons.mozilla.org/en-US/firefox/addon/claude-to-pdf/) | PDF, MD, JSON, TXT; code highlighting, math, images | 31 users, 3.2★, free | Closed |
| **Scout Claude Export** — [AMO](https://addons.mozilla.org/en-US/firefox/addon/scout-claude-export/) | JSON, MD, HTML, PDF, CSV, TXT; projects, custom instructions, artifacts | Small | — |
| **Claude Toolbox** — [CWS](https://chromewebstore.google.com/detail/claude-toolbox-chat-histo/camddjjmcemmmlndbciaodchkodhgibh), [site](https://www.ai-toolkit.site/) | TXT/JSON export bundled with history search & bookmarks | 4.5★ | Freemium |
| **Claude to Obsidian & Markdown Export** — [CWS](https://chromewebstore.google.com/detail/claude-to-obsidian-markdo/ehacefdknbaacgjcikcpkogkocemcdil) | MD / Obsidian sync | Niche | — |
| **Copy Claude Chat as Markdown** — [CWS](https://chromewebstore.google.com/detail/copy-claude-chat-as-markd/afkacmjkhhjfkmeboagcnaghkaaglgae) | Clipboard MD only | Micro-utility | — |
| **Claude Usage Tracker — Chat & Code Export** — [AMO](https://addons.mozilla.org/en-US/firefox/addon/claude-track-export/) | MD export bundled with usage tracking | Small | — |
| **Save my Chatbot** (Hugo-COLLIN) — [GitHub](https://github.com/Hugo-COLLIN/SaveMyPhind-conversation-exporter) | Multi-provider (ChatGPT, Claude, Perplexity, Phind) → MD; on CWS + AMO | Open source, active | OSS |

### Scripts / CLI tools

- [legoktm/claude-to-markdown](https://github.com/legoktm/claude-to-markdown) — WebExtension, MD + GitHub Gist upload.
- [agarwalvishal/claude-chat-exporter](https://github.com/agarwalvishal/claude-chat-exporter) — console JS, MD.
- [shakerdesigns/claude-chat-exporter](https://github.com/shakerdesigns/claude-chat-exporter) — one-click MD incl. artifacts.
- [sugurutakahashi-1234/ai-chat-md-export](https://github.com/sugurutakahashi-1234/ai-chat-md-export) — CLI converting official export `conversations.json` → MD.
- **Simon Willison's [claude-code-transcripts](https://simonwillison.net/2025/dec/25/claude-code-transcripts/)** (Dec 2025) — the *only* tool found that exports **Claude Code for web** sessions, by reverse-engineering the private API; CLI → HTML/Gist, not an extension.
- Official baseline: [Anthropic's account-level export](https://support.claude.com/en/articles/9450526-export-your-claude-data) — raw JSON dump only, whole account, no per-conversation formatting.

### Gaps we can win on

1. **Claude Code web + Cowork sessions**: no extension supports them at all (only Willison's CLI). This is the single biggest differentiator.
2. **Word/RTF**: only one closed freemium extension does .docx; **nobody does RTF**; PDF is usually a print-to-PDF hack.
3. **Thinking blocks + tool-use/artifact capture**: only one small AMO add-on advertises thinking blocks; tool-use rendering is essentially absent everywhere.
4. **Safari / App Store**: no Claude exporter exists there at all — an empty market.
5. **Free + fully open source across all four stores**: incumbents are either MIT-but-Chrome/Firefox-only, or freemium/closed. Several have poor ratings (3.2–3.5★) citing breakage — reliability itself is a selling point.
6. **Accessibility**: none advertise keyboard navigation/screen-reader support.

---

## 2. Naming & Trademark Constraints

- **CLAUDE is a registered US trademark** of Anthropic, PBC — Reg. #7645254, registered Jan 7, 2025 ([Trademarkia](https://www.trademarkia.com/claude-97790228); Anthropic owns [~30 marks](https://www.trademarkia.com/owners/anthropic-pbc)).
- **Anthropic's trademark guidelines** ([anthropic.com/legal/trademark-guidelines](https://www.anthropic.com/legal/trademark-guidelines)) are strict: trademarks may be used "only as specifically permitted" and uses implying sponsorship/affiliation require **prior written approval** (contact marketing@anthropic.com). There is no published blanket "X for Claude" safe-harbor. Anthropic **actively enforces**: it forced the rename of "Clawdbot" → OpenClaw merely for being phonetically close ([coverage](https://decodethefuture.org/en/anthropic-blocks-third-party-tools/)). Its [Software Directory Terms](https://support.claude.com/en/articles/13145338-anthropic-software-directory-terms) also grant no trademark rights.
- **Chrome Web Store** ([impersonation & IP policy](https://developer.chrome.com/docs/webstore/program-policies/impersonation-and-intellectual-property)): "Don't … represent that your product is authorized by, endorsed by, or produced by another company"; extensions must not infringe trademarks; Google can delist on IP complaints. In practice many "Claude X" extensions exist, but they survive only until a complaint.
- **Mozilla AMO** ([Add-on Policies](https://extensionworkshop.com/documentation/publish/add-on-policies/)): for Mozilla's own marks the mandated pattern is "*Name* **for Firefox**", never "Firefox *Name*" — the same nominative-use logic is the accepted community standard for third-party marks.
- **Apple** is the most sensitive: App Review guideline 5.2 (IP) routinely requires proof of authorization when a third-party trademark leads the app name ([App Review Guidelines](https://developer.apple.com/app-store/review/guidelines/)).

**Recommended safe pattern:** distinctive brand first, nominative descriptor second — "**{Brand} — chat exporter for Claude**" in store listings, with "Claude" ideally only in the subtitle/description for the Apple submission. Never "Claude {Brand}", never Anthropic's logo/colors/starburst, and include an explicit disclaimer: "Not affiliated with, endorsed by, or sponsored by Anthropic. Claude is a trademark of Anthropic, PBC." Keep the *slug/repo/npm/domain* free of "claude" entirely.

---

## 3. Name Candidates

| # | Name | Rationale | Collision check |
|---|---|---|---|
| 1 | **Hardcopy** ("Hardcopy for Claude") | Evocative: turning ephemeral chats into permanent documents; short, brandable | Clean — only an abandoned Yeoman generator [generator-hardcopy-html](https://www.npmjs.com/package/generator-hardcopy-html); no CWS extension, no notable GitHub org; hardcopy.app/.dev show no active product in search results |
| 2 | **Chat Export for Claude** | Purely descriptive, maximum store-search SEO, zero trademark ambiguity beyond nominative use | Generic; crowded conceptually (many "Claude Exporter" variants) but no exact-name extension found |
| 3 | **Offprint** ("Offprint for Claude") | Printing term: a separately printed copy of a single article — precisely what we do | Moderate: [Offprint Studios](https://github.com/OffprintStudios) fiction platform (different category); no CWS/npm collision found |
| 4 | **Transcript for Claude** | Professional, self-explanatory | Generic word, no direct extension collision found; weak brandability |
| 5 | **Keepsake for Claude** | Warm, memorable | **Crowded**: ML tool on [PyPI](https://pypi.org/project/keepsake), multiple [photo apps](https://www.keepsakeapp.io/), [Keepsake Inc.](https://apps.apple.com/us/developer/keepsake-inc/id489697589) on App Store — avoid |
| 6 | **Chatfile** | Short, technical | **Collision**: [guangzhengli/ChatFiles](https://github.com/guangzhengli/ChatFiles) (popular repo) + [chatfile GitHub topic](https://github.com/topics/chatfile) — avoid |
| 7 | **FairCopy** ("fair copy" = final neat manuscript) | Lovely semantics | **Taken**: [FairCopy Editor](https://faircopyeditor.com/), an established scholarly word processor — avoid |
| 8 | **Inkwell / Papertrail / Scribe** family | Classic writing metaphors | All burned: Papertrail is a [SolarWinds logging product](https://chromewebstore.google.com/detail/papertrail/ekongldbhgcbcfnniloenfgfbkglhdba) + existing extensions, Scribe is a multi-million-user documentation extension, Inkwell is a common app name — avoid |

**Top 3:**

1. **Hardcopy** — cleanest collision profile, memorable, on-theme, works as `hardcopy-extension` repo without "claude" in the slug.
2. **Chat Export for Claude** — safest/most discoverable if you prefer pure function over brand (weaker: undifferentiated from incumbents).
3. **Offprint** — distinctive and elegant; acceptable risk since the collision is a fiction-writing site in a different class.

(Practical combo: brand **Hardcopy**, store listing "Hardcopy — export chats from Claude to Markdown, PDF & Word".)

---

## 4. Store Submission Requirements (2025/2026)

### Chrome Web Store

- **Account**: one-time **$5** fee, up to 20 published items ([register](https://developer.chrome.com/docs/webstore/register)); 2FA required; EU DSA trader/non-trader declaration at listing time.
- **Review**: typically **1–3 business days**, often <24h for simple extensions; sensitive permissions slow it down ([Extension Radar guide](https://www.extensionradar.com/blog/how-to-make-chrome-extension), [fee explainer](https://www.extensionradar.com/blog/chrome-web-store-developer-fee-2026)).
- **Manifest**: **MV3 mandatory** (MV2 no longer accepted; remotely hosted code banned) ([What's new](https://developer.chrome.com/docs/extensions/whats-new)).
- **Privacy**: privacy policy URL + in-dashboard **data-use disclosures** required for anything handling user data (conversations = user content); "Limited Use" certification.
- **Assets** ([Supplying Images](https://developer.chrome.com/docs/webstore/images)): 128×128 icon in the ZIP (96×96 art + padding), ≥1 screenshot (1280×800 preferred, up to 5), **440×280 small promo tile required**, 1400×560 marquee optional.
- **Policies**: single-purpose rule; per-permission written justifications in the dashboard; [impersonation/IP policy](https://developer.chrome.com/docs/webstore/program-policies/impersonation-and-intellectual-property) as above. Host permissions limited to `claude.ai` will minimize review friction.

### Firefox Add-ons (AMO)

- **Account**: free Mozilla account; **no fees** ([developer accounts](https://extensionworkshop.com/documentation/publish/developer-accounts/), [submitting](https://extensionworkshop.com/documentation/publish/submitting-an-add-on/)).
- **Review**: automated signing usually **minutes**; human review can follow post-publication ([AMO review process](https://dev.to/weatherclockdash/amo-review-process-what-happens-after-you-submit-a-firefox-extension-4j8l)). **Source code submission required** if you ship minified/bundled code (provide build instructions).
- **Manifest**: MV2 **and** MV3 both supported ([Mozilla confirmation](https://www.ghacks.net/2025/02/26/firefox-mozilla-confirms-support-for-classic-extensions-and-manifest-v3-add-ons/)); **MV3 requires an explicit add-on ID** in `browser_specific_settings` ([docs](https://developer.mozilla.org/en-US/docs/Mozilla/Add-ons/WebExtensions/manifest.json/browser_specific_settings)).
- **Assets**: manifest icons 16/32/48/96/128; screenshots 1280×800 recommended, no hard limit ([listing guide](https://developer.mozilla.org/en-US/docs/Mozilla/Add-ons/Listing)).
- **Policies**: [Add-on Policies](https://extensionworkshop.com/documentation/publish/add-on-policies/) — data collection consent/disclosure, no surprise functionality, trademark compliance.

### Microsoft Edge Add-ons

- **Account**: **free** registration via Partner Center with a Microsoft account ([register](https://learn.microsoft.com/en-us/microsoft-edge/extensions/publish/create-dev-account)).
- **Review**: up to **7 business days**; Microsoft announced faster reviews Feb 2025 ([Edge blog](https://blogs.windows.com/msedgedev/2025/02/26/empowering-microsoft-edge-add-ons-developers-with-faster-reviews/); [curation process](https://learn.microsoft.com/en-us/microsoft-edge/extensions/publish/add-ons-curation)).
- **Manifest**: Chromium — same MV3 package as Chrome works.
- **Assets/required info** ([publish docs](https://learn.microsoft.com/en-us/microsoft-edge/extensions-chromium/publish/publish-extension)): ZIP, **logo + small promo tile required**, screenshots optional, name, short description, **privacy policy link** ([developer policies](https://learn.microsoft.com/en-us/legal/microsoft-edge/extensions/developer-policies)).

### Apple App Store (Safari web extension)

- **Account**: **Apple Developer Program, $99/year** ([guidelines](https://developer.apple.com/app-store/review/guidelines/)).
- **Packaging**: traditionally `xcrun safari-web-extension-converter` in Xcode wraps the WebExtension in a container app for macOS and/or iOS ([docs](https://developer.apple.com/documentation/safariservices/distributing-your-safari-web-extension)); **new option: upload the extension ZIP directly to App Store Connect** — Apple converts and packages it, no Mac/Xcode required, with TestFlight distribution ([Safari Extensions page](https://developer.apple.com/safari/extensions/), [App Store Connect packaging](https://developer.apple.com/documentation/safariservices/packaging-and-distributing-safari-web-extensions-with-app-store-connect)).
- **Review**: standard App Review, typically **1–3 days**; Safari-specific rules: extension must run on current Safari, not interfere with Safari UI, no misleading content; container app "should include some functionality, such as help screens and settings"; no ads/IAP inside the extension itself.
- **Privacy**: App Store privacy "nutrition label" declarations + privacy policy URL mandatory; 1024×1024 app icon and per-platform screenshots required in App Store Connect.
- **Trademark caution**: keep "Claude" out of the app *name* here; Apple is the store most likely to demand written authorization.

---

## 5. Licensing

**Recommendation: MIT**, with Apache-2.0 as the defensible alternative.

- **MIT**: shortest, universally understood, matches the main open-source incumbent (Claude Exporter is MIT), maximizes contribution/adoption. Sufficient for an "IP-free" DOM-parsing extension with no novel patentable methods.
- **Apache-2.0**: adds an explicit **patent grant** and an explicit clause that the license grants **no trademark rights** (§6) — nice hygiene given the Anthropic trademark sensitivity. Cost: longer, requires NOTICE-file handling, slightly more friction for casual contributors.
- **Store implications**: none of the four stores restrict permissive licenses. The known App Store conflict is with **GPL** (the VLC precedent), so avoid copyleft given the Safari target. AMO's source-submission rule applies regardless of license. Whichever you choose, add a repo/README trademark disclaimer ("Claude is a trademark of Anthropic, PBC; this project is unaffiliated") — that, not the code license, is where your IP risk lives.
