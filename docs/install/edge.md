# Installing Hardcopy in Microsoft Edge (local install)

Works the same on macOS, Linux, and Windows.

## Prerequisites

- Microsoft Edge (any recent version).
- The extension files, either:
  - **Release zip:** download `hardcopy-X.Y.Z-edge.zip` from the
    [releases page](https://github.com/birax/hardcopy-extension/releases) and unzip it
    somewhere permanent (Edge loads from this folder on every launch — don't delete it
    after installing), or
  - **From source:** `pnpm install && pnpm build:edge` in a checkout of this repo,
    which produces `.output/edge-mv3/`.

## Install

1. Open Edge and go to `edge://extensions` (type it in the address bar), or use menu
   **… → Extensions → Manage extensions**.
2. Turn on the **Developer mode** toggle (in the left sidebar; on narrow windows it
   may appear at the bottom-left or under the page's ⚙ settings area).
3. Click **Load unpacked**.
4. Select the folder that contains `manifest.json`:
   - release zip: the folder you unzipped, or
   - source build: `.output/edge-mv3/`.
5. Hardcopy appears in the list. Click the puzzle-piece **Extensions** button in the
   toolbar and use the eye/pin control to show **Hardcopy** in the toolbar.

## Verify

Open a conversation on [claude.ai](https://claude.ai) and click the Hardcopy toolbar
icon — the popup should open and offer export options. See the
[common verification steps](README.md#verifying-it-works-all-browsers).

## Update

- **Release zip:** unzip the new version over the same folder, then on
  `edge://extensions` click **Reload** on the Hardcopy card.
- **From source:** `git pull && pnpm install && pnpm build:edge`, then click
  **Reload** on the Hardcopy card.
- After updating, reload any open claude.ai tabs.

## Uninstall

On `edge://extensions`, click **Remove** on the Hardcopy card, then delete the folder
you loaded it from if you no longer need it.

## Edge-specific troubleshooting

- Edge periodically nags about extensions from outside the Microsoft store
  ("turn off extensions from other sources?") — choose to keep it enabled.
- If the card shows **Errors**, click it and include the output in a GitHub issue.

For everything else, see the [shared troubleshooting section](README.md#troubleshooting).
