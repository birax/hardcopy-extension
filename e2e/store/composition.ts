/**
 * HTML compositions for the store listing screenshots (issue #20).
 *
 * Each function returns a full 1280×800 page that the store-screenshot spec
 * (e2e/store-screenshots.store.ts) renders in the same Chromium the E2E
 * suite uses, then downscales from the 2× capture to exactly 1280×800.
 *
 * Design rules (docs/design/design-system.md + ADR 0004):
 * - Brand palette only — teal/ink; nothing may echo Anthropic's identity.
 * - The chat backdrop is a *suggestion* of a chat page (neutral window
 *   chrome, plain bubbles), not a replica of claude.ai's UI.
 * - All visible conversation text comes from the synthetic garden-planning
 *   fixture (tests/fixtures/simple-text.json) — never real user data.
 * - Captions: sentence case, no exclamation marks, one benefit each.
 */

/** Store screenshot canvas, the CWS/AMO-preferred size. */
export const SHOT_WIDTH = 1280;
export const SHOT_HEIGHT = 800;

export type ThemeName = 'light' | 'dark';

/** Palette per theme — values from docs/design/design-system.md. */
const THEMES = {
  light: {
    stageFrom: '#f7fbfa',
    stageTo: '#e3edeb',
    surface: '#ffffff',
    subtle: '#f2f7f6',
    text: '#17252b',
    textSecondary: '#42555c',
    border: '#c6d4d2',
    bubble: '#e7f1ef',
    shadow: 'rgba(23, 37, 43, 0.22)',
    accent: '#0a5b55',
  },
  dark: {
    stageFrom: '#162327',
    stageTo: '#0b1315',
    surface: '#182428',
    subtle: '#101a1d',
    text: '#e7eeec',
    textSecondary: '#a6bab8',
    border: '#263a3e',
    bubble: '#22343a',
    shadow: 'rgba(0, 0, 0, 0.55)',
    accent: '#53c4b7',
  },
} as const;

/** Escape text nodes for interpolation into the composition HTML. */
export function escapeHtml(text: string): string {
  return text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

/** The shared 1280×800 frame: teal caption band on top, scene below. */
function frame(theme: ThemeName, caption: string, sceneCss: string, sceneHtml: string): string {
  const t = THEMES[theme];
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<style>
  * { margin: 0; padding: 0; box-sizing: border-box; }
  html, body { width: ${SHOT_WIDTH}px; height: ${SHOT_HEIGHT}px; overflow: hidden; }
  body {
    font-family: system-ui, -apple-system, 'Segoe UI', Roboto, Ubuntu, Cantarell,
      'Helvetica Neue', Arial, sans-serif;
    -webkit-font-smoothing: antialiased;
  }
  .frame { width: ${SHOT_WIDTH}px; height: ${SHOT_HEIGHT}px; display: flex; flex-direction: column; }
  .caption {
    flex: none; height: 112px; background: #0a5b55;
    display: flex; align-items: center; justify-content: center; padding: 0 64px;
  }
  .caption p {
    color: #ffffff; font-size: 29px; font-weight: 600;
    letter-spacing: -0.015em; text-align: center;
  }
  .stage {
    position: relative; flex: 1; overflow: hidden;
    background: linear-gradient(155deg, ${t.stageFrom}, ${t.stageTo});
  }
${sceneCss}
</style>
</head>
<body>
  <div class="frame">
    <div class="caption"><p>${escapeHtml(caption)}</p></div>
    <div class="stage">
${sceneHtml}
    </div>
  </div>
</body>
</html>`;
}

/**
 * Scene A/B/E — the popup floating over a neutral, stylised chat page.
 * `popupDataUri` is a 2× PNG capture of the popup body, shown at 360 CSS px
 * (its native layout width), so its pixels map 1:1 onto the 2× render.
 */
export function popupOverChatScene(options: {
  theme: ThemeName;
  caption: string;
  popupDataUri: string;
  conversationTitle: string;
  /** Displayed popup width in CSS px; shrink when the popup state is tall. */
  popupWidth?: number;
  /** Popup offset from the top of the stage in CSS px. */
  popupTop?: number;
}): string {
  const t = THEMES[options.theme];
  const popupWidth = options.popupWidth ?? 360;
  const popupTop = options.popupTop ?? 40;
  const css = `
  .window {
    position: absolute; left: 56px; top: 52px; width: 900px; height: 700px;
    background: ${t.surface}; border: 1px solid ${t.border}; border-radius: 14px;
    box-shadow: 0 24px 60px ${t.shadow}; overflow: hidden;
  }
  .chrome {
    height: 44px; display: flex; align-items: center; gap: 8px; padding: 0 16px;
    background: ${t.subtle}; border-bottom: 1px solid ${t.border};
  }
  .dot { width: 11px; height: 11px; border-radius: 50%; background: ${t.border}; }
  .urlbar {
    margin-left: 12px; background: ${t.surface}; border: 1px solid ${t.border};
    color: ${t.textSecondary}; font-size: 13px; border-radius: 999px; padding: 5px 18px;
  }
  .page { display: flex; height: calc(100% - 44px); }
  .sidebar {
    width: 188px; flex: none; background: ${t.subtle};
    border-right: 1px solid ${t.border}; padding: 22px 16px;
    display: flex; flex-direction: column; gap: 16px;
  }
  .side-line { height: 10px; border-radius: 5px; background: ${t.border}; opacity: 0.75; }
  .chat { flex: 1; padding: 30px 38px; color: ${t.text}; }
  .chat h1 { font-size: 19px; font-weight: 600; letter-spacing: -0.01em; }
  .msg-user {
    margin: 26px 0 22px auto; max-width: 72%; width: fit-content;
    background: ${t.bubble}; color: ${t.text};
    padding: 13px 18px; border-radius: 14px; font-size: 14.5px; line-height: 1.5;
  }
  .msg-assistant { max-width: 94%; font-size: 14.5px; line-height: 1.6; color: ${t.text}; }
  .msg-assistant p { margin-bottom: 14px; }
  .msg-assistant table { border-collapse: collapse; font-size: 13.5px; margin-bottom: 14px; }
  .msg-assistant th, .msg-assistant td {
    border: 1px solid ${t.border}; padding: 6px 14px; text-align: left;
  }
  .msg-assistant th { background: ${t.subtle}; font-weight: 600; }
  .popup {
    position: absolute; right: 56px; top: ${popupTop}px; width: ${popupWidth}px;
    border-radius: 12px; border: 1px solid ${t.border};
    box-shadow: 0 30px 70px ${t.shadow};
  }`;
  const html = `
      <div class="window">
        <div class="chrome">
          <span class="dot"></span><span class="dot"></span><span class="dot"></span>
          <span class="urlbar">claude.ai</span>
        </div>
        <div class="page">
          <aside class="sidebar">
            <div class="side-line" style="width: 72%"></div>
            <div class="side-line" style="width: 88%"></div>
            <div class="side-line" style="width: 60%"></div>
            <div class="side-line" style="width: 80%"></div>
            <div class="side-line" style="width: 52%"></div>
          </aside>
          <main class="chat">
            <h1>${escapeHtml(options.conversationTitle)}</h1>
            <div class="msg-user">
              What vegetables grow well in partial shade? I have a north-facing bed
              that only gets about four hours of sun.
            </div>
            <div class="msg-assistant">
              <p>
                Four hours of sun is enough for plenty of crops. Leafy greens and many
                root vegetables actually prefer some shade.
              </p>
              <table>
                <tr><th>Crop</th><th>Sun needed</th><th>Notes</th></tr>
                <tr><td>Lettuce</td><td>3–4 h</td><td>Bolts slower in shade</td></tr>
                <tr><td>Spinach</td><td>3–4 h</td><td>Sow early spring</td></tr>
                <tr><td>Radishes</td><td>4 h</td><td>Ready in ~30 days</td></tr>
                <tr><td>Chard</td><td>4 h</td><td>Cut-and-come-again</td></tr>
              </table>
              <p>Avoid fruiting crops (tomatoes, peppers, squash) — they need 6–8 hours.</p>
            </div>
          </main>
        </div>
      </div>
      <img class="popup" src="${options.popupDataUri}" alt="">`;
  return frame(options.theme, options.caption, css, html);
}

/**
 * Scene C — the options page inside a neutral browser window.
 * `optionsDataUri` is a 2× viewport capture shown at `width` CSS px.
 */
export function optionsScene(options: {
  caption: string;
  optionsDataUri: string;
  width: number;
}): string {
  const t = THEMES.light;
  const css = `
  .window {
    position: absolute; left: 50%; top: 26px; transform: translateX(-50%);
    width: ${options.width}px;
    background: ${t.surface}; border: 1px solid ${t.border}; border-radius: 14px;
    box-shadow: 0 24px 60px ${t.shadow}; overflow: hidden;
  }
  .chrome {
    height: 44px; display: flex; align-items: center; gap: 8px; padding: 0 16px;
    background: ${t.subtle}; border-bottom: 1px solid ${t.border};
  }
  .dot { width: 11px; height: 11px; border-radius: 50%; background: ${t.border}; }
  .urlbar {
    margin-left: 12px; background: ${t.surface}; border: 1px solid ${t.border};
    color: ${t.textSecondary}; font-size: 13px; border-radius: 999px; padding: 5px 18px;
  }
  .window img { display: block; width: 100%; }`;
  const html = `
      <div class="window">
        <div class="chrome">
          <span class="dot"></span><span class="dot"></span><span class="dot"></span>
          <span class="urlbar">Hardcopy settings</span>
        </div>
        <img src="${options.optionsDataUri}" alt="">
      </div>`;
  return frame('light', options.caption, css, html);
}

/**
 * Scene D — the exported Markdown file as a document sheet: the header shows
 * the real suggested filename, the body the real serializer output.
 */
export function documentScene(options: {
  caption: string;
  filename: string;
  markdown: string;
}): string {
  const t = THEMES.light;
  const css = `
  .sheet-back {
    position: absolute; left: 50%; top: 74px; transform: translateX(-50%) rotate(-1.2deg);
    width: 840px; height: 660px; background: ${t.subtle};
    border: 1px solid ${t.border}; border-radius: 14px;
  }
  .sheet {
    position: absolute; left: 50%; top: 54px; transform: translateX(-50%);
    width: 840px; height: 700px; background: ${t.surface};
    border: 1px solid ${t.border}; border-radius: 14px;
    box-shadow: 0 24px 60px ${t.shadow}; overflow: hidden;
  }
  .sheet-head {
    display: flex; align-items: center; gap: 12px; height: 54px; padding: 0 26px;
    background: ${t.subtle}; border-bottom: 1px solid ${t.border};
  }
  .filename {
    font-family: ui-monospace, 'SF Mono', Menlo, Consolas, 'Liberation Mono', monospace;
    font-size: 14px; color: ${t.text};
  }
  .badge {
    margin-left: auto; background: ${t.accent}; color: #ffffff;
    font-size: 12px; font-weight: 600; letter-spacing: 0.04em;
    padding: 5px 14px; border-radius: 999px;
  }
  .sheet pre {
    padding: 26px 30px; white-space: pre-wrap; word-break: break-word;
    font-family: ui-monospace, 'SF Mono', Menlo, Consolas, 'Liberation Mono', monospace;
    font-size: 13px; line-height: 1.6; color: ${t.text};
  }`;
  const html = `
      <div class="sheet-back"></div>
      <div class="sheet">
        <div class="sheet-head">
          <span class="filename">${escapeHtml(options.filename)}</span>
          <span class="badge">MARKDOWN</span>
        </div>
        <pre>${escapeHtml(options.markdown)}</pre>
      </div>`;
  return frame('light', options.caption, css, html);
}
