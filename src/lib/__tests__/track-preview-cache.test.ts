import { describe, expect, it } from 'vitest';
import { TrackTileCache, type TrackTileCacheKey } from '../track-preview-cache';
import type { TileLaneState } from '../track-preview-scene';

const key = (over: Partial<TrackTileCacheKey> = {}): TrackTileCacheKey => ({
  generation: 1,
  loopOffset: 0,
  cps: 0.5,
  tileBegin: 0,
  tileEnd: 1,
  resolutionTier: 7,
  effectiveBinSpan: 1 / 128,
  binCount: 64,
  exactBudget: 1600,
  ...over,
});

const lane = (bins: number, exact: number): TileLaneState => ({
  representation: exact > 0 ? 'exact' : 'density',
  exact: Array.from({ length: exact }, (_, index) => ({ id: index, begin: index, end: index + 0.5, pitch: null, soundId: 0 })),
  density: {
    binBegin: 0, binSpan: 0.04,
    counts: new Uint32Array(bins), peakConcurrency: new Uint16Array(bins),
    pitchMin: new Int16Array(bins), pitchMax: new Int16Array(bins),
    pitchedCounts: new Uint16Array(bins), unpitchedCounts: new Uint16Array(bins),
  },
  rawEventCount: exact,
});

/** A one-bin, no-exact lane costs 14 bytes plus the cache's 64-byte header. */
const ENTRY_BYTES = 64 + 14;

describe('tile cache', () => {
  it('round-trips an entry by its structured key', () => {
    const cache = new TrackTileCache();
    const entry = cache.put(key(), [lane(4, 2), null], 3);
    expect(cache.get(key())).not.toBeNull();
    expect(cache.get(key())!.rawEventCount).toBe(3);
    expect(cache.get(key())!.lanes[0]?.exact).toHaveLength(2);
    expect(entry.bytes).toBeGreaterThan(0);
    expect(cache.get(key({ tileBegin: 1, tileEnd: 2 }))).toBeNull();
    expect(cache.get(key({ resolutionTier: 9 }))).toBeNull();
    expect(cache.get(key({ generation: 2 }))).toBeNull();
  });

  it('never hits across binning specifications or exact budgets', () => {
    const cache = new TrackTileCache();
    cache.put(key(), [lane(4, 2)], 2);
    // Same tier, but the band coarsened the effective bins: a miss.
    expect(cache.get(key({ effectiveBinSpan: 1 / 64 }))).toBeNull();
    expect(cache.get(key({ binCount: 32 }))).toBeNull();
    expect(cache.get(key({ exactBudget: 3200 }))).toBeNull();
    // Same specification within the shared normalisation: a hit.
    expect(cache.get(key({ effectiveBinSpan: 1 / 128 + 1e-12 }))).not.toBeNull();
    expect(cache.get(key({ binCount: 64.4 }))).not.toBeNull();
  });

  it('refreshes recency on get and evicts least-recently-used beyond the byte budget', () => {
    const cache = new TrackTileCache(3 * ENTRY_BYTES);
    const keys = [key({ tileBegin: 0 }), key({ tileBegin: 1 }), key({ tileBegin: 2 })];
    for (const item of keys) cache.put(item, [lane(1, 0)], 1);
    expect(cache.size).toBe(3);

    // Touch the first so the second becomes the oldest.
    cache.get(keys[0]);
    cache.put(key({ tileBegin: 3 }), [lane(1, 0)], 1);
    expect(cache.get(keys[1])).toBeNull();
    expect(cache.get(keys[0])).not.toBeNull();
    expect(cache.get(keys[2])).not.toBeNull();
    expect(cache.bytes).toBeLessThanOrEqual(3 * ENTRY_BYTES);
  });

  it('never evicts a pinned entry', () => {
    const cache = new TrackTileCache(ENTRY_BYTES);
    const pinnedKey = key({ tileBegin: 0 });
    cache.put(pinnedKey, [lane(1, 0)], 1);
    cache.pin(pinnedKey);
    cache.put(key({ tileBegin: 1 }), [lane(1, 0)], 1);
    expect(cache.get(pinnedKey)).not.toBeNull();
    cache.unpin(pinnedKey);
    cache.put(key({ tileBegin: 2 }), [lane(1, 0)], 1);
    expect(cache.get(pinnedKey)).toBeNull();
  });

  it('clears everything on a generation change', () => {
    const cache = new TrackTileCache();
    cache.put(key(), [lane(1, 1)], 1);
    cache.pin(key());
    cache.clear();
    expect(cache.size).toBe(0);
    expect(cache.bytes).toBe(0);
    expect(cache.get(key())).toBeNull();
  });

  it('replaces an existing entry without double counting its bytes', () => {
    const cache = new TrackTileCache();
    const first = cache.put(key(), [lane(10, 0)], 1);
    cache.put(key(), [lane(2, 0)], 1);
    expect(cache.bytes).toBe(cache.get(key())!.bytes);
    expect(first.bytes).toBeGreaterThan(cache.bytes);
  });
});
