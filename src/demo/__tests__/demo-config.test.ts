import { describe, expect, it, vi } from 'vitest';

const locale = vi.hoisted(() => ({ zh: true }));

vi.mock('../../services/strudel', () => ({
  validateCodeRuntime: vi.fn().mockReturnValue({ ok: true }),
  validateCodeTranspiler: vi.fn().mockReturnValue({ ok: true }),
  normalizeCode: vi.fn((code: string) => code),
}));

vi.mock('../../lib/i18n', () => ({
  isZh: () => locale.zh,
}));

import { TOOLS } from '../../agent/tools';
import {
  getDemoMoodScenario,
  getDemoPrefill,
  getDemoPrefillScenario,
  getActiveDemoSet,
  getDemoMoodInstruction,
  resolveDemoScenario,
  type DemoMoodScenario,
  type DemoScenario,
} from '../demo-config';

const availableToolNames = new Set(TOOLS.map((tool) => tool.name));

function collectToolNames(scenarios: Array<DemoScenario | DemoMoodScenario>): string[] {
  return scenarios.flatMap((scenario) =>
    scenario.rounds.flatMap((round) => round.toolCalls.map((toolCall) => toolCall.name))
  );
}

describe('demo tool calls', () => {
  it('only references tools exposed by the current agent', () => {
    const usedToolNames = collectToolNames([
      ...getActiveDemoSet(),
      getDemoPrefillScenario(),
      getDemoMoodScenario(),
    ]);

    const unknownToolNames = [...new Set(usedToolNames.filter((name) => !availableToolNames.has(name)))];

    expect(unknownToolNames).toEqual([]);
  });
});

describe('localized demo copy', () => {
  it('materializes the preset conversation in the system language', () => {
    locale.zh = true;
    const zhScenarios = getActiveDemoSet();
    expect(zhScenarios[0].prompt).toBe('来个简单的底鼓');
    expect(zhScenarios[0].rounds[1].toolCalls[0].args.explanation).toContain('添加了一层');

    locale.zh = false;
    const enScenarios = getActiveDemoSet();
    expect(enScenarios[0].prompt).toBe('Start with a simple kick drum');
    expect(enScenarios[0].rounds[0].thinking).toContain('A 4/4 kick drum');
    expect(enScenarios[0].rounds[1].toolCalls[0].args.explanation).toContain('Added a 120 BPM');
    expect(resolveDemoScenario('Start with a simple kick drum')).toBe(enScenarios[0]);
    expect(resolveDemoScenario('来个简单的底鼓')).toBeUndefined();
  });

  it('localizes the mood and inspiration presets too', () => {
    locale.zh = false;
    expect(getDemoMoodInstruction()).toBe('Generate music based on my mood');
    expect(getDemoPrefill()).toBe('A song for a presentation');
    expect(getDemoPrefillScenario().rounds[0].thinking).toContain('A presentation piece');
    expect(getDemoMoodScenario().rounds[1].toolCalls[0].args.explanation).toContain('Made an 82 BPM');

    const enDemoCode = getActiveDemoSet()[0].rounds[0].toolCalls[0].args.code;
    expect(enDemoCode).toContain('// One kick on every beat.');
    expect(enDemoCode).not.toContain('四拍底鼓');
    expect(getDemoPrefillScenario().rounds[0].toolCalls[0].args.code)
      .toContain('// C-major piano arpeggios, warm and rising');
    expect(getDemoMoodScenario().rounds[0].toolCalls[0].args.code)
      .toContain('// Laid-back boom-bap kick.');

    locale.zh = true;
    expect(getActiveDemoSet()[0].rounds[0].toolCalls[0].args.code)
      .toContain('// 四拍底鼓，每拍一下。');
  });
});
