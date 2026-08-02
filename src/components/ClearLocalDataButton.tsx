import React, { useState, useEffect } from 'react';
import ReactDOM from 'react-dom';
import { Trash2, ShieldOff, Check, X } from 'lucide-react';
import { MenuSyncService } from '../core/services/menuSyncService';
import { StoreSearchService } from '../core/services/storeSearchService';
import { UserRewardsService } from '../core/services/userRewardsService';

const tbBtn: React.CSSProperties = {
  padding: '0.4rem 0.75rem',
  fontSize: '0.78rem',
  fontWeight: 700,
  borderRadius: '8px',
  border: '1px solid var(--border-color)',
  background: 'var(--bg-subtle)',
  color: 'var(--text-muted)',
  display: 'inline-flex',
  alignItems: 'center',
  gap: '0.35rem',
  cursor: 'pointer',
  transition: 'all 0.15s ease',
  whiteSpace: 'nowrap' as const,
  lineHeight: 1.2,
  fontFamily: 'inherit',
  boxSizing: 'border-box',
};

interface ClearLocalDataButtonProps {
  providerId: string;
  providerName?: string;
  /** Bump when parent mutates local store selection so flags re-read */
  revision?: number;
  onCleared?: () => void;
}

function collectLocalDataFlags(providerId: string) {
  return {
    login: UserRewardsService.hasLogin(providerId),
    rewards: UserRewardsService.hasVouchers(providerId),
    menuCache: MenuSyncService.hasCachedMenu(providerId),
    store:
      StoreSearchService.hasSelectedStore(providerId) ||
      StoreSearchService.hasStores(providerId),
  };
}

export const ClearLocalDataButton: React.FC<ClearLocalDataButtonProps> = ({
  providerId,
  providerName,
  revision = 0,
  onCleared,
}) => {
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [justCleared, setJustCleared] = useState(false);
  const [flags, setFlags] = useState(() => collectLocalDataFlags(providerId));

  useEffect(() => {
    setFlags(collectLocalDataFlags(providerId));
    const unsubRewards = UserRewardsService.subscribe(() => {
      setFlags(collectLocalDataFlags(providerId));
    });
    const unsubMenu = MenuSyncService.subscribe(() => {
      setFlags(collectLocalDataFlags(providerId));
    });
    return () => {
      unsubRewards();
      unsubMenu();
    };
  }, [providerId, revision]);

  useEffect(() => {
    if (!confirmOpen) return;
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setConfirmOpen(false);
    };
    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, [confirmOpen]);

  const hasAnyData = flags.login || flags.rewards || flags.menuCache || flags.store;
  const displayName = providerName || 'this restaurant';

  const handleClear = () => {
    // Order matters: drop store + stop sync before/with menu clear so background
    // ensureMenuLoaded cannot immediately re-download while a shop is still selected.
    MenuSyncService.stopBackgroundSync();
    StoreSearchService.clearProviderLocalData(providerId);
    MenuSyncService.clearCachedMenu(providerId);
    UserRewardsService.clearAccountData(providerId);
    setConfirmOpen(false);
    setJustCleared(true);
    setFlags(collectLocalDataFlags(providerId));
    onCleared?.();
    window.setTimeout(() => setJustCleared(false), 1800);
  };

  const items: { key: keyof typeof flags; label: string; detail: string }[] = [
    { key: 'login', label: 'Login email', detail: 'Saved account address (legacy)' },
    { key: 'rewards', label: 'Saved rewards data', detail: 'Legacy local vouchers if any' },
    { key: 'menuCache', label: 'Downloaded menu', detail: 'Last fetched prices & sync time' },
    { key: 'store', label: 'Selected store', detail: 'Preferred location + store list cache' },
  ];

  return (
    <>
      <button
        type="button"
        onClick={() => {
          if (!hasAnyData && !justCleared) return;
          setConfirmOpen(true);
        }}
        disabled={!hasAnyData && !justCleared}
        title={
          hasAnyData
            ? 'Remove login, private & synced data stored on this device'
            : 'No local login or synced data stored'
        }
        style={{
          ...tbBtn,
          opacity: hasAnyData || justCleared ? 1 : 0.45,
          cursor: hasAnyData || justCleared ? 'pointer' : 'not-allowed',
          color: justCleared
            ? 'var(--accent-green)'
            : confirmOpen
              ? 'var(--primary-red)'
              : 'var(--text-muted)',
          borderColor: justCleared
            ? 'var(--accent-green-border)'
            : confirmOpen
              ? 'var(--accent-danger-border)'
              : 'var(--border-color)',
          background: justCleared
            ? 'var(--accent-green-bg)'
            : confirmOpen
              ? 'var(--accent-danger-bg)'
              : 'var(--bg-subtle)',
        }}
      >
        {justCleared ? (
          <>
            <Check size={13} />
            Cleared
          </>
        ) : (
          <>
            <Trash2 size={13} />
            Clear
          </>
        )}
      </button>

      {confirmOpen &&
        ReactDOM.createPortal(
          <div
            onClick={() => setConfirmOpen(false)}
            style={{
              position: 'fixed',
              top: 0,
              left: 0,
              right: 0,
              bottom: 0,
              zIndex: 999999,
              background: 'rgba(0, 0, 0, 0.85)',
              backdropFilter: 'blur(14px)',
              WebkitBackdropFilter: 'blur(14px)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              padding: '1.5rem',
            }}
          >
            <div
              role="dialog"
              aria-modal="true"
              aria-label="Remove local data"
              onClick={(e) => e.stopPropagation()}
              className="glass-card"
              style={{
                maxWidth: 440,
                width: '100%',
                padding: '1.75rem',
                background: 'var(--bg-card)',
                position: 'relative',
                border: '1.5px solid var(--border-color)',
                boxShadow: '0 25px 60px rgba(0, 0, 0, 0.4)',
                borderRadius: '16px',
              }}
            >
              {/* Header — matches Rewards modal pattern */}
              <div
                style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  marginBottom: '1.25rem',
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem' }}>
                  <div
                    style={{
                      width: 40,
                      height: 40,
                      borderRadius: 12,
                      background: 'linear-gradient(135deg, var(--accent-danger) 0%, #b91c3a 100%)',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      boxShadow: '0 4px 14px var(--accent-danger-glow)',
                      flexShrink: 0,
                    }}
                  >
                    <ShieldOff size={20} color="#ffffff" />
                  </div>
                  <div>
                    <h3
                      style={{
                        fontSize: '1.15rem',
                        fontWeight: 900,
                        color: 'var(--text-main)',
                        fontFamily: 'var(--font-heading)',
                        margin: 0,
                      }}
                    >
                      Remove Local Data
                    </h3>
                    <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>
                      Privacy reset for {displayName} on this device
                    </span>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => setConfirmOpen(false)}
                  style={{
                    background: 'var(--bg-subtle-hover)',
                    border: '1px solid var(--border-color)',
                    color: 'var(--text-main)',
                    cursor: 'pointer',
                    width: 34,
                    height: 34,
                    borderRadius: 10,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    transition: 'all 0.15s ease',
                  }}
                  aria-label="Close"
                >
                  <X size={18} />
                </button>
              </div>

              <p
                style={{
                  fontSize: '0.85rem',
                  color: 'var(--text-muted)',
                  lineHeight: 1.5,
                  margin: '0 0 1.15rem',
                }}
              >
                This permanently deletes login, private preferences, and downloaded menu cache
                stored in your browser. Passwords are never stored. After clearing, select a store
                again to re-download the current menu — we do not keep a silent offline price list.
              </p>

              {/* Data inventory list */}
              <div
                style={{
                  display: 'flex',
                  flexDirection: 'column',
                  gap: '0.55rem',
                  marginBottom: '1.35rem',
                }}
              >
                {items.map(({ key, label, detail }) => {
                  const stored = flags[key];
                  return (
                    <div
                      key={key}
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        gap: '0.75rem',
                        padding: '0.75rem 0.95rem',
                        borderRadius: 12,
                        border: `1.5px solid ${stored ? 'var(--accent-amber-border)' : 'var(--border-color)'}`,
                        background: stored ? 'var(--accent-amber-soft)' : 'var(--bg-subtle)',
                      }}
                    >
                      <div style={{ minWidth: 0 }}>
                        <div
                          style={{
                            fontWeight: 800,
                            fontSize: '0.88rem',
                            color: 'var(--text-main)',
                            fontFamily: 'var(--font-heading)',
                          }}
                        >
                          {label}
                        </div>
                        <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginTop: 2 }}>
                          {detail}
                        </div>
                      </div>
                      <span
                        style={{
                          flexShrink: 0,
                          fontSize: '0.68rem',
                          fontWeight: 800,
                          letterSpacing: '0.06em',
                          textTransform: 'uppercase',
                          padding: '0.28rem 0.55rem',
                          borderRadius: 8,
                          border: `1px solid ${stored ? 'var(--accent-amber-border)' : 'var(--border-color)'}`,
                          color: stored ? 'var(--accent-amber)' : 'var(--text-muted)',
                          background: stored ? 'var(--accent-amber-bg)' : 'transparent',
                        }}
                      >
                        {stored ? 'Stored' : 'None'}
                      </span>
                    </div>
                  );
                })}
              </div>

              {/* Actions */}
              <div
                style={{
                  display: 'flex',
                  gap: '0.6rem',
                  justifyContent: 'flex-end',
                  flexWrap: 'wrap',
                }}
              >
                <button
                  type="button"
                  onClick={() => setConfirmOpen(false)}
                  style={{
                    padding: '0.55rem 1.15rem',
                    fontSize: '0.85rem',
                    fontWeight: 800,
                    borderRadius: 10,
                    border: '1.5px solid var(--border-color)',
                    background: 'var(--bg-subtle)',
                    color: 'var(--text-muted)',
                    cursor: 'pointer',
                    fontFamily: 'var(--font-heading)',
                  }}
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={handleClear}
                  disabled={!hasAnyData}
                  style={{
                    padding: '0.55rem 1.15rem',
                    fontSize: '0.85rem',
                    fontWeight: 800,
                    borderRadius: 10,
                    border: 'none',
                    background: hasAnyData
                      ? 'linear-gradient(135deg, var(--accent-danger) 0%, #b91c3a 100%)'
                      : 'var(--bg-subtle)',
                    color: hasAnyData ? '#ffffff' : 'var(--text-muted)',
                    cursor: hasAnyData ? 'pointer' : 'not-allowed',
                    opacity: hasAnyData ? 1 : 0.5,
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: '0.4rem',
                    boxShadow: hasAnyData ? '0 4px 14px var(--accent-danger-glow)' : 'none',
                    fontFamily: 'var(--font-heading)',
                  }}
                >
                  <Trash2 size={14} />
                  Delete All Local Data
                </button>
              </div>
            </div>
          </div>,
          document.body
        )}
    </>
  );
};
