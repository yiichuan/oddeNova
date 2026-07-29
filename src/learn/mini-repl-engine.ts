import { registerSoundfonts } from '../lib/soundfont-loader';
import { installInlinePunchcardWidget } from './inline-punchcard';

/**
 * Shared, page-level prebake for the /learn docs' playable code blocks.
 *
 * Mirrors StrudelService's own `prebake()` (src/services/strudel.ts) — same sample
 * banks, same synths/soundfonts — but is intentionally a separate, lighter-weight
 * singleton: the main app's StrudelService is bound to session/chat state that this
 * standalone docs page doesn't have (see docs/adr/0002-in-app-chinese-workshop-translation.md).
 *
 * Every <CodeBlock> on the page constructs its own independent `StrudelMirror`
 * instance (same approach strudel.cc's own MiniRepl uses), but they all resolve
 * this one shared promise for module/sample loading and all output through the
 * single superdough AudioContext singleton — never a per-block AudioContext.
 */

let prebakePromise: Promise<void> | null = null;

export function getMiniReplPrebake(): Promise<void> {
  if (!prebakePromise) {
    prebakePromise = prebake();
  }
  return prebakePromise;
}

async function prebake(): Promise<void> {
  const [
    { evalScope, Pattern, noteToMidi, valueToMidi },
    { setWidget },
  ] = await Promise.all([
    import('@strudel/core'),
    import('@strudel/codemirror'),
  ]);
  const { initAudioOnFirstClick, registerSynthSounds, samples, aliasBank } = await import('superdough');

  initAudioOnFirstClick();

  const loadModules = evalScope(
    import('@strudel/core'),
    import('@strudel/codemirror'),
    import('@strudel/draw'),
    import('@strudel/mini'),
    import('@strudel/tonal'),
    import('@strudel/webaudio'),
  );

  await Promise.all([
    loadModules,
    registerSynthSounds(),
    samples('/sample-index/dirt-samples.json'),
    samples('/sample-index/tidal-drum-machines.json'),
    samples('/sample-index/piano.json'),
    samples('/sample-index/vcsl.json'),
    samples('/sample-index/mridangam.json'),
  ]);
  await samples('/sample-index/uzu-drumkit.json');
  await aliasBank('/sample-index/tidal-drum-machines-alias.json');
  installInlinePunchcardWidget(Pattern, setWidget);
  registerSoundfonts();

  // Register .piano() pattern method (same as StrudelService.prebake, kept in sync
  // so examples using .piano() behave identically to the main editor).
  const maxPan = noteToMidi('C8');
  const panwidth = (pan: number, width: number) => pan * width + (1 - width) / 2;
  if (!Pattern.prototype.piano) {
    Pattern.prototype.piano = function (this: InstanceType<typeof Pattern>) {
      return this.fmap((v: Record<string, unknown>) => ({ ...v, clip: v['clip'] ?? 1 }))
        .s('piano')
        .release(0.1)
        .fmap((value: Record<string, unknown>) => {
          const midi = valueToMidi(value);
          const pan = panwidth(Math.min(Math.round(midi) / maxPan, 1), 0.5);
          return { ...value, pan: ((value['pan'] as number) || 1) * pan };
        });
    };
  }
}
