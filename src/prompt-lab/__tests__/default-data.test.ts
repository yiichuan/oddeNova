import { describe, expect, it } from 'vitest';
import { parseScore } from '../../agent/parser';
import { DEFAULT_PROMPT_LAB_SUITES, orderPromptLabSuites } from '../default-data';
import { EDIT_CODE } from '../coverage-cases';

describe('built-in evaluation inputs', () => {
  it('keeps the original benchmarks visible first regardless of file order and preserves local edits', () => {
    const editedSingle = { ...DEFAULT_PROMPT_LAB_SUITES[0], name: '本地修改', cases: [] };
    const custom = { ...editedSingle, id: 'custom' };
    const input = [DEFAULT_PROMPT_LAB_SUITES[2], custom, DEFAULT_PROMPT_LAB_SUITES[1], editedSingle];
    const ordered = orderPromptLabSuites(input);
    expect(ordered.map(suite => suite.id)).toEqual(['oddenova-single-turn', 'oddenova-multi-turn', 'oddenova-interaction-boundaries', 'custom']);
    expect(ordered[0]).toBe(editedSingle);
    expect(input[0]).toBe(DEFAULT_PROMPT_LAB_SUITES[2]);
  });
  it('provides the pad target required by the fixed editing scenario', () => {
    const testCase = DEFAULT_PROMPT_LAB_SUITES.flatMap(s => s.cases).find(c => c.id === 'MT-A-002')!;
    const parsed = parseScore(testCase.initialCode!);
    expect(parsed.layers.map(l => l.name)).toContain('pad');
    expect(parsed.bpm).toBe(120);
    expect(testCase.turnCriteria).toHaveLength(testCase.turns.length);
    expect(testCase.turnCriteria?.[0]).toContain('BPM 应变为 100，各层保留');
  });

  it('keeps scenario IDs unique and per-turn metadata aligned', () => {
    const cases = DEFAULT_PROMPT_LAB_SUITES.flatMap(s => s.cases);
    expect(new Set(cases.map(c => c.id)).size).toBe(cases.length);
    for (const testCase of cases) {
      expect(testCase.turns.every(turn => turn.trim().length > 0)).toBe(true);
      expect(testCase.turnChecks?.length ?? 0).toBeLessThanOrEqual(testCase.turns.length);
      if (testCase.turnCriteria) expect(testCase.turnCriteria).toHaveLength(testCase.turns.length);
    }
  });

  it('starts preservation assertions from material that actually exists', () => {
    const cases = DEFAULT_PROMPT_LAB_SUITES.flatMap(s => s.cases);
    for (const id of ['CV-EDIT-001', 'CV-REPAIR-001']) {
      const testCase = cases.find(c => c.id === id)!;
      for (const fragment of testCase.turnChecks![0].mustContain!) {
        expect(testCase.initialCode).toContain(fragment);
      }
    }
    expect(parseScore(EDIT_CODE).layers.map(l => l.name)).toEqual(['drums', 'bass', 'pad']);
  });
});
