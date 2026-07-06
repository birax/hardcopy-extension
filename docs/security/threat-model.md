# Hardcopy threat model

Audience: maintainers and AI agents working on this codebase. Read this before touching the parser, serializers, popup, manifest, or dependencies. Companion documents: [SECURITY.md](../../SECURITY.md), [PRIVACY.md](../../PRIVACY.md), [ADR 0002](../decisions/0002-fully-client-side-no-external-dependencies.md), [ADR 0006](../decisions/0006-core-architecture.md).

## Assets

1. **The user's conversation content** — private chats, including thinking blocks, tool use/results, and attachments metadata. Confidentiality is the product's core promise ("nothing leaves your machine").
2. **Session-authenticated access to the claude.ai API** — the content script can make requests that ride the user's session cookies (`credentials: 'include'`). The extension never reads the cookies, but code running in the extension context can act *as* the signed-in user against claude.ai.
3. **Integrity of exported files** — a user opening a Hardcopy export in Word, a PDF reader, or a Markdown renderer must not be attacked by content smuggled through the export.
4. **The extension's reputation/identity** — users trust the store listing and the repo; impersonation attacks both.

## Trust boundaries

| Boundary | Direction | Notes |
| --- | --- | --- |
| Content script ↔ claude.ai page | Page DOM and page-visible data are **untrusted** | The content script runs in an isolated world but reads data influenced by conversation content. Anything a conversation can contain (any Unicode, markup-like text, control sequences) is attacker-controllable. |
| Extension ↔ claude.ai API | API responses are **untrusted input** | JSON shapes may change; string fields carry arbitrary user/model-generated content. Parse defensively; never eval or template API strings into HTML. |
| Extension UI (popup) ↔ conversation data | Conversation-derived strings are **untrusted** in the UI | Titles, previews, filenames shown in the popup must be treated as hostile text, not markup. |
| Extension ↔ downloads / filesystem | Exports cross into other applications | Whatever we write is later parsed by Word, PDF readers, editors, wikis. Serializer output must be well-formed and fully escaped. |
| Build/dependency supply chain ↔ shipped artifact | npm packages are third-party code that ships in the bundle | Everything bundled at build time runs with the extension's permissions. |

## Threats and mitigations

### T1 — Malicious conversation content injected into exports

A conversation (which can include model output steered by a hostile third party, e.g. via a shared prompt or pasted content) contains sequences that are meaningful in an export format.

**Examples:** `{\field{\*\fldinst ...}}` RTF control words; Markdown/HTML that becomes live when the export is rendered (`<script>`, `[link](javascript:...)`, reference-definition smuggling); unescaped `(`, `)`, `\` in PDF string objects; formula-like prefixes (`=`, `+`, `@`) if a CSV/TSV-adjacent format is ever added.

**Mitigations (requirements, per serializer):**
- **RTF:** escape `\`, `{`, `}`; emit non-ASCII via `\uN?` escapes; never pass through raw control words from content.
- **Markdown / plain text:** treat content as text — escape or neutralize markup-significant characters where content is interpolated into structural positions (headings, link targets, code-fence delimiters); code blocks must use fences longer than any fence run inside the content.
- **PDF (pdf-lib):** content goes through the library's text APIs only; never concatenate content into raw PDF syntax; escape `(`, `)`, `\` if any low-level string path exists.
- **DOCX:** rely on the `docx` library's XML escaping; never hand-build XML from content strings.
- Fixture tests must include adversarial conversations (control words, markup, quote/paren/backslash storms) for every serializer.

### T2 — XSS / script injection in the extension UI

Conversation-derived text rendered in the popup or options UI executes as markup.

**Mitigations:** never assign untrusted content via `innerHTML`/`insertAdjacentHTML`/`document.write`; use `textContent`/DOM APIs or a framework's default-escaping bindings. Keep the **default MV3 CSP** (`script-src 'self'`) — never loosen it, never add `unsafe-eval`/`unsafe-inline`. No dynamic code (`eval`, `new Function`, remote scripts) anywhere.

### T3 — Exfiltration / unexpected network contact

Code (ours or a dependency's) sends conversation data, or anything else, to a non-claude.ai host — breaking the product's core promise and store declarations.

**Mitigations:** the sole host permission is `https://claude.ai/*`; MV3 forbids remote code; all libraries and fonts are bundled at build time (ADR 0002). Reviewers and CI can grep the bundle for URLs — keep it that way: no analytics/telemetry/error-reporting SDKs, ever. Any new `fetch` must target claude.ai only.

### T4 — Supply-chain compromise

A malicious or hijacked npm dependency ships inside the extension with full extension privileges.

**Mitigations:** pinned `pnpm-lock.yaml` committed and honored in CI (`--frozen-lockfile`); dependency audit in CI (`pnpm audit` / dependency-review gate); **minimal dependency policy** — hand-rolled serializers where practical (RTF/Markdown/text per ADR 0006), only well-maintained, permissively-licensed libraries (`docx`, `pdf-lib`) otherwise; review lockfile diffs in PRs; all deps from the official npm registry (also an AMO requirement).

### T5 — Permission creep

A future change adds host permissions, `tabs`, `cookies`, `scripting`, `<all_urls>`, or other capabilities, expanding the attack surface and invalidating privacy claims.

**Mitigations:** `host_permissions: ["https://claude.ai/*"]` plus `storage` and `downloads` is an **invariant**, not a default. Manifest/`wxt.config.ts` changes require explicit scrutiny; PRs adding permissions should be rejected absent an ADR that consciously revises this threat model and the privacy policy.

### T6 — Session misuse via the claude.ai API

Extension code with claude.ai host access performs actions beyond read-only export (the session cookies authorize *everything* the user can do).

**Mitigations:** the extension makes **read-only GET requests** to conversation/organization endpoints only; no POST/PUT/DELETE to claude.ai. Never persist API responses or identifiers beyond `storage.local` preferences (no conversation content, no org IDs cached without need). Treat any write-capable request in a diff as a red flag.

### T7 — Store impersonation / lookalike extensions

A hostile actor publishes a lookalike "Hardcopy" (or "Claude exporter") that *does* steal conversations, damaging users and the project's name.

**Mitigations:** publish under a consistent developer identity on all four stores; link every listing to this repo and `PRIVACY.md`; the README and listings carry the canonical disclaimer (ADR 0004) so the genuine listing is identifiable; report clones via each store's impersonation/IP process. Keep repo 2FA and store accounts locked down; consider signed releases.

## Security invariants — PR checklist

Future PRs must NOT violate any of these. If a change requires breaking one, it needs a new ADR plus updates to this document, `SECURITY.md`, `PRIVACY.md`, and every store listing — not a quiet diff.

- [ ] **No new permissions**: host permissions remain exactly `https://claude.ai/*`; API permissions remain exactly `storage` + `downloads`.
- [ ] **No network contact with any host other than claude.ai** — no analytics, telemetry, error reporting, or third-party services.
- [ ] **No remote code**: no CDN scripts, remote fonts, `eval`/`new Function`, or dynamically fetched code; everything bundled at build time.
- [ ] **No loosened CSP**: default MV3 `script-src 'self'` stands; no `unsafe-inline`/`unsafe-eval`.
- [ ] **Serializers escape untrusted content**: every path that interpolates conversation-derived strings into an output format escapes per T1; adversarial fixtures cover it.
- [ ] **No `innerHTML` (or equivalent) with conversation-derived strings** in any extension UI.
- [ ] **No cookie access**: authentication stays implicit via `credentials: 'include'`; the extension never reads or stores credentials.
- [ ] **Read-only against claude.ai**: no state-changing requests to the API.
- [ ] **Lockfile pinned and honored**: dependency changes are deliberate, reviewed, and pass the CI audit.
