import { BaseFastFoodProvider } from '../baseProvider';
import type { ProviderPlugin } from '../plugin';
import { createBrandShell } from '../brandShell';
import { createPassthroughNormalizer } from '../../normalizers/passthroughNormalizer';
import { menuEndpoint, storesEndpoint } from '../../config/liveEndpoints';

const MCD_UK_BRAND = createBrandShell({
  id: 'mcdonalds_uk',
  name: "McDonald's UK",
  country: 'United Kingdom',
  currencySymbol: '£',
  currencyCode: 'GBP',
  accentColor: '#ffc72c',
  logoText: 'McD',
  locationTiers: [
    { id: 'standard', name: 'Standard UK Store', description: '', priceMultiplier: 1 },
    { id: 'london_central', name: 'Central London', description: '', priceMultiplier: 1.15 },
    { id: 'highway_travel', name: 'Travel / Airport', description: '', priceMultiplier: 1.25 },
  ],
  unitLabels: {
    nugget: 'Chicken McNuggets',
    sku_burger: 'Burger',
  },
  unitPpiLabels: {
    nugget: 'nugget',
    sku_burger: 'burger',
  },
  disclaimer:
    "McDonald's UK prices are indicative and vary by store. Not official app checkout totals.",
});

export class McdonaldsUkProvider extends BaseFastFoodProvider {
  constructor() {
    super(MCD_UK_BRAND);
  }
}

export const plugin: ProviderPlugin = {
  id: 'mcdonalds_uk',
  provider: new McdonaldsUkProvider(),
  defaultData: MCD_UK_BRAND,
  syncEndpoint: menuEndpoint('mcdonalds_uk'),
  storesEndpoint: storesEndpoint('mcdonalds_uk'),
  menuStrategy: { fetchOn: 'provider' },
  normalizer: createPassthroughNormalizer(MCD_UK_BRAND),
};

export { MCD_UK_BRAND };
