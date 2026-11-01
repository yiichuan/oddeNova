import { parseScore } from '../../agent/parser';
import type { ChatMessage } from '../../hooks/useChat';
import { formatPlaybackTime, getStrudelLoopCycles } from '../../lib/strudel-timing';
import type { LayerEvent } from '../strudel';

const DEFAULT_CPS = 0.5;
// A layer that exits and re-enters prints one range per stretch; beyond this the
// card shows its first-to-last span instead of a column of fragments.
const MAX_SEGMENTS = 2;
// Querying is bounded so an unusually long arrangement cannot stall the share dialog.
const MAX_QUERY_CYCLES = 4096;

/** Layer code with comments and layout removed; string literals (mini-notation) are kept whole. */
function musicalSource(source: string): string {
  let out = '';
  for (let i = 0; i < source.length; i++) {
    const char = source[i];
    if (char === '"' || char === "'" || char === '`') {
      let end = i + 1;
      while (end < source.length && source[end] !== char) end += source[end] === '\\' ? 2 : 1;
      out += source.slice(i, end + 1);
      i = end;
    } else if (char === '/' && source[i + 1] === '/') {
      while (i < source.length && source[i] !== '\n') i++;
    } else if (char === '/' && source[i + 1] === '*') {
      const close = source.indexOf('*/', i + 2);
      i = close < 0 ? source.length : close + 1;
    } else if (!/\s/.test(char)) {
      out += char;
    }
  }
  return out;
}
const sameSource = (a: string, b: string) => musicalSource(a) === musicalSource(b);

/**
 * The agent's short note for each layer of `code`, looked up from the assistant turns
 * that committed it. A note only applies while its layer is unchanged: hand-written,
 * pasted or hand-edited layers have none, and the card leaves that line out.
 */
export function resolveLayerNotes(code: string, messages: ChatMessage[]): Record<string, string> {
  const notes: Record<string, string> = {};
  const noted = messages.filter(message => message.role === 'assistant' && message.code && message.layerNotes).reverse();
  for (const layer of parseScore(code).layers) {
    for (const message of noted) {
      const note = message.layerNotes?.[layer.name];
      if (!note) continue;
      const committed = parseScore(message.code!).layers.find(candidate => candidate.name === layer.name);
      if (committed && sameSource(committed.source, layer.source)) {
        notes[layer.name] = note;
        break;
      }
    }
  }
  return notes;
}

/**
 * Stretches of the loop in which a layer is audible, in cycles. Silences shorter than
 * a bar-scale gap are part of the playing (rests, sparse hits); longer ones mean the
 * layer left and came back.
 */
export function audibleSegments(events: LayerEvent[], totalCycles: number): [number, number][] {
  const sorted = events
    .map(({ begin, end }) => [Math.max(0, begin), Math.min(totalCycles, end)] as [number, number])
    .filter(([begin, end]) => end > begin)
    .sort((a, b) => a[0] - b[0]);
  if (sorted.length === 0) return [];
  const minGap = Math.max(4, totalCycles / 10);
  const segments: [number, number][] = [[...sorted[0]]];
  for (const [begin, end] of sorted.slice(1)) {
    const last = segments[segments.length - 1];
    if (begin - last[1] < minGap) last[1] = Math.max(last[1], end);
    else segments.push([begin, end]);
  }
  return segments.length > MAX_SEGMENTS ? [[segments[0][0], segments[segments.length - 1][1]]] : segments;
}

/**
 * Printed loop ranges ("00:08 – 00:56") per layer name, `''` for code without a stack.
 * Ranges come from the events the engine actually produces, so masks and gain
 * envelopes are reflected. Any failure yields no ranges, and the card prints "—"
 * rather than a guess.
 */
export async function resolveLayerRanges(code: string): Promise<Record<string, string[]>> {
  const totalCycles = getStrudelLoopCycles(code);
  const parsedCps = parseScore(code).cps;
  const cps = parsedCps != null && parsedCps > 0 ? parsedCps : DEFAULT_CPS;
  try {
    const { queryLayerEvents } = await import('../strudel');
    const events = await queryLayerEvents(code, Math.min(totalCycles, MAX_QUERY_CYCLES));
    const ranges: Record<string, string[]> = {};
    for (const [name, layerEvents] of events) {
      ranges[name] = audibleSegments(layerEvents, totalCycles)
        .map(([begin, end]) => `${formatPlaybackTime(begin / cps)} – ${formatPlaybackTime(end / cps)}`);
    }
    return ranges;
  } catch {
    return {};
  }
}
