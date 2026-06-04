import { describe, expect, it, vi } from 'vitest';

vi.mock('../../services/strudel', () => ({
  validateCodeRuntime: vi.fn().mockReturnValue({ ok: true }),
  validateCodeTranspiler: vi.fn().mockReturnValue({ ok: true }),
  normalizeCode: vi.fn((code: string) => code),
}));

import { TOOLS } from '../../agent/tools';
import {
  DEMO_MOOD_SCENARIO,
  DEMO_PREFILL_SCENARIO,
  getActiveDemoSet,
  STATIC_SUGGESTION_SCENARIOS,
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
      DEMO_PREFILL_SCENARIO,
      DEMO_MOOD_SCENARIO,
      ...STATIC_SUGGESTION_SCENARIOS,
    ]);

    const unknownToolNames = [...new Set(usedToolNames.filter((name) => !availableToolNames.has(name)))];

    expect(unknownToolNames).toEqual([]);
  });
});
