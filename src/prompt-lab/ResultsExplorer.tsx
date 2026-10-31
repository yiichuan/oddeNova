import { verdict, usageLabel } from './metrics';
import { useEffect, useState } from 'react';
import { buildCodeDiff } from '../lib/code-diff';
import { promptLabStorage } from './storage';
import type { LabReview, PromptLabCase, PromptLabExperiment, PromptLabResult } from './types';

function Trace({ result }: { result: PromptLabResult }) {
  const [open, setOpen] = useState(false);
  const [events, setEvents] = useState(result.trace);
  useEffect(() => { if (open && result.traceId) void promptLabStorage.getTrace(result.traceId).then(setEvents).catch(() => setEvents([])); }, [open, result.traceId]);
  return <details onToggle={e => setOpen(e.currentTarget.open)}><summary>调用记录</summary>{open && <pre className="plab-code">{JSON.stringify(events, null, 2)}</pre>}</details>;
}
function Result({ result, resultId, criteria, onPlay, playing, disabled, onReplay, onRegression }: { result: PromptLabResult; resultId?: string; criteria?: string[]; onPlay: (id: string, code: string) => void; playing: string; disabled: boolean; onReplay: (r: PromptLabResult) => void; onRegression: (r: PromptLabResult) => void }) {
  const id = resultId ?? `${result.inputSnapshot?.code}-${result.trialIndex}-${result.turnIndex}-${result.instruction}-${result.code}`;
  const [diffOpen, setDiffOpen] = useState(false);
  return <div className="plab-repeat-result"><strong>对话 {(result.turnIndex ?? 0) + 1} · {result.instruction}</strong><p>{result.explanation}</p>{criteria?.length ? <p>人工检查：{criteria.join(' · ')}</p> : null}{result.error && <p role="alert">{result.error}</p>}
    <div>{result.checks.map(c => <span key={c.label} className={c.passed ? 'plab-check-pass' : 'plab-check-fail'}>{c.passed ? '✓' : '×'} {c.label} </span>)}</div><p className="plab-muted">{(result.durationMs / 1000).toFixed(1)} 秒 · {usageLabel(result)}</p>
    <button className="plab-button" disabled={disabled || !result.code} onClick={() => onPlay(id, result.code)}>{playing === id ? '停止试听' : '试听'}</button>
    <button className="plab-button" disabled={!result.inputSnapshot || disabled} onClick={() => onReplay(result)}>用这一步重新比较（重新运行）</button><button className="plab-button" disabled={!result.inputSnapshot} onClick={() => onRegression(result)}>保存为回归用例</button>
    <details><summary>生成代码</summary><pre className="plab-code">{result.code}</pre></details><details onToggle={e => setDiffOpen(e.currentTarget.open)}><summary>相对输入的代码变化</summary>{diffOpen && <pre className="plab-code">{JSON.stringify(buildCodeDiff(result.inputSnapshot?.code ?? '', result.code), null, 2)}</pre>}</details><Trace result={result} />
  </div>;
}
function Pair({ experiment, testCase, trial, left, right, onPlay, playing, disabled, onReplay, onRegression, onReviewChanged }: { onReviewChanged: (review: LabReview) => void; experiment: PromptLabExperiment; testCase: PromptLabCase; trial: number; left: PromptLabResult[]; right: PromptLabResult[]; onPlay: (id: string, code: string) => void; playing: string; disabled: boolean; onReplay: (r: PromptLabResult) => void; onRegression: (r: PromptLabResult) => void }) {
  const [review, setReview] = useState<LabReview>();
  const [status, setStatus] = useState('');
  const [expanded, setExpanded] = useState(false);
  const [loadAttempt, setLoadAttempt] = useState(0);
  const [loadError, setLoadError] = useState('');
  const [saving, setSaving] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [outputDiff, setOutputDiff] = useState(false);
  useEffect(() => {
    let alive = true;
    setLoaded(false);
    setLoadError('');
    const id = `${experiment.id}-${testCase.id}-${trial}`;
    void promptLabStorage.getReview(id).then(value => { if (alive) { setReview(value); setLoaded(true); } }).catch(e => { if (alive) setLoadError(String(e)); });
    return () => { alive = false; };
  }, [experiment.id, testCase.id, trial, loadAttempt]);
  const initial = (): LabReview => ({ id: `${experiment.id}-${testCase.id}-${trial}`, revision: 0, experimentId: experiment.id, caseId: testCase.id, trialIndex: trial, note: '', swapped: !!(crypto.getRandomValues(new Uint8Array(1))[0] & 1), revealed: false, mode: 'standard' });
  const current = review;
  async function save(patch: Partial<LabReview>) {
    setSaving(true);
    try { const next = await promptLabStorage.saveReview({ ...(review ?? initial()), ...patch }); setReview(next); onReviewChanged(next); setStatus('已保存'); return next; }
    catch (e) { setStatus(`保存失败，保留输入：${String(e)}`); return undefined; }
    finally { setSaving(false); }
  }
  const hidden = !loaded || current?.mode === 'blind' && !current.revealed;
  const sides = hidden && current?.swapped ? ['right', 'left'] as const : ['left', 'right'] as const;
  const ended = loaded && experiment.status !== 'running' && (!experiment.historySources || [left, right].every(results => testCase.turns.every((_, index) => results.some(r => r.turnIndex === index))));
  return <>
    <tr>
      <td>{testCase.name}<small>第 {trial + 1} 次 · {testCase.turns.length} 轮</small></td>
      <td><button className="plab-input-preview" onClick={() => setExpanded(true)}>{testCase.turns[0]}</button></td>
      <td>{hidden ? '—' : verdict(left, testCase.turns.length)}</td><td>{hidden ? '—' : verdict(right, testCase.turns.length)}</td>
      <td>{hidden ? (loaded ? '盲听评审' : '读取评价…') : <select aria-label="整体偏好" disabled={!ended || saving} value={current?.preference ?? ''} onChange={e => void save({ preference: e.target.value as LabReview['preference'] })}><option value="" disabled>待评价</option><option value="left">A 更好</option><option value="right">B 更好</option><option value="tie">相当</option><option value="unknown">无法判断</option></select>}
        {!hidden && <small>{current?.note || '待填写反馈'}</small>}
        <span role="status">{status}</span>
        {loadError && <div role="alert">读取评价失败<button className="plab-button" onClick={() => setLoadAttempt(n => n + 1)}>重新加载评价</button></div>}
      </td>
      <td><button className="plab-button" aria-expanded={expanded} onClick={() => setExpanded(!expanded)}>{expanded ? '收起详情' : '试听与评价'}</button></td>
    </tr>
    <tr hidden={!expanded}><td colSpan={6} className="plab-detail-cell"><section className="plab-card"><h3>{testCase.name} · 第 {trial + 1} 次重复</h3>{experiment.kind === 'compare' && <>
    <button className="plab-button" disabled={saving || !loaded || hidden} onClick={() => void save({ mode: 'blind', revealed: false })}>进入盲听</button>{hidden && <button className="plab-button" disabled={saving || !loaded} onClick={() => void save({ revealed: true })}>揭示模板</button>}
    <div className="plab-eval-sides">{sides.map((side, i) => <div key={side}><h4>{hidden ? `样本 ${i + 1}` : side === 'left' ? `A · ${experiment.leftTemplate.name}` : `B · ${experiment.rightTemplate?.name}`}</h4>{hidden ? (side === 'left' ? left : right).map((r, n) => <button className="plab-button" key={n} disabled={disabled || !r.code} onClick={() => onPlay(`${side}-${trial}-${n}`, r.code)}>{playing === `${side}-${trial}-${n}` ? '停止' : '试听'} · 对话 {n + 1}</button>) : <p>{verdict(side === 'left' ? left : right, testCase.turns.length)}</p>}</div>)}</div>
    <p>整体偏好（整段对话只计一票）</p>{sides.map((side, i) => <button className="plab-button" key={side} disabled={!ended || saving} onClick={() => void save({ preference: side, mode: hidden ? 'blind' : 'standard' })}>{hidden ? `样本 ${i + 1}` : side === 'left' ? 'A' : 'B'} 更好{current?.preference === side ? ' ✓' : ''}</button>)}<button className="plab-button" disabled={!ended || saving} onClick={() => void save({ preference: 'tie' })}>相当{current?.preference === 'tie' ? ' ✓' : ''}</button><button className="plab-button" disabled={!ended || saving || !current?.note.trim()} onClick={() => void save({ preference: 'unknown' })}>无法判断</button>
    {!hidden && <details><summary>辅助评分与采用结论</summary>{(['符合要求', '音乐性', '编辑保留'] as const).map(dimension => <label key={dimension}>{dimension}{sides.map(side => <select key={side} aria-label={`${dimension}-${hidden ? sides.indexOf(side) + 1 : side}`} value={current?.dimensions?.[side]?.[dimension] ?? ''} onChange={e => setReview({ ...(current ?? initial()), dimensions: { ...current?.dimensions, [side]: { ...current?.dimensions?.[side], [dimension]: e.target.value ? Number(e.target.value) : undefined } } })}><option value="">未评 / 不适用</option>{[1,2,3,4,5].map(n => <option key={n} value={n}>{n}</option>)}</select>)}</label>)}
    <label>采用结论<select value={current?.conclusion ?? 'undecided'} onChange={e => void save({ conclusion: e.target.value as 'adopt' | 'reject' | 'undecided' })}><option value="undecided">待定</option><option value="adopt">采用候选</option><option value="reject">放弃候选</option></select></label>
    </details>}<label>{hidden ? '盲听备注（揭示后编辑）' : '评价原因'}<textarea disabled={hidden || saving || !loaded} value={hidden ? '' : current?.note ?? ''} onChange={e => setReview({ ...(current ?? initial()), note: e.target.value })} /></label><button className="plab-button" disabled={hidden || saving || !loaded} onClick={() => void save({})}>保存备注</button><span role="status">{status}</span>
    {!hidden && <details onToggle={e => setOutputDiff(e.currentTarget.open)}><summary>A/B 最终代码差异</summary>{outputDiff && <pre className="plab-code">{JSON.stringify(buildCodeDiff(left.at(-1)?.code ?? '', right.at(-1)?.code ?? ''), null, 2)}</pre>}</details>}
  </>}
  {!hidden && <details><summary>实验提示词快照</summary><pre className="plab-code">{experiment.leftSystemPrompt}</pre>{experiment.kind === 'compare' && <pre className="plab-code">{experiment.rightSystemPrompt}</pre>}</details>}
  {!hidden && testCase.turns.map((instruction, index) => <div key={index}><h4>对话 {index + 1} · {instruction}</h4><div className={experiment.kind === 'compare' ? 'plab-eval-sides' : ''}>{(experiment.kind === 'compare' ? ['left', 'right'] : ['left']).map(side => { const r = (side === 'left' ? left : right).find(r => r.turnIndex === index); return <div key={side}>{r ? <Result result={r} resultId={`${experiment.id}-${testCase.id}-${side}-${trial}-${index}`} criteria={testCase.turnCriteria?.[index]} {...{ onPlay, playing, disabled, onReplay, onRegression }} /> : <p>未执行或历史轮次无法恢复</p>}</div>; })}</div></div>)}
  </section></td></tr></>;
}

function DebugTurn({ result, resultId, onPlay, playing, disabled, onReplay, onRegression }: { result: PromptLabResult; resultId: string; onPlay: (id: string, code: string) => void; playing: string; disabled: boolean; onReplay: (r: PromptLabResult) => void; onRegression: (r: PromptLabResult) => void }) {
  const [diffOpen, setDiffOpen] = useState(false);
  const failedChecks = result.checks.filter(check => !check.passed);
  return <article className="plab-debug-turn">
    {result.explanation && <p className="plab-debug-explanation">{result.explanation}</p>}
    {result.error && <p className="plab-debug-error" role="alert">{result.error}</p>}
    {failedChecks.map(check => <p className="plab-debug-error" key={check.label}>× {check.label}</p>)}
    {result.code.trim() && <div className="plab-debug-output">
      <pre className="plab-code">{result.code}</pre>
      <button className="plab-button" disabled={disabled} onClick={() => onPlay(resultId, result.code)}>{playing === resultId ? '停止试听' : '试听'}</button>
    </div>}
    <details className="plab-debug-more">
      <summary>更多操作</summary>
      <div><button className="plab-button" disabled={!result.inputSnapshot || disabled} onClick={() => onReplay(result)}>用这一步重新比较（重新运行）</button><button className="plab-button" disabled={!result.inputSnapshot} onClick={() => onRegression(result)}>保存为回归用例</button></div>
    </details>
    <details className="plab-debug-more">
      <summary>详情</summary>
      <p className="plab-muted">{(result.durationMs / 1000).toFixed(1)} 秒 · {result.iterations} 次 Agent 交互 · {usageLabel(result)}</p>
      {result.checks.length > 0 && <ul className="plab-debug-checks">{result.checks.map(check => <li className={check.passed ? 'is-passed' : 'is-failed'} key={check.label}>{check.passed ? '✓' : '×'} {check.label}</li>)}</ul>}
      {result.code && <details onToggle={e => setDiffOpen(e.currentTarget.open)}><summary>相对初始代码的变化</summary>{diffOpen && <pre className="plab-code">{JSON.stringify(buildCodeDiff(result.inputSnapshot?.code ?? '', result.code), null, 2)}</pre>}</details>}
      <Trace result={result} />
    </details>
  </article>;
}

function DebugResults({ experiment, results, disabled, playing, onPlay, onReplay, onRegression }: { experiment: PromptLabExperiment; results: PromptLabResult[]; disabled: boolean; playing: string; onPlay: (id: string, code: string) => void; onReplay: (r: PromptLabResult) => void; onRegression: (r: PromptLabResult) => void }) {
  const status = ({ completed: '完成', running: '运行中', failed: '失败', cancelled: '已取消', interrupted: '已中断' } as Record<string, string>)[experiment.status] ?? experiment.status;
  const duration = results.reduce((total, result) => total + result.durationMs, 0);
  const resultErrors = results.flatMap(result => result.error ? [result.error] : []);
  const runError = experiment.error && !resultErrors.includes(experiment.error) ? experiment.error : '';
  return <div className="plab-debug-results">
    <div className={`plab-debug-summary is-${experiment.status}`}><span>{status}</span><span>{experiment.config.model}</span><strong>{(duration / 1000).toFixed(1)} 秒</strong></div>
    {runError && <p className="plab-debug-error" role="alert">{runError}</p>}
    {results.length ? results.map((result, index) => <section className="plab-debug-turn-group" key={`${result.turnIndex ?? 'legacy'}-${index}`}>
      {result.turnIndex !== undefined && <h3>第 {result.turnIndex + 1} 轮</h3>}
      <p className="plab-debug-instruction">{result.instruction}</p>
      <DebugTurn result={result} resultId={`${experiment.id}-${result.turnIndex ?? index}`} {...{ disabled, playing, onPlay, onReplay, onRegression }} />
    </section>) : experiment.status === 'running' ? <p className="plab-debug-empty">等待 Agent 回复…</p> : <p className="plab-debug-empty">这次运行没有生成结果。</p>}
    <details className="plab-debug-run-details">
      <summary>运行详情</summary>
      <div><span>保存时间 · {new Date(experiment.createdAt).toLocaleString()}</span><span>{experiment.config.provider} / {experiment.config.model}</span>{experiment.provenance && <span>代码版本 {experiment.provenance.commit ?? '未知'}{experiment.provenance.dirty ? '（含本地修改）' : ''} · 提示词 {experiment.provenance.leftHash.slice(0, 12)}{experiment.provenance.rightHash ? ` / ${experiment.provenance.rightHash.slice(0, 12)}` : ''}</span>}<details><summary>提示词快照</summary><pre className="plab-code">{experiment.leftSystemPrompt}</pre></details></div>
    </details>
  </div>;
}

export default function ResultsExplorer(props: { experiment: PromptLabExperiment; onPlay: (id: string, code: string) => void; playing: string; disabled: boolean; onReplay: (r: PromptLabResult) => void; onRegression: (r: PromptLabResult) => void }) {
  const { experiment } = props;
  const [filter, setFilter] = useState('all');
  const [reviews, setReviews] = useState<LabReview[]>([]);
  useEffect(() => { let alive = true; void promptLabStorage.listReviews().then(items => { if (alive) setReviews(items.filter(r => r.experimentId === experiment.id)); }).catch(() => {}); return () => { alive = false; }; }, [experiment.id]);
  const onReviewChanged = (review: LabReview) => setReviews(items => [...items.filter(r => r.id !== review.id), review]);
  const all = experiment.results.flatMap(c => [...c.left, ...c.right]);
  const input = all.reduce((n, r) => n + (r.usage?.inputTokens ?? 0), 0);
  const output = all.reduce((n, r) => n + (r.usage?.outputTokens ?? 0), 0);
  const complete = all.length > 0 && all.every(r => r.usage?.completeness === 'complete');
  const totals = experiment.results.flatMap(c => Array.from({ length: experiment.repeats }, (_, trial) => ({ a: verdict(c.left.filter(r => r.trialIndex === trial), c.caseSnapshot.turns.length), b: verdict(c.right.filter(r => r.trialIndex === trial), c.caseSnapshot.turns.length) })));

  if (experiment.kind === 'debug') {
    const debugResults = experiment.results.flatMap(item => item.left);
    return <DebugResults experiment={experiment} results={debugResults} disabled={props.disabled} playing={props.playing} onPlay={props.onPlay} onReplay={props.onReplay} onRegression={props.onRegression} />;
  }

  if (experiment.kind === 'batch') return <div className="plab-results-explorer"><h2>{experiment.name}</h2><p>{experiment.status} · {experiment.historySources ? '两侧配置见来源' : experiment.config.model} · {experiment.repeats} 次重复</p>{(experiment.suiteSnapshot?.cases ?? experiment.results.map(c => c.caseSnapshot)).map(c => <section key={c.id}><h3>{c.name}</h3>{Array.from({ length: experiment.repeats }, (_, trial) => <div key={trial}><h4>第 {trial + 1} 次重复</h4>{experiment.results.find(r => r.caseId === c.id)?.left.filter(r => r.trialIndex === trial).map((r, index) => <Result key={index} result={r} resultId={`${experiment.id}-${c.id}-left-${trial}-${index}`} {...props} />)}{!experiment.results.find(r => r.caseId === c.id)?.left.some(r => r.trialIndex === trial) && <p>未执行</p>}</div>)}</section>)}</div>;

  return <div className="plab-results-explorer">{experiment.historySources && <section className="plab-card"><h3>历史对比来源与执行条件</h3>{(['left', 'right'] as const).map(side => { const source = experiment.historySources![side]; const run = source.snapshot; return <div key={side}><strong>{side === 'left' ? 'A' : 'B'} · {run.name} · 原记录 {source.side === 'left' ? 'A' : 'B'}</strong><p>{run.config.provider} / {run.config.model} · 思考 {run.thinkingLevel} · {run.createdAt} · {run.status} · {run.repeats} 次重复</p><details><summary>执行配置与版本</summary><pre className="plab-code">{JSON.stringify({ config: run.config, variables: run.variables, provenance: run.provenance }, null, 2)}</pre></details><details><summary>来源原始结果（含未匹配结果）</summary>{run.results.map(c => <section key={c.caseId}><h4>{c.caseSnapshot.name}</h4>{c[source.side].map((r, i) => <Result key={i} result={r} resultId={`${experiment.id}-${side}-source-${c.caseId}-${i}`} {...props} />)}</section>)}</details></div>; })}<p>按相同输入、检查条件和重复序号配对；仅完整对话可评价。不同模型及执行条件可能影响结果。</p>{experiment.unmatched?.map((text, i) => <p key={i}>{text}</p>)}</section>}<header className="plab-result-heading"><span className="plab-kicker">{experiment.status === 'running' ? '运行中' : '已保存的结果'}</span><h2>{experiment.name}</h2><p>当前查看：{experiment.suiteName ?? '单次调试'} · {({ completed: '运行完成', running: '运行中', failed: '运行失败', cancelled: '已取消', interrupted: '已中断' } as Record<string, string>)[experiment.status] ?? experiment.status} · {experiment.historySources ? '两侧配置见来源' : experiment.config.model} · {experiment.repeats === 1 ? '探索性结果' : `${experiment.repeats} 次重复`}</p>{(experiment.purpose || experiment.changeNote) && <p>{[experiment.purpose, experiment.changeNote].filter(Boolean).join(' · ')}</p>}{experiment.provenance && <p className="plab-muted">代码版本 {experiment.provenance.commit ?? '未知'} {experiment.provenance.dirty ? '（含本地修改）' : ''} · 提示词 {experiment.provenance.leftHash.slice(0, 12)} / {experiment.provenance.rightHash?.slice(0, 12) ?? '—'}</p>}
    </header><div className="plab-result-stats">
      <div><span>已执行轮次</span><strong>{all.length} / {(experiment.suiteSnapshot?.cases ?? experiment.results.map(c => c.caseSnapshot)).reduce((n, c) => n + c.turns.length, 0) * experiment.repeats * (experiment.kind === 'compare' ? 2 : 1)}</strong></div>
      <div><span>已提交</span><strong>{all.filter(r => r.committed).length}</strong></div>
      <div><span>累计执行耗时</span><strong>{(all.reduce((n, r) => n + r.durationMs, 0) / 1000).toFixed(1)} 秒</strong></div>
      <div><span>输入 / 输出 tokens</span><strong>{all.some(r => r.usage) ? `${input.toLocaleString()} / ${output.toLocaleString()}` : '—'}</strong><small>{complete ? '已报告用量完整' : all.some(r => r.usage) ? '仅统计已报告用量' : '未报告用量'}</small></div>
    </div>
    {experiment.kind === 'compare' && !reviews.some(r => r.mode === 'blind' && !r.revealed) && <p>A 自动通过 {totals.filter(t => t.a === '通过').length}/{totals.length} · B 自动通过 {totals.filter(t => t.b === '通过').length}/{totals.length} · 自动退步 {totals.filter(t => t.a === '通过' && t.b === '失败').length} · A 偏好 {reviews.filter(r => r.preference === 'left').length} / B 偏好 {reviews.filter(r => r.preference === 'right').length} / 相当 {reviews.filter(r => r.preference === 'tie').length} / 无法判断 {reviews.filter(r => r.preference === 'unknown').length}</p>}
    {experiment.kind === 'compare' && <label>筛选<select value={filter} onChange={e => setFilter(e.target.value)}><option value="all">全部</option><option value="pending">待人工评分</option><option value="review">需复核</option><option value="failure">存在失败</option><option value="regression">自动退步（A 通过 / B 失败）</option></select></label>}
    <div className="plab-table-scroll"><table className="plab-data-table"><colgroup><col style={{ width: '18%' }} /><col style={{ width: '26%' }} /><col style={{ width: '8%' }} /><col style={{ width: '8%' }} /><col style={{ width: '24%' }} /><col style={{ width: '16%' }} /></colgroup><thead><tr><th>用例 / 重复</th><th>输入</th><th>A</th><th>B</th><th>偏好 / 反馈</th><th>详情</th></tr></thead><tbody>
    {(experiment.suiteSnapshot?.cases ?? experiment.results.map(c => c.caseSnapshot)).flatMap(testCase => {
      const c = experiment.results.find(item => item.caseId === testCase.id) ?? { caseId: testCase.id, caseSnapshot: testCase, left: [], right: [] };
      const legacy = [...c.left, ...c.right].some(r => r.trialIndex === undefined || r.turnIndex === undefined);
      if (legacy) return [<tr key={c.caseId}><td>{testCase.name}</td><td colSpan={5}><details><summary>历史格式 · 查看原始记录</summary><p>历史记录缺少重复/轮次标识，保留原始顺序，不推算实验边界。</p>{[...c.left, ...c.right].map((r, i) => <Result key={i} resultId={`${experiment.id}-${c.caseId}-legacy-${i}`} result={r} {...props} />)}</details></td></tr>];
      return Array.from({ length: experiment.repeats }, (_, trial) => {
        const left = c.left.filter(r => r.trialIndex === trial), right = c.right.filter(r => r.trialIndex === trial);
        const a = verdict(left, testCase.turns.length), b = verdict(right, testCase.turns.length);
        const review = reviews.find(r => r.caseId === c.caseId && r.trialIndex === trial);
        if (filter === 'pending' && review?.preference || filter === 'review' && a !== '未知' && b !== '未知' || filter === 'failure' && a !== '失败' && b !== '失败' || filter === 'regression' && !(a === '通过' && b === '失败')) return null;
        return <Pair key={`${c.caseId}-${trial}`} {...props} onReviewChanged={onReviewChanged} testCase={testCase} trial={trial} left={left} right={right} />;
      });
    })}
    </tbody></table></div>
  </div>;
}
