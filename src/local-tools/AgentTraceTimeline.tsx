import { useLayoutEffect, useRef, useState } from 'react';
import type { AgentTraceSink, TraceActor } from '../lib/agent-trace';

export type TimedTraceEvent = Parameters<AgentTraceSink>[0] & { elapsedMs: number };
export type TracedTurn = { id: number; title: string; events: TimedTraceEvent[]; ended?: boolean };

const actorNames: Record<TraceActor, string> = {
  client: '会话运行器',
  router: 'Router',
  session: 'Session',
  model: '模型',
  tool: '工具',
};

function Actor({ name }: { name: TraceActor }) {
  return <span className="agent-trace__actor" data-actor={name}>{actorNames[name]}</span>;
}

export default function AgentTraceTimeline({ turns }: { turns: TracedTurn[] }) {
  const [selected, setSelected] = useState<number | null>(null);
  const turn = (selected !== null ? turns.find(item => item.id === selected) : undefined) ?? turns.at(-1);
  const scroller = useRef<HTMLDivElement>(null);
  const follow = useRef(true);
  useLayoutEffect(() => {
    if (follow.current && scroller.current) scroller.current.scrollTop = scroller.current.scrollHeight;
  }, [turn]);

  return (
    <section className="agent-workflow__trace" aria-labelledby="agent-trace-heading">
      <header className="agent-workflow__panel-header">
        <div>
          <h2 id="agent-trace-heading">Agent 工作流</h2>
          <p>按实际发生顺序排列。展开查看请求、代码和返回值。</p>
        </div>
        <label>
          <span className="sr-only">选择回合</span>
          <select value={selected !== null && turns.some(item => item.id === selected) ? selected : ''}
            onChange={event => { follow.current = !event.target.value; setSelected(event.target.value ? Number(event.target.value) : null); }}>
            <option value="">最新回合</option>
            {[...turns].reverse().map(item => <option key={item.id} value={item.id}>{item.id} · {item.title}</option>)}
          </select>
        </label>
      </header>
      <div className="agent-trace__scroll" ref={scroller} onScroll={event => {
        const node = event.currentTarget;
        follow.current = node.scrollHeight - node.scrollTop - node.clientHeight < 72;
      }}>
        {!turn ? <p className="agent-trace__empty">发送一条消息后，这里会出现完整的执行记录。</p> : (
          <>
            <div className="agent-trace__turn">
              <span>{turn.title}</span>
              <span role="status">{turn.ended ? '已结束' : '进行中'} · {turn.events.length} 条</span>
            </div>
            <ol className="agent-trace__timeline">
              {turn.events.map((event, index) => (
                <li className="agent-trace__event" key={turn.id + ':' + index} data-actor={event.from} data-failed={event.failed || undefined}>
                  <div className="agent-trace__meta">
                    <time>+{(event.elapsedMs / 1000).toFixed(3)}s</time>
                    <Actor name={event.from} />
                    {event.to && <><span aria-hidden="true">→</span><Actor name={event.to} /></>}
                    {event.durationMs !== undefined && <span className="agent-trace__duration">{Math.round(event.durationMs)} ms</span>}
                  </div>
                  {event.data === undefined ? <p>{event.label}</p> : (
                    <EventDetails event={event} />
                  )}
                </li>
              ))}
            </ol>
          </>
        )}
      </div>
    </section>
  );
}

function EventDetails({ event }: { event: TimedTraceEvent }) {
  const [open, setOpen] = useState(false);
  return (
    <details onToggle={event => setOpen(event.currentTarget.open)}>
      <summary>{event.label}</summary>
      {open && <TracePayload data={event.data} />}
    </details>
  );
}

function TracePayload({ data }: { data: unknown }) {
  const [expanded, setExpanded] = useState(false);
  const serialized = JSON.stringify(data, (_key, value: unknown) => {
    if (typeof value === 'string' && value.startsWith('data:')) return '[内嵌附件]';
    return value;
  }, 2);
  const canExpand = (serialized?.length ?? 0) > 18000;
  return (
    <>
      <pre>{canExpand && !expanded ? serialized?.slice(0, 18000) : serialized}</pre>
      {canExpand && <button type="button" onClick={() => setExpanded(value => !value)}>
        {expanded ? '收起长内容' : '显示完整内容'}
      </button>}
    </>
  );
}
