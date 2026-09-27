// Pure track-reorder logic: reorder top-level stack arguments while keeping
// each layer's source and its stable UI identity together.
import { parseScore, type ParsedRange } from '../agent/parser';
import type { TrackRenameContext, TrackRenameRange, TrackRenameTrack } from './track-rename';

export type TrackReorderContext = TrackRenameContext;

export type TrackReorderOutcome =
  | {
      status: 'ok';
      patch: { from: number; to: number; insert: string };
      nextCode: string;
      stackRange: TrackRenameRange;
      tracks: TrackRenameTrack[];
    }
  | { status: 'unchanged' }
  | { status: 'stale-code' }
  | { status: 'unknown-track' };

function trimRange(range: TrackRenameRange, code: string): TrackRenameRange {
  let from = range.from;
  let to = range.to;
  while (from < to && /\s/.test(code[from] ?? '')) from++;
  while (to > from && /\s/.test(code[to - 1] ?? '')) to--;
  return { from, to };
}

function sliceCode(code: string, range: TrackRenameRange | undefined): string | null {
  if (!range || range.from < 0 || range.to > code.length || range.from > range.to) return null;
  return code.slice(range.from, range.to);
}

function sameRange(left: TrackRenameRange | undefined, right: TrackRenameRange | undefined): boolean {
  return left?.from === right?.from && left?.to === right?.to;
}

function markerMatches(track: TrackRenameTrack, marker: ParsedRange | undefined, name: string, base: number): boolean {
  if (!marker) return !track.markerRange && !track.nameRange;
  return sameRange(track.markerRange, { from: base + marker.from, to: base + marker.to })
    && Boolean(track.nameRange)
    && track.nameRange!.from >= base + marker.from
    && track.nameRange!.to <= base + marker.to
    && track.name === name;
}

function addLayerMarker(segment: string, name: string): string | null {
  let index = 0;
  while (index < segment.length && /\s/.test(segment[index])) index++;
  if (index >= segment.length) return null;
  // Names have already passed the same constraints as the rename flow: `*`
  // and line separators cannot terminate or corrupt the block comment.
  return `${segment.slice(0, index)}/* @layer ${name} */ ${segment.slice(index)}`;
}

/**
 * Move one layer to its final index in the list after removing that layer.
 * Missing markers are added before the move so auto-generated names do not
 * change when the source order changes.
 */
export function buildTrackReorder(
  context: TrackReorderContext,
  trackId: string,
  targetIndex: number,
): TrackReorderOutcome {
  const sourceIndex = context.tracks.findIndex(track => track.id === trackId);
  if (sourceIndex < 0) return { status: 'unknown-track' };
  const count = context.tracks.length;
  if (!Number.isInteger(targetIndex) || targetIndex < 0 || targetIndex >= count) return { status: 'stale-code' };
  if (targetIndex === sourceIndex) return { status: 'unchanged' };

  const stackText = sliceCode(context.code, context.stackRange);
  if (!stackText) return { status: 'stale-code' };
  const parsed = parseScore(stackText);
  if (!parsed.hasStack || parsed.layers.length !== count || parsed.stackArgsStart < 0 || parsed.stackArgsEnd < parsed.stackArgsStart) {
    return { status: 'stale-code' };
  }

  const stackBase = context.stackRange.from;
  const segments: string[] = [];
  const sourceRanges: TrackRenameRange[] = [];
  for (let index = 0; index < count; index++) {
    const layer = parsed.layers[index];
    const track = context.tracks[index];
    const sourceRange = trimRange({
      from: stackBase + layer.rawStart,
      to: stackBase + layer.rawEnd,
    }, context.code);
    if (track.name !== layer.name
      || !sameRange(track.sourceRange, sourceRange)
      || !markerMatches(track, layer.markerRange, layer.name, stackBase)) {
      return { status: 'stale-code' };
    }
    sourceRanges.push(sourceRange);
    const raw = context.code.slice(sourceRange.from, sourceRange.to);
    const segment = layer.markerRange ? raw : addLayerMarker(raw, track.name);
    if (segment === null) return { status: 'stale-code' };
    segments.push(segment);
  }

  const orderedTracks = [...context.tracks];
  const [movingTrack] = orderedTracks.splice(sourceIndex, 1);
  orderedTracks.splice(targetIndex, 0, movingTrack);
  const orderedSegments = [...segments];
  const [movingSegment] = orderedSegments.splice(sourceIndex, 1);
  orderedSegments.splice(targetIndex, 0, movingSegment);

  const argsFrom = stackBase + parsed.stackArgsStart;
  const argsTo = stackBase + parsed.stackArgsEnd;
  const prefix = context.code.slice(argsFrom, sourceRanges[0].from);
  const separators: string[] = [];
  for (let index = 0; index < count - 1; index++) {
    separators.push(context.code.slice(sourceRanges[index].to, sourceRanges[index + 1].from));
    if (!separators[index].includes(',')) return { status: 'stale-code' };
  }
  const tail = context.code.slice(sourceRanges[count - 1].to, argsTo);
  let reorderedArgs = prefix;
  for (let index = 0; index < count; index++) {
    reorderedArgs += orderedSegments[index];
    reorderedArgs += index < count - 1 ? separators[index] : tail;
  }

  const nextCode = context.code.slice(0, argsFrom) + reorderedArgs + context.code.slice(argsTo);
  const nextStackRange = { from: context.stackRange.from, to: context.stackRange.to + reorderedArgs.length - (argsTo - argsFrom) };
  const nextStackText = nextCode.slice(nextStackRange.from, nextStackRange.to);
  const reparsed = parseScore(nextStackText);
  if (reparsed.layers.length !== count || reparsed.layers.some((layer, index) => layer.name !== orderedTracks[index].name || !layer.markerRange)) {
    return { status: 'stale-code' };
  }

  const tracks = reparsed.layers.map((layer, index) => {
    const prior = orderedTracks[index];
    return {
      ...prior,
      sourceRange: trimRange({
        from: nextStackRange.from + layer.rawStart,
        to: nextStackRange.from + layer.rawEnd,
      }, nextCode),
      markerRange: layer.markerRange
        ? { from: nextStackRange.from + layer.markerRange.from, to: nextStackRange.from + layer.markerRange.to }
        : undefined,
      nameRange: layer.nameRange
        ? { from: nextStackRange.from + layer.nameRange.from, to: nextStackRange.from + layer.nameRange.to }
        : undefined,
    };
  });

  return {
    status: 'ok',
    patch: { from: argsFrom, to: argsTo, insert: reorderedArgs },
    nextCode,
    stackRange: nextStackRange,
    tracks,
  };
}
