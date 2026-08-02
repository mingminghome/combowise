import { useState } from 'react';
import { MapPin } from 'lucide-react';
import { BaseFastFoodProvider } from './core/providers/baseProvider';
import { providerRegistry } from './core/providers/providerRegistry';
import { MenuSyncService } from './core/services/menuSyncService';
import { StoreSearchService } from './core/services/storeSearchService';
import { StoreSearchBar } from './components/StoreSearchBar';
import { ProviderSelector } from './components/ProviderSelector';
import { AboutScreen } from './components/AboutScreen';
import { SettingsScreen } from './components/SettingsScreen';
import { PrivacyScreen, TermsScreen } from './components/LegalScreen';
import { BottomNav, type HomeTab } from './components/BottomNav';
import { InstallAppBanner } from './components/InstallAppBanner';
import { Mode1Auditor } from './components/Mode1Auditor';
import { Mode2Optimizer } from './components/Mode2Optimizer';
import { ModeSwitcherBar, type AppMode } from './components/ModeSwitcherBar';
import type { MenuLoadResult, MenuUiPhase, StoreLocation } from './core/types/provider';

const GITHUB_URL = 'https://github.com/mingminghomework';

export function App() {
  const [currentProvider, setCurrentProvider] = useState<BaseFastFoodProvider | null>(null);
  const [locationTierId, setLocationTierId] = useState<string>('standard');
  const [activeTab, setActiveTab] = useState<AppMode>('mode2');
  const [refreshKey, setRefreshKey] = useState(0);
  const [menuPhase, setMenuPhase] = useState<MenuUiPhase>('ready');
  const [, setMenuResult] = useState<MenuLoadResult | null>(null);
  /** Home shell (no restaurant): babywise-style tabs */
  const [homeTab, setHomeTab] = useState<HomeTab>('home');

  const handleMenuUpdated = () => {
    setRefreshKey((k) => k + 1);
  };

  const handleStoreSelected = (store: StoreLocation) => {
    if (store.tierId) {
      setLocationTierId(store.tierId);
    }
    setRefreshKey((k) => k + 1);
  };

  const handleDataCleared = () => {
    setLocationTierId('standard');
    setRefreshKey((k) => k + 1);
    if (currentProvider && MenuSyncService.requiresStoreForMenu(currentProvider.id)) {
      setMenuPhase('need_store');
    }
  };

  const handleProviderSelect = (provider: BaseFastFoodProvider) => {
    setCurrentProvider(provider);
    setLocationTierId('standard');
    setActiveTab('mode2');
    setRefreshKey((k) => k + 1);
    setMenuResult(null);
    if (MenuSyncService.requiresStoreForMenu(provider.id)) {
      setMenuPhase('need_store');
    } else {
      setMenuPhase(
        MenuSyncService.willNetworkFetch(provider.id) ? 'loading' : 'ready'
      );
    }
    const main = document.querySelector('.app-main');
    if (main) main.scrollTo(0, 0);
    else window.scrollTo(0, 0);
  };

  const handleMenuLoadResult = (result: MenuLoadResult | null, phase: MenuUiPhase) => {
    setMenuResult(result);
    setMenuPhase(phase);
    if (phase === 'ready' || phase === 'degraded' || phase === 'error') {
      setRefreshKey((k) => k + 1);
    }
  };

  const handleChangeProvider = () => {
    setCurrentProvider(null);
    setLocationTierId('standard');
    setMenuPhase('ready');
    setMenuResult(null);
    setHomeTab('home');
  };

  const storeGated =
    !!currentProvider && MenuSyncService.requiresStoreForMenu(currentProvider.id);
  const storeSelected =
    !!currentProvider && !!StoreSearchService.getSelectedStore(currentProvider.id);
  const modesUnlocked = !!currentProvider && (!storeGated || storeSelected);
  const onHomeShell = !currentProvider;

  const renderHomeBody = () => {
    switch (homeTab) {
      case 'settings':
        return <SettingsScreen onNavigate={setHomeTab} />;
      case 'about':
        return <AboutScreen onBack={() => setHomeTab('settings')} />;
      case 'privacy':
        return <PrivacyScreen onBack={() => setHomeTab('settings')} />;
      case 'terms':
        return <TermsScreen onBack={() => setHomeTab('settings')} />;
      case 'home':
      default:
        return (
          <>
            <InstallAppBanner />
            <ProviderSelector
              providers={providerRegistry.getAllProviders()}
              onSelect={handleProviderSelect}
            />
          </>
        );
    }
  };

  return (
    <div className="app-page">
      <div className={`app-shell${onHomeShell ? ' app-shell--home' : ' app-shell--session'}`}>
        {currentProvider && (
          <div className="app-sticky-header app-sticky-header--in-session">
            <StoreSearchBar
              currentProvider={currentProvider}
              onStoreSelected={handleStoreSelected}
              onMenuUpdated={handleMenuUpdated}
              onChangeProvider={handleChangeProvider}
              onDataCleared={handleDataCleared}
              onMenuLoadResult={handleMenuLoadResult}
            />
            {modesUnlocked && (
              <ModeSwitcherBar
                className="mode-switcher--app-sticky"
                variant="compact"
                activeTab={activeTab}
                onChange={setActiveTab}
              />
            )}
          </div>
        )}

        <main className="app-main">
          {onHomeShell ? (
            renderHomeBody()
          ) : (
            <>
              {modesUnlocked && (
                <ModeSwitcherBar
                  className="mode-switcher--desktop-flow"
                  variant="full"
                  activeTab={activeTab}
                  onChange={setActiveTab}
                />
              )}

              <div className="mode-content">
                {modesUnlocked ? (
                  activeTab === 'mode2' ? (
                    <Mode2Optimizer
                      key={`${currentProvider!.id}-${refreshKey}`}
                      provider={currentProvider!}
                      locationTierId={locationTierId}
                    />
                  ) : (
                    <Mode1Auditor
                      key={`${currentProvider!.id}-${refreshKey}`}
                      provider={currentProvider!}
                      locationTierId={locationTierId}
                    />
                  )
                ) : (
                  <div className="glass-card store-gate-panel">
                    <div className="store-gate-icon">
                      <MapPin size={26} strokeWidth={2.2} />
                    </div>
                    <h2>Select a store to continue</h2>
                    <p>
                      {currentProvider!.name} menus and prices are shop-specific (like the official
                      app). Use the search bar above to pick a location — Basket Optimiser and Combo
                      Auditor unlock after that.
                    </p>
                  </div>
                )}
              </div>
            </>
          )}
        </main>

        {onHomeShell ? (
          <BottomNav tab={homeTab} onChange={setHomeTab} />
        ) : (
          <footer className="app-footer app-footer--session">
            <p className="app-footer-session-line">
              {currentProvider?.getDisclaimer() ||
                'Prices are indicative snapshots, not live checkout totals.'}
              {menuPhase === 'degraded' || menuPhase === 'error'
                ? ' · Menu sync issue — use Retry if needed.'
                : ''}{' '}
              <a href={GITHUB_URL} target="_blank" rel="noopener noreferrer">
                @mingminghomework
              </a>
            </p>
          </footer>
        )}
      </div>
    </div>
  );
}

export default App;
