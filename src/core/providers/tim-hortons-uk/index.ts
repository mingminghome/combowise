import { BaseFastFoodProvider } from '../baseProvider';
import type { ProviderPlugin } from '../plugin';
import { createBrandShell } from '../brandShell';
import { createPassthroughNormalizer } from '../../normalizers/passthroughNormalizer';
import { menuEndpoint, storesEndpoint } from '../../config/liveEndpoints';

const TH_UK_BRAND = createBrandShell({
  id: 'tim_hortons_uk',
  name: 'Tim Hortons UK',
  country: 'United Kingdom',
  currencySymbol: '£',
  currencyCode: 'GBP',
  accentColor: '#c8102e',
  logoText: 'TH',
  locationTiers: [
    { id: 'standard', name: 'Standard UK Store', description: '', priceMultiplier: 1 },
    { id: 'london_central', name: 'Central London', description: '', priceMultiplier: 1.15 },
    { id: 'highway_travel', name: 'Travel / Airport', description: '', priceMultiplier: 1.25 },
  ],
  unitLabels: {
    drink_reg: 'Coffee / Drink',
  },
  unitPpiLabels: {
    drink_reg: 'drink',
  },
  disclaimer:
    'Tim Hortons UK prices are indicative. The official site does not always publish per-item pickup prices.',
});

export class TimHortonsUkProvider extends BaseFastFoodProvider {
  constructor() {
    super(TH_UK_BRAND);
  }
}

export const plugin: ProviderPlugin = {
  id: 'tim_hortons_uk',
  provider: new TimHortonsUkProvider(),
  defaultData: TH_UK_BRAND,
  syncEndpoint: menuEndpoint('tim_hortons_uk'),
  storesEndpoint: storesEndpoint('tim_hortons_uk'),
  menuStrategy: { fetchOn: 'store' },
  normalizer: createPassthroughNormalizer(TH_UK_BRAND),
};

export { TH_UK_BRAND };
