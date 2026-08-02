import React from 'react';
import { Home, Settings } from 'lucide-react';

export type HomeTab = 'home' | 'settings' | 'about' | 'privacy' | 'terms';

const items: Array<{ id: 'home' | 'settings'; label: string; icon: typeof Home }> = [
  { id: 'home', label: 'Home', icon: Home },
  { id: 'settings', label: 'Settings', icon: Settings },
];

interface BottomNavProps {
  tab: HomeTab;
  onChange: (tab: HomeTab) => void;
}

/** Babywise-style bottom nav for home shell (hidden in restaurant session). */
export const BottomNav: React.FC<BottomNavProps> = ({ tab, onChange }) => {
  return (
    <nav className="bottom-nav" aria-label="Main">
      {items.map(({ id, label, icon: Icon }) => {
        const active =
          tab === id ||
          (id === 'settings' &&
            (tab === 'about' || tab === 'privacy' || tab === 'terms'));
        return (
          <button
            key={id}
            type="button"
            className={active ? 'active' : undefined}
            onClick={() => onChange(id)}
            aria-current={active ? 'page' : undefined}
          >
            <Icon size={22} strokeWidth={active ? 2.4 : 2} />
            {label}
          </button>
        );
      })}
    </nav>
  );
};

export default BottomNav;
