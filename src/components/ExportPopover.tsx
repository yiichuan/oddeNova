import { useMemo, useState } from 'react';
import { useIsMobile } from '../hooks/useIsMobile';

interface ExportPopoverProps {
  open: boolean;
  onClose: () => void;
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
}

const SAMPLE_RATES = [44100, 48000] as const;

function defaultFilename() {
  return `oddenova-${new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19)}`;
}

export default function ExportPopover({
  open,
  onClose,
  onExport,
  exportState,
  onResetState,
}: ExportPopoverProps) {
  const isMobile = useIsMobile();

  const [filename, setFilename] = useState(defaultFilename);
  const [beginCycle, setBeginCycle] = useState(0);
  const [endCycle, setEndCycle] = useState(4);
  const [sampleRate, setSampleRate] = useState<number>(48000);

  // Refresh filename timestamp on each open->true transition (React "previous value" pattern).
  const [prevOpen, setPrevOpen] = useState(open);
  if (open !== prevOpen) {
    setPrevOpen(open);
    if (open && exportState.status === 'idle') {
      setFilename(defaultFilename());
    }
  }

  const canExport = useMemo(
    () => endCycle > beginCycle && filename.trim().length > 0,
    [endCycle, beginCycle, filename],
  );

  if (!open) return null;

  const handleExport = async () => {
    if (!canExport) return;
    await onExport({
      filename: filename.trim(),
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
          <div className="h-[3px] w-full bg-[#323232] rounded overflow-hidden">
            <div
              className="h-full bg-white/70 transition-[width] duration-100 ease-linear"
              style={{ width: `${Math.round(exportState.progress * 100)}%` }}
            />
          </div>
          <div className="flex justify-end">
            <button
              onClick={onClose}
              className="px-3 py-1.5 text-[12px] text-white/70 hover:text-white/90 border border-[#323232] rounded"
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
              className="px-3 py-1.5 text-[12px] text-white/70 hover:text-white/90 border border-[#323232] rounded"
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
              className="w-full bg-black border border-[#323232] rounded px-2 py-1.5 text-[12px] text-white/90 outline-none focus:border-white/30"
              style={{ fontFamily: "'ABeeZee', monospace" }}
            />
          </Field>

          <div className="flex gap-2">
            <Field label="起始 cycle">
              <input
                type="number"
                min={0}
                step={1}
                value={beginCycle}
                onChange={(e) => setBeginCycle(Number(e.target.value) || 0)}
                className="w-full bg-black border border-[#323232] rounded px-2 py-1.5 text-[12px] text-white/90 outline-none focus:border-white/30"
                style={{ fontFamily: "'ABeeZee', monospace" }}
              />
            </Field>
            <Field label="结束 cycle">
              <input
                type="number"
                min={0}
                step={1}
                value={endCycle}
                onChange={(e) => setEndCycle(Number(e.target.value) || 0)}
                className="w-full bg-black border border-[#323232] rounded px-2 py-1.5 text-[12px] text-white/90 outline-none focus:border-white/30"
                style={{ fontFamily: "'ABeeZee', monospace" }}
              />
            </Field>
          </div>

          <Field label="采样率">
            <select
              value={sampleRate}
              onChange={(e) => setSampleRate(Number(e.target.value))}
              className="w-full bg-black border border-[#323232] rounded px-2 py-1.5 text-[12px] text-white/90 outline-none focus:border-white/30"
              style={{ fontFamily: "'ABeeZee', monospace" }}
            >
              {SAMPLE_RATES.map((sr) => (
                <option key={sr} value={sr}>
                  {sr} Hz
                </option>
              ))}
            </select>
          </Field>

          <div className="flex justify-end gap-2 pt-1">
            <button
              onClick={onClose}
              className="px-3 py-1.5 text-[12px] text-white/70 hover:text-white/90 border border-[#323232] rounded"
            >
              取消
            </button>
            <button
              onClick={handleExport}
              disabled={!canExport}
              className="px-3 py-1.5 text-[12px] text-white border border-white/30 rounded hover:bg-white/10 disabled:opacity-40 disabled:cursor-not-allowed"
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
    <div
      className="absolute -top-px -right-px z-40 w-[280px] bg-[#111] border border-[#323232] shadow-xl p-3"
      onClick={(e) => e.stopPropagation()}
    >
      <div
        className="text-[12px] text-white/90 font-bold mb-6"
        style={{ fontFamily: "'ABeeZee', monospace" }}
      >
        导出 WAV
      </div>
      {body}
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
