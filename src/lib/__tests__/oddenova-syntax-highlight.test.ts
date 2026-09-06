import { describe, expect, it } from 'vitest';
import { ODDENOVA_SYNTAX_HIGHLIGHT_SPECS } from '../oddenova-syntax-highlight';

describe('oddeNova syntax highlight', () => {
  it('preserves the original Strudel theme rule granularity', () => {
    expect(ODDENOVA_SYNTAX_HIGHLIGHT_SPECS).toHaveLength(21);
  });

  it('names every colour rather than fixing one, so both palettes reach it', () => {
    // The rules are dispatched into CodeMirror's theme compartment once and
    // then left alone; a literal here would pin the editor to one palette and
    // survive an app-theme change, since nothing re-dispatches them. Going
    // through `--syntax-*` is what lets the browser repaint the same rules
    // when `data-editor-theme` moves.
    for (const spec of ODDENOVA_SYNTAX_HIGHLIGHT_SPECS) {
      expect(spec.color).toMatch(/^var\(--syntax-[a-z-]+\)$/);
    }
  });
});
