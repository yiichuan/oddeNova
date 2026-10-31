import { readFileSync } from 'node:fs';
import { createContext, runInContext } from 'node:vm';
import { describe, expect, it, vi } from 'vitest';

function extractFunction(source: string, name: string): string {
  const match = source.match(new RegExp(`^([ \\t]*)function ${name}\\([^)]*\\) \\{`, 'm'))!;
  const start = match.index!;
  const end = source.indexOf(`\n${match[1]}}`, start) + match[1].length + 2;
  return source.slice(start, end);
}

describe.each([
  new URL('./galaxy.html', import.meta.url),
  new URL('../../public/animation/galaxy-ascii.html', import.meta.url),
])('visualizer audio connection: %s', (file) => {
  it('ignores offline rendering and reconnects when a live context returns', () => {
    const source = readFileSync(file, 'utf8');
    // Execute the actual connection function without booting WebGL or a browser.
    const connect = extractFunction(source, 'tryConnectAudio');
    const offline = { startRendering: vi.fn(), createAnalyser: vi.fn() };
    const analyser = { frequencyBinCount: 512 };
    const live = { sampleRate: 48000, createAnalyser: vi.fn(() => analyser) };
    let active: typeof offline | typeof live = offline;
    const tap = { connect: vi.fn() };
    const getController = vi.fn(() => ({ output: { destinationGain: tap } }));
    const host = { getAudioContext: () => active, getSuperdoughAudioController: getController };
    const context = createContext({
      window: { parent: host }, getHostWindow: () => host,
      clamp: (value: number) => value, MAX_OUTPUT_LATENCY: 1,
    });
    runInContext(`let audioConnected = false, analyser = null, analyserSource = null, dataArray = null, outputLatency = 0; const bands = []; ${connect}`, context);
    runInContext('tryConnectAudio()', context);
    expect(offline.createAnalyser).not.toHaveBeenCalled();
    expect(getController).not.toHaveBeenCalled();
    expect(runInContext('audioConnected', context)).toBe(false);

    active = live;
    runInContext('tryConnectAudio()', context);
    expect(live.createAnalyser).toHaveBeenCalledOnce();
    expect(tap.connect).toHaveBeenCalledWith(analyser);
    expect(runInContext('audioConnected', context)).toBe(true);
  });
});

it('clears the particle galaxy response when a previously connected context becomes unavailable', () => {
  const source = readFileSync(new URL('./galaxy.html', import.meta.url), 'utf8');
  const readSpectrum = vi.fn();
  const context = createContext({ readSpectrum });
  runInContext(`
    let simAudio = null, audioConnected = true, dataArray = new Uint8Array(512);
    let analyser = { context: { startRendering() {} }, getByteFrequencyData: readSpectrum };
    const audioParams = { low: 1, mid: 1, high: 1 };
    ${extractFunction(source, 'updateAudio')}
    updateAudio();
  `, context);
  expect(readSpectrum).not.toHaveBeenCalled();
  expect(runInContext('audioConnected', context)).toBe(false);
  expect(runInContext('JSON.stringify(audioParams)', context)).toBe('{"low":0,"mid":0,"high":0}');
});
