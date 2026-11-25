import type { Root } from 'hast';

/** Drop the open trailing block so the stream only reveals whole Markdown blocks. */
export function streamMarkdownBlocks(source: string) {
  return () => (tree: Root) => {
    const index = tree.children.findLastIndex(node => node.type === 'element' && node.position !== undefined);
    if (index < 0) return;
    const node = tree.children[index];
    if (node.type !== 'element' || !node.position) return;
    const { start, end } = node.position;
    const rest = source.slice(end.offset ?? source.length);
    const blankLine = /^\r?\n[\t ]*\r?\n/.test(rest);
    // A blank line can separate items inside the same list or block quote.
    const container = ['ul', 'ol', 'blockquote'].includes(node.tagName);
    if (node.tagName === 'pre') {
      const lines = source.slice(start.offset ?? 0, end.offset ?? source.length).split(/\r?\n/);
      const fence = lines[0]?.trimStart().match(/^(`{3,}|~{3,})/)?.[0];
      const closing = lines.at(-1)?.trim() ?? '';
      if (lines.length > 1 && fence && closing.startsWith(fence)
        && [...closing].every(char => char === fence[0]) && /^\r?\n/.test(rest)) return;
    } else if (blankLine && !container) {
      return;
    }
    tree.children.splice(index);
  };
}
