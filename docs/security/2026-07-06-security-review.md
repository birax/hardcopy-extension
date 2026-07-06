# Pre-release security review — 2026-07-06

Review for issue #25 (milestone M4 — v1.0 release), auditing the codebase
against the [threat model](threat-model.md)'s security-invariants checklist
before store submission. Reviewer: repository maintainer (AI-assisted).
Companion documents: [SECURITY.md](../../SECURITY.md),
[PRIVACY.md](../../PRIVACY.md), [store data disclosures](store-data-disclosures.md).

## Scope

- Manifest and permissions across all four browser targets (`wxt.config.ts`
  plus the built `manifest.json` for chrome-mv3, firefox-mv3, edge-mv3,
  safari-mv3, and the vendored Safari wrapper resources).
- Every source file under `src/` (API client, parser, prepare, five
  serializers, popup, options, content script, flow, storage, i18n,
  filename handling) and the serializer/parser test suites under `tests/`.
- Built bundles (`.output/*`) — greps for external URLs, network calls, and
  dynamic-code patterns in the shipped JavaScript.
- Dependency posture: `pnpm audit` (prod and dev), lockfile policy, CI gates.

Out of scope: claude.ai itself; live-session validation (this environment
cannot log in to claude.ai — see residual risks); the Playwright e2e suite
(owned by a concurrent workstream).

## Method

1. Read the threat model and walked its PR checklist item by item.
2. Static sweep of `src/` for dangerous sinks and patterns:
   `fetch(`, `XMLHttpRequest`, `WebSocket`, `innerHTML`, `outerHTML`,
   `insertAdjacentHTML`, `document.write`, `srcdoc`, `DOMParser`,
   `eval(`, `new Function`, dynamic `import()` targets, `setAttribute`
   call sites, cookie access, `storage.*` keys, hard-coded URLs.
3. Built all four targets and diffed the four generated manifests against
   the expected permission set; grepped the built bundles for
   `https?://` occurrences and `eval`/`new Function`.
4. Reviewed each serializer's escaping strategy against threat T1 and
   confirmed a dedicated adversarial test suite exists per format.
5. Ran `pnpm audit --prod --audit-level high` (gate condition) and
   `pnpm audit` (full picture), then wired the gate into CI.

## Findings

| # | Finding | Severity | Status |
| --- | --- | --- | --- |
| F1 | `downloads` permission declared in the manifest but unused by any code path — the export saves via an in-page blob + anchor click (`src/lib/flow/download.ts`), which needs no extension API. Unnecessary permission = larger prompt, larger attack surface, and a store-review question. | Medium (hardening) | **Fixed** — permission removed from `wxt.config.ts`; verified absent from all four built manifests and the Safari wrapper resources; `PRIVACY.md`, `SECURITY.md`, threat model (T5 + checklist), store disclosures, ADR 0006 (amendment note), and the Safari install guide all updated to match. |
| F2 | Documentation overclaimed "never reads … cookies": `src/lib/api/client.ts` reads `document.cookie` to extract the non-credential `lastActiveOrg` hint (org picker). The value is never persisted and never leaves the claude.ai origin, so the *credential* invariant holds — but the blanket wording was inaccurate and would not survive a skeptical store review or code audit. | Low (doc accuracy) | **Fixed** — `SECURITY.md` and the threat-model checklist now state the invariant precisely: no session-cookie/credential access; the sole sanctioned cookie read is the non-credential `lastActiveOrg` hint. |
| F3 | No dependency-audit gate in CI: a vulnerable or hijacked dependency could ship unnoticed (threat T4), and nothing enforced the "prod deps are clean" claim over time. | Low (process gap) | **Fixed** — CI now runs `pnpm audit --prod --audit-level high` on every push/PR, `actions/dependency-review-action` (fail on high, license allow-list) on PRs, and Dependabot opens weekly grouped update PRs for npm and GitHub Actions. |
| F4 | `pnpm audit` reports four advisories in **dev** dependencies (`esbuild`, `shell-quote`, `tmp`, `uuid` — one critical, one high among them, all reachable only through build tooling). None of these packages ship in the extension bundle; **production dependencies audit clean** (`pnpm audit --prod`: no known vulnerabilities). | Informational | **Tracked** — Dependabot (added in F3) will raise the bumps; the CI gate deliberately scopes to `--prod` so dev-tooling advisories surface via Dependabot PRs rather than blocking every build. |

No violations of the remaining invariants were found. Verified clean:

- **Permissions**: `host_permissions` is exactly `["https://claude.ai/*"]`;
  API permissions now exactly `["storage"]`; no `tabs`, `scripting`,
  `cookies`, `downloads`, or `<all_urls>` anywhere. Confirmed in the built
  chrome-mv3, firefox-mv3, edge-mv3, and safari-mv3 manifests and the
  vendored Safari wrapper copy.
- **`web_accessible_resources`**: single entry, `serializers/*.js`, matches
  scoped to `https://claude.ai/*` only — in all four built manifests.
- **CSP**: no `content_security_policy` key in any manifest; the MV3
  default (`script-src 'self'`) stands. No `unsafe-eval`/`unsafe-inline`.
- **No remote code**: no `eval`/`new Function` in source or built bundles;
  the only dynamic `import()` loads the extension's own serializer bundle
  via `browser.runtime.getURL(...)`; all fonts and libraries are bundled.
- **Network**: the only `fetch` in first-party code is the API client's
  `getJson`, hard-pinned to `https://claude.ai` and **GET-only** (T6);
  no `XMLHttpRequest`/`WebSocket`/`sendBeacon`. Bundle grep found one other
  fetch call site — Vite's standard `modulepreload` polyfill, which fetches
  same-extension chunk URLs only. All other URL strings in the bundles are
  inert XML-namespace identifiers (from the `docx` library), the SVG
  namespace, and static GitHub links in the options page. No analytics,
  telemetry, or error-reporting SDKs.
- **UI injection (T2)**: zero `innerHTML`/`insertAdjacentHTML`/
  `document.write`/`outerHTML` assignments in popup, options, or content
  script. Both UIs build DOM via `createElement`/`textContent`/`append`
  with a typed element factory; all `setAttribute` call sites use static
  names and static or validated values; external links are hard-coded
  `https:` URLs with `rel="noopener noreferrer"`.
- **Serializer escaping (T1)**: dedicated adversarial suites per format —
  RTF (`tests/serializer-rtf-escaping.test.ts`: control words, `\{}`,
  round-trip decode proof), Markdown (fence-escalation suite proving
  embedded fences/headings cannot break document structure), DOCX (XML
  injection suite through the real `docx` packer), PDF (hostile content
  incl. parens/backslash/control characters through pdf-lib's text APIs,
  hostile titles and labels). Plain text is an inert format; its snapshot
  suite covers structure. All content flows through library text APIs or
  the hand-rolled escapers — no raw format syntax is concatenated from
  content strings.
- **Storage**: `storage.local` holds exactly three preference keys (export
  format, export options, filename template). No conversation content, org
  IDs, session data, or API responses are persisted. Uninstall wipes it.
- **Filenames**: conversation titles are sanitized before use as download
  filenames (`src/lib/filename.ts`: forbidden characters, Windows reserved
  device names, dot/space trimming, length caps).
- **Supply chain (T4)**: `pnpm-lock.yaml` committed and installed with
  `--frozen-lockfile` in CI; four production dependencies total
  (`docx`, `pdf-lib`, `@pdf-lib/fontkit`, `marked`), all MIT from the
  official registry; `pnpm-workspace.yaml` already enforces a
  minimum-release-age gate and an install-script allow-list.

## Permission decision

**`downloads` is dropped.** The export path (`triggerDownload`) creates a
Blob in the content script, mints an object URL, and clicks a synthetic
anchor with the `download` attribute — a plain web-platform mechanism that
requires no extension permission on any of the four targets (and was never
supported by Safari anyway). The permission set is now:

| Manifest key | Value |
| --- | --- |
| `host_permissions` | `["https://claude.ai/*"]` |
| `permissions` | `["storage"]` |

Re-adding `downloads` (e.g. for a `saveAs` dialog or background download
path) is a threat-model invariant change: it requires an ADR plus updates to
the threat model, `SECURITY.md`, `PRIVACY.md`, and every store listing.

## CI / process changes made in this review

- `.github/workflows/ci.yml`: new `dependency-audit` job —
  `pnpm audit --prod --audit-level high` fails the build on high or
  critical advisories in production dependencies. Override process (for an
  unpatched advisory that demonstrably doesn't affect us): add the GHSA id
  to `auditConfig.ignoreGhsas` in `pnpm-workspace.yaml` in a reviewed PR
  with a linked rationale, plus an `area:security` issue to remove it.
- `.github/workflows/ci.yml`: new `dependency-review` job (PRs only) —
  `actions/dependency-review-action@v4`, failing on high-severity
  advisories in newly introduced dependencies and on licenses outside the
  permissive allow-list.
- `.github/dependabot.yml`: weekly npm and github-actions update PRs,
  minor/patch grouped into one PR per ecosystem.

## Residual risks

1. **Synthesized fixtures pending live validation.** The conversation
   fixtures are reconstructed from documented API shapes, not recorded from
   a live session (`tests/fixtures/README.md`). Until validated against a
   live capture, the parser may mishandle real payloads. Security impact is
   bounded (the parser is defensive and all downstream rendering escapes),
   but correctness against the live API is unproven. **Blocker for release
   sign-off; not a blocker for this review.**
2. **No live network sweep.** The "zero requests to non-claude.ai hosts"
   claim is verified statically (source + bundle greps, sole-fetch-site
   review) and structurally (host permission prevents cross-origin
   extension fetches beyond claude.ai). A devtools network sweep of a real
   export on a live session should be performed once (checklist below) to
   close the loop empirically.
3. **Unofficial upstream API.** claude.ai can change shapes at any time;
   the DOM fallback then reads page DOM, which is fully attacker-influenced
   content — it is treated strictly as text today, and must stay that way.
4. **Vendored Safari wrapper snapshot.** `safari/.../Resources/` is a
   checked-in copy of a build and goes stale between refreshes (the
   documented `rsync` from `.output/safari-mv3/` is the refresh path). It
   was refreshed as part of this review; refresh again at release-build
   time so the store submission matches the tagged source.
5. **Dev-dependency advisories (F4)** remain until Dependabot bumps land;
   they affect the build environment only, not the shipped artifact.

## Store-submission sign-off checklist

Before submitting v1.0 to any store:

- [ ] Fixtures validated against a live claude.ai capture (residual risk 1;
      replace/extend `tests/fixtures/` with sanitized real payloads).
- [ ] One-time devtools network sweep on a live session: perform an export
      in every format; confirm the only requests are `claude.ai` API GETs
      and `chrome-extension://`/`moz-extension://` internal loads.
- [ ] `pnpm audit --prod --audit-level high` clean at the release commit
      (enforced by CI; re-check at tag time).
- [ ] All four built manifests at the release tag show
      `host_permissions: ["https://claude.ai/*"]`, `permissions: ["storage"]`,
      `web_accessible_resources` scoped to `https://claude.ai/*`, and no
      `content_security_policy` key.
- [ ] Safari wrapper resources re-synced from the release build
      (`rsync -a --delete .output/safari-mv3/ "safari/Hardcopy/Hardcopy Extension/Resources/"`).
- [ ] Store questionnaire answers copied from
      [store-data-disclosures.md](store-data-disclosures.md) (updated in
      this review: no `downloads` justification needed) and privacy-policy
      URL pointing at `PRIVACY.md` on `main`.
- [ ] No open `area:security` issues against the release milestone.
- [ ] Dependabot enabled and first weekly run triaged.

## Verdict

With F1–F3 fixed in this change and F4 tracked, the codebase satisfies every
security invariant in the threat model. Remaining work before store
submission is the live-session validation items in the checklist above.
