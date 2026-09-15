// Pure track-rename logic: name validation, the minimal source patch, and the
// re-parsed metadata for every track after the patch. No DOM, no services, no
// React state — the caller owns applying the patch and publishing results.
import { parseScore, type ParsedRange } from '../agent/parser';

/** A half-open UTF-16 code-unit range in the full editor document. */
export interface TrackRenameRange {
  from: number;
  to: number;
}

/** The per-track metadata a rename needs and re-derives. Mirrors PreviewTrack. */
export interface TrackRenameTrack {
  id: string;
  name: string;
  /** The slot this track was located in; required to insert a missing marker. */
  sourceRange?: TrackRenameRange;
  markerRange?: TrackRenameRange;
  nameRange?: TrackRenameRange;
  /** Generation-stable colour identity; carried over unchanged by a rename. */
  colorKey?: string;
}

export interface TrackRenameContext {
  /** The document the mapping is trusted against (the current editor text). */
  code: string;
  tracks: readonly TrackRenameTrack[];
  /** Full-document range of the supported `stack(...)` expression. */
  stackRange: TrackRenameRange;
}

export type TrackNameErrorReason = 'empty' | 'too-long' | 'invalid-character';

export type TrackRenameOutcome =
  | {
      status: 'ok';
      /** The single CodeMirror change: replace the name characters, nothing else. */
      patch: { from: number; to: number; insert: string };
      nextCode: string;
      /** Re-derived metadata for every track, same ids in the same order. */
      tracks: TrackRenameTrack[];
    }
  | { status: 'invalid-name'; reason: TrackNameErrorReason }
  | { status: 'stale-code' }
  | { status: 'unknown-track' };

export const MAX_TRACK_NAME_LENGTH = 64;

/** Marker inserted for a layer that had none; one trailing space keeps the expression apart. */
const INSERTED_MARKER_PREFIX = '/* @layer ';
const INSERTED_MARKER_SUFFIX = ' */ ';

// Control characters (Cc), line/paragraph separators (Zl/Zp) and `*` are all
// rejected: they either break the block comment or cannot survive a re-parse.
const INVALID_NAME_CHARS = /[\p{Cc}\p{Zl}\p{Zp}]/u;

export function validateTrackName(rawName: string): { name: string } | { reason: TrackNameErrorReason } {
  const name = rawName.trim();
  if (!name) return { reason: 'empty' };
  if (Array.from(name).length > MAX_TRACK_NAME_LENGTH) return { reason: 'too-long' };
  if (name.includes('*') || INVALID_NAME_CHARS.test(name)) return { reason: 'invalid-character' };
  return { name };
}

/** Trim whitespace-only edges off a slot range, keeping it non-empty. */
function trimRange(range: TrackRenameRange, code: string): TrackRenameRange {
  let from = range.from;
  let to = range.to;
  while (from < to && /\s/.test(code[from] ?? '')) from++;
  while (to > from && /\s/.test(code[to - 1] ?? '')) to--;
  return { from, to };
}

/**
 * Remove every layer marker comment from a parsed stack slice. `swallowIndex`
 * names the one layer whose marker was just inserted: the single separator
 * space after the closing star-slash is removed with it, so a fresh marker
 * strips back to the exact original text.
 */
function stripLayerMarkers(
  slice: string,
  layers: readonly { markerRange?: ParsedRange }[],
  swallowIndex: number,
): string {
  const cuts: TrackRenameRange[] = [];
  for (let i = 0; i < layers.length; i++) {
    const marker = layers[i].markerRange;
    if (!marker) continue;
    let to = marker.to;
    if (i === swallowIndex && /\s/.test(slice[to] ?? '')) to++;
    cuts.push({ from: marker.from, to });
  }
  let result = '';
  let cursor = 0;
  for (const cut of cuts.sort((a, b) => a.from - b.from)) {
    result += slice.slice(cursor, cut.from);
    cursor = cut.to;
  }
  return result + slice.slice(cursor);
}

function sliceCode(code: string, range: TrackRenameRange | undefined): string | null {
  if (!range || range.from < 0 || range.to > code.length || range.from > range.to) return null;
  return code.slice(range.from, range.to);
}

/**
 * Build one rename as a single minimal patch over `context.code`.
 *
 * Failure produces no side effects and a typed status; success guarantees the
 * music is untouched: the re-parsed layers must keep every expression text
 * identical, keep every explicitly named layer's name, and only re-derive the
 * auto names (`layer_N`), whose numbering legitimately shifts when an earlier
 * unmarked layer gains a marker.
 */
export function buildTrackRename(context: TrackRenameContext, trackId: string, rawName: string): TrackRenameOutcome {
  const validated = validateTrackName(rawName);
  if ('reason' in validated) return { status: 'invalid-name', reason: validated.reason };
  const name = validated.name;

  const index = context.tracks.findIndex(track => track.id === trackId);
  if (index < 0) return { status: 'unknown-track' };
  const track = context.tracks[index];

  // The ranges must still describe this exact document; anything else means
  // the mapping expired and guessing a position is forbidden.
  if (!track.sourceRange || sliceCode(context.code, track.sourceRange) === null) return { status: 'stale-code' };

  let patch: { from: number; to: number; insert: string };
  const insertedMarker = !track.markerRange;
  if (track.markerRange && track.nameRange) {
    if (sliceCode(context.code, track.nameRange) !== track.name) return { status: 'stale-code' };
    if (sliceCode(context.code, track.markerRange) === null) return { status: 'stale-code' };
    patch = { from: track.nameRange.from, to: track.nameRange.to, insert: name };
  } else {
    // No marker yet: insert one at the slot's first character (slot edges are
    // already whitespace-trimmed), on the same line, before any `//` comment.
    const slot = trimRange(track.sourceRange, context.code);
    if (slot.from >= slot.to) return { status: 'stale-code' };
    patch = { from: slot.from, to: slot.from, insert: `${INSERTED_MARKER_PREFIX}${name}${INSERTED_MARKER_SUFFIX}` };
  }

  // The patch must live strictly inside the supported stack's parentheses so
  // the stack range itself only ever shifts by the patch's length delta.
  if (patch.from < context.stackRange.from || patch.to > context.stackRange.to) return { status: 'stale-code' };

  const nextCode = context.code.slice(0, patch.from) + patch.insert + context.code.slice(patch.to);
  const delta = nextCode.length - context.code.length;
  const nextStackRange: TrackRenameRange = { from: context.stackRange.from, to: context.stackRange.to + delta };

  const before = parseScore(context.code.slice(context.stackRange.from, context.stackRange.to));
  const after = parseScore(nextCode.slice(nextStackRange.from, nextStackRange.to));
  if (before.layers.length !== context.tracks.length || after.layers.length !== before.layers.length) {
    return { status: 'stale-code' };
  }

  // Structural invariance, the way the plan defines it: with every @layer
  // marker comment lifted out, the two stack slices must be byte-identical.
  // This catches lying ranges, shifted slot boundaries and any accidental
  // expression change, while tolerating the whitespace the marker match
  // itself consumes around a freshly inserted marker.
  const beforeText = stripLayerMarkers(context.code.slice(context.stackRange.from, context.stackRange.to), before.layers, -1);
  const afterText = stripLayerMarkers(nextCode.slice(nextStackRange.from, nextStackRange.to), after.layers, insertedMarker ? index : -1);
  if (beforeText !== afterText) return { status: 'stale-code' };

  for (let i = 0; i < after.layers.length; i++) {
    // Explicitly named layers keep their names; only auto names may renumber.
    if (i !== index && before.layers[i].markerRange && after.layers[i].name !== before.layers[i].name) {
      return { status: 'stale-code' };
    }
  }
  if (after.layers[index].name !== name) return { status: 'stale-code' };

  const tracks = after.layers.map((layer, i) => ({
    id: context.tracks[i].id,
    name: layer.name,
    colorKey: context.tracks[i].colorKey ?? context.tracks[i].name,
    sourceRange: trimRange(
      { from: nextStackRange.from + layer.rawStart, to: nextStackRange.from + layer.rawEnd },
      nextCode,
    ),
    markerRange: layer.markerRange
      ? {
          from: nextStackRange.from + layer.markerRange.from,
          to: nextStackRange.from + layer.markerRange.to,
        }
      : undefined,
    nameRange: layer.nameRange
      ? {
          from: nextStackRange.from + layer.nameRange.from,
          to: nextStackRange.from + layer.nameRange.to,
        }
      : undefined,
  }));

  return { status: 'ok', patch, nextCode, tracks };
}
