import { Cpu, Palette, type LucideIcon } from 'lucide-react';
import { t } from '../../lib/i18n';

export type SettingsSection = 'model' | 'appearance';

interface SettingsSidebarProps {
  /** Short line under each entry showing what it is currently set to. */
  hints: Record<SettingsSection, string>;
  onSelect: (section: SettingsSection) => void;
  selectedSection: SettingsSection;
}

const SECTIONS: { id: SettingsSection; labelKey: string; icon: LucideIcon }[] = [
  { id: 'model', labelKey: 'settingsModel', icon: Cpu },
  { id: 'appearance', labelKey: 'settingsAppearance', icon: Palette },
];

export default function SettingsSidebar({
  hints,
  onSelect,
  selectedSection,
}: SettingsSidebarProps) {
  return (
    <aside className="flex h-full w-full flex-col overflow-hidden rounded-region border border-border bg-conversation-surface">
      <header className="px-4 pb-4 pt-[14px]">
        <h2 className="text-lg font-bold text-text-primary">{t('navSettings')}</h2>
      </header>

      <nav aria-label={t('settingsSections')} className="min-h-0 flex-1 px-2">
        <ul className="space-y-1">
          {SECTIONS.map(({ id, labelKey, icon: Icon }) => {
            const selected = selectedSection === id;

            return (
              <li key={id}>
                <button
                  type="button"
                  onClick={() => onSelect(id)}
                  aria-current={selected ? 'page' : undefined}
                  className={`group flex min-h-12 w-full items-center gap-3 rounded-[5px] px-3 py-2.5 text-left outline-none transition-[background-color,color,transform] duration-150 ease-[cubic-bezier(0.25,1,0.5,1)] focus-visible:ring-2 focus-visible:ring-text-secondary focus-visible:ring-offset-2 focus-visible:ring-offset-[#0D0D0D] active:scale-[0.99] motion-reduce:transition-none ${
                    selected
                      ? 'bg-white/[0.09] text-text-primary'
                      : 'text-text-secondary hover:bg-white/[0.045] hover:text-text-primary'
                  }`}
                >
                  <span
                    className={`grid size-7 shrink-0 place-items-center transition-colors ${
                      selected ? 'text-text-primary' : 'text-text-muted group-hover:text-text-secondary'
                    }`}
                    aria-hidden="true"
                  >
                    <Icon size={18} strokeWidth={1.6} />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-medium">{t(labelKey)}</span>
                    <span className="mt-0.5 block truncate text-[10px] text-text-muted">
                      {hints[id]}
                    </span>
                  </span>
                </button>
              </li>
            );
          })}
        </ul>
      </nav>
    </aside>
  );
}
