import type {
  DaypartConfig,
  DaypartFilter,
  FastFoodProvider,
  MenuDaypart,
  MenuItem,
  MenuQueryOptions,
  StoreLocationTier,
} from '../types/provider';
import { MenuSyncService } from '../services/menuSyncService';
import { StoreSearchService } from '../services/storeSearchService';
import {
  filterItemsByDaypart,
  hasDaypartUi,
  mergeDaypartConfig,
  resolveDefaultDaypartFilter,
  resolveSupportedDayparts,
  daypartFilterOptions,
  suggestDaypartFromClock,
} from '../utils/daypart';
import { resolveUnitDisplayName, resolveUnitPpiLabel } from '../utils/unitLabels';

/**
 * Campaign / offer SKUs priced in the name (“20 Hot Wings for £7.99”).
 * These sit in the Click & Collect feed but often never appear in the app browse
 * menu — do not recommend them as something you can tap to add.
 */
export function isCampaignPricedName(name: string): boolean {
  return /for\s*(just\s*)?(£\s*)?\d+(\.\d+)?/i.test(name || '');
}

/**
 * True multi-item deal for Combo Auditor (Mode 1).
 * Excludes pure countable packs that are only mis-tagged isCombo.
 */
export function isMode1ComboItem(item: MenuItem): boolean {
  if (!item.isCombo) return false;
  const n = item.name.toLowerCase();
  const units = item.atomicUnits || {};
  const keys = Object.keys(units);
  const componentCount = item.components?.length || 0;
  const hasBuilder =
    componentCount > 0 ||
    (item.equivalentAlaCarteIds && item.equivalentAlaCarteIds.length > 0);

  // Explicit meal / share naming → keep
  if (
    /\b(box meal|big box|bucket|feast|banquet|sharer|dine for|for one|for two|for 2\b|poppy meal|variety)\b/.test(
      n
    ) ||
    (/\bmeal\b/.test(n) && !/\bcomponent\b/.test(n))
  ) {
    return true;
  }

  // Multi-line meal builder → keep
  if (componentCount >= 2 || (hasBuilder && keys.length > 1)) return true;

  // Multi-kind atomic units (burger + fries + drink) → keep
  if (keys.length > 1) return true;

  // Pure single-kind pack (e.g. 8 Hot Wings) or lone sandwich mis-tagged isCombo
  return false;
}

export abstract class BaseFastFoodProvider {
  protected providerData: FastFoodProvider;
  /** Optional plugin-level daypart overrides (registered at construction or via setDaypartConfig) */
  protected pluginDaypartConfig?: DaypartConfig;

  constructor(providerData: FastFoodProvider, pluginDaypartConfig?: DaypartConfig) {
    this.providerData = providerData;
    this.pluginDaypartConfig = pluginDaypartConfig;
  }

  /** Plugins may call this if config is applied after construct */
  setDaypartConfig(config?: DaypartConfig) {
    this.pluginDaypartConfig = config;
  }

  get id(): string {
    return this.providerData.id;
  }

  get name(): string {
    return this.providerData.name;
  }

  get country(): string {
    return this.providerData.country;
  }

  /**
   * Free-form disclaimer from live menu JSON, falling back to brand shell.
   * Engines/UI should not hardcode chain legal copy.
   */
  getDisclaimer(): string | undefined {
    const fromMenu = this.getActiveMenu().disclaimer;
    if (fromMenu && fromMenu.trim()) return fromMenu.trim();
    const fromBrand = this.providerData.disclaimer;
    return fromBrand && fromBrand.trim() ? fromBrand.trim() : undefined;
  }

  get currencySymbol(): string {
    return this.providerData.currencySymbol;
  }

  get accentColor(): string {
    return this.providerData.accentColor;
  }

  get logoText(): string {
    return this.providerData.logoText;
  }

  /**
   * Prefer tiers from the downloaded menu JSON; fall back to brand shell tiers.
   */
  get locationTiers(): StoreLocationTier[] {
    const fromMenu = this.getActiveMenu().locationTiers;
    if (fromMenu && fromMenu.length > 0) return fromMenu;
    return this.providerData.locationTiers;
  }

  /**
   * Active menu for engines/UI: trusted download only.
   * Never fall back to constructor `providerData.items` (would re-show offline demo catalogue after Clear).
   */
  protected getActiveMenu(): FastFoodProvider {
    return MenuSyncService.getProviderMenu(this.id);
  }

  /** Merged daypart config from menu JSON + plugin */
  getDaypartConfig(): DaypartConfig | undefined {
    return mergeDaypartConfig(this.getActiveMenu().daypartConfig, this.pluginDaypartConfig);
  }

  /**
   * Brand + menu unit labels (live JSON can override shell).
   * Engines should call this instead of hardcoding chain product names.
   */
  getUnitLabels(): Record<string, string> {
    const fromMenu = this.getActiveMenu().unitLabels;
    const fromBrand = this.providerData.unitLabels;
    if (!fromMenu && !fromBrand) return {};
    return { ...fromBrand, ...fromMenu };
  }

  getUnitPpiLabels(): Record<string, string> {
    const fromMenu = this.getActiveMenu().unitPpiLabels;
    const fromBrand = this.providerData.unitPpiLabels;
    if (!fromMenu && !fromBrand) return {};
    return { ...fromBrand, ...fromMenu };
  }

  /** Optimizer "covers: N × …" display name for an atomic unit key */
  getUnitDisplayName(unitKey: string): string {
    return resolveUnitDisplayName(unitKey, this.getUnitLabels());
  }

  /** Short unit word for PPI badges */
  getUnitPpiLabel(unitKey: string): string {
    return resolveUnitPpiLabel(unitKey, this.getUnitPpiLabels(), this.getUnitLabels());
  }

  /** Whether Mode UI should show daypart chips */
  supportsDaypartFiltering(): boolean {
    return hasDaypartUi(this.getItems('standard'), this.getDaypartConfig());
  }

  getSupportedDayparts(): MenuDaypart[] {
    return resolveSupportedDayparts(this.getItems('standard'), this.getDaypartConfig());
  }

  getDefaultDaypartFilter(): DaypartFilter {
    return resolveDefaultDaypartFilter(this.getItems('standard'), this.getDaypartConfig());
  }

  getDaypartFilterOptions(): { id: DaypartFilter; label: string }[] {
    return daypartFilterOptions(this.getItems('standard'), this.getDaypartConfig());
  }

  /** Optional clock-based suggestion when windows are configured */
  suggestDaypartNow(now?: Date): DaypartFilter | null {
    return suggestDaypartFromClock(this.getDaypartConfig(), now);
  }

  /**
   * Returns menu items for UI/engines.
   * Store-gated providers: empty list when no shop is selected (cache is not shown).
   * Optional `daypart` filter for breakfast / main lists.
   */
  getItems(locationTierId: string = 'standard', options?: MenuQueryOptions): MenuItem[] {
    // Hard gate: never surface catalogue without a shop when the plugin requires one
    if (
      MenuSyncService.requiresStoreForMenu(this.id) &&
      !StoreSearchService.getSelectedStore(this.id)
    ) {
      return [];
    }

    const activeData = this.getActiveMenu();
    const tier = this.locationTiers.find((t) => t.id === locationTierId) || this.locationTiers[0];
    const multiplier = tier ? tier.priceMultiplier : 1.0;

    let baseItems: MenuItem[] = activeData.items.map((item) => ({
      ...item,
      price: Math.round(item.price * multiplier * 100) / 100,
    }));

    const selectedStore = StoreSearchService.getSelectedStore(this.id);
    if (selectedStore && selectedStore.appExclusiveItems && selectedStore.appExclusiveItems.length > 0) {
      selectedStore.appExclusiveItems.forEach((appItem) => {
        if (!baseItems.some((bi) => bi.id === appItem.id)) {
          baseItems.push({
            ...appItem,
            price: Math.round(appItem.price * multiplier * 100) / 100,
          });
        }
      });
    }

    if (options?.daypart) {
      baseItems = filterItemsByDaypart(baseItems, options.daypart);
    }

    return baseItems;
  }

  getItemById(
    id: string,
    locationTierId: string = 'standard',
    options?: MenuQueryOptions
  ): MenuItem | undefined {
    return this.getItems(locationTierId, options).find((i) => i.id === id);
  }

  /**
   * Mode 1 list: real multi-item meals/combos only.
   * Pure single-kind packs (8 wings, 3 tenders) stay out even if mis-tagged isCombo —
   * those belong in Mode 2 as ala-carte pack sizes.
   */
  getCombos(locationTierId: string = 'standard', options?: MenuQueryOptions): MenuItem[] {
    return this.getItems(locationTierId, options).filter((i) => isMode1ComboItem(i));
  }

  getAlaCarteItems(locationTierId: string = 'standard', options?: MenuQueryOptions): MenuItem[] {
    return this.getItems(locationTierId, options).filter((i) => !i.isCombo);
  }

  /**
   * Mode 2 wishlist catalogue: normal ala-carte plus pure single-unit packs
   * (8 Hot Wings, 4 Tenders, 10pc chicken, …).
   *
   * Those packs are the same SKUs Mode 1 uses as a one-line ala-carte breakdown.
   * Multi-kind meals (burger + wings + fries) stay Mode 1 only.
   * Promo multi-buys priced “for £X” are excluded — often API-only / hard to find in app browse.
   */
  getSelectableMenuItems(
    locationTierId: string = 'standard',
    options?: MenuQueryOptions
  ): MenuItem[] {
    const raw = this.getItems(locationTierId, options).filter((item) => {
      // Campaign multi-buys (e.g. “20 Hot Wings for £7.99”) — not everyday street packs
      if (isCampaignPricedName(item.name)) return false;

      // Meal-builder / POS slot prices (e.g. “Large popcorn chicken choice”)
      const d = (item.description || '').toLowerCase();
      if (/\bcomponents?\b/.test(d) || /\bmeal\s*comp\b/.test(d)) return false;
      if (/\bchoice\b/.test(d) && d.length < 80 && !/your choice of/.test(d)) return false;

      if (!item.isCombo) return true;
      const units = item.atomicUnits;
      if (!units) return false;
      const keys = Object.keys(units);
      // Pure pack size (one unit kind) — selectable even if mis-tagged isCombo
      return keys.length === 1;
    });

    // KFC/POS often emit several lines with the same display name and different
    // objectKeys (street Single vs slot vs alternate channel). Keep one fair street price.
    return dedupeSelectableByName(raw);
  }
}

/**
 * Collapse identical display names for pure single-unit packs.
 * Prefers marketing copy over short POS blurbs; among peers keeps price nearest median
 * (drops obvious under-priced builder slots that slipped past description filters).
 */
function dedupeSelectableByName(items: MenuItem[]): MenuItem[] {
  const pureKey = (item: MenuItem): string | null => {
    const units = item.atomicUnits || {};
    const keys = Object.keys(units);
    if (keys.length !== 1) return null;
    return keys[0];
  };

  const compact = (name: string) => name.toLowerCase().replace(/[^a-z0-9]+/g, '');

  const groups = new Map<string, MenuItem[]>();
  const passthrough: MenuItem[] = [];

  for (const item of items) {
    const uk = pureKey(item);
    if (!uk) {
      passthrough.push(item);
      continue;
    }
    const gkey = `${uk}::${compact(item.name)}`;
    const list = groups.get(gkey) || [];
    list.push(item);
    groups.set(gkey, list);
  }

  const picked: MenuItem[] = [];
  for (const list of groups.values()) {
    if (list.length === 1) {
      picked.push(list[0]);
      continue;
    }
    const prices = list.map((i) => i.price).sort((a, b) => a - b);
    const mid = Math.floor(prices.length / 2);
    const median =
      prices.length % 2 ? prices[mid] : (prices[mid - 1] + prices[mid]) / 2;

    // Prefer rows with real marketing descriptions
    const score = (i: MenuItem) => {
      const d = (i.description || '').trim();
      let s = 0;
      if (d.length >= 40) s += 3;
      else if (d.length >= 15) s += 1;
      if (/\bchoice\b|\bcomponent\b/i.test(d)) s -= 5;
      // Closer to median street price wins
      s -= Math.abs(i.price - median) / Math.max(median, 0.01);
      // Slight preference for higher (true retail over slot undercut)
      s += i.price * 0.001;
      return s;
    };

    list.sort((a, b) => score(b) - score(a));
    picked.push(list[0]);
  }

  // Preserve a stable browse order: original relative order
  const order = new Map(items.map((i, idx) => [i.id, idx]));
  return [...passthrough, ...picked].sort(
    (a, b) => (order.get(a.id) ?? 0) - (order.get(b.id) ?? 0)
  );
}
