import { parser } from '@lezer/javascript';
import { parseScore } from '../agent/parser';
import { centeredWindowBegin, validLoopCycles } from '../lib/track-timeline';

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
 * One frame sample request. `loopCycles` is the piece's finite range the
 * caller already derived; omitting it must never silently re-enable an
 * unbounded track. `follow` derives the window from the displayed playhead in
 * the same read (continuous centred follow); a fixed window serves manual
 * browsing and frozen drag gestures.
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
export interface TrackEvent {
  trackId: string; begin: number; end: number; sound: string; pitch: number | null;
  /**
   * The visual identity: the same tuple the deduplication uses, over the
   * *uncropped* display-domain boundaries. Stable across adjacent windows,
   * so a shared event keeps its DOM node while only its geometry updates;
   * it carries the generation-scoped trackId, so a new work never reuses
   * an old node.
   */
  key: string;
}
/**
 * One frame, plus whether the raw query returned more events than the
 * processing budget — the drawn window then shows only a prefix, so the
 * interface must say the preview is incomplete instead of implying silence.
 */
export interface TrackFrame { now: number; begin: number; end: number; limited: boolean; events: TrackEvent[] }
interface PreviewMeta { tracks: PreviewTrack[]; stackRange?: TrackSourceRange }
interface RenameVersion { code: string; tracks: PreviewTrack[] }
type Transpiled = { output: string; oddenovaTracks?: PreviewMeta };
const EMPTY: Omit<TrackSnapshot, 'revision'> = { tracks: [], soloId: null, mutedIds: new Set(), status: 'idle' };
/** How many raw haps one frame may process; a wider window can overflow it. */
export const PREVIEW_EVENT_BUDGET = 2048;

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

/**
 * A fixed viewport is only usable when it is a finite, non-empty, forward
 * window inside the piece's [0, L] range.
 */
function validViewport(viewport: { begin: number; end: number } | undefined, loopCycles: number): TrackViewport | null {
  if (!viewport) return null;
  const { begin, end } = viewport;
  if (!Number.isFinite(begin) || !Number.isFinite(end) || end <= begin) return null;
  if (begin < 0 || end > loopCycles) return null;
  return { begin, end };
}

/**
 * Resolve the displayed window for one sample, entirely inside [0, L].
 * Follow requests derive it from the displayed playhead `displayNow` in the
 * same read; a fixed window must already be a valid in-range viewport — the
 * callers (the viewport hook) guarantee that, and an out-of-range one is
 * clamped rather than trusted.
 */
function resolveFrameWindow(displayNow: number, request: TrackFrameRequest): TrackViewport {
  const loopCycles = request.loopCycles;
  const viewport = request.viewport;
  const span = 'mode' in viewport && viewport.mode === 'follow' ? viewport.span : null;
  if (span !== null && Number.isFinite(span) && span > 0) {
    const begin = centeredWindowBegin(displayNow, span, loopCycles);
    return { begin, end: Math.min(begin + span, loopCycles) };
  }
  if (span !== null) {
    // An unusable follow span: a centred window of the last-resort width.
    const begin = centeredWindowBegin(displayNow, 4, loopCycles);
    return { begin, end: Math.min(begin + 4, loopCycles) };
  }
  const fixed = viewport as { begin: number; end: number };
  const valid = validViewport(fixed, loopCycles);
  if (valid) return valid;
  const clampedEnd = Math.min(Math.max(0, fixed.end ?? 0), loopCycles);
  const clampedBegin = Math.min(Math.max(0, fixed.begin ?? 0), clampedEnd);
  return { begin: clampedBegin, end: clampedEnd };
}

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

/** Temporary audition state. No editor writes, transport changes, or value/gain mutations. */
export class TrackPreview {
  private generation = 0;
  private pattern: PreviewPattern | null = null;
  private current: TrackSnapshot = { ...EMPTY, revision: 0 };
  private ids = new Set<string>();
  // The exact code the committed tracks were compiled from — immutable for
  // the generation, and the proof of where the sounding pattern came from.
  private compiledCode: string | null = null;
  // The code the current names and navigation ranges point at: the compiled
  // source plus every confirmed pure rename since. Navigation trusts this
  // version, never the compiled one.
  private mappedCode: string | null = null;
  private stackRange: TrackSourceRange | null = null;
  // Bumped by every committed compile. Rename history binds to it: a new
  // compile rebuilds the mapping, so old conversions must not match again
  // even when the new source text happens to equal an old version.
  private mappingEpochCount = 0;
  private listeners = new Set<() => void>();
  get snapshot(): TrackSnapshot { return this.current; }
  subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener);
    return () => { this.listeners.delete(listener); };
  };
  private publish(snapshot: Omit<TrackSnapshot, 'revision'>): void {
    this.current = { ...snapshot, revision: this.current.revision + 1 };
    this.ids = new Set(snapshot.tracks.map(t => t.id));
    this.listeners.forEach(listener => listener());
  }

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
    const generation = ++this.generation;
    const tracks = score.layers.map((layer, index) => ({
      id: `${generation}:${index}`,
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
      },
    };
  }

  commit(pattern: PreviewPattern, meta?: { oddenovaTracks?: { tracks?: PreviewTrack[]; sourceCode?: string; stackRange?: TrackSourceRange } }): void {
    this.mappingEpochCount++;
    this.pattern = pattern;
    const compiled = meta?.oddenovaTracks;
    const tracks = compiled?.tracks ?? [];
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
  get compileGeneration(): number { return this.generation; }
  /** Increments on every committed compile; rename history binds to this. */
  get mappingEpoch(): number { return this.mappingEpochCount; }

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
    this.pattern = null;
    this.compiledCode = null;
    this.mappedCode = null;
    this.stackRange = null;
    this.publish(EMPTY);
  };
  private unsupported(): void { this.pattern = null; this.publish({ ...EMPTY, status: 'unsupported' }); }
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
  /**
   * Build one sample of the track view. `absoluteCycle` is the real transport
   * position, which may run far past one pass of the loop; `request.loopCycles`
   * is the finite range both the playhead and the window live in. One read
   * decides everything: the displayed playhead and window, the absolute query
   * that covers the *current* pass (so random and time-dependent patterns
   * show what is actually sounding), and the events mapped back into display
   * coordinates by subtracting that pass's offset.
   */
  frame = (absoluteCycle: number, cps: number, request: TrackFrameRequest): TrackFrame => {
    const loopCycles = request?.loopCycles;
    if (!validLoopCycles(loopCycles)) {
      // No usable range: an empty finite frame, never an unbounded timeline.
      return { now: 0, begin: 0, end: 0, limited: false, events: [] };
    }
    const absoluteNow = Number.isFinite(absoluteCycle) ? Math.max(0, absoluteCycle) : 0;
    // A stopped/paused transport parked exactly on the loop end keeps it as a
    // visible endpoint; a running one (or any position beyond) wraps into the
    // current pass.
    const displayNow = !Number.isFinite(absoluteCycle) ? 0
      : absoluteNow === loopCycles ? loopCycles
        : absoluteNow % loopCycles;
    const loopOffset = absoluteNow === loopCycles ? 0 : Math.floor(absoluteNow / loopCycles) * loopCycles;
    const window = resolveFrameWindow(displayNow, request);
    const frame: TrackFrame = { now: displayNow, begin: window.begin, end: window.end, limited: false, events: [] };
    if (!this.pattern || !this.current.tracks.length) return frame;
    try {
      const haps = this.pattern.queryArc(loopOffset + frame.begin, loopOffset + frame.end, { _cps: cps });
      // The budget truncates processing, not the query itself: when the raw
      // result overflows it, the window is drawn as a prefix and flagged so
      // the interface can say the preview is incomplete rather than silent.
      if (haps.length > PREVIEW_EVENT_BUDGET) frame.limited = true;
      const seenVisualEvents = new Set<string>();
      for (const hap of haps.slice(0, PREVIEW_EVENT_BUDGET)) {
        const trackId = hap.context?.oddenovaTrack;
        if (typeof trackId !== 'string' || !this.ids.has(trackId)) { this.unsupported(); return frame; }
        const span = hap.whole ?? hap.part;
        const absoluteBegin = Number(span?.begin), absoluteEnd = Number(span?.end);
        if (!Number.isFinite(absoluteBegin) || !Number.isFinite(absoluteEnd) || absoluteEnd <= absoluteBegin) continue;
        const value = hap.value && typeof hap.value === 'object' ? hap.value as Record<string, unknown> : {};
        // A silent gain/mask should not look like a sounding note.
        if (value.gain === 0 || value.velocity === 0) continue;
        // Back into the displayed pass's coordinates: the same domain the
        // playhead and the window speak.
        const event = {
          trackId,
          begin: absoluteBegin - loopOffset,
          end: absoluteEnd - loopOffset,
          sound: String(value.s ?? ''),
          pitch: pitchOf(value),
        };
        // Some combinations of timing/effect transforms can expose the same
        // visual hap more than once. The preview is a geometric projection, so
        // drawing both copies would alpha-stack them into a falsely darker note.
        // The same tuple doubles as the event's visual identity for React keys.
        const key = JSON.stringify([event.trackId, event.begin, event.end, event.sound, event.pitch]);
        if (seenVisualEvents.has(key)) continue;
        seenVisualEvents.add(key);
        frame.events.push({ ...event, key });
      }
    } catch { this.unsupported(); }
    return frame;
  };
}
