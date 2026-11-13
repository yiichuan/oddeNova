import { HighlightStyle, syntaxHighlighting } from '@codemirror/language';
import { tags as t } from '@lezer/highlight';

/** Red syntax palette for oddeNova's code panel. */
export const emberTextTheme = syntaxHighlighting(
  HighlightStyle.define([
    // Main accent requested for this theme.
    { tag: [t.atom, t.bool, t.special(t.variableName)], color: '#C14C3B' },
    { tag: [t.attributeName, t.number], color: '#C14C3B' },
    { tag: [t.string, t.regexp, t.special(t.propertyName)], color: '#C14C3B' },

    // Supporting reds and warm neutrals.
    {
      tag: [t.function(t.variableName), t.function(t.propertyName), t.url, t.processingInstruction],
      color: '#D76B57',
    },
    { tag: [t.variableName, t.propertyName, t.labelName], color: '#D76B57' },
    { tag: t.keyword, color: '#9F3D31' },
    { tag: t.comment, color: '#8E7771', fontStyle: 'italic' },
    { tag: [t.operator, t.punctuation, t.bracket], color: '#E29A8D' },
  ]),
);
