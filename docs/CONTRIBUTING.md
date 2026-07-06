# Contributing to Hardcopy

Thanks for helping out! This guide covers local development setup. For *why* the project is
shaped the way it is, read the ADRs in [`docs/decisions/`](decisions/) — start with
[ADR 0006 (core architecture)](decisions/0006-core-architecture.md).

## Prerequisites

- **Node.js** — the version in [`.nvmrc`](../.nvmrc) (current LTS). With nvm: `nvm use`.
- **pnpm** — the version pinned in the `packageManager` field of `package.json`.
  Install with `npm install -g pnpm`, or via [corepack](https://pnpm.io/installation#using-corepack)
  on Node versions that bundle it.

## Setup

```sh
pnpm install   # also runs `wxt prepare`, generating .wxt/ (types, tsconfig)
```

## Commands

| Command | What it does |
| --- | --- |
| `pnpm dev` | Dev mode with HMR (opens a browser with the extension loaded) |
| `pnpm build` | Production build for Chrome → `.output/chrome-mv3/` |
| `pnpm build:firefox` | Production build for Firefox → `.output/firefox-mv3/` |
| `pnpm build:edge` | Production build for Edge → `.output/edge-mv3/` |
| `pnpm zip` / `pnpm zip:firefox` / `pnpm zip:edge` | Store-ready zips in `.output/` (the Firefox zip includes the sources zip AMO requires) |
| `pnpm typecheck` | TypeScript, strict mode, no emit |
| `pnpm lint` | ESLint (flat config) |
| `pnpm format` | Prettier, writes in place |
| `pnpm test` | Vitest unit tests |
| `pnpm test:coverage` | Vitest with V8 coverage |
| `pnpm test:e2e` | Playwright end-to-end tests (real Chromium, mocked claude.ai) |

CI (`.github/workflows/ci.yml`) runs typecheck → lint → tests with coverage, then builds and
zips for chrome/firefox/edge; `.github/workflows/e2e.yml` runs the Playwright suite. All of it
must be green before merging.

## End-to-end tests

`pnpm test:e2e` runs the Playwright suite in `e2e/`: it loads the built `.output/chrome-mv3/`
extension into a real (headless) Chromium and drives the popup → probe → export → download flow
against a fully mocked claude.ai — Playwright routes serve the JSON payloads from
`tests/fixtures/`, and no request ever leaves the machine.

First-time setup (downloads the Playwright-bundled Chromium; branded Chrome cannot side-load
extensions):

```sh
pnpm exec playwright install chromium
```

Then just:

```sh
pnpm test:e2e   # builds the extension itself (set HARDCOPY_E2E_SKIP_BUILD=1 to reuse .output/)
```

On failure, a Playwright trace is kept under `test-results/` — inspect it with
`pnpm exec playwright show-trace <path-to-trace.zip>`. The specs live in `e2e/*.e2e.ts` (that
suffix keeps them out of Vitest's default include); shared fixtures — the extension-loading
recipe and the claude.ai mock — live in `e2e/fixtures.ts`.

## Loading the unpacked extension

First run a build for the browser you're targeting, then follow the step-by-step
guides in [`docs/install/`](install/):

- **Chrome** — [install/chrome.md](install/chrome.md) (`chrome://extensions` → Load
  unpacked → `.output/chrome-mv3/`).
- **Edge** — [install/edge.md](install/edge.md) (`edge://extensions` → Load unpacked →
  `.output/edge-mv3/`).
- **Firefox** — [install/firefox.md](install/firefox.md) (`about:debugging` temporary
  add-on; removed when Firefox restarts).
- **Safari** — [install/safari.md](install/safari.md) (build `pnpm wxt build -b safari`,
  then build/run the committed Xcode wrapper under `safari/`; requires full Xcode).

For day-to-day work prefer `pnpm dev` (Chrome) or `pnpm dev -b firefox`, which loads the
extension automatically and hot-reloads on change.

## Code style

- TypeScript, `strict` mode; no `any` unless there is truly no alternative.
- Prettier formats, ESLint lints — run `pnpm format` and `pnpm lint` before committing;
  neither should produce diffs or errors on a clean tree.
- Prefer small, well-named modules under `src/lib/` with unit tests alongside
  (`foo.ts` + `foo.test.ts`).
- No runtime network requests to anything other than `claude.ai`, no telemetry, no remote
  code — this is a hard rule (see [ADR 0002](decisions/0002-fully-client-side-no-external-dependencies.md)).

## Adding a locale

All user-visible strings live in `public/_locales/en/messages.json` and are read through
the typed `t()` helper in `src/lib/i18n.ts` (the manifest name/description resolve from
the same catalogue via `__MSG_extName__`/`__MSG_extDescription__`). To add a locale:

1. Copy `public/_locales/en/` to `public/_locales/<code>/` (e.g. `de`, `pt_BR` — see the
   [supported locale codes](https://developer.chrome.com/docs/extensions/reference/api/i18n#locales)).
2. Translate each `"message"` value. Keep the `$1`-style placeholders, don't translate
   the keys, and keep the ADR 0004 non-affiliation disclaimer's meaning exact.
3. The `"description"` fields explain where each string appears — they are for you and
   stay in English.

That's the whole change: keys are typed from the English catalogue, so a `t()` call with
an unknown key fails the type check, and `tests/i18n.test.ts` fails when a catalogue
entry is unused or missing. English remains the fallback (`default_locale`) for any
string a locale doesn't cover.

## Architecture decisions (ADRs)

Any significant design choice gets an ADR in [`docs/decisions/`](decisions/), numbered
sequentially, following the existing format (Status / Date / Context / Decision /
Consequences). See [ADR 0001](decisions/0001-record-architecture-decisions.md) for the
process. Don't make load-bearing decisions in PR descriptions — record them.
