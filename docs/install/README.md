# Installing Hardcopy locally

Hardcopy is not yet in the browser stores (store submission is tracked for the v1.0
milestone). Until then, you can install it locally in any of the four supported
browsers. Pick your browser:

| Browser | Guide | Works on | Install survives a browser restart? |
| --- | --- | --- | --- |
| Chrome | [chrome.md](chrome.md) | macOS, Linux, Windows | Yes |
| Edge | [edge.md](edge.md) | macOS, Linux, Windows | Yes |
| Firefox | [firefox.md](firefox.md) | macOS, Linux, Windows | No (temporary add-on) |
| Safari | [safari.md](safari.md) | macOS only | Partly (see guide) |

## Two ways to get the extension files

1. **From a GitHub Release (easiest, no developer tools needed)** — download the zip
   for your browser from the [releases page](https://github.com/birax/hardcopy-extension/releases)
   (`hardcopy-X.Y.Z-chrome.zip`, `-firefox.zip`, or `-edge.zip`) and unzip it. You can
   verify the download against the attached `SHA256SUMS.txt`
   (`shasum -a 256 -c SHA256SUMS.txt` on macOS/Linux, `certutil -hashfile <zip> SHA256`
   on Windows). There is no Safari zip — Safari needs a Mac-side build, see
   [safari.md](safari.md).
2. **From source** — clone the repo and build it yourself
   (see [CONTRIBUTING.md](../CONTRIBUTING.md) for prerequisites):

   ```sh
   pnpm install
   pnpm build            # Chrome  → .output/chrome-mv3/
   pnpm build:firefox    # Firefox → .output/firefox-mv3/
   pnpm build:edge       # Edge    → .output/edge-mv3/
   pnpm wxt build -b safari   # Safari → .output/safari-mv3/ (then see safari.md)
   ```

## Verifying it works (all browsers)

1. Open [claude.ai](https://claude.ai) and sign in.
2. Open any conversation.
3. Click the Hardcopy icon in the browser toolbar (you may need to pin it first —
   each guide shows how). The Hardcopy popup should open and offer export options
   for the conversation.
4. Export in a format of your choice and check the downloaded file.

## Troubleshooting

- **The popup says you're not on claude.ai (or shows no export options)** — Hardcopy
  only activates on `https://claude.ai/*`. Make sure the *active* tab is a claude.ai
  conversation, then click the icon again. On Firefox and Safari you must also grant
  the extension access to claude.ai the first time (see the per-browser guides).
- **The icon isn't in the toolbar** — it's probably hidden behind the extensions
  (puzzle-piece) menu. Open that menu and pin Hardcopy.
- **Nothing happens on claude.ai after installing** — reload the claude.ai tab.
  Content scripts are only injected into pages loaded *after* the extension was
  installed or updated.
- **Export downloads nothing** — check the browser's download UI and pop-up/download
  blocking settings for claude.ai; the export is delivered as a normal file download
  from the page.
- **The extension disappeared after restarting the browser** — expected for Firefox
  temporary add-ons, and Safari unsigned extensions must be re-allowed after Safari
  quits. See those guides.
- **"Manifest file is missing or unreadable" when loading unpacked** — you selected
  the wrong folder. Select the folder that directly contains `manifest.json`
  (e.g. `.output/chrome-mv3/`, or the folder you unzipped the release into).
