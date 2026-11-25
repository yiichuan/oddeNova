import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import type { ChatMessage } from '../hooks/useChat';
import ChatInput from '../components/conversation/ChatInput';
import ConversationView from '../components/conversation/ConversationView';
import { conversationPreviewScenes, type ModuleTarget, type PreviewScene } from './conversation-preview-fixtures';

type ModuleSelection = { name: string; target: ModuleTarget };

function Preview({ variant, selection }: { variant: PreviewScene['variants'][number]; selection: ModuleSelection | null }) {
  const panel = useRef<HTMLDivElement>(null);
  const scrollShell = useRef<HTMLDivElement>(null);
  const [playing, setPlaying] = useState<{ id: string | null; code: string } | null>(null);
  const [guidedExpanded, setGuidedExpanded] = useState(false);
  const [loading, setLoading] = useState(false);
  const [feedback, setFeedback] = useState('');
  const [selectedChoice, setSelectedChoice] = useState<ChatMessage | null>(null);
  const messages = useMemo(() => selectedChoice ? [...variant.messages, selectedChoice] : variant.messages, [selectedChoice, variant.messages]);

  useLayoutEffect(() => {
    if (variant.props?.pendingHumming) return;
    const scroll = scrollShell.current?.querySelector<HTMLElement>('.conversation-scroll');
    if (scroll) scroll.scrollTop = 0;
  }, [variant]);

  useEffect(() => {
    if (!variant.props?.isLoading) return;
    // Start a turn in the mounted view so its usual scroll anchoring runs.
    const frame = requestAnimationFrame(() => setLoading(true));
    return () => cancelAnimationFrame(frame);
  }, [variant]);

  useEffect(() => {
    if (!selection || (variant.props?.isLoading && !loading)) return;
    const [selector, , expand] = selection.target;
    let highlighted: HTMLElement | undefined;
    let frame: number;
    const deadline = performance.now() + 1500;

    function locate() {
      const root = panel.current;
      if (!root) return;
      const target = root.querySelector<HTMLElement>(selector);
      if (target) {
        if (target instanceof HTMLDetailsElement) target.open = true;
        target.setAttribute('data-preview-module-located', '');
        highlighted = target;
        target.scrollIntoView({ block: 'center', inline: 'nearest', behavior: 'instant' });
        return;
      }
      // The jump button only appears once the reader scrolls away from live text.
      if (selector === '[data-reasoning-jump-latest]') {
        const reasoning = root.querySelector<HTMLElement>('.reasoning-scroll');
        if (reasoning && reasoning.scrollTop > 0) {
          reasoning.scrollTop = 0;
          reasoning.dispatchEvent(new Event('scroll'));
        }
      }
      if (expand) {
        const closed = [...root.querySelectorAll<HTMLButtonElement>(expand)]
          .find(button => button.getAttribute('aria-expanded') === 'false');
        closed?.click();
      }
      if (performance.now() < deadline) frame = requestAnimationFrame(locate);
    }

    frame = requestAnimationFrame(locate);
    return () => {
      cancelAnimationFrame(frame);
      highlighted?.removeAttribute('data-preview-module-located');
    };
  }, [loading, selection, variant]);

  return (
    <>
      <div ref={panel} id="preview-conversation-panel"
        className="flex h-[min(66dvh,620px)] min-h-[380px] flex-col overflow-hidden rounded-region bg-conversation-surface lg:h-auto lg:min-h-0 lg:flex-1 [&_[data-preview-module-located]]:outline-2 [&_[data-preview-module-located]]:-outline-offset-2 [&_[data-preview-module-located]]:outline-brand-accent">
        <div ref={scrollShell} data-sidebar-message-region
          className="min-h-0 flex-1 overflow-hidden rounded-t-region border border-border">
          <ConversationView
            {...variant.props}
            messages={messages}
            onSelectChoice={variant.allowChoice ? text => {
              setSelectedChoice({ id: 'mock-selected-choice', role: 'user', content: text, timestamp: Date.now(), selectedChoice: true });
            } : undefined}
            isLoading={loading}
            engineReady
            onRollback={() => setFeedback('回到这条消息（模拟）')}
            onRetry={() => setFeedback('重试当前回合（模拟）')}
            onBranch={() => setFeedback('从当前回合创建分支（模拟）')}
            onPlaySegment={(id, code) => setPlaying({ id, code })}
            onStopCode={() => setPlaying(null)}
            onPlayCode={code => setPlaying({ id: null, code })}
            onPauseCode={() => setPlaying(null)}
            isPlaying={playing !== null}
            playingCode={playing?.code}
            pressedSegmentId={playing?.id}
            pressedSegmentCode={playing?.code}
            guidedReply={variant.guidedReplyId ? {
              id: variant.guidedReplyId, enlarged: true, expanded: guidedExpanded,
              onExpandedChange: setGuidedExpanded, playDisabled: false, stopDisabled: false,
            } : undefined}
          />
        </div>
        {(variant.allowChoice || variant.suggestions) && (
          <div data-sidebar-composer className="-mt-px shrink-0">
            <ChatInput
              isLoading={false}
              engineReady
              signedIn={false}
              inputMode={variant.allowChoice && !selectedChoice ? 'choice' : 'normal'}
              suggestions={variant.suggestions}
              onSendText={text => { setFeedback(`已发送「${text}」（模拟）`); return true; }}
              onReinitEngine={() => undefined}
            />
          </div>
        )}
      </div>
      <p role="status" className="mt-2 min-h-5 shrink-0 text-xs text-text-secondary">{feedback}</p>
    </>
  );
}

export default function ConversationPreviewPage() {
  const [sceneIndex, setSceneIndex] = useState(0);
  const [variantIndex, setVariantIndex] = useState(0);
  const [previewKey, setPreviewKey] = useState(0);
  const [selection, setSelection] = useState<ModuleSelection | null>(null);
  const scene = conversationPreviewScenes[sceneIndex];
  const variant = scene.variants[variantIndex];

  return (
    <main id="conversation-preview" className="min-h-full bg-bg-primary px-4 py-6 sm:px-8 sm:py-8 lg:h-dvh lg:overflow-clip">
      <div className="mx-auto max-w-[1380px] lg:flex lg:h-full lg:flex-col">
        <header className="mb-6 shrink-0 border-b border-border pb-5">
          <a href="/local-tools" className="text-xs text-text-secondary hover:text-text-primary">← 本地工具</a>
          <h1 className="mt-2 text-2xl font-semibold tracking-tight sm:text-3xl">Agent 回复样式</h1>
          <p className="mt-2 text-sm text-text-secondary">点击模块名称，在模拟对话中定位并高亮。播放与回合操作在此页模拟。</p>
        </header>

        <div className="grid items-start gap-5 sm:grid-cols-[150px_minmax(0,1fr)] lg:min-h-0 lg:flex-1 lg:grid-cols-[160px_minmax(0,1fr)_minmax(230px,300px)] lg:grid-rows-[minmax(0,1fr)] lg:gap-7">
          <nav aria-label="对话场景" className="flex flex-wrap gap-1 sm:flex-col lg:max-h-full lg:flex-nowrap lg:overflow-y-auto">
            {conversationPreviewScenes.map((entry, index) => (
              <button key={entry.id} type="button" aria-pressed={sceneIndex === index}
                onClick={() => { setSceneIndex(index); setVariantIndex(0); setSelection(null); }}
                className="rounded-sm px-2.5 py-2 text-left text-sm text-text-secondary transition-colors hover:bg-surface-hover hover:text-text-primary aria-pressed:bg-surface-selected aria-pressed:font-semibold aria-pressed:text-text-primary">
                {entry.title}
              </button>
            ))}
          </nav>

          <section aria-labelledby="preview-scene-title" className="min-w-0 lg:flex lg:min-h-0 lg:flex-col lg:self-stretch">
            <div className="mb-3 flex shrink-0 flex-wrap items-center justify-between gap-x-3 gap-y-2">
              <h2 id="preview-scene-title" className="text-base font-semibold">{scene.title}</h2>
              <div className="flex flex-wrap items-center gap-2">
                {scene.variants.length > 1 && (
                  <select aria-label="场景状态" value={variantIndex}
                    onChange={event => {
                      setVariantIndex(Number(event.target.value));
                      setSelection(null);
                    }}
                    className="max-w-full rounded border border-border bg-conversation-surface px-2 py-1.5 text-xs text-text-primary">
                    {scene.variants.map((entry, index) => <option key={entry.name} value={index}>{entry.name}</option>)}
                  </select>
                )}
                <button type="button" onClick={() => { setPreviewKey(key => key + 1); setSelection(null); }}
                  className="rounded border border-border px-2 py-1.5 text-xs text-text-secondary hover:bg-surface-hover hover:text-text-primary">
                  重置预览
                </button>
              </div>
            </div>
            <Preview key={`${scene.id}:${variantIndex}:${previewKey}`} variant={variant} selection={selection} />
          </section>

          <aside aria-labelledby="preview-modules-title" className="min-w-0 sm:col-start-2 lg:col-start-auto lg:flex lg:min-h-0 lg:flex-col lg:self-stretch">
            <h2 id="preview-modules-title" className="shrink-0 text-base font-semibold">模块名称与样式位置</h2>
            {scene.hint && <p className="mt-2 shrink-0 text-xs leading-relaxed text-text-secondary">{scene.hint}</p>}
            <dl key={scene.id} className="mt-3 divide-y divide-border border-y border-border lg:min-h-0 lg:overflow-y-auto lg:overscroll-y-contain lg:pr-2 lg:[scrollbar-gutter:stable]">
              {scene.modules.map(([name, component, locator, target]) => (
                <div key={name} className="py-2.5">
                  <dt>
                    <button type="button" aria-controls="preview-conversation-panel" aria-pressed={selection?.name === name}
                      onClick={() => {
                        const nextVariant = scene.variants.findIndex(entry => entry.name === target[1]);
                        if (nextVariant >= 0) setVariantIndex(nextVariant);
                        setSelection({ name, target });
                      }}
                      className="flex w-full cursor-pointer items-baseline justify-between gap-2 rounded-sm text-left text-sm transition-colors hover:text-brand-accent focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-accent aria-pressed:text-brand-accent">
                      <span>{name}</span>
                      <span aria-hidden="true" className="text-xs text-text-secondary">↗</span>
                    </button>
                  </dt>
                  <dd className="mt-1 break-words text-xs leading-relaxed text-text-secondary">
                    {component}.tsx
                    <code className="block text-[11px] [overflow-wrap:anywhere]">{locator}</code>
                  </dd>
                </div>
              ))}
            </dl>
          </aside>
        </div>
      </div>
    </main>
  );
}
