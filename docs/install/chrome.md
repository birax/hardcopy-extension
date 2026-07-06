# Installing Hardcopy in Chrome (local install)

Works the same on macOS, Linux, and Windows.

## Prerequisites

- Google Chrome (any recent version; Hardcopy uses Manifest V3, supported since
  Chrome 88 — anything from the last few years is fine).
- The extension files, either:
  - **Release zip:** download `hardcopy-X.Y.Z-chrome.zip` from the
    [releases page](https://github.com/birax/hardcopy-extension/releases) and unzip it
    somewhere permanent (e.g. `~/Apps/hardcopy-chrome/` — Chrome loads the extension
    from this folder every launch, so don't unzip into Downloads and delete it later), or
  - **From source:** `pnpm install && pnpm build` in a checkout of this repo, which
    produces `.output/chrome-mv3/`.

## Install

1. Open Chrome and go to `chrome://extensions` (type it in the address bar), or use
   menu **⋮ → Extensions → Manage Extensions**.
2. Turn on the **Developer mode** toggle (top-right corner of the page).
3. Click **Load unpacked** (top-left).
4. Select the folder that contains `manifest.json`:
   - release zip: the folder you unzipped, or
   - source build: `.output/chrome-mv3/`.
5. Hardcopy appears in the extensions list. Click the puzzle-piece icon in the
   toolbar and pin **Hardcopy** so its icon is always visible.

> Chrome may show a "Disable developer mode extensions?" style notice on startup for
> unpacked extensions — that's expected for local installs; dismiss it.

## Verify

Open a conversation on [claude.ai](https://claude.ai) and click the Hardcopy toolbar
icon — the popup should open and offer export options. See the
[common verification steps](README.md#verifying-it-works-all-browsers).

## Update

- **Release zip:** unzip the new version *over the same folder* (or into a new folder),
  then on `chrome://extensions` click the **↻ reload** icon on the Hardcopy card
  (or **Load unpacked** again if you used a new folder — remove the old entry).
- **From source:** `git pull && pnpm install && pnpm build`, then click **↻ reload**
  on the Hardcopy card.
- After updating, reload any open claude.ai tabs.

## Uninstall

On `chrome://extensions`, click **Remove** on the Hardcopy card. You can then delete
the folder you loaded it from.

## Chrome-specific troubleshooting

- If the Hardcopy card shows an **Errors** button, click it and include the output in
  a GitHub issue.
- If you moved or deleted the folder you loaded, Chrome shows the extension as broken
  — remove it and load it again from the new location.

For everything else, see the [shared troubleshooting section](README.md#troubleshooting).
