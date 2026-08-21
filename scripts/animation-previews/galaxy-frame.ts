/**
 * Renders one frame of the WebGL galaxy without a GPU.
 *
 * `public/animation/galaxy.html` needs three.js, a WebGL context and a bloom
 * pass, none of which exist in node — so unlike the ASCII capture, this cannot
 * run the original script. Instead every piece of maths that decides what the
 * frame looks like is transcribed from it: the particle generation of
 * `setupSpiralVortex`, both shaders, the orbit in `updateCamera`, and the
 * uniform values `animate` feeds them at rest (no audio ⇒ uLow 0, uChaos at its
 * 0.2 rest value). Keep this in step with that file when the galaxy changes.
 *
 * Everything renders additively into a linear-light buffer, which is what the
 * GPU blends into, and bloom is applied over it the way UnrealBloomPass does:
 * threshold, then a pyramid of blurs summed back with falling weights.
 */

/** Mulberry32, so a rebuild reproduces the same galaxy. */
function seededRandom(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = Math.imul(state ^ (state >>> 15), 1 | state);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** What the animation itself draws, over a full pane. */
export const PANE_PARTICLE_COUNT = 350000;
/** `animate()` tunes point size and bloom to the pane height; 800px is its reference. */
const BLOOM_REFERENCE_HEIGHT = 800;
const CHAOS_AT_REST = 0.2;

interface Particle {
  x: number;
  y: number;
  z: number;
  radius: number;
  sizeSeed: number;
  /** aRandom.x: seeds the point size and the phase of the ambient height wave. */
  wavePhase: number;
  chaosX: number;
  chaosZ: number;
}

/**
 * Transcribed from setupSpiralVortex(). `count` below the pane's own 350k draws
 * a subsample of the same distribution: the arms and the core keep their shape,
 * there are just fewer stars in them.
 *
 * `armFocus` biases which stars survive that subsample. The animation gives
 * every star an `armBlend` — how far it commits to an arm rather than to a
 * random angle — and fills the space between the arms with the ones that commit
 * least: the pure random-angle population, the bridge wash, and the arm stars
 * out where armBlend has faded. At 350k those read as haze the arms sit in; at a
 * twentieth of that they read as scatter with no spiral left in it. Raising
 * armFocus drops them in favour of the stars that follow an arm, plus the
 * central bulge, which is a blob rather than an arm at any count. 0 keeps the
 * distribution exactly as the animation draws it.
 *
 * `armTightness` then narrows what is left. An arm is nearly a hundred degrees
 * wide at the rim, and the spiral wraps about one and a half turns across the
 * disk, so successive windings overlap into a filled disk — legible at 350k,
 * where density alone carries the pattern, but not at 20k. Below 1 it squeezes
 * the angular spread and jitter so the windings clear each other and the gaps
 * between them fall dark. 1 leaves the arms the width the animation gives them.
 */
function buildVortex(
  random: () => number,
  count: number,
  armFocus = 0,
  armTightness = 1,
): Particle[] {
  const particles: Particle[] = [];

  for (let i = 0; particles.length < count; i += 1) {
    // Rejection cannot stall: every iteration keeps the core with probability 1
    // near the centre. The cap is only a guard against a pathological armFocus.
    if (i > count * 500) break;
    const rand = random();
    const isArm = rand < 0.6;
    const isBridge = rand < 0.85;

    const u1 = random();
    const u2 = random();
    const skewed = Math.pow((u1 + u2) / 2, 1.6);
    const isCoreSample = random() < 0.008;
    const radius = isCoreSample ? 0.02 + Math.pow(random(), 1.6) * 2.8 : 0.02 + skewed * 27.98;

    const spiralAngle = Math.log(radius + 1) * 7;
    const innerBlend = Math.pow(Math.min(1, radius / 4.5), 1.5);
    const outerBlend = Math.max(0, 1 - Math.pow(Math.max(0, radius - 16) / 12, 0.6));
    const armBlend = innerBlend * outerBlend;
    const edgeScatter = Math.max(0, (radius - 15) / 13);
    const randomAngle = random() * Math.PI * 2;

    let finalAngle: number;

    if (isArm) {
      const armAngle = ((i % 2) / 2) * Math.PI * 2;
      const off = Math.pow(random(), 1.2) * (random() < 0.5 ? 1 : -1);
      const spread = 1.8 * Math.pow(radius / 28, 0.75) * armTightness;
      const jitter =
        ((random() - 0.5) * 0.7 * Math.pow(radius / 10, 0.5) +
          (random() - 0.5) * 0.3 * Math.pow(radius / 28, 0.3)) *
        armTightness;
      const structured =
        armAngle +
        spiralAngle +
        off * spread +
        jitter +
        (random() - 0.5) * edgeScatter * 2.5 * armTightness;
      finalAngle = randomAngle * (1 - armBlend) + structured * armBlend;
    } else if (isBridge) {
      const bridgeAngle = (((i % 2) + 0.5) / 2) * Math.PI * 2;
      const off = Math.pow(random(), 1.2) * (random() < 0.5 ? 1 : -1);
      const spread = 1.2 * Math.pow(radius / 28, 0.75);
      const jitter = (random() - 0.5) * 0.4 * Math.pow(radius / 10, 0.6);
      const structured =
        bridgeAngle + spiralAngle + off * spread + jitter + (random() - 0.5) * edgeScatter * 3;
      const bridgeBlend = armBlend * Math.min(1, radius / 8) * 0.6;
      finalAngle = randomAngle * (1 - bridgeBlend) + structured * bridgeBlend;
    } else {
      finalAngle = randomAngle;
    }

    if (isCoreSample) finalAngle = randomAngle;

    if (armFocus > 0) {
      // The bulge is kept whole; an arm star is kept as far as it commits.
      const coreWeight = 1 - smoothstep(1.5, 5, radius);
      const armWeight = isArm ? Math.pow(armBlend, armFocus) : 0;
      if (random() >= Math.max(coreWeight, armWeight)) continue;
    }

    const edgeFade = Math.max(0, (radius - 14) / 14);
    const finalRadius = radius + edgeFade * Math.pow(random(), 0.5) * 12;

    const yBase = Math.pow(radius / 28, 2) * 3.2;
    const ySpread = isArm
      ? 0.1 + Math.pow(radius / 28, 1.3) * 2.5
      : 0.15 + Math.pow(radius / 28, 1) * 1.8;

    const sizeRandom = 0.5 + random();
    const chaosDir = random() * Math.PI * 2;
    const chaosMag = finalRadius * 0.22 + 0.8;

    particles.push({
      x: Math.cos(finalAngle) * finalRadius * 1.6,
      y: yBase + (random() - 0.5) * ySpread,
      z: Math.sin(finalAngle) * finalRadius,
      radius,
      sizeSeed: sizeRandom * sizeRandom,
      wavePhase: sizeRandom,
      chaosX: Math.cos(chaosDir) * chaosMag,
      chaosZ: Math.sin(chaosDir) * chaosMag,
    });
  }

  return particles;
}

/** Transcribed from updateCamera(), with the overview blend at its resting 0. */
function cameraAt(time: number) {
  const r = 14.67 + Math.sin(time * 0.52) * 5;
  const azimuth = time * 0.088 + Math.sin(time * 0.44) * 0.45;
  const elevationPhase = time * 0.054;
  const elevation = elevationPhase - 0.4 * Math.sin(2 * elevationPhase);

  const cosEl = Math.cos(elevation);
  const sinEl = Math.sin(elevation);
  const cosAz = Math.cos(azimuth);
  const sinAz = Math.sin(azimuth);

  return {
    eye: [cosEl * sinAz * r, sinEl * r, cosEl * cosAz * r] as const,
    up: [-sinEl * sinAz, cosEl, -sinEl * cosAz] as const,
  };
}

function normalize([x, y, z]: readonly number[]): [number, number, number] {
  const length = Math.hypot(x, y, z) || 1;
  return [x / length, y / length, z / length];
}

function cross(a: readonly number[], b: readonly number[]): [number, number, number] {
  return [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
}

export function renderGalaxyFrame(options: {
  width: number;
  height: number;
  /** Stars to draw. Scale it with the pixel count or the frame turns to fog. */
  particleCount?: number;
  /** Bias the subsample toward stars that follow an arm; 0 keeps every population. */
  armFocus?: number;
  /** Narrow the arms so their windings clear each other; 1 is the animation's own width. */
  armTightness?: number;
  seed: number;
  time: number;
  /** Multiplies the additive accumulation before bloom and tone mapping. */
  exposure?: number;
  /** Box-filter the finished pane down to this size; defaults to no downscale. */
  outputWidth?: number;
  outputHeight?: number;
}): Uint8Array {
  const { width, height, time } = options;
  const exposure = options.exposure ?? 1;
  const particles = buildVortex(
    seededRandom(options.seed),
    options.particleCount ?? PANE_PARTICLE_COUNT,
    options.armFocus,
    options.armTightness,
  );

  const { eye, up } = cameraAt(time);
  // lookAt(0,0,0): z points back toward the camera, so a visible point has a
  // negative camera-space z — the sign the point-size shader relies on.
  const zAxis = normalize(eye);
  const xAxis = normalize(cross(up, zAxis));
  const yAxis = cross(zAxis, xAxis);

  const focal = 1 / Math.tan(((50 * Math.PI) / 180) / 2);
  const aspect = width / height;
  const pointScale = height / BLOOM_REFERENCE_HEIGHT;

  // The whole cloud spins; the shader sees the rotated position.
  const spin = -time * 0.06;
  const cosSpin = Math.cos(spin);
  const sinSpin = Math.sin(spin);

  const light = new Float32Array(width * height * 3);

  for (const particle of particles) {
    // Vertex shader: chaos displacement, then the ambient height wave.
    const px = particle.x + particle.chaosX * CHAOS_AT_REST;
    const pz = particle.z + particle.chaosZ * CHAOS_AT_REST;
    const py =
      particle.y + Math.sin(particle.radius * 0.3 + time * 0.15 + particle.wavePhase * 1.2) * 0.5;

    // Model rotation about y.
    const worldX = px * cosSpin + pz * sinSpin;
    const worldZ = -px * sinSpin + pz * cosSpin;

    const dx = worldX - eye[0];
    const dy = py - eye[1];
    const dz = worldZ - eye[2];

    const viewZ = zAxis[0] * dx + zAxis[1] * dy + zAxis[2] * dz;
    if (viewZ > -0.1) continue; // behind the camera or too close
    const viewX = xAxis[0] * dx + xAxis[1] * dy + xAxis[2] * dz;
    const viewY = yAxis[0] * dx + yAxis[1] * dy + yAxis[2] * dz;

    const screenX = ((focal / aspect) * (viewX / -viewZ) * 0.5 + 0.5) * width;
    const screenY = (1 - (focal * (viewY / -viewZ) * 0.5 + 0.5)) * height;
    const pointSize = particle.sizeSeed * 0.9 * (20 / -viewZ) * pointScale;
    if (pointSize <= 0) continue;

    // Fragment shader: colour by radius, intensity by brightness and core fade.
    const brightness = 1.4 / (particle.radius + 1.5);
    const baseIntensity = Math.min(0.9, Math.max(0.5, brightness));
    const coreFade = smoothstep(0, 12, particle.radius);
    const intensity = baseIntensity * coreFade + 0.28 * (1 - coreFade);

    const t1 = Math.min(1, Math.max(0, particle.radius / 10));
    const t2 = Math.min(1, Math.max(0, (particle.radius - 10) / 18));
    let red = 1 + (0.65 - 1) * t1;
    let green = 0.97 + (0.82 - 0.97) * t1;
    let blue = 0.92 + (1 - 0.92) * t1;
    red += (0.35 - red) * t2;
    green += (0.55 - green) * t2;
    blue += (0.9 - blue) * t2;

    splat(light, width, height, screenX, screenY, pointSize, [
      red * intensity * exposure,
      green * intensity * exposure,
      blue * intensity * exposure,
    ]);
  }

  addBloom(light, width, height, {
    threshold: 0.22,
    strength: 0.65 * Math.max(pointScale, 0.5),
    radius: 0.5 * Math.min(pointScale, 1),
  });

  return toSrgb(light, width, height, options.outputWidth ?? width, options.outputHeight ?? height);
}

function smoothstep(edge0: number, edge1: number, x: number): number {
  const t = Math.min(1, Math.max(0, (x - edge0) / (edge1 - edge0)));
  return t * t * (3 - 2 * t);
}

/**
 * One additive point sprite. Sub-pixel points are what most of the cloud is, and
 * the GPU still lights a whole fragment for them, so they are spread over the
 * pixels they straddle instead of being dropped.
 */
function splat(
  light: Float32Array,
  width: number,
  height: number,
  centerX: number,
  centerY: number,
  size: number,
  color: readonly number[],
): void {
  if (size <= 1.5) {
    const x = Math.floor(centerX);
    const y = Math.floor(centerY);
    const fx = centerX - x - 0.5;
    const fy = centerY - y - 0.5;
    for (let oy = 0; oy <= 1; oy += 1) {
      for (let ox = 0; ox <= 1; ox += 1) {
        const px = x + (fx < 0 ? ox - 1 : ox);
        const py = y + (fy < 0 ? oy - 1 : oy);
        if (px < 0 || px >= width || py < 0 || py >= height) continue;
        const weightX = ox === 0 ? 1 - Math.abs(fx) : Math.abs(fx);
        const weightY = oy === 0 ? 1 - Math.abs(fy) : Math.abs(fy);
        const weight = weightX * weightY;
        const index = (py * width + px) * 3;
        light[index] += color[0] * weight;
        light[index + 1] += color[1] * weight;
        light[index + 2] += color[2] * weight;
      }
    }
    return;
  }

  const half = size / 2;
  const minX = Math.max(0, Math.floor(centerX - half));
  const maxX = Math.min(width - 1, Math.ceil(centerX + half));
  const minY = Math.max(0, Math.floor(centerY - half));
  const maxY = Math.min(height - 1, Math.ceil(centerY + half));

  for (let py = minY; py <= maxY; py += 1) {
    for (let px = minX; px <= maxX; px += 1) {
      const distance = Math.hypot(px + 0.5 - centerX, py + 0.5 - centerY) / size;
      if (distance > 0.5) continue;
      const alpha = Math.pow(1 - distance * 2, 4);
      const index = (py * width + px) * 3;
      light[index] += color[0] * alpha;
      light[index + 1] += color[1] * alpha;
      light[index + 2] += color[2] * alpha;
    }
  }
}

/** UnrealBloomPass in miniature: threshold, blur pyramid, weighted sum. */
function addBloom(
  light: Float32Array,
  width: number,
  height: number,
  options: { threshold: number; strength: number; radius: number },
): void {
  const bright = new Float32Array(light.length);
  for (let i = 0; i < light.length; i += 3) {
    const luminance = 0.2126 * light[i] + 0.7152 * light[i + 1] + 0.0722 * light[i + 2];
    if (luminance <= options.threshold) continue;
    const keep = (luminance - options.threshold) / luminance;
    bright[i] = light[i] * keep;
    bright[i + 1] = light[i + 1] * keep;
    bright[i + 2] = light[i + 2] * keep;
  }

  const factors = [1, 0.8, 0.6, 0.4, 0.2];
  // Annotated: `blur` hands back a Float32Array over any ArrayBufferLike, which
  // is wider than the ArrayBuffer-backed one `bright` is inferred as.
  let level: Float32Array = bright;
  let levelWidth = width;
  let levelHeight = height;

  for (let step = 0; step < factors.length; step += 1) {
    level = blur(level, levelWidth, levelHeight, 2);
    const factor = factors[step] + (1.2 - factors[step] - factors[step]) * options.radius;
    const weight = options.strength * factor;

    for (let y = 0; y < height; y += 1) {
      const sourceY = Math.min(levelHeight - 1, Math.floor((y * levelHeight) / height));
      for (let x = 0; x < width; x += 1) {
        const sourceX = Math.min(levelWidth - 1, Math.floor((x * levelWidth) / width));
        const source = (sourceY * levelWidth + sourceX) * 3;
        const target = (y * width + x) * 3;
        light[target] += level[source] * weight;
        light[target + 1] += level[source + 1] * weight;
        light[target + 2] += level[source + 2] * weight;
      }
    }

    const halved = downsample(level, levelWidth, levelHeight);
    level = halved.data;
    levelWidth = halved.width;
    levelHeight = halved.height;
  }
}

/** Separable box blur, run twice — close enough to a gaussian at this size. */
function blur(source: Float32Array, width: number, height: number, radius: number): Float32Array {
  let current = source;
  for (let pass = 0; pass < 2; pass += 1) {
    const horizontal = new Float32Array(current.length);
    for (let y = 0; y < height; y += 1) {
      for (let x = 0; x < width; x += 1) {
        let r = 0;
        let g = 0;
        let b = 0;
        let count = 0;
        for (let offset = -radius; offset <= radius; offset += 1) {
          const sx = x + offset;
          if (sx < 0 || sx >= width) continue;
          const index = (y * width + sx) * 3;
          r += current[index];
          g += current[index + 1];
          b += current[index + 2];
          count += 1;
        }
        const target = (y * width + x) * 3;
        horizontal[target] = r / count;
        horizontal[target + 1] = g / count;
        horizontal[target + 2] = b / count;
      }
    }

    const vertical = new Float32Array(current.length);
    for (let y = 0; y < height; y += 1) {
      for (let x = 0; x < width; x += 1) {
        let r = 0;
        let g = 0;
        let b = 0;
        let count = 0;
        for (let offset = -radius; offset <= radius; offset += 1) {
          const sy = y + offset;
          if (sy < 0 || sy >= height) continue;
          const index = (sy * width + x) * 3;
          r += horizontal[index];
          g += horizontal[index + 1];
          b += horizontal[index + 2];
          count += 1;
        }
        const target = (y * width + x) * 3;
        vertical[target] = r / count;
        vertical[target + 1] = g / count;
        vertical[target + 2] = b / count;
      }
    }
    current = vertical;
  }
  return current;
}

function downsample(source: Float32Array, width: number, height: number) {
  const nextWidth = Math.max(1, width >> 1);
  const nextHeight = Math.max(1, height >> 1);
  const data = new Float32Array(nextWidth * nextHeight * 3);
  for (let y = 0; y < nextHeight; y += 1) {
    for (let x = 0; x < nextWidth; x += 1) {
      const target = (y * nextWidth + x) * 3;
      for (let channel = 0; channel < 3; channel += 1) {
        let sum = 0;
        for (let oy = 0; oy < 2; oy += 1) {
          for (let ox = 0; ox < 2; ox += 1) {
            const sx = Math.min(width - 1, x * 2 + ox);
            const sy = Math.min(height - 1, y * 2 + oy);
            sum += source[(sy * width + sx) * 3 + channel];
          }
        }
        data[target + channel] = sum / 4;
      }
    }
  }
  return { data, width: nextWidth, height: nextHeight };
}

/**
 * Box-filters the pane down to the thumbnail — the supersampling that makes this
 * a shrunk screenshot rather than a render at thumbnail resolution — then adds
 * the renderer's 0x010101 clear colour and encodes to sRGB.
 */
function toSrgb(
  light: Float32Array,
  width: number,
  height: number,
  outputWidth: number,
  outputHeight: number,
): Uint8Array {
  const out = new Uint8Array(outputWidth * outputHeight * 3);
  const clear = Math.pow(1 / 255, 2.2);
  const scaleX = width / outputWidth;
  const scaleY = height / outputHeight;

  for (let y = 0; y < outputHeight; y += 1) {
    const fromY = Math.floor(y * scaleY);
    const toY = Math.max(fromY + 1, Math.floor((y + 1) * scaleY));
    for (let x = 0; x < outputWidth; x += 1) {
      const fromX = Math.floor(x * scaleX);
      const toX = Math.max(fromX + 1, Math.floor((x + 1) * scaleX));
      const samples = (toY - fromY) * (toX - fromX);

      for (let channel = 0; channel < 3; channel += 1) {
        let sum = 0;
        for (let sy = fromY; sy < toY; sy += 1) {
          for (let sx = fromX; sx < toX; sx += 1) {
            sum += light[(sy * width + sx) * 3 + channel];
          }
        }
        const value = Math.min(1, sum / samples + clear);
        out[(y * outputWidth + x) * 3 + channel] = Math.round(Math.pow(value, 1 / 2.2) * 255);
      }
    }
  }
  return out;
}
