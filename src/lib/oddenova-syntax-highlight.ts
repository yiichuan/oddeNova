/**
 * oddeNova's own syntax colours for the code panel — what a keyword, a string,
 * a number or a comment is painted as inside a Strudel script.
 *
 * Colour is *named* here, never fixed: every rule points at a `--syntax-*`
 * custom property that `index.css` defines per editor theme. That is what makes
 * one set of rules serve both palettes. These rules reach CodeMirror once, when
 * the editor is built, and nothing re-dispatches them afterwards — so a literal
 * colour would pin the panel to whichever palette was current at that moment
 * and sit through every theme change after it. Going through a property leaves
 * the compartment untouched and lets the browser repaint.
 *
 * The panel's *surface* — background, caret, selection, line numbers — is not
 * here; `editor-preferences.ts` owns that.
 */

import { HighlightStyle, syntaxHighlighting } from '@codemirror/language';
import type { Extension } from '@codemirror/state';
import { highlightCode, tagHighlighter, tags as t, type Tag } from '@lezer/highlight';
import { parser } from '@lezer/javascript';

type SyntaxHighlightSpec = {
  tag: Tag | readonly Tag[];
  color: string;
  fontStyle?: string;
};

// Keep every rule independent—even where the properties currently resolve to
// the same colour—so each syntax role can be tuned without changing another.
// The order and granularity intentionally mirror Strudel's original theme.
export const ODDENOVA_SYNTAX_HIGHLIGHT_SPECS: SyntaxHighlightSpec[] = [
  { tag: [t.atom, t.bool, t.special(t.variableName)], color: 'var(--syntax-atom)' },
  { tag: t.labelName, color: 'var(--syntax-label)' },
  { tag: t.keyword, color: 'var(--syntax-keyword)' },
  { tag: t.operator, color: 'var(--syntax-operator)' },
  { tag: t.special(t.variableName), color: 'var(--syntax-special-variable)' },
  { tag: t.typeName, color: 'var(--syntax-type)' },
  { tag: t.atom, color: 'var(--syntax-atom)' },
  { tag: t.number, color: 'var(--syntax-number)' },
  { tag: t.definition(t.variableName), color: 'var(--syntax-definition)' },
  { tag: t.string, color: 'var(--syntax-string)' },
  { tag: t.special(t.string), color: 'var(--syntax-string)' },
  { tag: t.comment, color: 'var(--syntax-comment)' },
  { tag: t.variableName, color: 'var(--syntax-variable)' },
  { tag: t.tagName, color: 'var(--syntax-tag)' },
  { tag: t.bracket, color: 'var(--syntax-bracket)' },
  { tag: t.meta, color: 'var(--syntax-meta)' },
  { tag: t.attributeName, color: 'var(--syntax-attribute)' },
  { tag: t.propertyName, color: 'var(--syntax-property)' },
  { tag: t.className, color: 'var(--syntax-variable)' },
  { tag: t.invalid, color: 'var(--syntax-invalid)' },
  { tag: [t.unit, t.punctuation], color: 'var(--syntax-punctuation)' },
];

export const oddenovaSyntaxHighlight = syntaxHighlighting(
  HighlightStyle.define(ODDENOVA_SYNTAX_HIGHLIGHT_SPECS),
);

const previewHighlighter = tagHighlighter(ODDENOVA_SYNTAX_HIGHLIGHT_SPECS.map(({ tag }, index) => ({
  tag, class: String(index),
})));

/** Highlight a read-only snapshot, including drafts with an open stack. */
export function highlightOddenovaLines(code: string): { text: string; color?: string }[][] {
  const lines: { text: string; color?: string }[][] = [[]];
  highlightCode(code, parser.parse(code), previewHighlighter, (text, classes) => {
    // Like CodeMirror's generated stylesheet, later specs take precedence
    // when a token matches more than one style.
    const spec = classes ? ODDENOVA_SYNTAX_HIGHLIGHT_SPECS[Math.max(...classes.split(' ').map(Number))] : undefined;
    lines.at(-1)!.push({ text, color: spec?.color });
  }, () => lines.push([]));
  return lines;
}

type EditorViewLike = {
  dispatch: (transaction: { effects: unknown }) => void;
};

type ThemeCompartmentLike = {
  reconfigure: (extension: Extension) => unknown;
};

export function installOddenovaSyntaxHighlight(
  editor: EditorViewLike,
  themeCompartment: ThemeCompartmentLike,
): void {
  editor.dispatch({
    // Replace Strudel's theme compartment instead of appending a second
    // highlighter. Multiple active HighlightStyles are merged, which would
    // leave the original palette visible.
    effects: themeCompartment.reconfigure(oddenovaSyntaxHighlight as Extension),
  });
}
