import { readFile, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { rankSamples } from './keyword-search.ts';
import { parseSampleSearchInput } from '../../src/lib/sample-search-batch.ts';

const dir = '.local/sample-annotations/scene-eval';
const read = async file => JSON.parse(await readFile(`${dir}/${file}`, 'utf8'));
const config = await read('config.json');
const catalog = await read('inputs/catalog.json');
const sha = text => createHash('sha256').update(text).digest('hex');
for (const file of ['scripts/sample-annotations/keyword-search.ts', 'src/lib/sample-search.ts', 'src/lib/sample-search-batch.ts']) {
  if (sha(await readFile(file, 'utf8')) !== config.sources[file]) {
    throw Error('Search implementation changed; replay with the source version recorded by the evaluation.');
  }
}
const records = [], missing = [], queries = [];
const midi = note => {
  if (typeof note === 'number') return note;
  const m = String(note).match(/^([a-g])([#bsf]?)(-?\d+)$/i);
  return m ? (Number(m[3])+1)*12 + ({c:0,d:2,e:4,f:5,g:7,a:9,b:11}[m[1].toLowerCase()]) + ({'':0,'#':1,s:1,b:-1,f:-1}[m[2]]) : null;
};
for (const item of config.cases) for (let repeat = 0; repeat < config.repeats; repeat++) for (const condition of ['baseline', 'search']) {
  const id = `${item.id}-${repeat}-${condition}`;
  let data;
  try { data = await read(`${id}.json`); }
  catch {
    let error = null;
    try { error = (await read(`${id}.json.error`)).error; } catch { /* pending */ }
    missing.push({ id, error }); continue;
  }
  const searches = data.progress.filter(e => e.kind === 'tool_call' && e.name === 'searchSamples');
  const retrieved = new Set();
  const retrievedRoots = new Map();
  for (const input of searches.flatMap(event => parseSampleSearchInput(event.args).queries)) {
    const candidates = rankSamples(catalog, input);
    for (const c of candidates) {
      retrieved.add(`${c.name}:${c.index}`);
      for (const v of [c,...c.alternatives]) {
        const key = `${c.name}:${v.index}`;
        retrieved.add(key);
        retrievedRoots.set(key, [...(retrievedRoots.get(key) ?? []), v.rootNote]);
      }
    }
    queries.push({ id, input, empty: !candidates.length, zeroScore: candidates.filter(c => c.score === 0).length,
      candidates: candidates.map(c => {
        const values = { ...c.features?.timbre, ...c.features?.envelope, ...c.features?.space };
        const checks = Object.entries(input.features ?? {}).map(([key, wanted]) => ({ key, wanted, actual: values[key] ?? null,
          matched: (Array.isArray(wanted) ? wanted : [wanted]).every(v => (Array.isArray(values[key]) ? values[key] : [values[key]]).includes(v)) }));
        return { name: c.name, category: c.category, index: c.index, rootNote: c.rootNote, score: c.score, checks, features: c.features };
      }) });
  }
  let render = null;
  try { render = await read(`blind/raw/${id}.json`); } catch { /* pending */ }
  const sounds = (render?.sounds ?? []).map(sound => {
    const name = sound.bank ? `${sound.bank}_${sound.s}` : sound.s;
    const sample = catalog.samples.find(s => s.key === name || s.aliases.includes(name));
    const index = Number(sound.n ?? 0);
    const roots = [...new Set(sample?.variants.map(v=>v.rootNote).filter(Boolean) ?? [])];
    const pitch = midi(sound.note);
    const root = roots.length && pitch !== null ? roots.reduce((best,n)=>Math.abs(midi(n)-pitch)<Math.abs(midi(best)-pitch)?n:best) : null;
    const applicable = sample?.variants.filter(v=>!roots.length || (root !== null && v.rootNote===root)) ?? [];
    const count = applicable.length;
    const resolvedIndex = count ? ((Math.round(index) % count) + count) % count : null;
    return { ...sound, name, index, inCatalog: Boolean(sample), hasListeningAnnotation: sample?.variants.some(v => v.features) ?? false,
      indexExists: sample ? sample.variants.some(v => v.index === index) : null,
      nearestRoot: root, indexExistsAtPlayedRoot: sample && (!roots.length || root !== null) ? applicable.some(v=>v.index===index) : null,
      resolvedIndex, indexWrapped: resolvedIndex !== null && resolvedIndex !== index,
      retrievedRoots: sample ? retrievedRoots.get(`${sample.key}:${index}`) ?? [] : [],
      annotationRootMatches: sample && root !== null && retrieved.has(`${sample.key}:${index}`) ? (retrievedRoots.get(`${sample.key}:${index}`) ?? []).includes(root) : null,
      fromCandidates: sample ? retrieved.has(`${sample.key}:${index}`) : false };
  });
  records.push({ id, case: item.id, repeat, condition, committed: data.result.committed, validation: data.validation,
    elapsedMs: data.elapsedMs, usage: data.calls.reduce((acc, c) => ({ input: acc.input + (c.response.usage?.prompt_tokens ?? 0), output: acc.output + (c.response.usage?.completion_tokens ?? 0) }), { input: 0, output: 0 }),
    searchCalls: searches.length, sounds, render: render ? { error: render.error, seconds: render.seconds, peak: render.peak } : null });
}
const groups = Object.fromEntries(['baseline', 'search'].map(condition => {
  const rows = records.filter(r => r.condition === condition);
  return [condition, { completed: rows.length, committed: rows.filter(r => r.committed).length, valid: rows.filter(r => r.validation.ok).length,
    usedSearch: rows.filter(r => r.searchCalls).length, searchCalls: rows.reduce((n, r) => n + r.searchCalls, 0),
    rendered: rows.filter(r => r.render && !r.render.error).length,
    averageElapsedMs: rows.length ? Math.round(rows.reduce((n,r)=>n+r.elapsedMs,0)/rows.length) : null,
    tokens: rows.reduce((a, r) => ({ input: a.input + r.usage.input, output: a.output + r.usage.output }), { input: 0, output: 0 }) }];
}));
const pairs = config.cases.flatMap(item => Array.from({ length: config.repeats }, (_, repeat) => {
  const rows = records.filter(r => r.case === item.id && r.repeat === repeat);
  return { case: item.id, repeat, complete: rows.length === 2, listenable: rows.length === 2 && rows.every(r => r.validation.ok && r.render && !r.render.error) };
}));
const result = { groups, pairs, missing, queries, records };
result.diagnostics = {
  emptyQueries: queries.filter(q=>q.empty).length,
  candidateChecks: queries.flatMap(q=>q.candidates.flatMap(c=>c.checks)).length,
  unmatchedCandidateChecks: queries.flatMap(q=>q.candidates.flatMap(c=>c.checks)).filter(c=>!c.matched).length,
  playedSounds: records.flatMap(r=>r.sounds).length,
  rootMismatchEvents: records.flatMap(r=>r.sounds).filter(s=>s.annotationRootMatches===false).length,
  wrappedIndexEvents: records.flatMap(r=>r.sounds).filter(s=>s.indexWrapped).length,
  renderFailures: records.filter(r=>r.render?.error).map(r=>({id:r.id,error:r.render.error})),
};
await writeFile(`${dir}/audit.json`, JSON.stringify(result, null, 2));
await writeFile(`${dir}/report.md`, `# 场景配乐评测技术报告\n\n完成 ${records.length}/60 次创作，可试听 ${pairs.filter(p => p.listenable).length}/30 对。\n\n| 条件 | 完成 | 已提交 | 校验通过 | 使用检索 | 搜索次数 | 渲染完成 | 输入/输出 Token |\n|---|---:|---:|---:|---:|---:|---:|---|\n${Object.entries(groups).map(([k,v])=>`| ${k} | ${v.completed} | ${v.committed} | ${v.valid} | ${v.usedSearch} | ${v.searchCalls} | ${v.rendered} | ${v.tokens.input}/${v.tokens.output} |`).join('\n')}\n\n实际查询 ${queries.length} 次，其中空结果 ${queries.filter(q=>q.empty).length} 次，含零分候选 ${queries.filter(q=>q.zeroScore).length} 次。详细查询、候选及显式特征匹配见 audit.json；自然语言条件和类别准确性仍需逐例审阅。\n\n声音统计来自实际渲染事件，未标注音源不作为错误。indexExists 检查原始编号；indexExistsAtPlayedRoot 检查演奏音区；resolvedIndex 按引擎取整并循环编号，超出编号不直接判作无法播放。annotationRootMatches 检查候选标注音区与演奏音区是否一致。候选命中不代表听感合适。\n\n盲听尚未评分，不能判断哪组更贴合场景。对照包含提示词、检索及编曲变化，不能单独归因于标注。失败与缺失见 audit.json，不计作任何一组获胜。\n`);
console.log(JSON.stringify({ groups, completePairs: pairs.filter(p=>p.complete).length, listenablePairs: pairs.filter(p=>p.listenable).length, missing: missing.length }));
