import { BaseFastFoodProvider } from '../baseProvider';
import type { ProviderPlugin } from '../plugin';
import { createBrandShell } from '../brandShell';
import { createPassthroughNormalizer } from '../../normalizers/passthroughNormalizer';
import { menuEndpoint, storesEndpoint } from '../../config/liveEndpoints';

const BK_UK_BRAND = createBrandShell({
  id: 'burger_king_uk',
  name: 'Burger King UK',
  country: 'United Kingdom',
  currencySymbol: '£',
  currencyCode: 'GBP',
  accentColor: '#d62300',
  logoText: 'BK',
  locationTiers: [
    { id: 'standard', name: 'Standard UK Store', description: '', priceMultiplier: 1 },
    { id: 'london_central', name: 'Central London', description: '', priceMultiplier: 1.15 },
    { id: 'highway_travel', name: 'Travel / Airport', description: '', priceMultiplier: 1.25 },
  ],
  unitLabels: {
    sku_burger: 'Burger',
    nugget: 'Chicken Nuggets',
  },
  unitPpiLabels: {
    sku_burger: 'burger',
    nugget: 'nugget',
  },
  disclaimer:
    'Burger King UK Click & Collect prices are indicative and vary by store. Not official app checkout totals.',
});

export class BurgerKingUkProvider extends BaseFastFoodProvider {
  constructor() {
    super(BK_UK_BRAND);
  }
}

export const plugin: ProviderPlugin = {
  id: 'burger_king_uk',
  provider: new BurgerKingUkProvider(),
  defaultData: BK_UK_BRAND,
  syncEndpoint: menuEndpoint('burger_king_uk'),
  storesEndpoint: storesEndpoint('burger_king_uk'),
  menuStrategy: { fetchOn: 'store' },
  normalizer: createPassthroughNormalizer(BK_UK_BRAND),
};

export { BK_UK_BRAND };
