import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type FocusEvent as ReactFocusEvent,
  type MouseEvent as ReactMouseEvent,
  type ReactNode,
} from 'react';
import { createPortal } from 'react-dom';
import {
  Disc3,
  Ellipsis,
  Heart,
  Home,
  PanelLeft,
  Settings,
  User,
  type LucideIcon,
} from 'lucide-react';
import { t } from '../../lib/i18n';
import { GITHUB_URL, LEARN_URL } from '../../lib/external-links';
import { BookOpenIcon } from '../icons';
import {
  clamp,
  liquidOutline,
  NAV_RADIUS,
  NECK_SNAP,
  rejoinSpread,
  REJOIN_MS,
  solveSpreadTime,
  splitSpread,
  SPLIT_MS,
  UNFOLD_MS,
  unfoldCurve,
} from './liquid-column';

export type PrimaryNavItem = 'home' | 'featured' | 'favorites' | 'vinylLab' | 'more' | 'settings' | 'account';

interface PrimaryNavProps {
  selectedItem: PrimaryNavItem;
  onSelect: (item: PrimaryNavItem) => void;
  /**
   * Whether Featured is showing one piece rather than the collection. Only the
   * collection stands the column apart; a piece opened out of it is a page like
   * any other, and the column flows back together for it.
   */
  featuredPieceOpen?: boolean;
}

/**
 * The collection pages where the column breaks apart. Read in three places —
 * the shape it starts settled in, the spread it starts at, and the shape it is
 * heading for — which have to agree or the column starts mid-transition.
 */
const wantsPodsFor = (selectedItem: PrimaryNavItem, featuredPieceOpen: boolean) => (
  selectedItem === 'favorites' || (selectedItem === 'featured' && !featuredPieceOpen)
);

interface NavItem {
  id: PrimaryNavItem;
  labelKey: string;
  icon: LucideIcon;
}

/* Which pod a group belongs to once the bar has split, and whether that pod is
   currently showing only its face icon. `primary` is the item that stays
   visible in the collapsed pod — everything else is what unfolding reveals. */
interface PodGroupState {
  primary?: PrimaryNavItem;
  collapsed: boolean;
  /* Rows dissolve as the lobes close over them. While the strand is still
     stretching nothing has moved yet, so hold the fade until it snaps. */
  fadeDelayMs?: number;
}

const TOP_ITEMS: NavItem[] = [
  { id: 'home', labelKey: 'navHome', icon: Home },
  { id: 'featured', labelKey: 'navFeatured', icon: Disc3 },
  { id: 'favorites', labelKey: 'navFavorites', icon: Heart },
];

const BOTTOM_ITEMS: NavItem[] = [
  { id: 'more', labelKey: 'navMore', icon: Ellipsis },
  { id: 'settings', labelKey: 'navSettings', icon: Settings },
  { id: 'account', labelKey: 'navAccount', icon: User },
];

const NAV_TOOLTIP_ID = 'primary-nav-tooltip';
const NAV_PAGES_GROUP_ID = 'primary-nav-pages';

/* Triggers sit 10px inside the collapsed 60px column, so a 12px offset from the
   button leaves a 2px gap between the tooltip and the nav's right border. */
const NAV_TOOLTIP_OFFSET = 12;

const POD_ROW = 40;
const POD_ROW_GAP = 8;
/* In the bar the header row is lifted so its centre line matches the sidebar
   title (12px padding - 5px lift), and the first group clears it by 25px. */
const BAR_HEADER_OFFSET = 7;
const BAR_GROUP_GAP = 25;
const BAR_EDGE_PADDING = 12;

/* A folded lobe is the column wrapped around its icon, keeping the inset that
   icon already has from the column's end. Neither icon moves when the bar
   splits, which is what decides these heights — so the lobes are rounded
   rectangles of different heights rather than matching squares. */
const TOP_POD_SIZE = BAR_HEADER_OFFSET * 2 + POD_ROW;
const BOTTOM_POD_SIZE = BAR_EDGE_PADDING * 2 + POD_ROW;
const PODS_SIZE = TOP_POD_SIZE + BOTTOM_POD_SIZE;

/* How much taller an unfolded lobe is than a folded one — read off the rows
   each lobe actually carries, so adding a page grows the lobe that holds it
   rather than leaving the last row clipped.

   The pages lobe keeps the bar's gap under the logo — that distance is part of
   the mark, not something to squeeze — and unfolds every one of its rows. The
   account lobe already shows one row folded, so it only has the rest to
   reveal. */
const rowsHeight = (rows: number) => rows * POD_ROW + Math.max(rows - 1, 0) * POD_ROW_GAP;
const PAGES_UNFOLD = BAR_GROUP_GAP + rowsHeight(TOP_ITEMS.length);
const ACCOUNT_UNFOLD = POD_ROW_GAP + rowsHeight(BOTTOM_ITEMS.length - 1);
/* How far the pair may overshoot each other when the strand snaps. */
const POD_RECOIL = 12;

type SettledShape = 'bar' | 'pods';
type NavShape = SettledShape | 'breaking';
type PodId = 'top' | 'bottom';

/* One animated scalar. `curve` maps 0..1 of its own run onto a value, which is
   what lets a spread carry a two-beat liquid timeline and an unfold carry a
   plain slosh through the same loop. */
interface MotionTrack {
  value: number;
  curve: ((t: number) => number) | null;
  start: number;
  duration: number;
}

const makeTrack = (value: number): MotionTrack => ({ value, curve: null, start: 0, duration: 0 });

const prefersReducedMotion = () => typeof window !== 'undefined'
  && typeof window.matchMedia === 'function'
  && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

function startTrack(track: MotionTrack, curve: (t: number) => number, duration: number): void {
  /* Nothing to animate — land on the value and let the next paint pick it up. */
  if (duration <= 8 || prefersReducedMotion()) {
    track.value = curve(1);
    track.curve = null;
    track.duration = 0;
    return;
  }
  track.curve = curve;
  track.start = performance.now();
  track.duration = duration;
}

function advanceTrack(track: MotionTrack, now: number): boolean {
  if (!track.curve) return false;
  const t = (now - track.start) / track.duration;
  if (t >= 1) {
    track.value = track.curve(1);
    track.curve = null;
    return false;
  }
  track.value = track.curve(Math.max(t, 0));
  return true;
}

interface TooltipState {
  label: string;
  left: number;
  top: number;
}

interface TooltipTriggerProps {
  'aria-describedby'?: string;
  onMouseEnter: (event: ReactMouseEvent<HTMLElement>) => void;
  onMouseLeave: () => void;
  onFocus: (event: ReactFocusEvent<HTMLElement>) => void;
  onBlur: () => void;
}

type GetTooltipTriggerProps = (label: string) => TooltipTriggerProps;

function PrimaryNavTooltip({ tooltip }: { tooltip: TooltipState }) {
  if (typeof document === 'undefined') return null;

  return createPortal(
    <div
      className="pointer-events-none fixed z-[200] -translate-y-1/2"
      style={{ left: tooltip.left, top: tooltip.top }}
    >
      <div id={NAV_TOOLTIP_ID} role="tooltip" className="primary-nav-tooltip">
        {tooltip.label}
      </div>
    </div>,
    document.body,
  );
}

function MoreMenu({
  expanded,
  selectedItem,
  onSelect,
  getTooltipTriggerProps,
  hideTooltip,
  onOpenChange,
}: {
  expanded: boolean;
  selectedItem: PrimaryNavItem;
  onSelect: (item: PrimaryNavItem) => void;
  getTooltipTriggerProps: GetTooltipTriggerProps;
  hideTooltip: () => void;
  onOpenChange?: (open: boolean) => void;
}) {
  const [open, setOpen] = useState(false);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);

  const positionMenu = useCallback(() => {
    const button = buttonRef.current;
    const menu = menuRef.current;
    if (!button || !menu) return;

    const rect = button.getBoundingClientRect();
    menu.style.left = `${rect.left}px`;
    menu.style.bottom = `${window.innerHeight - rect.top + 8}px`;
    menu.style.width = `${rect.width}px`;
  }, []);

  const closeMenu = useCallback(() => {
    const menu = menuRef.current;
    if (menu && typeof menu.hidePopover === 'function') {
      try {
        if (menu.matches(':popover-open')) menu.hidePopover();
      } catch {
        // Older DOM implementations may not understand :popover-open.
      }
    }
    setOpen(false);
  }, []);

  useEffect(() => {
    const menu = menuRef.current;
    if (!menu) return;

    const syncOpenState = () => {
      try {
        setOpen(menu.matches(':popover-open'));
      } catch {
        // The React state remains authoritative in the non-popover fallback.
      }
    };

    menu.addEventListener('toggle', syncOpenState);
    return () => menu.removeEventListener('toggle', syncOpenState);
  }, []);

  /* The menu floats outside the pod, so the pod has to stay unfolded for as
     long as it is up — otherwise reaching for a link collapses the pod out
     from under the pointer. */
  useEffect(() => {
    onOpenChange?.(open);
    return () => onOpenChange?.(false);
  }, [open, onOpenChange]);

  useEffect(() => {
    if (!open) return;
    positionMenu();
    window.addEventListener('resize', positionMenu);
    window.addEventListener('scroll', positionMenu, true);
    return () => {
      window.removeEventListener('resize', positionMenu);
      window.removeEventListener('scroll', positionMenu, true);
    };
  }, [open, positionMenu]);

  const toggleMenu = () => {
    hideTooltip();
    const menu = menuRef.current;
    if (!menu) return;
    if (open) {
      closeMenu();
      return;
    }

    positionMenu();
    setOpen(true);
    if (typeof menu.showPopover === 'function') {
      try {
        menu.showPopover();
      } catch {
        // State-driven rendering keeps the control usable without Popover API.
      }
    }
  };

  const linkClass = `flex h-10 w-full items-center overflow-hidden rounded-[6px] text-icon-idle transition-colors hover:bg-white/5 hover:text-text-secondary focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-white/40 ${
    expanded ? 'text-left' : 'justify-center'
  }`;

  return (
    <>
      <button
        ref={buttonRef}
        type="button"
        aria-label={t('navMore')}
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={toggleMenu}
        {...getTooltipTriggerProps(t('navMore'))}
        className={`flex h-10 w-full items-center overflow-hidden rounded-[6px] text-left transition-colors ${
          open || selectedItem === 'vinylLab'
            ? 'bg-white/10 text-text-primary'
            : 'text-icon-idle hover:bg-white/5 hover:text-text-secondary'
        }`}
      >
        <span className="flex size-10 shrink-0 items-center justify-center">
          <Ellipsis size={21} strokeWidth={1.6} aria-hidden="true" />
        </span>
        <span
          aria-hidden={!expanded}
          className={`min-w-0 whitespace-nowrap text-sm transition-[opacity,transform] duration-200 ease-out motion-reduce:transition-none ${
            expanded
              ? 'ml-2 translate-x-0 opacity-100 delay-100'
              : '-translate-x-1 opacity-0'
          }`}
        >
          {t('navMore')}
        </span>
      </button>

      <div
        ref={menuRef}
        popover="auto"
        role="menu"
        aria-label={t('navMore')}
        data-open={open}
        className="primary-nav-more-menu"
      >
        <button
          type="button"
          role="menuitem"
          aria-label={t('navVinylLab')}
          onClick={() => {
            hideTooltip();
            closeMenu();
            onSelect('vinylLab');
          }}
          {...getTooltipTriggerProps(t('navVinylLab'))}
          className={linkClass}
        >
          <span className="flex size-10 shrink-0 items-center justify-center">
            <Disc3 size={20} strokeWidth={1.5} aria-hidden="true" />
          </span>
          <span aria-hidden={!expanded} className={expanded ? 'ml-2 whitespace-nowrap text-sm' : 'sr-only'}>
            {t('navVinylLab')}
          </span>
        </button>
        <a
          role="menuitem"
          aria-label={t('navLearnStrudel')}
          href={LEARN_URL}
          target="_blank"
          rel="noopener noreferrer"
          onClick={() => {
            hideTooltip();
            closeMenu();
          }}
          {...getTooltipTriggerProps(t('navLearnStrudel'))}
          className={linkClass}
        >
          <span className="flex size-10 shrink-0 items-center justify-center">
            <BookOpenIcon size={21} />
          </span>
          <span aria-hidden={!expanded} className={expanded ? 'ml-2 whitespace-nowrap text-sm' : 'sr-only'}>
            {t('navLearnStrudel')}
          </span>
        </a>
        <a
          role="menuitem"
          aria-label="GitHub"
          href={GITHUB_URL}
          target="_blank"
          rel="noopener noreferrer"
          onClick={() => {
            hideTooltip();
            closeMenu();
          }}
          {...getTooltipTriggerProps('GitHub')}
          className={linkClass}
        >
          <span className="flex size-10 shrink-0 items-center justify-center">
            <span className="primary-nav-github-logo size-[21px]" aria-hidden="true" />
          </span>
          <span aria-hidden={!expanded} className={expanded ? 'ml-2 whitespace-nowrap text-sm' : 'sr-only'}>
            GitHub
          </span>
        </a>
      </div>
    </>
  );
}

function NavGroup({
  items,
  selectedItem,
  onSelect,
  testId,
  expanded,
  pod,
  renderMore,
  getTooltipTriggerProps,
  hideTooltip,
}: PrimaryNavProps & {
  items: NavItem[];
  testId: string;
  expanded: boolean;
  pod?: PodGroupState;
  renderMore?: () => ReactNode;
  getTooltipTriggerProps: GetTooltipTriggerProps;
  hideTooltip: () => void;
}) {
  /* A folded pod clips its extra rows, but clipping alone would leave a sliver
     of a selected row's fill peeking over the edge — fade them out too. Rows
     the pod always shows return null and keep their plain colour transition. */
  const revealState = (id: PrimaryNavItem) => {
    if (!pod || id === pod.primary) return null;
    return pod.collapsed ? 'pointer-events-none opacity-0' : 'opacity-100';
  };

  return (
    <div
      /* `shrink-0`: a folded pod is shorter than its rows, and a shrinking group
         would squash the icons instead of letting the pod clip them. */
      className={`flex w-full shrink-0 flex-col gap-2 transition-[padding] duration-300 ease-[cubic-bezier(0.22,1,0.36,1)] motion-reduce:transition-none ${
        expanded ? 'px-2' : 'px-[10px]'
      }`}
      data-testid={testId}
    >
      {items.map(({ id, labelKey, icon: Icon }) => {
        if (id === 'more' && renderMore) {
          const reveal = revealState(id);
          return (
            <div
              key={id}
              className={`w-full ${reveal ? `transition-opacity duration-200 ease-out motion-reduce:transition-none ${reveal}` : ''}`}
              style={{ transitionDelay: pod?.fadeDelayMs ? `${pod.fadeDelayMs}ms` : undefined }}
            >
              {renderMore()}
            </div>
          );
        }

        const reveal = revealState(id);
        const selected = selectedItem === id;
        const label = t(labelKey);
        /* The pod's face icon is its own hover target; a tooltip on top of the
           unfolding it triggers is noise. */
        const tooltipProps = pod && id === pod.primary ? {} : getTooltipTriggerProps(label);

        return (
          <button
            key={id}
            type="button"
            aria-label={label}
            aria-current={selected ? 'page' : undefined}
            onClick={() => {
              hideTooltip();
              onSelect(id);
            }}
            {...tooltipProps}
            /* One `transition-*` utility per element: pairing `transition-opacity`
               with `transition-colors` lets the cascade drop whichever loses. */
            className={`flex h-10 w-full items-center overflow-hidden rounded-[6px] text-left ${
              reveal
                ? `transition-[opacity,color,background-color] duration-200 ease-out motion-reduce:transition-none ${reveal}`
                : 'transition-colors'
            } ${
              selected
                ? 'bg-white/10 text-text-primary'
                : 'text-icon-idle hover:bg-white/5 hover:text-text-secondary'
            }`}
            style={{ transitionDelay: reveal && pod?.fadeDelayMs ? `${pod.fadeDelayMs}ms` : undefined }}
          >
            <span className="flex size-10 shrink-0 items-center justify-center">
              <Icon size={21} strokeWidth={1.6} aria-hidden="true" />
            </span>
            <span
              aria-hidden={!expanded}
              className={`min-w-0 whitespace-nowrap text-sm transition-[opacity,transform] duration-200 ease-out motion-reduce:transition-none ${
                expanded
                  ? 'ml-2 translate-x-0 opacity-100 delay-100'
                  : '-translate-x-1 opacity-0'
              }`}
            >
              {label}
            </span>
          </button>
        );
      })}
    </div>
  );
}

export default function PrimaryNav({
  selectedItem,
  onSelect,
  featuredPieceOpen = false,
}: PrimaryNavProps) {
  const [navExpanded, setNavExpanded] = useState(false);
  const [tooltip, setTooltip] = useState<TooltipState | null>(null);
  const [settledShape, setSettledShape] = useState<SettledShape>(
    () => (wantsPodsFor(selectedItem, featuredPieceOpen) ? 'pods' : 'bar'),
  );
  const [openPod, setOpenPod] = useState<PodId | null>(null);
  const [moreMenuOpen, setMoreMenuOpen] = useState(false);
  const tooltipTimerRef = useRef<number | null>(null);
  const navRef = useRef<HTMLElement>(null);
  const glassRef = useRef<HTMLDivElement>(null);
  const edgeRef = useRef<HTMLDivElement>(null);
  const topLobeRef = useRef<HTMLDivElement>(null);
  const bottomLobeRef = useRef<HTMLDivElement>(null);
  const sizeRef = useRef({ width: 0, height: 0 });
  const frameRef = useRef<number | null>(null);
  const settleMsRef = useRef(0);

  /* The silhouette is redrawn frame by frame rather than transitioned, because
     a strand that stretches, thins and pinches is not something a CSS
     transition between two shapes can express. Everything it needs lives in
     refs so a frame costs one paint, not one React render. */
  const motionRef = useRef({
    spread: makeTrack(wantsPodsFor(selectedItem, featuredPieceOpen) ? 1 : 0),
    unfoldTop: makeTrack(0),
    unfoldBottom: makeTrack(0),
  });

  const wantsPods = wantsPodsFor(selectedItem, featuredPieceOpen);
  const showingSectionMark = (selectedItem === 'featured' && !featuredPieceOpen)
    || selectedItem === 'favorites';
  const SectionMarkIcon = selectedItem === 'favorites' ? Heart : Disc3;
  const targetShape: SettledShape = wantsPods ? 'pods' : 'bar';
  /* `breaking` is never stored: it is exactly "the shape has not caught up with
     the page yet", which is what keeps one transition running at a time. */
  const shape: NavShape = settledShape === targetShape ? targetShape : 'breaking';
  const podsMode = shape === 'pods';
  /* Anything but the settled bar is already committed to the split: the column
     stops being expandable the moment the liquid starts to move. */
  const splitting = shape !== 'bar';
  /* Split lobes are icon-sized; there is nowhere to hang the 188px label column,
     and the column comes back the way the user left it on the way out. */
  const expanded = navExpanded && !wantsPods;
  const topOpen = podsMode && openPod === 'top';
  const bottomOpen = podsMode && (openPod === 'bottom' || moreMenuOpen);

  const hideTooltip = useCallback(() => {
    if (tooltipTimerRef.current !== null) {
      window.clearTimeout(tooltipTimerRef.current);
      tooltipTimerRef.current = null;
    }
    setTooltip(null);
  }, []);

  const showTooltip = useCallback((label: string, target: HTMLElement, delayMs: number) => {
    if (expanded) return;
    if (tooltipTimerRef.current !== null) window.clearTimeout(tooltipTimerRef.current);

    const rect = target.getBoundingClientRect();
    const reveal = () => {
      setTooltip({
        label,
        left: rect.right + NAV_TOOLTIP_OFFSET,
        top: rect.top + rect.height / 2,
      });
      tooltipTimerRef.current = null;
    };

    if (delayMs === 0) {
      reveal();
    } else {
      tooltipTimerRef.current = window.setTimeout(reveal, delayMs);
    }
  }, [expanded]);

  const getTooltipTriggerProps = useCallback((label: string): TooltipTriggerProps => ({
    'aria-describedby': expanded ? undefined : NAV_TOOLTIP_ID,
    onMouseEnter: (event) => showTooltip(label, event.currentTarget, 250),
    onMouseLeave: hideTooltip,
    onFocus: (event) => showTooltip(label, event.currentTarget, 0),
    onBlur: hideTooltip,
  }), [expanded, hideTooltip, showTooltip]);

  useEffect(() => () => {
    if (tooltipTimerRef.current !== null) window.clearTimeout(tooltipTimerRef.current);
  }, []);

  /* One paint = one silhouette. The lobes' clip boxes are written here too, so
     the icons are always clipped by exactly the shape they sit in. */
  const paint = useCallback(() => {
    const glass = glassRef.current;
    const edge = edgeRef.current;
    const topLobe = topLobeRef.current;
    const bottomLobe = bottomLobeRef.current;
    const { width, height } = sizeRef.current;
    if (!glass || !edge || !topLobe || !bottomLobe || width <= 0 || height <= 0) return;

    const motion = motionRef.current;
    const gapMax = Math.max(height - PODS_SIZE, 0);
    /* Spread runs a little past 1 after the snap — the lobes recoil before they
       relax into shape. Capped in pixels so a tall column does not recoil so
       far that a lobe clips its own icon. */
    const recoil = gapMax > 0 ? 1 + POD_RECOIL / gapMax : 1;
    const spread = clamp(motion.spread.value, 0, recoil);
    /* Each lobe travels from half the column to its own folded height, so both
       ends of the same strand are always the same fraction of the way there. */
    const half = height / 2;
    let topHeight = half - (half - TOP_POD_SIZE) * spread + motion.unfoldTop.value;
    let bottomHeight = half - (half - BOTTOM_POD_SIZE) * spread + motion.unfoldBottom.value;
    const overlap = topHeight + bottomHeight - height;
    if (overlap > 0) {
      topHeight -= overlap / 2;
      bottomHeight -= overlap / 2;
    }

    const column = {
      width,
      height,
      gapTop: topHeight,
      gapBottom: height - bottomHeight,
      radius: NAV_RADIUS,
    };
    glass.style.clipPath = `path("${liquidOutline(column)}")`;
    /* Until there is a shape to clip it to, an unclipped border layer would be
       a solid slab of gradient — so it stays hidden until the first paint. */
    edge.style.display = 'block';
    /* The border is the ring between the silhouette and the same silhouette
       pulled 1px inwards — so it follows the strand instead of the box. */
    edge.style.clipPath = `path(evenodd,"${liquidOutline(column)} ${liquidOutline(column, 1)}")`;
    topLobe.style.height = `${topHeight}px`;
    bottomLobe.style.height = `${bottomHeight}px`;
  }, []);

  const runMotion = useCallback(() => {
    if (frameRef.current !== null) return;
    const step = () => {
      frameRef.current = null;
      const now = performance.now();
      const motion = motionRef.current;
      const running = [motion.spread, motion.unfoldTop, motion.unfoldBottom]
        .map((track) => advanceTrack(track, now))
        .some(Boolean);
      paint();
      if (running) frameRef.current = requestAnimationFrame(step);
    };
    frameRef.current = requestAnimationFrame(step);
  }, [paint]);

  useEffect(() => () => {
    if (frameRef.current !== null) cancelAnimationFrame(frameRef.current);
  }, []);

  useLayoutEffect(() => {
    const element = navRef.current;
    if (!element) return;

    const measure = () => {
      const rect = element.getBoundingClientRect();
      sizeRef.current = { width: rect.width, height: rect.height };
      paint();
    };
    measure();

    if (typeof ResizeObserver === 'undefined') {
      window.addEventListener('resize', measure);
      return () => window.removeEventListener('resize', measure);
    }

    const observer = new ResizeObserver(measure);
    observer.observe(element);
    return () => observer.disconnect();
  }, [paint]);

  /* Pull apart or flow back together. An interrupted transition picks the new
     curve up where the old one left off instead of restarting from the bar. */
  useEffect(() => {
    const track = motionRef.current.spread;
    const gapMax = Math.max(sizeRef.current.height - PODS_SIZE, 1);
    const snap = clamp(NECK_SNAP / gapMax, 0.02, 0.5);
    const toPods = targetShape === 'pods';
    const curve = toPods
      ? (t: number) => splitSpread(t, snap)
      : (t: number) => rejoinSpread(t, snap);
    const from = solveSpreadTime(curve, track.value, !toPods);
    const duration = (toPods ? SPLIT_MS : REJOIN_MS) * (1 - from);
    /* The solver lands a hair short of a full journey; round so the state flips
       when the motion actually ends rather than a frame before it. */
    settleMsRef.current = Math.round(duration);
    startTrack(track, (t) => curve(from + (1 - from) * t), duration);
    runMotion();
  }, [targetShape, runMotion]);

  /* Hover unfolding rides on top of wherever the lobe currently sits. */
  useEffect(() => {
    const motion = motionRef.current;
    const unfold = (track: MotionTrack, open: boolean, reach: number) => {
      const to = open ? reach : 0;
      if (!track.curve && track.value === to) return false;
      startTrack(track, unfoldCurve(track.value, to), UNFOLD_MS);
      return true;
    };
    const moved = [
      unfold(motion.unfoldTop, topOpen, PAGES_UNFOLD),
      unfold(motion.unfoldBottom, bottomOpen, ACCOUNT_UNFOLD),
    ];
    if (moved.some(Boolean)) runMotion();
  }, [topOpen, bottomOpen, runMotion]);

  /* Hold `breaking` for exactly as long as the liquid is in motion — which is
     shorter than a full journey when a transition was caught halfway. */
  useEffect(() => {
    if (settledShape === targetShape) return;
    const id = window.setTimeout(() => setSettledShape(targetShape), settleMsRef.current);
    return () => window.clearTimeout(id);
  }, [settledShape, targetShape]);

  /* Whatever was left unfolded is handed back as soon as the lobes rejoin. */
  useEffect(() => {
    if (shape !== 'bar') return;
    const id = window.setTimeout(() => setOpenPod(null), 0);
    return () => window.clearTimeout(id);
  }, [shape]);

  /* Hover and keyboard focus both unfold a lobe, but only once it has settled:
     grabbing at liquid that is still moving would fight the split. */
  const podHoverProps = (pod: PodId) => (podsMode ? {
    onMouseEnter: () => setOpenPod(pod),
    onMouseLeave: () => setOpenPod((current) => (current === pod ? null : current)),
    onFocus: () => setOpenPod(pod),
    onBlur: (event: ReactFocusEvent<HTMLDivElement>) => {
      if (!event.currentTarget.contains(event.relatedTarget)) {
        setOpenPod((current) => (current === pod ? null : current));
      }
    },
  } : {});

  const toggleExpanded = () => {
    hideTooltip();
    setNavExpanded((value) => !value);
  };

  /* The shape and its labels respond together; there is no extra wait after
     selecting or leaving a collection page. */
  const rowFadeDelayMs = 0;
  const lobeGroup = (open: boolean, primary?: PrimaryNavItem): PodGroupState | undefined => (
    splitting
      ? { primary, collapsed: podsMode ? !open : wantsPods, fadeDelayMs: rowFadeDelayMs }
      : undefined
  );

  const faceLabel = splitting
    ? t(topOpen ? 'collapseNavPages' : 'expandNavPages')
    : t(expanded ? 'collapseNavigation' : 'expandNavigation');

  return (
    <>
      <div
        className={`relative z-30 mr-region h-full shrink-0 transition-[width] duration-300 ease-[cubic-bezier(0.22,1,0.36,1)] motion-reduce:transition-none ${
          expanded ? 'w-[188px]' : 'w-[60px]'
        }`}
        data-expanded={expanded}
        data-featured-detail={featuredPieceOpen || undefined}
        data-nav-shape={shape}
      >
        <nav aria-label={t('primaryNavigation')} className="relative h-full w-full" ref={navRef}>
          {/* The glass and its border are one body clipped to the live
              silhouette; the lobes below carry only content. */}
          <div ref={glassRef} className="primary-nav-glass" aria-hidden="true" />
          <div ref={edgeRef} className="primary-nav-edge" aria-hidden="true" />
          <div
            ref={topLobeRef}
            data-anchor="top"
            data-testid="primary-nav-pod-top"
            className="primary-nav-pod"
            {...podHoverProps('top')}
          >
            <div className="flex h-full w-full flex-col">
              {/* Fixed: the logo keeps its place in the column whether that
                  column is a bar or a lobe. */}
              <div
                className="relative h-10 w-full shrink-0"
                style={{ marginTop: BAR_HEADER_OFFSET }}
              >
                <div
                  aria-hidden="true"
                  className={`absolute left-3 top-1/2 -translate-y-1/2 whitespace-nowrap transition-[opacity,transform] duration-200 ease-out motion-reduce:transition-none ${
                    expanded
                      ? 'translate-x-0 opacity-100 delay-100'
                      : 'pointer-events-none -translate-x-2 opacity-0'
                  }`}
                >
                  <span
                    className="block w-[100px] select-none"
                    style={{
                      aspectRatio: '1175 / 196',
                      background: 'linear-gradient(to bottom, #D0D0D0, #545454)',
                      WebkitMaskImage: 'url(/logo/logo-oddenova.svg)',
                      WebkitMaskPosition: 'center',
                      WebkitMaskRepeat: 'no-repeat',
                      WebkitMaskSize: 'contain',
                      maskImage: 'url(/logo/logo-oddenova.svg)',
                      maskPosition: 'center',
                      maskRepeat: 'no-repeat',
                      maskSize: 'contain',
                      transform: 'translateY(-1px)',
                    }}
                  />
                </div>

                <button
                  type="button"
                  aria-label={faceLabel}
                  aria-expanded={splitting ? topOpen : expanded}
                  aria-controls={splitting ? NAV_PAGES_GROUP_ID : undefined}
                  onClick={() => {
                    if (!splitting) {
                      toggleExpanded();
                      return;
                    }
                    hideTooltip();
                    setOpenPod((current) => (current === 'top' ? null : 'top'));
                  }}
                  {...(splitting ? {} : getTooltipTriggerProps(faceLabel))}
                  className={`group absolute left-[10px] top-0 flex h-10 w-[40px] items-center justify-center rounded-[6px] text-text-secondary transition-[transform,background-color,color] duration-300 ease-[cubic-bezier(0.22,1,0.36,1)] motion-reduce:transition-none ${
                    showingSectionMark ? '' : 'hover:bg-white/10 hover:text-text-primary'
                  }`}
                  style={{ transform: expanded ? 'translateX(128px)' : 'translateX(0)' }}
                >
                  {expanded ? (
                    <PanelLeft size={21} strokeWidth={1.6} aria-hidden="true" />
                  ) : (
                    <>
                      <span
                        aria-hidden="true"
                        data-testid="primary-nav-featured-mark"
                        className={`absolute inset-0 flex items-center justify-center [transform-style:preserve-3d] transition-[transform,opacity] duration-[420ms] ease-[cubic-bezier(0.22,1,0.36,1)] motion-reduce:transition-none ${
                          showingSectionMark
                            ? (topOpen ? '[transform:rotateY(0deg)]' : '[transform:rotateY(180deg)]')
                            : 'opacity-100 group-hover:opacity-0'
                        }`}
                      >
                        <span
                          className="absolute block w-[18px] select-none [backface-visibility:hidden]"
                          style={{
                            aspectRatio: '119 / 126',
                            background: 'linear-gradient(to bottom, #D0D0D0, #545454)',
                            WebkitMaskImage: 'url(/logo/logo-o.svg)',
                            WebkitMaskPosition: 'center',
                            WebkitMaskRepeat: 'no-repeat',
                            WebkitMaskSize: 'contain',
                            maskImage: 'url(/logo/logo-o.svg)',
                            maskPosition: 'center',
                            maskRepeat: 'no-repeat',
                            maskSize: 'contain',
                          }}
                        />
                        {showingSectionMark && (
                          <SectionMarkIcon
                            size={21}
                            strokeWidth={1.6}
                            aria-hidden="true"
                            className="absolute [backface-visibility:hidden] [transform:rotateY(180deg)]"
                          />
                        )}
                      </span>
                      {!splitting && (
                        <PanelLeft
                          size={21}
                          strokeWidth={1.6}
                          aria-hidden="true"
                          className="absolute inset-0 m-auto opacity-0 transition-opacity duration-150 group-hover:opacity-100 motion-reduce:transition-none"
                        />
                      )}
                    </>
                  )}
                </button>
              </div>

              {/* Fixed: the logo sits the same distance above Studio whether the
                  column is a bar or a lobe. */}
              <div
                id={NAV_PAGES_GROUP_ID}
                className="shrink-0"
                style={{ marginTop: BAR_GROUP_GAP }}
              >
                <NavGroup
                  items={TOP_ITEMS}
                  selectedItem={selectedItem}
                  onSelect={onSelect}
                  testId="primary-nav-top"
                  expanded={expanded}
                  pod={lobeGroup(topOpen)}
                  getTooltipTriggerProps={getTooltipTriggerProps}
                  hideTooltip={hideTooltip}
                />
              </div>
            </div>
          </div>

          <div
            ref={bottomLobeRef}
            data-anchor="bottom"
            data-testid="primary-nav-pod-bottom"
            className="primary-nav-pod"
            {...podHoverProps('bottom')}
          >
            {/* Fixed, for the same reason as the logo above. */}
            <div
              className="flex h-full w-full flex-col justify-end"
              style={{ paddingBottom: BAR_EDGE_PADDING }}
            >
              <NavGroup
                items={BOTTOM_ITEMS}
                selectedItem={selectedItem}
                onSelect={onSelect}
                testId="primary-nav-bottom"
                expanded={expanded}
                pod={lobeGroup(bottomOpen, 'account')}
                getTooltipTriggerProps={getTooltipTriggerProps}
                hideTooltip={hideTooltip}
                renderMore={() => (
                  <MoreMenu
                    key={`${expanded ? 'expanded' : 'collapsed'}-${splitting ? 'split' : 'bar'}`}
                    expanded={expanded}
                    selectedItem={selectedItem}
                    onSelect={onSelect}
                    getTooltipTriggerProps={getTooltipTriggerProps}
                    hideTooltip={hideTooltip}
                    onOpenChange={setMoreMenuOpen}
                  />
                )}
              />
            </div>
          </div>
        </nav>
      </div>
      {tooltip && <PrimaryNavTooltip tooltip={tooltip} />}
    </>
  );
}
