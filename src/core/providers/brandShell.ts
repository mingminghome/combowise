import type { FastFoodProvider, StoreLocationTier } from '../types/provider';

const STANDARD_TIER: StoreLocationTier = {
  id: 'standard',
  name: 'Standard',
  description: '',
  priceMultiplier: 1,
};

export type ProviderBrandInput = {
  id: string;
  name: string;
  country: string;
  currencySymbol: string;
  currencyCode: string;
  accentColor: string;
  logoText: string;
  /** Optional; full tiers usually arrive with downloaded menu JSON */
  locationTiers?: StoreLocationTier[];
  daypartConfig?: FastFoodProvider['daypartConfig'];
  /** Brand atomic-unit display names (see docs / unitLabels util) */
  unitLabels?: FastFoodProvider['unitLabels'];
  unitPpiLabels?: FastFoodProvider['unitPpiLabels'];
  /** Free-form UI note (pricing caveats) — shown in Mode 1/2 */
  disclaimer?: string;
};

/**
 * Minimal brand chrome for plugin bootstrap.
 * Never includes catalogue items — those come only from the live menu proxy.
 */
export function createBrandShell(brand: ProviderBrandInput): FastFoodProvider {
  return {
    id: brand.id,
    name: brand.name,
    country: brand.country,
    currencySymbol: brand.currencySymbol,
    currencyCode: brand.currencyCode,
    accentColor: brand.accentColor,
    logoText: brand.logoText,
    locationTiers: brand.locationTiers?.length ? brand.locationTiers : [STANDARD_TIER],
    daypartConfig: brand.daypartConfig,
    unitLabels: brand.unitLabels,
    unitPpiLabels: brand.unitPpiLabels,
    disclaimer: brand.disclaimer,
    items: [],
  };
}
