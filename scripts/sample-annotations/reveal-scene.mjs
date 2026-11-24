import { readFile, writeFile, copyFile, access } from 'node:fs/promises';
import { execFileSync } from 'node:child_process';

const input = process.argv[2];
if (!input) throw Error('Usage: node scripts/sample-annotations/reveal-scene.mjs RATINGS.json');
// Validate study identity, clip hashes and rating values before revealing anything.
execFileSync(process.execPath, ['scripts/sample-annotations/score-scene.mjs', input], { stdio: 'pipe' });
const dir = '.local/sample-annotations/scene-eval';
const read = async file => JSON.parse(await readFile(file, 'utf8'));
const ratings = await read(input);
const summary = await read(`${dir}/listening-summary.json`);
const answers = await read(`${dir}/blind/answer-key.json`);
const manifest = await read(`${dir}/blind/blind-manifest.json`);
const cases = await read('scripts/sample-annotations/scene-cases.json');
const titles = ['雨天咖啡馆','霓虹夜路','清晨森林','废弃医院','海边度假','太空漂浮','古老城堡','滑稽潜行','工厂追逐','冬夜壁炉'];
const labels = { baseline: 'v25 · 对照组（无 searchSamples）', search: 'v27 · 实验组（提供标注检索）' };
const reveal = Object.fromEntries(manifest.map(p => [p.id, Object.fromEntries(['A','B'].map(side => {
  const answer = answers.find(a => a.pair === p.id && a.side === side);
  if (!answer || !labels[answer.condition]) throw Error('Incomplete answer key');
  return [side, labels[answer.condition]];
}))]));
const file = `${dir}/blind/review/index.html`;
const backup = `${dir}/blind/index-before-reveal.html`;
try { await access(backup); } catch { await copyFile(file, backup); }
let page = await readFile(backup, 'utf8');
const literal = value => JSON.stringify(value).replaceAll('<', '\\u003c');
const stats = summary.overall.scene;
page = page.replace("const pick=document.getElementById('pick');", `const revealedGroups=${literal(reveal)};\nconst submittedRatings=${literal(ratings.ratings)};\nconst pick=document.getElementById('pick');`);
page = page.replace("JSON.parse(localStorage.getItem(storageKey)||'{}')", "({...submittedRatings,...JSON.parse(localStorage.getItem(storageKey)||'{}')})");
page = page.replace('let state={};', 'let state={...submittedRatings};');
page = page.replace("box.append(el('h3','作品 '+side));", "box.append(el('h3','作品 '+side),el('p',revealedGroups[pair.id][side]));");
page = page.replace('<h1>先听，再选。</h1>', `<h1>盲听复盘</h1><p>已揭晓版本。原盲听评分：v27 胜 ${stats.search} 组，v25 胜 ${stats.baseline} 组，平局 ${stats.tie} 组，无法判断 ${stats.unknown} 组。三个评分维度结果一致。</p><p class="hint">下面保留你的评分，可以逐组回听。揭晓后重新导出的评分会标记为复盘评分；原始盲听评分已单独归档。</p>`);
page = page.replace('同一请求、同一轮次配对。每组 A/B 顺序独立打乱，已做成对响度匹配。', '同一请求、同一轮次配对。保留原 A/B 顺序和成对响度匹配，播放器下方已标注实际版本。');
page = page.replace('schemaVersion:1,studyId:', "schemaVersion:1,reviewMode:'revealed',studyId:");
page = page.replace("a.download='oddenova-scene-ratings.json'", "a.download='oddenova-scene-review-ratings.json'");
if (!page.includes("el('p',revealedGroups[pair.id][side])")) throw Error('Player template changed');
await writeFile(`${dir}/blind-ratings-original.json`, JSON.stringify(ratings, null, 2));
await writeFile(file, page);
const table = cases.map((c,i) => {
  const s = summary.byCase[c.id]?.scene ?? { search:0,baseline:0,tie:0,unknown:0 };
  return `| ${titles[i]} | ${s.search} | ${s.baseline} | ${s.tie} | ${s.unknown} |`;
}).join('\n');
const pairs = manifest.map(p=>`| ${p.id} | ${reveal[p.id].A} | ${reveal[p.id].B} | ${ratings.ratings[p.id]?.scene ?? '未评分'} |`).join('\n');
await writeFile(`${dir}/listening-summary.md`, `# 场景配乐盲听结果\n\n29 组均已评分，场景贴合度、乐器音色贴切度、个人偏好三个维度的选择逐组一致。v27 胜 9 组，v25 胜 8 组，6 组平局，6 组无法判断。明确分出胜负的 17 组中，v27 占 52.9%，没有明显优势证据。\n\n| 场景 | v27 胜 | v25 胜 | 平局 | 无法判断 |\n|---|---:|---:|---:|---:|\n${table}\n\n按各场景胜场数比较，v27 领先 3 个场景、v25 领先 3 个场景、4 个场景持平。太空漂浮仅有两组可听，另一次因一侧播放失败排除。重复三次并非独立大样本，三个评分维度也不能当作三份独立证据；本轮同时改变提示词、检索与编曲，不能单独归因于标注。\n\n## 每组映射与原始选择\n\n| 组 | A | B | 原始场景评分 |\n|---|---|---|---|\n${pairs}\n`);
console.log(`Revealed ${manifest.length} pairs; original ratings archived.`);
