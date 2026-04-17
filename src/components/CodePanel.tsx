import { useMemo, useRef } from 'react';
import Scope from './Scope';

interface CodePanelProps {
  code: string;
  error: string | null;
  isPlaying: boolean;
  onCodeChange?: (code: string) => void;
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

// Single-pass tokenizer — avoids regex-on-HTML corruption
function highlightLine(line: string): string {
  let out = '';
  let i = 0;
  const len = line.length;

  const isWordChar = (c: string) => /\w/.test(c);
  const atWordBoundary = () => i === 0 || !isWordChar(line[i - 1]);

  while (i < len) {
    // String literal "..."
    if (line[i] === '"') {
      let j = i + 1;
      while (j < len && line[j] !== '"') j++;
      const s = escapeHtml(line.slice(i, j + 1));
      out += `<span class="text-green-400">${s}</span>`;
      i = j + 1;
      continue;
    }

    // .method(
    if (line[i] === '.') {
      let matched = false;
      for (const m of METHODS) {
        if (line.startsWith(m + '(', i + 1)) {
          out += `.<span class="text-sky-400">${m}</span>(`;
          i += 1 + m.length + 1;
          matched = true;
          break;
        }
      }
      if (matched) continue;
      out += '.';
      i++;
      continue;
    }

    // keyword( or s( / n( at word boundary
    if (atWordBoundary() && isWordChar(line[i])) {
      let matched = false;
      for (const kw of [...KEYWORDS, 's', 'n']) {
        if (line.startsWith(kw + '(', i) && !isWordChar(line[i + kw.length] ?? '')) {
          out += `<span class="text-purple-400">${kw}</span>(`;
          i += kw.length + 1;
          matched = true;
          break;
        }
      }
      if (matched) continue;
    }

    // Number at word boundary
    if (atWordBoundary() && /\d/.test(line[i])) {
      let j = i;
      while (j < len && /[\d.]/.test(line[j])) j++;
      out += `<span class="text-orange-400">${escapeHtml(line.slice(i, j))}</span>`;
      i = j;
      continue;
    }

    out += escapeHtml(line[i]);
    i++;
  }

  return out;
}

function escapeHtml(t: string): string {
  return t.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

const FONT = '13px/1.6 "JetBrains Mono", "Fira Code", ui-monospace, monospace';
const PAD  = '12px 16px';

export default function CodePanel({ code, error, isPlaying, onCodeChange }: CodePanelProps) {
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const preRef      = useRef<HTMLPreElement>(null);
  const lineNumRef  = useRef<HTMLDivElement>(null);

  const highlightedHtml = useMemo(() => {
    if (!code) return '<div> </div>';
    return code.split('\n').map(l => {
      // ._scope() is rendered inside the canvas widget — hide the code line
      if (l.trimStart() === '._scope()') return '<div style="opacity:0"> </div>';
      return `<div>${highlightLine(l) || ' '}</div>`;
    }).join('');
  }, [code]);

  const lineCount = useMemo(() => Math.max(code.split('\n').length, 1), [code]);

  // textarea is the single scroll host — sync pre position and line-numbers
  const handleScroll = () => {
    const ta = textareaRef.current;
    if (!ta) return;
    if (preRef.current) {
      preRef.current.style.transform =
        `translate(-${ta.scrollLeft}px, -${ta.scrollTop}px)`;
    }
    if (lineNumRef.current) {
      lineNumRef.current.scrollTop = ta.scrollTop;
    }
  };

  return (
    <div className="h-full flex flex-col">
      {/* Header */}
      <div className="px-4 py-3 border-b border-border flex items-center justify-between shrink-0">
        <span className="text-sm text-text-secondary font-medium">Strudel 代码</span>
        {code && (
          <span className="text-xs text-success flex items-center gap-1.5">
            <span className="w-1.5 h-1.5 rounded-full bg-success animate-pulse" />
            运行中
          </span>
        )}
      </div>

      {/* Body */}
      <div className="flex-1 overflow-hidden flex flex-col min-h-0">
        <div className="flex flex-1 min-h-0">

            {/* Line numbers — scrolls vertically with textarea (hidden scrollbar) */}
            <div
              ref={lineNumRef}
              className="shrink-0 select-none text-right border-r border-border/50 bg-bg-secondary"
              style={{
                font: FONT,
                padding: PAD,
                paddingRight: '10px',
                color: 'rgba(156,163,175,0.35)',
                minWidth: '3rem',
                overflowY: 'hidden',
                overflowX: 'hidden',
              }}
            >
              {Array.from({ length: lineCount }, (_, i) => (
                <div key={i}>{i + 1}</div>
              ))}
            </div>

            {/*
             * Editor area: textarea is the scroll host (overflow: auto → both scrollbars).
             * pre sits absolutely at top-left and is shifted via transform to follow scroll.
             */}
            <div className="relative flex-1 min-w-0">
              {/* Highlight layer */}
              <pre
                ref={preRef}
                aria-hidden
                className="absolute top-0 left-0 m-0 pointer-events-none"
                style={{
                  font: FONT,
                  padding: PAD,
                  whiteSpace: 'pre',
                  background: 'transparent',
                  transformOrigin: 'top left',
                  // width unconstrained so highlights match textarea content
                  minWidth: '100%',
                }}
                dangerouslySetInnerHTML={{ __html: highlightedHtml }}
              />

              {/* Edit + scroll host */}
              <textarea
                ref={textareaRef}
                value={code}
                onChange={e => onCodeChange?.(e.target.value)}
                onScroll={handleScroll}
                spellCheck={false}
                autoComplete="off"
                autoCorrect="off"
                autoCapitalize="off"
                placeholder="在此输入 Strudel 代码，然后点击播放..."
                className="absolute inset-0 w-full h-full bg-transparent outline-none resize-none placeholder:text-text-muted/40"
                style={{
                  font: FONT,
                  padding: PAD,
                  color: code ? 'transparent' : '#e2e8f0',
                  caretColor: '#e2e8f0',
                  whiteSpace: 'pre',
                  overflowWrap: 'normal',
                  overflow: 'auto',       // ← both scrollbars appear as needed
                  wordBreak: 'normal',
                }}
              />
            </div>

        </div>

        {error && (
          <div className="m-3 p-3 bg-error/10 border border-error/30 rounded-lg text-error text-xs font-mono shrink-0">
            {error}
          </div>
        )}

        {code.includes('._scope()') && (
          <div className="h-20 shrink-0">
            <Scope isPlaying={isPlaying} />
          </div>
        )}
      </div>
    </div>
  );
}
