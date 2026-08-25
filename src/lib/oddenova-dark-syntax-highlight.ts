import { HighlightStyle, syntaxHighlighting } from '@codemirror/language';
import type { Extension } from '@codemirror/state';
import { tags as t, type Tag } from '@lezer/highlight';

type SyntaxHighlightSpec = {
  tag: Tag | readonly Tag[];
  color: string;
  fontStyle?: string;
};

// Keep every rule independent—even where colors currently match—so each
// syntax role can be tuned without changing another. The order and granularity
// intentionally mirror Strudel's original theme.
export const ODDENOVA_DARK_SYNTAX_HIGHLIGHT_SPECS: SyntaxHighlightSpec[] = [
  { tag: [t.atom, t.bool, t.special(t.variableName)], color: '#4BA3B9' },
  { tag: t.labelName, color: '#DFB234' },
  { tag: t.keyword, color: '#ECB43C' },
  { tag: t.operator, color: '#797977' },
  { tag: t.special(t.variableName), color: '#C4C73D' },
  { tag: t.typeName, color: '#9AD345' },
  { tag: t.atom, color: '#4BA3B9' },
  { tag: t.number, color: '#D9D9D9' },
  { tag: t.definition(t.variableName), color: '#D5D5D0' },
  { tag: t.string, color: '#D9D9D9' },
  { tag: t.special(t.string), color: '#D9D9D9' },
  { tag: t.comment, color: '#646973' },
  { tag: t.variableName, color: '#EC653C' },
  { tag: t.tagName, color: '#5184D6' },
  { tag: t.bracket, color: '#9E9E9E' },
  { tag: t.meta, color: '#C55F0D' },
  { tag: t.attributeName, color: '#AA70D2' },
  { tag: t.propertyName, color: '#B0B0B0' },
  { tag: t.className, color: '#EC653C' },
  { tag: t.invalid, color: '#E01A1A' },
  { tag: [t.unit, t.punctuation], color: '#8A8A8A' },
];

export const oddenovaDarkSyntaxHighlight = syntaxHighlighting(
  HighlightStyle.define(ODDENOVA_DARK_SYNTAX_HIGHLIGHT_SPECS),
);

type EditorViewLike = {
  dispatch: (transaction: { effects: unknown }) => void;
};

type ThemeCompartmentLike = {
  reconfigure: (extension: Extension) => unknown;
};

export function installOddenovaDarkSyntaxHighlight(
  editor: EditorViewLike,
  themeCompartment: ThemeCompartmentLike,
): void {
  editor.dispatch({
    // Replace Strudel's theme compartment instead of appending a second
    // highlighter. Multiple active HighlightStyles are merged, which would
    // leave the original palette visible.
    effects: themeCompartment.reconfigure(oddenovaDarkSyntaxHighlight as Extension),
  });
}
