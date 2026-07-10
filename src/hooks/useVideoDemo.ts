import { useEffect, useState } from 'react';
import type { MutableRefObject } from 'react';
import type { useStrudel } from './useStrudel';
import type { ChatMessage } from './useChat';

type StrudelApi = ReturnType<typeof useStrudel>;

export interface VideoDemoState {
  isVideoMode: boolean;
  videoDemoMsgs: ChatMessage[] | null;
  videoConvScrollBottom: boolean;
  videoTitle: string | null;
}

/**
 * Remotion-only. Listens for VIDEO_* postMessages pushed per-frame by the video
 * renderer (MyVideo.tsx) to drive App state and the strudel editor. Completely
 * silent during regular browser use — normal users never send these messages.
 * Extracted from App so the normal happy path isn't buried under frame-driver glue.
 */
export function useVideoDemo(strudelRef: MutableRefObject<StrudelApi>): VideoDemoState {
  // [video] Simulated conversation list pushed frame-by-frame via VIDEO_DEMO_MESSAGES; when null, App displays real messages normally
  const [videoDemoMsgs, setVideoDemoMsgs] = useState<ChatMessage[] | null>(null);
  // [video] Remotion emits scrollBottom:true on scene transitions to scroll ConversationView to the bottom
  const [videoConvScrollBottom, setVideoConvScrollBottom] = useState(false);
  // [video] Title override — only active when isVideoMode; no effect on normal app usage
  const [videoTitle, setVideoTitle] = useState<string | null>(null);
  // [video] Detects whether running inside a Remotion iframe; always false in normal browser access, has no effect on any logic
  const [isVideoMode, setIsVideoMode] = useState(() => {
    try { return window.self !== window.top; } catch { return true; }
  });

  // [video] Receive VIDEO_* control messages pushed per-frame by Remotion MyVideo.tsx to drive the in-video App state
  // Normal users never send these messages; the handler is completely silent during regular browser access
  useEffect(() => {
    const handler = (e: MessageEvent) => {
      if (e.data?.type === 'VIDEO_DEMO_MESSAGES') {
        setVideoDemoMsgs(e.data.messages.length > 0 ? e.data.messages : null);
        setIsVideoMode(true);
        if (e.data.scrollBottom) setVideoConvScrollBottom(true);
        if (e.data.sessionTitle) setVideoTitle(e.data.sessionTitle);
      }
      if (e.data?.type === 'VIDEO_SET_CODE' && typeof e.data.code === 'string') {
        strudelRef.current.setCode(e.data.code);
        if (e.data.fadeIn) strudelRef.current.triggerFadeIn();
        if (e.data.scrollToBottom) setTimeout(() => strudelRef.current.scrollCodeToBottom(), 300);
      }
      if (e.data?.type === 'VIDEO_SET_SCROLL_POSITION' && typeof e.data.position === 'number') {
        strudelRef.current.scrollCodeToPosition(e.data.position);
      }
      if (e.data?.type === 'VIDEO_SCROLL_EASED' && typeof e.data.durationMs === 'number') {
        strudelRef.current.scrollCodeToBottomEased(e.data.durationMs);
      }
      // [video] Frame-driven scroll, only sent by Remotion MyVideo.tsx: eased progress is
      // pushed per frame so the scroll speed follows video time (wall-clock easing gets
      // compressed in render); normal users never trigger this
      if (e.data?.type === 'VIDEO_SCROLL_PROGRESS' && typeof e.data.progress === 'number') {
        strudelRef.current.scrollCodeToBottomProgress(e.data.progress);
      }
      if (e.data?.type === 'VIDEO_STOP') {
        strudelRef.current.stop();
      }
      if (e.data?.type === 'VIDEO_TIME' && typeof e.data.time === 'number') {
        strudelRef.current.setVideoTime(e.data.time);
      }
      if (e.data?.type === 'VIDEO_AUDIO_SIM') {
        const galaxy = document.querySelector<HTMLIFrameElement>('iframe[title="galaxy visualizer"]');
        galaxy?.contentWindow?.postMessage({ type: 'AUDIO_SIM', low: e.data.low, mid: e.data.mid, high: e.data.high, chaos: e.data.chaos }, '*');
      }
      if (e.data?.type === 'VIDEO_GALAXY_TIME' && typeof e.data.time === 'number') {
        const galaxy = document.querySelector<HTMLIFrameElement>('iframe[title="galaxy visualizer"]');
        galaxy?.contentWindow?.postMessage({ type: 'GALAXY_TIME', time: e.data.time }, '*');
      }
      if (e.data?.type === 'VIDEO_SET_TITLE' && typeof e.data.title === 'string') {
        setVideoTitle(e.data.title);
      }
      if (e.data?.type === 'VIDEO_PLAY') {
        // Set code in the same tick first, preventing the session init effect from clearing code between messages
        if (typeof e.data.code === 'string') {
          strudelRef.current.setCode(e.data.code);
        }
        // Call play() → evaluate() directly, identical to the agent's code-update path, for seamless playback
        strudelRef.current.play();
        // The ._scope() widget is asynchronously added to the CodeMirror DOM by evaluate(),
        // using scrollDOM directly avoids CSS selector dependency; 2000ms fallback guards against first-load soundfont delay
        // skipScroll: scenes whose scroll is driven per-frame via VIDEO_SCROLL_PROGRESS
        // opt out, so these wall-clock snaps don't fight the eased animation
        if (!e.data.skipScroll) {
          const scrollBottom = () => strudelRef.current.scrollCodeToBottom();
          setTimeout(scrollBottom, 500);
          setTimeout(scrollBottom, 2000);
        }
      }
    };
    window.addEventListener('message', handler);
    return () => window.removeEventListener('message', handler);
  }, [strudelRef]);

  return { isVideoMode, videoDemoMsgs, videoConvScrollBottom, videoTitle };
}
