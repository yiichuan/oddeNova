import { useEffect, useRef, useCallback } from 'react';
import { getAudioCtx } from '../services/strudel';

interface VisualizerProps {
  isPlaying: boolean;
}

export default function Visualizer({ isPlaying }: VisualizerProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const animFrameRef = useRef<number>(0);
  const connectedRef = useRef(false);

  const connectAnalyser = useCallback(() => {
    if (connectedRef.current) return;
    const ctx = getAudioCtx();
    if (!ctx) return;

    const analyser = ctx.createAnalyser();
    analyser.fftSize = 256;
    analyser.smoothingTimeConstant = 0.8;

    try {
      ctx.destination.connect(analyser);
    } catch {
      // Some browsers don't allow connecting from destination;
      // try connecting from the Strudel output node instead
    }
    analyserRef.current = analyser;
    connectedRef.current = true;
  }, []);

  const draw = useCallback(() => {
    const canvas = canvasRef.current;
    const analyser = analyserRef.current;
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

    if (!analyser || !isPlaying) {
      drawIdleBars(ctx, w, h);
      animFrameRef.current = requestAnimationFrame(draw);
      return;
    }

    const bufferLength = analyser.frequencyBinCount;
    const dataArray = new Uint8Array(bufferLength);
    analyser.getByteFrequencyData(dataArray);

    const barCount = 64;
    const barWidth = (w / barCount) * 0.7;
    const gap = (w / barCount) * 0.3;

    for (let i = 0; i < barCount; i++) {
      const dataIndex = Math.floor((i / barCount) * bufferLength);
      const value = dataArray[dataIndex] / 255;
      const barHeight = Math.max(2, value * h * 0.85);

      const x = i * (barWidth + gap) + gap / 2;
      const y = h - barHeight;

      const gradient = ctx.createLinearGradient(x, y, x, h);
      gradient.addColorStop(0, `rgba(162, 155, 254, ${0.3 + value * 0.7})`);
      gradient.addColorStop(1, `rgba(108, 92, 231, ${0.2 + value * 0.5})`);

      ctx.fillStyle = gradient;
      ctx.beginPath();
      ctx.roundRect(x, y, barWidth, barHeight, [barWidth / 2, barWidth / 2, 0, 0]);
      ctx.fill();

      // Glow
      if (value > 0.6) {
        ctx.shadowColor = 'rgba(108, 92, 231, 0.5)';
        ctx.shadowBlur = 10;
        ctx.fill();
        ctx.shadowBlur = 0;
      }
    }

    animFrameRef.current = requestAnimationFrame(draw);
  }, [isPlaying]);

  useEffect(() => {
    if (isPlaying) {
      connectAnalyser();
    }
    animFrameRef.current = requestAnimationFrame(draw);
    return () => cancelAnimationFrame(animFrameRef.current);
  }, [isPlaying, draw, connectAnalyser]);

  return (
    <div className="h-full w-full bg-bg-primary/50 relative">
      <canvas
        ref={canvasRef}
        className="w-full h-full"
      />
      {!isPlaying && (
        <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
          <span className="text-text-muted/30 text-sm">🎶</span>
        </div>
      )}
    </div>
  );
}

function drawIdleBars(ctx: CanvasRenderingContext2D, w: number, h: number) {
  const barCount = 64;
  const barWidth = (w / barCount) * 0.7;
  const gap = (w / barCount) * 0.3;
  const time = Date.now() / 2000;

  for (let i = 0; i < barCount; i++) {
    const value = 0.05 + Math.sin(time + i * 0.15) * 0.03;
    const barHeight = Math.max(2, value * h);
    const x = i * (barWidth + gap) + gap / 2;
    const y = h - barHeight;

    ctx.fillStyle = 'rgba(108, 92, 231, 0.15)';
    ctx.beginPath();
    ctx.roundRect(x, y, barWidth, barHeight, [barWidth / 2, barWidth / 2, 0, 0]);
    ctx.fill();
  }
}
