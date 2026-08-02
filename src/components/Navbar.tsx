import React from 'react';
import { Info, Zap } from 'lucide-react';
import { ThemeToggle } from './ThemeToggle';

const GITHUB_URL = 'https://github.com/mingminghomework';

/** Simple GitHub mark (lucide-react 1.x has no Github export) */
function GitHubIcon({ size = 18 }: { size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="currentColor"
      aria-hidden="true"
    >
      <path d="M12 2C6.477 2 2 6.477 2 12c0 4.42 2.865 8.17 6.839 9.49.5.092.682-.217.682-.482 0-.237-.008-.866-.013-1.7-2.782.603-3.369-1.34-3.369-1.34-.454-1.156-1.11-1.463-1.11-1.463-.908-.62.069-.608.069-.608 1.003.07 1.531 1.03 1.531 1.03.892 1.529 2.341 1.087 2.91.832.092-.647.35-1.088.636-1.338-2.22-.253-4.555-1.11-4.555-4.943 0-1.091.39-1.984 1.029-2.683-.103-.253-.446-1.27.098-2.647 0 0 .84-.269 2.75 1.025A9.578 9.578 0 0 1 12 6.836c.85.004 1.705.114 2.504.336 1.909-1.294 2.747-1.025 2.747-1.025.546 1.377.203 2.394.1 2.647.64.699 1.028 1.592 1.028 2.683 0 3.842-2.339 4.687-4.566 4.935.359.309.678.919.678 1.852 0 1.336-.012 2.415-.012 2.743 0 .267.18.578.688.48C19.138 20.167 22 16.418 22 12c0-5.523-4.477-10-10-10z" />
    </svg>
  );
}

interface NavbarProps {
  onAbout?: () => void;
}

/**
 * Brand header for the home / provider-pick screen only.
 * Hidden once a chain is selected (store toolbar replaces it).
 */
export const Navbar: React.FC<NavbarProps> = ({ onAbout }) => {
  return (
    <div className="navbar-slot">
      <div className="navbar-slot-inner">
        <nav className="navbar">
          <div className="brand-logo">
            <div
              style={{
                width: 38,
                height: 38,
                borderRadius: 12,
                background: 'var(--primary-gradient)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                boxShadow: '0 2px 10px var(--primary-glow)',
                flexShrink: 0,
              }}
            >
              <Zap size={20} color="#ffffff" fill="#ffffff" />
            </div>
            <div>
              <div
                className="brand-title"
                style={{ fontSize: '1.25rem', fontWeight: 900, letterSpacing: '-0.02em' }}
              >
                ComboWise
              </div>
              <div className="brand-subtitle">Smart basket optimiser for UK fast food</div>
            </div>
          </div>

          <div className="navbar-actions">
            {onAbout && (
              <button
                type="button"
                className="navbar-icon-btn"
                onClick={onAbout}
                aria-label="About ComboWise"
                title="About"
              >
                <Info size={18} strokeWidth={2} />
              </button>
            )}
            <a
              href={GITHUB_URL}
              target="_blank"
              rel="noopener noreferrer"
              className="navbar-icon-btn"
              aria-label="mingminghomework on GitHub"
              title="GitHub"
            >
              <GitHubIcon size={18} />
            </a>
            <ThemeToggle />
          </div>
        </nav>
      </div>
    </div>
  );
};
