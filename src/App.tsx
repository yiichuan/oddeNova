import { useCallback, useEffect, useState } from 'react';
import ChatPanel from './components/ChatPanel';
import CodePanel from './components/CodePanel';
import Visualizer from './components/Visualizer';
import ControlBar from './components/ControlBar';
import ApiKeyModal from './components/ApiKeyModal';
import { useStrudel } from './hooks/useStrudel';
import { useChat } from './hooks/useChat';
import { useSpeech } from './hooks/useSpeech';
import { runAgent } from './services/llm';
import type { ProgressEvent } from './services/llm';

export default function App() {
  const strudel = useStrudel();
  const chat = useChat();
  const [showApiKeyModal, setShowApiKeyModal] = useState(false);
  const [editableCode, setEditableCode] = useState('');

  // Sync editableCode when AI generates new code
  useEffect(() => {
    setEditableCode(strudel.currentCode);
  }, [strudel.currentCode]);

  // Auto-init engine on first user interaction (browser requires a gesture for AudioContext)
  useEffect(() => {
    if (strudel.engineReady) return;
    const initOnce = () => {
      strudel.init();
      window.removeEventListener('click', initOnce);
      window.removeEventListener('keydown', initOnce);
    };
    window.addEventListener('click', initOnce);
    window.addEventListener('keydown', initOnce);
    return () => {
      window.removeEventListener('click', initOnce);
      window.removeEventListener('keydown', initOnce);
    };
  }, [strudel.engineReady]);

  const handleInstruction = useCallback(
    async (text: string) => {
      if (!strudel.engineReady) {
        strudel.setError('音频引擎启动中，请稍后再试');
        return;
      }

      chat.addUserMessage(text);
      chat.setIsLoading(true);

      try {
        // Agent loop — stream progress to ChatPanel, hot-reload only at commit.
        const onProgress = (e: ProgressEvent) => {
          if (e.kind === 'iteration') return; // too noisy
          if (e.kind === 'tool_call') {
            chat.addProgress('tool_call', formatToolCall(e.name, e.args), {
              toolName: e.name,
            });
            return;
          }
          if (e.kind === 'tool_result') {
            if (e.ok) {
              // Only surface successes for validate to keep noise low.
              if (e.name === 'validate') {
                chat.addProgress('tool_result', '语法校验通过', {
                  toolName: e.name,
                  ok: true,
                });
              }
              return;
            }
            // Intermediate tool failures are part of the agent's
            // self-correction loop — surfacing them scares the user and
            // doesn't help them act. Log to console for debugging and move
            // on; if the whole run still fails, App.tsx surfaces a single
            // user-facing error at the end instead.
            console.warn(
              `[agent] tool ${e.name} failed: ${e.error || 'unknown error'}`
            );
            return;
          }
          if (e.kind === 'commit') {
            chat.addProgress('commit', '准备播放…');
            return;
          }
          if (e.kind === 'warn') {
            chat.addProgress('warn', e.message);
            return;
          }
        };

        const result = await runAgent(text, strudel.currentCode, onProgress);
        if (result.code) {
          const success = await strudel.play(result.code);
          if (success) {
            chat.addAssistantMessage(result.explanation, result.code);
          } else {
            chat.addAssistantMessage(
              `agent 生成完了但代码无法运行: ${strudel.error || '未知错误'}`,
              result.code
            );
          }
        } else {
          chat.addAssistantMessage(result.explanation || 'agent 没有产出代码');
        }
      } catch (e: unknown) {
        const errMsg = e instanceof Error ? e.message : '请求失败';
        chat.addAssistantMessage(`出错了: ${errMsg}`);
        strudel.setError(errMsg);
      } finally {
        chat.setIsLoading(false);
      }
    },
    [strudel, chat]
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

  const handleReplay = useCallback(() => {
    if (editableCode) {
      strudel.play(editableCode);
    }
  }, [strudel, editableCode]);

  return (
    <div className="flex flex-col h-screen bg-bg-primary">
      {showApiKeyModal && (
        <ApiKeyModal onClose={() => setShowApiKeyModal(false)} />
      )}

      {/* Header */}
      <header className="flex items-center justify-between px-6 py-3 border-b border-border bg-bg-secondary/50">
        <div className="flex items-center gap-3">
          <h1 className="text-xl font-bold bg-gradient-to-r from-accent to-accent-light bg-clip-text text-transparent">
            VIBE
          </h1>
          <span className="text-text-muted text-sm">Live Music</span>
        </div>
        <div className="flex items-center gap-4">
          <span className="text-sm text-text-secondary hidden sm:block">
            说话创作电子乐
          </span>
          <button
            onClick={() => setShowApiKeyModal(true)}
            className="text-xs text-text-muted hover:text-text-secondary transition-colors"
            title="设置 API Key"
          >
            ⚙️
          </button>
        </div>
      </header>

      {/* Main Content */}
      <main className="flex flex-1 overflow-hidden">
        <div className="w-[45%] flex flex-col border-r border-border">
          <ChatPanel
            messages={chat.messages}
            isLoading={chat.isLoading}
            isListening={speech.isListening}
            speechSupported={speech.supported}
            onSendText={handleInstruction}
            onToggleVoice={speech.toggle}
          />
        </div>

        <div className="flex-1 flex flex-col">
          <div className="flex-1 overflow-auto">
            <CodePanel
                code={editableCode}
                error={strudel.error}
                isPlaying={strudel.isPlaying}
                onCodeChange={setEditableCode}
              />
          </div>
          <div className="h-[200px] border-t border-border">
            <Visualizer isPlaying={strudel.isPlaying} />
          </div>
        </div>
      </main>

      <ControlBar
        isPlaying={strudel.isPlaying}
        canUndo={strudel.canUndo}
        engineReady={strudel.engineReady}
        onPlay={handleReplay}
        onStop={strudel.stop}
        onUndo={strudel.undo}
      />
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
