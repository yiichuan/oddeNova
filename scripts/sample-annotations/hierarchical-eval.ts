import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import {
  MODEL_BATCH_SEARCH_PROMPT, MODEL_BATCH_SEARCH_TOOL, resolveModelSearchResults,
  type resolveModelCandidates,
} from '../../src/lib/sample-model-candidates';
import { serializeFullCatalog } from '../../src/lib/sample-catalog-context';
import type { SearchCatalog } from '../../src/lib/sample-search';
import { PROVIDER_PRESETS } from '../../src/services/llm-config';

type ToolCall = { id: string; type: 'function'; function: { name: string; arguments: string } };
type Message = { role: string; content: string | null; tool_calls?: ToolCall[]; tool_call_id?: string };
type Usage = { prompt_tokens: number; completion_tokens: number; prompt_cache_hit_tokens?: number };
type Response = { usage?: Usage; model?: string; choices: { message: Message }[] };
type Trace = { file: string; ms: number; usage?: Usage };
const cases = [
  ['funk-drums', [['kick', '适合 Funk 的鼓机底鼓'], ['snare', '适合切分的鼓机军鼓'], ['hat', '适合连续八分音符的踩镲']]],
  ['dry-snare', [['snare', '起音清晰、短尾、干声的军鼓']]],
  ['soft-piano', [['piano', '用于舒缓旋律的柔和钢琴，避免尖锐的高频敲击感']]],
  ['recorder', [['recorder', '能演奏持续长音与短音的中音竖笛']]],
  ['sax', [['sax', '有气息和厚度的次中音萨克斯短奏']]],
  ['harp', [['harp', '自然衰减、给音符之间留空的竖琴']]],
  ['hand-drums', [['bongo', '高声部邦戈鼓'], ['conga', '低声部康加鼓']]],
  ['organ', [['organ', '声音厚实、有清楚呼吸感、适合和声的管风琴']]],
  ['bells', [['bells', '可用于旋律的清亮金属打击乐，音头清晰，尾音有鸣响']]],
  ['texture', [['birds', '自然环境中用作稀疏点缀的短促鸟鸣']]],
  ['hollow-drop', [['accent', '像水滴一样空心、圆润、短促的点缀声，类别不限']]],
  ['machine-breath', [['texture', '像老旧机器喘息的粗糙起伏声，有颗粒感，类别不限']]],
] as const;
const modes = ['structured', 'hierarchical'] as const;
type Mode = typeof modes[number];

const detailsTool = {
  type: 'function',
  function: {
    name: 'readSampleDetails',
    description: '批量展开导览中尚未读取的准确音色名称，返回文件级标注、variantId 和全部已读音色名称。已读详情保留在对话中，可直接比较。',
    parameters: {
      type: 'object', additionalProperties: false, required: ['names'],
      properties: { names: { type: 'array', minItems: 1, items: { type: 'string' } } },
    },
  },
};
const overviewPrompt = `目标：根据每个音色的已有文件标注写简短的检索导览。
原则：依据标注写主要听感和有辨识度的内部差异，尽量保留少量但独特的声音。
知识：同名音色可有多个根音、奏法或截然不同的变体。联想表示听感相似，不代表声源类别。
引导：每项通常两句以内，先写主要听感，再用“部分偏……，另一些偏……”说明有辨识度的内部差异。只有一个文件时概括它的听感即可。异质音色可以写得稍长。
约束：不根据名称猜测，不把不同文件各自的特征合并为一个虚构文件。不引用文件编号、variantId 或播放代码，不逐文件列举。输出 JSON 对象，键为输入名称，值为中文概览。
自检：名称是否完整且准确？主要听感和少数独特声音是否有标注依据？是否避免相互矛盾的概括？概览是否能帮助判断该音色组值得展开？`;
const browsePrompt = `目标：为本批音色需求选择可用的采样文件。
原则：尊重明确乐器和奏法，听感作为偏好，联想不代表实际声源。按需求独立选样。
知识：导览按类别列出音色名称和听感概览。每个音色展开后可看到独立文件的证据和 variantId。工具反馈列出全部已读音色，其详情仍在对话中，可直接使用。
引导：首次展开时，可合并读取几个相关且有代表性的音色，覆盖已确定的需求。已有候选满足需求且文件级证据足以说明取舍时，直接返回结果。继续搜索应针对具体缺口，例如现有候选尾音过长、缺少要求的奏法或可演奏音高；优先读取有望补足缺口的未读音色。避免为了寻找可能存在的更优声音而反复探索。理由引用文件级信息并说明局限。
约束：只使用已读取的 variantId。最后只调用一次 returnCandidates，按查询 id 返回各组；不合适时返回空组。limit 是期望数量。
自检：是否覆盖全部查询？是否尊重声源、奏法和听感需求？已有证据是否足够返回？继续展开能够解决什么尚未满足的需求？`;

const { model, baseURL } = PROVIDER_PRESETS.deepseek;
const settings = { model, thinking: { type: 'disabled' }, temperature: 0, max_tokens: 4096 };
const cell = (value: unknown) => String(value ?? '-').replaceAll('|', '\\u007c').replaceAll('\r', '\\r').replaceAll('\n', '\\n');
const total = (trace: Trace[], field: keyof Usage) =>
  trace.length && trace.every(t => typeof t.usage?.[field] === 'number')
    ? trace.reduce((sum, t) => sum + t.usage![field]!, 0) : null;

async function main() {
  const key = process.env.DEEPSEEK_API_KEY;
  const source = await readFile('public/sample-annotations/catalog.json', 'utf8');
  const catalog = JSON.parse(source) as SearchCatalog;
  const baseline = serializeFullCatalog(catalog);
  const detailLegend = baseline.legend.replace('tail|reverb', 'tail|reverb|声音描述|听感联想|播放示例');
  const details = new Map(catalog.samples.map(sample => [sample.key, {
    ids: [] as string[],
    lines: [`@ ${cell(sample.key)} | ${cell(sample.category)}`],
  }]));
  for (const [id, { sample, variant }] of Object.entries(baseline.rows)) {
    const detail = details.get(sample.key)!;
    detail.ids.push(id);
    detail.lines.push([
      baseline.variantTexts.get(variant)!.split('\n').at(-1),
      cell(variant.soundDescription?.text), cell(variant.soundDescription?.associations.join('、')),
      cell(variant.playback),
    ].join('|'));
  }
  if (process.argv.includes('--dry-run')) {
    const variants = Object.keys(baseline.rows).length;
    const categories = new Set(catalog.samples.map(sample => sample.category));
    if (details.size !== catalog.samples.length ||
      variants !== catalog.samples.reduce((sum, sample) => sum + sample.variants.length, 0) ||
      [...details.values()].some(detail => detail.ids.length !== detail.lines.length - 1)) {
      throw Error('目录名称或文件映射不完整');
    }
    console.log(JSON.stringify({
      names: details.size, variants, categories: categories.size, trials: cases.length * modes.length,
      structuredBytes: Buffer.byteLength(baseline.text),
    }, null, 2));
    return;
  }
  if (!key) throw Error('需要 DEEPSEEK_API_KEY');
  const hash = createHash('sha256').update(source)
    .update(await readFile(new URL(import.meta.url)))
    .update(JSON.stringify(settings)).digest('hex');
  const directory = join('.local/sample-annotations/hierarchical-eval', hash.slice(0, 12));
  await mkdir(directory, { recursive: true });
  await writeFile(join(directory, 'config.json'), JSON.stringify({ hash, settings, cases, modes, names: details.size, variants: Object.keys(baseline.rows).length }, null, 2));

  async function call(file: string, body: object, signal: AbortSignal, trace: Trace[]) {
    const request = { ...settings, ...body };
    const start = performance.now();
    let response: Response | undefined;
    let status: number | undefined;
    let error: string | undefined;
    try {
      const result = await fetch(`${baseURL}/chat/completions`, {
        method: 'POST', signal,
        headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
        body: JSON.stringify(request),
      });
      status = result.status;
      if (!result.ok) throw Error(`HTTP ${status}: ${(await result.text()).slice(0, 700)}`);
      response = await result.json() as Response;
    } catch (cause) {
      error = cause instanceof Error ? [cause.message, (cause.cause as Error | undefined)?.message].filter(Boolean).join(': ') : String(cause);
    }
    const record = { file, ms: Math.round(performance.now() - start), usage: response?.usage };
    trace.push(record);
    await writeFile(join(directory, file), JSON.stringify({ request, response, status, error, ...record }));
    if (!response) throw Error(error);
    return response.choices[0].message;
  }

  const chunks = Array.from({ length: Math.ceil(catalog.samples.length / 24) },
    (_, i) => catalog.samples.slice(i * 24, (i + 1) * 24));
  const overviews = new Map<string, string>();
  const overviewTrace: Trace[] = [];
  async function summarize(chunk: SearchCatalog['samples'], i: number) {
    const saved = join(directory, `overview-${i}.json`);
    const existing = await readFile(saved, 'utf8').then(s => JSON.parse(s), () => null);
    const trace: Trace[] = [];
    const requestFile = `overview-${i}-request.json`;
    const previousAttempt = existing ? null : await readFile(join(directory, requestFile), 'utf8')
      .then(s => JSON.parse(s) as Trace, () => null);
    if (previousAttempt?.usage) trace.push({ file: requestFile, ms: previousAttempt.ms, usage: previousAttempt.usage });
    const retryFile = `overview-${i}-retry-request.json`;
    const previousRetry = existing ? null : await readFile(join(directory, retryFile), 'utf8')
      .then(s => JSON.parse(s) as Trace, () => null);
    if (previousRetry?.usage) trace.push({ file: retryFile, ms: previousRetry.ms, usage: previousRetry.usage });
    const responseFile = previousRetry ? `overview-${i}-numbered-request.json` : previousAttempt ? retryFile : requestFile;
    const keys = chunk.map((sample, index) => previousAttempt ? String(index + 1) : sample.key);
    const rawOutput = existing?.output ?? JSON.parse((await call(responseFile, {
      response_format: { type: 'json_object' },
      ...(previousAttempt && { max_tokens: 8192 }),
      messages: [{ role: 'system', content: overviewPrompt }, {
        role: 'user', content: JSON.stringify(chunk.map((sample, index) => ({
          name: keys[index],
          category: sample.category,
          variants: sample.variants.map(variant => ({
            rootNote: variant.rootNote,
            articulation: variant.articulation,
            features: variant.features,
            soundDescription: variant.soundDescription,
          })),
        }))) +
          '\n输出 JSON。每个音色名称只对应一段简短字符串，格式如 {"音色名":"主要听感及内部差异。"}。值不能是对象或数组，不要逐文件列举。',
      }],
    }, AbortSignal.timeout(180_000), trace)).content ?? '');
    const outputKeys = existing ? chunk.map(sample => sample.key) : keys;
    if (!rawOutput || Object.keys(rawOutput).length !== chunk.length ||
      outputKeys.some(key => !Object.hasOwn(rawOutput, key) || typeof rawOutput[key] !== 'string' || !rawOutput[key].trim())) {
      throw Error(`导览批次 ${i} 未覆盖准确的音色名称`);
    }
    const output = Object.fromEntries(chunk.map((sample, index) => [sample.key, rawOutput[outputKeys[index]]]));
    for (const sample of chunk) overviews.set(sample.key, output[sample.key].trim());
    const savedTrace: Trace[] = existing?.trace ?? trace;
    overviewTrace.push(...savedTrace);
    if (!existing) await writeFile(saved, JSON.stringify({ output, trace: savedTrace }));
    if ((i + 1) % 5 === 0 || i === 0) console.log(`导览批次 ${i + 1}/${chunks.length} 已保存`);
  }

  // Probe connectivity and the configured model before starting the remaining batches.
  await summarize(chunks[0], 0);

  type Trial = Awaited<ReturnType<typeof runCase>>;
  const trials: Trial[] = [];
  async function runCase(mode: Mode, entry: typeof cases[number], guide: string) {
    const [id, roles] = entry;
    const queries = roles.map(([role, query]) => ({ id: role, query, limit: 3 }));
    const file = `${mode}-${id}`;
    const trace: Trace[] = [];
    const loaded = new Set<string>();
    const allowed = Object.create(null) as typeof baseline.rows;
    const tools = mode === 'hierarchical' ? [detailsTool, MODEL_BATCH_SEARCH_TOOL] : [MODEL_BATCH_SEARCH_TOOL];
    const content = mode === 'hierarchical' ? guide : baseline.text;
    const prompt = mode === 'hierarchical' ? browsePrompt : MODEL_BATCH_SEARCH_PROMPT;
    const messages: Message[] = [
      { role: 'system', content: prompt }, { role: 'user', content },
      { role: 'user', content: JSON.stringify({ queries }) },
    ];
    const start = performance.now();
    const signal = AbortSignal.timeout(180_000);
    let results: ReturnType<typeof resolveModelSearchResults> | undefined;
    let error: string | undefined;
    try {
      for (let round = 1; !results; round++) {
        signal.throwIfAborted();
        const message = await call(`${file}-${round}.json`, { messages, tools }, signal, trace);
        const calls = message.tool_calls ?? [];
        if (!calls.length) throw Error('模型没有调用工具');
        if (calls.length === 1 && calls[0].function.name === 'returnCandidates') {
          const args = JSON.parse(calls[0].function.arguments);
          results = resolveModelSearchResults(args.results, mode === 'hierarchical' ? allowed : baseline.rows, queries);
          continue;
        }
        if (mode !== 'hierarchical' || calls.some(c => c.function.name !== 'readSampleDetails')) {
          throw Error('模型返回了意外的工具调用组合');
        }
        messages.push({ role: 'assistant', content: message.content ?? null, tool_calls: calls });
        for (const toolCall of calls) {
          const { names } = JSON.parse(toolCall.function.arguments);
          if (!Array.isArray(names) || !names.length || names.some(name => typeof name !== 'string')) throw Error('无效的 names');
          const lines: string[] = [];
          for (const name of new Set<string>(names)) {
            const detail = details.get(name);
            if (!detail) lines.push(`未知音色名称：${cell(name)}`);
            else if (loaded.has(name)) lines.push(`已展开：${cell(name)}。完整详情在此前工具消息中，请直接使用。`);
            else {
              if (!Object.keys(allowed).length) lines.push(detailLegend);
              lines.push(...detail.lines);
              loaded.add(name);
              for (const variantId of detail.ids) allowed[variantId] = baseline.rows[variantId];
            }
          }
          lines.push(`全部已读音色：${JSON.stringify([...loaded])}`);
          lines.push('已读详情保留在对话中。候选和证据充分时可直接返回；仍有具体需求缺口时可展开相关未读音色。');
          messages.push({ role: 'tool', tool_call_id: toolCall.id, content: lines.join('\n') });
        }
      }
    } catch (cause) {
      error = String(cause);
    }
    const result = { mode, id, queries, trace, results, error, ms: Math.round(performance.now() - start),
      names: [...loaded], variants: Object.keys(allowed).length };
    await writeFile(join(directory, `${file}.json`), JSON.stringify(result, null, 2));
    console.log(`${file}: ${error ?? `${total(trace, 'prompt_tokens')} 输入 / ${trace.length} 轮`}`);
    return result;
  }

  async function runMode(mode: Mode, guide = '') {
    for (const entry of cases) {
      const previous = await readFile(join(directory, `${mode}-${entry[0]}.json`), 'utf8').then(s => JSON.parse(s) as Trial, () => null);
      trials.push(previous ?? await runCase(mode, entry, guide));
    }
  }

  const jobs = await Promise.allSettled([
    runMode('structured'),
    (async () => {
      let next = 1;
      const workers = await Promise.allSettled(Array.from({ length: 6 }, async () => {
        while (next < chunks.length) {
          const i = next++;
          await summarize(chunks[i], i);
        }
      }));
      const failures = workers.filter(result => result.status === 'rejected');
      if (failures.length || overviews.size !== details.size) {
        throw Error(`导览不完整 (${overviews.size}/${details.size})：${failures.map(f => String(f.reason)).join('；')}`);
      }
      const categories = Map.groupBy(catalog.samples, sample => sample.category ?? '未分类');
      const guide = [...categories].flatMap(([category, samples]) => [
        `@ ${cell(category)}（${samples.length} 个音色）`,
        ...samples.map(s => [s.key, overviews.get(s.key)].map(cell).join('|')),
      ]).join('\n');
      await writeFile(join(directory, 'guide.txt'), guide);
      const summaries = Object.fromEntries(catalog.samples.map(sample => [sample.key, overviews.get(sample.key)]));
      await writeFile(join(directory, 'guide.json'), JSON.stringify(summaries, null, 2) + '\n');
      await runMode('hierarchical', '目录列顺序：音色名称|听感概览\n' + guide);
    })(),
  ]);

  const input = (trial: Trial) => total(trial.trace, 'prompt_tokens');
  const success = (trial: Trial) => !trial.error && !!trial.results?.every(r => r.ok);
  const percent = (base: number | null, newer: number | null) =>
    base && newer !== null ? `${(100 * (1 - newer / base)).toFixed(1)}%` : '—';
  const lines = [
    '# 全库导览检索实验', '',
    `模型 ${model}，每种方式每条运行一次。`,
    `导览生成输入 / 输出 token：${total(overviewTrace, 'prompt_tokens') ?? '未知'} / ${total(overviewTrace, 'completion_tokens') ?? '未知'}。`,
    '', '| 方式 | 查询 | 状态 | 轮数 | 输入 | 输出 | 缓存读取 | 秒 | 展开音色 / 文件 |',
    '|---|---|---|---:|---:|---:|---:|---:|---:|',
  ];
  for (const mode of modes) for (const [id] of cases) {
    const t = trials.find(trial => trial.mode === mode && trial.id === id);
    if (!t) continue;
    lines.push(`| ${mode} | ${id} | ${success(t) ? '有效' : '失败'} | ${t.trace.length} | ${input(t) ?? '—'} | ${total(t.trace, 'completion_tokens') ?? '—'} | ${total(t.trace, 'prompt_cache_hit_tokens') ?? '—'} | ${(t.ms / 1000).toFixed(1)} | ${mode === 'hierarchical' ? t.names.length + ' / ' + t.variants : '—'} |`);
  }
  {
    const mode = 'structured';
    lines.push('', `相对 ${mode} 的输入 token 降幅，比较两边均有完整 usage 的查询。`);
    const pairs = cases.flatMap(([id]) => {
      const a = trials.find(t => t.mode === mode && t.id === id);
      const b = trials.find(t => t.mode === 'hierarchical' && t.id === id);
      if (!a || !b) return [];
      const base = input(a), newer = input(b);
      return base !== null && newer !== null ? [{ id, base, newer }] : [];
    });
    for (const { id, base, newer } of pairs) lines.push(`- ${id}：${percent(base, newer)}`);
    lines.push(`- 合计（${pairs.length} 对）：${percent(pairs.reduce((s, p) => s + p.base, 0), pairs.reduce((s, p) => s + p.newer, 0))}`);
    const valid = pairs.filter(({ id }) => [mode, 'hierarchical'].every(m =>
      trials.some(t => t.id === id && t.mode === m && success(t))));
    lines.push(`- 两边均返回有效结果（${valid.length} 对）：${percent(valid.reduce((s, p) => s + p.base, 0), valid.reduce((s, p) => s + p.newer, 0))}`);
  }
  lines.push('', '## 候选与失败详情');
  for (const [id] of cases) {
    lines.push('', `### ${id}`);
    for (const mode of modes) {
      const trial = trials.find(t => t.id === id && t.mode === mode);
      if (!trial) continue;
      lines.push('', `**${mode}**`);
      if (trial.error) lines.push(`- 请求失败：${trial.error}`);
      for (const result of trial.results ?? []) {
        if (!result.ok) lines.push(`- ${result.id}：${result.error}`);
        else if (!result.candidates.length) lines.push(`- ${result.id}：无候选`);
        else for (const candidate of result.candidates as ReturnType<typeof resolveModelCandidates>) {
          lines.push(`- ${result.id}：${candidate.playback}（${candidate.category ?? '未分类'}，${candidate.articulation ?? '未标注奏法'}）。${candidate.selectionReason}`);
        }
      }
    }
  }
  for (const job of jobs) if (job.status === 'rejected') lines.push('', `实验错误：${job.reason}`);
  await writeFile(join(directory, 'report.md'), lines.join('\n') + '\n');
  console.log(join(directory, 'report.md'));
  if (jobs.some(j => j.status === 'rejected') || trials.some(t => !success(t))) process.exitCode = 1;
}

await main();
