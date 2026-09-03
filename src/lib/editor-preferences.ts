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
const DEFAULT_THEME: EditorThemeId = "oddenova-dark";

export { DEFAULT_FONT_SIZE, DEFAULT_FONT_FAMILY, DEFAULT_THEME };

// ── Theme ────────────────────────────────────────────────────────────────────

/**
 * Whether an id is one of oddeNova's own two palettes rather than a
 * third-party theme.
 *
 * They are the product default expressed per colour scheme, not a standing
 * choice — which of the two is right is a function of the app theme — so a
 * stored one is never worth restoring, and reading one back as a choice is
 * actively wrong: it outranks the app theme, and because the palette is
 * otherwise only re-derived on an actual dark/light flip, no reload repairs
 * it.
 *
 * Which matters because builds before the light palette existed wrote
 * `oddenova-dark` back on *every* boot: `loadEditorPreferences()` handed the
 * resolved fallback to a `setEditorTheme()` that persisted whatever it was
 * given, so the key was always truthy and always saved. Practically every
 * browser that has opened the app is carrying one, and on paper it is what
 * pins the code panel dark. Dropping it here heals those stores on the next
 * load.
 */
function isAppPalette(theme: EditorThemeId): boolean {
  return theme === appEditorTheme('dark') || theme === appEditorTheme('light');
}

export function getEditorTheme(): EditorThemeId | null {
  if (typeof window === "undefined") return null;
  const stored = localStorage.getItem(STORAGE_KEYS.theme);
  if (stored && stored in EDITOR_THEME_VARS && !isAppPalette(stored as EditorThemeId)) {
    return stored as EditorThemeId;
  }
  if (stored) localStorage.removeItem(STORAGE_KEYS.theme);
  return null;
}

export function setEditorTheme(theme: EditorThemeId | null, save = true): void {
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
  --gutterBorder: ${vars.gutterBorder} !important;
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

  if (theme && save) {
    localStorage.setItem(STORAGE_KEYS.theme, theme);
  } else if (save) {
    localStorage.removeItem(STORAGE_KEYS.theme);
  }
}

/** The oddeNova editor palette belonging to an application colour scheme. */
function appEditorTheme(theme: 'dark' | 'light'): EditorThemeId {
  return theme === 'light' ? 'oddenova-light' : 'oddenova-dark';
}

/**
 * Re-establish the oddeNova editor palette when the application changes colour
 * scheme. Deliberately not persisted: a user can still pick a third-party
 * editor theme afterwards, and the next app-theme change is what returns the
 * editor to the matching product default.
 */
export function applyAppEditorTheme(theme: 'dark' | 'light'): void {
  setEditorTheme(appEditorTheme(theme), false);
}

/**
 * The palette to open in when the user has never chosen one — read off the
 * theme already painted on the root, so a light system opens on paper rather
 * than opening dark and flipping.
 */
function defaultEditorTheme(): EditorThemeId {
  if (typeof document === 'undefined') return DEFAULT_THEME;
  return appEditorTheme(document.documentElement.dataset.theme === 'light' ? 'light' : 'dark');
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

/**
 * Apply all saved preferences on app startup. Nothing is written back: the
 * fallback is a default rather than a choice, and storing it would make the
 * two indistinguishable on the next load.
 *
 * Runs after `loadAppearancePreferences()`, which is what puts the app theme
 * the fallback reads on the root.
 */
export function loadEditorPreferences(): void {
  const theme = getEditorTheme();
  setEditorTheme(theme ?? defaultEditorTheme(), false);

  const fontFamily = getFontFamily();
  if (fontFamily) setEditorFontFamily(fontFamily, false);

  const fontSize = getFontSize();
  if (fontSize) setEditorFontSize(fontSize, false);
}
