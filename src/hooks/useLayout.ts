import { useCallback, useEffect, useRef, useState } from 'react';
import type { Dispatch, PointerEventHandler, RefObject, SetStateAction } from 'react';
import { useIsMobile } from './useIsMobile';
import { useKeyboardHeight } from './useKeyboardHeight';

const SIDEBAR_RATIO_DEFAULT = 0.25;
const SIDEBAR_RATIO_MIN = 0.20;
const SIDEBAR_RATIO_MAX = 0.40;
const VIZ_RATIO_DEFAULT = 1 / (1 + 1.55); // ≈ 0.392, derived from top:bottom = 1.55
const VIZ_RATIO_MIN = 0.15;
const VIZ_RATIO_MAX = 0.45;

export interface PointerDragHandlers {
  onPointerDown: PointerEventHandler<HTMLDivElement>;
  onPointerMove: PointerEventHandler<HTMLDivElement>;
  onPointerUp: PointerEventHandler<HTMLDivElement>;
}

export interface UseLayoutReturn {
  isMobile: boolean;
  keyboardHeight: number;
  sidebarWidth: number;
  vizHeight: number;
  isDragging: 'h' | 'v' | null;
  mainRef: RefObject<HTMLDivElement | null>;
  hDragHandlers: PointerDragHandlers;
  vDragHandlers: PointerDragHandlers;
  historyOpen: boolean;
  setHistoryOpen: Dispatch<SetStateAction<boolean>>;
  drawerOpen: boolean;
  setDrawerOpen: Dispatch<SetStateAction<boolean>>;
  mobileFocusedArea: 'chat' | 'code' | null;
  shouldLiftBottomBar: boolean;
  mobileDrawerHeight: number | string;
  handleChatFocusChange: (focused: boolean) => void;
  handleCodeFocusChange: (focused: boolean) => void;
}

/**
 * Owns App's layout chrome: the resizable desktop sidebar/viz split (pointer
 * drag + window-resize clamping) and the mobile drawer / keyboard-focus state.
 * Orthogonal to audio and conversation — extracted so App reads as orchestration.
 */
export function useLayout(): UseLayoutReturn {
  const isMobile = useIsMobile();
  const keyboardHeight = useKeyboardHeight();

  // ── Mobile chrome ──────────────────────────────────────────────────────────
  const [historyOpen, setHistoryOpen] = useState(false);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [mobileFocusedArea, setMobileFocusedArea] = useState<'chat' | 'code' | null>(null);
  const shouldLiftBottomBar = mobileFocusedArea === 'chat' && keyboardHeight > 0;
  const mobileDrawerHeight = !drawerOpen
    ? 0
    : mobileFocusedArea === 'code'
      ? '50dvh'
      : '33dvh';

  useEffect(() => {
    if (!isMobile) return;
    document.body.style.overflow = drawerOpen ? 'hidden' : '';
    return () => { document.body.style.overflow = ''; };
  }, [drawerOpen, isMobile]);

  useEffect(() => {
    if (!isMobile || keyboardHeight > 0) return;
    // Clear focus sync when leaving mobile / the keyboard closes; deliberate effect-driven reset.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setMobileFocusedArea(null);
  }, [isMobile, keyboardHeight]);

  const handleChatFocusChange = useCallback((focused: boolean) => {
    setMobileFocusedArea((current) => {
      if (focused) return 'chat';
      return current === 'chat' ? null : current;
    });
  }, []);

  const handleCodeFocusChange = useCallback((focused: boolean) => {
    setMobileFocusedArea((current) => {
      if (focused) return 'code';
      return current === 'code' ? null : current;
    });
  }, []);

  // ── Desktop split ──────────────────────────────────────────────────────────
  const [sidebarWidth, setSidebarWidth] = useState(() => window.innerWidth * SIDEBAR_RATIO_DEFAULT);
  const [vizHeight, setVizHeight] = useState(() => window.innerHeight * VIZ_RATIO_DEFAULT);
  const [isDragging, setIsDragging] = useState<'h' | 'v' | null>(null);
  const hDragRef = useRef<{ startX: number; startWidth: number } | null>(null);
  const vDragRef = useRef<{ startY: number; startHeight: number } | null>(null);
  const mainRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (mainRef.current) {
      setVizHeight(mainRef.current.offsetHeight * VIZ_RATIO_DEFAULT);
    }
  }, []);

  useEffect(() => {
    const handleResize = () => {
      const h = mainRef.current?.offsetHeight ?? window.innerHeight;
      setSidebarWidth(w => Math.max(window.innerWidth * SIDEBAR_RATIO_MIN, Math.min(window.innerWidth * SIDEBAR_RATIO_MAX, w)));
      setVizHeight(v => Math.max(h * VIZ_RATIO_MIN, Math.min(h * VIZ_RATIO_MAX, v)));
    };
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  const startHDrag = useCallback<PointerEventHandler<HTMLDivElement>>((e) => {
    e.currentTarget.setPointerCapture(e.pointerId);
    hDragRef.current = { startX: e.clientX, startWidth: sidebarWidth };
    setIsDragging('h');
  }, [sidebarWidth]);
  const moveHDrag = useCallback<PointerEventHandler<HTMLDivElement>>((e) => {
    if (!hDragRef.current) return;
    const delta = e.clientX - hDragRef.current.startX;
    setSidebarWidth(Math.max(window.innerWidth * SIDEBAR_RATIO_MIN, Math.min(window.innerWidth * SIDEBAR_RATIO_MAX, hDragRef.current.startWidth + delta)));
  }, []);
  const endHDrag = useCallback<PointerEventHandler<HTMLDivElement>>((e) => {
    e.currentTarget.releasePointerCapture(e.pointerId);
    hDragRef.current = null;
    setIsDragging(null);
  }, []);

  const startVDrag = useCallback<PointerEventHandler<HTMLDivElement>>((e) => {
    e.currentTarget.setPointerCapture(e.pointerId);
    vDragRef.current = { startY: e.clientY, startHeight: vizHeight };
    setIsDragging('v');
  }, [vizHeight]);
  const moveVDrag = useCallback<PointerEventHandler<HTMLDivElement>>((e) => {
    if (!vDragRef.current) return;
    const delta = e.clientY - vDragRef.current.startY;
    const h = mainRef.current?.offsetHeight ?? window.innerHeight;
    setVizHeight(Math.max(h * VIZ_RATIO_MIN, Math.min(h * VIZ_RATIO_MAX, vDragRef.current.startHeight - delta)));
  }, []);
  const endVDrag = useCallback<PointerEventHandler<HTMLDivElement>>((e) => {
    e.currentTarget.releasePointerCapture(e.pointerId);
    vDragRef.current = null;
    setIsDragging(null);
  }, []);

  return {
    isMobile,
    keyboardHeight,
    sidebarWidth,
    vizHeight,
    isDragging,
    mainRef,
    hDragHandlers: { onPointerDown: startHDrag, onPointerMove: moveHDrag, onPointerUp: endHDrag },
    vDragHandlers: { onPointerDown: startVDrag, onPointerMove: moveVDrag, onPointerUp: endVDrag },
    historyOpen,
    setHistoryOpen,
    drawerOpen,
    setDrawerOpen,
    mobileFocusedArea,
    shouldLiftBottomBar,
    mobileDrawerHeight,
    handleChatFocusChange,
    handleCodeFocusChange,
  };
}
