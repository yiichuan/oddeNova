import { useEffect, useState } from 'react';
import type { MutableRefObject } from 'react';
import type { useStrudel } from './useStrudel';
import type { ChatMessage } from './useChat';
import type { CodeRevision } from './useSessions';
import { t } from '../lib/i18n';
import { setVideoClock } from '../lib/video-clock';

type StrudelApi = ReturnType<typeof useStrudel>;

export interface VideoDemoState {
  isVideoMode: boolean;
  videoDemoMsgs: ChatMessage[] | null;
  videoDemoLoading: boolean;
  videoDemoRevisions: CodeRevision[] | null;
  videoTurnHeight: number | null;
  videoConvScrollBottom: boolean;
  videoConvScrollProgress: number | null;
  videoTitle: string | null;
  videoInputText: string | undefined;
  videoInputSubmitted: boolean;
}

interface VideoRect { x: number; y: number; w: number; h: number }

/**
 * [video] Where the renderer's camera needs to aim, in iframe CSS pixels. Measured
 * here rather than hard-coded in the video, so a layout change in the app moves
 * the camera with it instead of leaving it framing empty space.
 */
function measureVideoLayout(): Record<string, VideoRect | null> {
  const rectOf = (el: Element | null | undefined): VideoRect | null => {
    if (!el) return null;
    const r = el.getBoundingClientRect();
    return { x: r.left, y: r.top, w: r.width, h: r.height };
  };
  const aside = document.querySelector('aside');
  return {
    sidebar: rectOf(aside),
    chatInput: rectOf(aside?.querySelector('.chat-input-surface')),
    send: rectOf(aside?.querySelector(`form button[title="${t('send')}"]`)),
    conversation: rectOf(aside?.querySelector('.conversation-scroll')),
    download: rectOf(document.querySelector(`main button[aria-label="${t('download')}"]`)),
    main: rectOf(document.querySelector('main')),
  };
}

/**
 * [video] The download scene's targets, in iframe CSS pixels, measured live: the
 * export key moves once code is loaded (the control capsule beside it widens and the
 * viz toggle joins the row), so the startup layout no longer says where it is. While
 * the export popover is open, its frame and confirm key come along for the camera.
 */
function measureExportTargets(key: Element): Record<string, VideoRect> {
  const rectOf = (el: Element): VideoRect => {
    const r = el.getBoundingClientRect();
    return { x: r.left, y: r.top, w: r.width, h: r.height };
  };
  const out: Record<string, VideoRect> = { download: rectOf(key) };
  const pop = document.querySelector('[data-testid="export-popover"]');
  const buttons = pop?.querySelectorAll('button');
  const confirm = buttons?.[buttons.length - 1];
  if (pop && confirm) {
    out.dialog = rectOf(pop);
    out.confirm = rectOf(confirm);
  }
  return out;
}

function postToViz(message: Record<string, unknown>): void {
  const viz = document.querySelector<HTMLIFrameElement>('[data-testid="viz-pane"] iframe');
  viz?.contentWindow?.postMessage(message, '*');
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
  // [video] A simulated turn in flight: drives the same live reasoning view and loading
  // indicator a real run shows, then lets the turn collapse into its action group
  const [videoDemoLoading, setVideoDemoLoading] = useState(false);
  // [video] Revisions the simulated replies point at, so their code renders as the same
  // change widget a real agent turn gets instead of the plain code bar
  const [videoDemoRevisions, setVideoDemoRevisions] = useState<CodeRevision[] | null>(null);
  // [video] Height of the in-flight turn block, chosen by the renderer to fit its camera framing
  const [videoTurnHeight, setVideoTurnHeight] = useState<number | null>(null);
  // [video] Remotion emits scrollBottom:true on scene transitions to scroll ConversationView to the bottom
  const [videoConvScrollBottom, setVideoConvScrollBottom] = useState(false);
  // [video] Frame-driven conversation scroll (scrollTop = maxScrollTop * progress); null keeps the
  // conversation pinned to the top, which is where video mode starts every scene
  const [videoConvScrollProgress, setVideoConvScrollProgress] = useState<number | null>(null);
  // [video] Title override — only active when isVideoMode; no effect on normal app usage
  const [videoTitle, setVideoTitle] = useState<string | null>(null);
  // [video] Frame-driven text for the existing ChatInput; undefined preserves normal app input behavior
  const [videoInputText, setVideoInputText] = useState<string | undefined>(undefined);
  // [video] True between the fake click and the reply streaming in, so the send button shows
  // the same stop state a real send would
  const [videoInputSubmitted, setVideoInputSubmitted] = useState(false);
  // [video] Detects whether running inside a Remotion iframe; always false in normal browser access, has no effect on any logic
  const [isVideoMode, setIsVideoMode] = useState(() => {
    try { return window.self !== window.top; } catch { return true; }
  });

  // [video] Receive VIDEO_* control messages pushed per-frame by Remotion MyVideo.tsx to drive the in-video App state
  // Normal users never send these messages; the handler is completely silent during regular browser access
  useEffect(() => {
    // [video] When the export key was last pressed on the renderer's behalf. Open state is
    // read back off the key's aria-expanded, which lags the press by a render, so a second
    // request landing inside that gap must not press it again and toggle the popover shut.
    let lastExportToggleAt = -Infinity;
    const handler = (e: MessageEvent) => {
      if (e.data?.type === 'VIDEO_DEMO_MESSAGES') {
        setVideoDemoMsgs(e.data.messages.length > 0 ? e.data.messages : null);
        setVideoDemoLoading(e.data.loading === true);
        if (Array.isArray(e.data.revisions)) setVideoDemoRevisions(e.data.revisions);
        if (typeof e.data.turnHeight === 'number') setVideoTurnHeight(e.data.turnHeight);
        setIsVideoMode(true);
        if (e.data.scrollBottom) setVideoConvScrollBottom(true);
        if (typeof e.data.scrollProgress === 'number') setVideoConvScrollProgress(e.data.scrollProgress);
        if (e.data.sessionTitle) setVideoTitle(e.data.sessionTitle);
      }
      if (e.data?.type === 'VIDEO_DEMO_INPUT' && typeof e.data.text === 'string') {
        setVideoInputText(e.data.text);
        setIsVideoMode(true);
        setVideoInputSubmitted(e.data.submitted === true);
      }
      if (e.data?.type === 'VIDEO_MEASURE') {
        (e.source as Window | null)?.postMessage({ type: 'VIDEO_LAYOUT', layout: measureVideoLayout() }, '*');
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
      // [video] Frame-driven: the renderer states every frame whether the export popover
      // should be open. Pressed through the real key so the popover opens where a user's
      // click would put it; while open, its rects are reported back for the camera.
      if (e.data?.type === 'VIDEO_EXPORT_OPEN' && typeof e.data.open === 'boolean') {
        const key = document.querySelector<HTMLButtonElement>(`main button[aria-label="${t('download')}"]`);
        const isOpen = key?.getAttribute('aria-expanded') === 'true';
        if (key && isOpen !== e.data.open && performance.now() - lastExportToggleAt > 200) {
          lastExportToggleAt = performance.now();
          key.click();
        }
        if (e.data.measure) {
          const source = e.source as Window | null;
          requestAnimationFrame(() => requestAnimationFrame(() => {
            const liveKey = document.querySelector(`main button[aria-label="${t('download')}"]`);
            if (liveKey) source?.postMessage({ type: 'VIDEO_EXPORT_LAYOUT', layout: measureExportTargets(liveKey) }, '*');
          }));
        }
      }
      if (e.data?.type === 'VIDEO_STOP') {
        strudelRef.current.stop();
      }
      if (e.data?.type === 'VIDEO_TIME' && typeof e.data.time === 'number') {
        strudelRef.current.setVideoTime(e.data.time);
      }
      if (e.data?.type === 'VIDEO_AUDIO_SIM') {
        postToViz({ type: 'AUDIO_SIM', low: e.data.low, mid: e.data.mid, high: e.data.high, chaos: e.data.chaos });
      }
      if (e.data?.type === 'VIDEO_GALAXY_TIME' && typeof e.data.time === 'number') {
        // Sent every frame with the video's own time, so it doubles as the clock
        // wall-clock animations seek to (see lib/video-clock)
        setVideoClock(e.data.time);
        postToViz({ type: 'GALAXY_TIME', time: e.data.time });
      }
      if (e.data?.type === 'VIDEO_SET_TITLE' && typeof e.data.title === 'string') {
        setVideoTitle(e.data.title);
      }
      if (e.data?.type === 'VIDEO_PLAY') {
        // Set code in the same tick first, preventing the session init effect from clearing code between messages
        if (typeof e.data.code === 'string') {
          strudelRef.current.setCode(e.data.code);
        }
        // Where in the piece playback begins: play() seeks the transport to this time
        if (typeof e.data.time === 'number') {
          strudelRef.current.setVideoTime(e.data.time);
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
    // [video] The renderer holds its first frame on a delayRender() until this lands, then
    // pushes the frame state; sent only from inside an iframe, so a normal tab never posts
    // it to itself. Safe to repeat — the renderer clears its handle once.
    if (window.self !== window.top) {
      window.parent.postMessage({ type: 'VIDEO_READY' }, '*');
    }
    return () => window.removeEventListener('message', handler);
  }, [strudelRef]);

  // [video] Marks the page for render-only CSS fixes (see `html[data-video-mode]` in
  // index.css). Nothing outside the Remotion iframe ever sets it.
  useEffect(() => {
    if (!isVideoMode) return;
    document.documentElement.setAttribute('data-video-mode', '');
    return () => document.documentElement.removeAttribute('data-video-mode');
  }, [isVideoMode]);

  return {
    isVideoMode,
    videoDemoMsgs,
    videoDemoLoading,
    videoDemoRevisions,
    videoTurnHeight,
    videoConvScrollBottom,
    videoConvScrollProgress,
    videoTitle,
    videoInputText,
    videoInputSubmitted,
  };
}
