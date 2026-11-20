import { useEffect, useState, type ReactNode } from 'react';
import schema from '../../docs/sample-annotation-schema-v2.json';
import type { ListeningFeatures, SampleVariant } from '../lib/sample-search';
import type { AnnotationCommand, AnnotationReview } from './annotation-editor-types';
import { labels } from './catalog';

const properties = schema.properties;
const sections = {
  structure: properties.structure.properties,
  timbre: properties.timbre.properties,
  envelope: properties.envelope.properties,
  space: properties.space.properties,
};
type Section = keyof typeof sections;
type FeatureFields = Record<string, string | string[]>;
const sectionKeys = Object.keys(sections) as Section[];
const sectionColumns = [
  ['structure', 'envelope'],
  ['timbre', 'space'],
] as const;

const effectiveStatusLabels = {
  expert_confirmed: '当前人工标注已生效',
  model_initial: '当前为模型初标，尚未经人工确认',
  unavailable: '暂无生效标注',
} satisfies Record<SampleVariant['annotationStatus'], string>;

function sameValue(value: string | string[], other: string | string[]) {
  if (Array.isArray(value) && Array.isArray(other)) {
    const tags = new Set(value);
    const otherTags = new Set(other);
    return tags.size === otherTags.size && [...tags].every(tag => otherTags.has(tag));
  }
  return value === other;
}

function changedFieldCount(features: ListeningFeatures, baseline: ListeningFeatures) {
  return sectionKeys.reduce((count, section) => count + Object.keys(sections[section]).filter(field =>
    !sameValue((features[section] as FeatureFields)[field], (baseline[section] as FeatureFields)[field]),
  ).length, 0);
}

const emptyFeatures: ListeningFeatures = {
  structure: { event_form: 'unknown', pitchedness: 'unknown' },
  timbre: { brightness: 'unknown', body: 'unknown', texture_tags: [], distortion: 'unknown' },
  envelope: { attack: 'unknown', shape: 'unknown', tail: 'unknown' },
  space: { reverb: 'unknown' },
};
async function requestReview(hash: string, command?: AnnotationCommand, signal?: AbortSignal): Promise<AnnotationReview> {
  const response = await fetch('/api/local/sample-annotations/' + hash, {
    signal,
    ...(command && { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(command) }),
  });
  if (!response.headers.get('content-type')?.includes('application/json')) {
    throw new Error('本地编辑接口不可用。');
  }
  const data = await response.json();
  if (!response.ok) throw new Error(data.error ?? '标注操作失败。');
  return data;
}

interface Props {
  hash: string | null;
  children?: ReactNode;
  categoryGuard?: 'dirty' | 'busy' | null;
  annotationStatus: SampleVariant['annotationStatus'];
  references: { id: string; key: string; index: number; rootNote: string | null }[];
  onGuardChange: (guard: 'dirty' | 'busy' | null) => void;
  onPublished: () => void;
}

export function AnnotationEditor({ hash, children, categoryGuard, annotationStatus, references, onGuardChange, onPublished }: Props) {
  const [review, setReview] = useState<AnnotationReview | null>(null);
  const [form, setForm] = useState<ListeningFeatures | null>(null);
  const [descriptionForm, setDescriptionForm] = useState<{ text: string; associations: string } | null>(null);
  const [error, setError] = useState('');
  const [feedback, setFeedback] = useState('');
  const [busy, setBusy] = useState(false);
  const [attempt, setAttempt] = useState(0);
  const baseline = review?.draft?.features ?? review?.effectiveFeatures ?? emptyFeatures;
  const draft = form ?? baseline;
  const descriptionBaseline = review?.draft?.soundDescription ?? review?.effectiveSoundDescription;
  const description = descriptionForm ?? {
    text: descriptionBaseline?.text ?? '', associations: descriptionBaseline?.associations.join('\n') ?? '',
  };
  const descriptionChanges = Number(description.text !== (descriptionBaseline?.text ?? ''))
    + Number(description.associations !== (descriptionBaseline?.associations.join('\n') ?? ''));
  const changedCount = changedFieldCount(draft, baseline) + descriptionChanges;
  const dirty = changedCount > 0;

  useEffect(() => {
    if (!hash) return;
    const controller = new AbortController();
    void requestReview(hash, undefined, controller.signal).then(result => {
      if (!controller.signal.aborted) setReview(result);
    }).catch(reason => {
      if (!controller.signal.aborted) setError(reason.message);
    });
    return () => controller.abort();
  }, [hash, attempt]);

  function edit(section: Section, field: string, value: string | string[]) {
    const next = { ...draft, [section]: { ...draft[section], [field]: value } };
    setForm(next);
    setFeedback('');
    onGuardChange(changedFieldCount(next, baseline) + descriptionChanges > 0 ? 'dirty' : null);
  }

  function editDescription(field: 'text' | 'associations', value: string) {
    const next = { ...description, [field]: value };
    setDescriptionForm(next);
    setFeedback('');
    onGuardChange(changedFieldCount(draft, baseline) > 0
      || next.text !== (descriptionBaseline?.text ?? '')
      || next.associations !== (descriptionBaseline?.associations.join('\n') ?? '') ? 'dirty' : null);
  }

  function reload() {
    if (dirty && !window.confirm('重新载入会丢弃未保存的修改。继续吗？')) return;
    setReview(null);
    setForm(null);
    setDescriptionForm(null);
    setError('');
    setFeedback('');
    onGuardChange(null);
    setAttempt(value => value + 1);
  }

  async function submit(command: AnnotationCommand) {
    if (!hash || categoryGuard === 'busy') return;
    setBusy(true);
    onGuardChange('busy');
    setError('');
    setFeedback('');
    let guard: 'dirty' | null = dirty ? 'dirty' : null;
    try {
      const result = await requestReview(hash, command);
      setReview(result);
      setForm(null);
      setDescriptionForm(null);
      guard = null;
      if (command.action === 'publish') {
        onPublished();
      } else {
        setFeedback(command.action === 'save' ? '草稿已保存，尚未用于检索。' : '草稿已丢弃。');
      }
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : '标注操作失败。');
      if (command.action === 'publish') {
        // A partial publish changes the revision. Only retry the draft the user submitted.
        const latest = await requestReview(hash).catch(() => null);
        if (latest?.pendingPublication && latest.draft?.revision === review?.draft?.revision) {
          setReview(latest);
          setForm(null);
          setDescriptionForm(null);
        }
      }
    } finally {
      setBusy(false);
      onGuardChange(guard);
    }
  }

  const model = review?.modelFeatures;
  const locked = busy || categoryGuard === 'busy' || review?.pendingPublication;
  const status = review?.pendingPublication ? '上次发布未完成，请重试发布。'
    : dirty ? `有 ${changedCount} 项未保存修改，请先保存草稿。`
    : feedback || (review?.draft ? '草稿已保存，尚未用于检索。' : effectiveStatusLabels[annotationStatus]);
  const errorMessage = error && <p className="sl-editor-error" role="alert">
    {error} <button type="button" disabled={busy || categoryGuard === 'busy'} onClick={reload}>重新载入标注</button>
  </p>;

  return <section className="sl-editor" aria-label="人工标注编辑">
    <div className="sl-editor-content sl-scroll">
      {children}
      {!hash ? <p className="sl-note">缺少音频哈希，暂不可编辑听感标注。</p>
        : !review ? errorMessage || <p role="status">正在加载标注…</p> : <>
        {references.length > 1 ? <details className="sl-editor-scope">
          <summary>此音频对应 {references.length} 个音色引用，发布后将同步更新</summary>
          <ul className="sl-edit-references">
            {references.map(item => <li key={item.id}>
              <code>{item.key}:{item.index}</code>{item.rootNote && ' · ' + item.rootNote}
            </li>)}
          </ul>
        </details> : <p className="sl-editor-scope">仅影响当前音色引用</p>}
        {!model && <p className="sl-note">没有可对照的 AI 原始标注。</p>}
        <fieldset className="sl-description-editor" disabled={locked}>
          <legend>声音描述</legend>
          <p className="sl-note">描述与听感联想供人工复核，暂不发送给选择模型。联想不代表真实声源。</p>
          {(['text', 'associations'] as const).map(field => {
            const title = field === 'text' ? '声音描述' : '听感联想（每行一项）';
            const original = field === 'text' ? review.modelSoundDescription?.text
              : review.modelSoundDescription?.associations.join('\n');
            const baselineValue = field === 'text' ? descriptionBaseline?.text
              : descriptionBaseline?.associations.join('\n');
            return <div key={field} className="sl-editor-field" data-unsaved={description[field] !== (baselineValue ?? '')}>
              <label>
                <span className="sl-editor-field-heading">{title}
                  {description[field] !== (baselineValue ?? '') && <small className="sl-editor-unsaved">未保存</small>}
                </span>
                <textarea rows={field === 'text' ? 3 : 2} maxLength={field === 'text' ? 1000 : 1009}
                  value={description[field]} onChange={event => editDescription(field, event.target.value)} />
              </label>
              {original !== undefined && original !== description[field] && <div className="sl-editor-original">
                <small>AI 原值：{original || '无'}</small>
                <button type="button" onClick={() => editDescription(field, original)}>恢复 AI 原值（{title}）</button>
              </div>}
            </div>;
          })}
        </fieldset>
        <div className="sl-editor-fields">
          {sectionColumns.map(column => <div key={column[0]} className="sl-editor-column">
            {column.map(section => <fieldset key={section} disabled={locked}>
              <legend>{labels[section]}</legend>
              {Object.entries(sections[section]).map(([field, spec]) => {
                const value = (draft[section] as FeatureFields)[field];
                const original = model && (model[section] as FeatureFields)[field];
                const revised = original != null && !sameValue(value, original);
                const unsaved = !sameValue(value, (baseline[section] as FeatureFields)[field]);
                const heading = <span className="sl-editor-field-heading">
                  <span>{labels[field]}</span>
                  {revised && <small className="sl-editor-revised">人工修订</small>}
                  {unsaved && <small className="sl-editor-unsaved">未保存</small>}
                </span>;
                const comparison = revised && <div className="sl-editor-original">
                  <small>AI 原值：{(Array.isArray(original) ? original : [original]).map(item =>
                    labels[item] ?? item).join(' · ') || '无质感标签'}</small>
                  <button type="button" aria-label={`恢复 AI 原值（${labels[field]}）`}
                    onClick={event => {
                      event.currentTarget.closest('[data-unsaved]')
                        ?.querySelector<HTMLElement>('select, input:not(:disabled)')?.focus();
                      edit(section, field, original);
                    }}>恢复 AI 原值</button>
                </div>;
                if ('items' in spec && Array.isArray(value)) return <div key={field} className="sl-editor-textures" data-unsaved={unsaved}>
                  <div className="sl-editor-texture-heading">
                    {heading}
                    <small>已选 {value.length} 项，最多 {spec.maxItems} 项</small>
                  </div>
                  <div role="group" aria-label={labels[field]}>
                    {spec.items.enum.map(option => <label key={option}>
                      <input type="checkbox" checked={value.includes(option)}
                        disabled={!value.includes(option) && value.length >= spec.maxItems}
                        onChange={event => edit(section, field, event.target.checked
                          ? [...value, option] : value.filter(item => item !== option))} />
                      {labels[option]}
                    </label>)}
                  </div>
                  {comparison}
                </div>;
                if (!('enum' in spec)) return null;
                return <div key={field} className="sl-editor-field" data-unsaved={unsaved}>
                  <label>
                    {heading}
                    <select value={value} onChange={event => edit(section, field, event.target.value)}>
                      {spec.enum.map(option => <option key={option} value={option}>{labels[option]}</option>)}
                    </select>
                  </label>
                  {comparison}
                </div>;
              })}
            </fieldset>)}
          </div>)}
        </div>
      </>}
    </div>
    {review && <footer className="sl-editor-footer">
      {errorMessage}
      <p role="status">{busy ? '正在处理标注…' : status}</p>
      <div className="sl-editor-actions">
        <button type="button" className="sl-discard" disabled={locked || !review.draft}
          onClick={() => {
            if (window.confirm('丢弃这份人工草稿及未保存修改？')) {
              void submit({ action: 'discard', revision: review.revision });
            }
          }}>丢弃草稿</button>
        <button type="button" disabled={locked || (!dirty && Boolean(review.draft))}
          onClick={() => void submit({ action: 'save', revision: review.revision, features: draft,
            soundDescription: { text: description.text, associations: description.associations.split('\n').map(s => s.trim()).filter(Boolean) } })}>保存草稿</button>
        <button type="button" className="sl-publish" disabled={busy || dirty || Boolean(categoryGuard) || !review.draft}
          onClick={() => void submit({ action: 'publish', revision: review.revision })}>
          {review.pendingPublication ? '重试发布' : '确认发布'}
        </button>
      </div>
    </footer>}
  </section>;
}
