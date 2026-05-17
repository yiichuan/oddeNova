import { useState } from 'react';
import { uploadShare } from '../services/share';
import { ShareIcon } from './icons';
import type { Session } from '../hooks/useSessions';
import type { ChatMessage } from '../hooks/useChat';

type ShareState = 'idle' | 'loading' | 'done' | 'error';

interface ShareButtonProps {
  session: Session | null;
  code?: string;
  messages?: ChatMessage[];
  disabled?: boolean;
}

export function ShareButton({ session, code, messages, disabled }: ShareButtonProps) {
  const [state, setState] = useState<ShareState>('idle');

  async function handleShare() {
    const shareCode = session?.code || code || '';
    if (!shareCode) return;
    setState('loading');
    try {
      const shareId = await uploadShare({
        title: session?.title?.trim() || '新会话',
        code: shareCode,
        messages: session?.messages ?? messages ?? [],
      });
      const url = `${window.location.origin}/s/${shareId}`;
      await navigator.clipboard.writeText(url);
      setState('done');
      setTimeout(() => setState('idle'), 2000);
    } catch {
      setState('error');
      setTimeout(() => setState('idle'), 3000);
    }
  }

  return (
    <div className="relative">
      <button
        onClick={handleShare}
        disabled={disabled || state === 'loading'}
        className="w-[28px] h-[28px] flex items-center justify-center text-white/60 hover:text-white/90 bg-black/40 backdrop-blur-sm rounded disabled:opacity-40 disabled:cursor-not-allowed"
        title="分享会话"
      >
        {state === 'loading' ? (
          <svg className="animate-spin" width={16} height={16} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M21 12a9 9 0 11-6.219-8.56" />
          </svg>
        ) : (
          <ShareIcon size={16} />
        )}
      </button>

      {state === 'done' && (
        <div className="absolute right-0 top-9 z-50">
          <span className="text-text-secondary text-sm whitespace-nowrap">链接已复制</span>
        </div>
      )}

      {state === 'error' && (
        <div className="absolute right-0 top-9 z-50">
          <span className="text-red-400 text-sm whitespace-nowrap">分享失败，请重试</span>
        </div>
      )}
    </div>
  );
}
