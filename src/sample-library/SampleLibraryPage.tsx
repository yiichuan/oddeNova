import { useDeferredValue, useEffect, useMemo, useState } from 'react';
import type { SearchCatalog, SampleVariant } from '../lib/sample-search';
import { emptyFilters, filterCatalog, indexCatalog, labels, listeningSummary, loadCatalog, statusLabels } from './catalog';
import { CatalogFilters } from './CatalogFilters';
import { SampleDirectory } from './SampleDirectory';
import { loadPreviewSources, resolvePreviewUrl, type PreviewSources } from './preview-sources';
import { useSamplePreview } from './useSamplePreview';
import './sample-library.css';

type SourcesState = { status: 'loading' | 'failed' } | { status: 'ready'; sources: PreviewSources };

function VariantDetails({ variant }: { variant: SampleVariant }) {
  return <>
    <div className="sl-meta">
      <span className={`sl-status sl-${variant.annotationStatus}`}>{statusLabels[variant.annotationStatus]}</span>
      {variant.rootNote && <span>根音 {variant.rootNote}</span>}
      {variant.articulation && <span>奏法 {variant.articulation}</span>}
    </div>
    {variant.annotationStatus === 'model_initial' && <p className="sl-note">模型听感初标，尚未经专家确认。</p>}
    {variant.features ? <div className="sl-features">
      {Object.entries(variant.features).map(([section, fields]) => <section key={section}>
        <h3>{labels[section] ?? section}</h3>
        <dl>{Object.entries(fields).map(([field, value]) => <div key={field}>
          <dt>{labels[field] ?? field}</dt>
          <dd>{(Array.isArray(value) ? value : [value]).map(item => labels[item] ?? item).join(' · ') || '未标注标签'}</dd>
        </div>)}</dl>
      </section>)}
    </div> : <p className="sl-note">这个变体还没有可用的听感标注。</p>}
    <details className="sl-raw">
      <summary>查看结构化原始数据</summary>
      <pre>{JSON.stringify(variant, null, 2)}</pre>
    </details>
    <details className="sl-raw">
      <summary>关于标注</summary>
      <p>这里展示结构化听感。原始模型摘要、用途建议和复核证据保存在本地标注资料中。</p>
    </details>
  </>;
}

function PlaybackCode({ code }: { code: string }) {
  const [feedback, setFeedback] = useState('');
  async function copy() {
    try {
      await navigator.clipboard.writeText(code);
      setFeedback('已复制');
    } catch {
      setFeedback('复制失败，请手动选中代码复制。');
    }
  }
  return <div className="sl-code">
    <div className="sl-code-row">
      <code aria-label="Strudel 调用">{code}</code>
      <button type="button" onClick={() => void copy()}>复制代码</button>
    </div>
    <span className="sl-copy-feedback" role="status">{feedback}</span>
  </div>;
}

function variantCount(matched: number, total: number, filtered: boolean) {
  return filtered ? `匹配 ${matched} / 共 ${total}` : `共 ${total} 个变体`;
}

export default function SampleLibraryPage() {
  const [catalog, setCatalog] = useState<SearchCatalog | null>(null);
  const [error, setError] = useState('');
  const [attempt, setAttempt] = useState(0);
  const [query, setQuery] = useState('');
  const [filters, setFilters] = useState(emptyFilters);
  const [selection, setSelection] = useState<{ key?: string; id?: string }>({});
  const [sources, setSources] = useState<SourcesState>({ status: 'loading' });
  const [sourceAttempt, setSourceAttempt] = useState(0);
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
  useEffect(() => {
    const controller = new AbortController();
    void loadPreviewSources(controller.signal).then(data => {
      if (!controller.signal.aborted) setSources({ status: 'ready', sources: data });
    }).catch(() => {
      if (!controller.signal.aborted) {
        controller.abort();
        setSources({ status: 'failed' });
      }
    });
    return () => controller.abort();
  }, [sourceAttempt]);
  const index = useMemo(() => indexCatalog(catalog?.samples ?? []), [catalog]);
  const categories = useMemo(() => {
    const values = new Set(index.map(({ sample }) => sample.category ?? null));
    const sorted: (string | null)[] = [...values].filter(value => value !== null).sort((a, b) => a.localeCompare(b, 'zh-CN'));
    if (values.has(null)) sorted.push(null);
    return sorted;
  }, [index]);
  const results = useMemo(() => filterCatalog(index, deferredQuery, filters), [index, deferredQuery, filters]);
  const current = results.find(item => item.sample.key === selection.key) ?? results[0];
  const key = current?.sample.key;
  const variant = (key === selection.key ? current?.variants.find(item => item.id === selection.id) : undefined)
    ?? current?.variants[0];
  if (selection.key !== key || selection.id !== variant?.id) {
    setSelection({ key, id: variant?.id });
  }

  const { preview, play, stop } = useSamplePreview(variant?.id);
  const filtered = Boolean(deferredQuery.trim()) || filters.status !== 'all' || filters.category !== undefined
    || Boolean(filters.brightness) || filters.textures.length > 0;
  const totalVariants = useMemo(() => catalog?.samples.reduce((sum, sample) => sum + sample.variants.length, 0) ?? 0, [catalog]);
  const sharedStatus = variant && current?.variants.every(item => item.annotationStatus === variant.annotationStatus)
    ? variant.annotationStatus : undefined;

  function selectVariant(id: string) {
    if (variant?.id === id) return;
    stop();
    setSelection({ key, id });
  }

  function previewControl(sampleKey: string, item: SampleVariant, location: 'row' | 'detail') {
    if (sources.status !== 'ready') return null;
    const url = resolvePreviewUrl(sources.sources, sampleKey, item);
    if (!url) return <span className="sl-preview-unavailable">无法试听</span>;
    const phase = preview?.id === item.id ? preview.phase : null;
    const action = phase === 'loading' || phase === 'playing' ? '停止试听' : phase === 'failed' ? '重试试听' : '试听';
    const name = [sampleKey + ':' + item.index, item.rootNote, item.articulation].filter(Boolean).join(' ');
    return <button type="button" className="sl-preview-button" data-phase={phase ?? undefined}
      aria-label={`${action} ${name}${location === 'detail' ? '（当前变体）' : ''}`}
      onClick={() => {
        setSelection({ key: sampleKey, id: item.id });
        play(item.id, url);
      }}>
      {phase === 'loading' ? '加载中 · 停止' : action}
    </button>;
  }

  return <main className="sample-library">
    <header className="sl-header">
      <a href="/" className="sl-brand">oddeNova <span>/ 音色档案</span></a>
      <a href="/">返回工作室 ↗</a>
    </header>
    <div className="sl-intro">
      <h1>听感，有据可查。</h1>
      {catalog && <p>{catalog.samples.length.toLocaleString()} 个音色 · {totalVariants.toLocaleString()} 个变体</p>}
    </div>
    <CatalogFilters query={query} categories={categories} filters={filters}
      onQuery={setQuery}
      onChange={setFilters}
      onClear={() => { setQuery(''); setFilters(emptyFilters); }} />
    {error ? <div className="sl-empty" role="alert">
      {error}<button type="button" onClick={() => { setError(''); setAttempt(value => value + 1); }}>重新加载</button>
    </div> : !catalog ? <div className="sl-empty" role="status">正在加载音色标注…</div> : <div className="sl-workspace">
      <aside className="sl-pane sl-sidebar" aria-labelledby="sl-directory-heading">
        <div className="sl-pane-heading">
          <h2 id="sl-directory-heading">音色目录</h2>
          <p role="status">{results.length.toLocaleString()} 个匹配音色{query !== deferredQuery ? ' · 搜索中…' : ''}</p>
        </div>
        <SampleDirectory scope={filtered ? JSON.stringify([deferredQuery, filters]) : null}
          results={results} selectedKey={key} ranked={Boolean(deferredQuery.trim())}
          onSelect={sampleKey => {
            if (key !== sampleKey) {
              stop();
              setSelection({ key: sampleKey });
            }
          }} />
      </aside>
      <section className="sl-pane sl-variants" aria-labelledby="sl-variant-heading">
        <div className="sl-pane-heading">
          <h2 id="sl-variant-heading">{key ?? '采样变体'}</h2>
          {current && <p>{[current.sample.category, variantCount(current.variants.length, current.sample.variants.length, filtered)]
            .filter(Boolean).join(' · ')}</p>}
          {current && current.sample.aliases.length > 0 && <p>别名 {current.sample.aliases.join('、')}</p>}
          {sharedStatus && <span className={`sl-status sl-${sharedStatus}`}>{statusLabels[sharedStatus]}</span>}
          {current && sources.status === 'loading' && <p role="status">正在加载试听索引…</p>}
          {current && sources.status === 'failed' && <div className="sl-preview-error" role="alert">
            试听索引加载失败。 <button type="button" onClick={() => {
              setSources({ status: 'loading' });
              setSourceAttempt(value => value + 1);
            }}>重新加载</button>
          </div>}
        </div>
        {current && <ul className="sl-variant-list sl-scroll" key={current.sample.key}>
          {current.variants.map(item => {
            const summary = listeningSummary(item).slice(0, 3);
            const description = [item.rootNote, item.articulation].filter(Boolean).join(' · ');
            return <li key={item.id} className="sl-variant-row" data-selected={item.id === variant?.id}>
              <button type="button" className="sl-variant-select" aria-pressed={item.id === variant?.id}
                onClick={() => selectVariant(item.id)}>
                <code>{current.sample.key}:{item.index}</code>
                {description && <span>{description}</span>}
                {!sharedStatus && <span className={`sl-status sl-${item.annotationStatus}`}>{statusLabels[item.annotationStatus]}</span>}
                {summary.length > 0 && <span className="sl-row-summary">{summary.join(' · ')}</span>}
              </button>
              {previewControl(current.sample.key, item, 'row')}
              {preview?.id === item.id && preview.phase === 'failed' && <p className="sl-preview-error" role="alert">音频播放失败，可以重试。</p>}
            </li>;
          })}
        </ul>}
      </section>
      <article className="sl-pane sl-detail" aria-label="标注详情">
        {current && variant ? <>
          <div className="sl-pane-heading sl-detail-heading">
            <div className="sl-detail-title">
              <h2>{current.sample.key}:{variant.index}{variant.rootNote && <small> · {variant.rootNote}</small>}</h2>
              {previewControl(current.sample.key, variant, 'detail')}
            </div>
            <PlaybackCode key={variant.id} code={variant.playback} />
          </div>
          <div className="sl-detail-content sl-scroll" key={variant.id}>
            <div className="sl-summary">{listeningSummary(variant).map(label => <span key={label}>{label}</span>)}</div>
            <VariantDetails variant={variant} />
          </div>
        </> : <p className="sl-empty">选中一个音色后，在这里查看标注详情。</p>}
      </article>
    </div>}
  </main>;
}
