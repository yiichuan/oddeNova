import { useEffect, useRef } from 'react';
import { getAudioContext } from 'superdough';

const DOT_SPACING = 5;
const SAMPLE_INTERVAL_MS = 90;
const CENTER_Y = 15;
// The rounded stroke adds its own width to both ends of the displayed bar.
const MAX_BAR_LENGTH = 17;

function createMeter(stream: MediaStream | null) {
  if (!stream) return null;
  try {
    const context = getAudioContext();
    const analyser = context.createAnalyser();
    analyser.fftSize = 1024;
    const samples = new Float32Array(analyser.fftSize);
    const source = context.createMediaStreamSource(stream);
    // The microphone is only measured. There is no connection to the speakers.
    source.connect(analyser);
    return {
      read() {
        analyser.getFloatTimeDomainData(samples);
        let sumOfSquares = 0;
        for (const sample of samples) sumOfSquares += sample * sample;
        const rms = Math.sqrt(sumOfSquares / samples.length);
        const level = (20 * Math.log10(rms) + 54) / 36;
        return Math.max(0, Math.min(1, level));
      },
      disconnect() { source.disconnect(); },
    };
  } catch {
    return null;
  }
}

export default function RecordingDots({ stream }: { stream: MediaStream | null }) {
  const svgRef = useRef<SVGSVGElement>(null);
  const pathRef = useRef<SVGPathElement>(null);

  useEffect(() => {
    const svg = svgRef.current;
    const path = pathRef.current;
    if (!svg || !path) return;
    const meter = createMeter(stream);
    const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
    const history: number[] = [];
    let columnCount = 0;
    let frame = 0;
    let nextSample = 0;
    let level = 0;

    const resize = () => {
      columnCount = Math.ceil(svg.clientWidth / DOT_SPACING) + 1;
      history.splice(columnCount);
    };
    resize();
    const observer = new ResizeObserver(resize);
    observer.observe(svg);

    const draw = (now: number) => {
      if (now >= nextSample) {
        level += ((meter?.read() ?? 0) - level) * 0.65;
        history.unshift(level * MAX_BAR_LENGTH);
        history.splice(columnCount);
        nextSample = nextSample === 0 || now - nextSample >= SAMPLE_INTERVAL_MS
          ? now + SAMPLE_INTERVAL_MS : nextSample + SAMPLE_INTERVAL_MS;
      }

      const offset = reducedMotion.matches ? 0 : (1 - (nextSample - now) / SAMPLE_INTERVAL_MS) * DOT_SPACING;
      let dots = '';
      for (let column = 0; column < columnCount; column++) {
        const x = (columnCount - 1 - column) * DOT_SPACING - offset;
        const length = Math.max(0.01, (reducedMotion.matches ? history[0] : history[column]) ?? 0);
        dots += `M${x} ${CENTER_Y - length / 2}v${length}`;
      }
      path.setAttribute('d', dots);
      frame = window.requestAnimationFrame(draw);
    };
    frame = window.requestAnimationFrame(draw);

    return () => {
      window.cancelAnimationFrame(frame);
      observer.disconnect();
      meter?.disconnect();
    };
  }, [stream]);

  return (
    <svg ref={svgRef} aria-hidden="true" className="chat-recording-waveform block h-[30px] w-full min-w-0 flex-1 overflow-hidden text-text-secondary/45">
      <path ref={pathRef} fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" />
    </svg>
  );
}
