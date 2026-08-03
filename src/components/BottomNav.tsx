import React from 'react';
import { Home } from 'lucide-react';
import type { TFunction } from '../core/i18n';

export type HomeTab = 'home' | 'settings' | 'about' | 'privacy' | 'terms';

/** Primary tabs only — About / Settings live in top-right icons (BabyWise-aligned). */
const items: Array<{ id: 'home'; labelKey: string; icon: typeof Home }> = [
  { id: 'home', labelKey: 'tabs.home', icon: Home },
];

interface BottomNavProps {
  tab: HomeTab;
  onChange: (tab: HomeTab) => void;
  t: TFunction;
}

/**
 * Bottom nav for non-landing home tabs (Settings / About / legal).
 * Hidden on the restaurant-pick landing.
 */
export const BottomNav: React.FC<BottomNavProps> = ({ tab, onChange, t }) => {
  return (
    <nav className="bottom-nav" aria-label={t('tabs.navMain')}>
      {items.map(({ id, labelKey, icon: Icon }) => {
        const active = tab === id;
        return (
          <button
            key={id}
            type="button"
            className={active ? 'active' : undefined}
            onClick={() => onChange(id)}
            aria-current={active ? 'page' : undefined}
          >
            <Icon size={22} strokeWidth={active ? 2.4 : 2} />
            {t(labelKey)}
          </button>
        );
      })}
    </nav>
  );
};

export default BottomNav;
