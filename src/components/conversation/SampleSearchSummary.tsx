import { useState } from 'react';
import type { SampleSearchSummaryItem } from '../../hooks/useChat';
import { zh } from '../../lib/i18n';

export function SampleSearchSummary({ items }: { items: SampleSearchSummaryItem[] }) {
  const [expanded, setExpanded] = useState(false);
  const remaining = items.length - 2;

  return (
    <div className="mt-1.5 text-sm text-text-secondary" data-sample-search-summary>
      <ul className="space-y-2">
        {(expanded ? items : items.slice(0, 2)).map(({ query, labels }, index) => (
          <li key={index} className="[overflow-wrap:anywhere]">
            <p>{query}</p>
            {labels.length > 0 && (
              <div className="mt-1 flex flex-wrap gap-1.5">
                {labels.map((label) => (
                  <span key={label} className="min-w-0 rounded-md bg-text-primary/5 px-2 py-0.5 text-xs">
                    {label}
                  </span>
                ))}
              </div>
            )}
          </li>
        ))}
      </ul>
      {remaining > 0 && (
        <button
          type="button"
          aria-expanded={expanded}
          onClick={() => setExpanded((value) => !value)}
          className="mt-1.5 py-1 text-left text-xs underline underline-offset-2 hover:text-text-primary"
        >
          {expanded
            ? (zh ? '收起其余搜索' : 'Show fewer searches')
            : (zh ? `展开其余 ${remaining} 组` : `Show ${remaining} more`)}
        </button>
      )}
    </div>
  );
}
