import { providerRegistry } from '../providers/providerRegistry';
import { LocaleService, LOCALE_STORAGE_KEY } from './localeService';
import { MenuSyncService } from './menuSyncService';
import { StoreSearchService } from './storeSearchService';
import { ThemeService } from './themeService';
import { UserRewardsService } from './userRewardsService';

/** Storage keys owned by ComboWise (never touch other origins’ keys). */
const APP_PREFIX = 'ff_calc_';
const THEME_KEY = 'ff_calc_theme';
const INSTALL_BANNER_KEY = 'ff_calc_install_banner_dismissed';
const PRIVACY_NOTE_KEY = 'ff_calc_privacy_note_dismissed';

export type DataCategory = 'all' | 'menus' | 'stores' | 'preferences';

export type DataSummary = {
  keyCount: number;
  menuProviderCount: number;
  storeProviderCount: number;
  hasCustomTheme: boolean;
  hasCustomLocale: boolean;
  hasBannerDismiss: boolean;
  hasPrivacyDismiss: boolean;
};

function listAppKeys(): string[] {
  const keys: string[] = [];
  try {
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      if (k?.startsWith(APP_PREFIX)) keys.push(k);
    }
  } catch {
    /* private mode */
  }
  return keys;
}

function providerIds(): string[] {
  return providerRegistry.getAllProviders().map((p) => p.id);
}

/**
 * Snapshot of what this browser currently holds for ComboWise.
 */
export function getDataSummary(): DataSummary {
  const keys = listAppKeys();
  let menuProviderCount = 0;
  let storeProviderCount = 0;
  for (const id of providerIds()) {
    if (MenuSyncService.hasCachedMenu(id)) menuProviderCount += 1;
    if (
      StoreSearchService.hasSelectedStore(id) ||
      StoreSearchService.hasStores(id)
    ) {
      storeProviderCount += 1;
    }
  }

  let hasCustomTheme = false;
  let hasBannerDismiss = false;
  let hasPrivacyDismiss = false;
  try {
    hasCustomTheme = localStorage.getItem(THEME_KEY) !== null;
    hasBannerDismiss = localStorage.getItem(INSTALL_BANNER_KEY) === '1';
    hasPrivacyDismiss = localStorage.getItem(PRIVACY_NOTE_KEY) === '1';
  } catch {
    /* ignore */
  }

  return {
    keyCount: keys.length,
    menuProviderCount,
    storeProviderCount,
    hasCustomTheme,
    hasCustomLocale: LocaleService.hasCustomLocale(),
    hasBannerDismiss,
    hasPrivacyDismiss,
  };
}

function clearMenusAndAccount() {
  MenuSyncService.stopBackgroundSync();
  for (const id of providerIds()) {
    MenuSyncService.clearCachedMenu(id);
    UserRewardsService.clearAccountData(id);
  }
  // Sweep any leftover menu/meta/rewards keys
  try {
    for (const k of listAppKeys()) {
      if (
        k.startsWith('ff_calc_provider_') ||
        k.startsWith('ff_calc_sync_time_') ||
        k.startsWith('ff_calc_menu_meta_') ||
        k.startsWith('ff_calc_user_rewards_') ||
        k.startsWith('ff_calc_user_email_')
      ) {
        localStorage.removeItem(k);
      }
    }
  } catch {
    /* ignore */
  }
}

function clearStores() {
  for (const id of providerIds()) {
    StoreSearchService.clearProviderLocalData(id);
  }
  try {
    for (const k of listAppKeys()) {
      if (
        k.startsWith('ff_calc_selected_store_') ||
        k.startsWith('ff_calc_stores_') ||
        k.startsWith('ff_calc_stores_meta_')
      ) {
        localStorage.removeItem(k);
      }
    }
  } catch {
    /* ignore */
  }
}

function clearPreferences() {
  try {
    localStorage.removeItem(INSTALL_BANNER_KEY);
    localStorage.removeItem(PRIVACY_NOTE_KEY);
    localStorage.removeItem(LOCALE_STORAGE_KEY);
  } catch {
    /* ignore */
  }
  ThemeService.clearStoredTheme();
  LocaleService.clearStoredLocale();
}

/**
 * Delete local ComboWise data by category (BabyWise / OriginWise-aligned).
 */
export function cleanLocalData(category: DataCategory): void {
  switch (category) {
    case 'menus':
      clearMenusAndAccount();
      break;
    case 'stores':
      clearStores();
      break;
    case 'preferences':
      clearPreferences();
      break;
    case 'all':
    default:
      clearMenusAndAccount();
      clearStores();
      clearPreferences();
      // Final sweep of any remaining app keys
      try {
        for (const k of listAppKeys()) {
          localStorage.removeItem(k);
        }
      } catch {
        /* ignore */
      }
      ThemeService.clearStoredTheme();
      break;
  }
}
