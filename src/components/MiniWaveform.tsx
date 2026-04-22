import { useEffect, useRef } from 'react';
import { getAudioCtx } from '../services/strudel';

interface MiniWaveformProps {
  isPlaying: boolean;
  height?: number;
  barCount?: number;
}

let sharedAnalyser: AnalyserNode | null = null;
let sharedConnected = false;

function getAnalyser(): AnalyserNode | null {
  if (sharedAnalyser) return sharedAnalyser;
  const ctx = getAudioCtx();
  if (!ctx) return null;
  const a = ctx.createAnalyser();
  a.fftSize = 256;
  a.smoothingTimeConstant = 0.8;
  try {
    if (!sharedConnected) {
      ctx.destination.connect(a);
      sharedConnected = true;
    }
  } catch {
    // Some browsers don't allow connecting from destination — ignore;
    // the bars just sit in idle mode.
  }
  sharedAnalyser = a;
  return a;
}

export default function MiniWaveform({
  isPlaying,
  height = 24,
  barCount = 32,
}: MiniWaveformProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const animRef = useRef<number>(0);

  useEffect(() => {
    if (isPlaying) getAnalyser(); // ensure connected

    const draw = () => {
      const canvas = canvasRef.current;
      if (!canvas) return;
      const ctx = canvas.getContext('2d');
      if (!ctx) return;

      const dpr = window.devicePixelRatio || 1;
      const rect = canvas.getBoundingClientRect();
      canvas.width = rect.width * dpr;
      canvas.height = rect.height * dpr;
      ctx.scale(dpr, dpr);

      const w = rect.width;
      const h = rect.height;
      ctx.clearRect(0, 0, w, h);

      const analyser = getAnalyser();
      const barWidth = (w / barCount) * 0.6;
      const gap = (w / barCount) * 0.4;

      if (!analyser || !isPlaying) {
        // Idle: low gentle wave.
        const t = Date.now() / 800;
        for (let i = 0; i < barCount; i++) {
          const v = 0.08 + Math.sin(t + i * 0.4) * 0.04;
          const bh = Math.max(2, v * h);
          const x = i * (barWidth + gap) + gap / 2;
          ctx.fillStyle = 'rgba(255, 80, 80, 0.5)';
          ctx.fillRect(x, h - bh, barWidth, bh);
        }
        animRef.current = requestAnimationFrame(draw);
        return;
      }

      const buf = new Uint8Array(analyser.frequencyBinCount);
      analyser.getByteFrequencyData(buf);

      for (let i = 0; i < barCount; i++) {
        const dataIndex = Math.floor((i / barCount) * buf.length);
        const v = buf[dataIndex] / 255;
        const bh = Math.max(2, v * h * 0.95);
        const x = i * (barWidth + gap) + gap / 2;
        ctx.fillStyle = `rgba(255, 80, 80, ${0.5 + v * 0.5})`;
        ctx.fillRect(x, h - bh, barWidth, bh);
      }
      animRef.current = requestAnimationFrame(draw);
    };

    animRef.current = requestAnimationFrame(draw);
    return () => cancelAnimationFrame(animRef.current);
  }, [isPlaying, barCount]);

  return (
    <canvas
      ref={canvasRef}
      style={{ width: '100%', height: `${height}px` }}
    />
  );
}
