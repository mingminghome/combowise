import React from 'react';
import { Layers, Calculator } from 'lucide-react';

export type AppMode = 'mode1' | 'mode2';

interface ModeSwitcherBarProps {
  activeTab: AppMode;
  onChange: (tab: AppMode) => void;
  /**
   * compact — shorter padding / short labels for sticky app header
   * full — desktop in-flow control bar
   */
  variant?: 'full' | 'compact';
  className?: string;
}

export const ModeSwitcherBar: React.FC<ModeSwitcherBarProps> = ({
  activeTab,
  onChange,
  variant = 'full',
  className = '',
}) => {
  const compact = variant === 'compact';

  const btnBase: React.CSSProperties = {
    flex: 1,
    padding: compact ? '0.5rem 0.55rem' : '0.8rem 1.25rem',
    borderRadius: compact ? '10px' : '12px',
    fontSize: compact ? '0.78rem' : '0.95rem',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    gap: compact ? '0.35rem' : '0.6rem',
    cursor: 'pointer',
    transition: 'all 0.2s cubic-bezier(0.4, 0, 0.2, 1)',
    fontFamily: 'var(--font-heading)',
    minWidth: 0,
  };

  const activeStyle = (active: boolean): React.CSSProperties => ({
    ...btnBase,
    border: active ? '1.5px solid var(--primary-red)' : '1px solid transparent',
    background: active ? 'var(--primary-gradient)' : 'transparent',
    color: active ? 'var(--text-on-accent)' : 'var(--text-muted)',
    fontWeight: active ? 900 : 700,
    boxShadow: active ? '0 4px 18px var(--primary-red-glow)' : 'none',
  });

  return (
    <div
      className={`mode-switcher-bar mode-switcher-bar--${variant} ${className}`.trim()}
      role="tablist"
      aria-label="App mode"
    >
      <button
        type="button"
        role="tab"
        aria-selected={activeTab === 'mode2'}
        onClick={() => onChange('mode2')}
        style={activeStyle(activeTab === 'mode2')}
        title="Smart Basket Optimiser"
      >
        <Calculator size={compact ? 15 : 19} />
        <span className="mode-switcher-label-full">Smart Basket Optimiser</span>
        <span className="mode-switcher-label-short">Basket</span>
        {activeTab === 'mode2' && !compact && (
          <span className="mode-switcher-active-pill">Active</span>
        )}
      </button>

      <button
        type="button"
        role="tab"
        aria-selected={activeTab === 'mode1'}
        onClick={() => onChange('mode1')}
        style={activeStyle(activeTab === 'mode1')}
        title="Combo Value Auditor"
      >
        <Layers size={compact ? 15 : 19} />
        <span className="mode-switcher-label-full">Combo Value Auditor</span>
        <span className="mode-switcher-label-short">Audit</span>
        {activeTab === 'mode1' && !compact && (
          <span className="mode-switcher-active-pill">Active</span>
        )}
      </button>
    </div>
  );
};
