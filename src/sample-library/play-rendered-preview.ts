import type { SampleVariant } from '../lib/sample-search';

export async function playRenderedPreview(
  name: string,
  { index, rootNote }: Pick<SampleVariant, 'index' | 'rootNote'>,
  signal: AbortSignal,
  onEnded: () => void,
): Promise<void> {
  const { getAudioContext, getSound, initAudio, registerSynthSounds } = await import('superdough');
  signal.throwIfAborted();
  const context: AudioContext = getAudioContext();
  await context.resume();
  if (!getSound(name)) {
    if (name.startsWith('gm_')) (await import('../lib/soundfont-loader')).registerSoundfonts();
    else {
      await initAudio();
      registerSynthSounds();
    }
  }
  signal.throwIfAborted();
  const sound = getSound(name);
  if (!sound) throw new Error('Unknown sound: ' + name);
  const output = context.createGain();
  output.connect(context.destination);
  const disconnect = () => output.disconnect();
  signal.addEventListener('abort', disconnect, { once: true });
  try {
    const value = { s: name, ...(name.startsWith('gm_') || name === 'bytebeat' ? { n: index } : {}),
      ...(rootNote && { note: rootNote }), duration: 0.5 };
    const voice = await sound.onTrigger(context.currentTime + 0.05, value, () => {
      signal.removeEventListener('abort', disconnect);
      disconnect();
      onEnded();
    });
    signal.throwIfAborted();
    if (!voice?.node) throw new Error('Unable to play sound: ' + name);
    voice.node.connect(output);
  } catch (error) {
    signal.removeEventListener('abort', disconnect);
    disconnect();
    throw error;
  }
}
