import { useEffect, useRef, type RefObject } from 'react';
import { getAudioContext } from 'superdough';

const BAR_SPACING = 8;
const WAVEFORM_HEIGHT = 28;
const SAMPLE_INTERVAL_MS = 140;

export default function VoiceWaveform({ streamRef }: { streamRef: RefObject<MediaStream | null> }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    const stream = streamRef.current;
    const drawing = canvas?.getContext('2d');
    if (!canvas || !stream || !drawing) return;

    let source: MediaStreamAudioSourceNode | undefined;
    let analyser: AnalyserNode;
    try {
      const context = getAudioContext() as AudioContext;
      analyser = context.createAnalyser();
      analyser.fftSize = 8192;
      source = context.createMediaStreamSource(stream);
      source.connect(analyser);
      if (context.state === 'suspended') void context.resume().catch(() => {});
    } catch {
      source?.disconnect();
      return;
    }

    const samples = new Float32Array(analyser.fftSize);
    let levels = new Float32Array(0);
    const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
    let lastSampleAt: number | undefined;
    let frame: number;

    const draw = (now: number) => {
      const width = canvas.clientWidth;
      const barCount = Math.max(1, Math.round(width / BAR_SPACING));
      const historySize = barCount + 1;
      if (levels.length !== historySize) {
        const resized = new Float32Array(historySize);
        const recent = levels.subarray(-historySize);
        resized.set(recent, historySize - recent.length);
        levels = resized;
      }

      const elapsed = lastSampleAt === undefined ? SAMPLE_INTERVAL_MS : now - lastSampleAt;
      if (elapsed >= SAMPLE_INTERVAL_MS) {
        analyser.getFloatTimeDomainData(samples);
        let energy = 0;
        for (const sample of samples) energy += sample * sample;
        const rms = Math.sqrt(energy / samples.length);
        levels.copyWithin(0, 1);
        levels[barCount] = Math.min(1, Math.max(0, (rms - 0.005) * 8));
        lastSampleAt = now - elapsed % SAMPLE_INTERVAL_MS;
      }

      const pixelRatio = window.devicePixelRatio || 1;
      const pixelWidth = Math.round(width * pixelRatio);
      const pixelHeight = Math.round(WAVEFORM_HEIGHT * pixelRatio);
      if (canvas.width !== pixelWidth) canvas.width = pixelWidth;
      if (canvas.height !== pixelHeight) canvas.height = pixelHeight;
      drawing.setTransform(pixelRatio, 0, 0, pixelRatio, 0, 0);
      drawing.clearRect(0, 0, width, WAVEFORM_HEIGHT);
      drawing.strokeStyle = getComputedStyle(canvas).color;
      drawing.lineWidth = 2;
      drawing.lineCap = 'round';

      const spacing = width / barCount;
      // Include one extra bar so it can enter from the right as the oldest exits.
      const offset = reducedMotion.matches ? 1 : (elapsed % SAMPLE_INTERVAL_MS) / SAMPLE_INTERVAL_MS;
      drawing.beginPath();
      levels.forEach((level, index) => {
        const x = (index + 0.5 - offset) * spacing;
        const halfHeight = 0.5 + level * (WAVEFORM_HEIGHT / 2 - 1.5);
        drawing.moveTo(x, WAVEFORM_HEIGHT / 2 - halfHeight);
        drawing.lineTo(x, WAVEFORM_HEIGHT / 2 + halfHeight);
      });
      drawing.stroke();
      frame = requestAnimationFrame(draw);
    };
    frame = requestAnimationFrame(draw);

    return () => {
      cancelAnimationFrame(frame);
      source.disconnect();
    };
  }, [streamRef]);

  return (
    <div className="relative mx-1 h-7 min-w-0 flex-1 text-brand-accent" aria-hidden="true">
      <canvas ref={canvasRef} className="absolute inset-0 size-full" />
    </div>
  );
}
