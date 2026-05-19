// scripts/eval/report.ts
// 用法:
//   npx tsx scripts/eval/report.ts --compare <labelA> <labelB>
//   npx tsx scripts/eval/report.ts --import-human-scores <path/to/review.md>

import * as fs from 'node:fs';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';
import type { EvalSnapshot, CaseResult } from './types.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const HISTORY_DIR = path.join(__dirname, 'history');

function loadSnapshot(label: string): EvalSnapshot {
  const filePath = path.join(HISTORY_DIR, `${label}.json`);
  if (!fs.existsSync(filePath)) throw new Error(`快照不存在: ${filePath}`);
  return JSON.parse(fs.readFileSync(filePath, 'utf-8')) as EvalSnapshot;
}

function formatDelta(ruleDelta: number, judgeDelta: number | null): string {
  const parts = [`rule: ${ruleDelta >= 0 ? '+' : ''}${ruleDelta.toFixed(0)}`];
  if (judgeDelta !== null) parts.push(`judge: ${judgeDelta >= 0 ? '+' : ''}${judgeDelta.toFixed(1)}`);
  return parts.join(' | ');
}

function buildReason(ra: CaseResult, rb: CaseResult): string {
  if (!ra.judgeScore || !rb.judgeScore) return '';
  const reasons: string[] = [];
  for (const [dim, valB] of Object.entries(rb.judgeScore.breakdown)) {
    const valA = ra.judgeScore.breakdown[dim];
    if (valA && valB.score < valA.score) {
      reasons.push(`"${dim}": ${valA.score}→${valB.score} — "${valB.reason}"`);
    }
  }
  return reasons[0] ?? '';
}

function compareSnapshots(labelA: string, labelB: string): void {
  const a = loadSnapshot(labelA);
  const b = loadSnapshot(labelB);

  const ruleDiff = b.summary.avgRuleScore - a.summary.avgRuleScore;
  const judgeAStr = a.summary.avgJudgeScore?.toFixed(1) ?? '-';
  const judgeBStr = b.summary.avgJudgeScore?.toFixed(1) ?? '-';
  const judgeDiff = (a.summary.avgJudgeScore !== null && b.summary.avgJudgeScore !== null)
    ? (b.summary.avgJudgeScore - a.summary.avgJudgeScore) : null;
  const syntaxDiff = (b.summary.syntaxPassRate - a.summary.syntaxPassRate) * 100;

  console.log(`\n版本对比: ${labelA} → ${labelB}`);
  console.log('─'.repeat(45));
  console.log(`规则分:    ${a.summary.avgRuleScore.toFixed(1)} → ${b.summary.avgRuleScore.toFixed(1)}  (${ruleDiff >= 0 ? '+' : ''}${ruleDiff.toFixed(1)} ${ruleDiff >= 0 ? '↑' : '↓'})`);
  console.log(`Judge分:   ${judgeAStr} → ${judgeBStr}${judgeDiff !== null ? `  (${judgeDiff >= 0 ? '+' : ''}${judgeDiff.toFixed(1)} ${judgeDiff >= 0 ? '↑' : '↓'})` : ''}`);
  console.log(`语法通过率: ${(a.summary.syntaxPassRate * 100).toFixed(0)}% → ${(b.summary.syntaxPassRate * 100).toFixed(0)}%  (${syntaxDiff >= 0 ? '+' : ''}${syntaxDiff.toFixed(0)}%)`);
  console.log('─'.repeat(45));

  // Find regressions and improvements
  const byIdA = new Map(a.results.map((r) => [r.caseId, r]));
  const byIdB = new Map(b.results.map((r) => [r.caseId, r]));
  const regressions: Array<{ id: string; name: string; change: string; reason: string }> = [];
  const improvements: Array<{ id: string; name: string; change: string }> = [];

  for (const [id, rb] of byIdB) {
    const ra = byIdA.get(id);
    if (!ra) continue;
    const ruleDelta = rb.ruleScore.total - ra.ruleScore.total;
    const judgeDelta = (ra.judgeScore && rb.judgeScore) ? rb.judgeScore.total - ra.judgeScore.total : null;
    if (ruleDelta < -5 || (judgeDelta !== null && judgeDelta < -1)) {
      const reason = buildReason(ra, rb);
      regressions.push({ id, name: rb.caseName, change: formatDelta(ruleDelta, judgeDelta), reason });
    } else if (ruleDelta > 5 || (judgeDelta !== null && judgeDelta > 1)) {
      improvements.push({ id, name: rb.caseName, change: formatDelta(ruleDelta, judgeDelta) });
    }
  }

  if (regressions.length > 0) {
    console.log(`\n退步用例 (${regressions.length}):`);
    for (const r of regressions) {
      console.log(`  ${r.id} ${r.name}  ${r.change}`);
      if (r.reason) console.log(`    ${r.reason}`);
    }
  }
  if (improvements.length > 0) {
    console.log(`\n进步用例 (${improvements.length}):`);
    for (const r of improvements) {
      console.log(`  ${r.id} ${r.name}  ${r.change}`);
    }
  }
  if (regressions.length === 0 && improvements.length === 0) {
    console.log('\n无显著变化用例（变动在 ±5 规则分 / ±1 judge 分以内）');
  }
}

function importHumanScores(reviewMdPath: string): void {
  const content = fs.readFileSync(reviewMdPath, 'utf-8');

  // Parse human scores from markdown
  // Format: **人工评分**: X  (where X is a number)
  const caseBlocks = content.split(/^## /m).slice(1);
  const humanScores: Record<string, { score: number | null; note: string }> = {};

  for (const block of caseBlocks) {
    const idMatch = block.match(/^(TC-\d+|MT-[A-C]-\d+)/);
    if (!idMatch) continue;
    const id = idMatch[1];
    const scoreMatch = block.match(/\*\*人工评分\*\*[：:]\s*(\d+(?:\.\d+)?)/);
    const noteMatch = block.match(/\*\*人工备注\*\*[：:]?\s*(.+)/);
    humanScores[id] = {
      score: scoreMatch ? parseFloat(scoreMatch[1]) : null,
      note: noteMatch?.[1]?.trim() ?? '',
    };
  }

  // Infer label from filename
  const label = path.basename(reviewMdPath, '.md');
  const snapshot = loadSnapshot(label);

  let updated = 0;
  for (const result of snapshot.results) {
    const hs = humanScores[result.caseId];
    if (hs?.score !== null && hs?.score !== undefined) {
      (result as CaseResult & { humanScore?: { score: number; note: string } }).humanScore = {
        score: hs.score,
        note: hs.note,
      };
      updated++;
    }
  }

  const snapshotPath = path.join(HISTORY_DIR, `${label}.json`);
  fs.writeFileSync(snapshotPath, JSON.stringify(snapshot, null, 2), 'utf-8');
  console.log(`✅ 已将 ${updated} 条人工评分合并到 ${label}.json`);
}

function main(): void {
  const args = process.argv.slice(2);
  const compareIdx = args.indexOf('--compare');
  const importIdx = args.indexOf('--import-human-scores');

  if (compareIdx >= 0) {
    const labelA = args[compareIdx + 1];
    const labelB = args[compareIdx + 2];
    if (!labelA || !labelB) {
      console.error('用法: --compare <labelA> <labelB>');
      process.exit(1);
    }
    compareSnapshots(labelA, labelB);
  } else if (importIdx >= 0) {
    const mdPath = args[importIdx + 1];
    if (!mdPath) {
      console.error('用法: --import-human-scores <path/to/review.md>');
      process.exit(1);
    }
    importHumanScores(mdPath);
  } else {
    console.log('用法:');
    console.log('  npx tsx scripts/eval/report.ts --compare <labelA> <labelB>');
    console.log('  npx tsx scripts/eval/report.ts --import-human-scores <path/to/review.md>');
  }
}

main();
