# Accessibility

Hardcopy targets **WCAG 2.2 Level AA** across everything it puts on screen.
This page records what that claim covers, how it was verified, what has *not*
been verified yet, and what keeps it true as the code changes.

## Conformance statement

- **Standard:** [WCAG 2.2](https://www.w3.org/TR/WCAG22/), Level AA (Level A
  included). Several text pairings additionally meet AAA contrast — see the
  computed tables in [design-system.md](design/design-system.md#contrast-computed-wcag-22).
- **Scope:** the popup (`src/entrypoints/popup/`, `src/lib/popup/`) in every
  state its state machine can reach, and the options page
  (`src/entrypoints/options/`, `src/lib/options/`). Hardcopy injects **no
  in-page UI** into claude.ai — the content script's only DOM touch is a
  transient, invisible download anchor — so there is no third surface to
  audit.
- **Status:** all automated and code-level checks pass with no open findings.
  A live screen-reader pass is still outstanding (see
  [Known limitations](#known-limitations)); until it is done this is a
  *design-and-code* conformance claim, not a fully user-tested one.

## How it was verified

Three complementary methods, each covering the others' blind spots:

1. **Automated axe-core audit** (`tests/a11y-axe.test.ts`). Every reachable
   UI state of both surfaces — all twelve popup states including expanded
   disclosures, and the options page fresh, restored, mid-validation-error,
   and mid-save — is rendered under happy-dom and run through
   [axe-core](https://github.com/dequelabs/axe-core) with the WCAG A/AA rule
   tags. Any violation fails `pnpm test`, and so does any rule axe reports as
   *incomplete* (undecidable), beyond the two knowingly excluded below.
2. **Computed contrast conformance** (`tests/a11y-contrast.test.ts`). The
   `--hc-*` color tokens are parsed out of both stylesheets (light and dark
   theme), cross-checked against each other and against the design-system
   doc, and every foreground/background pairing the UI actually uses is
   recomputed with the WCAG relative-luminance formula: ≥ 4.5:1 for text,
   ≥ 3:1 for non-text UI (borders, focus ring, progress fill). A companion
   check rejects any color literal outside the token blocks, so no color can
   dodge the audit.
3. **Manual code audit** (`tests/a11y-keyboard.test.ts` pins the mechanical
   parts). Checked by hand against WCAG 2.2, on top of the checks the popup
   and options work already carried (fieldset/legend grouping, `aria-live`
   status regions, focus-visible rings, reduced motion, 200 % zoom reflow):
   - **2.1.1/2.1.2 Keyboard, no traps** — native controls only, no key-event
     handlers anywhere (a source tripwire keeps it that way).
   - **2.4.3 Focus order** — tab order asserted equal to visual order on both
     surfaces; no positive `tabindex`, no CSS visual reordering.
   - **2.4.7 / 2.4.11 Focus visible, not obscured** — 2 px offset ring
     (≥ 7.9:1 light, ≥ 8.3:1 dark); nothing sticky overlaps focus targets
     (the options page's transient "Saved" toast is small, corner-anchored,
     and never receives or covers focus entirely).
   - **2.5.7 Dragging** — n/a, no draggable interactions.
   - **2.5.8 Target size (minimum)** — every control is ≥ 24 CSS px tall:
     option rows are 32 px labelled hit targets, buttons ≥ 32 px, disclosure
     summaries and the About links are padded to 24 px (fixed in this audit).
   - **3.2.6 Consistent help** — n/a, no help mechanism yet.
   - **3.3.7 Redundant entry** — every setting persists (`storage.local`) and
     round-trips; the popup and options page share the same keys, so nothing
     is ever asked twice.
   - **4.1.3 Status messages** — all announcements (`role="status"`,
     `aria-live="polite"`) are polite, never interrupt, and live in permanent
     regions whose *text* changes (toggling `hidden` on a live region is
     unreliable — the template-error region was reworked to this pattern in
     this audit).

### Findings fixed by this audit

| Finding | SC | Fix |
| ------- | -- | --- |
| Options template validation error toggled `hidden`, so screen readers never announced it | 4.1.3 | `#template-error` is now a permanent polite live region; text is set/cleared |
| Popup disclosure `<summary>` targets were 16 px tall | 2.5.8 | Padded to 24 px |
| Options About links were 20 px-tall standalone targets (the "inline" exception does not apply to a link list) | 2.5.8 | Padded to ≥ 24 px |
| Animated progress bar was exposed to assistive tech alongside its text label | 1.1.1/4.1.2 (robustness) | Track marked `aria-hidden`; the label and live region carry the state |
| Dark-theme `--hc-border-strong` on `--hc-bg-subtle` (secondary-button border on its hover fill) was 2.97:1 | 1.4.11 | Token lightened `#56706c` → `#5b7671` (3.23:1 on `bg-subtle`, 3.60:1 on `bg`) |

Everything else from the earlier popup/options passes held up under axe and
the code audit: zero structural ARIA violations in any state.

## Known limitations

- **No live screen-reader pass yet.** axe and code review cannot hear what a
  screen reader actually says. Before the first store submission, run the
  manual walkthroughs below and record the results here (issue #16's
  acceptance criteria call for VoiceOver and NVDA).
- **happy-dom has no layout engine**, so two axe rules cannot run in unit
  tests and are explicitly disabled there: `color-contrast` (covered instead
  by the computed token checks in `tests/a11y-contrast.test.ts`) and
  `target-size` (covered by the design-system CSS rules and the code audit
  above). If an end-to-end browser harness lands in `e2e/`, running axe there
  with both rules enabled is the natural upgrade.
- **`lang` is static.** Both HTML shells declare `lang="en"`, which is
  accurate while `en` is the only shipped locale. When a second locale lands
  (docs/CONTRIBUTING.md), the entrypoints must set `document.documentElement.lang`
  to the locale the i18n layer actually resolved, or 3.1.1 breaks silently.
- **High-contrast / forced-colors:** the stylesheets honor
  `prefers-contrast: more` and use system form controls (which pick up
  `forced-colors` automatically), but a visual pass in Windows High Contrast
  Mode has not been done and should join the pre-submission checklist.

### Pre-submission screen-reader script

Run once with **VoiceOver + Safari (macOS)** and once with **NVDA + Firefox
(Windows)**, popup and options page both:

1. Open the popup on a claude.ai conversation. Confirm the title, the
   conversation name, and each group label ("Format", "Include", "Branches")
   are announced as you Tab/arrow through; radios report position ("2 of 5")
   and state.
2. Press the export button. Confirm "Exporting…" is announced *without*
   focus moving, then the saved-filename announcement (or the failure
   message) arrives on completion — politely, not interrupting speech.
3. Trigger a failure (e.g. drop the network). Confirm the error banner text
   is announced and the "Technical detail" disclosure reads as
   collapsed/expanded correctly.
4. Open the popup on a non-claude.ai tab and while logged out. Confirm each
   explainer banner is read.
5. On the options page: edit the filename template to something invalid.
   Confirm the validation message is announced while focus stays in the
   input, and `aria-invalid` is reported. Fix it; confirm "Saved" is
   announced.
6. Activate "Reset all settings" and confirm the confirm dialog and the
   completion announcement are both spoken.
7. At 200 % zoom, repeat step 1 and confirm nothing is clipped or skipped.

## Keeping it green

- `pnpm test` runs the whole audit: axe on every UI state
  (`tests/a11y-axe.test.ts`), computed contrast + token sync
  (`tests/a11y-contrast.test.ts`), and focus-order/keyboard heuristics
  (`tests/a11y-keyboard.test.ts`). CI fails on any regression.
- **Adding UI?** Render the new state in `tests/a11y-axe.test.ts` (the suite
  is table-driven — one line per state). New fg/bg color combination? Add the
  pairing to `USED_PAIRINGS` in `tests/a11y-contrast.test.ts` *and* to the
  contrast tables in [design-system.md](design/design-system.md).
- **Changing a color token?** Change it in both stylesheets and the design
  system doc — the token-sync test fails if they disagree, and the ratio
  tests fail if the new value doesn't clear its thresholds.
- **New interactive control?** Keep it a native element, ≥ 24 px tall, inside
  a labelled group; extend the tab-order assertion in
  `tests/a11y-keyboard.test.ts` — it fails loudly on any new focusable it
  doesn't know about.
- Status messages stay `aria-live="polite"` / `role="status"`, in permanent
  regions whose text changes. Never toggle `hidden` on a live region, and
  never use `role="alert"` for routine progress.
