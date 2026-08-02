import React, { useEffect, useState } from 'react';
import { Loader2, MapPin, WifiOff, CheckCircle2, AlertTriangle, RefreshCw, X } from 'lucide-react';
import type { MenuLoadResult, MenuUiPhase } from '../core/types/provider';

interface MenuLoadBannerProps {
  phase: MenuUiPhase | 'idle';
  result?: MenuLoadResult | null;
  providerName: string;
  requiresStore: boolean;
  /** Force re-fetch (shown on degraded / error) */
  onRetry?: () => void | Promise<void>;
}

/** Success / cache-ok strips auto-hide so they don't steal sticky header space over Mode 1/2. */
const OK_AUTO_HIDE_MS = 3200;

function isActionablePhase(phase: MenuUiPhase | 'idle', status?: string): boolean {
  return (
    phase === 'loading' ||
    phase === 'need_store' ||
    phase === 'error' ||
    phase === 'degraded' ||
    status === 'error' ||
    status === 'degraded'
  );
}

/**
 * Status strip: store gate, loading, cache/network ok (transient), degraded, error + Retry.
 * OK messages dismiss themselves so selection + results stay tappable on phone.
 */
export const MenuLoadBanner: React.FC<MenuLoadBannerProps> = ({
  phase,
  result,
  providerName,
  requiresStore: _requiresStore,
  onRetry,
}) => {
  const [retrying, setRetrying] = useState(false);
  const [dismissed, setDismissed] = useState(false);

  const status = result?.status;
  const actionable = isActionablePhase(phase, status);

  // Reset dismiss when a new load / phase arrives
  useEffect(() => {
    setDismissed(false);
  }, [phase, result?.source, result?.status, result?.updatedAt?.getTime?.(), result?.message]);

  // Auto-hide non-actionable success strips
  useEffect(() => {
    if (phase === 'idle' || actionable || dismissed) return;
    const t = window.setTimeout(() => setDismissed(true), OK_AUTO_HIDE_MS);
    return () => window.clearTimeout(t);
  }, [phase, actionable, dismissed, result?.source, result?.updatedAt?.getTime?.()]);

  if (phase === 'idle') return null;
  if (dismissed && !actionable) return null;

  const showRetry =
    !!onRetry &&
    (phase === 'degraded' ||
      phase === 'error' ||
      status === 'degraded' ||
      status === 'error');

  let icon = <CheckCircle2 size={14} color="var(--accent-green)" />;
  let text = 'Menu ready';
  let tone: 'info' | 'warn' | 'ok' | 'error' = 'ok';

  if (phase === 'loading') {
    icon = <Loader2 size={14} style={{ animation: 'spin 1s linear infinite' }} />;
    text = `Loading ${providerName} menu…`;
    tone = 'info';
  } else if (phase === 'need_store') {
    icon = <MapPin size={14} color="var(--primary-red)" />;
    text = 'Select a store to load menu & prices (like the official app)';
    tone = 'warn';
  } else if (phase === 'error' || status === 'error') {
    icon = <AlertTriangle size={14} color="var(--accent-danger, #e11d48)" />;
    text = result?.message || 'Could not load menu';
    tone = 'error';
  } else if (phase === 'degraded' || status === 'degraded') {
    icon = <WifiOff size={14} color="var(--accent-amber, #d97706)" />;
    text = result?.message || 'Showing offline / cached prices — not the latest snapshot';
    tone = 'warn';
  } else if (result?.source === 'cache') {
    text = 'Using cached menu · prices are indicative';
    tone = 'ok';
  } else if (result?.source === 'network') {
    text = 'Menu updated · prices are indicative';
    tone = 'ok';
  } else if (result?.source === 'bundle') {
    icon = <WifiOff size={14} color="var(--accent-amber, #d97706)" />;
    text = result.message || 'Using offline bundled menu · prices are indicative';
    tone = 'warn';
  }

  const bg =
    tone === 'error'
      ? 'var(--accent-danger-bg, rgba(225, 29, 72, 0.1))'
      : tone === 'warn'
        ? 'var(--accent-amber-soft, rgba(217, 119, 6, 0.12))'
        : tone === 'info'
          ? 'var(--bg-subtle)'
          : 'var(--accent-green-bg, rgba(34, 197, 94, 0.1))';
  const border =
    tone === 'error'
      ? 'var(--accent-danger-border, rgba(225, 29, 72, 0.35))'
      : tone === 'warn'
        ? 'var(--accent-amber-border, rgba(217, 119, 6, 0.35))'
        : 'var(--border-color)';

  const handleRetry = async () => {
    if (!onRetry || retrying) return;
    setRetrying(true);
    try {
      await onRetry();
    } finally {
      setRetrying(false);
    }
  };

  const showSnapshot =
    !!result?.updatedAt &&
    (phase === 'ready' || phase === 'degraded') &&
    status !== 'error';

  return (
    <div
      role="status"
      className="menu-load-banner"
      data-tone={tone}
      style={{
        margin: '0.5rem 0 0',
        padding: '0.45rem 0.75rem',
        borderRadius: 10,
        border: `1px solid ${border}`,
        background: bg,
        display: 'flex',
        alignItems: 'center',
        gap: '0.45rem',
        fontSize: '0.75rem',
        fontWeight: 600,
        color: 'var(--text-muted)',
        lineHeight: 1.35,
      }}
    >
      {icon}
      <span style={{ flex: 1, minWidth: 0 }}>
        {text}
        {showSnapshot && (
          <span style={{ opacity: 0.85 }}>
            {' '}
            · {result!.updatedAt!.toLocaleDateString()}
          </span>
        )}
      </span>
      {showRetry && (
        <button
          type="button"
          onClick={() => void handleRetry()}
          disabled={retrying}
          style={{
            flexShrink: 0,
            display: 'inline-flex',
            alignItems: 'center',
            gap: '0.3rem',
            padding: '0.25rem 0.55rem',
            fontSize: '0.72rem',
            fontWeight: 800,
            borderRadius: 8,
            border: '1px solid var(--border-color)',
            background: 'var(--bg-card, var(--bg-subtle))',
            color: 'var(--text-main)',
            cursor: retrying ? 'wait' : 'pointer',
            fontFamily: 'inherit',
          }}
        >
          <RefreshCw size={12} style={retrying ? { animation: 'spin 1s linear infinite' } : undefined} />
          {retrying ? 'Retrying' : 'Retry'}
        </button>
      )}
      {!actionable && (
        <button
          type="button"
          aria-label="Dismiss menu status"
          onClick={() => setDismissed(true)}
          style={{
            flexShrink: 0,
            display: 'inline-flex',
            alignItems: 'center',
            justifyContent: 'center',
            width: 28,
            height: 28,
            padding: 0,
            border: 'none',
            borderRadius: 8,
            background: 'transparent',
            color: 'var(--text-muted)',
            cursor: 'pointer',
          }}
        >
          <X size={14} />
        </button>
      )}
    </div>
  );
};
