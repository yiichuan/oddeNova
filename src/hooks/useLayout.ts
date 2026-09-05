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
/** How far the divider must travel past the minimum height before the drag
 *  reads as "close it" rather than "make it as short as it goes". */
const VIZ_COLLAPSE_SLOP = 48;
/** Same slop for the sidebar divider, on the horizontal axis. */
const SIDEBAR_COLLAPSE_SLOP = 48;
/** Dead band above the closing boundary. Closing and reopening read the same
 *  number — the width the divider is asking for — so a divider parked on the
 *  boundary would otherwise close and reopen on alternating pointer moves. */
const SIDEBAR_REOPEN_HYSTERESIS = 32;
/** How far a grab on a closed column has to travel right before it reopens.
 *  Such a drag starts one pull short of the reopen boundary rather than at
 *  zero width, so coming back costs this much and not a minimum width. */
const SIDEBAR_REOPEN_PULL = 48;
/** The width at which a closed column reopens, given its minimum width. */
const sidebarReopenBoundary = (min: number) => min - SIDEBAR_COLLAPSE_SLOP + SIDEBAR_REOPEN_HYSTERESIS;
/** Height of the vertical resize handle — `--spacing-divider` in index.css. */
export const VIZ_DIVIDER_HEIGHT = 6;

export interface PointerDragHandlers {
  onPointerDown: PointerEventHandler<HTMLDivElement>;
  onPointerMove: PointerEventHandler<HTMLDivElement>;
  onPointerUp: PointerEventHandler<HTMLDivElement>;
}

export interface UseLayoutReturn {
  isMobile: boolean;
  keyboardHeight: number;
  sidebarWidth: number;
  sidebarCollapsed: boolean;
  vizHeight: number;
  vizCollapsed: boolean;
  toggleVizCollapsed: () => void;
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
  // Dragging the divider past the sidebar's minimum width closes the
  // conversation column outright, handing its floor space to the studio.
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [vizHeight, setVizHeight] = useState(() => window.innerHeight * VIZ_RATIO_DEFAULT);
  // Collapsing hides the viz pane; reopening it always returns to the default
  // split rather than whatever height it happened to close at. The pane itself
  // stays mounted throughout — it's an iframe whose galaxy is generated once
  // from unseeded randomness, so remounting it would hand back a different
  // one. It idles instead: galaxy-ascii.html skips its frame at zero size.
  const [vizCollapsed, setVizCollapsed] = useState(false);
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
    const min = window.innerWidth * SIDEBAR_RATIO_MIN;
    hDragRef.current = {
      startX: e.clientX,
      startWidth: sidebarCollapsed ? sidebarReopenBoundary(min) - SIDEBAR_REOPEN_PULL : sidebarWidth,
    };
    setIsDragging('h');
  }, [sidebarCollapsed, sidebarWidth]);
  const moveHDrag = useCallback<PointerEventHandler<HTMLDivElement>>((e) => {
    if (!hDragRef.current) return;
    const delta = e.clientX - hDragRef.current.startX;
    const min = window.innerWidth * SIDEBAR_RATIO_MIN;
    const target = hDragRef.current.startWidth + delta;
    // Pulling the divider well inside the minimum width means "close the
    // column", not "hold it at the minimum". Dragging back out reopens it
    // within the same gesture — the handle keeps pointer capture while it is
    // clipped to zero width, and stays grabbable there afterwards. Reopening
    // sits a dead band above closing, so the two cannot trade the column back
    // and forth while the divider hovers on the line.
    setSidebarCollapsed((collapsed) => (
      collapsed ? target < sidebarReopenBoundary(min) : target < min - SIDEBAR_COLLAPSE_SLOP
    ));
    setSidebarWidth(Math.max(min, Math.min(window.innerWidth * SIDEBAR_RATIO_MAX, target)));
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
    const min = h * VIZ_RATIO_MIN;
    const target = vDragRef.current.startHeight - delta;
    // Pulling the divider well below the minimum height means "close the pane",
    // not "hold it at the minimum". Dragging back up reopens it within the same
    // gesture: the handle keeps pointer capture while it is clipped to zero.
    // Safe to set unconditionally — a collapsed handle can't start a drag.
    setVizCollapsed(target < min - VIZ_COLLAPSE_SLOP);
    setVizHeight(Math.max(min, Math.min(h * VIZ_RATIO_MAX, target)));
  }, []);
  const toggleVizCollapsed = useCallback(() => {
    if (vizCollapsed) {
      const h = mainRef.current?.offsetHeight ?? window.innerHeight;
      setVizHeight(h * VIZ_RATIO_DEFAULT);
    }
    setVizCollapsed((v) => !v);
  }, [vizCollapsed]);

  const endVDrag = useCallback<PointerEventHandler<HTMLDivElement>>((e) => {
    e.currentTarget.releasePointerCapture(e.pointerId);
    vDragRef.current = null;
    setIsDragging(null);
  }, []);

  return {
    isMobile,
    keyboardHeight,
    sidebarWidth,
    sidebarCollapsed,
    vizHeight,
    vizCollapsed,
    toggleVizCollapsed,
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
