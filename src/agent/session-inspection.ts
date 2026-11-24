import { parseScore, summariseScore } from './parser';
import type { SessionVersion } from './router';

const MAX_SOURCE_LENGTH = 24_000;

function inspectVersion(version: SessionVersion) {
  const { code, revisionId } = version;
  const score = code.trim() ? summariseScore(parseScore(code)) : undefined;
  return {
    revisionId,
    score,
    source: code.slice(0, MAX_SOURCE_LENGTH),
    sourceTruncated: code.length > MAX_SOURCE_LENGTH,
  };
}

export function inspectSession(
  question: string,
  current: SessionVersion,
  previous?: SessionVersion,
) {
  return {
    kind: 'facts' as const,
    question,
    current: inspectVersion(current),
    previous: previous && inspectVersion(previous),
  };
}
