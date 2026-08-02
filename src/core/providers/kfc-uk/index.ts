import { BaseFastFoodProvider } from '../baseProvider';
import type { ProviderPlugin } from '../plugin';
import { createBrandShell } from '../brandShell';
import { createPassthroughNormalizer } from '../../normalizers/passthroughNormalizer';
import { menuEndpoint, storesEndpoint } from '../../config/liveEndpoints';

/** Brand only — no catalogue in the client bundle. */
const KFC_UK_BRAND = createBrandShell({
  id: 'kfc_uk',
  name: 'KFC UK',
  country: 'United Kingdom',
  currencySymbol: '£',
  currencyCode: 'GBP',
  accentColor: '#e4002b',
  logoText: 'KFC',
  locationTiers: [
    { id: 'standard', name: 'Standard UK Store', description: '', priceMultiplier: 1 },
    { id: 'london_central', name: 'Central London', description: '', priceMultiplier: 1.15 },
    { id: 'highway_travel', name: 'Travel / Airport', description: '', priceMultiplier: 1.25 },
  ],
  // Brand SKUs for optimizer / PPI (generic wings/drinks live in unitLabels util)
  unitLabels: {
    rice_bowl: 'Rice Bowl',
    chicken_piece: 'Original Recipe Chicken Pieces',
    boneless_tender: 'Boneless Mini Fillets',
    popcorn_chicken: 'Popcorn Chicken',
    zinger_burger: 'Zinger Burger',
    fillet_burger: 'Fillet Burger',
    tower_burger: 'Tower Burger',
    twister_wrap: 'Twister Wrap',
    mini_fillet_burger: 'Mini Fillet Burger',
  },
  unitPpiLabels: {
    rice_bowl: 'bowl',
    chicken_piece: 'pc chicken',
    boneless_tender: 'tender',
    popcorn_chicken: 'portion',
    zinger_burger: 'burger',
    fillet_burger: 'burger',
    tower_burger: 'burger',
    twister_wrap: 'wrap',
    mini_fillet_burger: 'mini burger',
  },
  disclaimer:
    'KFC UK Click & Collect prices are indicative and vary by store. Not official app checkout totals. Descriptions come from the live menu when available.',
});

export class KfcUkProvider extends BaseFastFoodProvider {
  constructor() {
    super(KFC_UK_BRAND);
  }
}

/**
 * Live-only: /api/live/kfc_uk/{menu|stores} (Pages Function / Vite middleware → upstream).
 * See docs/LIVE_MENU_SOURCES.md
 */
export const plugin: ProviderPlugin = {
  id: 'kfc_uk',
  provider: new KfcUkProvider(),
  defaultData: KFC_UK_BRAND,
  syncEndpoint: menuEndpoint('kfc_uk'),
  storesEndpoint: storesEndpoint('kfc_uk'),
  menuStrategy: { fetchOn: 'store' },
  normalizer: createPassthroughNormalizer(KFC_UK_BRAND),
};

export { KFC_UK_BRAND };
