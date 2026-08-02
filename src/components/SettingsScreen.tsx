import React, { useEffect, useState } from 'react';
import {
  ChevronRight,
  Download,
  ExternalLink,
  FileText,
  Info,
  Moon,
  Shield,
  Sun,
  Laptop,
} from 'lucide-react';
import { ThemeService, type ThemeMode } from '../core/services/themeService';
import type { HomeTab } from './BottomNav';

const GITHUB_URL = 'https://github.com/mingminghomework';
const BMC_URL = 'https://buymeacoffee.com/mingminghomework';

interface SettingsScreenProps {
  onNavigate: (tab: HomeTab) => void;
}

export const SettingsScreen: React.FC<SettingsScreenProps> = ({ onNavigate }) => {
  const [mode, setMode] = useState<ThemeMode>(() => ThemeService.getThemeMode());

  useEffect(() => {
    ThemeService.init();
    return ThemeService.subscribe(() => setMode(ThemeService.getThemeMode()));
  }, []);

  const setTheme = (next: ThemeMode) => {
    ThemeService.setThemeMode(next);
    setMode(next);
  };

  return (
    <div className="settings-screen">
      <header className="settings-header">
        <h1>Settings</h1>
        <p className="settings-sub">Theme, privacy, and app info</p>
      </header>

      <section className="glass-card settings-card settings-card--theme">
        <h2 className="settings-section-title">Theme</h2>
        <div className="settings-chip-row">
          {(
            [
              ['auto', 'System', Laptop],
              ['light', 'Light', Sun],
              ['dark', 'Dark', Moon],
            ] as const
          ).map(([id, label, Icon]) => (
            <button
              key={id}
              type="button"
              className={`settings-chip${mode === id ? ' is-active' : ''}`}
              onClick={() => setTheme(id)}
            >
              <Icon size={15} strokeWidth={2.2} />
              {label}
            </button>
          ))}
        </div>
      </section>

      <section className="glass-card settings-card settings-card--legal">
        <h2 className="settings-section-title">About &amp; legal</h2>
        <div className="settings-links">
          <button type="button" className="settings-link" onClick={() => onNavigate('about')}>
            <span className="settings-link-icon">
              <Info size={16} />
            </span>
            <span className="settings-link-text">
              <strong>About ComboWise</strong>
              <span>How it works and version</span>
            </span>
            <ChevronRight size={18} className="settings-link-chevron" />
          </button>
          <button type="button" className="settings-link" onClick={() => onNavigate('privacy')}>
            <span className="settings-link-icon">
              <Shield size={16} />
            </span>
            <span className="settings-link-text">
              <strong>Privacy</strong>
              <span>Local data and what we fetch</span>
            </span>
            <ChevronRight size={18} className="settings-link-chevron" />
          </button>
          <button type="button" className="settings-link" onClick={() => onNavigate('terms')}>
            <span className="settings-link-icon">
              <FileText size={16} />
            </span>
            <span className="settings-link-text">
              <strong>Terms</strong>
              <span>Indicative prices &amp; disclaimers</span>
            </span>
            <ChevronRight size={18} className="settings-link-chevron" />
          </button>
        </div>
      </section>

      <section className="glass-card settings-card">
        <h2 className="settings-section-title">Install &amp; links</h2>
        <p className="settings-muted">
          <Download size={14} style={{ verticalAlign: -2, marginRight: 4 }} />
          Android Chrome: browser menu → <strong>Install app</strong>. iPhone Safari: Share →{' '}
          <strong>Add to Home Screen</strong>.
        </p>
        <div className="settings-links" style={{ marginTop: '0.65rem' }}>
          <a
            className="settings-link"
            href={GITHUB_URL}
            target="_blank"
            rel="noopener noreferrer"
          >
            <span className="settings-link-icon">
              <ExternalLink size={16} />
            </span>
            <span className="settings-link-text">
              <strong>GitHub</strong>
              <span>mingminghomework</span>
            </span>
            <ChevronRight size={18} className="settings-link-chevron" />
          </a>
          <a
            className="settings-link"
            href={BMC_URL}
            target="_blank"
            rel="noopener noreferrer"
          >
            <span className="settings-link-icon">
              <ExternalLink size={16} />
            </span>
            <span className="settings-link-text">
              <strong>Buy me a pint</strong>
              <span>Support development</span>
            </span>
            <ChevronRight size={18} className="settings-link-chevron" />
          </a>
        </div>
      </section>

      <section className="glass-card settings-card">
        <h2 className="settings-section-title">Data</h2>
        <p className="settings-muted">
          Store picks and menus stay in this browser. After you open a restaurant, use{' '}
          <strong>Clear</strong> in the toolbar to wipe that chain&apos;s local cache.
        </p>
      </section>
    </div>
  );
};

export default SettingsScreen;
