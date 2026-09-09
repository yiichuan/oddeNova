import { parser } from '@lezer/javascript';
import { parseScore } from '../agent/parser';

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
export interface PreviewTrack { id: string; name: string }
export interface TrackSnapshot {
  tracks: PreviewTrack[];
  soloId: string | null;
  status: 'idle' | 'ready' | 'unsupported';
  /** Lets consumers redraw when the snapshot changes without a new track list. */
  revision: number;
}
export interface TrackEvent {
  trackId: string; begin: number; end: number; sound: string; pitch: number | null;
}
export interface TrackFrame { now: number; begin: number; end: number; events: TrackEvent[] }
interface PreviewMeta { tracks: PreviewTrack[] }
type Transpiled = { output: string; oddenovaTracks?: PreviewMeta };
const EMPTY: Omit<TrackSnapshot, 'revision'> = { tracks: [], soloId: null, status: 'idle' };
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

/** Temporary audition state. No editor writes, transport changes, or value/gain mutations. */
export class TrackPreview {
  private generation = 0;
  private pattern: PreviewPattern | null = null;
  private current: TrackSnapshot = { ...EMPTY, revision: 0 };
  private ids = new Set<string>();
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
    const tracks = score.layers.map((layer, index) => ({ id: `${generation}:${index}`, name: layer.name }));
    let output = result.output;
    for (let i = outputArgs.length - 1; i >= 0; i--) {
      const arg = outputArgs[i];
      // Instrument AFTER transpilation so mini locations and editor widgets
      // continue to reference the untouched original document.
      const tagged = `stack(${output.slice(arg.from, arg.to)}).withContext(context => ({...context, oddenovaTrack: '${tracks[i].id}'}))`;
      output = output.slice(0, arg.from) + tagged + output.slice(arg.to);
    }
    return { ...result, output, oddenovaTracks: { tracks } };
  }

  commit(pattern: PreviewPattern, meta?: { oddenovaTracks?: PreviewMeta }): void {
    this.pattern = pattern;
    const tracks = meta?.oddenovaTracks?.tracks ?? [];
    this.publish({ tracks, soloId: null, status: tracks.length ? 'ready' : 'unsupported' });
  }
  /** Notify track consumers that the transport position changed. */
  refresh = (): void => { this.publish(this.current); };
  reset = (): void => { this.pattern = null; this.publish(EMPTY); };
  private unsupported(): void { this.pattern = null; this.publish({ ...EMPTY, status: 'unsupported' }); }
  clearSolo = (): void => {
    if (this.current.soloId !== null) this.publish({ ...this.current, soloId: null });
  };
  toggleSolo = (id: string): void => {
    if (!this.ids.has(id)) return;
    this.publish({ ...this.current, soloId: this.current.soloId === id ? null : id });
  };
  isAudible = (hap: PreviewHap): boolean => {
    if (!this.current.soloId) return true;
    const id = hap.context?.oddenovaTrack;
    if (typeof id !== 'string' || !this.ids.has(id)) {
      // Unexpected provenance must never strand music in a partly muted state.
      this.unsupported();
      return true;
    }
    return id === this.current.soloId;
  };
  frame = (cycle: number, cps: number): TrackFrame => {
    const now = Number.isFinite(cycle) ? Math.max(0, cycle) : 0;
    const frame: TrackFrame = { now, begin: now - 2, end: now + 2, events: [] };
    if (!this.pattern || !this.current.tracks.length) return frame;
    try {
      const haps = this.pattern.queryArc(Math.max(0, frame.begin), frame.end, { _cps: cps });
      const seenVisualEvents = new Set<string>();
      for (const hap of haps.slice(0, 2048)) {
        const trackId = hap.context?.oddenovaTrack;
        if (typeof trackId !== 'string' || !this.ids.has(trackId)) { this.unsupported(); return frame; }
        const span = hap.whole ?? hap.part;
        const begin = Number(span?.begin), end = Number(span?.end);
        if (!Number.isFinite(begin) || !Number.isFinite(end) || end <= begin) continue;
        const value = hap.value && typeof hap.value === 'object' ? hap.value as Record<string, unknown> : {};
        // A silent gain/mask should not look like a sounding note.
        if (value.gain === 0 || value.velocity === 0) continue;
        const event = { trackId, begin, end, sound: String(value.s ?? ''), pitch: pitchOf(value) };
        // Some combinations of timing/effect transforms can expose the same
        // visual hap more than once. The preview is a geometric projection, so
        // drawing both copies would alpha-stack them into a falsely darker note.
        const visualKey = JSON.stringify([event.trackId, event.begin, event.end, event.sound, event.pitch]);
        if (seenVisualEvents.has(visualKey)) continue;
        seenVisualEvents.add(visualKey);
        frame.events.push(event);
      }
    } catch { this.unsupported(); }
    return frame;
  };
}
