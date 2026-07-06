# Installing Hardcopy in Firefox (local install)

Works the same on macOS, Linux, and Windows.

**Important Firefox caveat up front:** regular Firefox only *permanently* installs
extensions that Mozilla has signed. Until Hardcopy is published on
addons.mozilla.org (AMO), a local install is a **temporary add-on** — it is removed
every time Firefox restarts and must be loaded again. Once the AMO listing exists,
installing from there is the way to get a persistent install.

## Prerequisites

- Firefox (any recent version; Hardcopy ships Manifest V3 with an explicit add-on ID,
  supported in current Firefox releases).
- The extension files, either:
  - **Release zip:** download `hardcopy-X.Y.Z-firefox.zip` from the
    [releases page](https://github.com/birax/hardcopy-extension/releases) — for a
    temporary add-on you can load the zip file directly, no unzipping needed, or
  - **From source:** `pnpm install && pnpm build:firefox` in a checkout of this repo,
    which produces `.output/firefox-mv3/`.

## Install (temporary add-on)

1. Open Firefox and go to `about:debugging#/runtime/this-firefox` (type it in the
   address bar).
2. Click **Load Temporary Add-on…**.
3. Select the release zip itself, or (for a source build) any file inside
   `.output/firefox-mv3/` — e.g. `manifest.json`.
4. Hardcopy appears under "Temporary Extensions".
5. **Grant site access** (Firefox MV3 does not grant host permissions automatically):
   open [claude.ai](https://claude.ai), click the puzzle-piece **Extensions** button
   in the toolbar, click Hardcopy (or its ⚙ / settings item), and choose
   **Always Allow on claude.ai**. Then reload the claude.ai tab.
6. Pin the icon if you like: puzzle-piece menu → ⚙ next to Hardcopy →
   **Pin to Toolbar**.

Remember: the add-on disappears when Firefox restarts — repeat these steps to load
it again.

## Alternative for developers: `web-ext run`

From a repo checkout, this launches a throwaway Firefox profile with the extension
pre-loaded and auto-reloading on change:

```sh
pnpm build:firefox
npx web-ext run --source-dir .output/firefox-mv3
```

(Or just `pnpm dev -b firefox`, which WXT wires up with HMR.)

## Verify

Open a conversation on [claude.ai](https://claude.ai) and click the Hardcopy toolbar
icon — the popup should open and offer export options. See the
[common verification steps](README.md#verifying-it-works-all-browsers).

## Update

Temporary add-ons: on `about:debugging#/runtime/this-firefox`, click **Reload** on
the Hardcopy entry after rebuilding, or remove it and load the new zip. Reload any
open claude.ai tabs afterwards.

## Uninstall

On `about:debugging#/runtime/this-firefox`, click **Remove** on the Hardcopy entry —
or just restart Firefox.

## Firefox-specific troubleshooting

- **Export button does nothing / popup can't see the conversation** — you probably
  skipped step 5 (site access). Firefox treats MV3 host permissions as opt-in: grant
  **Always Allow on claude.ai** from the extensions panel, then reload the tab.
- **"This add-on could not be installed because it appears to be corrupt"** when
  opening the zip via `about:addons` — that's the *signed install* path, which only
  works for AMO-signed builds. Use the temporary add-on steps above instead.
  (Firefox [Developer Edition](https://www.mozilla.org/firefox/developer/) and Nightly
  additionally allow unsigned installs by setting
  `xpinstall.signatures.required` to `false` in `about:config`; release Firefox
  ignores that preference.)

For everything else, see the [shared troubleshooting section](README.md#troubleshooting).
