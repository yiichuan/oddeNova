import { parseScore } from '../../agent/parser';
import { diffCodeLines } from '../../lib/code-diff';

type Layer = { name: string; source: string; first: number; last: number };

function layerLines(lines: readonly string[]): Layer[] {
  const code = lines.join('\n');
  const lineAt = (offset: number) => code.slice(0, offset).split('\n').length - 1;
  return parseScore(code).layers.flatMap(({ name, source, rawStart, rawEnd }) => {
    const raw = code.slice(rawStart, rawEnd);
    const start = rawStart + raw.length - raw.trimStart().length;
    const end = rawStart + raw.trimEnd().length;
    const first = lineAt(start);
    const last = lineAt(end - 1);
    // Inline stack arguments share a row with other code. Fall back to a
    // line diff for those instead of assigning the same row multiple owners.
    const before = code.slice(code.lastIndexOf('\n', start - 1) + 1, start);
    const newline = code.indexOf('\n', end);
    const after = code.slice(end, newline < 0 ? code.length : newline);
    return !before.trim() && /^,?\s*$/.test(after) ? [{ name, source, first, last }] : [];
  });
}

function hasMarker(layer: Layer) {
  return !/^layer_\d+$/.test(layer.name);
}

export function diffLiveCodeEdits(before: readonly string[], after: readonly string[]) {
  const oldLayers = layerLines(before);
  const newLayers = layerLines(after);
  const pairs = new Map<number, number>();
  const used = new Set<number>();

  function match(compatible: (old: Layer, next: Layer) => boolean) {
    newLayers.forEach((layer, next) => {
      if (pairs.has(next)) return;
      const old = oldLayers.findIndex((candidate, index) => !used.has(index) && compatible(candidate, layer));
      if (old < 0) return;
      pairs.set(next, old);
      used.add(old);
    });
  }

  // Match unchanged named/unnamed layers before matching edits by their
  // names. This keeps an insert or delete from shifting later layer IDs.
  match((old, next) => old.source === next.source && (
    old.name === next.name || (!hasMarker(old) && !hasMarker(next))
  ));
  match((old, next) => hasMarker(old) && old.name === next.name);
  match((old, next) => !hasMarker(old) && !hasMarker(next));

  const oldKeys = before.map(line => `text:${line}`);
  const newKeys = after.map(line => `text:${line}`);
  const inserted = new Set<number>();
  oldLayers.forEach(({ first, last }, index) => {
    for (let line = first; line <= last; line++) oldKeys[line] = `old-layer:${index}:${line - first}`;
  });
  newLayers.forEach((layer, index) => {
    const oldIndex = pairs.get(index);
    const old = oldIndex === undefined ? undefined : oldLayers[oldIndex];
    const unchanged = old?.source === layer.source && old.last - old.first === layer.last - layer.first;
    for (let line = layer.first; line <= layer.last; line++) {
      newKeys[line] = unchanged ? `old-layer:${oldIndex}:${line - layer.first}` : `new-layer:${index}:${line - layer.first}`;
      if (!old) inserted.add(line + 1);
    }
  });
  return { changes: diffCodeLines(oldKeys, newKeys), inserted };
}
