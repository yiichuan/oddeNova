import React, { useMemo } from 'react';

interface CodePanelProps {
  code: string;
  error: string | null;
}

const KEYWORDS = [
  'stack', 'cat', 'note', 'setcps', 'hush', 'silence',
  'seq', 'polymeter', 'polyrhythm',
];

const METHODS = [
  'gain', 'lpf', 'hpf', 'delay', 'room', 'pan', 'speed',
  'bank', 'fast', 'slow', 'rev', 'jux', 'every', 'sometimes',
  'off', 'add', 'scale', 'vowel', 'cutoff', 'clip', 'orbit',
  'shape', 'crush', 'coarse', 'attack', 'release', 'sustain',
  'decay', 'out', 'play',
];

function highlightCode(code: string): React.JSX.Element[] {
  const lines = code.split('\n');
  return lines.map((line, i) => (
    <div key={i} className="flex">
      <span className="w-8 text-right mr-4 text-text-muted/40 select-none text-xs leading-relaxed">
        {i + 1}
      </span>
      <span
        className="flex-1"
        dangerouslySetInnerHTML={{ __html: highlightLine(line) }}
      />
    </div>
  ));
}

function highlightLine(line: string): string {
  let result = escapeHtml(line);

  // Strings (double-quoted mini notation)
  result = result.replace(
    /&quot;([^&]*)&quot;/g,
    '<span class="text-green-400">&quot;$1&quot;</span>'
  );

  // Numbers
  result = result.replace(
    /\b(\d+\.?\d*)\b/g,
    '<span class="text-orange-400">$1</span>'
  );

  // Top-level functions
  for (const kw of KEYWORDS) {
    const re = new RegExp(`\\b(${kw})\\(`, 'g');
    result = result.replace(re, `<span class="text-purple-400 font-semibold">$1</span>(`);
  }

  // Chained methods
  for (const m of METHODS) {
    const re = new RegExp(`\\.(${m})\\(`, 'g');
    result = result.replace(re, `.<span class="text-sky-400">$1</span>(`);
  }

  // s() function
  result = result.replace(
    /\bs\(/g,
    '<span class="text-purple-400 font-semibold">s</span>('
  );

  // n() function
  result = result.replace(
    /\bn\(/g,
    '<span class="text-purple-400 font-semibold">n</span>('
  );

  return result;
}

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

export default function CodePanel({ code, error }: CodePanelProps) {
  const highlighted = useMemo(() => {
    if (!code) return null;
    return highlightCode(code);
  }, [code]);

  return (
    <div className="h-full flex flex-col">
      <div className="px-4 py-3 border-b border-border flex items-center justify-between">
        <span className="text-sm text-text-secondary font-medium">Strudel 代码</span>
        {code && (
          <span className="text-xs text-success flex items-center gap-1.5">
            <span className="w-1.5 h-1.5 rounded-full bg-success animate-pulse" />
            运行中
          </span>
        )}
      </div>

      <div className="flex-1 p-4 overflow-auto">
        {!code && !error && (
          <div className="flex items-center justify-center h-full text-text-muted text-sm">
            <p>等待生成代码...</p>
          </div>
        )}

        {highlighted && (
          <pre className="text-sm font-mono leading-relaxed">
            {highlighted}
          </pre>
        )}

        {error && (
          <div className="mt-3 p-3 bg-error/10 border border-error/30 rounded-lg text-error text-xs font-mono">
            {error}
          </div>
        )}
      </div>
    </div>
  );
}
