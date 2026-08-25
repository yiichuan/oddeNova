export const PACKAGE_DEPTH = 0.02;
export const BULGE_HEIGHT = 0.0035;
export const RECORD_RADIUS = 0.42;

const smoothstep = (edge0: number, edge1: number, value: number) => {
  const t = Math.min(1, Math.max(0, (value - edge0) / (edge1 - edge0)));
  return t * t * (3 - 2 * t);
};

/** A nearly flat disc impression with a broad, ridge-free falloff. */
export function vinylBulgeHeight(x: number, y: number) {
  const radius = Math.hypot(x, y);
  const falloff = 1 - smoothstep(RECORD_RADIUS * 0.68, RECORD_RADIUS * 1.18, radius);
  return BULGE_HEIGHT * falloff;
}

export function hashSeed(value: string) {
  let hash = 2166136261;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

export function seededRandom(seed: number) {
  let state = seed || 1;
  return () => {
    state = Math.imul(state ^ (state >>> 15), 1 | state);
    state ^= state + Math.imul(state ^ (state >>> 7), 61 | state);
    return ((state ^ (state >>> 14)) >>> 0) / 4294967296;
  };
}

export interface WearMark {
  edge: 0 | 1 | 2 | 3;
  along: number;
  depth: number;
  width: number;
}

/** Stable, edge-only micro wear. Corners receive slightly deeper marks. */
export function createWearMarks(id: string, count = 72): WearMark[] {
  const random = seededRandom(hashSeed(id));
  return Array.from({ length: count }, () => {
    const along = random();
    const cornerWeight = Math.max(0, 1 - Math.min(along, 1 - along) * 6);
    return {
      edge: Math.floor(random() * 4) as WearMark['edge'],
      along,
      depth: 0.0015 + random() * 0.004 + cornerWeight * 0.003,
      width: 0.0015 + random() * 0.005,
    };
  });
}
