# Hardcopy design system

The visual language for Hardcopy's popup, options page, and store assets.
Companion to [ADR 0004](../decisions/0004-name-and-brand-hardcopy.md), whose
branding rules are binding: original artwork only, no Anthropic marks,
starburst, or signature colors, and the non-affiliation disclaimer verbatim.

Accessibility is a requirement, not a preference: every token pairing below
meets **WCAG 2.2 AA**, and body-text pairings meet **AAA** (≥ 7:1). Ratios
were computed from the hex values with the WCAG relative-luminance formula;
if you change a value, recompute (`node scripts` one-liner in
[README](README.md)) and update the table.

## 1. Brand idea

Hardcopy turns an ephemeral chat into a permanent document. The mark and the
palette both come from that idea:

- **The mark** — a document page whose bottom-left corner extends into a
  speech-bubble tail (the conversation) and whose top-right corner is
  dog-eared (the paper). One silhouette, two readings.
- **The palette** — *deep teal and ink*. Teal is the color of durable
  things — archival bookcloth, typewriter ribbon, drafting tables — and it is
  nowhere near Anthropic's terracotta/cream identity, which we must not
  imitate. Ink neutrals are slightly cool (blue-grey) so the UI feels like
  paper and print, not a dashboard.

## 2. Color

Tokens are CSS custom properties, prefixed `--hc-`. Light theme is the
default; dark theme applies under `@media (prefers-color-scheme: dark)` (the
popup follows the browser, it does not ship its own theme toggle in v1).

```css
:root {
  /* Surfaces */
  --hc-bg: #ffffff; /* popup background */
  --hc-bg-subtle: #f2f7f6; /* wells, option groups, banners */

  /* Text */
  --hc-text: #17252b; /* primary text (ink) */
  --hc-text-secondary: #42555c; /* captions, helper text */

  /* Brand / interactive */
  --hc-accent: #0a5b55; /* teal-700 — buttons, links, selected states */
  --hc-accent-hover: #07443f; /* teal-800 — hover/active */
  --hc-on-accent: #ffffff; /* text/icons on accent fills */
  --hc-accent-tint: #9bd4cc; /* teal-200 — decorative only, never text */

  /* Lines */
  --hc-border: #c6d4d2; /* hairlines, dividers (decorative) */
  --hc-border-strong: #66807b; /* form-control borders (≥ 3:1) */

  /* Focus */
  --hc-focus: #0a5b55;

  /* Semantic */
  --hc-success: #166a38;
  --hc-success-bg: #e4f2e9;
  --hc-error: #b42237;
  --hc-error-bg: #fbebed;
  --hc-warn: #7a5000;
  --hc-warn-bg: #fcf3e2;
}

@media (prefers-color-scheme: dark) {
  :root {
    --hc-bg: #101a1d;
    --hc-bg-subtle: #182428;

    --hc-text: #e7eeec;
    --hc-text-secondary: #a6bab8;

    --hc-accent: #53c4b7; /* teal-300 — light accent for dark surfaces */
    --hc-accent-hover: #79e0d3;
    --hc-on-accent: #062521; /* dark ink on the light accent */
    --hc-accent-tint: #2a4c48;

    --hc-border: #263a3e;
    --hc-border-strong: #56706c;

    --hc-focus: #53c4b7;

    --hc-success: #6fce8b;
    --hc-success-bg: #14261c;
    --hc-error: #f08ca0;
    --hc-error-bg: #2c181d;
    --hc-warn: #e3b958;
    --hc-warn-bg: #2a2214;
  }
}
```

### Contrast (computed, WCAG 2.2)

Light theme:

| Pairing                        | Ratio       | Requirement           | Result  |
| ------------------------------ | ----------- | --------------------- | ------- |
| `text` on `bg`                 | **15.72:1** | 4.5:1 (AA text)       | AAA     |
| `text` on `bg-subtle`          | **14.53:1** | 4.5:1                 | AAA     |
| `text-secondary` on `bg`       | **7.82:1**  | 4.5:1                 | AAA     |
| `text-secondary` on `bg-subtle`| **7.23:1**  | 4.5:1                 | AAA     |
| `accent` on `bg` (links)       | **7.95:1**  | 4.5:1                 | AAA     |
| `accent` on `bg-subtle`        | **7.35:1**  | 4.5:1                 | AAA     |
| `on-accent` on `accent`        | **7.95:1**  | 4.5:1                 | AAA     |
| `on-accent` on `accent-hover`  | **11.01:1** | 4.5:1                 | AAA     |
| `border-strong` on `bg`        | **4.25:1**  | 3:1 (non-text UI)     | Pass    |
| `focus` on `bg`                | **7.95:1**  | 3:1 (focus indicator) | Pass    |
| `success` on `success-bg`      | **5.77:1**  | 4.5:1                 | AA      |
| `error` on `error-bg`          | **5.65:1**  | 4.5:1                 | AA      |
| `warn` on `warn-bg`            | **6.41:1**  | 4.5:1                 | AA      |
| `success` / `error` / `warn` on `bg` | **6.66 / 6.51 / 7.06:1** | 4.5:1 | AA–AAA |

Dark theme:

| Pairing                        | Ratio       | Requirement | Result |
| ------------------------------ | ----------- | ----------- | ------ |
| `text` on `bg`                 | **15.02:1** | 4.5:1       | AAA    |
| `text` on `bg-subtle`          | **13.50:1** | 4.5:1       | AAA    |
| `text-secondary` on `bg`       | **8.70:1**  | 4.5:1       | AAA    |
| `text-secondary` on `bg-subtle`| **7.82:1**  | 4.5:1       | AAA    |
| `accent` on `bg` (links)       | **8.38:1**  | 4.5:1       | AAA    |
| `accent` on `bg-subtle`        | **7.53:1**  | 4.5:1       | AAA    |
| `on-accent` on `accent`        | **7.69:1**  | 4.5:1       | AAA    |
| `on-accent` on `accent-hover`  | **10.37:1** | 4.5:1       | AAA    |
| `border-strong` on `bg`        | **3.31:1**  | 3:1         | Pass   |
| `focus` on `bg`                | **8.38:1**  | 3:1         | Pass   |
| `success` on `bg-subtle`       | **8.23:1**  | 4.5:1       | AAA    |
| `error` on `bg-subtle`         | **6.78:1**  | 4.5:1       | AA     |
| `warn` on `bg-subtle`          | **8.58:1**  | 4.5:1       | AAA    |

Rules of use:

- `--hc-accent-tint` and `--hc-border` are decorative; never use them for
  text or for meaning on their own.
- Color never carries meaning alone (WCAG 1.4.1): pair semantic colors with
  an icon or text ("Export failed", a check mark, etc.).
- Disabled controls keep their shape and label at reduced opacity (0.5);
  disabled text is exempt from contrast requirements but must still be
  identifiable as a control.

## 3. Typography

No bundled fonts (runtime principle: no remote or bundled font payloads —
system stacks render instantly and match the OS).

```css
:root {
  --hc-font-sans:
    system-ui, -apple-system, 'Segoe UI', Roboto, Ubuntu, Cantarell,
    'Helvetica Neue', Arial, sans-serif;
  --hc-font-mono:
    ui-monospace, 'SF Mono', Menlo, Consolas, 'Liberation Mono', monospace;
}
```

Type scale — deliberately small, for a ~360 px-wide popup:

| Token            | Size / line-height | Weight | Use                              |
| ---------------- | ------------------ | ------ | -------------------------------- |
| `--hc-text-lg`   | 16 px / 24 px      | 600    | Popup title, section headings    |
| `--hc-text-md`   | 14 px / 20 px      | 400    | Body, controls, option labels    |
| `--hc-text-sm`   | 12 px / 16 px      | 400    | Helper text, captions, disclaimer|
| `--hc-text-mono` | 12 px / 16 px      | 400    | Filenames, counts                |

- Base is 14 px; never below 12 px.
- Use `rem` in stylesheets so browser font-size settings scale the UI
  (WCAG 1.4.4); the popup must survive 200 % zoom without loss.
- Weights: 400 and 600 only. No italics in UI chrome.

## 4. Spacing, radii, elevation

4 px base grid:

```css
:root {
  --hc-space-1: 4px;
  --hc-space-2: 8px;
  --hc-space-3: 12px;
  --hc-space-4: 16px;
  --hc-space-5: 24px;
  --hc-space-6: 32px;

  --hc-radius-sm: 4px; /* checkboxes, tags */
  --hc-radius-md: 8px; /* buttons, inputs, option cards */
  --hc-radius-lg: 12px; /* panels, banners */
}
```

Elevation: the popup is a single flat surface. Prefer `--hc-bg-subtle` wells
and hairline borders over drop shadows; if a shadow is unavoidable (menus),
keep it to `0 2px 8px rgb(0 0 0 / 0.15)`.

## 5. Focus

Focus must always be visible (WCAG 2.4.7 / 2.4.11); never `outline: none`
without an equal-or-better replacement.

```css
:focus-visible {
  outline: 2px solid var(--hc-focus);
  outline-offset: 2px;
  border-radius: inherit;
}
```

- `--hc-focus` is ≥ 3:1 against both themes' backgrounds (7.95:1 light,
  8.38:1 dark), and the 2 px offset keeps a gap so the ring stays visible on
  accent-filled buttons too.
- Focus order follows the visual order; the first focusable element in the
  popup is the primary action or the first option, never a dismiss button.

## 6. Motion

Motion is functional, brief, and optional:

- Durations 120–200 ms, `ease-out`. Nothing loops except progress
  indicators.
- Animate `opacity` and `transform` only.
- Everything animated sits behind the media query — reduced motion is a
  hard requirement, not best-effort:

```css
@media (prefers-reduced-motion: reduce) {
  *,
  *::before,
  *::after {
    animation-duration: 0.01ms !important;
    animation-iteration-count: 1 !important;
    transition-duration: 0.01ms !important;
  }
}
```

Progress under reduced motion switches from an animated bar to a static
percentage/step count that updates in place (announced via
`aria-live="polite"`).

## 7. Components (popup)

Notes for the future popup and options page; all controls are native
elements styled with the tokens, never divs with click handlers.

**Buttons.** Primary: `--hc-accent` fill, `--hc-on-accent` text,
`--hc-radius-md`, min target 32 px tall (44 px on touch). Hover →
`--hc-accent-hover`. Secondary: transparent fill, `--hc-border-strong`
1.5 px border, `--hc-text` label. One primary action per view ("Export").

**Radio / checkbox options** (format picker, "include thinking blocks"
toggles). Native inputs sized 16 px, accent-colored via `accent-color:
var(--hc-accent)`. The whole labelled row is the hit target
(`--hc-space-2` padding, `--hc-radius-md`, hover `--hc-bg-subtle`).
Selection state must not rely on color alone — the native glyph (dot/check)
carries it.

**Progress states.** Export runs in three visible phases: *fetching* →
*converting* → *saved*. Use a determinate bar (`--hc-accent` on
`--hc-bg-subtle`) when the total is known, plus a text label
("Converting — 3 of 5 sections"). The label lives in an `aria-live="polite"`
region; completion and failure also update it ("Saved to Downloads",
"Export failed — try again"). Failure uses `--hc-error` + icon + text.

**Banners.** `--hc-*-bg` fill, `--hc-*` text and icon, `--hc-radius-lg`,
never auto-dismiss errors.

**Disclaimer placement.** The canonical sentence from ADR 0004 appears,
verbatim: (a) at the bottom of the options page in `--hc-text-sm` /
`--hc-text-secondary` (which still meets AA); (b) in every store listing
description, first paragraph after the summary; (c) in the popup footer if
space allows, else linked from "About". It is never shortened or
paraphrased.

## 8. Icon

Masters live in `assets/design/` (see [README](README.md) for regeneration):

- `icon.svg` — the full mark: teal tile (`#0a5b55`, 28/128 corner radius),
  white page with a top-right dog-ear (flap in `#9bd4cc`) and a bottom-left
  speech-bubble tail, two teal text lines.
- `icon-16.svg` — simplified for the 16 px raster: larger page, bigger fold
  and tail, no text lines (they blur below ~24 px).

Rules: the tile always ships with the mark (it guarantees legibility on any
toolbar theme); no text in the mark; don't recolor it per theme; any shape
change is made in the SVGs and re-rastered — never edit the PNGs. The mark
is original artwork; nothing in it may echo Anthropic's starburst or
palette.

## 9. Voice & tone

Calm, precise, unhurried — the product is a filing cabinet, not a hype
machine.

- No exclamation marks. Ever. "Saved to Downloads", not "Done!".
- Verbs first on actions: "Export", "Copy", "Choose formats".
- State facts, not feelings: "Export failed — claude.ai didn't respond",
  not "Oops, something went wrong".
- Say where things went and what happens next; never blame the user.
- Sentence case everywhere, including buttons and headings.
- "Claude" appears only as a nominative descriptor per ADR 0004, and the
  non-affiliation disclaimer is copied verbatim, never paraphrased.
