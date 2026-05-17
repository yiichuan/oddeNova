import { useState, useRef, useEffect } from 'react';
import { uploadShare } from '../services/share';
import { ShareIcon } from './icons';
import type { Session } from '../hooks/useSessions';

type ShareState = 'idle' | 'loading' | 'done' | 'error';

interface ShareButtonProps {
  session: Session | null;
}

export function ShareButton({ session }: ShareButtonProps) {
  const [state, setState] = useState<ShareState>('idle');
  const [shareUrl, setShareUrl] = useState('');
  const [copied, setCopied] = useState(false);
  const popoverRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (state !== 'done') return;
    function handleClickOutside(e: MouseEvent) {
      if (popoverRef.current && !popoverRef.current.contains(e.target as Node)) {
        setState('idle');
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [state]);

  async function handleShare() {
    if (!session) return;
    setState('loading');
    try {
      const shareId = await uploadShare({
        title: session.title,
        code: session.code,
        messages: session.messages,
      });
      const url = `${window.location.origin}/s/${shareId}`;
      setShareUrl(url);
      setState('done');
    } catch {
      setState('error');
      setTimeout(() => setState('idle'), 3000);
    }
  }

  async function handleCopy() {
    await navigator.clipboard.writeText(shareUrl);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  return (
    <div className="relative">
      <button
        onClick={handleShare}
        disabled={state === 'loading' || !session}
        className="w-7 h-7 flex items-center justify-center text-text-secondary hover:text-text-primary disabled:opacity-40 disabled:cursor-not-allowed"
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
        <div
          ref={popoverRef}
          className="absolute right-0 top-9 z-50 bg-bg-secondary border border-border rounded-lg shadow-lg p-3 w-72"
        >
          <div className="flex items-center justify-between mb-2">
            <span className="text-sm text-text-primary font-medium">分享链接</span>
            <button
              onClick={() => setState('idle')}
              className="text-text-secondary hover:text-text-primary text-lg leading-none"
            >
              ✕
            </button>
          </div>
          <div className="flex gap-2">
            <input
              readOnly
              value={shareUrl}
              className="flex-1 text-xs bg-bg-primary border border-border rounded px-2 py-1 text-text-secondary truncate"
            />
            <button
              onClick={handleCopy}
              className="text-xs px-2 py-1 bg-accent text-white rounded hover:opacity-90 shrink-0"
            >
              {copied ? '已复制' : '复制'}
            </button>
          </div>
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
