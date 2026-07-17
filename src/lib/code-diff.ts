import { parseScore } from '../agent/parser';

export type DiffRow =
  | { kind: 'context' | 'add' | 'remove'; text: string; oldLine?: number; newLine?: number }
  | { kind: 'skip'; count: number };

export interface CodeDiffGroup {
  key: string;
  name: string;
  status: 'added' | 'removed' | 'modified';
  additions: number;
  deletions: number;
  rows: DiffRow[];
}

export interface CodeDiff {
  additions: number;
  deletions: number;
  groups: CodeDiffGroup[];
}

interface CodeSection {
  key: string;
  name: string;
  source: string;
}

const CONTEXT_LINES = 2;

function normalizeSource(source: string): string {
  return source.replace(/\r\n?/g, '\n').trim();
}

function splitLines(source: string): string[] {
  const normalized = normalizeSource(source);
  return normalized ? normalized.split('\n') : [];
}

function scoreScaffolding(code: string): string {
  const normalized = code.replace(/\r\n?/g, '\n');
  const score = parseScore(normalized);
  if (!score.hasStack || score.layers.length === 0) return normalizeSource(normalized);
  return normalizeSource(
    `${normalized.slice(0, score.stackArgsStart)}\n  /* layers */\n${normalized.slice(score.stackArgsEnd)}`,
  );
}

function codeSections(code: string): { stableLayers: boolean; score: CodeSection; layers: CodeSection[] } {
  const normalized = code.replace(/\r\n?/g, '\n');
  const parsed = parseScore(normalized);
  const stableLayers = parsed.layers.length > 0 && parsed.layers.every((layer) => !/^layer_\d+$/.test(layer.name));
  const occurrences = new Map<string, number>();
  const layers = parsed.layers.map((layer) => {
    const occurrence = occurrences.get(layer.name) ?? 0;
    occurrences.set(layer.name, occurrence + 1);
    return {
      key: `${layer.name}#${occurrence}`,
      name: layer.name,
      source: normalizeSource(layer.source),
    };
  });
  return {
    stableLayers,
    score: { key: 'SCORE', name: 'SCORE', source: scoreScaffolding(normalized) },
    layers,
  };
}

function lineDiff(before: string, after: string): DiffRow[] {
  const oldLines = splitLines(before);
  const newLines = splitLines(after);
  const table = Array.from({ length: oldLines.length + 1 }, () =>
    Array<number>(newLines.length + 1).fill(0),
  );

  for (let oldIndex = oldLines.length - 1; oldIndex >= 0; oldIndex--) {
    for (let newIndex = newLines.length - 1; newIndex >= 0; newIndex--) {
      table[oldIndex][newIndex] = oldLines[oldIndex] === newLines[newIndex]
        ? table[oldIndex + 1][newIndex + 1] + 1
        : Math.max(table[oldIndex + 1][newIndex], table[oldIndex][newIndex + 1]);
    }
  }

  const rows: DiffRow[] = [];
  let oldIndex = 0;
  let newIndex = 0;
  while (oldIndex < oldLines.length || newIndex < newLines.length) {
    if (
      oldIndex < oldLines.length &&
      newIndex < newLines.length &&
      oldLines[oldIndex] === newLines[newIndex]
    ) {
      rows.push({
        kind: 'context',
        text: oldLines[oldIndex],
        oldLine: oldIndex + 1,
        newLine: newIndex + 1,
      });
      oldIndex++;
      newIndex++;
    } else if (
      oldIndex < oldLines.length &&
      (newIndex >= newLines.length || table[oldIndex + 1][newIndex] >= table[oldIndex][newIndex + 1])
    ) {
      rows.push({ kind: 'remove', text: oldLines[oldIndex], oldLine: oldIndex + 1 });
      oldIndex++;
    } else {
      rows.push({ kind: 'add', text: newLines[newIndex], newLine: newIndex + 1 });
      newIndex++;
    }
  }
  return rows;
}

function collapseContext(rows: DiffRow[]): DiffRow[] {
  const result: DiffRow[] = [];
  let index = 0;
  while (index < rows.length) {
    if (rows[index].kind !== 'context') {
      result.push(rows[index]);
      index++;
      continue;
    }
    const start = index;
    while (index < rows.length && rows[index].kind === 'context') index++;
    const run = rows.slice(start, index);
    const hasChangeBefore = start > 0;
    const hasChangeAfter = index < rows.length;
    const keepBefore = hasChangeBefore ? Math.min(CONTEXT_LINES, run.length) : 0;
    const keepAfter = hasChangeAfter ? Math.min(CONTEXT_LINES, run.length - keepBefore) : 0;
    const skipped = run.length - keepBefore - keepAfter;

    if (keepBefore > 0) result.push(...run.slice(0, keepBefore));
    if (skipped > 0) result.push({ kind: 'skip', count: skipped });
    if (keepAfter > 0) result.push(...run.slice(run.length - keepAfter));
  }
  return result;
}

function diffGroup(before: CodeSection | undefined, after: CodeSection | undefined): CodeDiffGroup | null {
  const beforeSource = before?.source ?? '';
  const afterSource = after?.source ?? '';
  if (beforeSource === afterSource) return null;
  const allRows = lineDiff(beforeSource, afterSource);
  const additions = allRows.filter((row) => row.kind === 'add').length;
  const deletions = allRows.filter((row) => row.kind === 'remove').length;
  return {
    key: after?.key ?? before!.key,
    name: after?.name ?? before!.name,
    status: !before ? 'added' : !after ? 'removed' : 'modified',
    additions,
    deletions,
    rows: collapseContext(allRows),
  };
}

export function buildCodeDiff(beforeCode: string, afterCode: string): CodeDiff {
  const before = codeSections(beforeCode);
  const after = codeSections(afterCode);
  const groups: CodeDiffGroup[] = [];

  if (!before.stableLayers || !after.stableLayers) {
    const group = diffGroup(
      { key: 'SCORE', name: 'SCORE', source: normalizeSource(beforeCode) },
      { key: 'SCORE', name: 'SCORE', source: normalizeSource(afterCode) },
    );
    if (group) groups.push(group);
  } else {
    const scoreGroup = diffGroup(before.score, after.score);
    if (scoreGroup) groups.push(scoreGroup);

    const beforeByKey = new Map(before.layers.map((layer) => [layer.key, layer]));
    const afterKeys = new Set(after.layers.map((layer) => layer.key));
    for (const layer of after.layers) {
      const group = diffGroup(beforeByKey.get(layer.key), layer);
      if (group) groups.push(group);
    }
    for (const layer of before.layers) {
      if (afterKeys.has(layer.key)) continue;
      const group = diffGroup(layer, undefined);
      if (group) groups.push(group);
    }
  }

  return {
    additions: groups.reduce((sum, group) => sum + group.additions, 0),
    deletions: groups.reduce((sum, group) => sum + group.deletions, 0),
    groups,
  };
}
