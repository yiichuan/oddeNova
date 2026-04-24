import { useCallback, useEffect, useState } from 'react';
import CodePanel from './components/CodePanel';
import Sidebar from './components/Sidebar';
import HistoryPanel from './components/HistoryPanel';
import VizPlaceholder from './components/VizPlaceholder';
import { useStrudel } from './hooks/useStrudel';
import { useSessions } from './hooks/useSessions';
import { useSuggestions } from './hooks/useSuggestions';
import { runAgent } from './services/llm';
import { fetchMoodContext } from './services/airjelly';
import type { ProgressEvent } from './services/llm';

export default function App() {
  const strudel = useStrudel();
  const sessions = useSessions();
  const [isLoading, setIsLoading] = useState(false);

  const current = sessions.currentSession;
  const messages = current?.messages ?? [];
  // Session code = last committed/played code (used as agent context)
  const currentCode = current?.code ?? '';
  const hasUserMessages = messages.some((m) => m.role === 'user');

  const suggestions = useSuggestions({
    key: current?.id ?? '',
    currentCode,
    hasUserMessages,
    messages,
  });

  // When the session switches, restore its code into the editor and stop audio
  useEffect(() => {
    if (!current) return;
    strudel.setCode(current.code);
    strudel.stop();
  // eslint-disable-next-line react-hooks/exhaustive-deps -- intentional: only re-run when session ID changes
  }, [current?.id]);

  const handleInstruction = useCallback(
    async (text: string) => {
      if (!strudel.engineReady) {
        strudel.setError('音频引擎启动中，请稍后再试');
        return;
      }

      sessions.addUserMessage(text);
      setIsLoading(true);

      try {
        // Track layer names already shown in this agent run to prevent
        // duplicate progress entries when the LLM calls addLayer/removeLayer/
        // replaceLayer for the same layer across different iterations.
        const shownLayerOps = new Set<string>();

        const onProgress = (e: ProgressEvent) => {
          if (e.kind === 'iteration') return;
          if (e.kind === 'tool_call') {
            if (e.name !== 'validate' && e.name !== 'commit') {
              // Dedup layer operations across iterations: same tool + same layer
              // name means the LLM is retrying something it already attempted
              // (addLayer will fail at the tool level anyway since the layer
              // exists). Skip the duplicate progress line to avoid confusing UI.
              const layerKey = (e.name === 'addLayer' || e.name === 'removeLayer' || e.name === 'replaceLayer')
                ? `${e.name}:${String(e.args.name ?? '')}`
                : e.name === 'improvise'
                  ? `improvise:${String(e.args.role ?? '')}`
                  : null;
              if (layerKey !== null) {
                if (shownLayerOps.has(layerKey)) return;
                shownLayerOps.add(layerKey);
              }
              sessions.addProgress('tool_call', formatToolCall(e.name, e.args), {
                toolName: e.name,
              });
            }
            return;
          }
          if (e.kind === 'tool_result') {
            if (e.ok) {
              return;
            }
            console.error(
              `[agent] ❌ tool "${e.name}" 失败:`, e.error || 'unknown error'
            );
            return;
          }
          if (e.kind === 'commit') {
            sessions.addProgress('commit', '准备播放…');
            return;
          }
          if (e.kind === 'warn') {
            sessions.addProgress('warn', e.message);
            return;
          }
          if (e.kind === 'assistant_text') {
            sessions.addProgress('thinking', e.text);
            return;
          }
        };

        const result = await runAgent(text, currentCode, onProgress);
        if (result.code) {
          const success = await strudel.play(result.code);
          if (success) {
            sessions.addAssistantMessage(result.explanation, result.code);
            sessions.setCurrentCode(result.code);
          } else {
            sessions.addAssistantMessage(
              `agent 生成完了但代码无法运行: ${strudel.error || '未知错误'}`,
              result.code
            );
          }
        } else {
          sessions.addAssistantMessage(result.explanation || 'agent 没有产出代码');
        }
      } catch (e: unknown) {
        const errMsg = e instanceof Error ? e.message : '请求失败';
        sessions.addAssistantMessage(`出错了: ${errMsg}`);
        strudel.setError(errMsg);
      } finally {
        setIsLoading(false);
      }
    },
    [strudel, sessions, currentCode]
  );

  const handleMoodInstruction = useCallback(async () => {
    if (!strudel.engineReady) {
      strudel.setError('音频引擎启动中，请稍后再试');
      return;
    }

    const moodContext = await fetchMoodContext();
    const instruction = '根据我的心情生成音乐';

    sessions.addUserMessage(instruction);
    setIsLoading(true);

    try {
      const shownLayerOps = new Set<string>();

      const onProgress = (e: ProgressEvent) => {
        if (e.kind === 'iteration') return;
        if (e.kind === 'tool_call') {
          if (e.name !== 'validate' && e.name !== 'commit') {
            const layerKey = (e.name === 'addLayer' || e.name === 'removeLayer' || e.name === 'replaceLayer')
              ? `${e.name}:${String(e.args.name ?? '')}`
              : e.name === 'improvise'
                ? `improvise:${String(e.args.role ?? '')}`
                : null;
            if (layerKey !== null) {
              if (shownLayerOps.has(layerKey)) return;
              shownLayerOps.add(layerKey);
            }
            sessions.addProgress('tool_call', formatToolCall(e.name, e.args), {
              toolName: e.name,
            });
          }
          return;
        }
        if (e.kind === 'tool_result') {
          if (!e.ok) console.error(`[agent] ❌ tool "${e.name}" 失败:`, e.error || 'unknown error');
          return;
        }
        if (e.kind === 'commit') { sessions.addProgress('commit', '准备播放…'); return; }
        if (e.kind === 'warn') { sessions.addProgress('warn', e.message); return; }
        if (e.kind === 'assistant_text') { sessions.addProgress('thinking', e.text); return; }
      };

      const result = await runAgent(instruction, currentCode, onProgress, moodContext ?? undefined);
      if (result.code) {
        const success = await strudel.play(result.code);
        if (success) {
          sessions.addAssistantMessage(result.explanation, result.code);
          sessions.setCurrentCode(result.code);
        } else {
          sessions.addAssistantMessage(
            `agent 生成完了但代码无法运行: ${strudel.error || '未知错误'}`,
            result.code
          );
        }
      } else {
        sessions.addAssistantMessage(result.explanation || 'agent 没有产出代码');
      }
    } catch (e: unknown) {
      const errMsg = e instanceof Error ? e.message : '请求失败';
      sessions.addAssistantMessage(`出错了: ${errMsg}`);
      strudel.setError(errMsg);
    } finally {
      setIsLoading(false);
    }
  }, [strudel, sessions, currentCode]);

  const handleNewSession = useCallback(() => {
    strudel.stop();
    sessions.newSession();
  }, [strudel, sessions]);

  return (
    <div className="flex h-screen w-screen bg-bg-primary overflow-hidden">
      <Sidebar
        title={current?.title ?? '新会话'}
        messages={messages}
        isLoading={isLoading}
        engineReady={strudel.engineReady}
        suggestions={suggestions}
        onSendText={handleInstruction}
        onNewSession={handleNewSession}
        onMoodGenerate={handleMoodInstruction}
        onReinitEngine={strudel.reinit}
      />

      <main className="flex-1 flex flex-col gap-3 pt-3 pr-3 pb-3 pl-[22px] min-w-0">
        <div className="flex-1 min-h-0">
          <CodePanel
            error={strudel.error}
            isPlaying={strudel.isPlaying}
            engineReady={strudel.engineReady}
            onMount={strudel.setRoot}
            onPlay={() => strudel.play()}
            onStop={strudel.stop}
          />
        </div>
        <div className="h-[280px] grid grid-cols-[1fr_2fr] gap-3 shrink-0">
          <HistoryPanel
            sessions={sessions.sessions}
            currentId={sessions.currentId}
            onSwitch={sessions.switchTo}
            onDelete={sessions.deleteSession}
          />
          <VizPlaceholder isPlaying={strudel.isPlaying} />
        </div>
      </main>
    </div>
  );
}

function formatToolCall(name: string, args: Record<string, unknown>): string {
  const s = (key: string): string => {
    const v = args[key];
    return v == null ? '' : String(v);
  };
  switch (name) {
    case 'getScore':
      return '读取当前曲谱';
    case 'addLayer':
      return `加入层 ${s('name')}`;
    case 'removeLayer':
      return `移除层 ${s('name')}`;
    case 'replaceLayer':
      return `替换层 ${s('name')}`;
    case 'applyEffect':
      return `给 ${s('layer')} 加效果 ${s('chain')}`;
    case 'setTempo':
      return `设速度 ${s('bpm')} BPM`;
    case 'validate':
      return '校验代码';
    case 'improvise': {
      const hints = s('hints');
      return `即兴生成 ${s('role')}${hints ? `（${hints}）` : ''}`;
    }
    case 'commit':
      return '提交并播放';
    default:
      return `${name}(${JSON.stringify(args).slice(0, 60)})`;
  }
}
