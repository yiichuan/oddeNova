import { useMemo, useState } from 'react';
import { uploadShare } from '../services/share';
import { shareUrl } from '../services/share-target';
import { trackShare } from '../lib/analytics';
import { useIsMobile } from '../hooks/useIsMobile';
import { BookOpenIcon, DownloadIcon, GitBranchIcon, MenuIcon, SettingsIcon, ShareIcon, SparkleIcon } from './icons';
import type { Session } from '../hooks/useSessions';
import type { ChatMessage } from '../hooks/useChat';
import { zh, t } from '../lib/i18n';
const learnUrl = 'https://strudel.cc/workshop/getting-started/';
const githubUrl = 'https://github.com/yiichuan/oddeNova';

// ─── Share ───────────────────────────────────────────────────────────────────

type ShareState = 'idle' | 'loading' | 'done' | 'error';

interface ShareButtonProps {
  session: Session | null;
  code?: string;
  messages?: ChatMessage[];
  disabled?: boolean;
  variant?: 'inline' | 'menu';
  onShared?: () => void;
}

function ShareButton({ session, code, messages, disabled, variant = 'inline', onShared }: ShareButtonProps) {
  const [state, setState] = useState<ShareState>('idle');

  async function handleShare() {
    const shareCode = session?.code || code || '';
    if (!shareCode) return;
    setState('loading');
    try {
      const title = session?.title?.trim() || t('newSessionTitle');
      const shareId = await uploadShare({
        title,
        code: shareCode,
        messages: session?.messages ?? messages ?? [],
        locale: zh ? 'zh-CN' : 'en',
      });
      const url = `${window.location.origin}/s/${shareId}`;
      await shareUrl(url);
      trackShare();
      setState('done');
      onShared?.();
      setTimeout(() => setState('idle'), 2000);
    } catch (error) {
      console.error('[share] Failed to create or open share target', error);
      setState('error');
      setTimeout(() => setState('idle'), 3000);
    }
  }

  if (variant === 'menu') {
    const label = state === 'loading'
      ? t('sharing')
      : state === 'error'
        ? t('shareFailed')
        : t('share');

    return (
      <button
        type="button"
        onClick={handleShare}
        disabled={disabled || state === 'loading'}
        className="mobile-menu-item disabled:opacity-35 disabled:cursor-not-allowed"
      >
        <span>{label}</span>
        <ShareIcon size={19} />
      </button>
    );
  }

  return (
    <div className="relative">
      <button
        onClick={handleShare}
        disabled={disabled || state === 'loading'}
        className="h-7 flex items-center text-[14px] text-white/75 hover:text-white transition-colors disabled:opacity-40 disabled:cursor-not-allowed px-1.5"
      >
        {t('share')}
      </button>
      {state === 'done' && (
        <div className="absolute right-0 top-7 z-50">
          <span className="text-text-secondary text-xs whitespace-nowrap">
            {t('linkCopied')}
          </span>
        </div>
      )}
      {state === 'error' && (
        <div className="absolute right-0 top-7 z-50">
          <span className="text-red-400 text-xs whitespace-nowrap">
            {t('shareFailedRetry')}
          </span>
        </div>
      )}
    </div>
  );
}

// ─── Export popover ───────────────────────────────────────────────────────────

interface ExportParams {
  filename: string;
  beginCycle: number;
  endCycle: number;
  sampleRate: number;
}

export interface GenerateTitleParams {
  code: string;
  sessionTitle?: string;
  messages: ChatMessage[];
  locale: 'zh-CN' | 'en';
}

interface ExportPopoverProps {
  open: boolean;
  onClose: () => void;
  exportState: { status: 'idle' | 'exporting' | 'error'; progress: number; error?: string };
  onResetState: () => void;
  onExport: (p: ExportParams) => Promise<boolean>;
  code: string;
  sessionTitle?: string;
  messages: ChatMessage[];
  onGenerateTitle: (p: GenerateTitleParams) => Promise<string>;
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
  if (seconds < 60) return zh ? `${seconds.toFixed(1)} 秒` : `${seconds.toFixed(1)}s`;
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return zh ? `${m} 分 ${s} 秒` : `${m}m ${s}s`;
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
        <button type="button" onClick={() => step(1)} tabIndex={-1}
          className="flex-1 flex items-center justify-center px-1.5 text-white/50 hover:text-white/90 hover:bg-white/5 leading-none">
          <svg width="8" height="5" viewBox="0 0 8 5" fill="none"><path d="M4 0.5L7.5 4.5H0.5L4 0.5Z" fill="currentColor" /></svg>
        </button>
        <div className="h-px bg-[#323232]" />
        <button type="button" onClick={() => step(-1)} tabIndex={-1}
          className="flex-1 flex items-center justify-center px-1.5 text-white/50 hover:text-white/90 hover:bg-white/5 leading-none">
          <svg width="8" height="5" viewBox="0 0 8 5" fill="none"><path d="M4 4.5L0.5 0.5H7.5L4 4.5Z" fill="currentColor" /></svg>
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

type GenerateTitleState = 'idle' | 'loading' | 'error';

interface TitleFormState {
  filename: string;
  filenamePlaceholder: string;
  generateTitleState: GenerateTitleState;
  activeGenerateTitleRequest: symbol | null;
}

function ExportPopover({
  open,
  onClose,
  exportState,
  onResetState,
  onExport,
  code,
  sessionTitle,
  messages,
  onGenerateTitle,
  bpm,
}: ExportPopoverProps) {
  const isMobile = useIsMobile();
  const [titleForm, setTitleForm] = useState<TitleFormState>({
    filename: '',
    filenamePlaceholder: '',
    generateTitleState: 'idle',
    activeGenerateTitleRequest: null,
  });
  const [beginCycle, setBeginCycle] = useState(0);
  const [endCycle, setEndCycle] = useState(4);
  const [beginCycleStr, setBeginCycleStr] = useState('0');
  const [endCycleStr, setEndCycleStr] = useState('4');
  const [sampleRate, setSampleRate] = useState(48000);
  const [prevOpen, setPrevOpen] = useState(false);
  const { filename, filenamePlaceholder, generateTitleState } = titleForm;

  if (prevOpen !== open) {
    setPrevOpen(open);
    if (open) {
      setTitleForm({
        filename: '',
        filenamePlaceholder: defaultFilename(),
        generateTitleState: 'idle',
        activeGenerateTitleRequest: null,
      });
    } else {
      setTitleForm((current) => ({
        ...current,
        generateTitleState: 'idle',
        activeGenerateTitleRequest: null,
      }));
    }
  }

  const commitBegin = (str: string) => { const v = Math.max(0, parseInt(str, 10) || 0); setBeginCycle(v); setBeginCycleStr(String(v)); };
  const commitEnd   = (str: string) => { const v = Math.max(0, parseInt(str, 10) || 0); setEndCycle(v);   setEndCycleStr(String(v)); };

  const canExport = useMemo(() => endCycle > beginCycle, [endCycle, beginCycle]);
  const durationStr = useMemo(() => {
    if (!canExport || bpm <= 0) return null;
    return formatDuration((endCycle - beginCycle) * 240 / bpm);
  }, [canExport, beginCycle, endCycle, bpm]);

  if (!open) return null;

  const handleExport = async () => {
    if (!canExport) return;
    await onExport({ filename: filename.trim() || filenamePlaceholder, beginCycle, endCycle, sampleRate });
  };
  const handleGenerateTitle = async () => {
    const requestId = Symbol('generateTitleRequest');
    setTitleForm((current) => ({
      ...current,
      generateTitleState: 'loading',
      activeGenerateTitleRequest: requestId,
    }));
    try {
      const title = await onGenerateTitle({
        code,
        sessionTitle,
        messages,
        locale: zh ? 'zh-CN' : 'en',
      });
      setTitleForm((current) => {
        if (current.activeGenerateTitleRequest !== requestId) return current;
        return {
          ...current,
          filename: title,
          generateTitleState: 'idle',
          activeGenerateTitleRequest: null,
        };
      });
    } catch (error) {
      console.error('[export] Failed to generate song title', error);
      setTitleForm((current) => {
        if (current.activeGenerateTitleRequest !== requestId) return current;
        return {
          ...current,
          generateTitleState: 'error',
          activeGenerateTitleRequest: null,
        };
      });
    }
  };
  const handleFilenameChange = (value: string) => {
    setTitleForm((current) => ({
      ...current,
      filename: value,
      generateTitleState: 'idle',
      activeGenerateTitleRequest: null,
    }));
  };
  const handleCloseSafe = () => { if (exportState.status !== 'exporting') onClose(); };
  const handleErrorClose = () => { onResetState(); onClose(); };
  const generateTitleLabel = generateTitleState === 'loading'
    ? t('generatingSongTitle')
    : t('generateSongTitle');

  const body = (
    <div className="flex flex-col gap-3" style={{ fontFamily: "'ABeeZee', monospace" }}>
      {exportState.status === 'exporting' ? (
        <>
          <div className="text-[13px] text-white/70">{t('rendering')} {Math.round(exportState.progress * 100)}%</div>
          <div className="h-[3px] w-full bg-[#323232] overflow-hidden">
            <div className="h-full bg-white/70 transition-[width] duration-100 ease-linear" style={{ width: `${Math.round(exportState.progress * 100)}%` }} />
          </div>
          <div className="flex justify-end">
            <button onClick={onClose} className="px-3 py-1.5 text-[12px] text-white/70 hover:text-white/90 border border-[#323232]">{t('cancel')}</button>
          </div>
        </>
      ) : exportState.status === 'error' ? (
        <>
          <div className="text-[12px] text-red-400 break-words">{exportState.error || t('exportFailed')}</div>
          <div className="flex justify-end">
            <button onClick={handleErrorClose} className="px-3 py-1.5 text-[12px] text-white/70 hover:text-white/90 border border-[#323232]">{t('close')}</button>
          </div>
        </>
      ) : (
        <>
          <Field label={t('filename')}>
            <div className="flex w-full gap-1.5">
              <input type="text" value={filename} onChange={(e) => handleFilenameChange(e.target.value)} placeholder={filenamePlaceholder}
                className="flex-1 min-w-0 bg-black border border-[#323232] px-2 py-1.5 text-[12px] text-white/90 outline-none focus:border-white/30 placeholder:text-white/30"
                style={{ fontFamily: "'ABeeZee', monospace" }} />
              <button
                type="button"
                onClick={handleGenerateTitle}
                disabled={generateTitleState === 'loading'}
                aria-label={generateTitleLabel}
                title={generateTitleLabel}
                className={`w-8 h-8 shrink-0 flex items-center justify-center bg-black border border-[#323232] text-white/70 hover:text-white hover:border-white/30 disabled:opacity-45 disabled:cursor-not-allowed ${generateTitleState === 'loading' ? 'animate-pulse' : ''}`}
              >
                <SparkleIcon size={16} />
              </button>
            </div>
            {generateTitleState === 'error' && (
              <span className="text-[11px] text-red-400">{t('generateSongTitleFailed')}</span>
            )}
          </Field>
          <div className="flex gap-2">
            <Field label={t('startCycle')}><CycleInput value={beginCycleStr} onChange={setBeginCycleStr} onCommit={commitBegin} /></Field>
            <Field label={t('endCycle')}><CycleInput value={endCycleStr}   onChange={setEndCycleStr}   onCommit={commitEnd} /></Field>
          </div>
          {durationStr && (
            <div className="flex items-center justify-between text-[12px]">
              <span className="text-white/50">{t('estDuration')}</span>
              <span className="text-white/80" style={{ fontFamily: "'ABeeZee', monospace" }}>{durationStr}</span>
            </div>
          )}
          {!canExport && <div className="text-[12px] text-red-400">{t('cycleError')}</div>}
          <Field label={t('sampleRate')}>
            <select value={sampleRate} onChange={(e) => setSampleRate(Number(e.target.value))}
              className="w-full bg-black border border-[#323232] px-2 py-1.5 text-[12px] text-white/90 outline-none focus:border-white/30"
              style={{ fontFamily: "'ABeeZee', monospace" }}>
              <option value={44100}>44100 Hz</option>
              <option value={48000}>48000 Hz</option>
            </select>
          </Field>
          <div className="flex justify-end gap-2 pt-1">
            <button onClick={onClose} className="px-3 py-1.5 text-[12px] text-white/70 hover:text-white/90 border border-[#323232]">{t('cancel')}</button>
            <button onClick={handleExport} disabled={!canExport} className="px-3 py-1.5 text-[12px] text-white border border-white/30 hover:bg-white/10 disabled:opacity-40 disabled:cursor-not-allowed">{t('export')}</button>
          </div>
        </>
      )}
    </div>
  );

  if (isMobile) {
    return (
      <div className="fixed inset-0 z-50" onClick={handleCloseSafe}>
        <div className="absolute inset-0 bg-black/50" />
        <div className="absolute bottom-0 left-0 right-0 bg-[#111] border-t border-[#323232] px-6 py-6" onClick={(e) => e.stopPropagation()}>
          <div className="text-[14px] text-white/90 font-bold mb-4" style={{ fontFamily: "'ABeeZee', monospace" }}>{t('exportWav')}</div>
          {body}
        </div>
      </div>
    );
  }

  return (
    <>
      <div className="fixed inset-0 z-40" onClick={handleCloseSafe} />
      <div className="absolute top-full right-0 z-50 w-[280px] bg-[#111] border border-[#323232] shadow-xl p-3" onClick={(e) => e.stopPropagation()}>
        <div className="text-[12px] text-white/90 font-bold mb-6" style={{ fontFamily: "'ABeeZee', monospace" }}>{t('exportWav')}</div>
        {body}
      </div>
    </>
  );
}

// ─── TopActionBar (default export) ───────────────────────────────────────────

interface TopActionBarProps {
  onOpenSettings: () => void;
  session: Session | null;
  code: string;
  messages: ChatMessage[];
  engineReady: boolean;
  hasCode: boolean;
  exportState: { status: 'idle' | 'exporting' | 'error'; progress: number; error?: string };
  onExport: (p: ExportParams) => Promise<boolean>;
  onGenerateTitle: (p: GenerateTitleParams) => Promise<string>;
  onResetExportState: () => void;
  bpm: number;
}

export default function TopActionBar({
  onOpenSettings,
  session,
  code,
  messages,
  engineReady,
  hasCode,
  exportState,
  onExport,
  onGenerateTitle,
  onResetExportState,
  bpm,
}: TopActionBarProps) {
  const [exportOpen, setExportOpen] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const isMobile = useIsMobile();
  const actionDisabled = !engineReady || !hasCode;
  const shareDisabled = actionDisabled || !session || exportState.status === 'exporting';
  const exportDisabled = actionDisabled || exportState.status === 'exporting';

  const handleExport = async (params: ExportParams) => {
    const ok = await onExport(params);
    if (ok) {
      setTimeout(() => {
        setExportOpen(false);
        onResetExportState();
      }, 800);
    }
    return ok;
  };

  if (isMobile) {
    return (
      <div className="h-full relative flex items-center justify-end">
        <button
          type="button"
          onClick={() => setMenuOpen((v) => !v)}
          className="w-8 h-8 flex items-center justify-center text-text-secondary hover:text-text-primary transition-colors"
          aria-label={t('openMenu')}
          aria-expanded={menuOpen}
          aria-haspopup="menu"
          title={t('menu')}
        >
          <MenuIcon size={20} />
        </button>

        {menuOpen && (
          <>
            <div className="fixed inset-0 z-30 bg-black/35 backdrop-blur-[6px]" onClick={() => setMenuOpen(false)} />
            <div
              role="menu"
              className="fixed right-3 z-40 w-[min(244px,calc(100vw-24px))] rounded-[18px] border border-[#323232] bg-[#0d0d0d]/95 p-2 text-text-primary shadow-[0_18px_50px_rgba(0,0,0,0.55)] backdrop-blur-xl"
              style={{ top: 'calc(max(12px, env(safe-area-inset-top)) + 44px)' }}
              onClick={(e) => e.stopPropagation()}
            >
              <button
                type="button"
                role="menuitem"
                onClick={() => { setMenuOpen(false); onOpenSettings(); }}
                className="mobile-menu-item"
              >
                <span>{t('settings')}</span>
                <SettingsIcon size={19} />
              </button>
              <ShareButton
                session={session}
                code={code}
                messages={messages}
                disabled={shareDisabled}
                variant="menu"
                onShared={() => setMenuOpen(false)}
              />
              <button
                type="button"
                role="menuitem"
                onClick={() => { setMenuOpen(false); setExportOpen(true); }}
                disabled={exportDisabled}
                className="mobile-menu-item disabled:opacity-35 disabled:cursor-not-allowed"
              >
                <span>{t('export')}</span>
                <DownloadIcon size={19} />
              </button>
              <div className="my-2 h-px bg-white/10" />
              <a
                role="menuitem"
                href={learnUrl}
                target="_blank"
                rel="noopener noreferrer"
                onClick={() => setMenuOpen(false)}
                className="mobile-menu-item"
              >
                <span>{t('learn')}</span>
                <BookOpenIcon size={19} />
              </a>
              <a
                role="menuitem"
                href={githubUrl}
                target="_blank"
                rel="noopener noreferrer"
                onClick={() => setMenuOpen(false)}
                className="mobile-menu-item"
              >
                <span>GitHub</span>
                <GitBranchIcon size={19} />
              </a>
            </div>
          </>
        )}

        <ExportPopover
          open={exportOpen}
          onClose={() => setExportOpen(false)}
          exportState={exportState}
          onResetState={onResetExportState}
          onExport={handleExport}
          code={code}
          sessionTitle={session?.title}
          messages={messages}
          onGenerateTitle={onGenerateTitle}
          bpm={bpm}
        />
      </div>
    );
  }

  return (
    <div className="h-full relative flex items-center justify-end gap-3">
      {/* Settings */}
      <button
        onClick={onOpenSettings}
        className="h-7 flex items-center text-[14px] text-white/75 hover:text-white transition-colors px-1.5"
      >
        {t('settings')}
      </button>

      {/* Share */}
      <ShareButton
        session={session}
        code={code}
        messages={messages}
        disabled={shareDisabled}
      />

      {/* Export */}
      <button
        onClick={() => setExportOpen((v) => !v)}
        disabled={exportDisabled}
        className="h-7 flex items-center text-[14px] text-white/75 hover:text-white transition-colors disabled:opacity-40 disabled:cursor-not-allowed px-1.5"
      >
        {t('export')}
      </button>

      {/* Learn */}
      <a
        href={learnUrl}
        target="_blank"
        rel="noopener noreferrer"
        className="h-7 flex items-center text-[14px] text-white/75 hover:text-white transition-colors px-1.5"
      >
        {t('learn')}
      </a>

      {/* GitHub */}
      <a
        href={githubUrl}
        target="_blank"
        rel="noopener noreferrer"
        className="h-7 flex items-center text-[14px] text-white/75 hover:text-white transition-colors px-1.5"
      >
        GitHub
      </a>

      <ExportPopover
        open={exportOpen}
        onClose={() => setExportOpen(false)}
        exportState={exportState}
        onResetState={onResetExportState}
        onExport={handleExport}
        code={code}
        sessionTitle={session?.title}
        messages={messages}
        onGenerateTitle={onGenerateTitle}
        bpm={bpm}
      />
    </div>
  );
}
