import { useMemo, useState } from 'react';
import type { filterCatalog } from './catalog';
import { directoryPath, groupDirectory } from './directory';

type Result = ReturnType<typeof filterCatalog>[number];
type Expansion = ReadonlyMap<string, boolean>;
const PAGE_SIZE = 60;

function openPath(expansion: Expansion, sampleKey: string | undefined): Expansion {
  if (!sampleKey) return expansion;
  const { category, group } = directoryPath(sampleKey);
  return new Map(expansion).set(category.id, true).set(group.id, true);
}

function DirectoryBranches({ results, selectedKey, ranked, filtered, expansion, onToggle, onSelect }: {
  results: Result[];
  selectedKey: string | undefined;
  ranked: boolean;
  filtered: boolean;
  expansion: Expansion;
  onToggle: (id: string, open: boolean) => void;
  onSelect: (key: string) => void;
}) {
  const categories = useMemo(() => groupDirectory(results, ranked), [results, ranked]);
  const [limits, setLimits] = useState<ReadonlyMap<string, number>>(() => new Map());
  const isOpen = (id: string) => expansion.get(id) ?? filtered;

  function heading(id: string, title: string, count: number, level: 'category' | 'group') {
    const open = isOpen(id);
    return <button type="button" className={`sl-directory-heading sl-directory-${level}`}
      aria-expanded={open} onClick={() => onToggle(id, !open)}>
      <span aria-hidden="true">{open ? '▾' : '▸'}</span>
      <span>{title}</span>
      <small aria-label={`${count} 个音色`}>{count.toLocaleString()}</small>
    </button>;
  }

  return <ul className="sl-directory">
    {categories.map(category => <li key={category.id}>
      {heading(category.id, category.title[0], category.count, 'category')}
      {isOpen(category.id) && <ul>
        {category.groups.map(group => {
          const limit = limits.get(group.id) ?? PAGE_SIZE;
          const visible = group.results.slice(0, limit);
          const selectedIndex = group.results.findIndex(result => result.sample.key === selectedKey);
          if (selectedIndex >= limit) visible.push(group.results[selectedIndex]);
          const remaining = group.results.length - visible.length;
          return <li key={group.id}>
            {heading(group.id, group.title[0], group.results.length, 'group')}
            {isOpen(group.id) && <ul>
              {visible.map(({ sample, variants, matchedLabels }) => <li key={sample.key}>
                <button type="button" className="sl-directory-sample"
                  aria-pressed={selectedKey === sample.key} onClick={() => onSelect(sample.key)}>
                  <span className="sl-result-name">{sample.key}<small>
                    {filtered ? `匹配 ${variants.length} / 共 ${sample.variants.length}` : `共 ${sample.variants.length} 个变体`}
                  </small></span>
                  {matchedLabels.length > 0 && <span className="sl-match-labels">{matchedLabels.join(' · ')}</span>}
                </button>
              </li>)}
              {remaining > 0 && <li><button type="button" className="sl-more"
                onClick={() => setLimits(previous => new Map(previous).set(group.id, limit + PAGE_SIZE))}>
                加载更多（剩余 {remaining}）
              </button></li>}
            </ul>}
          </li>;
        })}
      </ul>}
    </li>)}
  </ul>;
}

function FilteredBranches(props: Omit<Parameters<typeof DirectoryBranches>[0], 'expansion' | 'onToggle'>) {
  const [expansion, setExpansion] = useState<Expansion>(() => new Map());
  return <DirectoryBranches {...props} expansion={expansion}
    onToggle={(id, open) => setExpansion(previous => new Map(previous).set(id, open))} />;
}

export function SampleDirectory({ scope, results, selectedKey, ranked, onSelect }: {
  scope: string | null;
  results: Result[];
  selectedKey: string | undefined;
  ranked: boolean;
  onSelect: (key: string) => void;
}) {
  const filtered = scope !== null;
  const [browse, setBrowse] = useState(() => ({
    filtered, selectedKey, expansion: openPath(new Map(), selectedKey),
  }));
  if (browse.filtered !== filtered || browse.selectedKey !== selectedKey) {
    setBrowse({ filtered, selectedKey, expansion: filtered ? browse.expansion : openPath(browse.expansion, selectedKey) });
  }
  const props = { results, selectedKey, ranked, filtered, onSelect };
  return <div className="sl-results sl-scroll" key={scope ?? 'browse'}>
    {results.length === 0 ? <p className="sl-empty">没有匹配的音色。试试更短的名称，或清空筛选。</p>
      : filtered ? <FilteredBranches {...props} />
      : <DirectoryBranches {...props} expansion={browse.expansion}
        onToggle={(id, open) => setBrowse(previous => ({
          ...previous, expansion: new Map(previous.expansion).set(id, open),
        }))} />}
  </div>;
}
