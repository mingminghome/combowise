import React, { useState, useEffect } from 'react';
import { Sun, Moon, Laptop } from 'lucide-react';
import { ThemeService, type ThemeMode } from '../core/services/themeService';

export const ThemeToggle: React.FC = () => {
  const [mode, setMode] = useState<ThemeMode>(() => ThemeService.getThemeMode());

  useEffect(() => {
    ThemeService.init();
    const unsubscribe = ThemeService.subscribe(() => {
      setMode(ThemeService.getThemeMode());
    });
    return () => unsubscribe();
  }, []);

  const handleNextTheme = () => {
    const modes: ThemeMode[] = ['auto', 'dark', 'light'];
    const nextIndex = (modes.indexOf(mode) + 1) % modes.length;
    const nextMode = modes[nextIndex];
    ThemeService.setThemeMode(nextMode);
    setMode(nextMode);
  };

  const renderIcon = () => {
    // Muted — amber is reserved for suggestions, not chrome
    if (mode === 'dark') return <Moon size={13} color="var(--text-muted)" />;
    if (mode === 'light') return <Sun size={13} color="var(--text-muted)" />;
    return <Laptop size={13} color="var(--text-muted)" />;
  };

  const renderLabel = () => {
    if (mode === 'dark') return 'Dark';
    if (mode === 'light') return 'Light';
    return 'Auto (System)';
  };

  return (
    <button
      type="button"
      onClick={handleNextTheme}
      title={`Current theme: ${renderLabel()}. Click to switch.`}
      style={{
        padding: '0.4rem 0.75rem',
        display: 'inline-flex',
        alignItems: 'center',
        gap: '0.35rem',
        background: 'var(--bg-subtle)',
        border: '1px solid var(--border-color)',
        color: 'var(--text-muted)',
        fontSize: '0.78rem',
        fontWeight: 700,
        cursor: 'pointer',
        borderRadius: '8px',
        transition: 'all 0.15s ease',
        lineHeight: 1.2,
        fontFamily: 'inherit',
        boxSizing: 'border-box',
        whiteSpace: 'nowrap',
      }}
    >
      {renderIcon()}
      <span>{renderLabel()}</span>
    </button>
  );
};
