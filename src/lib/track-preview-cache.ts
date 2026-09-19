import type { TileLaneState } from './track-preview-scene';
import { estimateTileLaneBytes } from './track-preview-scene';

/**
 * Generation-scoped, byte-bounded LRU cache for preview scene tiles. The
 * budget decides reuse only: an evicted tile is re-queried on demand and
 * never leaves a displayed scene incomplete. Pinned entries (the displayed
 * scene, the one being built and the tiles the current viewport needs) are
 * immune to eviction; a generation change releases everything.
 */

export interface TrackTileCacheKey {
  /** Pattern/track generation the tiles belong to. */
  generation: number;
  loopOffset: number;
  cps: number;
  tileBegin: number;
  tileEnd: number;
  resolutionTier: number;
  /**
   * The tile's binning specification and the exact budget it was accumulated
   * under — the tier alone does not identify the data when a long band
   * coarsens the bins or the budget changed.
   */
  effectiveBinSpan: number;
  binCount: number;
  exactBudget: number;
}

export interface TrackTileCacheEntry {
  key: TrackTileCacheKey;
  /** One lane state per track index; null marks a track absent in the tile. */
  lanes: readonly (TileLaneState | null)[];
  rawEventCount: number;
  bytes: number;
}

/**
 * The one numeric normalisation every key comparison uses, in both the
 * string form and the structural one — never two rules.
 */
function normalizeKeyNumber(value: number): number {
  return Math.round(value * 1e9) / 1e9;
}

export function tileCacheKeyString(key: TrackTileCacheKey): string {
  return [
    key.generation,
    normalizeKeyNumber(key.loopOffset).toFixed(9),
    normalizeKeyNumber(key.cps).toFixed(9),
    normalizeKeyNumber(key.tileBegin).toFixed(9),
    normalizeKeyNumber(key.tileEnd).toFixed(9),
    key.resolutionTier,
    normalizeKeyNumber(key.effectiveBinSpan).toFixed(9),
    Math.round(key.binCount),
    Math.round(key.exactBudget),
  ].join('|');
}

export function tileCacheKeysEqual(a: TrackTileCacheKey, b: TrackTileCacheKey): boolean {
  return a.generation === b.generation
    && normalizeKeyNumber(a.loopOffset) === normalizeKeyNumber(b.loopOffset)
    && normalizeKeyNumber(a.cps) === normalizeKeyNumber(b.cps)
    && normalizeKeyNumber(a.tileBegin) === normalizeKeyNumber(b.tileBegin)
    && normalizeKeyNumber(a.tileEnd) === normalizeKeyNumber(b.tileEnd)
    && a.resolutionTier === b.resolutionTier
    && normalizeKeyNumber(a.effectiveBinSpan) === normalizeKeyNumber(b.effectiveBinSpan)
    && Math.round(a.binCount) === Math.round(b.binCount)
    && Math.round(a.exactBudget) === Math.round(b.exactBudget);
}

const DEFAULT_MAX_BYTES = 24 * 1024 * 1024;

export class TrackTileCache {
  private readonly maxBytes: number;
  private readonly entries = new Map<string, TrackTileCacheEntry>();
  private readonly pinned = new Set<string>();
  private currentBytes = 0;

  constructor(maxBytes: number = DEFAULT_MAX_BYTES) {
    this.maxBytes = Math.max(0, maxBytes);
  }

  get size(): number { return this.entries.size; }
  get bytes(): number { return this.currentBytes; }

  get(key: TrackTileCacheKey): TrackTileCacheEntry | null {
    const id = tileCacheKeyString(key);
    const entry = this.entries.get(id);
    if (!entry || !tileCacheKeysEqual(entry.key, key)) return null;
    // Refresh recency.
    this.entries.delete(id);
    this.entries.set(id, entry);
    return entry;
  }

  put(key: TrackTileCacheKey, lanes: readonly (TileLaneState | null)[], rawEventCount: number): TrackTileCacheEntry {
    const entry: TrackTileCacheEntry = {
      key: { ...key },
      lanes,
      rawEventCount,
      bytes: lanes.reduce((sum, lane) => sum + (lane ? estimateTileLaneBytes(lane) : 0), 64),
    };
    const id = tileCacheKeyString(key);
    const existing = this.entries.get(id);
    if (existing) {
      this.currentBytes -= existing.bytes;
      this.entries.delete(id);
    }
    this.entries.set(id, entry);
    this.currentBytes += entry.bytes;
    this.evict();
    return entry;
  }

  pin(key: TrackTileCacheKey): void {
    this.pinned.add(tileCacheKeyString(key));
  }

  unpin(key: TrackTileCacheKey): void {
    this.pinned.delete(tileCacheKeyString(key));
  }

  /** Drop everything; used when the pattern/track generation changes. */
  clear(): void {
    this.entries.clear();
    this.pinned.clear();
    this.currentBytes = 0;
  }

  private evict(): void {
    for (const [id, entry] of this.entries) {
      if (this.currentBytes <= this.maxBytes) break;
      if (this.pinned.has(id)) continue;
      this.entries.delete(id);
      this.currentBytes -= entry.bytes;
    }
  }
}
