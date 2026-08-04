import { useState } from 'react';
import {
  Ellipsis,
  Home,
  PanelLeft,
  Settings,
  Sparkles,
  User,
  type LucideIcon,
} from 'lucide-react';
import { t } from '../lib/i18n';

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
  { id: 'featured', labelKey: 'navFeatured', icon: Sparkles },
];

const BOTTOM_ITEMS: NavItem[] = [
  { id: 'more', labelKey: 'navMore', icon: Ellipsis },
  { id: 'settings', labelKey: 'navSettings', icon: Settings },
  { id: 'account', labelKey: 'navAccount', icon: User },
];

function NavGroup({
  items,
  selectedItem,
  onSelect,
  testId,
  expanded,
}: PrimaryNavProps & { items: NavItem[]; testId: string; expanded: boolean }) {
  return (
    <div
      className={`flex w-full flex-col gap-2 transition-[padding] duration-300 ease-[cubic-bezier(0.22,1,0.36,1)] motion-reduce:transition-none ${
        expanded ? 'px-2' : 'px-[7px]'
      }`}
      data-testid={testId}
    >
      {items.map(({ id, labelKey, icon: Icon }) => {
        const selected = selectedItem === id;
        const label = t(labelKey);

        return (
          <button
            key={id}
            type="button"
            aria-label={label}
            aria-current={selected ? 'page' : undefined}
            title={label}
            onClick={() => onSelect(id)}
            className={`flex h-8 w-full items-center overflow-hidden rounded-[6px] text-left transition-colors ${
              selected
                ? 'bg-white/10 text-text-primary'
                : 'text-text-muted hover:bg-white/5 hover:text-text-secondary'
            }`}
          >
            <span className="flex size-8 shrink-0 items-center justify-center">
              <Icon size={17} strokeWidth={1.6} aria-hidden="true" />
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

  return (
    <div
      className={`mr-region h-full shrink-0 transition-[width] duration-300 ease-[cubic-bezier(0.22,1,0.36,1)] motion-reduce:transition-none ${
        expanded ? 'w-[188px]' : 'w-[48px]'
      }`}
      data-expanded={expanded}
    >
      <nav
        aria-label={t('primaryNavigation')}
        className="surface-glow flex h-full flex-col justify-between overflow-hidden rounded-region border border-white/[0.12] py-3"
      >
        <div className="w-full">
          <div className="relative h-9 w-full">
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
                  transform: 'translateY(-4px)',
                }}
              />
            </div>

            <button
              type="button"
              aria-label={expanded ? t('collapseNavigation') : t('expandNavigation')}
              aria-expanded={expanded}
              title={expanded ? t('collapseNavigation') : t('expandNavigation')}
              onClick={() => setExpanded((value) => !value)}
              className="group absolute left-[7px] top-0 flex size-8 items-center justify-center rounded-[6px] text-text-secondary transition-[transform,background-color,color] duration-300 ease-[cubic-bezier(0.22,1,0.36,1)] hover:bg-white/10 hover:text-text-primary motion-reduce:transition-none"
              style={{ transform: expanded ? 'translateX(140px)' : 'translateX(0)' }}
            >
              {expanded ? (
                <PanelLeft size={17} strokeWidth={1.6} aria-hidden="true" />
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
                    size={17}
                    strokeWidth={1.6}
                    aria-hidden="true"
                    className="absolute inset-0 m-auto opacity-0 transition-opacity duration-150 group-hover:opacity-100 motion-reduce:transition-none"
                  />
                </>
              )}
            </button>
          </div>

          <div className="mt-4">
            <NavGroup
              items={TOP_ITEMS}
              selectedItem={selectedItem}
              onSelect={onSelect}
              testId="primary-nav-top"
              expanded={expanded}
            />
          </div>
        </div>
        <NavGroup
          items={BOTTOM_ITEMS}
          selectedItem={selectedItem}
          onSelect={onSelect}
          testId="primary-nav-bottom"
          expanded={expanded}
        />
      </nav>
    </div>
  );
}
