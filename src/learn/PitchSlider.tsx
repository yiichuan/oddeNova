import { useEffect, useRef, useState, type ReactNode } from 'react';
import { midi2note } from '@strudel/core';
import ClaviatureView from './Claviature';

/**
 * The interactive pitch explorer used throughout the "Understanding Pitch"
 * chapter — a port of strudel.cc's own `<PitchSlider>` component.
 *
 * Dragging a slider plays a bare oscillator so the reader can *hear* the
 * difference between the two scales: the blue slider maps its 0..1 travel
 * linearly onto frequency, the yellow one exponentially, which is what makes
 * the yellow one match our perception of pitch.
 *
 * The oscillator is built on the shared superdough AudioContext (never a
 * per-widget context) and connects straight to its destination, bypassing the
 * master chain — same as upstream, since this is a raw reference tone rather
 * than part of a pattern.
 */

/** Shared with the chapter prose, which colour-codes "frequency" and "pitch" the same way. */
export const FREQUENCY_COLOR = '#3b82f6';
export const PITCH_COLOR = '#eab308';

type GetAudioContext = () => AudioContext;

// superdough is loaded on mount rather than imported statically, same as
// CodeBlock does — it drags in the whole audio engine, which a docs chapter
// shouldn't pay for at import time. Resolving it into a ref (instead of
// awaiting inside the handler) keeps the gesture -> createOscillator path
// synchronous, which autoplay policies care about.
let superdoughModule: Promise<{ getAudioContext: GetAudioContext }> | null = null;
function loadSuperdough() {
  superdoughModule ??= import('superdough');
  return superdoughModule;
}

interface PitchSliderProps {
  /** Adds the two buttons that sweep the whole range, linearly vs exponentially. */
  animatable?: boolean;
  /** Plots the recent frequency history, making the shape of each scale visible. */
  plot?: boolean;
  showFrequencySlider?: boolean;
  showPitchSlider?: boolean;
  /** Step of the pitch slider, in fractions of the full range — e.g. `1/12` snaps to semitones. */
  pitchStep?: number;
  min?: number;
  max?: number;
  initial?: number;
  /** Reference frequency the displayed exponent is relative to. Defaults to `min`. */
  baseFrequency?: number;
  /** Offset added to the semitone count, turning it into a MIDI number (69 for A4). */
  zeroOffset?: number;
  /** Shows a piano keyboard that highlights (and can set) the current note. */
  claviature?: boolean;
}

function plotValues(ctx: CanvasRenderingContext2D, values: number[], min: number, max: number, color: string) {
  const { width, height } = ctx.canvas;
  ctx.strokeStyle = color;
  ctx.lineWidth = 8;
  ctx.beginPath();
  const x = (f: number) => ((f - min) / (max - min)) * width;
  const y = (i: number) => (1 - i / values.length) * height;
  values.forEach((f, i) => ctx.lineTo(x(f), y(i)));
  ctx.stroke();
}

export default function PitchSlider({
  animatable = false,
  plot = false,
  showFrequencySlider = false,
  showPitchSlider = false,
  pitchStep = 0.001,
  min = 55,
  max = 7040,
  initial = 220,
  baseFrequency,
  zeroOffset = 0,
  claviature = false,
}: PitchSliderProps) {
  const base = baseFrequency ?? min;
  const oscRef = useRef<OscillatorNode | null>(null);
  const freqRef = useRef(initial);
  const historyRef = useRef<number[]>([initial]);
  const sweepRef = useRef<number | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const getAudioContextRef = useRef<GetAudioContext | null>(null);
  const [hz, setHz] = useState(initial);

  useEffect(() => {
    freqRef.current = hz;
  }, [hz]);

  useEffect(() => {
    let disposed = false;
    void loadSuperdough().then(({ getAudioContext }) => {
      if (!disposed) getAudioContextRef.current = getAudioContext;
    });
    return () => {
      disposed = true;
    };
  }, []);

  function stopOsc() {
    oscRef.current?.stop();
    oscRef.current = null;
  }

  function cancelSweep() {
    if (sweepRef.current !== null) {
      cancelAnimationFrame(sweepRef.current);
      sweepRef.current = null;
    }
  }

  // Releasing the mouse anywhere ends the tone — the slider keeps its value,
  // but a docs page shouldn't leave an oscillator running after the drag.
  useEffect(() => {
    const handleUp = () => stopOsc();
    document.addEventListener('mouseup', handleUp);
    return () => {
      document.removeEventListener('mouseup', handleUp);
      cancelSweep();
      stopOsc();
    };
  }, []);

  function startOsc(frequency: number) {
    const getAudioContext = getAudioContextRef.current;
    // Still loading on the very first interaction after mount — the next drag
    // will work.
    if (!getAudioContext) {
      setHz(frequency);
      return;
    }
    const ctx = getAudioContext();
    // Nothing on the page may have played yet, so the shared context can still
    // be suspended. Every caller here runs from a user gesture, so resuming is
    // allowed at this point.
    if (ctx.state !== 'running') void ctx.resume();
    stopOsc();
    const osc = ctx.createOscillator();
    osc.frequency.value = frequency;
    osc.connect(ctx.destination);
    osc.start();
    oscRef.current = osc;
    setHz(frequency);
  }

  function startSweep(exponential = false) {
    let f = min;
    startOsc(f);
    const frame = () => {
      if (f >= max) {
        stopOsc();
        cancelSweep();
        setHz(f);
        return;
      }
      f = exponential ? f * 1.01 : f + 10;
      if (oscRef.current) {
        oscRef.current.frequency.value = f;
      }
      setHz(f);
      sweepRef.current = requestAnimationFrame(frame);
    };
    sweepRef.current = requestAnimationFrame(frame);
  }

  const freqSlider2freq = (progress: number) => min + progress * (max - min);
  const pitchSlider2freq = (progress: number) => min * 2 ** (progress * Math.log2(max / min));
  const freq2freqSlider = (freq: number) => (freq - min) / (max - min);
  const freq2pitchSlider = (freq: number) => {
    const [minOct, maxOct] = [Math.log2(min), Math.log2(max)];
    return (Math.log2(freq) - minOct) / (maxOct - minOct);
  };

  useEffect(() => {
    if (!plot) return;
    let raf = 0;
    const frame = () => {
      historyRef.current.push(freqRef.current);
      historyRef.current = historyRef.current.slice(-1000);
      const ctx = canvasRef.current?.getContext('2d');
      if (ctx) {
        ctx.clearRect(0, 0, ctx.canvas.width, ctx.canvas.height);
        if (showFrequencySlider) {
          plotValues(ctx, historyRef.current, min, max, FREQUENCY_COLOR);
        }
        if (showPitchSlider) {
          const perceptual = historyRef.current.map((v) => Math.log2(v));
          plotValues(ctx, perceptual, Math.log2(min), Math.log2(max), PITCH_COLOR);
        }
      }
      raf = requestAnimationFrame(frame);
    };
    raf = requestAnimationFrame(frame);
    return () => cancelAnimationFrame(raf);
  }, [plot, min, max, showFrequencySlider, showPitchSlider]);

  function handleChangeFrequency(f: number) {
    setHz(f);
    if (oscRef.current) {
      oscRef.current.frequency.value = f;
    }
  }

  function handleMouseDown() {
    cancelSweep();
    startOsc(freqRef.current);
  }

  let exponent: ReactNode = null;
  let activeNote: string | undefined;
  let activeNoteLabel: string | undefined;
  if (showPitchSlider) {
    const expOffset = base ? Math.log2(base / min) : 0;
    const rawExponent = freq2pitchSlider(hz) * Math.log2(max / min) - expOffset;
    const semitones = parseFloat((rawExponent * 12).toFixed(2));
    if (zeroOffset) {
      const midi = semitones + zeroOffset;
      const isWhole = Math.round(midi) === midi;
      activeNote = midi2note(Math.round(midi)) as string;
      activeNoteLabel = (isWhole ? '' : '~') + activeNote;
      exponent = (
        <>
          (<span style={{ color: PITCH_COLOR }}>{isWhole ? midi : midi.toFixed(2)}</span> - {zeroOffset})/12
        </>
      );
    } else if (semitones % 12 === 0) {
      exponent = <span style={{ color: PITCH_COLOR }}>{semitones / 12}</span>;
    } else if (semitones % 1 === 0) {
      exponent = (
        <>
          <span style={{ color: PITCH_COLOR }}>{semitones}</span>/12
        </>
      );
    } else {
      exponent = <span style={{ color: PITCH_COLOR }}>{rawExponent.toFixed(2)}</span>;
    }
  }

  return (
    <div className="mb-4 select-none">
      <div className="font-mono text-[13px]">
        {showFrequencySlider && <span style={{ color: FREQUENCY_COLOR }}>{hz.toFixed(0)}Hz</span>}
        {showFrequencySlider && showPitchSlider && <> = </>}
        {showPitchSlider && (
          <>
            {base}Hz * 2<sup>{exponent}</sup>
          </>
        )}
        {claviature && (
          <>
            {' = '}
            <span style={{ color: PITCH_COLOR }}>{activeNoteLabel}</span>
          </>
        )}
      </div>

      {showFrequencySlider && (
        <input
          type="range"
          aria-label="frequency"
          value={freq2freqSlider(hz)}
          min={0}
          max={1}
          step={0.001}
          onMouseDown={handleMouseDown}
          onChange={(e) => handleChangeFrequency(freqSlider2freq(parseFloat(e.target.value)))}
          className="block w-full max-w-[600px] mt-1"
          style={{ accentColor: FREQUENCY_COLOR }}
        />
      )}
      {showPitchSlider && (
        <input
          type="range"
          aria-label="pitch"
          value={freq2pitchSlider(hz)}
          min={0}
          max={1}
          step={pitchStep}
          onMouseDown={handleMouseDown}
          onChange={(e) => handleChangeFrequency(pitchSlider2freq(parseFloat(e.target.value)))}
          className="block w-full max-w-[600px] mt-1"
          style={{ accentColor: PITCH_COLOR }}
        />
      )}

      {plot && <canvas ref={canvasRef} className="w-full max-w-[584px] h-[300px] mt-2" width={800} height={600} />}

      {animatable && (
        <div className="flex gap-2 mt-2">
          <button
            type="button"
            onClick={() => startSweep()}
            className="px-3 py-1.5 text-[13px] border border-[#323232] bg-[#111] hover:border-white/30 transition-colors"
            style={{ color: FREQUENCY_COLOR }}
          >
            频率扫描
          </button>
          <button
            type="button"
            onClick={() => startSweep(true)}
            className="px-3 py-1.5 text-[13px] border border-[#323232] bg-[#111] hover:border-white/30 transition-colors"
            style={{ color: PITCH_COLOR }}
          >
            音高扫描
          </button>
        </div>
      )}

      {claviature && (
        <div className="mt-2 [&_svg]:max-w-full [&_svg]:h-auto">
          <ClaviatureView
            onMouseDown={(note) => {
              cancelSweep();
              startOsc(440 * 2 ** ((note - 69) / 12));
            }}
            options={{
              range: ['A1', 'A5'],
              scaleY: 0.75,
              scaleX: 0.86,
              colorize: activeNote ? [{ keys: [activeNote], color: PITCH_COLOR }] : [],
              labels: activeNote ? { [activeNote]: activeNote } : {},
            }}
          />
        </div>
      )}
    </div>
  );
}
