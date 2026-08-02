/**
 * Well-known categories used across chains (UI labels + normalizer defaults).
 * Hosted menus may use additional string ids; Mode 2 builds pills from the loaded menu.
 * See docs/MENU_CATEGORIES.md
 */
export type KnownMenuItemCategory =
  | 'box_meals'
  | 'meals'
  | 'buckets'
  | 'burgers'
  | 'chicken'
  | 'sides'
  | 'drinks'
  | 'desserts'
  | 'dips'
  | 'kids';

/**
 * Category on a menu item: known id or any provider-specific string
 * (e.g. `bowls`, `noodles`, `alcohol`) so unknown groups still get a Mode 2 tab.
 */
export type MenuItemCategory = KnownMenuItemCategory | (string & {});

/**
 * Service daypart for an item (breakfast vs all-day chicken, etc.).
 * - omit / `main` — standard daytime catalogue (default)
 * - `breakfast` — morning-only
 * - `evening` — late / dinner-only (optional)
 * - `all_day` — shared across dayparts (drinks, dips, some sides)
 */
export type MenuDaypart = 'all_day' | 'breakfast' | 'main' | 'evening';

/** UI / query filter: a concrete daypart or entire menu */
export type DaypartFilter = MenuDaypart | 'all';

/**
 * Optional per-chain daypart setup. Plugins set this when they use dayparts;
 * omit entirely if the chain is single-menu (KFC today).
 */
export interface DaypartConfig {
  /** Dayparts shown in the UI (e.g. `['breakfast', 'main']`). Auto-detected from items if omitted. */
  supported?: MenuDaypart[];
  /** Initial filter when the chain has dayparts (default: `main` or `all`) */
  defaultFilter?: DaypartFilter;
  /** Custom chip labels */
  labels?: Partial<Record<MenuDaypart | 'all', string>>;
  /**
   * Optional local-time windows (HH:mm, 24h) for future auto-suggest.
   * Not required for filtering to work.
   */
  windows?: Partial<Record<Exclude<MenuDaypart, 'all_day'>, { start: string; end: string }>>;
  /** IANA timezone for windows, e.g. `Europe/London` */
  timezone?: string;
}

export interface ComboComponent {
  itemId: string;
  name: string;
  count: number;
  category: 'main' | 'side' | 'drink' | 'extra';
}

export interface MenuItem {
  id: string;
  name: string;
  category: MenuItemCategory;
  price: number; // Base price in GBP
  description?: string;
  imageUrl?: string;
  isCombo?: boolean;
  isAppExclusive?: boolean; // True if available only via KFC App / Rewards
  /**
   * When this item is typically sold. Omit = `main` (standard catalogue).
   * Use `all_day` for items shared across breakfast + main (e.g. drinks).
   */
  daypart?: MenuDaypart;
  components?: ComboComponent[]; // Component breakdown if it's a combo
  equivalentAlaCarteIds?: string[]; // IDs of standalone items mapped to this combo
  atomicUnits?: Record<string, number>; // Normalized component units (e.g., { hot_wing: 10 })
}

export interface RewardCoupon {
  id: string;
  title: string;
  description: string;
  discountType: 'percentage' | 'fixed_amount' | 'free_item';
  discountValue: number; // e.g. 50 for 50%, 2.00 for £2.00 off
  applicableCategory?: MenuItemCategory;
  applicableItemId?: string;
  minSpend?: number;
  isApplied: boolean;
}

export interface StoreLocationTier {
  id: string;
  name: string;
  description: string;
  priceMultiplier: number;
}

export interface StoreLocation {
  id: string;
  name: string;
  address: string;
  city: string;
  postcode: string;
  latitude?: number;
  longitude?: number;
  distanceMiles?: number;
  tierId: string; // 'standard' | 'london_central' | 'highway_travel'
  isAppMenuAvailable: boolean;
  appExclusiveItems?: MenuItem[];
}

export interface FastFoodProvider {
  id: string;
  name: string;
  country: string;
  currencySymbol: string;
  currencyCode: string;
  accentColor: string;
  logoText: string;
  locationTiers: StoreLocationTier[];
  stores?: StoreLocation[];
  items: MenuItem[];
  /** ISO timestamp when this snapshot was published (optional, for UI / cache) */
  updatedAt?: string;
  /** Bump when menu schema or content generation changes */
  menuVersion?: string;
  /** Optional daypart / breakfast config — see docs/DAYPART.md */
  daypartConfig?: DaypartConfig;
  /**
   * Brand-specific atomic unit display names (optimizer "covers" lines).
   * Generic keys (hot_wing, drink_reg, …) can rely on shared defaults;
   * chain SKUs (zinger_burger, chicken_sandwich, …) belong here.
   */
  unitLabels?: Record<string, string>;
  /** Optional short labels for PPI badges (e.g. zinger_burger → "burger") */
  unitPpiLabels?: Record<string, string>;
  /**
   * Free-form brand / menu note for UI (pricing caveats, how to read the menu).
   * Set on the brand shell and/or live menu JSON — not hardcoded in Mode 1/2.
   */
  disclaimer?: string;
}

/** Options for provider menu reads */
export interface MenuQueryOptions {
  /** Filter by service daypart; omit or `all` = no daypart filter */
  daypart?: DaypartFilter;
}

/**
 * When to download a remote menu snapshot (official-app style).
 * - `provider`: fetch after the chain is chosen
 * - `store`: fetch only after a shop is selected (gate only — menu is still chain-level JSON)
 *
 * Per-store menu files are not used. Shop selection applies that store's
 * `tierId` price multiplier on the shared chain snapshot.
 */
export type MenuFetchOn = 'provider' | 'store';

export interface MenuLoadStrategy {
  /**
   * When remote menu download is allowed / required.
   * Default: `provider` if omitted.
   */
  fetchOn?: MenuFetchOn;
}

/**
 * Result of ensureMenuLoaded — used for loading gates and status UI.
 */
export type MenuLoadSource = 'network' | 'cache' | 'bundle';

/** Outcome for banner: ok vs soft failure vs hard empty/error */
export type MenuLoadStatus = 'ok' | 'degraded' | 'error';

export type MenuLoadErrorCode =
  | 'timeout'
  | 'network'
  | 'http'
  | 'empty'
  | 'parse'
  | 'offline'
  | 'need_store';

export interface MenuLoadResult {
  menu: FastFoodProvider;
  source: MenuLoadSource;
  status: MenuLoadStatus;
  /** Cache / sync timestamp on device */
  cachedAt: Date | null;
  /** Snapshot publish time from JSON if present */
  updatedAt: Date | null;
  /** True when returned data came from a fresh network fetch */
  fromNetwork: boolean;
  /** True when this call attempted (or would attempt) the network */
  attemptedNetwork?: boolean;
  errorCode?: MenuLoadErrorCode;
  /** Human-readable note (e.g. store required, offline fallback) */
  message?: string;
}

/** UI phase for toolbar / main shell */
export type MenuUiPhase = 'need_store' | 'loading' | 'ready' | 'degraded' | 'error';
