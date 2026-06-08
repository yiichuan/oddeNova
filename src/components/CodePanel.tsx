import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { PlayIcon, StopIcon } from './icons';
import { t } from '../lib/i18n';
import { strudelService } from '../services/strudel';
import { parseScore } from '../agent/parser';
import { useIsMobile } from '../hooks/useIsMobile';
import TopActionBar from './TopActionBar';
import type { Session } from '../hooks/useSessions';
import type { ChatMessage } from '../hooks/useChat';

interface CodePanelProps {
  error: string | null;
  isPlaying: boolean;
  engineReady: boolean;
  hasCode: boolean;
  onMount: (el: HTMLDivElement) => void;
  onPlay: () => void;
  onStop: () => void;
  exportState: { status: 'idle' | 'exporting' | 'error'; progress: number; error?: string };
  onExport: (p: { filename: string; beginCycle: number; endCycle: number; sampleRate: number }) => Promise<boolean>;
  onResetExportState: () => void;
  session: Session | null;
  messages: ChatMessage[];
  topActionsContainer?: React.RefObject<HTMLDivElement | null>;
  onOpenSettings: () => void;
  onEditorFocusChange?: (focused: boolean) => void;
}

// Log scale: slider 0–1 → frequency 200Hz–20kHz
const lpfSliderToHz = (v: number) => 200 * Math.pow(100, v);
const formatLpf = (v: number) => {
  const hz = lpfSliderToHz(v);
  if (hz >= 10000) return `${Math.round(hz / 1000)}k`;
  if (hz >= 1000) return `${(hz / 1000).toFixed(1)}k`;
  return `${Math.round(hz)}`;
};

type Tooltip = { key: string; label: string; pct: number };

interface SliderColumnProps {
  label: string;
  sliderKey: string;
  value: number;
  min: number;
  max: number;
  step: number;
  tooltip: Tooltip | null;
  formatValue: (v: number) => string;
  onChange: (v: number) => void;
  onTooltip: (t: Tooltip | null) => void;
  borderRight?: boolean;
}

function SliderColumn({
  label,
  sliderKey,
  value,
  min,
  max,
  step,
  tooltip,
  formatValue,
  onChange,
  onTooltip,
  borderRight = false,
}: SliderColumnProps) {
  const pct = (value - min) / (max - min);
  const active = tooltip?.key === sliderKey;

  return (
    <div
      className="flex-1 min-w-0 flex items-center px-[30px] gap-[30px]"
      style={borderRight ? { borderRight: '1px solid #323232' } : undefined}
    >
      <span className="text-[14px] text-white/70 shrink-0 select-none">{label}</span>

      {/* Slider wrapper — relative so tooltip is anchored here */}
      <div className="relative flex-1 min-w-0 flex items-center">
        {active && tooltip && (
          <div
            className="absolute z-50 text-[10px] text-white/90 bg-black border border-white/10 rounded px-1.5 py-[2px] pointer-events-none whitespace-nowrap"
            style={{
              bottom: 'calc(100% + 10px)',
              left: `${tooltip.pct * 100}%`,
              transform: 'translateX(-50%)',
            }}
          >
            {tooltip.label}
          </div>
        )}

        <input
          type="range"
          min={min}
          max={max}
          step={step}
          value={value}
          onPointerDown={() => {
            onTooltip({ key: sliderKey, label: formatValue(value), pct });
          }}
          onChange={(e) => {
            const v = Number(e.target.value);
            const newPct = (v - min) / (max - min);
            onTooltip({ key: sliderKey, label: formatValue(v), pct: newPct });
            onChange(v);
          }}
          className="aj-slider flex-1 min-w-0"
          style={{ height: '20px', ['--fill-pct' as string]: `${pct * 100}%` }}
        />
      </div>
    </div>
  );
}

interface MobileSliderButtonProps {
  label: string;
  displayValue: string;
  borderRight?: boolean;
  onClick: () => void;
}

function MobileSliderButton({ label, displayValue, borderRight, onClick }: MobileSliderButtonProps) {
  return (
    <button
      className="flex-1 min-w-0 flex flex-col items-center justify-center py-[10px] gap-[2px]"
      style={borderRight ? { borderRight: '1px solid #323232' } : undefined}
      onClick={onClick}
    >
      <span className="text-[11px] text-white/50 select-none">{label}</span>
      <span className="text-[14px] text-white/90 select-none">{displayValue}</span>
    </button>
  );
}

interface MobileSliderConfig {
  label: string;
  value: number;
  min: number;
  max: number;
  step: number;
  formatValue: (v: number) => string;
  onChange: (v: number) => void;
}

interface MobileSliderSheetProps {
  activeSlider: 'volume' | 'bpm' | 'lpf' | null;
  configs: Record<'volume' | 'bpm' | 'lpf', MobileSliderConfig>;
  onClose: () => void;
}

function MobileSliderSheet({ activeSlider, configs, onClose }: MobileSliderSheetProps) {
  if (activeSlider === null) return null;
  const config = configs[activeSlider];
  const pct = (config.value - config.min) / (config.max - config.min);

  return (
    <div className="fixed inset-0 z-50" onClick={onClose}>
      <div className="absolute inset-0 bg-black/50" />
      <div
        className="absolute bottom-0 left-0 right-0 bg-[#111] border-t border-[#323232] px-6 py-6"
        style={{ fontFamily: "'ABeeZee', monospace" }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex justify-between items-baseline mb-4">
          <span className="text-[14px] text-white/60">{config.label}</span>
          <span className="text-[24px] text-white font-light">{config.formatValue(config.value)}</span>
        </div>
        <input
          type="range"
          min={config.min}
          max={config.max}
          step={config.step}
          value={config.value}
          onChange={(e) => config.onChange(Number(e.target.value))}
          className="aj-slider w-full"
          style={{ height: '24px', ['--fill-pct' as string]: `${pct * 100}%` }}
        />
      </div>
    </div>
  );
}

export default function CodePanel({
  error,
  isPlaying,
  engineReady,
  hasCode,
  onMount,
  onPlay,
  onStop,
  exportState,
  onExport,
  onResetExportState,
  session,
  messages,
  topActionsContainer,
  onOpenSettings,
  onEditorFocusChange,
}: CodePanelProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [gutterWidth, setGutterWidth] = useState(0);

  const [volume, setVolume] = useState(0.8);
  const [bpm, setBpm] = useState(() => parseScore(strudelService.code).bpm ?? 120);
  const [lpf, setLpf] = useState(1);
  const [tooltip, setTooltip] = useState<Tooltip | null>(null);
  // true while the slider itself is updating the code, so the state subscription skips it
  const bpmFromSlider = useRef(false);

  const isMobile = useIsMobile();
  const [activeSlider, setActiveSlider] = useState<'volume' | 'bpm' | 'lpf' | null>(null);

  const handleExport = async (params: { filename: string; beginCycle: number; endCycle: number; sampleRate: number }) => {
    const ok = await onExport(params);
    // exportWav resets master volume/LPF — re-apply current UI values.
    await strudelService.setMasterVolume(volume);
    await strudelService.setMasterLPF(lpfSliderToHz(lpf));
    return ok;
  };

  const sliderConfigs: Record<'volume' | 'bpm' | 'lpf', MobileSliderConfig> = {
    volume: {
      label: 'Volume',
      value: volume,
      min: 0, max: 1, step: 0.01,
      formatValue: (v) => `${Math.round(v * 100)}%`,
      onChange: (v) => { setVolume(v); void strudelService.setMasterVolume(v); },
    },
    bpm: {
      label: 'BPM',
      value: bpm,
      min: 60, max: 240, step: 1,
      formatValue: (v) => `${v}`,
      onChange: (v) => { setBpm(v); bpmFromSlider.current = true; strudelService.setTempo(v); bpmFromSlider.current = false; },
    },
    lpf: {
      label: 'LPF',
      value: lpf,
      min: 0, max: 1, step: 0.005,
      formatValue: formatLpf,
      onChange: (v) => { setLpf(v); void strudelService.setMasterLPF(lpfSliderToHz(v)); },
    },
  };

  useEffect(() => {
    if (containerRef.current) {
      onMount(containerRef.current);
    }
  // onMount is stable (useCallback), so this fires only once on mount
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const container = containerRef.current;
    if (!container || !onEditorFocusChange) return;

    let focusOutTimer: number | null = null;

    const clearFocusOutTimer = () => {
      if (focusOutTimer === null) return;
      window.clearTimeout(focusOutTimer);
      focusOutTimer = null;
    };

    const handleFocusIn = () => {
      clearFocusOutTimer();
      onEditorFocusChange(true);
    };

    const handleFocusOut = (event: FocusEvent) => {
      clearFocusOutTimer();
      const nextTarget = event.relatedTarget;
      if (nextTarget instanceof Node && container.contains(nextTarget)) return;

      focusOutTimer = window.setTimeout(() => {
        focusOutTimer = null;
        const activeElement = document.activeElement;
        if (activeElement instanceof Node && container.contains(activeElement)) return;
        onEditorFocusChange(false);
      }, 0);
    };

    container.addEventListener('focusin', handleFocusIn);
    container.addEventListener('focusout', handleFocusOut);

    return () => {
      clearFocusOutTimer();
      container.removeEventListener('focusin', handleFocusIn);
      container.removeEventListener('focusout', handleFocusOut);
    };
  }, [onEditorFocusChange]);

  // Track .cm-gutters width so the footer divider aligns with the editor's gutter border.
  // Keep MutationObserver alive so reinit (which clears + remounts the editor) is handled.
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    let ro: ResizeObserver | null = null;

    const attachRo = (gutters: HTMLElement) => {
      ro?.disconnect();
      setGutterWidth(gutters.offsetWidth);
      ro = new ResizeObserver(() => setGutterWidth(gutters.offsetWidth));
      ro.observe(gutters);
    };

    const mo = new MutationObserver(() => {
      const gutters = container.querySelector('.cm-gutters') as HTMLElement | null;
      if (gutters) attachRo(gutters);
    });

    mo.observe(container, { childList: true, subtree: true });

    // Handle the case where gutters already exist on mount
    const existing = container.querySelector('.cm-gutters') as HTMLElement | null;
    if (existing) attachRo(existing);

    return () => {
      mo.disconnect();
      ro?.disconnect();
    };
  }, []);

  // Sync BPM slider when agent or external code changes update setcps(...)
  useEffect(() => {
    return strudelService.onStateChange((state) => {
      if (bpmFromSlider.current) return;
      const parsed = parseScore(state.code);
      if (parsed.bpm !== null) setBpm(parsed.bpm);
    });
  }, []);

  // Hide tooltip on pointer release anywhere
  useEffect(() => {
    const hide = () => setTooltip(null);
    window.addEventListener('pointerup', hide);
    return () => window.removeEventListener('pointerup', hide);
  }, []);

  const handlePlayClick = () => {
    if (isPlaying) {
      onStop();
    } else if (engineReady) {
      onPlay();
    }
  };

  return (
    <div className="h-full flex flex-col border border-border">
      <style>{`
        .aj-slider { -webkit-appearance: none; appearance: none; outline: none; cursor: pointer; background: transparent; }
        .aj-slider::-webkit-slider-thumb { -webkit-appearance: none; width: 13px; height: 13px; border-radius: 50%; background: #000000; border: 1.5px solid #888888; cursor: pointer; margin-top: -6px; }
        .aj-slider::-moz-range-thumb { width: 13px; height: 13px; border-radius: 50%; background: #000000; border: 1.5px solid #888888; cursor: pointer; }
        .aj-slider::-webkit-slider-runnable-track { height: 1px; background: linear-gradient(to right, rgba(255,255,255,0.35) var(--fill-pct, 0%), #323232 var(--fill-pct, 0%)); }
        .aj-slider::-moz-range-track { height: 1px; background: #323232; }
        .aj-slider::-moz-range-progress { height: 1px; background: rgba(255,255,255,0.35); }
      `}</style>

      {/* StrudelMirror mounts here */}
      <div className="relative flex-1 min-h-0">
        <div
          ref={containerRef}
          data-testid="code-panel-editor-root"
          className="h-full flex flex-col justify-stretch items-stretch overflow-hidden *:h-full"
        />
      </div>

      {topActionsContainer?.current && createPortal(
        <TopActionBar
          onOpenSettings={onOpenSettings}
          session={session}
          code={strudelService.code}
          messages={messages}
          engineReady={engineReady}
          hasCode={hasCode}
          exportState={exportState}
          onExport={handleExport}
          onResetExportState={onResetExportState}
          bpm={bpm}
        />,
        topActionsContainer.current,
      )}

      {error && (
        <div className="mx-3 mb-2 p-2.5 bg-error/10 border border-error/30 rounded-md text-error text-xs font-mono shrink-0">
          {error}
        </div>
      )}

      {/* Footer — play button + sliders */}
      <div
        className="shrink-0 flex items-stretch border-t"
        style={{ background: '#000', borderColor: '#323232', fontFamily: "'ABeeZee', monospace" }}
      >
        {/* Play button, width matches .cm-gutters */}
        <div
          className="flex items-center justify-center py-[6px]"
          style={{
            width: gutterWidth || undefined,
            minWidth: gutterWidth || undefined,
            borderRight: gutterWidth ? '1px solid #323232' : undefined,
          }}
        >
          <button
            onClick={handlePlayClick}
            disabled={!engineReady && !isPlaying}
            className={`flex items-center justify-center transition-opacity text-[#B2370C] ${
              isPlaying ? 'hover:opacity-70' : 'hover:opacity-70 disabled:opacity-30 disabled:cursor-not-allowed'
            }`}
            title={isPlaying ? t('stop') : t('play')}
          >
            {isPlaying ? <StopIcon size={36} /> : <PlayIcon size={36} />}
          </button>
        </div>

        {isMobile ? (
          <MobileSliderButton
            label="Volume"
            displayValue={`${Math.round(volume * 100)}%`}
            borderRight
            onClick={() => setActiveSlider('volume')}
          />
        ) : (
          <SliderColumn
            label="Volume"
            sliderKey="volume"
            value={volume}
            min={0}
            max={1}
            step={0.01}
            tooltip={tooltip}
            formatValue={(v) => `${Math.round(v * 100)}%`}
            onChange={(v) => {
              setVolume(v);
              void strudelService.setMasterVolume(v);
            }}
            onTooltip={setTooltip}
            borderRight
          />
        )}

        {isMobile ? (
          <MobileSliderButton
            label="BPM"
            displayValue={`${bpm}`}
            borderRight
            onClick={() => setActiveSlider('bpm')}
          />
        ) : (
          <SliderColumn
            label="BPM"
            sliderKey="bpm"
            value={bpm}
            min={60}
            max={240}
            step={1}
            tooltip={tooltip}
            formatValue={(v) => `${v}`}
            onChange={(v) => {
              setBpm(v);
              bpmFromSlider.current = true;
              strudelService.setTempo(v);
              bpmFromSlider.current = false;
            }}
            onTooltip={setTooltip}
            borderRight
          />
        )}

        {isMobile ? (
          <MobileSliderButton
            label="LPF"
            displayValue={formatLpf(lpf)}
            onClick={() => setActiveSlider('lpf')}
          />
        ) : (
          <SliderColumn
            label="LPF"
            sliderKey="lpf"
            value={lpf}
            min={0}
            max={1}
            step={0.005}
            tooltip={tooltip}
            formatValue={formatLpf}
            onChange={(v) => {
              setLpf(v);
              void strudelService.setMasterLPF(lpfSliderToHz(v));
            }}
            onTooltip={setTooltip}
          />
        )}
      </div>
      {isMobile && (
        <MobileSliderSheet
          activeSlider={activeSlider}
          configs={sliderConfigs}
          onClose={() => setActiveSlider(null)}
        />
      )}
    </div>
  );
}
