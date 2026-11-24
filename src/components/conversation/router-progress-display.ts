import type { RouterProgress, RouterStage } from '../../agent/progress';
import type { ChatMessage } from '../../hooks/useChat';

export const routerStageLabels: Record<RouterStage, string> = {
  image: 'routerStageImage',
  humming: 'routerStageHumming',
  analysis: 'routerStageAnalysis',
  composition: 'routerStageComposition',
  structure: 'routerStageStructure',
  validation: 'routerStageValidation',
  reply: 'routerStageReply',
};

export function routerStrategySeconds(entry: RouterProgress): number | undefined {
  return entry.durationMs === undefined ? undefined : Math.max(1, Math.round(entry.durationMs / 1000));
}

export interface RouterProcess {
  entries: RouterProgress[];
  seconds: number;
}

export function groupRouterProcess(messages: readonly ChatMessage[], liveAfterIndex?: number) {
  const groupOf = new Map<string, string>();
  const groups = new Map<string, RouterProcess>();
  let rows: { id: string; timestamp: number; entry: RouterProgress }[] = [];
  let finishedAt: number | undefined;

  const finish = () => {
    const first = rows[0];
    if (first) {
      groups.set(first.id, {
        entries: rows.map(row => row.entry),
        seconds: Math.max(1, Math.round(((finishedAt ?? rows.at(-1)!.timestamp) - first.timestamp) / 1000)),
      });
      for (const row of rows) groupOf.set(row.id, first.id);
    }
    rows = [];
    finishedAt = undefined;
  };

  messages.forEach((message, index) => {
    if (message.role === 'user') finish();
    if (liveAfterIndex !== undefined && index > liveAfterIndex) return;
    if (message.routerProgress) rows.push({ id: message.id, timestamp: message.timestamp, entry: message.routerProgress });
    if (message.role === 'assistant' && rows.length) finishedAt = message.timestamp;
  });
  finish();
  return { groupOf, groups };
}

export function isCompletionTool(entry: RouterProgress): boolean {
  if (entry.kind !== 'tool') return false;
  if (entry.toolAction !== undefined) return ['setCode', 'validate', 'commit', 'validate final draft'].includes(entry.toolAction);
  // Saved before tool identifiers were carried through Router.
  return /(?:校验|验证|提交|(?:检查|写入|生成|编写).{0,12}(?:代码|草稿)|代码检查|(?:check|validat\w*|writ\w*)\s+(?:the\s+)?(?:strudel|code|draft)|\b(?:validat\w*|commit\w*)\b)/i.test(entry.title);
}
