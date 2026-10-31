import { MULTI_TURN_CASES } from '../../scripts/eval/test-cases/multi-turn';
import { SINGLE_TURN_CASES } from '../../scripts/eval/test-cases/single-turn';
import { COVERAGE_CASES, EDIT_CODE } from './coverage-cases';
import type { PromptLabSuite } from './types';

const now = '2026-10-29T00:00:00.000Z';

export const DEFAULT_PROMPT_LAB_SUITES: PromptLabSuite[] = [
  {
    id: 'oddenova-single-turn',
    name: 'oddeNova 单轮基准',
    revision: 0,
    createdAt: now,
    updatedAt: now,
    cases: SINGLE_TURN_CASES.map((testCase) => ({
      id: testCase.id,
      name: testCase.name,
      category: testCase.category,
      turns: [testCase.prompt],
      reviewCriteria: testCase.expectedDimensions,
    })),
  },
  {
    id: 'oddenova-multi-turn',
    name: 'oddeNova 多轮编辑基准',
    revision: 0,
    createdAt: now,
    updatedAt: now,
    cases: MULTI_TURN_CASES.map((testCase) => ({
      id: testCase.id,
      name: testCase.name,
      category: testCase.type,
      ...(testCase.id === 'MT-A-002' ? { initialCode: EDIT_CODE } : {}),
      turns: testCase.id === 'MT-A-002' ? ['BPM 降到 100', '给 pad 层加更多混响'] : testCase.turns.map((turn) => turn.userMessage),
      turnCriteria: (testCase.id === 'MT-A-002' ? testCase.turns.slice(1) : testCase.turns).map((turn) => turn.checkpoints ?? []),
      reviewCriteria: testCase.turns.flatMap((turn) => turn.checkpoints ?? []),
    })),
  },
  {
    id: 'oddenova-interaction-boundaries',
    name: 'oddeNova 交互与结构基准',
    revision: 0,
    createdAt: now,
    updatedAt: now,
    cases: COVERAGE_CASES,
  },
];

// File listing order must not decide which benchmark is selected on refresh.
export function orderPromptLabSuites(suites: PromptLabSuite[]): PromptLabSuite[] {
  const order = new Map(DEFAULT_PROMPT_LAB_SUITES.map((suite, index) => [suite.id, index]));
  return [...suites].sort((left, right) =>
    (order.get(left.id) ?? order.size) - (order.get(right.id) ?? order.size));
}
