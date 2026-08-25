import { RotateCcw } from 'lucide-react';
import { useCallback, useState } from 'react';
import type { FeaturedPiece } from '../../lib/featured-pieces';
import { t } from '../../lib/i18n';
import VinylPackageScene, { type VinylLabControls, type VinylLabDiagnostics } from './VinylPackageScene';

const INITIAL_CONTROLS: VinylLabControls = { thickness: 2, bulge: 0.35, wear: 45, keyLight: 100, background: 100 };
const INITIAL_DIAGNOSTICS: VinylLabDiagnostics = { status: 'loading', fps: 0, width: 0, height: 0, dpr: 1, calls: 0, triangles: 0, textures: 0 };

function Slider({ label, value, min, max, step, suffix, disabled, onChange }: { label: string; value: number; min: number; max: number; step: number; suffix: string; disabled: boolean; onChange: (value: number) => void }) {
  return <label className="grid gap-2 text-xs text-text-secondary">
    <span className="flex items-baseline justify-between gap-4"><span>{label}</span><output className="font-medium text-text-primary">{value}{suffix}</output></span>
    <input className="vinyl-lab-range w-full disabled:cursor-not-allowed disabled:opacity-35" disabled={disabled} type="range" min={min} max={max} step={step} value={value} onChange={(event) => onChange(Number(event.target.value))} />
  </label>;
}

export default function VinylLabPage({ piece }: { piece: FeaturedPiece }) {
  const [controls, setControls] = useState(INITIAL_CONTROLS);
  const [diagnostics, setDiagnostics] = useState(INITIAL_DIAGNOSTICS);
  const update = (key: keyof VinylLabControls) => (value: number) => setControls((current) => ({ ...current, [key]: value }));
  const onDiagnostics = useCallback((next: VinylLabDiagnostics) => setDiagnostics(next), []);
  const failed = diagnostics.status === 'failed' || diagnostics.status === 'context-lost';
  const statusLabel = diagnostics.status === 'ready' ? t('vinylLabReady') : diagnostics.status === 'context-lost' ? t('vinylLabContextLost') : diagnostics.status === 'failed' ? t('vinylLabFailed') : 'WebGL…';
  return <main className="relative flex h-full w-full overflow-hidden bg-[#080a0d] text-text-primary" data-testid="vinyl-lab-page">
    <section className="relative min-w-0 flex-[1.9] overflow-hidden border-r border-white/[0.08]" aria-label={t('vinylLabTitle')}>
      <VinylPackageScene coverUrl={piece.coverUrl} packageId={piece.id} controls={controls} onDiagnostics={onDiagnostics} />
      <div className="pointer-events-none absolute left-7 top-7 max-w-sm">
        <p className="font-dm-serif text-[clamp(1.5rem,2.6vw,2.5rem)] leading-none tracking-[-0.035em]">{t('vinylLabTitle')}</p>
        <p className="mt-2 text-xs tracking-[0.08em] text-text-secondary">{t('vinylLabSubtitle')}</p>
      </div>
      {failed && <div className="absolute inset-0 grid place-items-center bg-[#080a0d] p-8 text-center">
        <div><p className="font-dm-serif text-2xl">{statusLabel}</p><p className="mt-2 text-sm text-text-secondary">{t('vinylLabFailureHint')}</p></div>
      </div>}
    </section>
    <aside className="flex w-[min(32vw,390px)] min-w-[290px] flex-col bg-[#0c0f13]" aria-label={t('vinylLabControls')}>
      <section className="border-b border-white/[0.08] px-6 py-7">
        <div className="mb-7 flex items-center justify-between"><h1 className="text-xs font-medium uppercase tracking-[0.16em] text-text-secondary">{t('vinylLabControls')}</h1><button disabled={failed} type="button" onClick={() => setControls(INITIAL_CONTROLS)} className="inline-flex items-center gap-1.5 text-xs text-text-secondary transition-colors hover:text-text-primary disabled:cursor-not-allowed disabled:opacity-35"><RotateCcw size={13} />{t('vinylLabReset')}</button></div>
        <div className="grid gap-5">
          <Slider disabled={failed} label={t('vinylLabThickness')} value={controls.thickness} min={1} max={5} step={0.1} suffix="×" onChange={update('thickness')} />
          <Slider disabled={failed} label={t('vinylLabBulge')} value={controls.bulge} min={0} max={0.8} step={0.01} suffix="" onChange={update('bulge')} />
          <Slider disabled={failed} label={t('vinylLabWear')} value={controls.wear} min={0} max={100} step={1} suffix="%" onChange={update('wear')} />
          <Slider disabled={failed} label={t('vinylLabKeyLight')} value={controls.keyLight} min={50} max={150} step={1} suffix="%" onChange={update('keyLight')} />
          <Slider disabled={failed} label={t('vinylLabBackground')} value={controls.background} min={50} max={150} step={1} suffix="%" onChange={update('background')} />
        </div>
      </section>
      <section className="min-h-0 flex-1 px-6 py-7"><h2 className="text-xs font-medium uppercase tracking-[0.16em] text-text-secondary">{t('vinylLabDiagnostics')}</h2><p className={`mt-4 text-sm ${failed ? 'text-red-300' : 'text-text-primary'}`}>{statusLabel}</p>{diagnostics.reason && <p className="mt-1 break-words text-xs text-text-muted">{diagnostics.reason}</p>}<dl className="mt-7 grid grid-cols-2 gap-x-5 gap-y-4 text-xs"><div><dt className="text-text-muted">FPS</dt><dd className="mt-1 text-text-primary">{diagnostics.fps || '—'}</dd></div><div><dt className="text-text-muted">Canvas</dt><dd className="mt-1 text-text-primary">{diagnostics.width ? `${diagnostics.width} × ${diagnostics.height}` : '—'}</dd></div><div><dt className="text-text-muted">DPR</dt><dd className="mt-1 text-text-primary">{diagnostics.dpr}</dd></div><div><dt className="text-text-muted">Draw calls</dt><dd className="mt-1 text-text-primary">{diagnostics.calls || '—'}</dd></div><div><dt className="text-text-muted">Triangles</dt><dd className="mt-1 text-text-primary">{diagnostics.triangles || '—'}</dd></div><div><dt className="text-text-muted">Textures</dt><dd className="mt-1 text-text-primary">{diagnostics.textures || '—'}</dd></div></dl></section>
    </aside>
  </main>;
}
