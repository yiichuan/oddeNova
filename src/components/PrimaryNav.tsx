import {
  useCallback,
  useEffect,
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
  Home,
  PanelLeft,
  Settings,
  User,
  type LucideIcon,
} from 'lucide-react';
import { t } from '../lib/i18n';
import { GITHUB_URL, LEARN_URL } from '../lib/external-links';
import { BookOpenIcon } from './icons';

export type PrimaryNavItem = 'home' | 'featured' | 'more' | 'settings' | 'account';

interface PrimaryNavProps {
  selectedItem: PrimaryNavItem;
  onSelect: (item: PrimaryNavItem) => void;
}

interface NavItem {
  id: PrimaryNavItem;
  labelKey: string;
  icon: LucideIcon;
}

const TOP_ITEMS: NavItem[] = [
  { id: 'home', labelKey: 'navHome', icon: Home },
  { id: 'featured', labelKey: 'navFeatured', icon: Disc3 },
];

const BOTTOM_ITEMS: NavItem[] = [
  { id: 'more', labelKey: 'navMore', icon: Ellipsis },
  { id: 'settings', labelKey: 'navSettings', icon: Settings },
  { id: 'account', labelKey: 'navAccount', icon: User },
];

const NAV_TOOLTIP_ID = 'primary-nav-tooltip';

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
  getTooltipTriggerProps,
  hideTooltip,
}: {
  expanded: boolean;
  getTooltipTriggerProps: GetTooltipTriggerProps;
  hideTooltip: () => void;
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

  const linkClass = `flex h-10 w-full items-center overflow-hidden rounded-[6px] text-text-muted transition-colors hover:bg-white/5 hover:text-text-secondary focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-white/40 ${
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
          open
            ? 'bg-white/10 text-text-primary'
            : 'text-text-muted hover:bg-white/5 hover:text-text-secondary'
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
  renderMore,
  getTooltipTriggerProps,
  hideTooltip,
}: PrimaryNavProps & {
  items: NavItem[];
  testId: string;
  expanded: boolean;
  renderMore?: () => ReactNode;
  getTooltipTriggerProps: GetTooltipTriggerProps;
  hideTooltip: () => void;
}) {
  return (
    <div
      className={`flex w-full flex-col gap-2 transition-[padding] duration-300 ease-[cubic-bezier(0.22,1,0.36,1)] motion-reduce:transition-none ${
        expanded ? 'px-2' : 'px-[10px]'
      }`}
      data-testid={testId}
    >
      {items.map(({ id, labelKey, icon: Icon }) => {
        if (id === 'more' && renderMore) {
          return <div key={id} className="w-full">{renderMore()}</div>;
        }

        const selected = selectedItem === id;
        const label = t(labelKey);

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
            {...getTooltipTriggerProps(label)}
            className={`flex h-10 w-full items-center overflow-hidden rounded-[6px] text-left transition-colors ${
              selected
                ? 'bg-white/10 text-text-primary'
                : 'text-text-muted hover:bg-white/5 hover:text-text-secondary'
            }`}
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

export default function PrimaryNav({ selectedItem, onSelect }: PrimaryNavProps) {
  const [expanded, setExpanded] = useState(false);
  const [tooltip, setTooltip] = useState<TooltipState | null>(null);
  const tooltipTimerRef = useRef<number | null>(null);

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
        left: rect.right + 8,
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

  const toggleExpanded = () => {
    hideTooltip();
    setExpanded((value) => !value);
  };

  return (
    <>
      <div
        className={`mr-region h-full shrink-0 transition-[width] duration-300 ease-[cubic-bezier(0.22,1,0.36,1)] motion-reduce:transition-none ${
          expanded ? 'w-[188px]' : 'w-[60px]'
        }`}
        data-expanded={expanded}
      >
        <nav
          aria-label={t('primaryNavigation')}
          className="primary-nav-surface primary-nav-outline flex h-full flex-col justify-between overflow-hidden rounded-region py-3"
        >
          <div className="w-full">
            {/* -5px lifts the logo/toggle centre line to 27px from the column top,
                matching the Sidebar title row (1px border + 10px pt + half of h-8). */}
            <div className="relative -mt-[5px] h-10 w-full">
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
                aria-label={expanded ? t('collapseNavigation') : t('expandNavigation')}
                aria-expanded={expanded}
                onClick={toggleExpanded}
                {...getTooltipTriggerProps(expanded ? t('collapseNavigation') : t('expandNavigation'))}
                className="group absolute left-[10px] top-0 flex h-10 w-[40px] items-center justify-center rounded-[6px] text-text-secondary transition-[transform,background-color,color] duration-300 ease-[cubic-bezier(0.22,1,0.36,1)] hover:bg-white/10 hover:text-text-primary motion-reduce:transition-none"
                style={{ transform: expanded ? 'translateX(128px)' : 'translateX(0)' }}
              >
                {expanded ? (
                  <PanelLeft size={21} strokeWidth={1.6} aria-hidden="true" />
                ) : (
                  <>
                    <span
                      aria-hidden="true"
                      className="absolute inset-0 flex items-center justify-center opacity-100 transition-opacity duration-150 group-hover:opacity-0 motion-reduce:transition-none"
                    >
                      <span
                        className="block w-[18px] select-none"
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
                    </span>
                    <PanelLeft
                      size={21}
                      strokeWidth={1.6}
                      aria-hidden="true"
                      className="absolute inset-0 m-auto opacity-0 transition-opacity duration-150 group-hover:opacity-100 motion-reduce:transition-none"
                    />
                  </>
                )}
              </button>
            </div>

            {/* 25px = the original 16px gap plus the 9px the shorter, lifted header row gives back. */}
            <div className="mt-[25px]">
              <NavGroup
                items={TOP_ITEMS}
                selectedItem={selectedItem}
                onSelect={onSelect}
                testId="primary-nav-top"
                expanded={expanded}
                getTooltipTriggerProps={getTooltipTriggerProps}
                hideTooltip={hideTooltip}
              />
            </div>
          </div>
          <NavGroup
            items={BOTTOM_ITEMS}
            selectedItem={selectedItem}
            onSelect={onSelect}
            testId="primary-nav-bottom"
            expanded={expanded}
            getTooltipTriggerProps={getTooltipTriggerProps}
            hideTooltip={hideTooltip}
            renderMore={() => (
              <MoreMenu
                key={expanded ? 'expanded' : 'collapsed'}
                expanded={expanded}
                getTooltipTriggerProps={getTooltipTriggerProps}
                hideTooltip={hideTooltip}
              />
            )}
          />
        </nav>
      </div>
      {tooltip && <PrimaryNavTooltip tooltip={tooltip} />}
    </>
  );
}
