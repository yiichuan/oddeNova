import { useDeferredValue, useEffect, useMemo, useState } from 'react';
import type { SearchCatalog, SampleVariant } from '../lib/sample-search';
import { filterCatalog, indexCatalog, labels, loadCatalog, statusLabels, type StatusFilter } from './catalog';
import './sample-library.css';

function VariantDetails({ variant }: { variant: SampleVariant }) {
  return <>
    <div className="sl-meta"><span className={`sl-status sl-${variant.annotationStatus}`}>{statusLabels[variant.annotationStatus]}</span><span>数组索引 {variant.index}</span><span>根音 {variant.rootNote ?? '未指定'}</span>{variant.articulation && <span>奏法 {variant.articulation}</span>}</div>
    {variant.annotationStatus === 'model_initial' && <p className="sl-note">以下为模型听感初标，尚未经专家确认。</p>}
    {variant.features ? <div className="sl-features">{Object.entries(variant.features).map(([section, fields]) => <section key={section}>
      <h3>{labels[section] ?? section}</h3><dl>{Object.entries(fields).map(([field, value]) => <div key={field}><dt>{labels[field] ?? field}</dt><dd>{(Array.isArray(value) ? value : [value]).map(item => labels[item] ?? item).join(' · ') || '未标注标签'}</dd></div>)}</dl>
    </section>)}</div> : <div className="sl-empty">这个变体还没有可用的听感标注。</div>}
    <section className="sl-code"><h3>Strudel 调用</h3><code>{variant.playback}</code></section>
    <details className="sl-raw"><summary>查看结构化原始数据</summary><pre>{JSON.stringify(variant, null, 2)}</pre></details>
  </>;
}

export default function SampleLibraryPage() {
  const [catalog, setCatalog] = useState<SearchCatalog | null>(null);
  const [error, setError] = useState('');
  const [attempt, setAttempt] = useState(0);
  const [query, setQuery] = useState('');
  const [status, setStatus] = useState<StatusFilter>('all');
  const [selected, setSelected] = useState('');
  const [variantId, setVariantId] = useState('');
  const [limit, setLimit] = useState(60);
  const deferredQuery = useDeferredValue(query);
  useEffect(() => {
    const controller = new AbortController();
    void loadCatalog(controller.signal).then(data => {
      if (!controller.signal.aborted) setCatalog(data);
    }).catch(reason => {
      if (!controller.signal.aborted) setError(reason instanceof Error ? reason.message : '目录加载失败');
    });
    return () => controller.abort();
  }, [attempt]);
  const index = useMemo(() => indexCatalog(catalog?.samples ?? []), [catalog]);
  const results = useMemo(() => filterCatalog(index, deferredQuery, status), [index, deferredQuery, status]);
  const current = results.find(item => item.sample.key === selected) ?? results[0];
  const variant = current?.variants.find(item => item.id === variantId) ?? current?.variants[0];
  const totalVariants = useMemo(() => catalog?.samples.reduce((sum, sample) => sum + sample.variants.length, 0) ?? 0, [catalog]);
  return <main className="sample-library">
    <header className="sl-header"><a href="/" className="sl-brand">oddeNova <span>/ 音色档案</span></a><a href="/">返回工作室 ↗</a></header>
    <div className="sl-intro"><div><p className="sl-eyebrow">SAMPLE LIBRARY / ANNOTATIONS</p><h1>听感，有据可查。</h1><p>搜索音色，展开每个变体的标注。</p></div><div className="sl-count"><strong>{catalog ? catalog.samples.length.toLocaleString() : '—'}</strong><span>音色名称 · {totalVariants.toLocaleString()} 个变体</span></div></div>
    <div className="sl-tools"><label className="sl-search"><span>搜索音色</span><input type="search" value={query} placeholder="名称、别名、类别或听感，如 piano、军鼓 明亮" onChange={event => { setQuery(event.target.value); setLimit(60); }} /></label><label className="sl-filter"><span>标注状态</span><select value={status} onChange={event => { setStatus(event.target.value as StatusFilter); setLimit(60); }}><option value="all">全部状态</option>{Object.entries(statusLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label></div>
    {error ? <div className="sl-empty" role="alert">{error}<button onClick={() => { setError(''); setAttempt(value => value + 1); }}>重新加载</button></div> : !catalog ? <div className="sl-empty" role="status">正在加载音色标注…</div> : <div className="sl-workspace">
      <aside className="sl-sidebar" aria-label="音色搜索结果"><p className="sl-result-count" role="status">{results.length} 个匹配音色{query !== deferredQuery ? ' · 搜索中…' : ''}</p><div className="sl-results">{results.slice(0, limit).map(({ sample, variants }) => <button key={sample.key} aria-pressed={current?.sample.key === sample.key} onClick={() => { setSelected(sample.key); setVariantId(''); }}><span className="sl-result-name">{sample.key}<small>{variants.length} / {sample.variants.length}</small></span><span className="sl-result-category">{sample.category ?? '类别待确认'}</span></button>)}{results.length > limit && <button className="sl-more" onClick={() => setLimit(value => value + 60)}>加载更多（剩余 {results.length - limit}）</button>}{results.length === 0 && <p className="sl-empty">没有匹配的音色。试试更短的名称，或切换标注状态。</p>}</div></aside>
      <article className="sl-detail" aria-label="标注详情">{current && variant ? <>
        <div className="sl-detail-heading"><p className="sl-eyebrow">音色标注</p><h2>{current.sample.key}</h2><p>{current.sample.category ?? '类别待确认'}{current.sample.aliases.length > 0 ? ` · 别名 ${current.sample.aliases.join('、')}` : ''}</p></div>
        <p className="sl-note">当前展示目录中的结构化听感。原始模型摘要、用途建议和复核证据保留在本地标注资料中。</p>
        <label className="sl-variant"><span>选择变体 <small>（{current.variants.length} / {current.sample.variants.length} 个符合筛选）</small></span><select value={variant.id} onChange={event => setVariantId(event.target.value)}>{current.variants.map(item => <option key={item.id} value={item.id}>变体 {item.index}{item.rootNote ? ` · ${item.rootNote}` : ''}{item.articulation ? ` · ${item.articulation}` : ''} · {statusLabels[item.annotationStatus]}</option>)}</select></label>
        <VariantDetails key={variant.id} variant={variant} />
      </> : <div className="sl-empty">调整搜索条件后，在这里查看标注详情。</div>}</article>
    </div>}
  </main>;
}
