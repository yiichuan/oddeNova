import { useEffect, useRef, useState } from 'react';
import type { TokenStats } from '../../hooks/useSessions';
import { getContextWindowSize } from '../../lib/model-context-sizes';
import { t } from '../../lib/i18n';

interface ContextWindowIndicatorProps {
  tokenStats: TokenStats;
}

function formatK(n: number): string {
  if (n >= 1000) return `${(n / 1000).toFixed(1)}K`;
  return String(n);
}

export default function ContextWindowIndicator({ tokenStats }: ContextWindowIndicatorProps) {
  const [showPopup, setShowPopup] = useState(false);
  const [hovered, setHovered] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  const contextWindowSize = getContextWindowSize(tokenStats.modelId);  // upper bound (static)
  const totalPrompt = tokenStats.promptTokens;  // actual prompt token count returned by the API (includes system + dialog)
  const pct = Math.min(totalPrompt / contextWindowSize, 1);  // total usage ratio (capped at 100%)
  const systemPct = Math.min(tokenStats.systemEstimate / contextWindowSize, 1);  // system prompt proportion
  const dialogPct = Math.max(0, pct - systemPct);  // dialog content proportion

  // SVG donut ring params
  const SIZE = 20;
  const STROKE = 2.5;
  const R = (SIZE - STROKE) / 2;
  const CIRC = 2 * Math.PI * R;

  const systemDash = systemPct * CIRC;
  const dialogDash = dialogPct * CIRC;
  const dialogOffset = CIRC - systemDash;

  // Close popup on outside click
  useEffect(() => {
    if (!showPopup) return;
    const handler = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setShowPopup(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [showPopup]);

  return (
    <div ref={containerRef} className="relative inline-flex items-center">
      {/* Circular ring button */}
      <button
        type="button"
        onClick={() => setShowPopup((v) => !v)}
        onMouseEnter={() => setHovered(true)}
        onMouseLeave={() => setHovered(false)}
        className="relative inline-flex items-center justify-center w-6 h-6 rounded-full transition-colors hover:bg-white/5"
        title={t('contextWindow')}
        aria-label={t('contextWindow')}
      >
        <svg width={SIZE} height={SIZE} viewBox={`0 0 ${SIZE} ${SIZE}`} style={{ transform: 'rotate(-90deg)' }}>
          {/* Track */}
          <circle
            cx={SIZE / 2}
            cy={SIZE / 2}
            r={R}
            fill="none"
            stroke="#3c3c3c"
            strokeWidth={STROKE}
          />
          {/* System portion */}
          <circle
            cx={SIZE / 2}
            cy={SIZE / 2}
            r={R}
            fill="none"
            stroke="#6b9fd4"
            strokeWidth={STROKE}
            strokeDasharray={`${systemDash} ${CIRC - systemDash}`}
            strokeDashoffset={0}
            strokeLinecap="butt"
          />
          {/* Dialog portion */}
          {dialogDash > 0 && (
            <circle
              cx={SIZE / 2}
              cy={SIZE / 2}
              r={R}
              fill="none"
              stroke="#0078d4"
              strokeWidth={STROKE}
              strokeDasharray={`${dialogDash} ${CIRC - dialogDash}`}
              strokeDashoffset={dialogOffset}
              strokeLinecap="butt"
            />
          )}
        </svg>
        {/* Percentage label on hover (when popup closed) */}
        {hovered && !showPopup && (
          <span className="absolute -top-6 left-1/2 -translate-x-1/2 whitespace-nowrap rounded px-1 py-0.5 text-[10px] text-[#cccccc] bg-[#1e1e1e] border border-[#3c3c3c] pointer-events-none">
            {Math.round(pct * 100)}%
          </span>
        )}
      </button>

      {/* Popup panel */}
      {showPopup && (
        <div
          className="absolute bottom-full left-0 mb-2 w-56 rounded-lg border border-[#3c3c3c] bg-[#1e1e1e] shadow-lg z-50 p-3"
          style={{ fontSize: '12px' }}
        >
          {/* Header */}
          <div className="text-[#cccccc] font-medium mb-1.5">{t('contextWindow')}</div>

          {/* Total line */}
          <div className="flex items-center justify-between text-[#aaaaaa] mb-1.5">
            <span>{formatK(totalPrompt)}/{formatK(contextWindowSize)} {t('tokens')}</span>
            <span className="text-[#cccccc] font-medium">{Math.round(pct * 100)}%</span>
          </div>

          {/* Progress bar */}
          <div className="h-1.5 w-full rounded-full bg-[#3c3c3c] mb-2 overflow-hidden flex">
            <div
              className="h-full bg-[#6b9fd4] rounded-l-full"
              style={{ width: `${systemPct * 100}%` }}
            />
            <div
              className="h-full bg-[#0078d4]"
              style={{ width: `${dialogPct * 100}%` }}
            />
          </div>

          {/* Breakdown */}
          <div className="space-y-1">
            <div className="flex items-center justify-between text-[#888888]">
              <span className="flex items-center gap-1.5">
                <span className="inline-block w-2 h-2 rounded-sm bg-[#6b9fd4]" />
                System
              </span>
              <span>{Math.round(systemPct * 100)}%</span>
            </div>
            <div className="flex items-center justify-between text-[#888888]">
              <span className="flex items-center gap-1.5">
                <span className="inline-block w-2 h-2 rounded-sm bg-[#0078d4]" />
                Dialog
              </span>
              <span>{Math.round(dialogPct * 100)}%</span>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}


