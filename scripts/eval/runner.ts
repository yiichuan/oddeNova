// scripts/eval/runner.ts
import * as fs from 'node:fs';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';

// 加载 scripts/eval/.env（如存在）
{
  const __dir = path.dirname(fileURLToPath(import.meta.url));
  const envFile = path.join(__dir, '.env');
  if (fs.existsSync(envFile)) {
    const lines = fs.readFileSync(envFile, 'utf8').split('\n');
    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith('#')) continue;
      const idx = trimmed.indexOf('=');
      if (idx === -1) continue;
      const key = trimmed.slice(0, idx).trim();
      const val = trimmed.slice(idx + 1).trim();
      if (key && !(key in process.env)) process.env[key] = val;
    }
  }
}
import { SINGLE_TURN_CASES } from './test-cases/single-turn.js';
import { MULTI_TURN_CASES } from './test-cases/multi-turn.js';
import { runAgentTurn, AGENT_SYSTEM_PROMPT, IMPROVISE_SYSTEM_PROMPT } from './agent-runner.js';
import { scoreRules, scoreLayerPreservation, judgeSingleTurn, judgeMultiTurn } from './evaluator.js';
import type {
  SingleTurnCase, MultiTurnCase, CaseResult, TurnResult,
  EvalSnapshot, EvalSummary, JudgeScore,
} from './types.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const EVAL_DIR = __dirname;

// ── CLI 参数解析 ────────────────────────────────────────────────────────────

function parseArgs() {
  const args = process.argv.slice(2);
  const get = (flag: string) => { const i = args.indexOf(flag); return i >= 0 ? args[i + 1] : undefined; };
  const has = (flag: string) => args.includes(flag);
  return {
    label: get('--label') ?? new Date().toISOString().slice(0, 10),
    only: get('--only'),           // 'single' | 'multi' | undefined
    cases: get('--case')?.split(','),  // ['TC-001', 'MT-A-001'] | undefined
    noJudge: has('--no-judge'),
  };
}

// ── Prompt 版本检测 ─────────────────────────────────────────────────────────

function getPromptVersion(): string {
  try {
    const activePath = path.join(__dirname, '../../src/prompts/active.ts');
    const content = fs.readFileSync(activePath, 'utf-8');
    const match = content.match(/from\s+['"]\.\/versions\/(v\d+)['"]/);
    return match ? match[1] : 'unknown';
  } catch {
    return 'unknown';
  }
}

// ── 单轮用例执行 ────────────────────────────────────────────────────────────

async function runSingleCase(tc: SingleTurnCase, noJudge: boolean): Promise<CaseResult> {
  console.log(`  ▶ ${tc.id} ${tc.name}`);
  const turnResult = await runAgentTurn({
    instruction: tc.prompt,
    currentCode: '',
    agentSystemPrompt: AGENT_SYSTEM_PROMPT,
    improviseSystemPrompt: IMPROVISE_SYSTEM_PROMPT,
  });
  const turns: TurnResult[] = [{
    userMessage: tc.prompt,
    generatedCode: turnResult.code,
    explanation: turnResult.explanation,
    durationMs: turnResult.durationMs,
  }];
  const ruleScore = scoreRules(turnResult.code, [tc.prompt]);
  let judgeScore: JudgeScore | null = null;
  if (!noJudge) {
    try {
      judgeScore = await judgeSingleTurn(tc, turnResult.code);
    } catch (e) {
      console.warn(`     [judge] 评分失败，跳过: ${e instanceof Error ? e.message : String(e)}`);
    }
  }
  console.log(`     规则分: ${ruleScore.total} | Judge分: ${judgeScore?.total ?? '-'}`);
  return { caseId: tc.id, caseName: tc.name, caseType: 'single', turns, ruleScore, judgeScore };
}

// ── 多轮用例执行 ────────────────────────────────────────────────────────────

async function runMultiCase(tc: MultiTurnCase, noJudge: boolean): Promise<CaseResult> {
  console.log(`  ▶ ${tc.id} ${tc.name} (${tc.turns.length} 轮)`);
  const turns: TurnResult[] = [];
  let currentCode = '';
  for (let i = 0; i < tc.turns.length; i++) {
    const turn = tc.turns[i];
    console.log(`     第 ${i + 1}/${tc.turns.length} 轮: "${turn.userMessage.slice(0, 40)}"`);
    const result = await runAgentTurn({
      instruction: turn.userMessage,
      currentCode,
      agentSystemPrompt: AGENT_SYSTEM_PROMPT,
      improviseSystemPrompt: IMPROVISE_SYSTEM_PROMPT,
    });
    turns.push({
      userMessage: turn.userMessage,
      generatedCode: result.code,
      explanation: result.explanation,
      durationMs: result.durationMs,
    });
    currentCode = result.code;
  }
  const finalCode = turns[turns.length - 1].generatedCode;
  const ruleScore = scoreRules(finalCode, tc.turns.map((t) => t.userMessage));
  ruleScore.layerPreservationScore = scoreLayerPreservation(turns);
  let judgeScore: JudgeScore | null = null;
  if (!noJudge) {
    try {
      judgeScore = await judgeMultiTurn(tc, turns);
    } catch (e) {
      console.warn(`     [judge] 评分失败，跳过: ${e instanceof Error ? e.message : String(e)}`);
    }
  }
  console.log(`     规则分: ${ruleScore.total} | 层保留: ${ruleScore.layerPreservationScore} | Judge分: ${judgeScore?.total ?? '-'}`);
  return { caseId: tc.id, caseName: tc.name, caseType: 'multi', turns, ruleScore, judgeScore };
}

// ── 审阅 Markdown 生成 ──────────────────────────────────────────────────────

function generateReviewMarkdown(snapshot: EvalSnapshot): string {
  const lines: string[] = [
    `# Strudel 评测结果 — ${snapshot.label}`,
    '',
    `> 生成时间: ${snapshot.timestamp} | Prompt 版本: ${snapshot.promptVersion} | 模型: ${snapshot.model}`,
    `> 规则分: ${snapshot.summary.avgRuleScore.toFixed(1)}/100 | Judge 分: ${snapshot.summary.avgJudgeScore?.toFixed(1) ?? '-'}/10 | 语法通过率: ${(snapshot.summary.syntaxPassRate * 100).toFixed(0)}%`,
    '',
    '---',
    '',
  ];
  for (const result of snapshot.results) {
    lines.push(`## ${result.caseId} — ${result.caseName}`);
    lines.push('');
    for (let i = 0; i < result.turns.length; i++) {
      const turn = result.turns[i];
      if (result.turns.length > 1) lines.push(`### 第 ${i + 1} 轮`);
      lines.push(`**用户**: ${turn.userMessage}`);
      lines.push('');
      if (i === result.turns.length - 1) {
        lines.push('**最终生成代码**:');
        lines.push('');
        lines.push('```strudel');
        lines.push(turn.generatedCode);
        lines.push('```');
      } else {
        lines.push('**本轮代码** (中间轮):');
        lines.push('');
        lines.push('<details><summary>展开代码</summary>');
        lines.push('');
        lines.push('```strudel');
        lines.push(turn.generatedCode);
        lines.push('```');
        lines.push('</details>');
      }
      lines.push('');
    }
    lines.push(`**规则分**: ${result.ruleScore.total}/100`);
    if (result.ruleScore.layerPreservationScore !== undefined) {
      lines.push(`**层保留分**: ${result.ruleScore.layerPreservationScore}/10`);
    }
    if (result.judgeScore) {
      lines.push(`**Judge 分**: ${result.judgeScore.total}/10`);
      lines.push('');
      lines.push('| 维度 | 分数 | 说明 |');
      lines.push('|------|------|------|');
      for (const [dim, val] of Object.entries(result.judgeScore.breakdown)) {
        lines.push(`| ${dim} | ${val.score}/2 | ${val.reason} |`);
      }
    }
    lines.push('');
    lines.push('**人工评分**: （待填写，1-10）  ');
    lines.push('**人工备注**:   ');
    lines.push('');
    lines.push('---');
    lines.push('');
  }
  return lines.join('\n');
}

// ── 主函数 ──────────────────────────────────────────────────────────────────

async function main() {
  const { label, only, cases, noJudge } = parseArgs();
  console.log(`\n📊 Strudel 评测框架 — label: ${label}${noJudge ? ' (无 judge)' : ''}`);

  let singleCases = SINGLE_TURN_CASES;
  let multiCases = MULTI_TURN_CASES;
  if (only === 'single') multiCases = [];
  if (only === 'multi') singleCases = [];
  if (cases) {
    singleCases = singleCases.filter((tc) => cases.includes(tc.id));
    multiCases = multiCases.filter((tc) => cases.includes(tc.id));
  }

  const results: CaseResult[] = [];
  console.log(`\n单轮用例 (${singleCases.length}个):`);
  for (const tc of singleCases) {
    try { results.push(await runSingleCase(tc, noJudge)); }
    catch (e) { console.error(`  ❌ ${tc.id} 失败:`, e); }
  }

  console.log(`\n多轮用例 (${multiCases.length}个):`);
  for (const tc of multiCases) {
    try { results.push(await runMultiCase(tc, noJudge)); }
    catch (e) { console.error(`  ❌ ${tc.id} 失败:`, e); }
  }

  const ruleTotals = results.map((r) => r.ruleScore.total);
  const judgeTotals = results.filter((r) => r.judgeScore !== null).map((r) => r.judgeScore!.total);
  const syntaxPassed = results.filter((r) => r.ruleScore.breakdown['syntax']?.pass).length;
  const summary: EvalSummary = {
    totalCases: results.length,
    avgRuleScore: ruleTotals.length ? ruleTotals.reduce((a, b) => a + b, 0) / ruleTotals.length : 0,
    avgJudgeScore: judgeTotals.length ? judgeTotals.reduce((a, b) => a + b, 0) / judgeTotals.length : null,
    syntaxPassRate: results.length ? syntaxPassed / results.length : 0,
  };

  const snapshot: EvalSnapshot = {
    label,
    timestamp: new Date().toISOString(),
    promptVersion: getPromptVersion(),
    model: process.env['VITE_LLM_MODEL'] ?? process.env['ANTHROPIC_MODEL'] ?? 'claude-sonnet-4-6',
    results,
    summary,
  };

  const historyDir = path.join(EVAL_DIR, 'history');
  const snapshotPath = path.join(historyDir, `${label}.json`);
  fs.writeFileSync(snapshotPath, JSON.stringify(snapshot, null, 2), 'utf-8');

  const reviewDir = path.join(EVAL_DIR, 'review');
  const reviewPath = path.join(reviewDir, `${label}.md`);
  fs.writeFileSync(reviewPath, generateReviewMarkdown(snapshot), 'utf-8');

  console.log('\n✅ 完成!');
  console.log(`   规则分均值: ${summary.avgRuleScore.toFixed(1)}/100`);
  console.log(`   Judge分均值: ${summary.avgJudgeScore?.toFixed(1) ?? '-'}/10`);
  console.log(`   语法通过率: ${(summary.syntaxPassRate * 100).toFixed(0)}%`);
  console.log(`   快照: ${snapshotPath}`);
  console.log(`   审阅: ${reviewPath}`);
}

main().catch((e) => { console.error(e); process.exit(1); });
