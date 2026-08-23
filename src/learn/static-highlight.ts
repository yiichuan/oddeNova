import { parser } from '@lezer/javascript';
import { highlightCode, classHighlighter } from '@lezer/highlight';

export interface HighlightSpan {
  text: string;
  className: string;
}

/**
 * Tokenizes a static (non-editable) code snippet into per-line spans with
 * CodeMirror's standard `tok-*` classes, so docs code blocks that aren't
 * `<MiniRepl>` (JSON configs, shell commands, Tidal/JS fragments) get the
 * same kind of syntax coloring strudel.cc's own docs show, matched via
 * `.static-code` rules in index.css. Content isn't always valid JS (shell
 * output, plain word lists) — the JS grammar still tokenizes those into
 * plausible identifier/string/number spans, and any leftover unmatched text
 * just renders unstyled, so it degrades gracefully rather than breaking.
 */
export function highlightLines(code: string): HighlightSpan[][] {
  const tree = parser.parse(code);
  const lines: HighlightSpan[][] = [[]];
  highlightCode(
    code,
    tree,
    classHighlighter,
    (text, className) => {
      lines[lines.length - 1].push({ text, className });
    },
    () => {
      lines.push([]);
    },
  );
  return lines;
}
