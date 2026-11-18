import { useEffect, useRef, useState } from 'react';
import { Play, Square } from 'lucide-react';
import { zh } from '../../lib/i18n';
import type { HummingAttachment, LocalHummingDraft } from '../../types/humming';

export default function HummingNotePlayback({ draft, analysis, disabled }: {
  draft: LocalHummingDraft;
  analysis: HummingAttachment;
  disabled: boolean;
}) {
  const sourceRef = useRef<AudioBufferSourceNode | null>(null);
  const generationRef = useRef(0);
  const [playing, setPlaying] = useState<number | null>(null);
  const [error, setError] = useState(false);

  useEffect(() => {
    const stop = () => {
      generationRef.current += 1;
      sourceRef.current?.stop();
      sourceRef.current = null;
      setPlaying(null);
    };
    const onOtherPreview = (event: Event) => {
      if ((event as CustomEvent<{ instanceId?: string }>).detail?.instanceId !== 'humming-note-preview') stop();
    };
    window.addEventListener('humming-preview-play', onOtherPreview);
    return () => {
      window.removeEventListener('humming-preview-play', onOtherPreview);
      generationRef.current += 1;
      sourceRef.current?.stop();
      sourceRef.current = null;
    };
  }, [draft.id]);

  const play = async (index: number) => {
    const generation = ++generationRef.current;
    const stopOnly = playing === index;
    sourceRef.current?.stop();
    sourceRef.current = null;
    setPlaying(null);
    setError(false);
    if (stopOnly) return;
    window.dispatchEvent(new CustomEvent('humming-preview-play', { detail: { instanceId: 'humming-note-preview' } }));
    try {
      const { getAudioContext } = await import('superdough');
      const context = getAudioContext() as AudioContext;
      if (context.state === 'suspended') await context.resume();
      const buffer = await context.decodeAudioData(await draft.blob.arrayBuffer());
      if (generation !== generationRef.current) return;
      const note = analysis.transcription.notes[index];
      const start = analysis.trimStartSeconds + note.startSeconds;
      const duration = Math.min(note.durationSeconds, buffer.duration - start);
      if (duration <= 0) throw new Error('invalid_note_range');
      const source = context.createBufferSource();
      source.buffer = buffer;
      source.connect(context.destination);
      sourceRef.current = source;
      source.onended = () => {
        source.disconnect();
        if (generationRef.current === generation) { sourceRef.current = null; setPlaying(null); }
      };
      source.start(0, start, duration);
      setPlaying(index);
    } catch {
      if (generation === generationRef.current) setError(true);
    }
  };

  return <div className="text-xs text-text-secondary" aria-label={zh ? '解析结果' : 'Analysis result'}>
    {analysis.transcription.notes.map((note, index) => {
      const names = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
      const name = `${names[note.pitchMidi % 12]}${Math.floor(note.pitchMidi / 12) - 1}`;
      return <span key={index} className="inline-flex items-center gap-1 mr-3 mb-1">
        {name} · {note.durationSeconds.toFixed(2)}s
        <button type="button" disabled={disabled} aria-label={zh ? `播放第 ${index + 1} 个音 ${name}` : `Play note ${index + 1} ${name}`} className="inline-flex h-8 w-8 items-center justify-center rounded-full hover:bg-surface-hover disabled:opacity-40" onClick={() => { void play(index); }}>
          {playing === index ? <Square size={12} /> : <Play size={12} />}
        </button>
      </span>;
    })}
    {error && <span role="alert">{zh ? '片段播放失败' : 'Unable to play segment'}</span>}
  </div>;
}
