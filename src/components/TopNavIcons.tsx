import { CircleHelp, Settings } from 'lucide-react';
import type { TFunction } from '../core/i18n';
import type { HomeTab } from './BottomNav';
import { BuyMeAPint } from './BuyMeAPint';

/**
 * Compact icon nav (top-right) — About / Settings + optional pint chip (BabyWise).
 */
export function TopNavIcons({
  tab,
  onChange,
  t,
}: {
  tab: HomeTab;
  onChange: (t: HomeTab) => void;
  t: TFunction;
}) {
  const items: Array<{
    id: HomeTab;
    icon: typeof Settings;
    labelKey: string;
    activeWhen?: HomeTab[];
  }> = [
    {
      id: 'about',
      icon: CircleHelp,
      labelKey: 'tabs.about',
      activeWhen: ['about', 'privacy', 'terms'],
    },
    { id: 'settings', icon: Settings, labelKey: 'tabs.settings' },
  ];

  return (
    <div className="top-nav-right">
      <BuyMeAPint t={t} compact />
      <nav className="top-nav-icons" aria-label={t('tabs.navMore')}>
        {items.map(({ id, icon: Icon, labelKey, activeWhen }) => {
          const active = activeWhen ? activeWhen.includes(tab) : tab === id;
          return (
            <button
              key={id}
              type="button"
              className={active ? 'top-nav-icon is-active' : 'top-nav-icon'}
              onClick={() => onChange(id)}
              aria-label={t(labelKey)}
              title={t(labelKey)}
              aria-current={active ? 'page' : undefined}
            >
              <Icon size={20} strokeWidth={active ? 2.4 : 2} />
            </button>
          );
        })}
      </nav>
    </div>
  );
}

export default TopNavIcons;
