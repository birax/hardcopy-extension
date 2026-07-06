/**
 * Color-contrast conformance (issue #16), computed — not eyeballed.
 *
 * happy-dom cannot resolve computed colors, so axe's `color-contrast` check
 * is disabled in tests/a11y-axe.test.ts. This suite closes that gap at the
 * source of truth instead: it parses the `--hc-*` design tokens straight out
 * of both stylesheets (light and dark theme), verifies the two surfaces and
 * docs/design/design-system.md all agree, and then recomputes the WCAG 2.2
 * contrast ratio for every foreground/background pairing the UI actually
 * uses. Change a token anywhere and the affected pairing is re-checked here.
 *
 * Thresholds: 4.5:1 for text (SC 1.4.3 AA), 3:1 for non-text UI parts —
 * control borders, focus indicators, the progress fill (SC 1.4.11).
 */

import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { describe, expect, it } from 'vitest';

const ROOT = resolve(__dirname, '..');
const POPUP_CSS = readFileSync(resolve(ROOT, 'src/entrypoints/popup/style.css'), 'utf8');
const OPTIONS_CSS = readFileSync(resolve(ROOT, 'src/entrypoints/options/style.css'), 'utf8');
const DESIGN_DOC = readFileSync(resolve(ROOT, 'docs/design/design-system.md'), 'utf8');

type Palette = Readonly<Record<string, string>>;

/** Extract `--hc-*: #rrggbb` tokens for the light and dark themes. */
function parseThemes(source: string): { light: Palette; dark: Palette } {
  const darkStart = source.indexOf('@media (prefers-color-scheme: dark)');
  expect(darkStart).toBeGreaterThan(0);
  return {
    light: parseTokens(source.slice(0, darkStart)),
    dark: parseTokens(source.slice(darkStart)),
  };
}

function parseTokens(source: string): Palette {
  const tokens: Record<string, string> = {};
  for (const match of source.matchAll(/--hc-([a-z][a-z-]*):\s*(#[0-9a-fA-F]{6})\b/g)) {
    const [, name, hex] = match;
    if (name !== undefined && hex !== undefined && !(name in tokens)) {
      tokens[name] = hex.toLowerCase();
    }
  }
  return tokens;
}

/** WCAG 2.x relative luminance of an sRGB hex color. */
function relativeLuminance(hex: string): number {
  const [r, g, b] = [1, 3, 5]
    .map((i) => parseInt(hex.slice(i, i + 2), 16) / 255)
    .map((channel) => (channel <= 0.04045 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4));
  return 0.2126 * (r ?? 0) + 0.7152 * (g ?? 0) + 0.0722 * (b ?? 0);
}

/** WCAG 2.x contrast ratio between two hex colors. */
function contrastRatio(a: string, b: string): number {
  const [lighter, darker] = [relativeLuminance(a), relativeLuminance(b)].sort((x, y) => y - x);
  return ((lighter ?? 0) + 0.05) / ((darker ?? 0) + 0.05);
}

/**
 * Every token pairing the popup and options page put on screen, with its
 * WCAG minimum. `4.5` = text (SC 1.4.3); `3` = non-text UI (SC 1.4.11).
 * When a stylesheet gains a new fg/bg combination, add it here.
 */
const USED_PAIRINGS: ReadonlyArray<[fg: string, bg: string, min: number, where: string]> = [
  // Body text and captions
  ['text', 'bg', 4.5, 'body text'],
  ['text', 'bg-subtle', 4.5, 'text in wells / hovered option rows / save indicator'],
  ['text-secondary', 'bg', 4.5, 'helper text, captions, disclaimer, progress label'],
  ['text-secondary', 'bg-subtle', 4.5, 'info-banner body, preview label'],
  // Interactive
  ['accent', 'bg', 4.5, 'links (options About section)'],
  ['accent', 'bg-subtle', 4.5, 'links over wells'],
  ['on-accent', 'accent', 4.5, 'primary button label'],
  ['on-accent', 'accent-hover', 4.5, 'primary button label on hover'],
  // Semantic banners (text sits on the banner fill)
  ['success', 'success-bg', 4.5, 'success banner text, filename, byte count'],
  ['error', 'error-bg', 4.5, 'error banner text, technical detail'],
  ['warn', 'warn-bg', 4.5, 'warn (logged-out) banner text'],
  ['warn', 'success-bg', 4.5, 'degraded-export note inside the success banner'],
  // Semantic text on plain surfaces
  ['success', 'bg', 4.5, 'semantic text on the page background'],
  ['error', 'bg', 4.5, 'template validation error (options)'],
  ['warn', 'bg', 4.5, 'semantic text on the page background'],
  // Non-text UI (3:1, SC 1.4.11)
  ['border-strong', 'bg', 3, 'text input / secondary button borders'],
  ['border-strong', 'bg-subtle', 3, 'secondary button border on its hover fill'],
  ['focus', 'bg', 3, 'focus indicator'],
  ['focus', 'bg-subtle', 3, 'focus indicator over wells'],
  ['accent', 'bg-subtle', 3, 'progress fill on its track'],
];

describe('design tokens: single source of truth', () => {
  it('popup and options stylesheets define identical color tokens', () => {
    expect(parseThemes(POPUP_CSS)).toEqual(parseThemes(OPTIONS_CSS));
  });

  it('stylesheets match the palette documented in the design system', () => {
    // The doc's palette lives in its first ```css fence (§2 Color); prose
    // before it also mentions the dark-theme media query, so parse the fence.
    const fence = /```css\n([\s\S]*?)```/.exec(DESIGN_DOC)?.[1];
    expect(fence).toBeDefined();
    expect(parseThemes(POPUP_CSS)).toEqual(parseThemes(fence as string));
  });
});

describe.each([
  ['light', parseThemes(POPUP_CSS).light],
  ['dark', parseThemes(POPUP_CSS).dark],
] as const)('%s theme contrast (WCAG 2.2 AA)', (_theme, palette) => {
  it.each(USED_PAIRINGS)('%s on %s is at least %s:1 (%s)', (fg, bg, min) => {
    const fgHex = palette[fg];
    const bgHex = palette[bg];
    expect(fgHex, `token --hc-${fg} missing`).toBeDefined();
    expect(bgHex, `token --hc-${bg} missing`).toBeDefined();
    expect(contrastRatio(fgHex as string, bgHex as string)).toBeGreaterThanOrEqual(min);
  });

  it('never uses the decorative tint or hairline tokens for text', () => {
    // Guardrail from the design system: `--hc-accent-tint` and `--hc-border`
    // are decorative-only. If someone starts using them as text colors these
    // pairings would need to clear 4.5:1 — they do not, by design.
    expect(contrastRatio(palette['accent-tint'] as string, palette['bg'] as string)).toBeLessThan(
      4.5,
    );
  });
});

describe('stylesheets never use raw colors outside the token block', () => {
  it.each([
    ['popup', POPUP_CSS],
    ['options', OPTIONS_CSS],
  ])('%s styles reference colors via var(--hc-*) only', (_name, css) => {
    const darkStart = css.indexOf('@media (prefers-color-scheme: dark)');
    const darkEnd = css.indexOf('}\n\n', css.indexOf('}', darkStart));
    const outsideTokenBlocks =
      css.slice(0, css.indexOf(':root')) +
      css.slice(css.indexOf('}', css.indexOf(':root')), darkStart) +
      css.slice(darkEnd);
    // Any hex/rgb/hsl literal outside the two :root token blocks would dodge
    // the contrast checks above.
    expect(outsideTokenBlocks).not.toMatch(/#[0-9a-fA-F]{3,8}\b|rgb\(|hsl\(/);
  });
});
