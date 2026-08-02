import React, { useEffect } from 'react';
import { ChevronUp } from 'lucide-react';

export interface MobileResultsDockProps {
  /** Hide on desktop; only meaningful content when true */
  visible: boolean;
  /** Primary line, e.g. "Worth it" or "Save £2.40" */
  title: string;
  /** Secondary metrics, e.g. "Combo £8.99 · Ala-carte £9.50" */
  subtitle?: string;
  /** Visual tone */
  tone?: 'green' | 'amber' | 'danger' | 'primary';
  /** Scroll / focus results panel */
  onViewDetails: () => void;
  /** Optional trailing label on the CTA */
  actionLabel?: string;
}

const toneVars: Record<NonNullable<MobileResultsDockProps['tone']>, { fg: string; bg: string; border: string }> = {
  green: {
    fg: 'var(--accent-green)',
    bg: 'var(--accent-green-bg)',
    border: 'var(--accent-green-border)',
  },
  amber: {
    fg: 'var(--accent-amber)',
    bg: 'var(--accent-amber-bg)',
    border: 'var(--accent-amber-border)',
  },
  danger: {
    fg: 'var(--accent-danger)',
    bg: 'var(--accent-danger-bg)',
    border: 'var(--accent-danger-border)',
  },
  primary: {
    fg: 'var(--primary)',
    bg: 'var(--primary-soft)',
    border: 'var(--primary-border)',
  },
};

/**
 * App-style sticky bottom bar so results stay reachable without scrolling
 * past a long selection list. Hidden on desktop (≥921px) via CSS class.
 */
export const MobileResultsDock: React.FC<MobileResultsDockProps> = ({
  visible,
  title,
  subtitle,
  tone = 'primary',
  onViewDetails,
  actionLabel = 'View results',
}) => {
  // Reserve bottom padding on the shell so content isn’t covered by the dock
  useEffect(() => {
    const shell = document.querySelector('.app-shell');
    if (!shell) return;
    if (visible) shell.classList.add('has-mobile-results-dock');
    else shell.classList.remove('has-mobile-results-dock');
    return () => shell.classList.remove('has-mobile-results-dock');
  }, [visible]);

  if (!visible) return null;

  const t = toneVars[tone];

  return (
    <div
      className="mobile-results-dock"
      role="region"
      aria-label="Results summary"
    >
      <div
        className="mobile-results-dock-inner"
        style={{
          borderColor: t.border,
          background: 'var(--bg-card)',
        }}
      >
        <div className="mobile-results-dock-text" style={{ minWidth: 0, flex: 1 }}>
          <div
            style={{
              fontWeight: 800,
              fontSize: '0.92rem',
              color: t.fg,
              fontFamily: 'var(--font-heading)',
              fontVariantNumeric: 'tabular-nums',
              whiteSpace: 'nowrap',
              overflow: 'hidden',
              textOverflow: 'ellipsis',
            }}
          >
            {title}
          </div>
          {subtitle ? (
            <div
              style={{
                fontSize: '0.72rem',
                color: 'var(--text-muted)',
                marginTop: 2,
                fontVariantNumeric: 'tabular-nums',
                whiteSpace: 'nowrap',
                overflow: 'hidden',
                textOverflow: 'ellipsis',
              }}
            >
              {subtitle}
            </div>
          ) : null}
        </div>

        <button
          type="button"
          className="mobile-results-dock-cta"
          onClick={onViewDetails}
          title={title}
          aria-label={`${actionLabel}: ${title}`}
          style={{
            background: t.bg,
            border: `1.5px solid ${t.border}`,
            color: t.fg,
          }}
        >
          <ChevronUp size={16} strokeWidth={2.5} />
          {actionLabel}
        </button>
      </div>
    </div>
  );
};

/** Scroll to results panel; safe for SSR / missing nodes */
export function scrollToModeResults(elementId = 'mode-results-panel') {
  const el = document.getElementById(elementId);
  if (!el) return;
  el.scrollIntoView({ behavior: 'smooth', block: 'start' });
}

/** True when stacked single-column (app) layout is active */
export function isAppLayout(): boolean {
  if (typeof window === 'undefined') return false;
  return window.matchMedia('(max-width: 1023px)').matches;
}
