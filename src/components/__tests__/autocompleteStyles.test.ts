import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const editorStyles = readFileSync(new URL('../../index.css', import.meta.url), 'utf8');

describe('Strudel autocomplete portal styles', () => {
  it('resets parameter list indentation outside the CodeMirror editor tree', () => {
    expect(editorStyles).toMatch(
      /(?:^|\n)\.autocomplete-info-params-list\s*\{[^}]*padding:\s*0;/s,
    );
  });

  it('does not render template whitespace inside parameter items', () => {
    const paramItemRule = editorStyles.match(
      /(?:^|\n)\.autocomplete-info-param-item(?:\s*,[^{]+)?\s*\{([^}]*)\}/s,
    );

    expect(paramItemRule).not.toBeNull();
    expect(paramItemRule?.[1]).not.toMatch(/white-space:\s*pre-wrap/);
  });
});
