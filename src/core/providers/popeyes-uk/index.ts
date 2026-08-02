import { BaseFastFoodProvider } from '../baseProvider';
import type { ProviderPlugin } from '../plugin';
import { createBrandShell } from '../brandShell';
import { createPassthroughNormalizer } from '../../normalizers/passthroughNormalizer';
import { menuEndpoint, storesEndpoint } from '../../config/liveEndpoints';

/** Brand only — no catalogue in the client bundle. */
const POPEYES_UK_BRAND = createBrandShell({
  id: 'popeyes_uk',
  name: 'Popeyes UK',
  country: 'United Kingdom',
  currencySymbol: '£',
  currencyCode: 'GBP',
  accentColor: '#f15a29',
  logoText: 'POP',
  locationTiers: [
    { id: 'standard', name: 'Standard UK Store', description: '', priceMultiplier: 1 },
    { id: 'london_central', name: 'Central London', description: '', priceMultiplier: 1.15 },
    { id: 'highway_travel', name: 'Travel / Airport', description: '', priceMultiplier: 1.25 },
  ],
  daypartConfig: {
    supported: ['breakfast', 'main'],
    defaultFilter: 'main',
    labels: {
      breakfast: 'Breakfast',
      main: 'All day',
      all: 'Full menu',
    },
    windows: {
      breakfast: { start: '06:00', end: '11:00' },
      main: { start: '11:00', end: '23:59' },
    },
    timezone: 'Europe/London',
  },
  unitLabels: {
    boneless_tender: 'Tenders',
    chicken_sandwich: 'Chicken Sandwich',
    spicy_sandwich: 'Spicy Sandwich',
    biscuit: 'Biscuit',
    classic_sandwich: 'Classic Sandwich',
    chicken_wrap: 'Chicken Wrap',
    side_reg: 'Regular Side',
    beans_reg: 'Smoky Beans',
    nugget: 'Nuggets',
    mac_and_cheese: 'Mac & Cheese',
  },
  unitPpiLabels: {
    boneless_tender: 'tender',
    chicken_sandwich: 'sandwich',
    spicy_sandwich: 'sandwich',
    biscuit: 'biscuit',
    classic_sandwich: 'sandwich',
    chicken_wrap: 'wrap',
    side_reg: 'side',
    beans_reg: 'beans',
    nugget: 'nugget',
    mac_and_cheese: 'mac',
  },
  disclaimer:
    'Popeyes UK Collection prices are indicative and vary by store. Not official app checkout totals. Descriptions come from the live menu when available.',
});

export class PopeyesUkProvider extends BaseFastFoodProvider {
  constructor() {
    super(POPEYES_UK_BRAND);
  }
}

/**
 * Live-only: /api/live/popeyes_uk/{menu|stores}
 * Pages Function → popeyesuk.com ordering API (Collection menu).
 * No bundled catalogue. See docs/LIVE_MENU_SOURCES.md
 */
export const plugin: ProviderPlugin = {
  id: 'popeyes_uk',
  provider: new PopeyesUkProvider(),
  defaultData: POPEYES_UK_BRAND,
  syncEndpoint: menuEndpoint('popeyes_uk'),
  storesEndpoint: storesEndpoint('popeyes_uk'),
  menuStrategy: { fetchOn: 'store' },
  daypartConfig: POPEYES_UK_BRAND.daypartConfig,
  // Function returns ComboWise JSON; passthrough is correct.
  normalizer: createPassthroughNormalizer(POPEYES_UK_BRAND),
};

export { POPEYES_UK_BRAND };
