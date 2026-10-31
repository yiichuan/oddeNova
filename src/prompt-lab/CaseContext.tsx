import type { PromptLabCase } from './types';

export function CaseInputSummary({ testCase }: { testCase: PromptLabCase }) {
  return <>
    执行 {testCase.turns.length} 轮
    {!!testCase.initialHistory?.length && ` · 预置 ${testCase.initialHistory.length} 条消息`}
    {!!testCase.initialCode?.trim() && ' · 含初始代码'}
  </>;
}

export default function CaseContext({ testCase }: { testCase: PromptLabCase }) {
  const history = testCase.initialHistory ?? [];
  const hasCode = !!testCase.initialCode?.trim();
  if (!history.length && !hasCode) {
    return <p className="plab-case-start">从空白对话和空代码开始，按下方顺序执行指令。</p>;
  }
  return <section className="plab-case-context" aria-label="用例前置条件">
    <div className="plab-case-context-heading"><strong>前置条件</strong><span>运行前已存在的上下文</span></div>
    <p>{history.length ? '以下消息直接传给模型，作为已发生的对话；本次仅执行下方指令。' : '本次从以下代码开始，按下方指令修改。'}</p>
    {history.length > 0 && <ol className="plab-case-history">
      {history.map((message, index) => <li key={index}>
        <span>{message.role === 'user' ? '用户' : '助手'}</span>
        <div>{message.content}</div>
      </li>)}
    </ol>}
    {hasCode && <details className="plab-case-initial-code"><summary>查看初始代码</summary><pre className="plab-code">{testCase.initialCode}</pre></details>}
    {!hasCode && <p className="plab-muted">初始代码为空。</p>}
  </section>;
}
