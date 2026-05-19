// scripts/eval/types.ts
// 所有共享接口，无外部依赖

// ── 测试用例 ──────────────────────────────────────────────
export interface SingleTurnCase {
  id: string;                    // "TC-001"
  name: string;
  category: string;              // "风格/情绪类" | "技术细节类" | ...
  prompt: string;
  expectedDimensions: string[];  // 期望覆盖的维度，供 judge 参考
}

export type MultiTurnType = 'progressive' | 'style-transfer' | 'fuzzy-feedback';

export interface MultiTurnCase {
  id: string;           // "MT-A-001"
  name: string;
  type: MultiTurnType;
  turns: Array<{
    userMessage: string;
    checkpoints?: string[];  // 本轮期望行为（供 judge 使用）
  }>;
}

// ── 运行结果 ──────────────────────────────────────────────
export interface TurnResult {
  userMessage: string;
  generatedCode: string;
  explanation: string;
  durationMs: number;
}

export interface RuleScore {
  total: number;  // 0-100
  breakdown: Record<string, { pass: boolean; score: number; detail?: string }>;
  layerPreservationScore?: number;  // 多轮专属 0-10
}

export interface JudgeScore {
  total: number;  // 0-10（多轮原始最高 14，归一化：Math.round(rawTotal / 14 * 100) / 10）
  breakdown: Record<string, { score: number; reason: string }>;
  rawResponse: string;  // 原始输出，便于 debug
}

export interface CaseResult {
  caseId: string;
  caseName: string;
  caseType: 'single' | 'multi';
  turns: TurnResult[];
  ruleScore: RuleScore;
  judgeScore: JudgeScore | null;  // --no-judge 时为 null
}

export interface EvalSummary {
  totalCases: number;
  avgRuleScore: number;
  avgJudgeScore: number | null;
  syntaxPassRate: number;  // 0-1
}

export interface EvalSnapshot {
  label: string;
  timestamp: string;  // ISO 8601
  promptVersion: string;
  model: string;
  results: CaseResult[];
  summary: EvalSummary;
}
