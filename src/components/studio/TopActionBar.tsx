import { useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import { uploadShare } from '../../services/share';
import { shareUrl } from '../../services/share-target';
import { trackShareCompleted, type ShareMethod } from '../../lib/analytics';
import { useIsMobile } from '../../hooks/useIsMobile';
import { BookOpenIcon, DownloadIcon, GitBranchIcon, MenuIcon, SettingsIcon, ShareIcon, SparkleIcon } from '../icons';
import type { Session } from '../../hooks/useSessions';
import type { ChatMessage } from '../../hooks/useChat';
import { zh, t } from '../../lib/i18n';
import { GITHUB_URL as githubUrl, LEARN_URL as learnUrl } from '../../lib/external-links';
import { useExportPopoverController, type ExportParams } from '../../hooks/useExportPopoverController';
import ControlHoverLabel from './ControlHoverLabel';
import type { ControlHoverLabelAnchor } from './control-hover-anchor';

export type { ExportParams } from '../../hooks/useExportPopoverController';

// ─── Share ───────────────────────────────────────────────────────────────────

type ShareState = 'idle' | 'loading' | 'copied' | 'shared' | 'error';

export interface ShareButtonProps {
  session: Session | null;
  code?: string;
  messages?: ChatMessage[];
  /** Title for a share that has no session behind it yet — see `code`. */
  title?: string;
  /** Icon variant only: the button's classes, and the box it sits in, when the
   *  bar it belongs to styles or sizes its controls differently from the
   *  studio's. The box is what the hover label is anchored to. */
  buttonClassName?: string;
  wrapperClassName?: string;
  disabled?: boolean;
  variant?: 'inline' | 'menu' | 'icon';
  onShared?: () => void;
}

export function ShareButton({
  session,
  code,
  messages,
  title,
  buttonClassName,
  wrapperClassName,
  disabled,
  variant = 'inline',
  onShared,
}: ShareButtonProps) {
  const [state, setState] = useState<ShareState>('idle');
  const [feedbackAnchor, setFeedbackAnchor] = useState<ControlHoverLabelAnchor | null>(null);
  const [hoverAnchor, setHoverAnchor] = useState<ControlHoverLabelAnchor | null>(null);

  async function handleShare() {
    const shareCode = session?.code || code || '';
    const shareMessages = session?.messages ?? messages ?? [];
    if (!shareCode && shareMessages.length === 0) return;
    setState('loading');
    try {
      const shareTitle = session?.title?.trim() || title?.trim() || t('newSessionTitle');
      const shareId = await uploadShare({
        title: shareTitle,
        code: shareCode,
        messages: shareMessages,
        revisions: session?.revisions,
        locale: zh ? 'zh-CN' : 'en',
      });
      const url = `${window.location.origin}/s/${shareId}`;
      const sharedTitle = shareTitle !== t('newSessionTitle')
        ? shareTitle
        : t('sharedMusicCreation');
      const brandedTitle = zh
        ? `【oddeNova】${sharedTitle}`
        : `[oddeNova] ${sharedTitle}`;
      const shareResult = await shareUrl(url, brandedTitle);
      if (shareResult === 'cancelled') {
        setState('idle');
        return;
      }
      const shareMethod: ShareMethod = shareResult === 'shared'
        ? 'native'
        : shareResult === 'shown'
          ? 'prompt'
          : 'clipboard';
      trackShareCompleted({ share_method: shareMethod });
      setState(shareResult === 'shared' ? 'shared' : 'copied');
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

  if (variant === 'icon') {
    const feedback = state === 'copied' || state === 'shared'
      ? {
          label: state === 'shared' ? t('shared') : t('shareDetailsCopied'),
          className: 'text-text-secondary',
        }
      : state === 'error'
        ? { label: t('shareFailedRetry'), className: 'text-red-400' }
        : null;
    return (
      <div
        className={wrapperClassName ?? 'relative flex h-8 w-8 items-center justify-center'}
        onMouseEnter={(event) => {
          if (state !== 'idle') return;
          const rect = event.currentTarget.getBoundingClientRect();
          setHoverAnchor({
            left: rect.left + rect.width / 2,
            bottom: window.innerHeight - rect.top + 8,
          });
        }}
        onMouseLeave={() => setHoverAnchor(null)}
        onFocusCapture={(event) => {
          if (state !== 'idle') return;
          const rect = event.currentTarget.getBoundingClientRect();
          setHoverAnchor({
            left: rect.left + rect.width / 2,
            bottom: window.innerHeight - rect.top + 8,
          });
        }}
        onBlurCapture={() => setHoverAnchor(null)}
      >
        <button
          type="button"
          onClick={(event) => {
            const rect = event.currentTarget.getBoundingClientRect();
            setHoverAnchor(null);
            setFeedbackAnchor({
              left: rect.left + rect.width / 2,
              bottom: window.innerHeight - rect.top + 8,
            });
            void handleShare();
          }}
          disabled={disabled || state === 'loading'}
          className={buttonClassName ?? 'flex h-8 w-8 cursor-pointer items-center justify-center text-icon-idle transition-colors hover:text-text-primary disabled:cursor-not-allowed disabled:text-text-muted disabled:opacity-100'}
          aria-label={t('share')}
        >
          <ShareIcon size={18} />
        </button>
        <ControlHoverLabel
          anchor={feedback ? feedbackAnchor : state === 'idle' ? hoverAnchor : null}
          label={feedback?.label ?? t('share')}
          testId={feedback ? 'code-panel-share-feedback-label' : 'code-panel-share-hover-label'}
          className={feedback?.className}
        />
      </div>
    );
  }

  return (
    <div className="relative">
      <button
        onClick={handleShare}
        disabled={disabled || state === 'loading'}
        className="h-7 flex items-center text-[14px] text-text-secondary hover:text-text-primary transition-colors disabled:opacity-40 disabled:cursor-not-allowed px-1.5"
      >
        {t('share')}
      </button>
      {(state === 'copied' || state === 'shared') && (
        <div className="absolute right-0 top-7 z-50">
          <span className="text-text-secondary text-xs whitespace-nowrap">
            {state === 'shared' ? t('shared') : t('shareDetailsCopied')}
          </span>
        </div>
      )}
      {state === 'error' && (
        <div className="absolute right-0 top-7 z-50">
          <span className="text-error text-xs whitespace-nowrap">
            {t('shareFailedRetry')}
          </span>
        </div>
      )}
    </div>
  );
}

// ─── Export popover ───────────────────────────────────────────────────────────

export interface GenerateTitleParams {
  code: string;
  sessionTitle?: string;
  messages: ChatMessage[];
  locale: 'zh-CN' | 'en';
}

export interface ExportPopoverProps {
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
  placement?: 'above' | 'below';
  anchorPosition?: { right: number; top?: number; bottom?: number };
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
    <div className="flex w-full overflow-hidden rounded-[6px] border border-border bg-auth-field focus-within:border-accent">
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
        className="flex-1 min-w-0 bg-transparent px-2 py-1.5 text-[12px] text-text-primary outline-none"
        style={{ fontFamily: "'ABeeZee', monospace" }}
      />
      <div className="flex flex-col border-l border-border">
        <button type="button" onClick={() => step(1)} tabIndex={-1}
          className="flex-1 flex items-center justify-center px-1.5 text-text-muted hover:text-text-primary hover:bg-surface-hover leading-none">
          <svg width="8" height="5" viewBox="0 0 8 5" fill="none"><path d="M4 0.5L7.5 4.5H0.5L4 0.5Z" fill="currentColor" /></svg>
        </button>
        <div className="h-px bg-border" />
        <button type="button" onClick={() => step(-1)} tabIndex={-1}
          className="flex-1 flex items-center justify-center px-1.5 text-text-muted hover:text-text-primary hover:bg-surface-hover leading-none">
          <svg width="8" height="5" viewBox="0 0 8 5" fill="none"><path d="M4 4.5L0.5 0.5H7.5L4 4.5Z" fill="currentColor" /></svg>
        </button>
      </div>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="flex flex-col gap-1 flex-1 min-w-0">
      <span className="text-[11px] text-text-muted">{label}</span>
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

export function ExportPopover({
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
  placement = 'below',
  anchorPosition,
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
  const [sampleRateOpen, setSampleRateOpen] = useState(false);
  const [prevOpen, setPrevOpen] = useState(false);
  const { filename, filenamePlaceholder, generateTitleState } = titleForm;

  if (prevOpen !== open) {
    setPrevOpen(open);
    if (open) {
      setSampleRateOpen(false);
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
          <div className="text-[13px] text-text-secondary">{t('rendering')} {Math.round(exportState.progress * 100)}%</div>
          <div className="h-[3px] w-full overflow-hidden rounded-[6px] bg-border">
            <div className="h-full bg-playback-accent transition-[width] duration-100 ease-linear" style={{ width: `${Math.round(exportState.progress * 100)}%` }} />
          </div>
          <div className="flex justify-end">
            <button onClick={onClose} className="rounded-[6px] border border-border px-3 py-1.5 text-[12px] text-text-secondary hover:text-text-primary">{t('cancel')}</button>
          </div>
        </>
      ) : exportState.status === 'error' ? (
        <>
          <div className="text-[12px] text-error break-words">{exportState.error || t('exportFailed')}</div>
          <div className="flex justify-end">
            <button onClick={handleErrorClose} className="rounded-[6px] border border-border px-3 py-1.5 text-[12px] text-text-secondary hover:text-text-primary">{t('close')}</button>
          </div>
        </>
      ) : (
        <>
          <Field label={t('filename')}>
            <div className="relative w-full">
              <input type="text" value={filename} onChange={(e) => handleFilenameChange(e.target.value)} placeholder={filenamePlaceholder}
                className="w-full rounded-[6px] border border-border bg-auth-field px-2 py-1.5 pr-9 text-[12px] text-text-primary outline-none placeholder:text-text-muted focus:border-accent"
                style={{ fontFamily: "'ABeeZee', monospace" }} />
              <button
                type="button"
                onClick={handleGenerateTitle}
                disabled={generateTitleState === 'loading'}
                aria-label={generateTitleLabel}
                title={generateTitleLabel}
                className={`absolute right-1 top-1/2 -translate-y-1/2 w-7 h-7 flex items-center justify-center text-text-secondary hover:text-text-primary disabled:opacity-45 disabled:cursor-not-allowed ${generateTitleState === 'loading' ? 'animate-pulse' : ''}`}
              >
                <SparkleIcon size={16} />
              </button>
            </div>
            {generateTitleState === 'error' && (
              <span className="text-[11px] text-error">{t('generateSongTitleFailed')}</span>
            )}
          </Field>
          <div className="flex gap-2">
            <Field label={t('startCycle')}><CycleInput value={beginCycleStr} onChange={setBeginCycleStr} onCommit={commitBegin} /></Field>
            <Field label={t('endCycle')}><CycleInput value={endCycleStr}   onChange={setEndCycleStr}   onCommit={commitEnd} /></Field>
          </div>
          {durationStr && (
            <div className="flex items-center justify-between text-[12px]">
              <span className="text-text-muted">{t('estDuration')}</span>
              <span className="pr-[2px] text-text-primary" style={{ fontFamily: "'ABeeZee', monospace" }}>{durationStr}</span>
            </div>
          )}
          {!canExport && <div className="text-[12px] text-error">{t('cycleError')}</div>}
          <Field label={t('sampleRate')}>
            <div
              className="relative"
              onBlur={(event) => {
                if (!event.currentTarget.contains(event.relatedTarget)) setSampleRateOpen(false);
              }}
            >
              <button
                type="button"
                aria-haspopup="listbox"
                aria-expanded={sampleRateOpen}
                onClick={() => setSampleRateOpen((current) => !current)}
                onKeyDown={(event) => {
                  if (event.key === 'Escape') setSampleRateOpen(false);
                }}
                className="flex w-full items-center justify-between rounded-[6px] border border-border bg-auth-field py-1.5 pl-2 pr-2 text-left text-[12px] text-text-primary outline-none focus:border-accent"
                style={{ fontFamily: "'ABeeZee', monospace" }}
              >
                <span>{sampleRate} Hz</span>
                <svg className={`transition-transform ${sampleRateOpen ? 'rotate-180' : ''}`} width="8" height="5" viewBox="0 0 8 5" fill="none" aria-hidden="true">
                  <path d="M0.5 0.5L4 4.5L7.5 0.5" stroke="currentColor" />
                </svg>
              </button>
              {sampleRateOpen && (
                <div
                  role="listbox"
                  aria-label={t('sampleRate')}
                  className="absolute left-0 right-0 top-[calc(100%+4px)] z-10 overflow-hidden rounded-[6px] border border-border bg-popover-surface p-1 shadow-menu-overlay"
                >
                  {[44100, 48000].map((rate) => (
                    <button
                      key={rate}
                      type="button"
                      role="option"
                      aria-selected={sampleRate === rate}
                      onClick={() => {
                        setSampleRate(rate);
                        setSampleRateOpen(false);
                      }}
                      className={`w-full rounded-[4px] px-2 py-1.5 text-left text-[12px] transition-colors ${sampleRate === rate ? 'bg-selected-item-bg text-on-accent' : 'text-text-secondary hover:bg-surface-hover hover:text-text-primary'}`}
                      style={{ fontFamily: "'ABeeZee', monospace" }}
                    >
                      {rate} Hz
                    </button>
                  ))}
                </div>
              )}
            </div>
          </Field>
          <div className="flex justify-end gap-2 pt-1">
            <button onClick={onClose} className="rounded-[6px] border border-border px-3 py-1.5 text-[12px] text-text-secondary hover:text-text-primary">{t('cancel')}</button>
            <button onClick={handleExport} disabled={!canExport} className="rounded-[6px] bg-accent px-3 py-1.5 text-[12px] text-on-accent hover:bg-accent-light disabled:cursor-not-allowed disabled:opacity-40">{t('download')}</button>
          </div>
        </>
      )}
    </div>
  );

  if (isMobile) {
    return (
      <div className="fixed inset-0 z-50" onClick={handleCloseSafe}>
        <div className="absolute inset-0 bg-[var(--color-overlay-backdrop)]" />
        <div className="absolute bottom-0 left-0 right-0 rounded-t-[6px] border-t border-border bg-popover-surface px-6 py-6" onClick={(e) => e.stopPropagation()}>
          <div className="text-[14px] text-text-primary font-bold mb-4" style={{ fontFamily: "'ABeeZee', monospace" }}>{t('exportWav')}</div>
          {body}
        </div>
      </div>
    );
  }

  const desktopPopover = (
    <>
      <div className="fixed inset-0 z-40" onClick={handleCloseSafe} />
      <div
        data-testid="export-popover"
        className={`right-0 z-50 w-[280px] rounded-[6px] border border-border bg-popover-surface p-3 shadow-menu-overlay ${anchorPosition ? 'fixed' : 'absolute'} ${!anchorPosition && (placement === 'above' ? 'bottom-[calc(100%+8px)]' : 'top-full')}`}
        style={anchorPosition}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="text-[12px] text-text-primary font-bold mb-6" style={{ fontFamily: "'ABeeZee', monospace" }}>{t('exportWav')}</div>
        {body}
      </div>
    </>
  );

  if (anchorPosition && typeof document !== 'undefined') {
    return createPortal(desktopPopover, document.body);
  }

  return desktopPopover;
}

// ─── TopActionBar (default export) ───────────────────────────────────────────

interface TopActionBarProps {
  onOpenSettings: () => void;
  onOpenAccount: () => void;
  accountLabel: string;
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
  onOpenAccount,
  accountLabel,
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
  const { exportOpen, setExportOpen, handleExport } = useExportPopoverController(onExport, onResetExportState);
  const [menuOpen, setMenuOpen] = useState(false);
  const isMobile = useIsMobile();
  const actionDisabled = !engineReady || !hasCode;
  const shareCode = session?.code || code || '';
  const shareMessages = session?.messages ?? messages ?? [];
  const canShare = !!session && (shareCode.trim().length > 0 || shareMessages.length > 0);
  const shareDisabled = !canShare || exportState.status === 'exporting';
  const exportDisabled = actionDisabled || exportState.status === 'exporting';

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
            <div className="fixed inset-0 z-30 bg-[var(--color-overlay-backdrop)] backdrop-blur-[6px]" onClick={() => setMenuOpen(false)} />
            <div
              role="menu"
              className="fixed right-3 z-40 w-[min(244px,calc(100vw-24px))] rounded-[18px] border border-border bg-popover-surface/95 p-2 text-text-primary shadow-menu-overlay backdrop-blur-xl"
              style={{ top: 'calc(max(12px, env(safe-area-inset-top)) + 44px)' }}
              onClick={(e) => e.stopPropagation()}
            >
              <button
                type="button"
                role="menuitem"
                onClick={() => { setMenuOpen(false); onOpenAccount(); }}
                className="mobile-menu-item"
              >
                <span>{accountLabel}</span>
                <SettingsIcon size={19} />
              </button>
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
              <div className="my-2 h-px bg-border" />
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
      {/* Account */}
      <button
        onClick={onOpenAccount}
        className="h-7 flex items-center text-[14px] text-text-secondary hover:text-text-primary transition-colors px-1.5 max-w-[180px]"
        title={accountLabel}
      >
        <span className="truncate">{accountLabel}</span>
      </button>

      {/* Settings */}
      <button
        onClick={onOpenSettings}
        className="h-7 flex items-center text-[14px] text-text-secondary hover:text-text-primary transition-colors px-1.5"
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
        className="h-7 flex items-center text-[14px] text-text-secondary hover:text-text-primary transition-colors disabled:opacity-40 disabled:cursor-not-allowed px-1.5"
      >
        {t('export')}
      </button>

      {/* Learn */}
      <a
        href={learnUrl}
        target="_blank"
        rel="noopener noreferrer"
        className="h-7 flex items-center text-[14px] text-text-secondary hover:text-text-primary transition-colors px-1.5"
      >
        {t('learn')}
      </a>

      {/* GitHub */}
      <a
        href={githubUrl}
        target="_blank"
        rel="noopener noreferrer"
        className="h-7 flex items-center text-[14px] text-text-secondary hover:text-text-primary transition-colors px-1.5"
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
