import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import {
  ACCENT_SHARE_MAX,
  ACCENT_SHARE_MIN,
  PARTICLE_ACCENT_COLOR,
  PARTICLE_BLUR_ALPHA_GAIN,
  PARTICLE_BLUR_LEVELS,
  PARTICLE_COUNT,
  PARTICLE_GLYPHS,
  PARTICLE_MIN_BLUR,
  type AccentShares,
  accentShareFor,
  createParticles,
  particleAccentAt,
  particleDotRadius,
  particleFrameAt,
  resolveParticleField,
  shapedBlur,
  transitionEffectFor,
  windAt,
} from '../control-bar-particles';

const BAR_WIDTH = 900;
const BAR_HEIGHT = 48;
const FIELD = resolveParticleField(BAR_WIDTH, BAR_HEIGHT);

describe('PARTICLE_GLYPHS', () => {
  it('is the visualizer ramp minus its blank sentinels — all 24 of them', () => {
    // The two cannot share a module — galaxy-ascii.html is a standalone
    // document served to an iframe — so this guards against the bar drifting
    // into a different alphabet from the pane it stands in for.
    const source = readFileSync(
      resolve(__dirname, '../../../public/animation/galaxy-ascii.html'),
      'utf8',
    );
    const declaration = source.match(/const ASCII_RAMP = \[([\s\S]*?)\];/);
    expect(declaration).not.toBeNull();
    const ramp = [...declaration![1].matchAll(/'(.*?)'/g)].map((match) => match[1]);

    expect(PARTICLE_GLYPHS).toHaveLength(24);
    expect([...PARTICLE_GLYPHS]).toEqual(ramp.filter((glyph) => glyph !== ' '));
  });
});

describe('resolveParticleField', () => {
  it('matches the light field box — inset -18px -3% in index.css', () => {
    expect(FIELD.left).toBeCloseTo(-27, 6);
    expect(FIELD.top).toBe(-18);
    expect(FIELD.width).toBeCloseTo(954, 6);
    expect(FIELD.height).toBe(84);
  });

  it('overhangs the bar top and bottom, so the fall wraps out of sight', () => {
    expect(FIELD.top).toBeLessThan(0);
    expect(FIELD.top + FIELD.height).toBeGreaterThan(BAR_HEIGHT);
  });
});

describe('createParticles', () => {
  it('builds the requested population', () => {
    expect(createParticles()).toHaveLength(PARTICLE_COUNT);
    expect(createParticles(12)).toHaveLength(12);
  });

  it('is deterministic, so collapsing twice deals the same hand', () => {
    expect(createParticles()).toEqual(createParticles());
  });

  it('puts exactly one flake in each column and each row stratum', () => {
    const particles = createParticles();
    const columns = particles.map((particle) => Math.floor(particle.baseX * PARTICLE_COUNT));
    const rows = particles.map((particle) => Math.floor(particle.baseY * PARTICLE_COUNT));
    expect(new Set(columns).size).toBe(PARTICLE_COUNT);
    expect(new Set(rows).size).toBe(PARTICLE_COUNT);
  });

  it('leaves no bald patch across the bar', () => {
    const xs = createParticles().map((particle) => particle.baseX).sort((a, b) => a - b);
    const gaps = xs.slice(1).map((x, index) => x - xs[index]);
    // Perfectly even spacing would be 1/count. Stratification caps the worst
    // gap at twice that; independent random positions routinely triple it.
    expect(Math.max(...gaps)).toBeLessThan(2 / PARTICLE_COUNT);
  });

  it('does not sweep heavy glyphs to one side', () => {
    // Glyphs are dealt by index and columns are assigned by index too, so the
    // two orders have to be shuffled apart — otherwise the bar reads as a
    // repeating heavy-to-light gradient every 24 flakes.
    const particles = createParticles();
    const leftWeight = particles
      .filter((particle) => particle.baseX < 0.5)
      .reduce((total, particle) => total + particle.glyphIndex, 0);
    const rightWeight = particles
      .filter((particle) => particle.baseX >= 0.5)
      .reduce((total, particle) => total + particle.glyphIndex, 0);
    const imbalance = Math.abs(leftWeight - rightWeight) / (leftWeight + rightWeight);
    expect(imbalance).toBeLessThan(0.2);
  });

  it('does not line the flakes up on a diagonal', () => {
    // The failure mode if both axes shared one shuffle.
    const particles = createParticles();
    const offsets = particles.map((particle) => Math.abs(particle.baseX - particle.baseY));
    const mean = offsets.reduce((total, offset) => total + offset, 0) / offsets.length;
    expect(mean).toBeGreaterThan(0.2);
  });

  it('puts every glyph in the ramp on screen', () => {
    const used = new Set(createParticles().map((particle) => particle.glyphIndex));
    expect(used.size).toBe(PARTICLE_GLYPHS.length);
  });

  it('places heavy glyphs nearer than light ones', () => {
    const particles = createParticles();
    const averageDepth = (glyphIndex: number) => {
      const matches = particles.filter((particle) => particle.glyphIndex === glyphIndex);
      return matches.reduce((total, particle) => total + particle.depth, 0) / matches.length;
    };
    // '·' is the lightest glyph, 'Ω' the heaviest.
    expect(averageDepth(PARTICLE_GLYPHS.length - 1)).toBeLessThan(averageDepth(0));
  });

  it('spans the depth range rather than clustering on one plane', () => {
    const depths = createParticles().map((particle) => particle.depth);
    expect(Math.min(...depths)).toBeLessThan(0.15);
    expect(Math.max(...depths)).toBeGreaterThan(0.85);
  });

  it('falls downward only — snow does not drift back up', () => {
    expect(createParticles().every((particle) => particle.fallSpeed > 0)).toBe(true);
  });

  it('drops near flakes faster than far ones', () => {
    const particles = createParticles();
    const near = particles.reduce((best, p) => (p.depth < best.depth ? p : best));
    const far = particles.reduce((best, p) => (p.depth > best.depth ? p : best));
    expect(near.fallSpeed).toBeGreaterThan(far.fallSpeed);
  });

  it('leaves every flake room to breathe in both directions', () => {
    const maxBlur = PARTICLE_BLUR_LEVELS[PARTICLE_BLUR_LEVELS.length - 1];
    for (const particle of createParticles()) {
      expect(particle.blurCenter).toBeGreaterThan(0);
      expect(particle.blurCenter).toBeLessThan(maxBlur);
      expect(particle.blurSwing).toBeGreaterThan(0);
    }
  });
});

describe('windAt', () => {
  it('stays within the normalised range', () => {
    for (let time = 0; time < 600; time += 0.25) {
      expect(Math.abs(windAt(time))).toBeLessThanOrEqual(1);
    }
  });

  it('blows both ways and reaches real strength in each', () => {
    const samples = Array.from({ length: 2400 }, (_, step) => windAt(step * 0.25));
    expect(Math.min(...samples)).toBeLessThan(-0.7);
    expect(Math.max(...samples)).toBeGreaterThan(0.7);
  });

  it('gusts rather than pulses — it does not repeat on any single period', () => {
    // Every term would have to line up again for the wind to loop, so stepping
    // by any one term's period must land somewhere else. A single step can
    // land close by chance; over several it cannot.
    for (const period of [6.9, 17.4, 31]) {
      const deviations = [1, 2, 3, 4, 5].map(
        (multiple) => Math.abs(windAt(period * multiple) - windAt(0)),
      );
      expect(Math.max(...deviations)).toBeGreaterThan(0.15);
    }
  });

  it('changes slowly enough to read as air, not as jitter', () => {
    for (let time = 0; time < 300; time += 1 / 30) {
      expect(Math.abs(windAt(time + 1 / 30) - windAt(time))).toBeLessThan(0.02);
    }
  });
});

describe('wind coherence', () => {
  const particles = createParticles();

  it('leans the whole field the same way at once', () => {
    // This is what separates wind from noise: at any instant every flake is
    // displaced in the same direction, only by differing amounts.
    for (const time of [3, 11, 24, 40, 63]) {
      const offsets = particles.map((particle) => {
        const column = FIELD.left + particle.baseX * FIELD.width;
        return particleFrameAt(particle, time, FIELD).x - column;
      });
      const windSign = Math.sign(windAt(time));
      const agreeing = offsets.filter((offset) => Math.sign(offset) === windSign);
      expect(agreeing.length).toBeGreaterThan(particles.length * 0.6);
    }
  });

  it('pushes near flakes further than far ones', () => {
    const near = particles.reduce((best, p) => (p.depth < best.depth ? p : best));
    const far = particles.reduce((best, p) => (p.depth > best.depth ? p : best));
    expect(near.windAmplitude).toBeGreaterThan(far.windAmplitude);
  });
});

describe('transitionEffectFor', () => {
  const particles = createParticles();
  const near = particles.reduce((best, p) => (p.depth < best.depth ? p : best));
  const far = particles.reduce((best, p) => (p.depth > best.depth ? p : best));

  it('is a no-op without a transition', () => {
    expect(transitionEffectFor(near, null)).toEqual({ offsetY: 0, alphaScale: 1, blurBoost: 0 });
    expect(transitionEffectFor(near, undefined)).toEqual({ offsetY: 0, alphaScale: 1, blurBoost: 0 });
  });

  it('starts an entrance below the bar and invisible', () => {
    // The flakes come up from the visualizer pane the bar has just replaced,
    // so they enter through the bottom edge, not the top.
    const start = transitionEffectFor(near, { entering: true, progress: 0 });
    expect(start.offsetY).toBeCloseTo(near.inertiaLag, 6);
    expect(start.alphaScale).toBe(0);
  });

  it('settles an entrance exactly onto its resting place', () => {
    // Exactly, not nearly: the handover to the steady state happens on the
    // frame the flake stops moving, where any residual reads as a snap.
    for (const particle of particles) {
      // Signed zero is fine here, so compare by value rather than by Object.is.
      expect(transitionEffectFor(particle, { entering: true, progress: 1 }).offsetY)
        .toBeCloseTo(0, 12);
    }
    const end = transitionEffectFor(near, { entering: true, progress: 1 });
    expect(end.alphaScale).toBe(1);
    expect(end.blurBoost).toBe(0);
  });

  it('overshoots once on the way in, and only slightly', () => {
    const samples = Array.from({ length: 101 }, (_, step) =>
      transitionEffectFor(near, { entering: true, progress: step / 100 }).offsetY);
    // Starts below (positive), rises, and passes above its resting place.
    expect(Math.max(...samples)).toBeCloseTo(near.inertiaLag, 6);
    expect(Math.min(...samples)).toBeLessThan(-0.5);

    // The rise is the gesture; the rebound is punctuation. Let it grow much
    // past a tenth of the travel and the arrival reads as a wobble instead.
    const rebound = -Math.min(...samples);
    expect(rebound / near.inertiaLag).toBeLessThan(0.1);
  });

  it('spends most of the entrance travelling, not creeping', () => {
    // Damping high enough to kill the rebound can also finish the rise in the
    // first fifth of the transition and idle through the rest. The crossing
    // back through the resting place is where the sweep ends, and it should
    // land past the first quarter.
    const crossing = Array.from({ length: 100 }, (_, step) => (step + 1) / 100)
      .find((progress) => transitionEffectFor(near, { entering: true, progress }).offsetY <= 0)!;
    expect(crossing).toBeGreaterThan(0.25);
  });

  it('sends the flakes back the way they came', () => {
    // In from below, out through the same edge — one population commuting
    // between the bar and the pane underneath it, not two separate effects.
    const arriving = transitionEffectFor(near, { entering: true, progress: 0 }).offsetY;
    const departed = transitionEffectFor(near, { entering: false, progress: 1 }).offsetY;
    expect(arriving).toBeGreaterThan(0);
    expect(departed).toBeGreaterThan(0);
  });

  it('sinks a departure out of frame, still accelerating', () => {
    const offsetAt = (progress: number) =>
      transitionEffectFor(near, { entering: false, progress }).offsetY;

    expect(offsetAt(0)).toBe(0);
    expect(offsetAt(0.25)).toBeGreaterThan(0);
    // Free fall: the second half covers three times the ground of the first.
    expect(offsetAt(1) - offsetAt(0.5)).toBeGreaterThan((offsetAt(0.5) - offsetAt(0)) * 2.5);
    expect(transitionEffectFor(near, { entering: false, progress: 1 }).alphaScale).toBe(0);
  });

  it('gives heavy near flakes more momentum than distant specks', () => {
    expect(near.inertiaLag).toBeGreaterThan(far.inertiaLag);
    // Lower damping: they take longer to stop moving.
    expect(near.springDamping).toBeLessThan(far.springDamping);
  });

  it('moves far enough to be seen — past the bar, not within it', () => {
    // The whole point of the inertia. Displacement that fits inside the 48px
    // bar reads as a nudge; near flakes have to start clear below the bottom
    // edge and vault in, and leave by sinking clear of it again.
    expect(near.inertiaLag).toBeGreaterThan(BAR_HEIGHT * 1.5);
    const departed = transitionEffectFor(near, { entering: false, progress: 1 }).offsetY;
    expect(departed).toBeGreaterThan(BAR_HEIGHT * 2);
  });

  it('has the flakes visible through the fast part of the drop', () => {
    // A fade that lags the movement hides the movement. By the time a flake has
    // covered half its lag it should already be well on its way in.
    const halfway = Array.from({ length: 100 }, (_, step) => (step + 1) / 100)
      .find((progress) => {
        const { offsetY } = transitionEffectFor(near, { entering: true, progress });
        return Math.abs(offsetY) < near.inertiaLag / 2;
      })!;
    expect(transitionEffectFor(near, { entering: true, progress: halfway }).alphaScale)
      .toBeGreaterThan(0.4);
  });

  it('blurs with speed — fastest entering, fastest leaving', () => {
    expect(transitionEffectFor(near, { entering: true, progress: 0 }).blurBoost)
      .toBeGreaterThan(transitionEffectFor(near, { entering: true, progress: 0.8 }).blurBoost);
    expect(transitionEffectFor(near, { entering: false, progress: 1 }).blurBoost)
      .toBeGreaterThan(transitionEffectFor(near, { entering: false, progress: 0.2 }).blurBoost);
  });

  it('folds into the frame it is applied to', () => {
    const field = FIELD;
    const steady = particleFrameAt(near, 4, field);
    const arriving = particleFrameAt(near, 4, field, { entering: true, progress: 0 });
    const settled = particleFrameAt(near, 4, field, { entering: true, progress: 1 });

    expect(arriving.y).toBeGreaterThan(steady.y);
    expect(arriving.alpha).toBe(0);
    expect(settled.y).toBeCloseTo(steady.y, 6);
    expect(settled.alpha).toBeCloseTo(steady.alpha, 6);
    // Horizontal motion belongs to the wind; inertia is vertical only.
    expect(arriving.x).toBeCloseTo(steady.x, 6);
  });
});

describe('accentShareFor', () => {
  it('spans the quietest and loudest the field is allowed to get', () => {
    expect(accentShareFor(0)).toBeCloseTo(ACCENT_SHARE_MIN, 6);
    expect(accentShareFor(1)).toBeCloseTo(ACCENT_SHARE_MAX, 6);
    expect(ACCENT_SHARE_MIN).toBe(0.18);
    expect(ACCENT_SHARE_MAX).toBe(0.78);
  });

  it('rises with the music and never leaves the band', () => {
    let previous = -Infinity;
    for (let intensity = 0; intensity <= 1; intensity += 0.05) {
      const share = accentShareFor(intensity);
      expect(share).toBeGreaterThan(previous);
      previous = share;
    }
    // A reading that overshoots — a clipping mix, or a caller passing raw
    // amplitude — must not take the field past its ceiling or below its floor.
    expect(accentShareFor(4)).toBeCloseTo(ACCENT_SHARE_MAX, 6);
    expect(accentShareFor(-2)).toBeCloseTo(ACCENT_SHARE_MIN, 6);
  });
});

describe('particleAccentAt', () => {
  const particles = createParticles();
  const evenly = (share: number): AccentShares => ({ previous: share, current: share });
  const litAt = (beatPosition: number, shares?: AccentShares) =>
    particles.filter((particle) => particleAccentAt(particle, beatPosition, shares) > 0.5);
  const litCountAt = (beatPosition: number, shares?: AccentShares) =>
    litAt(beatPosition, shares).length;

  it('is the app accent, #CD5633', () => {
    expect(PARTICLE_ACCENT_COLOR).toBe('205, 86, 51');
  });

  it('leaves the field white when nothing is playing', () => {
    for (const particle of particles) {
      expect(particleAccentAt(particle, null)).toBe(0);
    }
  });

  it('sits at its quietest for a caller with no audio to listen to', () => {
    for (const particle of particles) {
      expect(particleAccentAt(particle, 6.5))
        .toBe(particleAccentAt(particle, 6.5, evenly(ACCENT_SHARE_MIN)));
    }
  });

  it('lights more of the field the louder the piece sounds', () => {
    let quietTotal = 0;
    let loudTotal = 0;
    for (let beat = 0; beat < 200; beat += 1) {
      const quiet = litCountAt(beat + 0.5, evenly(accentShareFor(0)));
      const loud = litCountAt(beat + 0.5, evenly(accentShareFor(1)));
      quietTotal += quiet;
      loudTotal += loud;
      // Neither end may collapse: silence still has to look like music playing,
      // and a full bar has nowhere left to go.
      expect(quiet).toBeGreaterThan(0);
      expect(loud).toBeLessThan(particles.length);
      expect(loud).toBeGreaterThan(quiet);
    }
    expect(quietTotal / 200 / particles.length).toBeCloseTo(ACCENT_SHARE_MIN, 1);
    expect(loudTotal / 200 / particles.length).toBeCloseTo(ACCENT_SHARE_MAX, 1);
  });

  it('recruits flakes as it swells rather than reshuffling them', () => {
    // Growth has to be additive, or every change in loudness would scatter the
    // colour somewhere else and the swell would read as noise.
    for (let beat = 0; beat < 40; beat += 1) {
      let previous = new Set(litAt(beat + 0.5, evenly(accentShareFor(0))));
      for (let intensity = 0.2; intensity <= 1; intensity += 0.2) {
        const next = new Set(litAt(beat + 0.5, evenly(accentShareFor(intensity))));
        for (const particle of previous) expect(next.has(particle)).toBe(true);
        previous = next;
      }
    }
  });

  it('holds the outgoing beat at the share it was drawn with', () => {
    // A swell arriving now must not light flakes retroactively in the set that
    // is on its way out — that set is mid-crossfade and already on screen.
    const quiet = accentShareFor(0);
    const loud = accentShareFor(1);
    const swelling = litAt(9.02, { previous: quiet, current: loud });
    const alreadyLoud = litAt(9.02, { previous: loud, current: loud });
    expect(swelling.length).toBeLessThan(alreadyLoud.length);
  });

  it('holds the same set for the length of a beat', () => {
    // Within one beat the colour must not wander, or it stops reading as
    // something that happens *on* the beat.
    for (const particle of particles) {
      const settled = particleAccentAt(particle, 8.5);
      for (const phase of [0.4, 0.6, 0.75, 0.99]) {
        expect(particleAccentAt(particle, 8 + phase)).toBeCloseTo(settled, 6);
      }
    }
  });

  it('hands the colour to a different set on the next beat', () => {
    const litOn = (beat: number) => new Set(
      particles.filter((particle) => particleAccentAt(particle, beat + 0.5) > 0.5),
    );
    let changes = 0;
    for (let beat = 0; beat < 40; beat += 1) {
      const before = litOn(beat);
      const after = litOn(beat + 1);
      if ([...after].some((particle) => !before.has(particle))) changes += 1;
    }
    expect(changes).toBeGreaterThan(35);
  });

  it('crossfades the handover rather than snapping it', () => {
    const changing = particles.find((particle) =>
      particleAccentAt(particle, 3.9) < 0.01 && particleAccentAt(particle, 4.9) > 0.99)!;
    expect(changing).toBeDefined();

    const midway = particleAccentAt(changing, 4.16);
    expect(midway).toBeGreaterThan(0.05);
    expect(midway).toBeLessThan(0.95);
  });

  it('completes the handover well inside the beat', () => {
    // Landing on the beat means arriving early in it, not smearing across it.
    for (const particle of particles) {
      expect(particleAccentAt(particle, 12.4)).toBeCloseTo(particleAccentAt(particle, 12.9), 6);
    }
  });

  it('stays in 0..1 throughout', () => {
    for (let beat = 0; beat < 60; beat += 0.05) {
      for (const particle of particles) {
        const accent = particleAccentAt(particle, beat);
        expect(accent).toBeGreaterThanOrEqual(0);
        expect(accent).toBeLessThanOrEqual(1);
      }
    }
  });

  it('shrugs off a nonsense beat position', () => {
    expect(particleAccentAt(particles[0], Number.NaN)).toBe(0);
    expect(particleAccentAt(particles[0], Number.POSITIVE_INFINITY)).toBe(0);
  });
});

describe('PARTICLE_BLUR_ALPHA_GAIN', () => {
  it('compensates more the softer the flake gets', () => {
    expect(PARTICLE_BLUR_ALPHA_GAIN).toHaveLength(PARTICLE_BLUR_LEVELS.length);
    expect(PARTICLE_BLUR_ALPHA_GAIN[0]).toBe(1);
    for (let level = 1; level < PARTICLE_BLUR_ALPHA_GAIN.length; level += 1) {
      expect(PARTICLE_BLUR_ALPHA_GAIN[level]).toBeGreaterThan(PARTICLE_BLUR_ALPHA_GAIN[level - 1]);
    }
  });
});

describe('particleFrameAt', () => {
  const particles = createParticles();

  it('blows sideways without sliding across the bar', () => {
    // Wind and flutter are free to move a flake a visible distance, but over
    // any stretch of time that has to stay a small fraction of the bar's
    // width — past that it stops reading as snow and starts reading as drift.
    for (const particle of particles) {
      const samples = Array.from({ length: 240 }, (_, step) =>
        particleFrameAt(particle, step * 0.5, FIELD));
      const xs = samples.map((sample) => sample.x);
      expect(Math.max(...xs) - Math.min(...xs)).toBeLessThan(FIELD.width * 0.12);
    }
  });

  it('keeps each flake near the column it fell into', () => {
    for (const particle of particles) {
      const reach = particle.flutterAmplitude + particle.windAmplitude;
      for (let time = 0; time < 300; time += 3) {
        const { x } = particleFrameAt(particle, time, FIELD);
        const column = FIELD.left + particle.baseX * FIELD.width;
        expect(Math.abs(x - column)).toBeLessThanOrEqual(reach + 1e-6);
      }
    }
  });

  it('covers the full height of the field as it wraps', () => {
    const particle = particles[0];
    const ys = Array.from({ length: 200 }, (_, step) =>
      particleFrameAt(particle, step * 0.4, FIELD).y);
    expect(Math.min(...ys)).toBeLessThan(0);
    expect(Math.max(...ys)).toBeGreaterThan(BAR_HEIGHT);
  });

  it('wraps out of sight, so no flake pops inside the visible bar', () => {
    // A wrap moves a flake the whole height of the field in one frame. That
    // jump must happen in the margins the bar clips, never on screen.
    for (const particle of particles) {
      let previous = particleFrameAt(particle, 0, FIELD).y;
      for (let time = 1 / 30; time < 120; time += 1 / 30) {
        const { y } = particleFrameAt(particle, time, FIELD);
        if (Math.abs(y - previous) > FIELD.height / 2) {
          expect(Math.min(previous, y)).toBeLessThan(0);
          expect(Math.max(previous, y)).toBeGreaterThan(BAR_HEIGHT);
        }
        previous = y;
      }
    }
  });

  it('breathes each flake through several focus levels', () => {
    for (const particle of particles) {
      const levels = new Set<number>();
      for (let time = 0; time < 40; time += 0.25) {
        levels.add(particleFrameAt(particle, time, FIELD).blurLevel);
      }
      expect(levels.size).toBeGreaterThanOrEqual(3);
    }
  });

  it('gives every flake its own breathing phase, so they do not pulse in unison', () => {
    const atZero = particles.map((particle) => particleFrameAt(particle, 0, FIELD).blurLevel);
    expect(new Set(atZero).size).toBeGreaterThan(3);
  });

  it('keeps the blur level addressable at all times', () => {
    for (let time = 0; time < 200; time += 1.7) {
      for (const particle of particles) {
        const { blurLevel } = particleFrameAt(particle, time, FIELD);
        expect(blurLevel).toBeGreaterThanOrEqual(0);
        expect(blurLevel).toBeLessThan(PARTICLE_BLUR_LEVELS.length);
      }
    }
  });

  it('never goes fully transparent or over-bright', () => {
    for (let time = 0; time < 200; time += 3) {
      for (const particle of particles) {
        const { alpha } = particleFrameAt(particle, time, FIELD);
        expect(alpha).toBeGreaterThan(0.05);
        expect(alpha).toBeLessThanOrEqual(1);
      }
    }
  });
});

describe('the dot field', () => {
  const particles = createParticles();
  const floorLevel = Math.round(PARTICLE_MIN_BLUR.dot / PARTICLE_BLUR_LEVELS[1]);

  it('sizes a mote by the glyph slot it replaces, so weight still reads as depth', () => {
    const radii = PARTICLE_GLYPHS.map((_, index) => particleDotRadius(index));
    for (let index = 1; index < radii.length; index += 1) {
      expect(radii[index]).toBeGreaterThan(radii[index - 1]);
    }
    // Nothing sub-pixel at the far end: the depth blur spreads a mote over
    // several times its own area, and a smaller one would simply vanish.
    expect(radii[0]).toBeGreaterThan(1);
  });

  it('never lets a mote come fully into focus', () => {
    for (let time = 0; time < 200; time += 1.3) {
      for (const particle of particles) {
        const { blurLevel } = particleFrameAt(particle, time, FIELD, null, 'dot');
        expect(PARTICLE_BLUR_LEVELS[blurLevel]).toBeGreaterThanOrEqual(PARTICLE_MIN_BLUR.dot);
      }
    }
  });

  it('holds the floor through a transition, when the blur is being pushed around', () => {
    for (const entering of [true, false]) {
      for (let progress = 0; progress <= 1; progress += 0.05) {
        for (const particle of particles) {
          const { blurLevel } = particleFrameAt(
            particle, 7.5, FIELD, { entering, progress }, 'dot',
          );
          expect(blurLevel).toBeGreaterThanOrEqual(floorLevel);
        }
      }
    }
  });

  it('keeps breathing above that floor rather than pinning to it', () => {
    // Clipping at the floor would flatten precisely the near motes — their
    // focus rests just below it — so the largest, closest ones would be the
    // ones that stopped moving. Compressing the ladder keeps them alive.
    for (const particle of particles) {
      const levels = new Set<number>();
      for (let time = 0; time < 40; time += 0.25) {
        levels.add(particleFrameAt(particle, time, FIELD, null, 'dot').blurLevel);
      }
      expect(levels.size).toBeGreaterThanOrEqual(3);
    }
  });

  it('leaves the glyph field sharp, and everything else about a flake alone', () => {
    for (const particle of particles) {
      const glyph = particleFrameAt(particle, 6, FIELD);
      const dot = particleFrameAt(particle, 6, FIELD, null, 'dot');
      expect(dot.x).toBe(glyph.x);
      expect(dot.y).toBe(glyph.y);
      expect(dot.glyphIndex).toBe(glyph.glyphIndex);
      expect(dot.blurLevel).toBeGreaterThanOrEqual(glyph.blurLevel);
    }
    // Some flake, somewhere, is in sharp focus while the field draws glyphs.
    const sharp = particles.some((particle) => Array.from({ length: 80 }, (_, step) =>
      particleFrameAt(particle, step * 0.5, FIELD).blurLevel).includes(0));
    expect(sharp).toBe(true);
  });

  it('lifts and compresses the ladder instead of clipping it', () => {
    const max = PARTICLE_BLUR_LEVELS[PARTICLE_BLUR_LEVELS.length - 1];
    expect(shapedBlur(0, 'glyph')).toBe(0);
    expect(shapedBlur(0, 'dot')).toBeCloseTo(PARTICLE_MIN_BLUR.dot, 6);
    expect(shapedBlur(max, 'dot')).toBeCloseTo(max, 6);
    // Strictly increasing in between — the whole swing survives, scaled down.
    expect(shapedBlur(1, 'dot')).toBeGreaterThan(shapedBlur(0.5, 'dot'));
    expect(shapedBlur(0.5, 'dot')).toBeGreaterThan(shapedBlur(0, 'dot'));
  });
});
