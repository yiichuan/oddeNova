import { describe, expect, it } from 'vitest';
import { buildCodeDiff, type DiffRow } from '../code-diff';

function textsOf(rows: DiffRow[], kind: 'add' | 'remove'): string[] {
  return rows.flatMap((row) => row.kind === kind ? [row.text] : []);
}

const before = `setcps(0.5)
stack(
  /* @layer drums */
  s("bd ~ sd ~")
  .gain(0.8),
  /* @layer bass */
  note("c2 e2")
)`;

describe('buildCodeDiff', () => {
  it('groups modified and added code by named Layer and omits unchanged Layers', () => {
    const after = `setcps(0.5)
stack(
  /* @layer drums */
  s("bd*2 ~ sd ~")
  .gain(0.8),
  /* @layer bass */
  note("c2 e2"),
  /* @layer pad */
  note("<c4 eb4 g4>").s("sine")
)`;

    const diff = buildCodeDiff(before, after);

    expect(diff.groups.map((group) => [group.name, group.status])).toEqual([
      ['drums', 'modified'],
      ['pad', 'added'],
    ]);
    expect(diff.groups.some((group) => group.name === 'bass')).toBe(false);
    expect(diff.additions).toBe(2);
    expect(diff.deletions).toBe(1);
  });

  it('shows removed Layers after the surviving Layer order', () => {
    const after = `setcps(0.5)
stack(
  /* @layer drums */
  s("bd ~ sd ~")
  .gain(0.8)
)`;

    const diff = buildCodeDiff(before, after);

    expect(diff.groups.map((group) => [group.name, group.status])).toEqual([
      ['bass', 'removed'],
    ]);
  });

  it('groups tempo and non-Layer scaffolding changes under SCORE', () => {
    const after = before.replace('setcps(0.5)', 'setcps(0.625)');

    const diff = buildCodeDiff(before, after);

    expect(diff.groups).toHaveLength(1);
    expect(diff.groups[0].name).toBe('SCORE');
    expect(textsOf(diff.groups[0].rows, 'remove')).toContain('setcps(0.5)');
    expect(textsOf(diff.groups[0].rows, 'add')).toContain('setcps(0.625)');
  });

  it('keeps Layer grouping when a Layer name contains hyphens or non-ASCII characters', () => {
    const after = `setcps(0.5)
stack(
  /* @layer drums */
  s("bd ~ sd ~")
  .gain(0.8),
  /* @layer OPEN-HAT点缀 */
  s("~ ~ ~ oh"),
  /* @layer bass */
  note("c2 e2")
)`;

    const diff = buildCodeDiff(before, after);

    expect(diff.groups.map((group) => [group.name, group.status])).toEqual([
      ['OPEN-HAT点缀', 'added'],
    ]);
  });

  it('falls back to one SCORE group when code has no stable Layer markers', () => {
    const diff = buildCodeDiff('stack(\n  s("bd"),\n  s("sd")\n)', 'stack(\n  s("bd*2"),\n  s("sd")\n)');

    expect(diff.groups.map((group) => group.name)).toEqual(['SCORE']);
  });

  it('keeps two context lines and collapses longer unchanged runs', () => {
    const oldCode = ['one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine', 'ten', 'eleven', 'twelve'].join('\n');
    const newCode = ['one', 'two', 'THREE', 'four', 'five', 'six', 'seven', 'eight', 'nine', 'TEN', 'eleven', 'twelve'].join('\n');

    const diff = buildCodeDiff(oldCode, newCode);
    const rows = diff.groups[0].rows;

    expect(rows.some((row) => row.kind === 'skip')).toBe(true);
    expect(rows.every((row) => row.kind !== 'context' || row.text !== '')).toBe(true);
  });

  it('normalizes CRLF before diffing', () => {
    const diff = buildCodeDiff('setcps(0.5)\r\ns("bd")', 'setcps(0.5)\ns("bd")');

    expect(diff.additions).toBe(0);
    expect(diff.deletions).toBe(0);
    expect(diff.groups).toEqual([]);
  });
});
