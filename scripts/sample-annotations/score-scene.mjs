import { readFile, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
const dir = '.local/sample-annotations/scene-eval';
if (!process.argv[2]) throw Error('Usage: node scripts/sample-annotations/score-scene.mjs RATINGS.json');
const ratings = JSON.parse(await readFile(process.argv[2], 'utf8'));
const answers = JSON.parse(await readFile(`${dir}/blind/answer-key.json`, 'utf8'));
const manifest = JSON.parse(await readFile(`${dir}/blind/blind-manifest.json`, 'utf8'));
const key = Buffer.from((await readFile(`${dir}/blind/shuffle-key.txt`, 'utf8')).trim(), 'hex');
if (ratings.studyId !== createHash('sha256').update(key).digest('hex').slice(0, 16)) throw Error('Ratings belong to another study');
for (const row of ratings.clips ?? []) {
  const expected = manifest.find(p => p.id === row.id);
  if (!expected || ['A','B'].some(side => row.clips[side]?.sha256 !== expected.clips[side].sha256)) throw Error('Clip hash mismatch');
}
const results = [];
for (const [pair, values] of Object.entries(ratings.ratings)) {
  if (!manifest.some(p => p.id === pair)) throw Error(`Unknown pair ${pair}`);
  for (const field of ['scene','timbre','overall']) {
    const value = values[field];
    if (!value) continue;
    if (!['A','B','tie','unknown'].includes(value)) throw Error('Invalid rating');
    const mapping = answers.find(a => a.pair === pair && a.side === (['A','B'].includes(value) ? value : 'A'));
    results.push({ pair, case: mapping.source.replace(/-\d+-(baseline|search)$/, ''), field,
      winner: ['A','B'].includes(value) ? mapping.condition : value });
  }
}
const count = rows => Object.fromEntries(['baseline','search','tie','unknown'].map(k => [k, rows.filter(r => r.winner === k).length]));
const overall = Object.fromEntries(['scene','timbre','overall'].map(field => [field, count(results.filter(r => r.field === field))]));
const byCase = Object.fromEntries([...new Set(results.map(r=>r.case))].map(id => [id, Object.fromEntries(['scene','timbre','overall'].map(field => [field, count(results.filter(r=>r.case===id && r.field===field))]))]));
await writeFile(`${dir}/listening-summary.json`, JSON.stringify({ overall, byCase, results, limitation: '完整创作对照；不能单独归因于标注；每场景重复三次，不能视为独立大样本。' }, null, 2));
console.log(JSON.stringify({ overall, byCase }, null, 2));
