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

CI (`.github/workflows/ci.yml`) runs typecheck → lint → tests with coverage, then builds and
zips for chrome/firefox/edge. All of it must be green before merging.

## Loading the unpacked extension

First run a build for the browser you're targeting, then:

- **Chrome** — `chrome://extensions` → enable **Developer mode** → **Load unpacked** →
  select `.output/chrome-mv3/`.
- **Edge** — `edge://extensions` → enable **Developer mode** → **Load unpacked** →
  select `.output/edge-mv3/`.
- **Firefox** — `about:debugging#/runtime/this-firefox` → **Load Temporary Add-on…** →
  select any file inside `.output/firefox-mv3/` (e.g. `manifest.json`). Temporary add-ons
  are removed when Firefox restarts.

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

## Architecture decisions (ADRs)

Any significant design choice gets an ADR in [`docs/decisions/`](decisions/), numbered
sequentially, following the existing format (Status / Date / Context / Decision /
Consequences). See [ADR 0001](decisions/0001-record-architecture-decisions.md) for the
process. Don't make load-bearing decisions in PR descriptions — record them.
