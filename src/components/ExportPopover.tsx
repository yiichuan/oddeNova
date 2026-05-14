import { useMemo, useState } from 'react';
import { useIsMobile } from '../hooks/useIsMobile';

interface ExportPopoverProps {
  open: boolean;
  onClose: () => void;
  onToggle?: () => void;
  buttonDisabled?: boolean;
  onExport: (p: {
    filename: string;
    beginCycle: number;
    endCycle: number;
    sampleRate: number;
  }) => Promise<boolean>;
  exportState: {
    status: 'idle' | 'exporting' | 'error';
    progress: number;
    error?: string;
  };
  onResetState: () => void;
  bpm: number;
}

function defaultFilename() {
  const now = new Date();
  const pad = (n: number) => String(n).padStart(2, '0');
  const date = `${now.getFullYear()}${pad(now.getMonth() + 1)}${pad(now.getDate())}`;
  const time = `${pad(now.getHours())}${pad(now.getMinutes())}${pad(now.getSeconds())}`;
  return `oddeNova_${date}_${time}`;
}

function formatDuration(seconds: number): string {
  if (seconds < 60) return `${seconds.toFixed(1)} 秒`;
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m} 分 ${s} 秒`;
}

export default function ExportPopover({
  open,
  onClose,
  onExport,
  exportState,
  onResetState,
  bpm,
}: ExportPopoverProps) {
  const isMobile = useIsMobile();

  const [filename, setFilename] = useState('');
  const [filenamePlaceholder] = useState(() => defaultFilename());
  const [beginCycle, setBeginCycle] = useState(0);
  const [endCycle, setEndCycle] = useState(4);
  const [beginCycleStr, setBeginCycleStr] = useState('0');
  const [endCycleStr, setEndCycleStr] = useState('4');
  const [sampleRate, setSampleRate] = useState(48000);

  const commitBegin = (str: string) => {
    const n = parseInt(str, 10);
    const v = isNaN(n) ? 0 : Math.max(0, n);
    setBeginCycle(v);
    setBeginCycleStr(String(v));
  };
  const commitEnd = (str: string) => {
    const n = parseInt(str, 10);
    const v = isNaN(n) ? 0 : Math.max(0, n);
    setEndCycle(v);
    setEndCycleStr(String(v));
  };

  const canExport = useMemo(
    () => endCycle > beginCycle,
    [endCycle, beginCycle],
  );

  const durationStr = useMemo(() => {
    if (!canExport || bpm <= 0) return null;
    return formatDuration((endCycle - beginCycle) * 240 / bpm);
  }, [canExport, beginCycle, endCycle, bpm]);

  if (!open) return null;

  const handleExport = async () => {
    if (!canExport) return;
    await onExport({
      filename: filename.trim() || filenamePlaceholder,
      beginCycle,
      endCycle,
      sampleRate,
    });
  };

  const handleCloseSafe = () => {
    if (exportState.status === 'exporting') return;
    onClose();
  };

  const handleErrorClose = () => {
    onResetState();
    onClose();
  };

  // ── Body content (shared between desktop popover and mobile sheet) ──
  const body = (
    <div
      className="flex flex-col gap-3"
      style={{ fontFamily: "'ABeeZee', monospace" }}
    >
      {exportState.status === 'exporting' ? (
        <>
          <div className="text-[13px] text-white/70">
            渲染中… {Math.round(exportState.progress * 100)}%
          </div>
          <div className="h-[3px] w-full bg-[#323232] overflow-hidden">
            <div
              className="h-full bg-white/70 transition-[width] duration-100 ease-linear"
              style={{ width: `${Math.round(exportState.progress * 100)}%` }}
            />
          </div>
          <div className="flex justify-end">
            <button
              onClick={onClose}
              className="px-3 py-1.5 text-[12px] text-white/70 hover:text-white/90 border border-[#323232]"
            >
              取消
            </button>
          </div>
        </>
      ) : exportState.status === 'error' ? (
        <>
          <div className="text-[12px] text-red-400 break-words">
            {exportState.error || '导出失败'}
          </div>
          <div className="flex justify-end">
            <button
              onClick={handleErrorClose}
              className="px-3 py-1.5 text-[12px] text-white/70 hover:text-white/90 border border-[#323232]"
            >
              关闭
            </button>
          </div>
        </>
      ) : (
        <>
          <Field label="文件名">
            <input
              type="text"
              value={filename}
              onChange={(e) => setFilename(e.target.value)}
              placeholder={filenamePlaceholder}
              className="w-full bg-black border border-[#323232] px-2 py-1.5 text-[12px] text-white/90 outline-none focus:border-white/30 placeholder:text-white/30"
              style={{ fontFamily: "'ABeeZee', monospace" }}
            />
          </Field>

          <div className="flex gap-2">
            <Field label="起始 cycle">
              <CycleInput
                value={beginCycleStr}
                onChange={setBeginCycleStr}
                onCommit={commitBegin}
              />
            </Field>
            <Field label="结束 cycle">
              <CycleInput
                value={endCycleStr}
                onChange={setEndCycleStr}
                onCommit={commitEnd}
              />
            </Field>
          </div>

          {durationStr && (
            <div className="flex items-center justify-between text-[12px]">
              <span className="text-white/50">预计时长</span>
              <span className="text-white/80" style={{ fontFamily: "'ABeeZee', monospace" }}>{durationStr}</span>
            </div>
          )}

          {!canExport && (
            <div className="text-[12px] text-red-400">
              起始 cycle 必须小于结束 cycle
            </div>
          )}

          <Field label="采样率">
            <select
              value={sampleRate}
              onChange={(e) => setSampleRate(Number(e.target.value))}
              className="w-full bg-black border border-[#323232] px-2 py-1.5 text-[12px] text-white/90 outline-none focus:border-white/30"
              style={{ fontFamily: "'ABeeZee', monospace" }}
            >
              <option value={44100}>44100 Hz</option>
              <option value={48000}>48000 Hz</option>
            </select>
          </Field>

          <div className="flex justify-end gap-2 pt-1">
            <button
              onClick={onClose}
              className="px-3 py-1.5 text-[12px] text-white/70 hover:text-white/90 border border-[#323232]"
            >
              取消
            </button>
            <button
              onClick={handleExport}
              disabled={!canExport}
              className="px-3 py-1.5 text-[12px] text-white border border-white/30 hover:bg-white/10 disabled:opacity-40 disabled:cursor-not-allowed"
            >
              导出
            </button>
          </div>
        </>
      )}
    </div>
  );

  if (isMobile) {
    return (
      <div className="fixed inset-0 z-50" onClick={handleCloseSafe}>
        <div className="absolute inset-0 bg-black/50" />
        <div
          className="absolute bottom-0 left-0 right-0 bg-[#111] border-t border-[#323232] px-6 py-6"
          onClick={(e) => e.stopPropagation()}
        >
          <div
            className="text-[14px] text-white/90 font-bold mb-4"
            style={{ fontFamily: "'ABeeZee', monospace" }}
          >
            导出 WAV
          </div>
          {body}
        </div>
      </div>
    );
  }

  return (
    <>
      <div className="fixed inset-0 z-40" onClick={handleCloseSafe} />
      <div
        className="absolute top-0 right-0 z-50 w-[280px] bg-[#111] border border-[#323232] shadow-xl p-3"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="text-[12px] text-white/90 font-bold mb-6"
          style={{ fontFamily: "'ABeeZee', monospace" }}
        >
          导出 WAV
        </div>
        {body}
      </div>
    </>
  );
}

function CycleInput({
  value,
  onChange,
  onCommit,
}: {
  value: string;
  onChange: (v: string) => void;
  onCommit: (v: string) => void;
}) {
  const step = (delta: number) => {
    const n = parseInt(value, 10);
    const next = String(isNaN(n) ? Math.max(0, delta) : Math.max(0, n + delta));
    onChange(next);
    onCommit(next);
  };

  return (
    <div className="flex w-full border border-[#323232] overflow-hidden focus-within:border-white/30 bg-black">
      <input
        type="text"
        inputMode="numeric"
        value={value}
        onChange={(e) => onChange(e.target.value.replace(/[^0-9-]/g, ''))}
        onBlur={(e) => onCommit(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter') onCommit(value);
          if (e.key === 'ArrowUp') { e.preventDefault(); step(1); }
          if (e.key === 'ArrowDown') { e.preventDefault(); step(-1); }
        }}
        className="flex-1 min-w-0 bg-transparent px-2 py-1.5 text-[12px] text-white/90 outline-none"
        style={{ fontFamily: "'ABeeZee', monospace" }}
      />
      <div className="flex flex-col border-l border-[#323232]">
        <button
          type="button"
          onClick={() => step(1)}
          className="flex-1 flex items-center justify-center px-1.5 text-white/50 hover:text-white/90 hover:bg-white/5 leading-none"
          tabIndex={-1}
        >
          <svg width="8" height="5" viewBox="0 0 8 5" fill="none">
            <path d="M4 0.5L7.5 4.5H0.5L4 0.5Z" fill="currentColor" />
          </svg>
        </button>
        <div className="h-px bg-[#323232]" />
        <button
          type="button"
          onClick={() => step(-1)}
          className="flex-1 flex items-center justify-center px-1.5 text-white/50 hover:text-white/90 hover:bg-white/5 leading-none"
          tabIndex={-1}
        >
          <svg width="8" height="5" viewBox="0 0 8 5" fill="none">
            <path d="M4 4.5L0.5 0.5H7.5L4 4.5Z" fill="currentColor" />
          </svg>
        </button>
      </div>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="flex flex-col gap-1 flex-1 min-w-0">
      <span className="text-[11px] text-white/50">{label}</span>
      {children}
    </label>
  );
}
