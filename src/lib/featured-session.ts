import { t } from './i18n';
import { newMessageId } from '../hooks/useSessions';
import type { ChatMessage } from '../hooks/useChat';
import type { FeaturedPiece } from './featured-pieces';

/**
 * The session a featured piece turns into.
 *
 * Two doors lead to it — "open in studio" here, and a share link opened by
 * someone who was sent one — and they have to arrive at the same room: whoever
 * follows the link should get what the person sharing it was looking at. Built
 * in one place so the two cannot drift apart.
 */
export function featuredSessionDraft(piece: FeaturedPiece): {
  title: string;
  code: string;
  messages: ChatMessage[];
} {
  return {
    title: piece.title,
    code: piece.code,
    // An opening line rather than an empty thread — and `isGreeting`, which is
    // what keeps it out of the LLM history and out of retry/branch.
    messages: [{
      id: newMessageId(),
      role: 'assistant',
      content: t('featuredOpenedIntro')
        .replace('{title}', piece.title)
        .replace('{originalArtist}', piece.originalArtist)
        .replace('{coder}', piece.coder),
      timestamp: Date.now(),
      isGreeting: true,
    }],
  };
}
