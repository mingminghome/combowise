import React, { useEffect, useState } from 'react';
import { Download, Share, X } from 'lucide-react';

const DISMISS_KEY = 'ff_calc_install_banner_dismissed';

type BeforeInstallPromptEvent = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed'; platform: string }>;
};

function isStandalone(): boolean {
  if (typeof window === 'undefined') return false;
  const nav = window.navigator as Navigator & { standalone?: boolean };
  return (
    window.matchMedia('(display-mode: standalone)').matches ||
    window.matchMedia('(display-mode: fullscreen)').matches ||
    nav.standalone === true
  );
}

function isIos(): boolean {
  if (typeof navigator === 'undefined') return false;
  return /iphone|ipad|ipod/i.test(navigator.userAgent);
}

function readDismissed(): boolean {
  try {
    return localStorage.getItem(DISMISS_KEY) === '1';
  } catch {
    return false;
  }
}

function writeDismissed() {
  try {
    localStorage.setItem(DISMISS_KEY, '1');
  } catch {
    /* ignore */
  }
}

/**
 * Soft “Install as app” prompt (Chrome/Edge Android + iOS Safari tip).
 * Uses beforeinstallprompt when available; otherwise shows Add to Home Screen help.
 */
export const InstallAppBanner: React.FC = () => {
  const [deferred, setDeferred] = useState<BeforeInstallPromptEvent | null>(null);
  const [visible, setVisible] = useState(false);
  const [iosHelp, setIosHelp] = useState(false);

  useEffect(() => {
    if (isStandalone() || readDismissed()) return;

    const onBip = (e: Event) => {
      e.preventDefault();
      setDeferred(e as BeforeInstallPromptEvent);
      setVisible(true);
    };
    window.addEventListener('beforeinstallprompt', onBip);

    // iOS / browsers without BIP: show after short delay if not installed
    const t = window.setTimeout(() => {
      if (isStandalone() || readDismissed()) return;
      if (isIos()) {
        setIosHelp(true);
        setVisible(true);
      }
    }, 2500);

    return () => {
      window.removeEventListener('beforeinstallprompt', onBip);
      window.clearTimeout(t);
    };
  }, []);

  // Hide once launched as installed app
  useEffect(() => {
    const mq = window.matchMedia('(display-mode: standalone)');
    const onChange = () => {
      if (isStandalone()) setVisible(false);
    };
    mq.addEventListener?.('change', onChange);
    return () => mq.removeEventListener?.('change', onChange);
  }, []);

  const dismiss = () => {
    writeDismissed();
    setVisible(false);
  };

  const install = async () => {
    if (!deferred) return;
    try {
      await deferred.prompt();
      await deferred.userChoice;
    } catch {
      /* user dismissed system sheet */
    }
    setDeferred(null);
    setVisible(false);
    writeDismissed();
  };

  if (!visible) return null;

  return (
    <div className="install-app-banner" role="region" aria-label="Install ComboWise">
      <div className="install-app-banner-icon" aria-hidden>
        <img src="/icon-192.png" alt="" width={40} height={40} />
      </div>
      <div className="install-app-banner-body">
        <div className="install-app-banner-title">Install ComboWise</div>
        <p className="install-app-banner-text">
          {iosHelp && !deferred
            ? 'Add to your Home Screen for a full-screen app experience.'
            : 'Install as an app for quicker access — works offline for cached menus.'}
        </p>
        {iosHelp && !deferred && (
          <p className="install-app-banner-ios">
            Tap <Share size={14} className="install-app-inline-icon" aria-hidden /> Share, then{' '}
            <strong>Add to Home Screen</strong>.
          </p>
        )}
      </div>
      <div className="install-app-banner-actions">
        {deferred && (
          <button type="button" className="install-app-btn" onClick={() => void install()}>
            <Download size={15} strokeWidth={2.4} />
            Install
          </button>
        )}
        <button
          type="button"
          className="install-app-dismiss"
          onClick={dismiss}
          aria-label="Dismiss install prompt"
        >
          <X size={16} strokeWidth={2.4} />
        </button>
      </div>
    </div>
  );
};

export default InstallAppBanner;
