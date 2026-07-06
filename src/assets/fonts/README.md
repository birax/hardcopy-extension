# Bundled PDF fonts

Fonts embedded (subset) into generated PDFs by the PDF serializer
(`src/lib/export/serializers/pdf.ts`). Bundling is required by
[ADR 0002](../../../docs/decisions/0002-fully-client-side-no-external-dependencies.md):
no remote anything — stores forbid remote fonts and the extension makes no
network requests beyond claude.ai.

These faces are for **PDF output only**. The popup/options UI keeps using
system font stacks per the
[design system](../../../docs/design/design-system.md) — that "no bundled
fonts" rule is about UI chrome, not about the documents Hardcopy generates,
which must render identically on every machine.

## Faces

| File | Family / style | Version | Upstream release |
| --- | --- | --- | --- |
| `NotoSans-Regular.ttf` | Noto Sans Regular | v2.015 (hinted) | [notofonts/latin-greek-cyrillic `NotoSans-v2.015`](https://github.com/notofonts/latin-greek-cyrillic/releases/tag/NotoSans-v2.015) |
| `NotoSans-Bold.ttf` | Noto Sans Bold | v2.015 (hinted) | same release |
| `NotoSans-Italic.ttf` | Noto Sans Italic | v2.015 (hinted) | same release |
| `JetBrainsMono-Regular.ttf` | JetBrains Mono Regular | v2.304 | [JetBrains/JetBrainsMono `v2.304`](https://github.com/JetBrains/JetBrainsMono/releases/tag/v2.304) |

SHA-256 checksums of the committed files:

```
478c558ea716033cd60c03438f628dfa75694dcf6b5f6d505a2f05fd2b4f3823  NotoSans-Regular.ttf
1df075a380fc7cb898acf64c1f7b3b4dd780de3caa860178bf929de35817a913  NotoSans-Bold.ttf
467e3f89eeca4108bb8710a2b9e0cf2281ac56d5b0609211a83776d0505eecb5  NotoSans-Italic.ttf
a0bf60ef0f83c5ed4d7a75d45838548b1f6873372dfac88f71804491898d138f  JetBrainsMono-Regular.ttf
```

Why these: both families are SIL OFL 1.1 (permissive, redistribution and
embedding allowed), broadly readable in print, and cover Latin, Greek and
Cyrillic plus wide punctuation/symbol ranges. JetBrains Mono is the monospace
face for code blocks. Bold+italic combined falls back to bold (we do not ship
a BoldItalic face to keep the bundle small).

**Use the `hinted` Noto builds, not `unhinted`.** The `@pdf-lib/fontkit`
subsetter silently corrupts the glyf table of the unhinted v2.015 instances
(many glyphs render blank; reopening the subset throws
`Trying to access beyond buffer length`). The hinted builds subset cleanly —
verified across Latin-1/Extended-A, Greek, Cyrillic, punctuation and symbol
ranges by round-tripping every glyph outline through
`font.createSubset()` → `fontkit.create(subsetBytes)`. Re-run that check
(and eyeball a generated PDF) whenever these files are updated.

## Licensing

Both families are licensed under the SIL Open Font License 1.1, included
verbatim:

- `OFL-NotoSans.txt` — copyright 2022 The Noto Project Authors
- `OFL-JetBrainsMono.txt` — copyright 2020 The JetBrains Mono Project Authors

The TTFs are redistributed unmodified from the upstream releases above, so
OFL Reserved Font Name conditions are not triggered. Generated PDFs embed
*subsets* of these fonts (`pdf-lib` `embedFont(..., { subset: true })`),
which the OFL expressly permits for documents.

## Unicode strategy (documented limitation)

The serializer checks every code point against the embedded font's character
set before drawing (see `glyph safety` in
`src/lib/export/serializers/pdf.ts`). Code points with no glyph — most
emoji, CJK, and other scripts outside Latin/Greek/Cyrillic — are replaced
with a visible placeholder glyph (`□`, or `?` if unavailable) rather than
crashing or being dropped silently. Zero-width joiners/variation selectors
are stripped. Full CJK/emoji coverage would cost tens of megabytes of font
data and is out of scope for v1; users who need it can export Markdown/HTML
formats which defer font choice to the viewer.

## Load mechanism / regeneration

The `.b64.ts` modules alongside each TTF are generated base64 copies of the
font bytes. They are what the serializer actually imports — a plain string
module works identically in the WXT/Vite browser build and in Vitest under
Node, needs no bundler asset config, and keeps fonts out of the bundle until
the PDF serializer module is lazy-loaded.

After updating a TTF, regenerate its module (keep the existing three-line
header comment format) and this README's checksums:

```sh
node -e '
const fs = require("fs");
const pairs = [
  ["NotoSans-Regular.ttf", "noto-sans-regular.b64.ts", "Noto Sans Regular (v2.015, hinted TTF)"],
  ["NotoSans-Bold.ttf", "noto-sans-bold.b64.ts", "Noto Sans Bold (v2.015, hinted TTF)"],
  ["NotoSans-Italic.ttf", "noto-sans-italic.b64.ts", "Noto Sans Italic (v2.015, hinted TTF)"],
  ["JetBrainsMono-Regular.ttf", "jetbrains-mono-regular.b64.ts", "JetBrains Mono Regular (v2.304, TTF)"],
];
for (const [ttf, out, label] of pairs) {
  const b64 = fs.readFileSync(`src/assets/fonts/${ttf}`).toString("base64");
  fs.writeFileSync(`src/assets/fonts/${out}`, [
    "/* v8 ignore file */",
    `// @generated from ${ttf} — see src/assets/fonts/README.md for provenance`,
    "// and regeneration instructions. Do not edit by hand.",
    "",
    `/** Base64-encoded bytes of ${label}. Licensed under the SIL OFL 1.1. */`,
    `export default ${JSON.stringify(b64)};`,
    "",
  ].join("\n"));
}
'
shasum -a 256 src/assets/fonts/*.ttf
```
