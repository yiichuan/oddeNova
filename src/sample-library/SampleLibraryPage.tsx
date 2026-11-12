import { useDeferredValue, useEffect, useMemo, useState } from 'react';
import { LoaderCircle, Volume2, VolumeX } from 'lucide-react';
import type { ListeningFeatures, SearchCatalog, SampleVariant, SoundDescription } from '../lib/sample-search';
import { serializeFullCatalog } from '../lib/sample-catalog-context';
import { emptyFilters, filterCatalog, indexCatalog, labels, loadCatalog, statusLabels } from './catalog';
import { CatalogFilters } from './CatalogFilters';
import { SampleDirectory } from './SampleDirectory';
import { loadPreviewSources, resolvePreviewUrl, type PreviewSources } from './preview-sources';
import { useSamplePreview } from './useSamplePreview';
import { AnnotationEditor } from './AnnotationEditor';
import { CategoryEditor } from './CategoryEditor';
import { ModelInputFields, ModelInputPreview } from './ModelInputFields';
import type { SampleCategory } from './annotation-editor-types';
import './sample-library.css';

type SourcesState = { status: 'loading' | 'failed' } | { status: 'ready'; sources: PreviewSources };

function FeatureDetails({ features }: { features: ListeningFeatures }) {
  return <div className="sl-features">
    {Object.entries(features).map(([section, fields]) => <section key={section}>
      <h3>{labels[section] ?? section}</h3>
      <dl>{Object.entries(fields).map(([field, value]) => <div key={field}>
        <dt>{labels[field] ?? field}</dt>
        <dd>{(Array.isArray(value) ? value : [value]).map(item => labels[item] ?? item).join(' · ') || '-'}</dd>
      </div>)}</dl>
    </section>)}
  </div>;
}

function DescriptionDetails({ description }: { description?: SoundDescription }) {
  return <div className="sl-sound-description">
    <p>{description?.text.trim() ? description.text : '暂无声音描述。'}</p>
    {Boolean(description?.associations.length) && <p>听感联想：{description?.associations.join('、')}（相似听感，不代表真实声源）</p>}
  </div>;
}

function VariantDetails({ variant, modelLegend, modelSnippet }: {
  variant: SampleVariant;
  modelLegend: string;
  modelSnippet: string;
}) {
  return <>
    <section aria-label="声音描述" className="sl-description">
      <h3>声音描述</h3>
      <DescriptionDetails description={variant.soundDescription} />
      <p className="sl-note">{variant.descriptionStatus === 'expert_confirmed' ? '描述已人工确认' : '描述为模型初标，待人工复核'} · 暂不用于 AI 检索</p>
      {variant.descriptionStatus === 'expert_confirmed' && variant.modelSoundDescription && <details>
        <summary>查看 AI 原始描述</summary>
        <DescriptionDetails description={variant.modelSoundDescription} />
      </details>}
    </section>
    {variant.features ? <FeatureDetails features={variant.features} /> : <p className="sl-note">这个变体还没有可用的听感标注。</p>}
    <details className="sl-raw">
      <summary>发给选择模型的内容</summary>
      <p>以下是当前变体在全库目录中的原文，按当前已发布标注生成，与检索请求使用相同格式。未发布草稿不包含在内。</p>
      <ModelInputPreview snippet={modelSnippet} />
      <ModelInputFields legend={modelLegend} />
      <p>实际检索还会包含全库其他变体、选择规则和本次检索需求。这里展示目录片段，不是历史请求记录。</p>
    </details>
    {variant.annotationStatus === 'expert_confirmed' && <details className="sl-raw">
      <summary>查看 AI 原始标注</summary>
      {variant.modelFeatures ? <FeatureDetails features={variant.modelFeatures} /> : <p>没有可用的 AI 原始标注。</p>}
    </details>}
    <details className="sl-raw">
      <summary>查看结构化原始数据</summary>
      <pre>{JSON.stringify(variant, null, 2)}</pre>
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
  const [editingId, setEditingId] = useState<string>();
  const [annotationGuard, setAnnotationGuard] = useState<'dirty' | 'busy' | null>(null);
  const [categoryGuard, setCategoryGuard] = useState<'dirty' | 'busy' | null>(null);
  const guard = annotationGuard === 'busy' || categoryGuard === 'busy' ? 'busy' : annotationGuard ?? categoryGuard;
  const [notice, setNotice] = useState('');
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
  useEffect(() => {
    if (!guard) return;
    function preventLeave(event: BeforeUnloadEvent) {
      event.preventDefault();
      event.returnValue = '';
    }
    window.addEventListener('beforeunload', preventLeave);
    return () => window.removeEventListener('beforeunload', preventLeave);
  }, [guard]);
  const index = useMemo(() => indexCatalog(catalog?.samples ?? []), [catalog]);
  const modelCatalog = useMemo(() => catalog ? serializeFullCatalog(catalog) : null, [catalog]);
  const categories = useMemo(() => {
    const values = new Set(index.map(({ sample }) => sample.category ?? null));
    const sorted: (string | null)[] = [...values].filter(value => value !== null).sort((a, b) => a.localeCompare(b, 'zh-CN'));
    if (values.has(null)) sorted.push(null);
    return sorted;
  }, [index]);
  const results = useMemo(() => filterCatalog(index, deferredQuery, filters), [index, deferredQuery, filters]);
  const currentMatch = results.find(item => item.sample.key === selection.key);
  // Saving a category can move the selected sample out of the active filter.
  const editingSample = editingId && !currentMatch ? index.find(item => item.sample.key === selection.key) : undefined;
  const current = currentMatch ?? (editingSample ? filterCatalog([editingSample], '', emptyFilters)[0] : results[0]);
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

  const editing = Boolean(variant && editingId === variant.id);
  const references = useMemo(() => {
    const hash = variant?.sha256;
    if (!editing || !hash) return [];
    return (catalog?.samples ?? []).flatMap(sample => sample.variants
      .filter(item => item.sha256 === hash)
      .map(({ id, index, rootNote }) => ({ id, index, rootNote, key: sample.key })));
  }, [catalog, editing, variant?.sha256]);

  function closeEditor() {
    if (guard === 'busy') return false;
    if (guard === 'dirty' && !window.confirm('离开会丢弃未保存的修改，已保存的草稿会保留。继续吗？')) return false;
    setEditingId(undefined);
    setAnnotationGuard(null);
    setCategoryGuard(null);
    return true;
  }

  function published() {
    setEditingId(undefined);
    setAnnotationGuard(null);
    setNotice('标注已发布。声音描述仅供浏览复核；结构化标注将在刷新工作室后用于 AI 检索。');
    setAttempt(value => value + 1);
  }

  function categorySaved(sampleKey: string, value: SampleCategory) {
    setCatalog(previous => previous && {
      ...previous,
      samples: previous.samples.map(sample => sample.key === sampleKey ? { ...sample, ...value } : sample),
    });
    setCategoryGuard(null);
    setNotice(`${sampleKey} 的目录类别已保存。刷新工作室后，AI 检索将使用新类别。`);
  }

  function selectVariant(id: string) {
    if (variant?.id === id || !closeEditor()) return;
    stop();
    setSelection({ key, id });
  }

  function previewControl(sampleKey: string, item: SampleVariant, location: 'row' | 'detail') {
    if (sources.status !== 'ready') return null;
    const url = resolvePreviewUrl(sources.sources, sampleKey, item);
    if (!url) return <span className="sl-preview-unavailable">无法试听</span>;
    const phase = preview?.id === item.id ? preview.phase : null;
    const action = phase === 'loading' || phase === 'playing' ? '停止试听' : phase === 'failed' ? '重试试听' : '试听';
    const Icon = phase === 'loading' ? LoaderCircle : phase === 'playing' ? VolumeX : Volume2;
    const name = [sampleKey + ':' + item.index, item.rootNote, item.articulation].filter(Boolean).join(' ');
    return <button type="button" className="sl-preview-button" data-phase={phase ?? undefined}
      aria-label={`${action} ${name}${location === 'detail' ? '（当前变体）' : ''}`}
      title={phase === 'loading' ? '加载中，点击停止试听' : action}
      onClick={() => {
        if (variant?.id !== item.id && !closeEditor()) return;
        setSelection({ key: sampleKey, id: item.id });
        play(item.id, url);
      }}>
      <Icon size={16} aria-hidden="true" />
    </button>;
  }

  return <main className="sample-library">
    <header className="sl-header">
      <div className="sl-header-group">
        <a href="/" className="sl-brand">oddeNova</a>
        <h1>音色档案</h1>
        <p>听感，有据可查。</p>
      </div>
      <div className="sl-header-group">
        {catalog && <p>{catalog.samples.length.toLocaleString()} 个音色 · {totalVariants.toLocaleString()} 个变体</p>}
        <a href="/">返回工作室 ↗</a>
      </div>
    </header>
    {notice && <p className="sl-publication-notice" role="status">{notice}</p>}
    <CatalogFilters query={query} categories={categories} filters={filters}
      onQuery={value => { if (closeEditor()) setQuery(value); }}
      onChange={value => { if (closeEditor()) setFilters(value); }}
      onClear={() => { if (closeEditor()) { setQuery(''); setFilters(emptyFilters); } }} />
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
            if (key !== sampleKey && closeEditor()) {
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
            const description = [item.rootNote, item.articulation].filter(Boolean).join(' · ');
            return <li key={item.id} className="sl-variant-row" data-selected={item.id === variant?.id}>
              <button type="button" className="sl-variant-select" aria-pressed={item.id === variant?.id}
                onClick={() => selectVariant(item.id)}>
                <code>{current.sample.key}:{item.index}</code>
                {description && <span>{description}</span>}
                {!sharedStatus && <span className={`sl-status sl-${item.annotationStatus}`}>{statusLabels[item.annotationStatus]}</span>}
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
              <div className="sl-detail-title-group">
                <h2>{current.sample.key}:{variant.index}{variant.rootNote && <small> · {variant.rootNote}</small>}</h2>
                <span className={`sl-status sl-${variant.annotationStatus}`}>{statusLabels[variant.annotationStatus]}</span>
                {variant.articulation && <small>奏法 {variant.articulation}</small>}
              </div>
              <div className="sl-detail-title-group">
                {import.meta.env.DEV && <button type="button" className="sl-edit-toggle"
                  aria-expanded={editing} disabled={guard === 'busy' || query !== deferredQuery}
                  onClick={() => { if (closeEditor() && !editing) setEditingId(variant.id); }}>
                  {editing ? '关闭编辑' : '编辑标注'}
                </button>}
                {previewControl(current.sample.key, variant, 'detail')}
              </div>
            </div>
            <PlaybackCode key={variant.id} code={variant.playback} />
            <p className="sl-category-heading">目录类别：{current.sample.category ?? '未分类'}</p>
          </div>
          <div className={editing ? 'sl-detail-editing' : 'sl-detail-content sl-scroll'} key={variant.id}>
            {editing ? <AnnotationEditor hash={variant.sha256} annotationStatus={variant.annotationStatus}
              references={references} onGuardChange={setAnnotationGuard} onPublished={published} categoryGuard={categoryGuard}>
              <CategoryEditor sample={current.sample} disabled={annotationGuard === 'busy'} onGuardChange={setCategoryGuard}
                onSaved={value => categorySaved(current.sample.key, value)} />
            </AnnotationEditor>
              : <VariantDetails variant={variant} modelLegend={modelCatalog?.legend ?? ''}
                modelSnippet={modelCatalog?.variantTexts.get(variant) ?? ''} />}
          </div>
        </> : <p className="sl-empty">选中一个音色后，在这里查看标注详情。</p>}
      </article>
    </div>}
  </main>;
}
