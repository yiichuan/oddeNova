import { MULTI_TURN_CASES } from '../../scripts/eval/test-cases/multi-turn';
import { SINGLE_TURN_CASES } from '../../scripts/eval/test-cases/single-turn';
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
      turns: testCase.turns.map((turn) => turn.userMessage),
      reviewCriteria: testCase.turns.flatMap((turn) => turn.checkpoints ?? []),
    })),
  },
];
