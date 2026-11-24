import type { ChatMsg, LLMCaller } from '../../src/agent/loop.js';
import { routeConversation, type RouterDecision } from '../../src/agent/router.js';
import { describeEditTargets, type EditScope } from '../../src/agent/session-scope.js';

type RouteCase = {
  id: string;
  message: string;
  expected: RouterDecision['kind'];
  scope?: EditScope['kind'];
  session?: Parameters<typeof routeConversation>[3];
  history?: ChatMsg[];
};

const current = { hasCode: true, hasHumming: false, editTargets: describeEditTargets(
  'setcps(0.5)\nstack(/* @layer kick */ s("bd"), /* @layer bass */ note("c2").s("sine"))',
) };
const cases: RouteCase[] = [
  { id: 'R01', message: '你好，你可以帮我做什么？', expected: 'reply' },
  { id: 'R02', message: '鼓轻一点会怎样？', expected: 'reply', session: current },
  { id: 'R03', message: '把鼓轻一点让我听听', expected: 'execute', scope: 'parameter', session: current },
  { id: 'R04', message: 'Which part was added to the chorus in the last revision?', expected: 'inspect', session: current },
  { id: 'R05', message: 'Make a laid-back jazz loop.', expected: 'execute', scope: 'create' },
  { id: 'R06', message: '就按第二个来', expected: 'execute', session: current, history: [
    { role: 'user', content: '这段还能怎么变？' },
    { role: 'assistant', content: '1. 把鼓换成刷子鼓。2. 用电钢琴替换原来的主旋律。' },
  ] },
  { id: 'R07', message: 'Make it softer.', expected: 'reply', session: current, history: [
    { role: 'user', content: '鼓和贝斯哪一个更突出？' },
    { role: 'assistant', content: '两条轨道都很突出，你想先改哪一个？' },
  ] },
  { id: 'R08', message: '写出这段旋律\n\n用户附带了一段哼唱。', expected: 'execute', session: { hasCode: false, hasHumming: true } },
  { id: 'R09', message: '为这张图写一段 BGM。\n\n图片资料：夜色下零散的霓虹灯。', expected: 'execute' },
  { id: 'R10', message: 'Turn down the kick and then tell me what changed.', expected: 'execute', session: current },
];

export async function evaluateRouter(llm: LLMCaller, selected?: string[]): Promise<boolean> {
  const inputs = selected ? cases.filter(test => selected.includes(test.id)) : cases;
  if (!inputs.length) throw new Error('No matching Router evaluation cases');
  let passed = 0;
  let unintendedExecution = 0;
  let missedExecution = 0;
  for (const test of inputs) {
    const start = Date.now();
    try {
      const decision = await routeConversation(llm, test.history ?? [], test.message,
        test.session ?? { hasCode: false, hasHumming: false });
      const scope = decision.kind === 'execute' ? decision.task.scope.kind : undefined;
      passed += Number(decision.kind === test.expected && (!test.scope || scope === test.scope));
      unintendedExecution += Number(test.expected !== 'execute' && decision.kind === 'execute');
      missedExecution += Number(test.expected === 'execute' && decision.kind !== 'execute');
      console.log(`${test.id} expected=${test.expected} actual=${decision.kind} scope=${scope ?? "-"} time_ms=${Date.now() - start}`);
    } catch (error) {
      console.error(`${test.id} request failed:`, error instanceof Error ? error.message : error);
    }
  }
  console.log(`Passed ${passed}/${inputs.length}, unintended executions ${unintendedExecution}, missed executions ${missedExecution}`);
  return passed === inputs.length;
}
