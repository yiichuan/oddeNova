import { useState } from 'react';
import type { SearchSample } from '../lib/sample-search';
import type { SampleCategory, SampleCategoryUpdate } from './annotation-editor-types';

interface Props {
  sample: SearchSample;
  disabled: boolean;
  onGuardChange: (guard: 'dirty' | 'busy' | null) => void;
  onSaved: (value: SampleCategory) => void;
}

export function CategoryEditor({ sample, disabled, onGuardChange, onSaved }: Props) {
  const [value, setValue] = useState(sample.category ?? '');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const category = value.trim() || null;
  const dirty = category !== sample.category;
  const original = sample.originalCategory === undefined ? sample.category : sample.originalCategory;

  function edit(next: string) {
    setValue(next);
    setError('');
    onGuardChange((next.trim() || null) !== sample.category ? 'dirty' : null);
  }

  async function save() {
    if (!dirty || busy || disabled) return;
    setBusy(true);
    setError('');
    onGuardChange('busy');
    try {
      const command: SampleCategoryUpdate = { key: sample.key, expectedCategory: sample.category, category };
      const response = await fetch('/api/local/sample-annotations/category', {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(command),
      });
      if (!response.headers.get('content-type')?.includes('application/json')) {
        throw new Error('本地编辑接口不可用。');
      }
      const result = await response.json();
      if (!response.ok) throw new Error(result.error ?? '类别保存失败。');
      onSaved(result);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : '类别保存失败。');
      onGuardChange('dirty');
    } finally {
      setBusy(false);
    }
  }

  return <form className="sl-category-editor" onSubmit={event => {
    event.preventDefault();
    void save();
  }}>
    <fieldset disabled={busy || disabled}>
      <legend>目录类别</legend>
      <div className="sl-editor-field" data-unsaved={dirty}>
        <input aria-label="目录类别" type="text" value={value} maxLength={120} onChange={event => edit(event.target.value)} />
      </div>
      <p className="sl-note">应用于 {sample.key} 的所有变体。留空可设为未分类。</p>
      {error && <p className="sl-editor-error" role="alert">{error}</p>}
      <div className="sl-editor-actions">
        <button className="sl-publish" type="submit" disabled={!dirty}>{busy ? '保存中…' : '保存类别'}</button>
        {category !== original && <button type="button" onClick={() => edit(original ?? '')}>恢复来源类别</button>}
      </div>
    </fieldset>
  </form>;
}
