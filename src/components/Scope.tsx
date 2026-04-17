import { useEffect, useRef } from 'react';
import { getScopeAnalyser } from '../services/strudel';

interface ScopeProps {
  isPlaying: boolean;
}

export default function Scope({ isPlaying }: ScopeProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const rafRef = useRef<number>(0);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const draw = () => {
      rafRef.current = requestAnimationFrame(draw);

      const dpr = window.devicePixelRatio || 1;
      const rect = canvas.getBoundingClientRect();
      if (canvas.width !== rect.width * dpr || canvas.height !== rect.height * dpr) {
        canvas.width = rect.width * dpr;
        canvas.height = rect.height * dpr;
      }

      const ctx = canvas.getContext('2d');
      if (!ctx) return;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

      const w = rect.width;
      const h = rect.height;

      ctx.clearRect(0, 0, w, h);

      // ._scope() label — top-left, styled like code
      const LABEL_H = 21;
      ctx.font = '13px "JetBrains Mono","Fira Code",ui-monospace,monospace';
      ctx.fillStyle = 'rgba(167,139,250,0.75)';
      ctx.fillText('._scope()', 16, LABEL_H - 5);

      const waveTop = LABEL_H;
      const waveH = h - LABEL_H;
      const mid = waveTop + waveH / 2;

      // Retry analyser each frame — getSuperdoughAudioController() is only
      // available after the first note plays, so early calls return null.
      const analyser = isPlaying ? getScopeAnalyser() : null;

      if (!analyser) {
        ctx.strokeStyle = 'rgba(255,255,255,0.2)';
        ctx.lineWidth = 1.5;
        ctx.beginPath(); ctx.moveTo(0, mid); ctx.lineTo(w, mid); ctx.stroke();
        return;
      }

      // Use Float32Array — Strudel's audio pipeline outputs float samples (-1..1)
      const dataArray = new Float32Array(analyser.frequencyBinCount);
      analyser.getFloatTimeDomainData(dataArray);

      ctx.strokeStyle = '#ffffff';
      ctx.lineWidth = 1.5;
      ctx.lineJoin = 'round';
      ctx.beginPath();

      const sliceWidth = w / dataArray.length;
      let x = 0;
      for (let i = 0; i < dataArray.length; i++) {
        // dataArray[i] is in -1..1; map to waveTop..waveTop+waveH
        const y = mid - (dataArray[i] * waveH) / 2;
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
