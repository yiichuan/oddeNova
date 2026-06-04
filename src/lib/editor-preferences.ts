import {
  EDITOR_THEME_STORAGE_KEY,
  EDITOR_THEME_VARS,
  type EditorThemeId,
} from "./editor-theme";

// localStorage 存储键，统一管理编辑器偏好设置的持久化 key
const STORAGE_KEYS = {
  theme: EDITOR_THEME_STORAGE_KEY,
  fontFamily: "vibe-editor-font-family",
  fontSize: "vibe-editor-font-size",
} as const;

// 编辑器默认值
const DEFAULT_FONT_SIZE = 14;
const DEFAULT_FONT_FAMILY = "monospace";
const DEFAULT_THEME: EditorThemeId = "oddenova-dark";

export { DEFAULT_FONT_SIZE, DEFAULT_FONT_FAMILY, DEFAULT_THEME };

// ── 主题 ─────────────────────────────────────────────────────────────────────

/** 从 localStorage 读取已保存的主题 ID，若不存在或已失效则返回 null */
export function getEditorTheme(): EditorThemeId | null {
  if (typeof window === "undefined") return null;
  const stored = localStorage.getItem(STORAGE_KEYS.theme);
  // 验证存储值是否属于已知主题，防止使用已删除的旧主题
  if (stored && stored in EDITOR_THEME_VARS) return stored as EditorThemeId;
  if (stored) localStorage.removeItem(STORAGE_KEYS.theme);
  return null;
}

/**
 * 应用指定主题到编辑器。
 * 通过向 <head> 注入 <style> 标签覆盖 CodeMirror 的默认样式，
 * 并同步更新 document.documentElement.dataset.editorTheme 供 CSS 变量使用。
 * 传入 null 时使用默认主题，并清除 localStorage 中的存储值。
 */
export function setEditorTheme(theme: EditorThemeId | null): void {
  if (typeof window === "undefined") return;

  const resolved = theme ?? DEFAULT_THEME;
  // 同步 data 属性，供外部 CSS 根据主题做额外样式区分
  document.documentElement.dataset.editorTheme = resolved;

  const vars = EDITOR_THEME_VARS[resolved];
  const styleId = "vibe-editor-theme";
  // 复用已有的 <style> 标签，避免重复插入 DOM 节点
  let el = document.getElementById(styleId) as HTMLStyleElement | null;
  if (!el) {
    el = document.createElement("style");
    el.id = styleId;
    document.head.appendChild(el);
  }

  // 用 !important 确保覆盖 CodeMirror 内置样式
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

// ── 字体族 ───────────────────────────────────────────────────────────────────

// 将用户可选的字体名映射到完整的 CSS font-family 回退链
const FONT_MAP: Record<string, string> = {
  monospace:
    "ui-monospace, SFMono-Regular, 'SF Mono', Menlo, Consolas, 'Liberation Mono', monospace",
  "Fira Code": "'Fira Code', monospace",
  "JetBrains Mono": "'JetBrains Mono', monospace",
  "Hack": "'Hack', monospace",
};

/** 从 localStorage 读取已保存的字体族名称，未设置时返回 null */
export function getFontFamily(): string | null {
  if (typeof window === "undefined") return null;
  return localStorage.getItem(STORAGE_KEYS.fontFamily);
}

/**
 * 将指定字体族应用到编辑器内容区和行号槽。
 * @param fontFamily 字体族名称，支持 FONT_MAP 中的预设值或任意 CSS 字体名
 * @param save 是否将选择持久化到 localStorage，初始化恢复时传 false 避免重复写入
 */
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

  // 优先使用预设回退链，否则直接使用传入值
  const cssFont = FONT_MAP[fontFamily] ?? fontFamily;
  el.innerHTML = `.cm-editor .cm-content, .cm-editor .cm-gutters { font-family: ${cssFont} !important; }`;

  if (save) localStorage.setItem(STORAGE_KEYS.fontFamily, fontFamily);
}

// ── 字号 ─────────────────────────────────────────────────────────────────────

/** 从 localStorage 读取已保存的字号（px），未设置时返回 null */
export function getFontSize(): number | null {
  if (typeof window === "undefined") return null;
  const raw = localStorage.getItem(STORAGE_KEYS.fontSize);
  return raw ? parseInt(raw, 10) : null;
}

/**
 * 将指定字号应用到编辑器内容区和行号槽。
 * @param size 字号，单位 px
 * @param save 是否将选择持久化到 localStorage，初始化恢复时传 false 避免重复写入
 */
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

// ── 初始化 ───────────────────────────────────────────────────────────────────

/** 应用启动时从 localStorage 恢复并应用所有已保存的编辑器偏好设置 */
export function loadEditorPreferences(): void {
  const theme = getEditorTheme();
  setEditorTheme(theme ?? DEFAULT_THEME);

  const fontFamily = getFontFamily();
  if (fontFamily) setEditorFontFamily(fontFamily, false);

  const fontSize = getFontSize();
  if (fontSize) setEditorFontSize(fontSize, false);
}
