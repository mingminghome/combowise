import React, { useState, useEffect, useRef } from 'react';
import { Search, Check, Smartphone, Navigation, Loader2, MapPin, X, ArrowLeft } from 'lucide-react';
import type { MenuLoadResult, MenuUiPhase, StoreLocation } from '../core/types/provider';
import { BaseFastFoodProvider } from '../core/providers/baseProvider';
import { StoreSearchService } from '../core/services/storeSearchService';
import { MenuSyncService } from '../core/services/menuSyncService';
import { SyncStatusBadge } from './SyncStatusBadge';
import { ClearLocalDataButton } from './ClearLocalDataButton';
import { MenuLoadBanner } from './MenuLoadBanner';

function phaseFromResult(result: MenuLoadResult, needStore: boolean): MenuUiPhase {
  if (needStore || result.errorCode === 'need_store') return 'need_store';
  if (result.status === 'error') return 'error';
  if (result.status === 'degraded') return 'degraded';
  return 'ready';
}

// Uniform toolbar button style (shared footprint across Change / Store / etc.)
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

interface StoreSearchBarProps {
  currentProvider: BaseFastFoodProvider;
  onStoreSelected: (store: StoreLocation) => void;
  onMenuUpdated?: () => void;
  onChangeProvider?: () => void;
  onDataCleared?: () => void;
  /** Notified when menu load phase changes (store-gated providers) */
  onMenuLoadResult?: (result: MenuLoadResult | null, phase: MenuUiPhase) => void;
}

export const StoreSearchBar: React.FC<StoreSearchBarProps> = ({
  currentProvider,
  onStoreSelected,
  onMenuUpdated,
  onChangeProvider,
  onDataCleared,
  onMenuLoadResult,
}) => {
  const providerId = currentProvider.id;
  const requiresStore = MenuSyncService.requiresStoreForMenu(providerId);
  const [query, setQuery] = useState('');
  const [isOpen, setIsOpen] = useState(false);
  const [isLocating, setIsLocating] = useState(false);
  const [gpsError, setGpsError] = useState<string | null>(null);
  const [menuPhase, setMenuPhase] = useState<MenuUiPhase>(() => {
    if (requiresStore && !StoreSearchService.getSelectedStore(providerId)) return 'need_store';
    return 'ready';
  });
  const [menuResult, setMenuResult] = useState<MenuLoadResult | null>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const [matchingStores, setMatchingStores] = useState<StoreLocation[]>(() =>
    StoreSearchService.searchStoresLocal('', providerId)
  );
  const [selectedStore, setSelectedStore] = useState<StoreLocation | null>(() =>
    StoreSearchService.hasSelectedStore(providerId)
      ? StoreSearchService.getSelectedStore(providerId)
      : null
  );
  const [localDataRevision, setLocalDataRevision] = useState(0);

  const applyMenuResult = (result: MenuLoadResult, phase: MenuUiPhase) => {
    setMenuResult(result);
    setMenuPhase(phase);
    onMenuLoadResult?.(result, phase);
  };

  /**
   * Load menu for a store scope. Skips loading UI on fresh cache (no flash).
   */
  const loadMenuForScope = async (
    storeId: string | null,
    options: { forceRefresh?: boolean } = {}
  ) => {
    const forceRefresh = options.forceRefresh === true;
    const needStore = requiresStore && !storeId;

    if (needStore) {
      const result = await MenuSyncService.ensureMenuLoaded(providerId, { storeId: null });
      applyMenuResult(result, 'need_store');
      return result;
    }

    const showLoading = MenuSyncService.willNetworkFetch(providerId, {
      storeId,
      forceRefresh,
    });

    if (showLoading) {
      setMenuPhase('loading');
      onMenuLoadResult?.(menuResult, 'loading');
    }

    const result = forceRefresh
      ? await MenuSyncService.syncProviderMenu(providerId, { storeId, forceRefresh: true })
      : await MenuSyncService.ensureMenuLoaded(providerId, { storeId, forceRefresh });

    applyMenuResult(result, phaseFromResult(result, false));
    onMenuUpdated?.();
    return result;
  };

  /** On mount / provider change: load store directory, then menu if shop already selected */
  useEffect(() => {
    let cancelled = false;

    const boot = async () => {
      const loadStores = StoreSearchService.ensureStoresLoaded(providerId).then(() => {
        if (!cancelled) {
          setMatchingStores(StoreSearchService.searchStoresLocal('', providerId));
        }
      });

      // Store-gated chains wait for the directory. Optional-store chains
      // (McD / BK / TH) load the menu immediately so a failed locator cannot block.
      if (requiresStore && !selectedStore) {
        await loadStores;
        if (cancelled) return;
        if (
          MenuSyncService.requiresStoreForMenu(providerId) &&
          StoreSearchService.hasStores(providerId)
        ) {
          const result = await MenuSyncService.ensureMenuLoaded(providerId, { storeId: null });
          if (!cancelled) applyMenuResult(result, 'need_store');
          return;
        }
        // Directory failed / empty — skip store pick and try the chain menu
      } else {
        void loadStores;
      }

      const storeId = selectedStore?.id ?? null;
      const showLoading = MenuSyncService.willNetworkFetch(providerId, { storeId });
      if (showLoading && !cancelled) {
        setMenuPhase('loading');
        onMenuLoadResult?.(null, 'loading');
      }

      const result = await MenuSyncService.ensureMenuLoaded(providerId, { storeId });
      if (!cancelled) {
        applyMenuResult(result, phaseFromResult(result, false));
        onMenuUpdated?.();
      }
    };

    void boot();
    return () => {
      cancelled = true;
    };
    // Only re-run when provider changes; store selection handled in handleSelect
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [providerId]);

  // Close dropdown on outside click
  useEffect(() => {
    const handleClick = (e: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setIsOpen(false);
      }
    };
    if (isOpen) document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, [isOpen]);

  // Auto-focus search input when dropdown opens
  useEffect(() => {
    if (isOpen && inputRef.current) {
      inputRef.current.focus();
    }
  }, [isOpen]);

  // Debounced search
  useEffect(() => {
    let isCancelled = false;
    const performSearch = async () => {
      if (!query.trim()) {
        setMatchingStores(StoreSearchService.searchStoresLocal('', providerId));
        return;
      }
      const localMatches = StoreSearchService.searchStoresLocal(query, providerId);
      if (!isCancelled) setMatchingStores(localMatches);

      const asyncMatches = await StoreSearchService.searchStoresAsync(query, providerId);
      if (!isCancelled && asyncMatches.length > 0) setMatchingStores(asyncMatches);
    };
    const timer = setTimeout(performSearch, 250);
    return () => { isCancelled = true; clearTimeout(timer); };
  }, [query, providerId]);

  const handleSelect = async (store: StoreLocation) => {
    setSelectedStore(store);
    StoreSearchService.setSelectedStore(providerId, store);
    setLocalDataRevision((n) => n + 1);
    setIsOpen(false);
    setQuery('');

    // Official-app style: hydrate menu when shop is chosen (no flash if cache fresh)
    await loadMenuForScope(store.id);
    onStoreSelected(store);
  };

  const handleMenuRetry = async () => {
    const storeId = selectedStore?.id ?? StoreSearchService.getSelectedStore(providerId)?.id ?? null;
    if (requiresStore && !storeId) return;
    await loadMenuForScope(storeId, { forceRefresh: true });
  };

  const handleUseGps = async () => {
    if (!navigator.geolocation) {
      setGpsError('Location is not supported in this browser. Search by postcode or name.');
      return;
    }
    // Geolocation requires a secure context (https / localhost)
    if (typeof window !== 'undefined' && !window.isSecureContext) {
      setGpsError('Location needs HTTPS. Open the live site or use postcode search.');
      return;
    }

    setIsLocating(true);
    setGpsError(null);
    setIsOpen(true);

    // Ensure store directory is loaded before we try nearest-store sort
    try {
      await StoreSearchService.ensureStoresLoaded(providerId);
    } catch {
      /* still try GPS; list may already be cached */
    }

    const getPosition = (options: PositionOptions) =>
      new Promise<GeolocationPosition>((resolve, reject) => {
        navigator.geolocation.getCurrentPosition(resolve, reject, options);
      });

    const messageForGeoError = (err: GeolocationPositionError | unknown): string => {
      const code =
        err && typeof err === 'object' && 'code' in err
          ? (err as GeolocationPositionError).code
          : undefined;
      // 1 PERMISSION_DENIED · 2 POSITION_UNAVAILABLE · 3 TIMEOUT
      if (code === 1) {
        return 'Location blocked for this site. In browser settings allow location for this page, then try again — or search by postcode.';
      }
      if (code === 2) {
        return 'Could not determine your position (GPS unavailable). Try again outdoors or search by postcode.';
      }
      if (code === 3) {
        return 'Location timed out. Try again or search by postcode / store name.';
      }
      return 'Could not get your location. Search by postcode or store name instead.';
    };

    try {
      // Prefer a quick cached / network fix first — high accuracy often times out on desktop
      // even when permission is already granted.
      let pos: GeolocationPosition;
      try {
        pos = await getPosition({
          enableHighAccuracy: false,
          timeout: 12000,
          maximumAge: 120_000,
        });
      } catch (firstErr) {
        const code =
          firstErr && typeof firstErr === 'object' && 'code' in firstErr
            ? (firstErr as GeolocationPositionError).code
            : undefined;
        // Retry once with high accuracy only if not a hard permission deny
        if (code === 1) throw firstErr;
        pos = await getPosition({
          enableHighAccuracy: true,
          timeout: 20000,
          maximumAge: 0,
        });
      }

      const { latitude, longitude } = pos.coords;
      let sorted = await StoreSearchService.searchStoresByCoordinatesAsync(
        latitude,
        longitude,
        providerId
      );

      if (sorted.length === 0) {
        await StoreSearchService.ensureStoresLoaded(providerId, { forceRefresh: true });
        sorted = StoreSearchService.searchStoresByCoordinates(latitude, longitude, providerId);
      }

      if (sorted.length === 0) {
        setGpsError('Got your location, but no stores are loaded yet. Search by postcode or retry.');
        setIsLocating(false);
        return;
      }

      const withCoords = sorted.filter(
        (s) => typeof s.latitude === 'number' && typeof s.longitude === 'number'
      );
      const nearest = (withCoords.length > 0 ? withCoords : sorted)[0];
      setMatchingStores(sorted.slice(0, 40));
      setQuery('');
      await handleSelect(nearest);
      setIsLocating(false);
    } catch (err) {
      setGpsError(messageForGeoError(err));
      setIsLocating(false);
    }
  };

  const handleLocalDataCleared = () => {
    // Drop store selection UI; store list still available via Store picker
    setSelectedStore(null);
    setLocalDataRevision((n) => n + 1);
    setQuery('');
    setIsOpen(false);
    setGpsError(null);
    // Empty shell — do not call ensureMenuLoaded (that would re-download)
    const empty = MenuSyncService.brandShell(providerId);
    const clearedResult = {
      menu: empty,
      source: 'bundle' as const,
      status: 'ok' as const,
      cachedAt: null,
      updatedAt: null,
      fromNetwork: false,
      attemptedNetwork: false,
      errorCode: 'need_store' as const,
      message: 'Select a store to load shop menu & prices',
    };
    setMenuResult(clearedResult);
    setMenuPhase(requiresStore ? 'need_store' : 'error');
    onMenuLoadResult?.(clearedResult, requiresStore ? 'need_store' : 'error');
    onDataCleared?.();
    onMenuUpdated?.();
  };

  return (
    <div ref={dropdownRef} className="provider-toolbar" style={{ position: 'relative', width: '100%' }}>
      {/* Provider Toolbar — sticks under sticky header stack */}
      <div
        className="glass-card provider-toolbar-card"
        style={{
          padding: '0.55rem 0.85rem',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          gap: '0.65rem',
          flexWrap: 'wrap',
          borderRadius: '14px',
          background: 'var(--bg-card)',
          border: '1px solid var(--border-color)',
          boxShadow: 'var(--shadow-glow)',
        }}
      >
        {/* Left: Back · Brand badge · Store name */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', minWidth: 0, flex: '1 1 200px' }}>
          {onChangeProvider && (
            <button
              type="button"
              onClick={onChangeProvider}
              title="Back to restaurants"
              aria-label="Back to restaurants"
              className="provider-toolbar-back"
            >
              <ArrowLeft size={18} strokeWidth={2.4} />
            </button>
          )}
          <div
            className="provider-toolbar-badge"
            style={{
              background: currentProvider.accentColor,
              boxShadow: `0 2px 10px ${currentProvider.accentColor}55`,
            }}
          >
            {currentProvider.logoText}
          </div>
          <div style={{ minWidth: 0 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.35rem', flexWrap: 'wrap' }}>
              <span style={{ fontWeight: 800, fontSize: '0.9rem', color: 'var(--text-main)', whiteSpace: 'nowrap' }}>
                {selectedStore ? selectedStore.name : currentProvider.name}
              </span>
              {selectedStore?.isAppMenuAvailable && (
                <span style={{ fontSize: '0.66rem', color: 'var(--accent-green)', fontWeight: 700, display: 'inline-flex', alignItems: 'center', gap: '0.2rem' }}>
                  <Smartphone size={10} /> App Menu
                </span>
              )}
            </div>
            <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
              {selectedStore
                ? `${selectedStore.address}, ${selectedStore.postcode}`
                : 'Select a store to load local prices'}
            </div>
          </div>
        </div>

        {/* Right: Store · Sync · Clear */}
        <div className="provider-toolbar-actions">
          <button
            type="button"
            onClick={() => {
              const next = !isOpen;
              setIsOpen(next);
              if (next) {
                void StoreSearchService.ensureStoresLoaded(providerId).then(() => {
                  setMatchingStores(StoreSearchService.searchStoresLocal(query, providerId));
                });
              }
            }}
            style={{
              ...tbBtn,
              ...(isOpen
                ? {
                    background: 'var(--primary-red)',
                    color: 'var(--text-on-accent)',
                    borderColor: 'var(--primary-red)',
                  }
                : {}),
            }}
          >
            <MapPin size={13} />
            Store
          </button>
          <SyncStatusBadge
            providerId={currentProvider.id}
            onMenuUpdated={onMenuUpdated}
            storeRevision={localDataRevision}
          />
          <ClearLocalDataButton
            providerId={currentProvider.id}
            providerName={currentProvider.name}
            revision={localDataRevision}
            onCleared={handleLocalDataCleared}
          />
        </div>
      </div>

      {/* Store Search Dropdown */}
      {isOpen && (
        <div
          style={{
            position: 'absolute',
            top: '100%',
            left: 0,
            right: 0,
            marginTop: '0.35rem',
            zIndex: 100,
            background: 'var(--bg-card)',
            backdropFilter: 'blur(20px)',
            borderRadius: '14px',
            boxShadow: '0 12px 40px rgba(0,0,0,0.25)',
            border: '1.5px solid var(--border-color)',
            overflow: 'hidden',
          }}
        >
          {/* Search Header */}
          <div style={{
            padding: '0.75rem 0.85rem',
            borderBottom: '1px solid var(--border-color)',
            display: 'flex',
            alignItems: 'center',
            gap: '0.5rem',
          }}>
            <Search size={15} color="var(--text-muted)" style={{ flexShrink: 0 }} />
            <input
              ref={inputRef}
              type="text"
              placeholder="Postcode or city name..."
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              style={{
                flex: 1,
                background: 'transparent',
                border: 'none',
                outline: 'none',
                color: 'var(--text-main)',
                fontSize: '0.88rem',
                fontFamily: 'var(--font-heading)',
                fontWeight: 600,
              }}
            />
            {query && (
              <button onClick={() => setQuery('')} style={{ background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer', padding: 2, display: 'flex' }}>
                <X size={14} />
              </button>
            )}
          </div>

          {/* GPS Quick Action */}
          <button
            onClick={handleUseGps}
            disabled={isLocating}
            style={{
              width: '100%',
              padding: '0.6rem 0.85rem',
              display: 'flex',
              alignItems: 'center',
              gap: '0.5rem',
              background: 'transparent',
              border: 'none',
              borderBottom: '1px solid var(--border-color)',
              color: 'var(--primary-red)',
              fontWeight: 700,
              fontSize: '0.82rem',
              cursor: isLocating ? 'wait' : 'pointer',
              transition: 'background 0.15s ease',
              fontFamily: 'var(--font-heading)',
            }}
          >
            {isLocating ? (
              <Loader2 size={15} style={{ animation: 'spin 1s linear infinite' }} />
            ) : (
              <Navigation size={15} />
            )}
            {isLocating ? 'Detecting your location...' : 'Use my location'}
          </button>

          {gpsError && (
            <div style={{ padding: '0.4rem 0.85rem', fontSize: '0.75rem', color: 'var(--accent-danger)', background: 'var(--accent-danger-soft)', borderBottom: '1px solid var(--border-color)' }}>
              {gpsError}
            </div>
          )}

          {/* Store List */}
          <div style={{ maxHeight: '280px', overflowY: 'auto' }}>
            {matchingStores.length > 0 ? (
              matchingStores.map((store) => {
                const isSelected = selectedStore?.id === store.id;
                return (
                  <div
                    key={store.id}
                    onClick={() => handleSelect(store)}
                    style={{
                      padding: '0.65rem 0.85rem',
                      display: 'flex',
                      justifyContent: 'space-between',
                      alignItems: 'center',
                      cursor: 'pointer',
                      borderBottom: '1px solid var(--border-color)',
                      background: isSelected ? 'var(--primary-red-glow)' : 'transparent',
                      transition: 'background 0.12s ease',
                    }}
                  >
                    <div style={{ minWidth: 0 }}>
                      <div style={{
                        fontWeight: isSelected ? 800 : 600,
                        fontSize: '0.85rem',
                        color: isSelected ? 'var(--primary-red)' : 'var(--text-main)',
                        fontFamily: 'var(--font-heading)',
                      }}>
                        {store.name}
                      </div>
                      <div style={{
                        fontSize: '0.73rem',
                        color: 'var(--text-muted)',
                        marginTop: '0.05rem',
                        whiteSpace: 'nowrap',
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                      }}>
                        {store.address} • {store.postcode}
                      </div>
                    </div>

                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', flexShrink: 0 }}>
                      {store.distanceMiles !== undefined && (
                        <span style={{
                          fontSize: '0.72rem',
                          color: 'var(--accent-green)',
                          fontWeight: 700,
                          fontFamily: 'var(--font-mono)',
                          fontVariantNumeric: 'tabular-nums',
                        }}>
                          {store.distanceMiles.toFixed(1)} mi
                        </span>
                      )}
                      {store.appExclusiveItems && store.appExclusiveItems.length > 0 && (
                        <span
                          className="badge badge-ppi"
                          style={{ fontSize: '0.66rem', padding: '0.1rem 0.4rem' }}
                        >
                          {store.appExclusiveItems.length} App deals
                        </span>
                      )}
                      {isSelected && <Check size={15} color="var(--primary-red)" strokeWidth={3} />}
                    </div>
                  </div>
                );
              })
            ) : (
              <div style={{ padding: '1.5rem', textAlign: 'center', color: 'var(--text-muted)', fontSize: '0.82rem' }}>
                {StoreSearchService.hasStores(providerId)
                  ? query
                    ? `No stores found for "${query}"`
                    : 'No stores in list'
                  : query
                    ? StoreSearchService.getLastError(providerId)
                      ? `Could not search "${query}": ${StoreSearchService.getLastError(providerId)}`
                      : `No stores found for "${query}". Try a nearby postcode.`
                    : StoreSearchService.getLastError(providerId)
                      ? `Could not load stores: ${StoreSearchService.getLastError(providerId)}`
                      : 'Search by postcode (e.g. WA15) or use your location.'}
                {!StoreSearchService.hasStores(providerId) && (
                  <div style={{ marginTop: '0.75rem' }}>
                    <button
                      type="button"
                      className="btn-secondary"
                      style={{ fontSize: '0.78rem', padding: '0.35rem 0.75rem' }}
                      onClick={async () => {
                        await StoreSearchService.ensureStoresLoaded(providerId, { forceRefresh: true });
                        setMatchingStores(
                          StoreSearchService.searchStoresLocal(query, providerId)
                        );
                        setLocalDataRevision((n) => n + 1);
                      }}
                    >
                      Retry load stores
                    </button>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      )}

      <MenuLoadBanner
        phase={menuPhase}
        result={menuResult}
        providerName={currentProvider.name}
        requiresStore={requiresStore}
        onRetry={
          requiresStore && !selectedStore
            ? undefined
            : () => handleMenuRetry()
        }
      />
    </div>
  );
};
