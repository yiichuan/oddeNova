import { useCallback, useEffect, useState } from 'react';
import ChatPanel from './components/ChatPanel';
import CodePanel from './components/CodePanel';
import Visualizer from './components/Visualizer';
import ControlBar from './components/ControlBar';
import ApiKeyModal from './components/ApiKeyModal';
import { useStrudel } from './hooks/useStrudel';
import { useChat } from './hooks/useChat';
import { useSpeech } from './hooks/useSpeech';
import { generateMusic } from './services/llm';

export default function App() {
  const strudel = useStrudel();
  const chat = useChat();
  const [showApiKeyModal, setShowApiKeyModal] = useState(false);

  // DeepSeek API Key 已写死在 llm.ts 中，无需检查

  const handleInstruction = useCallback(
    async (text: string) => {
      if (!strudel.engineReady) {
        strudel.setError('请先点击底部按钮启动音频引擎');
        return;
      }

      chat.addUserMessage(text);
      chat.setIsLoading(true);

      try {
        const response = await generateMusic(text, strudel.currentCode);
        const success = await strudel.play(response.code);
        if (success) {
          chat.addAssistantMessage(response.explanation, response.code);
        } else {
          chat.addAssistantMessage(
            `生成的代码有误，音乐保持不变: ${strudel.error || '未知错误'}`
          );
        }
      } catch (e: any) {
        const errMsg = e.message || '请求失败';
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
    if (strudel.currentCode) {
      strudel.play(strudel.currentCode);
    }
  }, [strudel]);

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
            <CodePanel code={strudel.currentCode} error={strudel.error} />
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
        onInit={strudel.init}
      />
    </div>
  );
}
