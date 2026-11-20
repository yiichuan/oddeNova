import { useEffect, useMemo, useRef, useState } from 'react';
import { Download, Play, Square } from 'lucide-react';
import { buildHummingWaveformReport } from '../../lib/humming-context';
import { encodeHummingMidi } from '../../lib/humming-midi';
import { t, zh } from '../../lib/i18n';
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
  const [downloadError, setDownloadError] = useState(false);

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
      stop();
    };
  }, [draft.id, analysis]);

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

  const download = () => {
    setDownloadError(false);
    try {
      const file = new Blob([encodeHummingMidi(analysis)], { type: 'audio/midi' });
      const url = URL.createObjectURL(file);
      const link = document.createElement('a');
      try {
        link.href = url;
        link.download = 'humming.mid';
        document.body.appendChild(link);
        link.click();
      } finally {
        link.remove();
        window.setTimeout(() => URL.revokeObjectURL(url), 1000);
      }
    } catch {
      setDownloadError(true);
    }
  };

  const report = useMemo(() => buildHummingWaveformReport(analysis), [analysis]);
  const { tempo, meter, notes } = report;
  const seconds = (value: number) => `${value.toFixed(3)} s`;
  const summary = [
    { label: t('hummingAnalysisSource'), value: report.engine },
    { label: t('hummingAnalysisNoteCount'), value: notes.length },
    { label: t('hummingAnalysisRecordingDuration'), value: seconds(report.recording_duration_seconds) },
    { label: t('hummingAnalysisMelodyStart'), value: seconds(report.melody_start_seconds) },
    { label: t('hummingAnalysisMelodyEnd'), value: seconds(report.melody_end_seconds) },
    { label: t('hummingAnalysisMelodyDuration'), value: seconds(analysis.melodyDurationSeconds) },
    { label: t('hummingAnalysisBpm'), value: tempo ? `${tempo.bpm} BPM` : t('hummingAnalysisUnavailable') },
    { label: t('hummingAnalysisTimeSignature'), value: meter?.time_signature ?? t('hummingAnalysisUnavailable') },
  ];
  if (tempo && 'beat_seconds' in tempo && tempo.beat_seconds !== undefined) {
    summary.push(
      { label: t('hummingAnalysisBeatDuration'), value: seconds(tempo.beat_seconds) },
      { label: t('hummingAnalysisPulseAnchor'), value: seconds(tempo.pulse_anchor_seconds) },
      { label: t('hummingAnalysisOnsetFit'), value: `${Math.round(tempo.aligned_onsets_ratio * 100)}%` },
    );
    if (tempo.alternative_bpm !== null) {
      summary.push({ label: t('hummingAnalysisAlternativeBpm'), value: `${tempo.alternative_bpm} BPM` });
    }
  }
  if (meter && 'first_supported_downbeat_seconds' in meter && meter.first_supported_downbeat_seconds !== undefined) {
    summary.push(
      { label: t('hummingAnalysisDownbeat'), value: seconds(meter.first_supported_downbeat_seconds) },
      { label: t('hummingAnalysisMeterBasis'), value: t('hummingAnalysisRepeatedAccents') },
    );
  }

  const columns = [
    { label: t('hummingAnalysisPitch'), value: (note: typeof notes[number]) => `${note.pitch} · MIDI ${note.midi}` },
    { label: t('hummingNoteStart'), value: (note: typeof notes[number]) => seconds(note.start_seconds) },
    { label: t('hummingNoteEnd'), value: (note: typeof notes[number]) => seconds(note.end_seconds) },
    { label: t('hummingAnalysisNoteDuration'), value: (note: typeof notes[number]) => seconds(note.duration_seconds) },
    { label: t('hummingAnalysisRest'), value: (note: typeof notes[number]) => seconds(note.rest_before_seconds) },
  ];
  if (notes.some(note => note.relative_level_db !== undefined)) {
    columns.push({
      label: t('hummingAnalysisLevel'),
      value: note => note.relative_level_db === undefined ? '—' : `${note.relative_level_db} dB`,
    });
  }
  if (notes.some(note => note.pitch_contour_cents?.length)) {
    columns.push({
      label: t('hummingAnalysisContour'),
      value: note => note.pitch_contour_cents?.length ? `${note.pitch_contour_cents.join(', ')} ¢` : '—',
    });
  }

  return <div className="min-w-0 space-y-2 text-xs text-text-secondary" aria-label={zh ? '解析结果' : 'Analysis result'}>
    <dl className="grid grid-cols-2 gap-x-3 gap-y-2 border-y border-border py-2 sm:grid-cols-4">
      {summary.map(({ label, value }) => (
        <div key={label} className="min-w-0">
          <dt className="text-text-muted">{label}</dt>
          <dd className="break-words tabular-nums text-text-primary">{value}</dd>
        </div>
      ))}
    </dl>
    {report.warnings.length > 0 && <p className="text-text-primary">
      {report.warnings.map(warning => t(warning === 'low_signal' ? 'hummingAnalysisLowSignal' : 'hummingAnalysisAmbiguous')).join(' · ')}
    </p>}
    <button type="button" onClick={download} disabled={disabled} className="flex items-center gap-1.5 rounded-md px-2 py-1 text-text-secondary underline hover:text-text-primary disabled:opacity-50">
      <Download size={12} aria-hidden="true" />
      {t('hummingDownloadMidi')}
    </button>
    {downloadError && <p role="alert" className="text-error">{t('hummingDownloadMidiFailed')}</p>}
    <div className="max-h-48 overflow-auto rounded-md border border-border" tabIndex={0} role="region" aria-label={zh ? '解析音符' : 'Recognized notes'}>
      <table className="w-full border-collapse whitespace-nowrap text-left tabular-nums">
        <thead className="sticky top-0 bg-bg-primary text-text-muted">
          <tr>
            {columns.map(({ label }) => <th key={label} scope="col" className="px-2 py-1 font-medium">{label}</th>)}
            <th scope="col" className="px-2 py-1"><span className="sr-only">{zh ? '试听' : 'Preview'}</span></th>
          </tr>
        </thead>
        <tbody>
          {notes.map((note, index) => {
            const timing = `${t('hummingNoteStart')} ${seconds(note.start_seconds)} · ${t('hummingNoteEnd')} ${seconds(note.end_seconds)}`;
            return <tr key={index} title={timing} className="border-t border-border">
              {columns.map(({ label, value }, column) => <td key={label} className="px-2 py-1">
                {value(note)}
                {column === 0 && note.uncertain_pitch && <span className="ml-1 text-text-muted">· {t('hummingAnalysisUncertain')}</span>}
              </td>)}
              <td className="px-2">
                <button type="button" disabled={disabled} aria-label={zh ? `播放第 ${index + 1} 个音 ${note.pitch}` : `Play note ${index + 1} ${note.pitch}`} aria-description={timing} className="inline-flex h-8 w-8 items-center justify-center rounded-full hover:bg-surface-hover disabled:opacity-40" onClick={() => { void play(index); }}>
                  {playing === index ? <Square size={14} /> : <Play size={14} />}
                </button>
              </td>
            </tr>;
          })}
        </tbody>
      </table>
    </div>
    {error && <span role="alert">{zh ? '片段播放失败' : 'Unable to play segment'}</span>}
  </div>;
}
