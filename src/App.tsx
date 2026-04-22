import { useCallback, useEffect, useState } from 'react';
import CodePanel from './components/CodePanel';
import Sidebar from './components/Sidebar';
import HistoryPanel from './components/HistoryPanel';
import VizPlaceholder from './components/VizPlaceholder';
import { useStrudel } from './hooks/useStrudel';
import { useSessions } from './hooks/useSessions';
import { useSpeech } from './hooks/useSpeech';
import { useSuggestions } from './hooks/useSuggestions';
import { runAgent } from './services/llm';
import type { ProgressEvent } from './services/llm';

export default function App() {
  const strudel = useStrudel();
  const sessions = useSessions();
  const [isLoading, setIsLoading] = useState(false);

  const current = sessions.currentSession;
  const messages = current?.messages ?? [];
  // Session code = last committed/played code (used as agent context)
  const currentCode = current?.code ?? '';

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
        const onProgress = (e: ProgressEvent) => {
          if (e.kind === 'iteration') return;
          if (e.kind === 'tool_call') {
            sessions.addProgress('tool_call', formatToolCall(e.name, e.args), {
              toolName: e.name,
            });
            return;
          }
          if (e.kind === 'tool_result') {
            if (e.ok) {
              if (e.name === 'validate') {
                sessions.addProgress('tool_result', '语法校验通过', {
                  toolName: e.name,
                  ok: true,
                });
              }
              return;
            }
            console.warn(
              `[agent] tool ${e.name} failed: ${e.error || 'unknown error'}`
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

  const speech = useSpeech(handleInstruction);

  // Keyboard shortcut: Space to toggle voice (when not typing)
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (
        e.code === 'Space' &&
        !['INPUT', 'TEXTAREA'].includes((e.target as HTMLElement)?.tagName)
      ) {
        e.preventDefault();
        speech.toggle();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [speech]);

  const handleNewSession = useCallback(() => {
    strudel.stop();
    sessions.newSession();
  }, [strudel, sessions]);

  const hasUserMessages = messages.some((m) => m.role === 'user');
  const suggestions = useSuggestions({
    key: current?.id ?? 'none',
    currentCode,
    hasUserMessages,
  });

  return (
    <div className="flex h-screen w-screen bg-bg-primary overflow-hidden">
      <Sidebar
        title={current?.title ?? '新会话'}
        messages={messages}
        isLoading={isLoading}
        isListening={speech.isListening}
        speechSupported={speech.supported}
        engineReady={strudel.engineReady}
        suggestions={suggestions}
        onSendText={handleInstruction}
        onToggleVoice={speech.toggle}
        onNewSession={handleNewSession}
      />

      <main className="flex-1 flex flex-col gap-3 p-3 min-w-0">
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
