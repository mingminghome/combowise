import React, { useState, useEffect } from 'react';
import { RefreshCw, CheckCircle2, AlertCircle, Store } from 'lucide-react';
import { MenuSyncService } from '../core/services/menuSyncService';
import { StoreSearchService } from '../core/services/storeSearchService';
import type { MenuLoadSource } from '../core/types/provider';

interface SyncStatusBadgeProps {
  providerId: string;
  onMenuUpdated?: () => void;
  /** Bump when selected store changes so labels refresh */
  storeRevision?: number;
}

export const SyncStatusBadge: React.FC<SyncStatusBadgeProps> = ({
  providerId,
  onMenuUpdated,
  storeRevision = 0,
}) => {
  const requiresStore = MenuSyncService.requiresStoreForMenu(providerId);
  const selectedStore = StoreSearchService.getSelectedStore(providerId);
  const [isSyncing, setIsSyncing] = useState(false);
  const [lastSynced, setLastSynced] = useState<Date | null>(() =>
    MenuSyncService.getLastSyncedAt(providerId)
  );
  const [source, setSource] = useState<MenuLoadSource | null>(() =>
    MenuSyncService.getCacheMeta(providerId)?.source ?? null
  );
  const [hint, setHint] = useState<string | undefined>();

  useEffect(() => {
    setLastSynced(MenuSyncService.getLastSyncedAt(providerId));
    setSource(MenuSyncService.getCacheMeta(providerId)?.source ?? null);

    const store = StoreSearchService.getSelectedStore(providerId);
    // Only background-sync when a shop is selected (store-gated) — never right after Clear
    if (!requiresStore || store) {
      MenuSyncService.startBackgroundSync(providerId, 15 * 60 * 1000);
    } else {
      MenuSyncService.stopBackgroundSync();
    }

    const unsubscribe = MenuSyncService.subscribe(() => {
      setLastSynced(MenuSyncService.getLastSyncedAt(providerId));
      setSource(MenuSyncService.getCacheMeta(providerId)?.source ?? null);
      if (onMenuUpdated) onMenuUpdated();
    });

    return () => {
      unsubscribe();
      MenuSyncService.stopBackgroundSync();
    };
  }, [providerId, onMenuUpdated, storeRevision, requiresStore]);

  const handleManualSync = async () => {
    if (requiresStore && !StoreSearchService.getSelectedStore(providerId)) {
      setHint('Select a store first');
      return;
    }
    setIsSyncing(true);
    setHint(undefined);
    try {
      const result = await MenuSyncService.syncProviderMenu(providerId, { forceRefresh: true });
      setLastSynced(MenuSyncService.getLastSyncedAt(providerId));
      setSource(result.source);
      setHint(result.message);
      if (onMenuUpdated) onMenuUpdated();
    } finally {
      setTimeout(() => setIsSyncing(false), 600);
    }
  };

  const formatTimeAgo = (date: Date | null) => {
    if (!date) return requiresStore && !selectedStore ? 'Menu' : 'Sync';
    const diffSec = Math.floor((new Date().getTime() - date.getTime()) / 1000);
    if (diffSec < 60) return 'Now';
    if (diffSec < 3600) return `${Math.floor(diffSec / 60)}m`;
    return `${Math.floor(diffSec / 3600)}h`;
  };

  const needsStore = requiresStore && !selectedStore;
  const title = needsStore
    ? 'Select a store to load shop menu & prices'
    : 'Click to refresh menu & prices (indicative snapshot)';

  return (
    <button
      type="button"
      onClick={handleManualSync}
      disabled={isSyncing || needsStore}
      title={hint || title}
      style={{
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
        cursor: isSyncing || needsStore ? 'not-allowed' : 'pointer',
        opacity: needsStore ? 0.65 : 1,
        transition: 'all 0.15s ease',
        whiteSpace: 'nowrap',
        lineHeight: 1.2,
        fontFamily: 'inherit',
        boxSizing: 'border-box',
      }}
    >
      {isSyncing ? (
        <RefreshCw size={13} style={{ animation: 'spin 1s linear infinite' }} />
      ) : needsStore ? (
        <Store size={13} />
      ) : source === 'bundle' ? (
        <AlertCircle size={13} color="var(--accent-amber, #d97706)" />
      ) : (
        <CheckCircle2 size={13} color="var(--accent-green)" />
      )}
      {isSyncing ? 'Syncing' : needsStore ? 'Pick store' : formatTimeAgo(lastSynced)}
    </button>
  );
};
