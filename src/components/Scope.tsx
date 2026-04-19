import { useEffect, useRef } from 'react';
import { getScopeAnalyser } from '../services/strudel';

interface ScopeProps {
  isPlaying: boolean;
}

// How many samples to display across the full width.
// Increase = more cycles visible (more compressed horizontally).
// At fftSize=8192 and 44100Hz: 2048 samples ≈ 46ms ≈ ~3 cycles of C2 (65Hz)
const WINDOW = 2048;
const GAIN   = 4;

export default function Scope({ isPlaying }: ScopeProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const rafRef    = useRef<number>(0);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const draw = () => {
      rafRef.current = requestAnimationFrame(draw);

      const dpr  = window.devicePixelRatio || 1;
      const rect = canvas.getBoundingClientRect();
      if (canvas.width !== rect.width * dpr || canvas.height !== rect.height * dpr) {
        canvas.width  = rect.width  * dpr;
        canvas.height = rect.height * dpr;
      }

      const ctx = canvas.getContext('2d');
      if (!ctx) return;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

      const w = rect.width;
      const h = rect.height;

      ctx.clearRect(0, 0, w, h);

      // ._scope() label
      const LABEL_H = 21;
      ctx.font      = '13px "JetBrains Mono","Fira Code",ui-monospace,monospace';
      ctx.fillStyle = 'rgba(167,139,250,0.75)';
      ctx.fillText('._scope()', 16, LABEL_H - 5);

      const waveTop = LABEL_H;
      const waveH   = h - LABEL_H;
      const mid     = waveTop + waveH / 2;

      const analyser = isPlaying ? getScopeAnalyser() : null;

      if (!analyser) {
        ctx.strokeStyle = 'rgba(255,255,255,0.2)';
        ctx.lineWidth   = 1.5;
        ctx.beginPath(); ctx.moveTo(0, mid); ctx.lineTo(w, mid); ctx.stroke();
        return;
      }

      // Bump fftSize to 8192 so WINDOW values > 2048 actually have effect
      if (analyser.fftSize !== 8192) analyser.fftSize = 8192;

      const dataArray = new Float32Array(analyser.frequencyBinCount);
      analyser.getFloatTimeDomainData(dataArray);

      // Hysteresis trigger: wait for signal to go below -THRESH (armed),
      // then trigger on the next rising zero-crossing.
      // This ignores tiny ripple crossings from harmonics and locks onto
      // the fundamental's main downstroke → upstroke transition.
      const THRESH = 0.015;
      const searchLimit = dataArray.length - WINDOW;
      let triggerIdx = 0;
      let armed = false;
      for (let i = 1; i < searchLimit; i++) {
        if (!armed && dataArray[i] < -THRESH) { armed = true; }
        if (armed && dataArray[i - 1] < 0 && dataArray[i] >= 0) {
          triggerIdx = i;
          break;
        }
      }

      const drawCount  = Math.min(WINDOW, dataArray.length - triggerIdx);
      const sliceWidth = w / drawCount;

      ctx.strokeStyle = '#ffffff';
      ctx.lineWidth   = 1.5;
      ctx.lineJoin    = 'round';
      ctx.beginPath();
      let x = 0;
      for (let i = 0; i < drawCount; i++) {
        const y = mid - (dataArray[triggerIdx + i] * waveH * GAIN) / 2;
        i === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y);
        x += sliceWidth;
      }
      ctx.stroke();
    };

    draw();
    return () => cancelAnimationFrame(rafRef.current);
  }, [isPlaying]);

  return (
    <div className="h-full w-full">
      <canvas ref={canvasRef} className="w-full h-full" />
    </div>
  );
}
