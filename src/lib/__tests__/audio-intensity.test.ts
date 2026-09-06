import { describe, expect, it } from 'vitest';
import { followIntensity, perceivedIntensity, type AudioSpectrum } from '../audio-intensity';

const BIN_COUNT = 256;
const NYQUIST = 24000;

/** A spectrum with `level` (0..255) in the given band and silence everywhere else. */
function spectrumIn(fromHz: number, toHz: number, level = 255, nyquistHz = NYQUIST): AudioSpectrum {
  const bins = new Uint8Array(BIN_COUNT);
  const binHz = nyquistHz / BIN_COUNT;
  for (let index = 0; index < BIN_COUNT; index += 1) {
    const hz = index * binHz;
    if (hz >= fromHz && hz < toHz) bins[index] = level;
  }
  return { bins, nyquistHz };
}

describe('perceivedIntensity', () => {
  it('reads silence as nothing at all', () => {
    expect(perceivedIntensity({ bins: new Uint8Array(BIN_COUNT), nyquistHz: NYQUIST })).toBe(0);
  });

  it('reads a spectrum pinned everywhere as the top of the scale', () => {
    expect(perceivedIntensity(spectrumIn(0, NYQUIST))).toBe(1);
  });

  it('hears the middle of the spectrum more loudly than the bottom of it', () => {
    // Same electrical level, different bands: a sub-bass-only passage must not
    // read as loud as one carrying the frequencies the ear is built for.
    const midrange = perceivedIntensity(spectrumIn(500, 2000));
    const subBass = perceivedIntensity(spectrumIn(20, 120));
    expect(midrange).toBeGreaterThan(subBass);
  });

  it('rises with level within one band', () => {
    let previous = -1;
    for (const level of [0, 64, 128, 192, 255]) {
      const intensity = perceivedIntensity(spectrumIn(120, 6000, level));
      expect(intensity).toBeGreaterThanOrEqual(previous);
      previous = intensity;
    }
    expect(previous).toBeGreaterThan(0);
  });

  it('reads the same music the same way at a different sample rate', () => {
    // The bands are frequencies, not bin indices, so a 44.1kHz context and a
    // 48kHz one must not disagree about how loud the same passage is.
    const at48k = perceivedIntensity(spectrumIn(120, 6000, 255, 24000));
    const at44k = perceivedIntensity(spectrumIn(120, 6000, 255, 22050));
    expect(at48k).toBeCloseTo(at44k, 2);
  });

  it('stays inside 0..1 and shrugs off a spectrum it cannot read', () => {
    expect(perceivedIntensity({ bins: new Uint8Array(0), nyquistHz: NYQUIST })).toBe(0);
    expect(perceivedIntensity({ bins: new Uint8Array(BIN_COUNT), nyquistHz: 0 })).toBe(0);
    expect(perceivedIntensity(spectrumIn(0, NYQUIST))).toBeLessThanOrEqual(1);
  });
});

describe('followIntensity', () => {
  it('rises faster than it falls', () => {
    // Loudness is an impression: a hit registers at once, and the sense of a
    // busy passage has to survive the gaps between its hits.
    const up = followIntensity(0, 1, 100);
    const down = 1 - followIntensity(1, 0, 100);
    expect(up).toBeGreaterThan(down);
  });

  it('converges on the target from either side', () => {
    let rising = 0;
    let falling = 1;
    // Long enough for the slow side — the release is several times the attack.
    for (let step = 0; step < 200; step += 1) {
      rising = followIntensity(rising, 1, 33);
      falling = followIntensity(falling, 0, 33);
    }
    expect(rising).toBeCloseTo(1, 3);
    expect(falling).toBeCloseTo(0, 3);
  });

  it('follows the same curve whatever the frame rate', () => {
    // Two 8ms frames have to land where one 16ms frame does, or the ballistics
    // would quietly change with the machine the effect is running on.
    const oneStep = followIntensity(0.2, 0.9, 16);
    const twoSteps = followIntensity(followIntensity(0.2, 0.9, 8), 0.9, 8);
    expect(twoSteps).toBeCloseTo(oneStep, 6);
  });

  it('holds still when no time has passed', () => {
    expect(followIntensity(0.42, 1, 0)).toBe(0.42);
    expect(followIntensity(0.42, 1, -5)).toBe(0.42);
  });
});
