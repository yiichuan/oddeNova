import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { access, mkdir, readFile, writeFile } from 'node:fs/promises';
import { extname, join } from 'node:path';

const directory = process.argv[2];
if (!directory) throw Error('用法：node scripts/sample-annotations/build-hierarchical-listening.mjs <实验目录>');
const root = '.local/sample-annotations';
const read = async path => JSON.parse(await readFile(path, 'utf8'));
const [config, inventory, catalog] = await Promise.all([
  read(join(directory, 'config.json')),
  read(join(root, 'inventory.json')),
  read('public/sample-annotations/catalog.json'),
]);
const byName = new Map(catalog.samples.map(sample => [sample.key, sample]));
const byId = new Map(inventory.map(file => [file.id, file]));
const audioDirectory = join(directory, 'listening-audio');
await mkdir(audioDirectory, { recursive: true });

const escape = value => String(value ?? '').replace(/[&<>"']/g, char => ({
  '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
})[char]);
const generated = new Set();
const problems = [];
let playable = 0;
let pairs = 0;
let comparable = 0;
const names = { structured: '全库结构化标注', hierarchical: '全库导览＋按需展开' };

async function audioFor(candidate) {
  const variant = byName.get(candidate.name)?.variants.find(v =>
    v.index === candidate.index && v.rootNote === candidate.rootNote && v.playback === candidate.playback);
  const file = byId.get(variant?.id);
  if (!file || !variant.sha256) throw Error('缺少原始录音映射');
  const urlHash = createHash('sha256').update(file.url).digest('hex');
  const path = join(root, 'audio', urlHash + extname(file.path).toLowerCase());
  const filename = variant.sha256 + '.mp3';
  if (!generated.has(filename)) {
    const bytes = await readFile(path);
    if (createHash('sha256').update(bytes).digest('hex') !== variant.sha256) throw Error('原始录音哈希不匹配');
    const destination = join(audioDirectory, filename);
    await access(destination).catch(() => {
      execFileSync('ffmpeg', ['-hide_banner', '-loglevel', 'error', '-y', '-i', path,
        '-map', '0:a:0', '-c:a', 'libmp3lame', '-q:a', '2', destination]);
    });
    generated.add(filename);
  }
  return 'listening-audio/' + filename;
}

async function renderSide(label, mode, trial, role, query) {
  const group = trial?.results?.find(result => result.id === role);
  const candidates = group?.ok ? group.candidates : [];
  const clips = [];
  let usable = 0;
  for (const [index, candidate] of candidates.entries()) {
    let player;
    try {
      const source = await audioFor(candidate);
      player = `<audio controls preload="none" src="${source}" aria-label="${label} 候选 ${index + 1}"></audio>`;
      playable++;
      usable++;
    } catch (error) {
      problems.push({ mode, role, query, playback: candidate.playback, error: String(error) });
      player = '<p>本地录音不可用</p>';
    }
    clips.push(`<li><strong>候选 ${index + 1}</strong>${player}<div class="answer" hidden><code>${escape(candidate.playback)}</code><p>${escape(candidate.selectionReason)}</p></div></li>`);
  }
  const missing = trial?.error ?? group?.error ?? (group ? '无候选' : '无检索结果');
  return {
    usable,
    html: `<div class="side"><h3>${label}<span class="answer" hidden> · ${names[mode]}</span></h3>${clips.length ? `<ol>${clips.join('')}</ol>` : `<p>${escape(missing)}</p>`}</div>`,
  };
}

const sections = [];
for (const [id, roles] of config.cases) {
  const results = Object.fromEntries(await Promise.all(Object.keys(names).map(async mode =>
    [mode, await read(join(directory, `${mode}-${id}.json`)).catch(() => null)])));
  for (const [role, query] of roles) {
    pairs++;
    const flip = createHash('sha256').update(config.hash + id + role).digest()[0] % 2;
    const modes = flip ? ['hierarchical', 'structured'] : ['structured', 'hierarchical'];
    const sides = [
      await renderSide('A', modes[0], results[modes[0]], role, query),
      await renderSide('B', modes[1], results[modes[1]], role, query),
    ];
    if (sides.every(side => side.usable)) comparable++;
    sections.push(`<section><h2>${escape(query)}</h2><p class="role">${escape(id)} · ${escape(role)}</p><div class="pair">${sides.map(side => side.html).join('')}</div><button type="button" class="reveal">揭晓这一组</button></section>`);
  }
}

await writeFile(join(directory, 'listening.html'), `<!doctype html>
<html lang="zh-CN"><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>采样检索 A/B 对比试听</title>
<style>
*{box-sizing:border-box}body{font:16px/1.55 system-ui,sans-serif;background:#f2f3ef;color:#18211e;margin:0}main{max-width:1050px;margin:auto;padding:40px 20px}
h1{font-size:clamp(26px,5vw,44px);line-height:1.1;margin:0 0 16px}h2{font-size:20px;margin:0}h3{margin:0;font-size:18px}
section{background:#fff;border:1px solid #d9dfd9;border-radius:12px;margin:24px 0;padding:20px}.role{color:#505d55;margin:4px 0 12px}.pair{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:12px}.side{background:#f4f7f3;border-radius:8px;padding:14px}
ol{padding:0;list-style:none;margin:0}li{padding:10px 0;border-top:1px solid #d9dfd9;margin-top:10px}audio{display:block;width:100%;margin-top:4px;height:40px}code{overflow-wrap:anywhere}button{border:1px solid #315b45;background:white;color:#173e28;border-radius:6px;padding:8px 12px;margin-top:12px;cursor:pointer;font:inherit}
@media(max-width:620px){.pair{grid-template-columns:1fr}main{padding:22px 12px}}
</style>
<main><h1>采样检索 A/B 对比试听</h1>
<p>${comparable}/${pairs} 组可双边试听，${playable} 个候选可播放。同一声部的两种方式随机放在 A 或 B，候选按模型返回顺序排列。播放原始采样录音的 MP3 转码，保留原音高与增益。</p>
<p><a href="report.md">查看用量和候选报告</a>（会揭晓分组）</p>
${sections.join('\n')}</main>
<script>
document.addEventListener('play', event => {
  if (!(event.target instanceof HTMLAudioElement)) return;
  for (const audio of document.querySelectorAll('audio')) if (audio !== event.target) audio.pause();
}, true);
for (const button of document.querySelectorAll('.reveal')) button.addEventListener('click', () => {
  const answers = [...button.closest('section').querySelectorAll('.answer')];
  const reveal = answers.some(answer => answer.hidden);
  for (const answer of answers) answer.hidden = !reveal;
  button.textContent = reveal ? '隐藏这一组' : '揭晓这一组';
});
</script></html>`);
await writeFile(join(directory, 'listening-check.json'), JSON.stringify({ pairs, comparable, playable, unique: generated.size, problems }, null, 2));
console.log(JSON.stringify({ pairs, comparable, playable, unique: generated.size, problems }));
