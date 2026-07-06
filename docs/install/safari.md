# Installing Hardcopy in Safari (local install, macOS only)

Safari can't load a web extension folder directly — the extension has to be wrapped
in a small native Mac app, built with Xcode. This repo already contains that wrapper
project (under [`safari/`](../../safari/)), so installing is: build the app in Xcode,
run it once, and allow unsigned extensions in Safari.

Per [ADR 0003](../decisions/0003-target-browsers-and-safari-strategy.md), this local
Xcode route is the supported Safari install for now; App Store distribution comes
later, once the project enrols in the Apple Developer Program.

## Prerequisites

- macOS with **full Xcode** installed (free, from the Mac App Store or
  [developer.apple.com/xcode](https://developer.apple.com/xcode/)). The Command Line
  Tools alone are **not** enough — `xcodebuild` and the converter both need Xcode.
  No Apple Developer account is needed; the build is signed "to run locally".
- A checkout of this repo with dependencies installed
  (see [CONTRIBUTING.md](../CONTRIBUTING.md)): `pnpm install`.

If Xcode is installed but your system still points at the Command Line Tools
(`xcode-select -p` prints `/Library/Developer/CommandLineTools`), either switch it —
`sudo xcode-select -s /Applications/Xcode.app/Contents/Developer` — or prefix the
commands below with `DEVELOPER_DIR=/Applications/Xcode.app/Contents/Developer`.

## Install

### 1. Build the wrapper app

**Option A — Xcode app (recommended for non-developers):**

1. In Finder, open `safari/Hardcopy/Hardcopy.xcodeproj` (double-click). Xcode opens.
2. If Xcode asks about trusting the project or enabling the scheme, accept.
3. Press **⌘R** (Product → Run). Xcode builds the app and launches it.

**Option B — command line:**

```sh
xcodebuild -project safari/Hardcopy/Hardcopy.xcodeproj -scheme Hardcopy -configuration Debug build
open ~/Library/Developer/Xcode/DerivedData/Hardcopy-*/Build/Products/Debug/Hardcopy.app
```

Either way, a small "Hardcopy" window appears saying the extension is available via
Safari — the app's only job is to register the extension with Safari. You can quit
the app once Safari is set up; the extension stays registered as long as the app
stays where it was built.

### 2. Allow unsigned extensions in Safari

Because the local build isn't signed by a Developer ID, Safari must be told to
accept it:

1. Open **Safari → Settings… → Advanced** and tick
   **Show features for web developers** (on older Safari versions this is called
   "Show Develop menu in menu bar").
2. In the menu bar, open **Develop → Allow Unsigned Extensions** and enter your
   macOS password.

> **This setting resets every time Safari quits.** After restarting Safari, redo
> Develop → Allow Unsigned Extensions before the extension will run again — the
> checkbox in Extensions settings will be greyed out until you do.

### 3. Enable the extension

1. Open **Safari → Settings… → Extensions**.
2. Tick **Hardcopy** in the left-hand list.
3. When prompted about website access, allow it for **claude.ai**
   (choose **Always Allow on claude.ai** / "Always Allow on Every Website" if you
   prefer). You can review this later under Settings → Websites, or per-site via the
   puzzle-piece/extension button in Safari's address bar.

## Verify

Open a conversation on [claude.ai](https://claude.ai) and click the Hardcopy button
in Safari's toolbar — the popup should open and offer export options. See the
[common verification steps](README.md#verifying-it-works-all-browsers).

## Update

When the extension source changes, rebuild the web-extension bundle and copy it into
the wrapper's resources, then rebuild the app:

```sh
pnpm wxt build -b safari
rsync -a --delete .output/safari-mv3/ "safari/Hardcopy/Hardcopy Extension/Resources/"
```

Then run the app again from Xcode (**⌘R**) and reload any open claude.ai tabs.

> Don't re-run `safari-web-extension-converter` to update — that regenerates the
> whole Xcode project and discards fixes made to it (see
> "Regenerating the wrapper" below). The rsync above is the supported refresh path.

## Uninstall

1. Untick Hardcopy in **Safari → Settings… → Extensions**.
2. Delete the built `Hardcopy.app` (it lives in Xcode's DerivedData folder unless you
   moved it; Xcode → Product → Show Build Folder in Finder locates it). Safari drops
   the extension once the app is gone.

## Safari-specific troubleshooting

- **Hardcopy doesn't appear in Safari → Settings → Extensions** — the app must run
  at least once so macOS registers it; launch it again (⌘R in Xcode). If it still
  doesn't appear, check Develop → Allow Unsigned Extensions is on.
- **The Hardcopy checkbox is greyed out / extension stopped working after reopening
  Safari** — unsigned-extension permission resets when Safari quits; redo
  Develop → Allow Unsigned Extensions.
- **Converter warning about `downloads`** — when regenerating the wrapper you may see
  a warning that the `downloads` manifest permission isn't supported by Safari. It's
  harmless: Hardcopy delivers exports through a normal in-page download, not the
  `downloads` API.

For everything else, see the [shared troubleshooting section](README.md#troubleshooting).

## Maintainers: regenerating the wrapper project

The `safari/` project was generated with:

```sh
pnpm wxt build -b safari
xcrun safari-web-extension-converter .output/safari-mv3 \
  --project-location safari --app-name Hardcopy \
  --bundle-identifier uk.me.calverley.hardcopy \
  --macos-only --copy-resources --no-open --force
```

Two manual fixes were applied after generation — re-apply them if you ever regenerate:

1. **Parent app bundle identifier casing.** The converter derives the app target's
   bundle ID from the app *name*, producing `uk.me.calverley.Hardcopy` (capital H)
   while the extension target gets `uk.me.calverley.hardcopy.Extension`. Xcode's
   embedded-binary validation then fails with "Embedded binary's bundle identifier is
   not prefixed with the parent app's bundle identifier". Fix: in
   `safari/Hardcopy/Hardcopy.xcodeproj/project.pbxproj`, set both app-target
   `PRODUCT_BUNDLE_IDENTIFIER` entries to `uk.me.calverley.hardcopy` (lowercase).
2. Nothing else — extension resources are plain copies of `.output/safari-mv3/`
   (refresh with the rsync command above).

Build validation without any signing identity:
`xcodebuild ... build` works as-is (the generated project uses ad-hoc "Sign to Run
Locally" signing). Do **not** pass `CODE_SIGNING_ALLOWED=NO` — the embedded `.appex`
validation step requires the ad-hoc signature and fails without it.
