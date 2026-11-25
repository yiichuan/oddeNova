import type { RouterProgress, RouterStage } from '../../agent/progress';
import type { ChatMessage } from '../../hooks/useChat';

export const routerStageLabels: Record<RouterStage, string> = {
  routing: 'routerStageRouting',
  image: 'routerStageImage',
  humming: 'routerStageHumming',
  search: 'searchingSamples',
  analysis: 'routerStageAnalysis',
  composition: 'routerStageComposition',
  structure: 'routerStageStructure',
  validation: 'routerStageValidation',
  repair: 'routerStageRepair',
  playback: 'preparingToPlay',
  reply: 'routerStageReply',
};

export function routerStrategySeconds(entry: RouterProgress): number | undefined {
  return entry.durationMs === undefined ? undefined : Math.max(1, Math.round(entry.durationMs / 1000));
}

export interface RouterProcess {
  entries: ChatMessage[];
  seconds: number;
}

const structurePlan = /(?:整首|全曲|整段).{0,16}(?:结构|走向|布局)|(?:overall (?:structure|shape|arc)|(?:structure|shape|arc) of the (?:song|track|piece|composition))/i;

function repeatsPlan(current: ChatMessage, next?: ChatMessage): boolean {
  if (current.routerProgress?.kind !== 'plan' || next?.routerProgress?.kind !== 'plan') return false;
  const earlier = current.routerProgress.title.trim();
  const later = next.routerProgress.title.trim();
  return earlier === later || (structurePlan.test(earlier) && structurePlan.test(later));
}

export function groupRouterProcess(messages: readonly ChatMessage[], liveAfterIndex?: number) {
  const groupOf = new Map<string, string>();
  const groups = new Map<string, RouterProcess>();
  let turn: ChatMessage[] = [];
  let hasUser = false;

  const finish = () => {
    const finalReply = hasUser || turn.some(message => message.routerProgress)
      ? turn.findLast(message => message.role === 'assistant' && !message.isGreeting)
      : undefined;
    const rows = turn.filter(message => message.routerProgress || (
      finalReply && message !== finalReply && message.role === 'assistant' && !message.isGreeting
      && !message.code && !message.revisionId && message.inputMode !== 'choice' && message.content.trim()
    ));
    const first = rows[0];
    if (first) {
      groups.set(first.id, {
        // Older turns saved both the Router's opening plan and Session's
        // rephrasing. Retain the later description without changing group IDs.
        entries: rows.filter((row, index) => !repeatsPlan(row, rows[index + 1])),
        seconds: Math.max(1, Math.round(((finalReply?.timestamp ?? rows.at(-1)!.timestamp) - first.timestamp) / 1000)),
      });
      for (const row of rows) groupOf.set(row.id, first.id);
    }
    turn = [];
  };

  messages.forEach((message, index) => {
    if (message.role === 'user') {
      finish();
      hasUser = true;
    }
    if (liveAfterIndex !== undefined && index > liveAfterIndex) return;
    if (message.role !== 'user') turn.push(message);
  });
  finish();
  return { groupOf, groups };
}

export function isCodeMaintenanceText(text: string): boolean {
  return /(?:校验|验证|修复|修正|检查).{0,12}(?:代码|语法|错误|草稿)|(?:代码|语法).{0,8}(?:校验|验证|修复|错误)|\b(?:validat\w*|check\w*|fix\w*|repair\w*)\b.{0,24}\b(?:code|syntax|draft|errors?)\b/i.test(text);
}

export function isCompletionTool(entry: RouterProgress): boolean {
  if (entry.kind !== 'tool') return false;
  if (entry.toolAction !== undefined) return ['setCode', 'validate', 'commit', 'validate final draft'].includes(entry.toolAction);
  // Saved before tool identifiers were carried through Router.
  return isCodeMaintenanceText(entry.title) || /(?:校验|验证|提交|(?:检查|写入|生成|编写).{0,12}(?:代码|草稿)|代码检查|(?:check|validat\w*|writ\w*)\s+(?:the\s+)?(?:strudel|code|draft)|\b(?:validat\w*|commit\w*)\b)/i.test(entry.title);
}
