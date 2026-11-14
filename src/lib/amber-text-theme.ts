import { HighlightStyle, syntaxHighlighting } from '@codemirror/language';
import { tags as t } from '@lezer/highlight';

/** Amber syntax palette adapted from Strudel's redText theme for oddeNova. */
export const amberTextTheme = syntaxHighlighting(
  HighlightStyle.define([
    // The requested amber accent.
    { tag: [t.atom, t.bool, t.special(t.variableName)], color: '#F5D397' },
    { tag: [t.attributeName, t.number], color: '#F5D397' },
    { tag: [t.string, t.regexp, t.special(t.propertyName)], color: '#F5D397' },

    // Four supporting colors for the rest of the syntax palette.
    {
      tag: [t.function(t.variableName), t.function(t.propertyName), t.url, t.processingInstruction],
      color: '#C58A32',
    },
    { tag: [t.variableName, t.propertyName, t.labelName], color: '#C58A32' },
    { tag: t.keyword, color: '#9C6A26' },
    { tag: t.comment, color: '#877A65', fontStyle: 'italic' },
    { tag: [t.operator, t.punctuation, t.bracket], color: '#DEC18A' },
  ]),
);
