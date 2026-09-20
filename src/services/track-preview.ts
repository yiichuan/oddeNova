import { parser } from '@lezer/javascript';
import { parseScore } from '../agent/parser';
import {
  assembleSceneBatch,
  buildTrackSceneLods,
  MIN_EXACT_WIDTH_PX,
  pendingRangesFromTiles,
  pixelsPerCycleFor,
  planPixelPrecision,
  sameTrackFullSceneIdentity,
  sceneTilesFromRows,
  trackFullSceneIdentityKey,
  TrackLaneTileAccumulator,
  type TrackFullSceneIdentity,
  type TrackFullSceneSnapshot,
  type TrackFullSceneStatus,
  type TrackSceneLod,
  type TrackSceneTile,
  type TrackTilePlan,
  type TileLaneState,
  type TrackSceneBatch,
  type TrackSceneRequest,
} from '../lib/track-preview-scene';
import { TrackTileCache, type TrackTileCacheKey } from '../lib/track-preview-cache';

export type { TrackFullSceneIdentity, TrackFullSceneSnapshot, TrackFullSceneStatus } from '../lib/track-preview-scene';

type Node = ReturnType<typeof parser.parse>['topNode'];
export interface PreviewHap {
  context?: Record<string, unknown>;
  value?: unknown;
  whole?: { begin: unknown; end: unknown } | null;
  part?: { begin: unknown; end: unknown };
}
export interface PreviewPattern {
  queryArc: (begin: number, end: number, controls?: Record<string, unknown>) => PreviewHap[];
}
export interface PreviewTrack {
  id: string;
  name: string;
  sourceRange?: TrackSourceRange;
  /** The whole `@layer` marker comment inside the slot, in full-document offsets. */
  markerRange?: TrackSourceRange;
  /** Just the name characters inside the marker, in full-document offsets. */
  nameRange?: TrackSourceRange;
  /** Generation-stable colour identity: the name the track first compiled with. */
  colorKey?: string;
}
/**
 * The track's own slot in the source it was compiled from — UTF-16 offsets,
 * left-closed right-open, marker comment included, slot-edge whitespace
 * trimmed. Valid only while the editor document still equals the compile's
 * exact mapped source (the compile's code plus every confirmed rename).
 */
export interface TrackSourceRange { from: number; to: number }
/**
 * The browsing window the track view is currently using, in the displayed
 * finite domain: `begin`/`end` are positions on the [0, L] timeline, not
 * absolute transport cycles.
 */
export interface TrackViewport {
  begin: number;
  end: number;
}
/**
 * One viewport request. `loopCycles` is the piece's finite range the caller
 * already derived; omitting it must never silently re-enable an unbounded
 * track. `follow` derives the window from the displayed playhead in the same
 * read (continuous centred follow); a fixed window serves manual browsing
 * and frozen drag gestures.
 */
export type TrackFrameRequest =
  | { loopCycles: number; viewport: { mode: 'follow'; span: number } | { begin: number; end: number } };
export interface TrackSnapshot {
  tracks: PreviewTrack[];
  soloId: string | null;
  /** Tracks the user silenced with the per-track speaker control. */
  mutedIds: ReadonlySet<string>;
  status: 'idle' | 'ready' | 'unsupported';
  /** Lets consumers redraw when the snapshot changes without a new track list. */
  revision: number;
}
/** The terminal result of one scene query; cancellation rejects instead. */
export interface TrackSceneQueryResult {
  status: 'complete' | 'resource-guarded' | 'failed';
  batch?: TrackSceneBatch;
  guardReason?: 'long-task' | 'allocation' | 'no-progress';
}

export interface TrackFullSceneRequest {
  identity: TrackFullSceneIdentity;
  initialViewport: { begin: number; end: number };
  cssWidth?: number;
}

interface FullSceneJob {
  readonly key: string;
  readonly token: number;
  readonly identity: TrackFullSceneIdentity;
  readonly controller: AbortController;
  readonly plan: TrackTilePlan;
  active: boolean;
  snapshot: TrackFullSceneSnapshot | null;
}
interface PreviewMeta {
  tracks: PreviewTrack[];
  sourceCode?: string;
  stackRange?: TrackSourceRange;
  /** True only when prepare proved this compile can keep the visual content identity. */
  reusePreviewContent?: boolean;
}
interface RenameVersion { code: string; tracks: PreviewTrack[] }
type Transpiled = { output: string; oddenovaTracks?: PreviewMeta };
const EMPTY: Omit<TrackSnapshot, 'revision'> = { tracks: [], soloId: null, mutedIds: new Set(), status: 'idle' };
/** Cooperative work slices target this budget; queryArc itself remains
 * synchronous because Pattern objects are not transferable to a Worker. */
export const PREVIEW_WORK_SLICE_MS = 4;
/** A single synchronous queryArc past this is an unfixable long task. */
export const PREVIEW_LONG_TASK_MS = 50;
/** Progressive tile commits merge at most this often (10–15 FPS). */
export const PREVIEW_PROGRESS_INTERVAL_MS = 80;
/** The first probe of a band is this narrow, so a dense pattern is found
 * before a wide query burns the budget. */
export const MIN_QUERY_CHUNK_CYCLES = 1 / 64;
const MAX_QUERY_CHUNK_CYCLES = 1;
type CooperativeHandle = number | ReturnType<typeof setTimeout>;

/** Timing of the last completed scene query, for browser acceptance runs. */
export interface TrackSceneQueryStats {
  chunks: number;
  slowestQueryArcMs: number;
  slowestChunkCycles: number;
  tiles: number;
  cachedTiles: number;
  guardReason?: TrackSceneQueryResult['guardReason'];
}

function monotonicNow(): number {
  return typeof performance !== 'undefined' && typeof performance.now === 'function'
    ? performance.now()
    : Date.now();
}

function abortError(): Error {
  const error = new Error('Track preview query cancelled');
  error.name = 'AbortError';
  return error;
}

function scheduleCooperative(callback: () => void): CooperativeHandle {
  const idle = (globalThis as typeof globalThis & {
    requestIdleCallback?: (callback: () => void, options?: { timeout: number }) => number;
  }).requestIdleCallback;
  if (typeof idle === 'function') return idle(callback, { timeout: 100 });
  return globalThis.setTimeout(callback, 0);
}

function cancelCooperative(handle: CooperativeHandle): void {
  const cancelIdle = (globalThis as typeof globalThis & {
    cancelIdleCallback?: (handle: number) => void;
  }).cancelIdleCallback;
  if (typeof cancelIdle === 'function' && typeof handle === 'number') cancelIdle(handle);
  globalThis.clearTimeout(handle);
}

/** Trim whitespace-only edges off a slot, keeping the range non-empty. */
function trimmedRange(rawFrom: number, rawTo: number, code: string): TrackSourceRange {
  let from = rawFrom;
  let to = rawTo;
  while (from < to && /\s/.test(code[from] ?? '')) from++;
  while (to > from && /\s/.test(code[to - 1] ?? '')) to--;
  return { from, to };
}
// Only outer transforms that preserve layer provenance. More complex programs
// still play normally; this is a preview capability check, not a code validator.
const OUTER_METHODS = new Set([
  'slow', 'fast', 'gain', 'postgain', 'color', 'lpf', 'hpf', 'lpq', 'hpq',
  'room', 'size', 'roomsize', 'delay', 'delaytime', 'delayfeedback', 'pan',
  'punchcard', 'pianoroll', '_pianoroll', 'theme', 'clip', 'release', 'attack',
]);
const UNSUPPORTED = new Set(['onTrigger', 'midi', 'midiout', 'osc', 'out', 'p', 'q', 'hush', 'all', 'each']);

function children(node: Node): Node[] {
  const result: Node[] = [];
  for (let child = node.firstChild; child; child = child.nextSibling) result.push(child);
  return result;
}

function terminalStack(code: string): Node | null {
  const tree = parser.parse(code);
  let invalid = false;
  tree.iterate({ enter(node) {
    if (node.name === 'VariableDefinition' && code.slice(node.from, node.to) === 'stack') invalid = true;
    if (node.type.isError || node.name === 'LabeledStatement') invalid = true;
    if (['PropertyName', 'VariableName', 'VariableDefinition'].includes(node.name)
      && UNSUPPORTED.has(code.slice(node.from, node.to))) invalid = true;
  } });
  if (invalid) return null;
  const statements = children(tree.topNode).filter(n => !['LineComment', 'BlockComment', ';'].includes(n.name));
  const last = statements.at(-1);
  if (!last || !['ExpressionStatement', 'ReturnStatement'].includes(last.name)) return null;
  let expression = children(last).find(n => n.name === 'CallExpression');
  while (expression?.name === 'CallExpression') {
    const callee = expression.firstChild;
    if (callee?.name === 'VariableName' && code.slice(callee.from, callee.to) === 'stack') return expression;
    if (callee?.name !== 'MemberExpression') return null;
    const property = callee.lastChild;
    if (!property || !OUTER_METHODS.has(code.slice(property.from, property.to))) return null;
    expression = callee.firstChild ?? undefined;
  }
  return null;
}

function argumentsOf(node: Node): Node[] {
  const args = node.getChild('ArgList');
  return args ? children(args).filter(n => !['(', ')', ',', 'BlockComment', 'LineComment'].includes(n.name)) : [];
}

function pitchOf(value: Record<string, unknown>): number | null {
  if (typeof value.note === 'number' && Number.isFinite(value.note)) return value.note;
  if (typeof value.note !== 'string') return null;
  const match = /^([a-g])([#b]?)(-?\d+)$/i.exec(value.note);
  if (!match) return null;
  const pc: Record<string, number> = { c: 0, d: 2, e: 4, f: 5, g: 7, a: 9, b: 11 };
  return (Number(match[3]) + 1) * 12 + pc[match[1].toLowerCase()] + (match[2] === '#' ? 1 : match[2] === 'b' ? -1 : 0);
}

function sameRange(left: TrackSourceRange | undefined, right: TrackSourceRange | undefined): boolean {
  return left?.from === right?.from && left?.to === right?.to;
}

/** Compare parsed layer slots, not their runtime identities. */
function sameTrackStructure(previous: readonly PreviewTrack[], next: readonly PreviewTrack[]): boolean {
  return previous.length === next.length && previous.every((track, index) => {
    const candidate = next[index];
    return track.name === candidate.name
      && sameRange(track.sourceRange, candidate.sourceRange)
      && sameRange(track.markerRange, candidate.markerRange)
      && sameRange(track.nameRange, candidate.nameRange);
  });
}

function sameTrackMetadata(previous: readonly PreviewTrack[], next: readonly PreviewTrack[]): boolean {
  return previous.length === next.length && previous.every((track, index) => {
    const candidate = next[index];
    return track.id === candidate.id
      && track.name === candidate.name
      && track.colorKey === candidate.colorKey
      && sameRange(track.sourceRange, candidate.sourceRange)
      && sameRange(track.markerRange, candidate.markerRange)
      && sameRange(track.nameRange, candidate.nameRange);
  });
}

function sameIdSet(left: ReadonlySet<string>, right: ReadonlySet<string>): boolean {
  return left.size === right.size && [...left].every(id => right.has(id));
}

/** Temporary audition state. No editor writes, transport changes, or value/gain mutations. */
export class TrackPreview {
  /** Changes only when a new logical track identity must be allocated. */
  private trackIdentityGeneration = 0;
  /** Changes only when the queryable pattern/track generation changes. */
  private previewGenerationCount = 0;
  /** Compile/mapping epoch; unlike previewGeneration it advances on every commit.
   * Rename history binds to it so old conversions cannot match a later compile. */
  private compileEpochCount = 0;
  private pattern: PreviewPattern | null = null;
  private current: TrackSnapshot = { ...EMPTY, revision: 0 };
  private ids = new Set<string>();
  // The exact code the latest successful Pattern was compiled from. It may
  // advance during a same-content commit while the visual generation stays
  // stable.
  private compiledCode: string | null = null;
  // The code the current names and navigation ranges point at: the compiled
  // source plus every confirmed pure rename since. Navigation trusts this
  // version, never the compiled one.
  private mappedCode: string | null = null;
  private stackRange: TrackSourceRange | null = null;
  private listeners = new Set<() => void>();
  private sceneCache = new TrackTileCache();
  /** The tile keys the last request pinned: the displayed scene and its
   *  viewport survive LRU pressure until the next request replaces them. */
  private scenePins: TrackTileCacheKey[] = [];
  /** Sound dictionary, reset with its generation. */
  private soundIds = new Map<string, number>();
  private soundNames: string[] = [];
  private lastResolutionTier: number | null = null;
  private lastStats: TrackSceneQueryStats = { chunks: 0, slowestQueryArcMs: 0, slowestChunkCycles: 0, tiles: 0, cachedTiles: 0 };
  private fullScene: TrackFullSceneSnapshot | null = null;
  private readonly fullSceneListeners = new Set<() => void>();
  private readonly fullSceneJobs = new Map<string, FullSceneJob>();
  private fullSceneToken = 0;
  private activeFullSceneKey: string | null = null;
  get snapshot(): TrackSnapshot { return this.current; }
  get fullSceneSnapshot(): TrackFullSceneSnapshot | null { return this.fullScene; }
  subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener);
    return () => { this.listeners.delete(listener); };
  };
  subscribeFullScene = (listener: () => void): (() => void) => {
    this.fullSceneListeners.add(listener);
    return () => { this.fullSceneListeners.delete(listener); };
  };
  private publish(snapshot: Omit<TrackSnapshot, 'revision'>): void {
    this.current = { ...snapshot, revision: this.current.revision + 1 };
    this.ids = new Set(snapshot.tracks.map(t => t.id));
    this.listeners.forEach(listener => listener());
  }

  private publishFullScene(snapshot: TrackFullSceneSnapshot | null): void {
    this.fullScene = snapshot;
    this.fullSceneListeners.forEach(listener => listener());
  }

  /** Stable identity for cancelling preview work after a new compile/reset. */
  get previewGeneration(): number { return this.previewGenerationCount; }

  /** Timing of the last scene query, for browser acceptance recordings. */
  get lastSceneQueryStats(): TrackSceneQueryStats { return this.lastStats; }

  prepare<T extends Transpiled>(code: string, result: T): T {
    const sourceStack = terminalStack(code);
    const outputStack = terminalStack(result.output);
    if (!sourceStack || !outputStack) return result;
    const sourceArgs = argumentsOf(sourceStack);
    const outputArgs = argumentsOf(outputStack);
    if (!sourceArgs.length || sourceArgs.some(n => n.name === 'Spread')
      || sourceArgs.length !== outputArgs.length) return result;
    const score = parseScore(code.slice(sourceStack.from, sourceStack.to));
    if (score.layers.length !== sourceArgs.length) return result;
    const parsedTracks = score.layers.map((layer, index) => ({
      id: `${this.trackIdentityGeneration + 1}:${index}`,
      name: layer.name,
      // The colour follows the name the layer first appeared with; renames
      // must not reshuffle the palette (see applyRename / colorKey).
      colorKey: layer.name,
      // The layer's slot in the FULL original document: parseScore's offsets
      // are relative to the sliced stack expression, so the stack's own start
      // is added back. Slot-edge whitespace is trimmed; the @layer marker and
      // any comment stay inside the range.
      sourceRange: trimmedRange(
        sourceStack.from + layer.rawStart,
        sourceStack.from + layer.rawEnd,
        code,
      ),
      markerRange: layer.markerRange
        ? {
            from: sourceStack.from + layer.markerRange.from,
            to: sourceStack.from + layer.markerRange.to,
          }
        : undefined,
      nameRange: layer.nameRange
        ? {
            from: sourceStack.from + layer.nameRange.from,
            to: sourceStack.from + layer.nameRange.to,
          }
        : undefined,
    }));
    const reusePreviewContent = this.canReusePreviewContent(code, parsedTracks);
    if (!reusePreviewContent) this.trackIdentityGeneration++;
    const tracks = parsedTracks.map((track, index) => reusePreviewContent
      ? {
          ...track,
          id: this.current.tracks[index].id,
          colorKey: this.current.tracks[index].colorKey ?? track.colorKey,
        }
      : track);
    let output = result.output;
    for (let i = outputArgs.length - 1; i >= 0; i--) {
      const arg = outputArgs[i];
      // Instrument AFTER transpilation so mini locations and editor widgets
      // continue to reference the untouched original document.
      const tagged = `stack(${output.slice(arg.from, arg.to)}).withContext(context => ({...context, oddenovaTrack: '${tracks[i].id}'}))`;
      output = output.slice(0, arg.from) + tagged + output.slice(arg.to);
    }
    // One exact copy of the code this batch was compiled from — never
    // trimmed or normalized, so the offsets line up with a CodeMirror
    // document holding the same text. The stack's own span travels with it
    // so a rename can re-derive every range without a second AST pass.
    return {
      ...result,
      output,
      oddenovaTracks: {
        tracks,
        sourceCode: code,
        stackRange: { from: sourceStack.from, to: sourceStack.to },
        reusePreviewContent,
      },
    };
  }

  private canReusePreviewContent(code: string, parsedTracks: readonly PreviewTrack[]): boolean {
    return this.current.status === 'ready'
      && this.pattern !== null
      && this.mappedCode === code
      && sameTrackStructure(this.current.tracks, parsedTracks);
  }

  commit(pattern: PreviewPattern, meta?: { oddenovaTracks?: PreviewMeta }): void {
    const hadCommittedPattern = this.pattern !== null;
    this.compileEpochCount++;
    this.pattern = pattern;
    const compiled = meta?.oddenovaTracks;
    const tracks = compiled?.tracks ?? [];

    // `prepare()` made this decision from the exact mapped source and the
    // parsed layer slots. Keep one defensive identity check here so a delayed
    // callback cannot apply an old fast-path metadata object to a different
    // current track list.
    const reusePreviewContent = compiled?.reusePreviewContent === true
      && this.current.status === 'ready'
      && hadCommittedPattern
      && this.current.tracks.length === tracks.length
      && sameTrackStructure(this.current.tracks, tracks)
      && this.current.tracks.every((track, index) => track.id === tracks[index].id);

    if (reusePreviewContent) {
      const mutedIds = new Set([...this.current.mutedIds].filter(id => tracks.some(track => track.id === id)));
      const soloId = this.current.soloId && tracks.some(track => track.id === this.current.soloId)
        ? this.current.soloId
        : null;
      // Pattern replacement is real even when the visual snapshot is not.
      // Keep the scene cache, generation, track identity and audition state.
      this.compiledCode = compiled?.sourceCode ?? this.compiledCode;
      this.mappedCode = this.compiledCode;
      this.stackRange = compiled?.stackRange ?? this.stackRange;
      if (!sameTrackMetadata(this.current.tracks, tracks)
        || this.current.soloId !== soloId
        || !sameIdSet(this.current.mutedIds, mutedIds)
        || this.current.status !== 'ready') {
        this.publish({ tracks, soloId, mutedIds, status: 'ready' });
      }
      return;
    }

    // A changed source, layer structure, session or unsupported submission is
    // a new visual work. Only this branch invalidates query generations and
    // generation-scoped scene state.
    this.previewGenerationCount++;
    this.resetSceneState();
    // A fresh evaluation replaces every track id, so old mute selections no
    // longer point at anything and would silently silence the new score.
    const mutedIds = new Set([...this.current.mutedIds].filter(id => tracks.some(t => t.id === id)));
    // Source navigation metadata binds to the compile that just committed —
    // a failed evaluation must not re-point old tracks at new ranges.
    this.compiledCode = tracks.length ? compiled?.sourceCode ?? null : null;
    this.mappedCode = this.compiledCode;
    this.stackRange = tracks.length ? compiled?.stackRange ?? null : null;
    this.publish({ tracks, soloId: null, mutedIds, status: tracks.length ? 'ready' : 'unsupported' });
  }

  /**
   * Apply one confirmed pure rename: new names and ranges for every track,
   * same ids, same pattern, same mix. The compiled source is untouched — the
   * sounding pattern still comes from it — while navigation re-targets the
   * mapped version.
   */
  applyRename = (version: RenameVersion): void => {
    if (this.current.status !== 'ready') return;
    this.mappedCode = version.code;
    this.publish({ ...this.current, tracks: version.tracks });
  };

  /** The document the rename mapping is currently trusted against. */
  get mappingCode(): string | null { return this.mappedCode; }
  get mappingStackRange(): TrackSourceRange | null { return this.stackRange; }
  /** The compile generation the current mapping belongs to. */
  get compileGeneration(): number { return this.compileEpochCount; }
  /** Increments on every committed compile; rename history binds to this. */
  get mappingEpoch(): number { return this.compileEpochCount; }

  /** Everything a rename needs, or null when the preview cannot support one. */
  renameContext = (): { code: string; tracks: PreviewTrack[]; stackRange: TrackSourceRange } | null => {
    if (this.current.status !== 'ready' || !this.mappedCode || !this.stackRange) return null;
    return { code: this.mappedCode, tracks: this.current.tracks, stackRange: this.stackRange };
  };

  /** The source slot a track is currently mapped to, if it is still valid. */
  trackSource = (trackId: string): { range: TrackSourceRange; sourceCode: string } | null => {
    const track = this.current.tracks.find(t => t.id === trackId);
    if (!track?.sourceRange || !this.mappedCode) return null;
    return { range: track.sourceRange, sourceCode: this.mappedCode };
  };
  /** The exact source the sounding pattern was compiled from. */
  get compiledSourceCode(): string | null { return this.compiledCode; }

  /** Notify track consumers that the transport position changed. */
  refresh = (): void => { this.publish(this.current); };
  reset = (): void => {
    this.previewGenerationCount++;
    this.pattern = null;
    this.compiledCode = null;
    this.mappedCode = null;
    this.stackRange = null;
    this.resetSceneState();
    this.publish(EMPTY);
  };
  private unsupported(): void {
    this.previewGenerationCount++;
    this.pattern = null;
    this.resetSceneState();
    this.publish({ ...EMPTY, status: 'unsupported' });
  };
  /** Restores the full mix: drops solo and per-track mutes. */
  clearSolo = (): void => {
    if (this.current.soloId !== null || this.current.mutedIds.size) {
      this.publish({ ...this.current, soloId: null, mutedIds: new Set() });
    }
  };
  toggleSolo = (id: string): void => {
    if (!this.ids.has(id)) return;
    this.publish({ ...this.current, soloId: this.current.soloId === id ? null : id });
  };
  toggleMute = (id: string): void => {
    if (!this.ids.has(id)) return;
    const mutedIds = new Set(this.current.mutedIds);
    if (mutedIds.has(id)) mutedIds.delete(id); else mutedIds.add(id);
    this.publish({ ...this.current, mutedIds });
  };
  isAudible = (hap: PreviewHap): boolean => {
    if (!this.current.soloId && !this.current.mutedIds.size) return true;
    const id = hap.context?.oddenovaTrack;
    if (typeof id !== 'string' || !this.ids.has(id)) {
      // Unexpected provenance must never strand music in a partly muted state.
      this.unsupported();
      return true;
    }
    if (this.current.mutedIds.has(id)) return false;
    if (!this.current.soloId) return true;
    return id === this.current.soloId;
  };

  /** Reset generation-scoped scene bookkeeping (cache pins, dictionary, tier). */
  private resetSceneState(): void {
    this.fullSceneToken++;
    for (const job of this.fullSceneJobs.values()) job.controller.abort();
    this.fullSceneJobs.clear();
    this.activeFullSceneKey = null;
    this.publishFullScene(null);
    this.sceneCache.clear();
    this.soundIds.clear();
    this.soundNames.length = 0;
    this.lastResolutionTier = null;
  }

  private normalizeFullSceneIdentity(rawIdentity: TrackFullSceneIdentity): TrackFullSceneIdentity | null {
    if (rawIdentity.previewGeneration !== this.previewGenerationCount
      || !Number.isFinite(rawIdentity.loopCycles)
      || rawIdentity.loopCycles <= 0) return null;
    return Object.freeze({
      previewGeneration: rawIdentity.previewGeneration,
      loopOffset: Number.isFinite(rawIdentity.loopOffset) ? rawIdentity.loopOffset : 0,
      loopCycles: rawIdentity.loopCycles,
      cps: Number.isFinite(rawIdentity.cps) && rawIdentity.cps > 0 ? rawIdentity.cps : 0.5,
    }) as TrackFullSceneIdentity;
  }

  /**
   * Start or reuse the one fixed-range job for a full-scene identity. The
   * initial viewport only controls tile priority; the query range and its
   * precision stay fixed for the lifetime of the job.
   */
  ensureFullScene = (request: TrackFullSceneRequest): void => {
    const identity = this.normalizeFullSceneIdentity(request.identity);
    if (!identity || !this.pattern || !this.current.tracks.length) return;
    const key = trackFullSceneIdentityKey(identity);
    const existing = this.fullSceneJobs.get(key);
    if (existing) {
      // A next-pass job can be promoted atomically at the loop boundary. Its
      // query is already running, so only expose its latest immutable snapshot
      // and never start a second Pattern query for the same identity.
      for (const [jobKey, job] of this.fullSceneJobs) {
        if (jobKey !== key) job.controller.abort();
      }
      for (const jobKey of [...this.fullSceneJobs.keys()]) {
        if (jobKey !== key) this.fullSceneJobs.delete(jobKey);
      }
      existing.active = true;
      this.activeFullSceneKey = key;
      if (existing.snapshot) this.publishFullScene(existing.snapshot);
      return;
    }
    if (this.fullScene && sameTrackFullSceneIdentity(this.fullScene.identity, identity)
      && (this.fullScene.status === 'complete' || this.fullScene.status === 'preparing')) return;

    // A pass or code identity change makes older work irrelevant. A same-key
    // job was handled above, so aborting here cannot cancel an equivalent task.
    for (const [jobKey, job] of this.fullSceneJobs) {
      if (jobKey !== key) job.controller.abort();
    }
    this.fullSceneJobs.clear();
    this.activeFullSceneKey = key;

    this.startFullSceneJob(request, identity, key, true);
  };

  /**
   * Prepare the next loop pass without replacing the currently displayed
   * snapshot. This is intentionally separate from ensureFullScene: the
   * current pass remains authoritative until the clock crosses its boundary.
   */
  prewarmFullScene = (request: TrackFullSceneRequest): void => {
    if (this.fullScene?.status !== 'complete' || !this.pattern || !this.current.tracks.length) return;
    const identity = this.normalizeFullSceneIdentity(request.identity);
    if (!identity) return;
    if (this.fullScene && sameTrackFullSceneIdentity(this.fullScene.identity, identity)) return;
    const key = trackFullSceneIdentityKey(identity);
    if (this.fullSceneJobs.has(key)) return;
    // A prewarm is only launched after the active job has reached complete;
    // this keeps queryTrackScene's shared tile pin and sound dictionary
    // single-writer while allowing the next pass to fill the cache in the
    // background.
    if (this.fullSceneJobs.size > 0) return;
    this.startFullSceneJob(request, identity, key, false);
  };

  private startFullSceneJob(
    request: TrackFullSceneRequest,
    identity: TrackFullSceneIdentity,
    key: string,
    active: boolean,
  ): void {

    const initialBegin = Number.isFinite(request.initialViewport.begin)
      ? Math.min(identity.loopCycles, Math.max(0, request.initialViewport.begin))
      : 0;
    const initialEnd = Number.isFinite(request.initialViewport.end)
      ? Math.min(identity.loopCycles, Math.max(initialBegin, request.initialViewport.end))
      : initialBegin;
    const cssWidth = Number.isFinite(request.cssWidth) && (request.cssWidth ?? 0) > 0
      ? request.cssWidth!
      : 400;
    // Full scenes are accumulated at the finest supported product span. The
    // resulting exact candidates and density columns can be projected at any
    // wider viewport without asking Pattern for another event set.
    const finestSpan = Math.min(0.5, identity.loopCycles);
    const precision = planPixelPrecision({
      cssWidth,
      viewportBegin: 0,
      viewportEnd: finestSpan,
      bandBegin: 0,
      bandEnd: identity.loopCycles,
    });
    const tileOrder = this.fullSceneTileOrder(precision.tile, initialBegin, initialEnd);
    const controller = new AbortController();
    const token = ++this.fullSceneToken;
    const job: FullSceneJob = {
      key,
      token,
      identity,
      controller,
      plan: precision.tile,
      active,
      snapshot: null,
    };
    this.fullSceneJobs.set(key, job);

    const emptyRows = this.current.tracks.map(() => new Array<TileLaneState | null>(precision.tile.tileCount).fill(null));
    const emptyTiles = sceneTilesFromRows({
      plan: precision.tile,
      rows: emptyRows,
      completedTiles: new Set(),
    });
    const initialSnapshot = Object.freeze({
      identity,
      status: 'preparing',
      begin: 0,
      end: identity.loopCycles,
      completedTiles: new Set<number>(),
      tiles: emptyTiles,
      sounds: Object.freeze([...this.soundNames]),
      resolutionTier: precision.resolutionTier,
      effectiveBinSpan: precision.effectiveBinSpan,
      exactBudget: precision.exactBudget,
      lods: [],
    });
    job.snapshot = initialSnapshot;
    if (active) this.publishFullScene(initialSnapshot);

    const stillCurrent = (): boolean => this.fullSceneJobs.get(key)?.token === token
      && this.previewGenerationCount === identity.previewGeneration;
    const publishBatch = (
      batch: TrackSceneBatch,
      status: TrackFullSceneStatus,
      failure?: TrackFullSceneSnapshot['failure'],
      lods: readonly TrackSceneLod[] = this.fullScene?.lods ?? [],
    ): void => {
      if (!stillCurrent()) return;
      const tiles = batch.sceneTiles ?? [];
      const completedTiles = batch.completedTiles ?? new Set(
        tiles.filter(tile => tile.status === 'complete').map(tile => tile.index),
      );
      const snapshot = Object.freeze({
        identity,
        status,
        begin: 0,
        end: identity.loopCycles,
        completedTiles: new Set(completedTiles),
        tiles,
        sounds: Object.freeze([...batch.sounds]),
        resolutionTier: batch.resolutionTier,
        effectiveBinSpan: batch.effectiveBinSpan ?? precision.effectiveBinSpan,
        exactBudget: batch.exactBudget ?? precision.exactBudget,
        lods,
        ...(failure ? { failure } : {}),
      });
      job.snapshot = snapshot;
      if (job.active && this.activeFullSceneKey === key) this.publishFullScene(snapshot);
    };

    void this.queryTrackScene({
      generation: identity.previewGeneration,
      loopOffset: identity.loopOffset,
      cps: identity.cps,
      queryBegin: 0,
      queryEnd: identity.loopCycles,
      // This is only the fixed query precision. It is deliberately detached
      // from the user's live viewport, which can change while the job runs.
      viewportBegin: 0,
      viewportEnd: finestSpan,
      cssWidth,
      devicePixelRatio: 1,
      resolutionTier: precision.resolutionTier,
      workSliceMs: PREVIEW_WORK_SLICE_MS,
      tileOrder,
    }, controller.signal, batch => publishBatch(batch, 'preparing'))
      .then(result => {
        if (!stillCurrent()) return;
        if (result.status === 'complete' && result.batch) {
          publishBatch(result.batch, 'complete', undefined, buildTrackSceneLods(
            result.batch.lanes,
            0,
            identity.loopCycles,
            result.batch.effectiveBinSpan ?? precision.effectiveBinSpan,
          ));
        } else if (result.status === 'resource-guarded') {
          publishBatch(this.fullSceneBatchFromSnapshot(identity), 'resource-guarded', result.guardReason);
        } else {
          publishBatch(this.fullSceneBatchFromSnapshot(identity), 'failed', 'query-failed');
        }
      })
      .catch(error => {
        if (!stillCurrent() || (error as { name?: string })?.name === 'AbortError') return;
        publishBatch(this.fullSceneBatchFromSnapshot(identity), 'failed', 'query-failed');
      })
      .finally(() => {
        if (this.fullSceneJobs.get(key)?.token === token) this.fullSceneJobs.delete(key);
      });
  };

  /** Deterministic visible-first order, independent of later viewport moves. */
  private fullSceneTileOrder(plan: TrackTilePlan, initialBegin: number, initialEnd: number): number[] {
    const span = Math.max(plan.tileSpan, initialEnd - initialBegin, 1e-9);
    const center = (initialBegin + initialEnd) / 2;
    const near = (index: number): number => {
      const begin = plan.bandBegin + index * plan.tileSpan;
      const end = Math.min(plan.bandEnd, begin + plan.tileSpan);
      if (end >= initialBegin - 1e-9 && begin <= initialEnd + 1e-9) return -2;
      if (end >= initialBegin - span && begin <= initialEnd + span) return -1;
      return Math.abs((begin + end) / 2 - center);
    };
    return Array.from({ length: plan.tileCount }, (_, index) => index)
      .sort((left, right) => near(left) - near(right) || left - right);
  }

  /** Build a batch from the last full-scene snapshot for guarded/failure UI. */
  private fullSceneBatchFromSnapshot(identity: TrackFullSceneIdentity): TrackSceneBatch {
    const snapshot = this.fullScene;
    if (snapshot && sameTrackFullSceneIdentity(snapshot.identity, identity)) {
      return {
        generation: identity.previewGeneration,
        loopOffset: identity.loopOffset,
        begin: 0,
        end: identity.loopCycles,
        viewportBegin: 0,
        viewportEnd: Math.min(0.5, identity.loopCycles),
        representation: 'mixed',
        status: 'progress',
        lanes: [],
        rawEventCount: 0,
        resolutionTier: snapshot.resolutionTier,
        effectiveBinSpan: snapshot.effectiveBinSpan,
        exactBudget: snapshot.exactBudget,
        sounds: snapshot.sounds,
        sceneTiles: snapshot.tiles,
        completedTiles: snapshot.completedTiles,
        pendingRanges: pendingRangesFromTiles(snapshot.tiles),
      };
    }
    return {
      generation: identity.previewGeneration,
      loopOffset: identity.loopOffset,
      begin: 0,
      end: identity.loopCycles,
      viewportBegin: 0,
      viewportEnd: Math.min(0.5, identity.loopCycles),
      representation: 'mixed',
      status: 'progress',
      lanes: [],
      rawEventCount: 0,
      resolutionTier: 0,
      exactBudget: 0,
      sounds: [],
    };
  }

  /**
   * Query one scene band into a render scene: cancellable, cooperative,
   * tile-based and without any event-count cap. `Pattern.queryArc()` stays on
   * the main thread (Patterns are not transferable), but the work between
   * chunks yields, and every raw hap is validated, normalized and folded into
   * exact candidates or density columns — nothing is truncated to a prefix.
   * `onProgress` merges finished tiles at most every ~80ms while the query
   * runs; the resolved batch is the one atomic, complete scene.
   */
  queryTrackScene = (
    request: TrackSceneRequest,
    signal?: AbortSignal,
    onProgress?: (batch: TrackSceneBatch) => void,
  ): Promise<TrackSceneQueryResult> => {
    const generation = this.previewGenerationCount;
    if (request.generation !== undefined && request.generation !== generation) return Promise.reject(abortError());

    const queryBegin = Number.isFinite(request.queryBegin) ? request.queryBegin : 0;
    const queryEnd = Number.isFinite(request.queryEnd) ? Math.max(queryBegin, request.queryEnd) : queryBegin;
    const loopOffset = Number.isFinite(request.loopOffset) ? request.loopOffset : 0;
    const cps = Number.isFinite(request.cps) && request.cps > 0 ? request.cps : 0.5;
    const viewportBegin = Number.isFinite(request.viewportBegin) ? request.viewportBegin : queryBegin;
    const viewportEnd = Number.isFinite(request.viewportEnd) ? Math.max(viewportBegin, request.viewportEnd) : viewportBegin;
    const cssWidth = Number.isFinite(request.cssWidth) && request.cssWidth > 0 ? request.cssWidth : 400;
    const workSliceMs = request.workSliceMs ?? PREVIEW_WORK_SLICE_MS;
    const pxPerCycle = pixelsPerCycleFor({ cssWidth, viewportBegin, viewportEnd });
    // One precision decision for the whole request — tier (hysteresis plus
    // the caller's recorded target), tier-fixed binning and the exact budget.
    const precision = planPixelPrecision({
      cssWidth,
      viewportBegin,
      viewportEnd,
      bandBegin: queryBegin,
      bandEnd: queryEnd,
      previousTier: this.lastResolutionTier ?? undefined,
      requestedTier: request.resolutionTier,
    });
    const resolutionTier = precision.resolutionTier;
    this.lastResolutionTier = resolutionTier;
    const pattern = this.pattern;
    const tracks = this.current.tracks;

    if (!pattern || !tracks.length || queryEnd <= queryBegin) {
      return Promise.resolve({
        status: 'complete',
        batch: assembleSceneBatch({
          generation,
          loopOffset,
          bandBegin: queryBegin,
          bandEnd: queryEnd,
          viewportBegin,
          viewportEnd,
          resolutionTier,
          status: 'complete',
          trackIds: tracks.map(track => track.id),
          tiles: tracks.map(() => []),
          rawEventCount: 0,
          sounds: [...this.soundNames],
          effectiveBinSpan: precision.effectiveBinSpan,
          exactBudget: precision.exactBudget,
        }),
      });
    }

    // A non-positive or non-finite slice cannot make cooperative progress.
    // Positive budgets may still be exceeded by a completed slice under load;
    // that work has progressed and will yield, so it must not become a data cap.
    if (!Number.isFinite(workSliceMs) || workSliceMs <= 0) {
      return Promise.resolve({ status: 'resource-guarded', guardReason: 'no-progress' });
    }

    return new Promise<TrackSceneQueryResult>((resolve, reject) => {
      let handle: CooperativeHandle | null = null;
      let settled = false;
      let removeAbort: (() => void) | null = null;
      let removeVisibility: (() => void) | null = null;
      const clean = () => {
        if (handle !== null) { cancelCooperative(handle); handle = null; }
        removeAbort?.();
        removeAbort = null;
        removeVisibility?.();
        removeVisibility = null;
      };
      const fail = (error: unknown) => {
        if (settled) return;
        settled = true;
        clean();
        reject(error);
      };
      const cancel = () => fail(abortError());
      if (signal?.aborted) { cancel(); return; }
      if (signal) {
        const onAbort = () => cancel();
        signal.addEventListener('abort', onAbort, { once: true });
        removeAbort = () => signal.removeEventListener('abort', onAbort);
      }

      const pageIsHidden = (): boolean => typeof document !== 'undefined' && document.visibilityState === 'hidden';
      const scheduleNextSlice = (): void => {
        if (settled) return;
        if (!pageIsHidden()) {
          handle = scheduleCooperative(runSlice);
          return;
        }
        if (removeVisibility || typeof document === 'undefined') return;
        const onVisibility = () => {
          if (pageIsHidden() || settled) return;
          removeVisibility?.();
          removeVisibility = null;
          handle = scheduleCooperative(runSlice);
        };
        document.addEventListener('visibilitychange', onVisibility);
        removeVisibility = () => document.removeEventListener('visibilitychange', onVisibility);
      };

      // ── Frozen scene state ───────────────────────────────────────────────
      const soundIdOf = (sound: string): number => {
        let id = this.soundIds.get(sound);
        if (id === undefined) {
          id = this.soundNames.length;
          this.soundIds.set(sound, id);
          this.soundNames.push(sound);
        }
        return id;
      };
      const plan = precision.tile;
      const maxExactCount = precision.exactBudget;
      const tileRows: (TileLaneState | null)[][] = tracks.map(() => new Array<TileLaneState | null>(plan.tileCount).fill(null));
      const trackIndexById = new Map(tracks.map((track, index) => [track.id, index]));
      const demotedTracks = new Set<number>();
      const perTileRawCounts = new Map<number, number>();
      const requestedTileOrder = request.tileOrder
        ? [...new Set(request.tileOrder.map(index => Math.round(index)).filter(index => index >= 0 && index < plan.tileCount))]
        : null;
      const tileOrder = requestedTileOrder?.length
        ? requestedTileOrder
        : Array.from({ length: plan.tileCount }, (_, index) => index);
      const fullSceneOrder = requestedTileOrder !== null;
      const completedTiles = new Set<number>();
      const guardedTiles = new Set<number>();
      let tileCursor = 0;
      let currentTileIndexForOrder = tileOrder[0] ?? -1;
      let chunkBegin = currentTileIndexForOrder >= 0 ? plan.bandBegin + currentTileIndexForOrder * plan.tileSpan : queryBegin;
      let chunkWidth = MIN_QUERY_CHUNK_CYCLES;
      let currentChunkBegin = queryBegin;
      let currentChunkEnd = queryBegin;
      let currentChunkStarted = 0;
      let currentQueryDuration = 0;
      let currentAccumulators: TrackLaneTileAccumulator[] | null = null;
      let currentTileDedup: Set<string>[] | null = null;
      let currentTileIndex = -1;
      let haps: PreviewHap[] | null = null;
      let hapIndex = 0;
      let firstBandChunk = true;
      let lastProgressAt = -Infinity;
      let cachedTiles = 0;
      let slowestQueryArcMs = 0;
      let slowestChunkCycles = 0;
      let chunkCount = 0;

      const tileBeginAt = (index: number): number => plan.bandBegin + index * plan.tileSpan;
      const tileEndAt = (index: number): number => Math.min(plan.bandEnd, tileBeginAt(index) + plan.tileSpan);

      const cacheKeyFor = (index: number): TrackTileCacheKey => ({
        generation, loopOffset, cps,
        tileBegin: tileBeginAt(index),
        tileEnd: tileEndAt(index),
        resolutionTier,
        effectiveBinSpan: precision.effectiveBinSpan,
        binCount: plan.binCount,
        exactBudget: precision.exactBudget,
      });

      const sceneTiles = (): readonly TrackSceneTile[] => sceneTilesFromRows({
        plan,
        rows: tileRows,
        completedTiles,
        rawCounts: perTileRawCounts,
        guardedTiles,
      });

      const progressRanges = (): readonly (readonly [number, number])[] =>
        pendingRangesFromTiles(sceneTiles());

      const contiguousCoverageEnd = (): number | undefined => {
        if (fullSceneOrder) return undefined;
        let count = 0;
        while (completedTiles.has(count)) count++;
        return Math.min(queryEnd, queryBegin + count * plan.tileSpan);
      };

      // Pin this request's tiles: the scene being built and everything the
      // viewport may reuse must not be evicted mid-query. The previous
      // scene's pins release only when a new request replaces them.
      for (const key of this.scenePins) this.sceneCache.unpin(key);
      this.scenePins = Array.from({ length: plan.tileCount }, (_, index) => cacheKeyFor(index));
      for (const key of this.scenePins) this.sceneCache.pin(key);

      const finish = (result: TrackSceneQueryResult) => {
        if (settled) return;
        settled = true;
        clean();
        this.lastStats = {
          chunks: chunkCount,
          slowestQueryArcMs,
          slowestChunkCycles,
          tiles: plan.tileCount,
          cachedTiles,
          guardReason: result.guardReason,
        };
        resolve(result);
      };
      const guard = (reason: NonNullable<TrackSceneQueryResult['guardReason']>) => {
        // A guarded query never pretends to be complete: the caller keeps the
        // previous complete scene or shows an explicit paused state.
        finish({ status: 'resource-guarded', guardReason: reason });
      };

      /** Adopt a cached tile into the scene rows, honouring lane demotions. */
      const adoptCachedTile = (index: number, entry: { lanes: readonly (TileLaneState | null)[]; rawEventCount: number }): void => {
        tileRows.forEach((row, trackIndex) => {
          const cached = entry.lanes[trackIndex] ?? null;
          row[index] = cached && demotedTracks.has(trackIndex)
            ? { ...cached, exact: [], representation: 'density' }
            : cached;
        });
        perTileRawCounts.set(index, entry.rawEventCount);
      };

      /** Drop the exact candidates one lane has already collected. */
      const demoteTrack = (trackIndex: number): void => {
        if (demotedTracks.has(trackIndex)) return;
        demotedTracks.add(trackIndex);
        for (const row of tileRows) {
          const lane = row[currentTileIndex];
          if (lane) row[currentTileIndex] = { ...lane, exact: [], representation: 'density' };
        }
        currentAccumulators?.[trackIndex]?.demote();
      };

      const publishProgress = (): void => {
        if (!onProgress) return;
        const now = monotonicNow();
        if (now - lastProgressAt < PREVIEW_PROGRESS_INTERVAL_MS) return;
        lastProgressAt = now;
        const tiles = sceneTiles();
        onProgress(assembleSceneBatch({
          generation,
          loopOffset,
          bandBegin: queryBegin,
          bandEnd: queryEnd,
          viewportBegin,
          viewportEnd,
          resolutionTier,
          status: 'progress',
          trackIds: tracks.map(track => track.id),
          tiles: tileRows,
          sounds: [...this.soundNames],
          coverageEnd: contiguousCoverageEnd(),
          sceneTiles: tiles,
          completedTiles: new Set(completedTiles),
          pendingRanges: progressRanges(),
          effectiveBinSpan: precision.effectiveBinSpan,
          exactBudget: precision.exactBudget,
        }));
      };

      const finalizeCurrentTile = (): void => {
        if (currentTileIndex < 0 || !currentAccumulators) return;
        const lanes = currentAccumulators.map(accumulator => accumulator.finalize());
        tileRows.forEach((row, trackIndex) => { row[currentTileIndex] = lanes[trackIndex]; });
        perTileRawCounts.set(currentTileIndex, lanes.reduce((sum, lane) => sum + lane.rawEventCount, 0));
        const key = cacheKeyFor(currentTileIndex);
        this.sceneCache.put(key, lanes, perTileRawCounts.get(currentTileIndex) ?? 0);
        completedTiles.add(currentTileIndex);
        currentAccumulators = null;
        currentTileDedup = null;
        currentTileIndex = -1;
      };

      const runSlice = (): void => {
        handle = null;
        if (settled) return;
        if (signal?.aborted || this.previewGenerationCount !== generation) { cancel(); return; }
        if (pageIsHidden()) { scheduleNextSlice(); return; }
        const sliceStarted = monotonicNow();
        try {
          while (true) {
            // No active tile: try the cache for the next one, else begin it.
            if (currentTileIndex < 0) {
              if (tileCursor >= tileOrder.length) {
                finish({ status: 'complete', batch: assembleSceneBatch({
                  generation, loopOffset,
                  bandBegin: queryBegin, bandEnd: queryEnd,
                  viewportBegin, viewportEnd,
                  resolutionTier,
                  status: 'complete',
                  trackIds: tracks.map(track => track.id),
                  tiles: tileRows,
                  sounds: [...this.soundNames],
                  sceneTiles: sceneTiles(),
                  completedTiles: new Set(completedTiles),
                  pendingRanges: progressRanges(),
                  effectiveBinSpan: precision.effectiveBinSpan,
                  exactBudget: precision.exactBudget,
                }) });
                return;
              }
              const nextTileIndex = tileOrder[tileCursor];
              currentTileIndexForOrder = nextTileIndex;
              const cached = this.sceneCache.get(cacheKeyFor(nextTileIndex));
              if (cached) {
                cachedTiles++;
                adoptCachedTile(nextTileIndex, cached);
                completedTiles.add(nextTileIndex);
                tileCursor += 1;
                publishProgress();
                continue;
              }
              currentTileIndex = nextTileIndex;
              chunkBegin = tileBeginAt(currentTileIndex);
              currentAccumulators = tracks.map(track =>
                new TrackLaneTileAccumulator(track.id, plan, currentTileIndex, {
                  maxExactCount: demotedTracks.has(tracks.indexOf(track)) ? 0 : maxExactCount,
                  pxPerCycle,
                }));
              currentTileDedup = tracks.map(() => new Set<string>());
              continue;
            }
            const tileEnd = tileEndAt(currentTileIndex);
            if (chunkBegin >= tileEnd - 1e-12) {
              finalizeCurrentTile();
              tileCursor += 1;
              currentTileIndexForOrder = tileOrder[tileCursor] ?? -1;
              chunkBegin = currentTileIndexForOrder >= 0 ? tileBeginAt(currentTileIndexForOrder) : tileEnd;
              publishProgress();
              continue;
            }
            if (haps === null) {
              currentChunkBegin = chunkBegin;
              currentChunkEnd = Math.min(tileEnd, chunkBegin + chunkWidth);
              currentChunkStarted = monotonicNow();
              haps = pattern.queryArc(
                loopOffset + currentChunkBegin,
                loopOffset + currentChunkEnd,
                { _cps: cps },
              ) ?? [];
              hapIndex = 0;
              chunkCount += 1;
              // A synchronous query may itself be expensive; measure that
              // unbreakable window alone for both the guard and adaptation.
              currentQueryDuration = monotonicNow() - currentChunkStarted;
              if (currentQueryDuration > slowestQueryArcMs) {
                slowestQueryArcMs = currentQueryDuration;
                slowestChunkCycles = currentChunkEnd - currentChunkBegin;
              }
              if (currentQueryDuration > PREVIEW_LONG_TASK_MS) { guard('long-task'); return; }
            }

            while (haps && hapIndex < haps.length) {
              if (hapIndex > 0 && monotonicNow() - sliceStarted >= workSliceMs) {
                scheduleNextSlice();
                return;
              }
              const hap = haps[hapIndex++];
              const trackId = hap.context?.oddenovaTrack;
              if (typeof trackId !== 'string' || !this.ids.has(trackId)) {
                // Unexpected provenance must never strand music in a partly
                // muted state; the preview keeps its last complete scene.
                this.unsupported();
                finish({ status: 'failed' });
                return;
              }
              const span = hap.whole ?? hap.part;
              const absoluteBegin = Number(span?.begin);
              const absoluteEnd = Number(span?.end);
              if (!Number.isFinite(absoluteBegin) || !Number.isFinite(absoluteEnd) || absoluteEnd <= absoluteBegin) continue;
              const value = hap.value && typeof hap.value === 'object' ? hap.value as Record<string, unknown> : {};
              // A silent gain/mask should not look like a sounding note.
              if (value.gain === 0 || value.velocity === 0) continue;
              const chunkStart = loopOffset + currentChunkBegin;
              const chunkEnd = loopOffset + currentChunkEnd;
              // Half-open chunk coverage: haps that only touch earlier or
              // later chunks belong to them.
              if (absoluteEnd <= chunkStart + 1e-9 || absoluteBegin >= chunkEnd - 1e-9) continue;
              const trackIndex = trackIndexById.get(trackId) ?? -1;
              const accumulator = trackIndex >= 0 ? currentAccumulators?.[trackIndex] : null;
              const dedup = trackIndex >= 0 ? currentTileDedup?.[trackIndex] : null;
              if (!accumulator || !dedup) continue;
              const sound = String(value.s ?? '');
              const pitch = pitchOf(value);
              const displayBegin = absoluteBegin - loopOffset;
              const displayEnd = absoluteEnd - loopOffset;
              // Some timing/effect transforms expose the same visual hap
              // twice; drawing or counting both would falsify the picture.
              const key = `${trackIndex}|${displayBegin.toFixed(9)}|${displayEnd.toFixed(9)}|${soundIdOf(sound)}|${pitch}`;
              if (dedup.has(key)) continue;
              dedup.add(key);
              // The first band chunk keeps sustains that began before the
              // band so a held note is not cut into a fake attack; every
              // later chunk owns only its half-open onset range.
              const tileStart = loopOffset + tileBeginAt(currentTileIndex);
              const ownsOnset = fullSceneOrder
                ? absoluteBegin >= tileStart - 1e-9 && absoluteBegin < chunkEnd - 1e-9
                : firstBandChunk
                  ? absoluteBegin < chunkEnd - 1e-9 && (absoluteBegin < chunkStart + 1e-9 || absoluteBegin >= chunkStart)
                  : absoluteBegin >= chunkStart && absoluteBegin < chunkEnd;
              accumulator.addEvent(
                { begin: displayBegin, end: displayEnd, pitch, soundId: soundIdOf(sound) },
                { ownsOnset },
              );
              // One unresolvable event demotes the whole lane: its columns
              // already hold every event, so nothing is lost. The threshold
              // is screen complexity, never a query limit.
              if (ownsOnset && (absoluteEnd - absoluteBegin) * pxPerCycle < MIN_EXACT_WIDTH_PX) {
                demoteTrack(trackIndex);
              }
            }

            // Adapt only to queryArc's synchronous cost. Projection may span
            // several scheduled slices, but every yield is observable progress
            // rather than evidence that the minimum query width is stuck.
            if (currentQueryDuration > workSliceMs) chunkWidth = Math.max(MIN_QUERY_CHUNK_CYCLES, chunkWidth / 2);
            else if (currentQueryDuration < 1) chunkWidth = Math.min(MAX_QUERY_CHUNK_CYCLES, chunkWidth * 2);
            chunkBegin = currentChunkEnd;
            haps = null;
            firstBandChunk = false;
            if (monotonicNow() - sliceStarted >= workSliceMs) {
              scheduleNextSlice();
              return;
            }
          }
        } catch (error) {
          if (!settled) {
            // Allocation failure is a resource guard, not a data failure.
            if (error instanceof RangeError) { guard('allocation'); return; }
            // A pattern failure keeps the track list, solo and mutes; only
            // the preview result is marked failed.
            finish({ status: 'failed' });
          }
        }
      };

      // The first small slice can start immediately when the caller is
      // paused/stopped; subsequent chunks always yield. This keeps an empty
      // or tiny preview available in the same interaction while ensuring a
      // dense band never runs as one monolithic task.
      runSlice();
    });
  };
}
