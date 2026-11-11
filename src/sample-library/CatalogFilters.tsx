import { useState } from 'react';
import { FEATURE_OPTIONS } from '../lib/sample-search';
import { emptyFilters, labels, statusLabels, type CatalogFilters as Filters } from './catalog';

function CategoryPicker({ categories, value, onChange }: {
  categories: readonly (string | null)[];
  value: Filters['category'];
  onChange: (value: Filters['category']) => void;
}) {
  const [query, setQuery] = useState('');
  const visible = categories.filter(category =>
    (category ?? '类别待确认').toLowerCase().includes(query.trim().toLowerCase()));
  return <details className="sl-picker" name="sample-filters" onToggle={event => {
    if (!event.currentTarget.open) setQuery('');
  }}>
    <summary>类别{value !== undefined ? ' · 已选' : ''}</summary>
    <div className="sl-picker-content">
      <input type="search" aria-label="查找类别" placeholder="查找类别" value={query}
        onChange={event => setQuery(event.target.value)} />
      <div className="sl-category-options">
        {[undefined, ...visible].map(category => (
          <button key={category ?? String(category)} type="button" aria-pressed={value === category}
            onClick={event => {
              onChange(category);
              const picker = event.currentTarget.closest('details');
              if (picker) {
                picker.open = false;
                picker.querySelector('summary')?.focus();
              }
            }}>
            {category === undefined ? '全部类别' : category ?? '类别待确认'}
          </button>
        ))}
        {visible.length === 0 && <p>没有匹配的类别</p>}
      </div>
    </div>
  </details>;
}

export function CatalogFilters({ query, categories, filters, onQuery, onChange, onClear }: {
  query: string;
  categories: readonly (string | null)[];
  filters: Filters;
  onQuery: (query: string) => void;
  onChange: (filters: Filters) => void;
  onClear: () => void;
}) {
  const { category, brightness, status, textures } = filters;
  const chips = [
    ...(query.trim() ? [{ key: 'query', label: query.trim(), remove: () => onQuery('') }] : []),
    ...(category !== undefined ? [{
      key: 'category', label: category ?? '类别待确认', remove: () => onChange({ ...filters, category: undefined }),
    }] : []),
    ...(brightness ? [{
      key: 'brightness', label: labels[brightness] ?? brightness, remove: () => onChange({ ...filters, brightness: '' }),
    }] : []),
    ...textures.map(texture => ({
      key: texture, label: labels[texture] ?? texture,
      remove: () => onChange({ ...filters, textures: textures.filter(value => value !== texture) }),
    })),
    ...(status !== 'all' ? [{
      key: 'status', label: statusLabels[status], remove: () => onChange({ ...filters, status: emptyFilters.status }),
    }] : []),
  ];

  return <div className="sl-tools">
    <div className="sl-filter-row">
      <label className="sl-search">
        <span>搜索音色</span>
        <input type="search" value={query} placeholder="名称、别名或听感，如 piano、军鼓 明亮"
          onChange={event => onQuery(event.target.value)} />
      </label>
      <CategoryPicker categories={categories} value={category} onChange={value => onChange({ ...filters, category: value })} />
      <label className="sl-filter">
        <span>亮度</span>
        <select value={brightness} onChange={event => onChange({ ...filters, brightness: event.target.value })}>
          <option value="">不限亮度</option>
          {FEATURE_OPTIONS.brightness.map(value => <option key={value} value={value}>{labels[value]}</option>)}
        </select>
      </label>
      <details className="sl-picker" name="sample-filters">
        <summary>质感{textures.length > 0 ? ' · ' + textures.length : ''}</summary>
        <div className="sl-picker-content sl-texture-options">
          {FEATURE_OPTIONS.texture_tags.map(value => (
            <label key={value}>
              <input type="checkbox" checked={textures.includes(value)} onChange={event => onChange({
                ...filters,
                textures: event.target.checked ? [...textures, value] : textures.filter(texture => texture !== value),
              })} />
              {labels[value]}
            </label>
          ))}
        </div>
      </details>
      <label className="sl-filter sl-status-filter">
        <span>标注状态</span>
        <select value={status} onChange={event => onChange({ ...filters, status: event.target.value as Filters['status'] })}>
          <option value="all">全部状态</option>
          {Object.entries(statusLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
        </select>
      </label>
    </div>
    {chips.length > 0 && <div className="sl-active-filters" aria-label="已选筛选条件">
      {chips.map(({ key, label, remove }) => <button key={key} type="button" aria-label={'移除 ' + label}
        onClick={remove}>{label} <span aria-hidden="true">×</span></button>)}
      <button className="sl-clear" type="button" onClick={onClear}>清空全部</button>
    </div>}
  </div>;
}
