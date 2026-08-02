import React, { useEffect, useState } from 'react';
import { ShieldCheck, X } from 'lucide-react';

const STORAGE_KEY = 'ff_calc_privacy_note_dismissed';
/** Auto-hide after this many ms (still closable sooner). */
const AUTO_CLOSE_MS = 8_000;

function readDismissed(): boolean {
  try {
    return localStorage.getItem(STORAGE_KEY) === '1';
  } catch {
    return false;
  }
}

function writeDismissed() {
  try {
    localStorage.setItem(STORAGE_KEY, '1');
  } catch {
    // ignore quota / private mode
  }
}

/**
 * Home privacy strip — closable + auto-dismiss (persisted in localStorage).
 * Re-open from About if you need the full privacy copy later.
 */
export const PrivacyLocalNote: React.FC = () => {
  const [visible, setVisible] = useState(() => !readDismissed());
  const [exiting, setExiting] = useState(false);

  const dismiss = () => {
    if (exiting) return;
    setExiting(true);
    writeDismissed();
    window.setTimeout(() => setVisible(false), 180);
  };

  useEffect(() => {
    if (!visible || exiting) return;
    const t = window.setTimeout(() => dismiss(), AUTO_CLOSE_MS);
    return () => window.clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- only arm once when shown
  }, [visible]);

  if (!visible) return null;

  return (
    <div
      className={`privacy-local-note glass-card${exiting ? ' is-exiting' : ''}`}
      role="status"
      aria-live="polite"
    >
      <div className="privacy-local-note-icon" aria-hidden>
        <ShieldCheck size={17} strokeWidth={2.2} />
      </div>
      <div className="privacy-local-note-body">
        <div className="privacy-local-note-title">Private &amp; local — safe to use</div>
        <p>
          We don&apos;t store your data on a server. Store picks, menus, and basket
          work stay in this browser only. Wipe them anytime with the{' '}
          <strong>Clear</strong> button in the toolbar after you open a restaurant.
        </p>
      </div>
      <button
        type="button"
        className="privacy-local-note-close"
        onClick={dismiss}
        aria-label="Dismiss privacy note"
        title="Dismiss"
      >
        <X size={16} strokeWidth={2.4} />
      </button>
    </div>
  );
};

export default PrivacyLocalNote;
