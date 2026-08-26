import { useMemo, useState } from 'react';
import type { ChatMessage } from '../../hooks/useChat';
import { t } from '../../lib/i18n';
import { ChevronRightIcon, PlayIcon, StopIcon } from '../icons';
import { MarkdownText, UserMessageBubble } from './ConversationView';

interface ArchivedConversationViewProps {
  messages: readonly ChatMessage[];
  onSelectCode: (messageId: string) => void;
  onPlayCode: (messageId: string, code: string) => void;
  onStopCode: () => void;
  playingCodeMessageId: string | null;
  selectedCodeMessageId: string | null;
}

/**
 * The durable portion of the studio conversation stream. It deliberately
 * leaves out anything that exists only while an agent run is underway — live
 * thinking, tool status, commit status, and retry/rollback controls — while
 * retaining completed messages and their expandable reasoning blocks.
 */
export default function ArchivedConversationView({
  messages,
  onSelectCode,
  onPlayCode,
  onStopCode,
  playingCodeMessageId,
  selectedCodeMessageId,
}: ArchivedConversationViewProps) {
  // Finished thoughts are useful in an archive, so they begin expanded. Only
  // entries the reader explicitly closes are held in this set.
  const [collapsedReasoning, setCollapsedReasoning] = useState<Set<string>>(new Set());
  const visibleMessages = useMemo(
    () => messages.filter((message) => (
      message.role !== 'progress' || message.progressKind === 'reasoning'
    )),
    [messages],
  );

  const toggleReasoning = (id: string) => {
    setCollapsedReasoning((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  return (
    <div className="conversation-scroll-shell h-full">
      {/* The parent reserves 42px above the scrollport so its scrollbar begins
          below the Favorites heading. The remaining 24px keeps the first
          bubble on the saved-row baseline: 42 + 24 = 66px. */}
      <div
        className="conversation-scroll isolate h-full overflow-y-auto px-4 pb-[10px] pt-[24px] space-y-[40px] relative"
        style={{ scrollbarGutter: 'stable' }}
      >
        {visibleMessages.map((message, index) => {
          if (message.role === 'progress') {
            const expanded = !collapsedReasoning.has(message.id);
            return (
              <div
                key={message.id}
                data-archive-process={message.id}
                className="relative z-20 flex justify-start animate-fade-in"
                style={{ marginBlockEnd: 'var(--spacing-action-divider-to-body)' }}
              >
                <div className="w-full px-2">
                  <button
                    type="button"
                    data-reasoning-header={message.id}
                    onClick={() => toggleReasoning(message.id)}
                    className={`sticky top-0 z-10 -mx-2 flex w-[calc(100%+1rem)] items-center gap-1.5 bg-conversation-surface px-2 py-0.5 text-sm text-text-secondary/60 transition-colors hover:text-text-secondary${
                      expanded ? ' reasoning-header--expanded' : ''
                    }`}
                  >
                    <ChevronRightIcon
                      size={14}
                      className={`flex-shrink-0 transition-transform ${expanded ? 'rotate-90' : ''}`}
                    />
                    <span>{t('favoritesReasoningTitle')}</span>
                  </button>
                  {expanded && (
                    <div className="mt-1.5 text-[12px] text-text-reasoning font-mono break-words leading-relaxed animate-fade-in">
                      <MarkdownText content={message.content} tone="muted" />
                    </div>
                  )}
                </div>
              </div>
            );
          }

          if (message.role === 'user') {
            return (
              <div
                key={message.id}
                data-favorites-turn={message.id}
                className="flex justify-end items-end gap-1.5 animate-fade-in"
              >
                <div className="relative max-w-[85%] rounded-[6px] px-3 py-2 text-sm bg-[#242424] text-text-primary">
                  <UserMessageBubble content={message.content} />
                </div>
              </div>
            );
          }

          const followsReasoning = visibleMessages[index - 1]?.role === 'progress';
          const codeVersion = visibleMessages
            .slice(0, index + 1)
            .filter((entry) => entry.role === 'assistant' && entry.code).length;
          const isPlaying = playingCodeMessageId === message.id;
          return (
            <div
              key={message.id}
              data-favorites-turn={message.id}
              className="flex justify-start items-start animate-fade-in"
            >
              <div className={`relative w-full rounded-xl px-2 pb-2 text-sm bg-transparent text-text-primary ${
                followsReasoning ? 'pt-0' : 'pt-2'
              }`}>
                <MarkdownText content={message.content} />
                {message.code && (
                  <div className="mt-4 -ml-1 flex gap-0.5 animate-fade-in">
                    <button
                      type="button"
                      data-favorites-chip={message.id}
                      aria-pressed={selectedCodeMessageId === message.id}
                      onClick={() => onSelectCode(message.id)}
                      className="flex flex-1 items-center gap-1.5 rounded-l-md rounded-r-none bg-[#1a1a1a] px-2 py-1.5 text-left text-[11px] text-[#f05a28] transition-colors hover:bg-[#242424] hover:text-[#ff7242]"
                    >
                      <span>代码 V{String(codeVersion).padStart(2, '0')}</span>
                      <span aria-hidden="true">·</span>
                      <span>{message.code.split('\n').length} {t('lines')}</span>
                    </button>
                    <button
                      type="button"
                      data-favorites-code-play={message.id}
                      aria-label={isPlaying ? t('stop') : t('play')}
                      onClick={() => {
                        if (isPlaying) onStopCode();
                        else onPlayCode(message.id, message.code!);
                      }}
                      className="grid size-7 place-items-center rounded-l-none rounded-r-md bg-[#1a1a1a] text-[#f05a28] transition-colors hover:bg-[#242424] hover:text-[#ff7242]"
                    >
                      {isPlaying ? <StopIcon size={12} /> : <PlayIcon size={13} />}
                    </button>
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>
      <div
        data-conversation-edge-fade="top"
        className="conversation-edge-fade conversation-edge-fade--top"
      />
      <div
        data-conversation-edge-fade="bottom"
        className="conversation-edge-fade conversation-edge-fade--bottom"
      />
    </div>
  );
}
