export const EDITOR_THEME_STORAGE_KEY = "vibe-editor-theme";

export const EDITOR_THEME_IDS = [
  "vibe-dark",
  "dracula",
  "tokyo-night",
  "nord",
  "github-light",
  "solarized-light",
] as const;

export type EditorThemeId = (typeof EDITOR_THEME_IDS)[number];

export const EDITOR_THEME_OPTIONS: {
  id: EditorThemeId;
  name: string;
  type: "dark" | "light";
}[] = [
  { id: "vibe-dark", name: "Vibe Dark", type: "dark" },
  { id: "dracula", name: "Dracula", type: "dark" },
  { id: "tokyo-night", name: "Tokyo Night", type: "dark" },
  { id: "nord", name: "Nord", type: "dark" },
  { id: "github-light", name: "GitHub Light", type: "light" },
  { id: "solarized-light", name: "Solarized Light", type: "light" },
];

/** CSS variable values injected per theme for .cm-editor overrides */
export const EDITOR_THEME_VARS: Record<
  EditorThemeId,
  {
    background: string;
    foreground: string;
    caret: string;
    selection: string;
    lineHighlight: string;
    gutterBackground: string;
    gutterForeground: string;
    gutterBorder: string;
  }
> = {
  "vibe-dark": {
    background: "#000000",
    foreground: "#e2e8f0",
    caret: "#91a3e0",
    selection: "rgba(172, 185, 225, 0.25)",
    lineHighlight: "rgba(108,92,231,0.08)",
    gutterBackground: "transparent",
    gutterForeground: "#898989",
    gutterBorder: "#323232",
  },
  dracula: {
    background: "#282a36",
    foreground: "#f8f8f2",
    caret: "#bd93f9",
    selection: "rgba(98,114,164,0.4)",
    lineHighlight: "rgba(68,71,90,0.5)",
    gutterBackground: "#21222c",
    gutterForeground: "#6272a4",
    gutterBorder: "#44475a",
  },
  "tokyo-night": {
    background: "#1a1b26",
    foreground: "#c0caf5",
    caret: "#7aa2f7",
    selection: "rgba(41,46,66,0.8)",
    lineHighlight: "rgba(36,40,59,0.7)",
    gutterBackground: "#16161e",
    gutterForeground: "#565f89",
    gutterBorder: "#292e42",
  },
  nord: {
    background: "#2e3440",
    foreground: "#eceff4",
    caret: "#88c0d0",
    selection: "rgba(67,76,94,0.7)",
    lineHighlight: "rgba(59,66,82,0.5)",
    gutterBackground: "#3b4252",
    gutterForeground: "#616e88",
    gutterBorder: "#4c566a",
  },
  "github-light": {
    background: "#ffffff",
    foreground: "#24292f",
    caret: "#0969da",
    selection: "rgba(9,105,218,0.15)",
    lineHighlight: "rgba(234,238,242,0.5)",
    gutterBackground: "#f6f8fa",
    gutterForeground: "#57606a",
    gutterBorder: "#d0d7de",
  },
  "solarized-light": {
    background: "#fdf6e3",
    foreground: "#657b83",
    caret: "#268bd2",
    selection: "rgba(147,161,161,0.2)",
    lineHighlight: "rgba(238,232,213,0.5)",
    gutterBackground: "#eee8d5",
    gutterForeground: "#93a1a1",
    gutterBorder: "#93a1a1",
  },
};
