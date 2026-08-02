import type {
  DaypartConfig,
  FastFoodProvider,
  MenuLoadStrategy,
  StoreLocation,
} from '../types/provider';
import type { BaseMenuNormalizer } from '../normalizers/baseNormalizer';
import type { BaseFastFoodProvider } from './baseProvider';

/**
 * Provider plugin contract.
 *
 * Drop a folder under `src/core/providers/<slug>/` that exports a `plugin`
 * object matching this shape (from `index.ts`). The registry auto-discovers
 * folders via `import.meta.glob` and wires:
 *  - UI provider list
 *  - menu sync + cache
 *  - store directory fetch + cache
 *  - optional daypart / breakfast config
 *
 * Engines use BaseFastFoodProvider only.
 *
 * Menu: docs/MENU_LOADING.md · Dayparts: docs/DAYPART.md
 */
export interface ProviderPlugin {
  /** Must match provider.id */
  id: string;

  /** Ready-to-use provider instance */
  provider: BaseFastFoodProvider;

  /**
   * Brand chrome only (`items: []`). Built via `createBrandShell`.
   * Not an offline menu — catalogue comes from the live proxy only.
   */
  defaultData: FastFoodProvider;

  /**
   * @deprecated Do not embed store lists. Use `storesEndpoint` (live API).
   * Ignored when `storesEndpoint` is set.
   */
  stores?: StoreLocation[];

  /**
   * GET store directory (e.g. `/api/live/kfc_uk/stores`).
   * Required for store-gated chains.
   */
  storesEndpoint?: string;

  /**
   * GET menu URL (e.g. `/api/live/kfc_uk/menu`).
   */
  syncEndpoint?: string;

  /**
   * When to fetch the chain menu JSON.
   * - `fetchOn: 'store'` — download only after a shop is selected
   * - `fetchOn: 'provider'` — download when the chain is chosen
   */
  menuStrategy?: MenuLoadStrategy;

  /**
   * Optional breakfast / daypart UI + defaults.
   * See docs/DAYPART.md
   */
  daypartConfig?: DaypartConfig;

  /** Optional normalizer for remote menu payloads */
  normalizer?: BaseMenuNormalizer;
}

/**
 * Modules discovered by glob may export `plugin` or `default` as ProviderPlugin.
 */
export function extractPlugin(mod: unknown): ProviderPlugin | null {
  if (!mod || typeof mod !== 'object') return null;
  const m = mod as Record<string, unknown>;
  const candidate = (m.plugin ?? m.default) as ProviderPlugin | undefined;
  if (!candidate || typeof candidate !== 'object') return null;
  if (!candidate.id || !candidate.provider || !candidate.defaultData) return null;
  return candidate;
}
