import {
  EDITOR_THEME_STORAGE_KEY,
  EDITOR_THEME_VARS,
  type EditorThemeId,
} from "./editor-theme";

const STORAGE_KEYS = {
  theme: EDITOR_THEME_STORAGE_KEY,
  fontFamily: "vibe-editor-font-family",
  fontSize: "vibe-editor-font-size",
} as const;

const DEFAULT_FONT_SIZE = 14;
const DEFAULT_FONT_FAMILY = "monospace";
const DEFAULT_THEME: EditorThemeId = "vibe-dark";

export { DEFAULT_FONT_SIZE, DEFAULT_FONT_FAMILY, DEFAULT_THEME };

// ── Theme ────────────────────────────────────────────────────────────────────

export function getEditorTheme(): EditorThemeId | null {
  if (typeof window === "undefined") return null;
  return localStorage.getItem(STORAGE_KEYS.theme) as EditorThemeId | null;
}

export function setEditorTheme(theme: EditorThemeId | null): void {
  if (typeof window === "undefined") return;

  const resolved = theme ?? DEFAULT_THEME;
  document.documentElement.dataset.editorTheme = resolved;

  const vars = EDITOR_THEME_VARS[resolved];
  const styleId = "vibe-editor-theme";
  let el = document.getElementById(styleId) as HTMLStyleElement | null;
  if (!el) {
    el = document.createElement("style");
    el.id = styleId;
    document.head.appendChild(el);
  }

  el.innerHTML = `
.cm-editor {
  background-color: ${vars.background} !important;
  color: ${vars.foreground} !important;
  --background: ${vars.background} !important;
  --foreground: ${vars.foreground} !important;
  --caret: ${vars.caret} !important;
  --selection: ${vars.selection} !important;
  --lineHighlight: ${vars.lineHighlight} !important;
  --gutterBackground: ${vars.gutterBackground} !important;
  --gutterForeground: ${vars.gutterForeground} !important;
}
.cm-editor .cm-content { caret-color: ${vars.caret} !important; }
.cm-editor .cm-cursor { border-left-color: ${vars.caret} !important; }
.cm-editor .cm-selectionBackground,
.cm-editor.cm-focused .cm-selectionBackground { background-color: ${vars.selection} !important; }
.cm-editor .cm-activeLine { background-color: ${vars.lineHighlight} !important; }
.cm-editor .cm-gutters {
  background-color: ${vars.gutterBackground} !important;
  border-right-color: ${vars.gutterBorder} !important;
}
.cm-editor .cm-lineNumbers .cm-gutterElement { color: ${vars.gutterForeground} !important; }
`.trim();

  if (theme) {
    localStorage.setItem(STORAGE_KEYS.theme, theme);
  } else {
    localStorage.removeItem(STORAGE_KEYS.theme);
  }
}

// ── Font family ──────────────────────────────────────────────────────────────

const FONT_MAP: Record<string, string> = {
  monospace:
    "ui-monospace, SFMono-Regular, 'SF Mono', Menlo, Consolas, 'Liberation Mono', monospace",
  "Fira Code": "'Fira Code', monospace",
  "JetBrains Mono": "'JetBrains Mono', monospace",
  "Hack": "'Hack', monospace",
};

export function getFontFamily(): string | null {
  if (typeof window === "undefined") return null;
  return localStorage.getItem(STORAGE_KEYS.fontFamily);
}

export function setEditorFontFamily(
  fontFamily: string,
  save = true,
): void {
  if (typeof window === "undefined") return;

  const styleId = "vibe-editor-font-family";
  let el = document.getElementById(styleId) as HTMLStyleElement | null;
  if (!el) {
    el = document.createElement("style");
    el.id = styleId;
    document.head.appendChild(el);
  }

  const cssFont = FONT_MAP[fontFamily] ?? fontFamily;
  el.innerHTML = `.cm-editor .cm-content, .cm-editor .cm-gutters { font-family: ${cssFont} !important; }`;

  if (save) localStorage.setItem(STORAGE_KEYS.fontFamily, fontFamily);
}

// ── Font size ────────────────────────────────────────────────────────────────

export function getFontSize(): number | null {
  if (typeof window === "undefined") return null;
  const raw = localStorage.getItem(STORAGE_KEYS.fontSize);
  return raw ? parseInt(raw, 10) : null;
}

export function setEditorFontSize(size: number, save = true): void {
  if (typeof window === "undefined") return;

  const styleId = "vibe-editor-font-size";
  let el = document.getElementById(styleId) as HTMLStyleElement | null;
  if (!el) {
    el = document.createElement("style");
    el.id = styleId;
    document.head.appendChild(el);
  }

  el.innerHTML = `.cm-editor .cm-content, .cm-editor .cm-gutters { font-size: ${size}px !important; }`;

  if (save) localStorage.setItem(STORAGE_KEYS.fontSize, String(size));
}

// ── Bootstrap ────────────────────────────────────────────────────────────────

/** Apply all saved preferences on app startup */
export function loadEditorPreferences(): void {
  const theme = getEditorTheme();
  setEditorTheme(theme ?? DEFAULT_THEME);

  const fontFamily = getFontFamily();
  if (fontFamily) setEditorFontFamily(fontFamily, false);

  const fontSize = getFontSize();
  if (fontSize) setEditorFontSize(fontSize, false);
}
