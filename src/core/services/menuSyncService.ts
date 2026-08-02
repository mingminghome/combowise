import type {
  FastFoodProvider,
  MenuFetchOn,
  MenuLoadErrorCode,
  MenuLoadResult,
  MenuLoadSource,
  MenuLoadStrategy,
} from '../types/provider';
import { BaseMenuNormalizer } from '../normalizers/baseNormalizer';
import { PassthroughNormalizer } from '../normalizers/passthroughNormalizer';
import { StoreSearchService } from './storeSearchService';

const STORAGE_KEY_PREFIX = 'ff_calc_provider_';
const TIMESTAMP_KEY_PREFIX = 'ff_calc_sync_time_';
const META_KEY_PREFIX = 'ff_calc_menu_meta_';

/**
 * Bump when live menu shape / ala-carte resolution rules change so clients
 * discard stale localStorage (wrong OVER/EQUAL from old promo matches).
 */
/** Bump when live menu shape changes — forces re-fetch (dev stub menus lacked breakdowns). */
export const MENU_CACHE_SCHEMA = 10;

/** Default client cache TTL — reuse until stale, then re-fetch on next ensure */
export const MENU_CACHE_TTL_MS = 24 * 60 * 60 * 1000;

/** Abort remote menu fetch after this many ms */
/** Remote menu fetch (Popeyes may enrich combo detail after list load). */
export const MENU_FETCH_TIMEOUT_MS = 25_000;

export interface MenuCacheMeta {
  cachedAt: string;
  source: MenuLoadSource;
  storeId?: string | null;
  menuVersion?: string;
  updatedAt?: string;
  /** Client schema; mismatch → treat as empty and re-fetch */
  schemaVersion?: number;
}

interface ProviderMenuConfig {
  normalizer: BaseMenuNormalizer;
  endpoint?: string;
  fetchOn: MenuFetchOn;
  defaultData: FastFoodProvider;
}

type FetchOutcome =
  | { ok: true; data: unknown }
  | { ok: false; code: MenuLoadErrorCode; httpStatus?: number };

/**
 * Menu download + client cache (memory + localStorage).
 *
 * Online-first (see docs/MENU_LOADING.md):
 * - Source of truth is the live proxy (`/api/live/…`) after shop/provider gate.
 * - Device cache is OK only if it came from a successful network load.
 * - Plugin `defaultData` is brand chrome + export seed — NOT a silent offline catalogue
 *   (outdated bundled prices would mislead users).
 * - Network failure → previous network cache (degraded) or empty menu + error + Retry.
 */
export class MenuSyncService {
  private static syncTimer: number | null = null;
  private static subscribers: Set<() => void> = new Set();

  private static configMap: Map<string, ProviderMenuConfig> = new Map();
  private static memoryCache: Map<string, FastFoodProvider> = new Map();
  private static memoryMeta: Map<string, MenuCacheMeta> = new Map();
  private static inflight: Map<string, Promise<MenuLoadResult>> = new Map();
  /**
   * Bumped on clear so in-flight fetches cannot write menu back after Clear.
   * (Background sync / ensure that started before clear would otherwise re-fill the list.)
   */
  private static loadGeneration: Map<string, number> = new Map();

  static registerProvider(
    providerId: string,
    normalizer: BaseMenuNormalizer,
    endpointUrl?: string,
    defaultData?: FastFoodProvider,
    strategy?: MenuLoadStrategy
  ) {
    const data =
      defaultData ??
      ({
        id: providerId,
        name: providerId,
        country: '',
        currencySymbol: '£',
        currencyCode: 'GBP',
        accentColor: '#7c8cff',
        logoText: '?',
        locationTiers: [{ id: 'standard', name: 'Standard', description: '', priceMultiplier: 1 }],
        items: [],
      } satisfies FastFoodProvider);

    this.configMap.set(providerId, {
      normalizer,
      endpoint: endpointUrl,
      fetchOn: strategy?.fetchOn ?? 'provider',
      defaultData: data,
    });
  }

  static getFetchOn(providerId: string): MenuFetchOn {
    return this.configMap.get(providerId)?.fetchOn ?? 'provider';
  }

  static requiresStoreForMenu(providerId: string): boolean {
    return this.getFetchOn(providerId) === 'store';
  }

  static subscribe(callback: () => void): () => void {
    this.subscribers.add(callback);
    return () => {
      this.subscribers.delete(callback);
    };
  }

  private static notifySubscribers() {
    this.subscribers.forEach((cb) => cb());
  }

  private static getConfig(providerId: string): ProviderMenuConfig {
    const existing = this.configMap.get(providerId);
    if (existing) return existing;
    const data = this.resolveDefaultData(providerId);
    return {
      normalizer: new PassthroughNormalizer(providerId, data.name, data),
      fetchOn: 'provider',
      defaultData: data,
    };
  }

  private static resolveDefaultData(providerId: string): FastFoodProvider {
    const cfg = this.configMap.get(providerId);
    if (cfg?.defaultData) return cfg.defaultData;
    return {
      id: providerId,
      name: providerId,
      country: '',
      currencySymbol: '£',
      currencyCode: 'GBP',
      accentColor: '#7c8cff',
      logoText: '?',
      locationTiers: [{ id: 'standard', name: 'Standard', description: '', priceMultiplier: 1 }],
      items: [],
    };
  }

  /**
   * Brand / tier shell without catalogue items.
   * Used until a network (or non-bundle) menu is loaded — avoids showing stale demo prices.
   */
  static brandShell(providerId: string): FastFoodProvider {
    const base = this.resolveDefaultData(providerId);
    return {
      ...base,
      items: [],
    };
  }

  /**
   * Cache slot for a catalogue download.
   * Store-scoped chains (KFC ClickAndCollect) key by provider + storeId/refid
   * so switching shops does not reuse another store’s prices.
   */
  static cacheKey(providerId: string, storeId?: string | null): string {
    if (storeId) return `${providerId}::${storeId}`;
    return providerId;
  }

  /** Resolve store id for cache/read when callers omit it (selected shop). */
  private static resolveStoreId(
    providerId: string,
    storeId?: string | null
  ): string | null {
    if (storeId !== undefined && storeId !== null) return storeId;
    return StoreSearchService.getSelectedStore(providerId)?.id ?? null;
  }

  private static getGeneration(providerId: string): number {
    return this.loadGeneration.get(providerId) ?? 0;
  }

  private static bumpGeneration(providerId: string): number {
    const next = this.getGeneration(providerId) + 1;
    this.loadGeneration.set(providerId, next);
    return next;
  }

  /** Drop in-flight ensure/sync promises for this provider (all force/soft keys). */
  private static dropInflightForProvider(providerId: string) {
    const prefix = `${this.cacheKey(providerId)}::`;
    for (const k of [...this.inflight.keys()]) {
      if (k === this.cacheKey(providerId) || k.startsWith(prefix) || k.startsWith(`${providerId}::`)) {
        this.inflight.delete(k);
      }
    }
  }

  /** True when meta marks a catalogue that came from the network (or trusted cache of it). */
  private static isTrustedMenuSource(source?: MenuLoadSource | null): boolean {
    return source === 'network' || source === 'cache';
  }

  /**
   * Catalogue for engines/UI.
   * Store-gated chains (`fetchOn: 'store'`): **no shop selected ⇒ always empty items**,
   * even if a previous download is still in memory/localStorage. Cache is only used
   * after a shop is selected again (then soft-hit / revalidate).
   */
  static getProviderMenu(providerId: string): FastFoodProvider {
    const selected = StoreSearchService.getSelectedStore(providerId);
    if (this.requiresStoreForMenu(providerId) && !selected) {
      return this.brandShell(providerId);
    }

    const key = this.cacheKey(providerId, selected?.id ?? null);
    const memMeta = this.memoryMeta.get(key);
    const fromMemory = this.memoryCache.get(key);
    if (
      fromMemory &&
      Array.isArray(fromMemory.items) &&
      fromMemory.items.length > 0 &&
      this.isUsableCacheMeta(memMeta ?? null)
    ) {
      return fromMemory;
    }
    // Drop in-memory entries written before a schema bump
    if (fromMemory && !this.isUsableCacheMeta(memMeta ?? null)) {
      this.memoryCache.delete(key);
      this.memoryMeta.delete(key);
    }

    const fromDisk = this.readDiskMenu(key);
    if (fromDisk) {
      this.memoryCache.set(key, fromDisk);
      if (!this.memoryMeta.has(key)) {
        const diskMeta = this.readDiskMeta(key);
        if (diskMeta) this.memoryMeta.set(key, diskMeta);
      }
      return fromDisk;
    }

    // Online-first: empty catalogue until a successful download
    return this.brandShell(providerId);
  }

  private static purgeDiskKey(key: string) {
    try {
      localStorage.removeItem(`${STORAGE_KEY_PREFIX}${key}`);
      localStorage.removeItem(`${TIMESTAMP_KEY_PREFIX}${key}`);
      localStorage.removeItem(`${META_KEY_PREFIX}${key}`);
    } catch {
      /* ignore */
    }
    this.memoryCache.delete(key);
    this.memoryMeta.delete(key);
  }

  private static isUsableCacheMeta(meta: MenuCacheMeta | null): boolean {
    if (!meta) return false;
    if (meta.source === 'bundle' || !this.isTrustedMenuSource(meta.source)) return false;
    // Old caches pre-schema or wrong generation → force re-download
    if (meta.schemaVersion !== MENU_CACHE_SCHEMA) return false;
    return true;
  }

  private static readDiskMenu(key: string): FastFoodProvider | null {
    try {
      const meta = this.readDiskMeta(key);
      // Drop legacy offline-bundle / untrusted / obsolete-schema caches
      if (!this.isUsableCacheMeta(meta)) {
        if (localStorage.getItem(`${STORAGE_KEY_PREFIX}${key}`)) {
          this.purgeDiskKey(key);
        } else {
          this.memoryCache.delete(key);
          this.memoryMeta.delete(key);
        }
        return null;
      }

      const cached = localStorage.getItem(`${STORAGE_KEY_PREFIX}${key}`);
      if (!cached) return null;
      const parsed = JSON.parse(cached) as FastFoodProvider;
      if (parsed && Array.isArray(parsed.items) && parsed.items.length > 0) {
        return parsed;
      }
    } catch (e) {
      console.warn(`Failed to read cached menu for ${key}:`, e);
    }
    return null;
  }

  private static readDiskMeta(key: string): MenuCacheMeta | null {
    const mem = this.memoryMeta.get(key);
    if (mem) return mem;
    try {
      const raw = localStorage.getItem(`${META_KEY_PREFIX}${key}`);
      if (raw) return JSON.parse(raw) as MenuCacheMeta;
      const ts = localStorage.getItem(`${TIMESTAMP_KEY_PREFIX}${key}`);
      if (ts) return { cachedAt: ts, source: 'cache' };
    } catch {
      /* ignore */
    }
    return null;
  }

  /** Any usable menu in memory/disk (even if TTL expired) for the current scope. */
  static hasAnyCachedMenu(providerId: string): boolean {
    const storeId = this.resolveStoreId(providerId);
    const key = this.cacheKey(providerId, storeId);
    const menu = this.memoryCache.get(key) ?? this.readDiskMenu(key);
    if (menu && menu.items?.length) return true;
    // Also true if any store-scoped cache exists for this provider (Clear / badge)
    try {
      for (let i = 0; i < localStorage.length; i++) {
        const k = localStorage.key(i);
        if (k?.startsWith(`${STORAGE_KEY_PREFIX}${providerId}`)) {
          const raw = localStorage.getItem(k);
          if (raw) {
            const parsed = JSON.parse(raw) as FastFoodProvider;
            if (parsed?.items?.length) return true;
          }
        }
      }
    } catch {
      /* ignore */
    }
    return false;
  }

  static isCacheFresh(providerId: string, storeId?: string | null, ttlMs: number = MENU_CACHE_TTL_MS): boolean {
    const key = this.cacheKey(providerId, storeId);
    const meta = this.readDiskMeta(key);
    if (!meta?.cachedAt) return false;
    const age = Date.now() - new Date(meta.cachedAt).getTime();
    if (Number.isNaN(age) || age < 0) return false;
    return age < ttlMs;
  }

  static hasFreshCache(providerId: string, storeId?: string | null): boolean {
    const key = this.cacheKey(providerId, storeId);
    const meta = this.readDiskMeta(key) ?? this.memoryMeta.get(key) ?? null;
    if (!this.isUsableCacheMeta(meta)) {
      return false;
    }
    const menu = this.memoryCache.get(key) ?? this.readDiskMenu(key);
    if (!menu || !menu.items?.length) return false;
    return this.isCacheFresh(providerId, storeId);
  }

  /**
   * Whether UI should show a loading state for the next ensure call.
   * False on fresh cache (avoids flash).
   */
  static willNetworkFetch(
    providerId: string,
    options: { storeId?: string | null; forceRefresh?: boolean } = {}
  ): boolean {
    const cfg = this.getConfig(providerId);
    const selected = StoreSearchService.getSelectedStore(providerId);
    const storeId =
      options.storeId !== undefined ? options.storeId : selected?.id ?? null;

    if (cfg.fetchOn === 'store' && !storeId) return false;
    if (options.forceRefresh) return !!cfg.endpoint;
    if (this.hasFreshCache(providerId, storeId)) return false;
    return !!cfg.endpoint;
  }

  private static menuDates(menu: FastFoodProvider, meta?: MenuCacheMeta | null) {
    return {
      updatedAt: menu.updatedAt
        ? new Date(menu.updatedAt)
        : meta?.updatedAt
          ? new Date(meta.updatedAt)
          : null,
      cachedAt: meta?.cachedAt ? new Date(meta.cachedAt) : null,
    };
  }

  private static resultFromMenu(
    menu: FastFoodProvider,
    partial: Omit<MenuLoadResult, 'menu' | 'updatedAt' | 'cachedAt'> & {
      cachedAt?: Date | null;
      updatedAt?: Date | null;
    },
    meta?: MenuCacheMeta | null
  ): MenuLoadResult {
    const dates = this.menuDates(menu, meta);
    return {
      menu,
      cachedAt: partial.cachedAt !== undefined ? partial.cachedAt : dates.cachedAt,
      updatedAt: partial.updatedAt !== undefined ? partial.updatedAt : dates.updatedAt,
      source: partial.source,
      status: partial.status,
      fromNetwork: partial.fromNetwork,
      attemptedNetwork: partial.attemptedNetwork,
      errorCode: partial.errorCode,
      message: partial.message,
    };
  }

  static async ensureMenuLoaded(
    providerId: string,
    options: {
      storeId?: string | null;
      forceRefresh?: boolean;
      ttlMs?: number;
    } = {}
  ): Promise<MenuLoadResult> {
    const cfg = this.getConfig(providerId);
    const selected = StoreSearchService.getSelectedStore(providerId);
    const storeId =
      options.storeId !== undefined ? options.storeId : selected?.id ?? null;

    if (cfg.fetchOn === 'store' && !storeId) {
      const shell = this.brandShell(providerId);
      return this.resultFromMenu(shell, {
        source: 'bundle',
        status: 'ok',
        fromNetwork: false,
        attemptedNetwork: false,
        errorCode: 'need_store',
        message: 'Select a store to load shop menu & prices',
        cachedAt: null,
      });
    }

    const key = this.cacheKey(providerId, storeId);
    const inflightKey = `${key}::${options.forceRefresh ? 'force' : 'soft'}`;
    const existing = this.inflight.get(inflightKey);
    if (existing) return existing;

    const run = this.runEnsure(providerId, storeId, key, options.forceRefresh === true);
    this.inflight.set(inflightKey, run);
    try {
      return await run;
    } finally {
      this.inflight.delete(inflightKey);
    }
  }

  private static async runEnsure(
    providerId: string,
    storeId: string | null,
    key: string,
    forceRefresh: boolean
  ): Promise<MenuLoadResult> {
    if (!forceRefresh && this.hasFreshCache(providerId, storeId)) {
      const menu = this.memoryCache.get(key) ?? this.readDiskMenu(key);
      if (!menu?.items?.length) {
        return this.syncProviderMenu(providerId, { storeId, forceRefresh });
      }
      if (!this.memoryCache.has(key)) this.memoryCache.set(key, menu);
      const meta = this.readDiskMeta(key);
      return this.resultFromMenu(
        menu,
        {
          source: 'cache',
          status: 'ok',
          fromNetwork: false,
          attemptedNetwork: false,
          message: 'Loaded from last download',
        },
        meta
      );
    }

    return this.syncProviderMenu(providerId, { storeId, forceRefresh });
  }

  static async syncProviderMenu(
    providerId: string,
    options: { storeId?: string | null; forceRefresh?: boolean } = {}
  ): Promise<MenuLoadResult> {
    const cfg = this.getConfig(providerId);
    const selected = StoreSearchService.getSelectedStore(providerId);
    const storeId =
      options.storeId !== undefined ? options.storeId : selected?.id ?? null;
    const genAtStart = this.getGeneration(providerId);

    if (cfg.fetchOn === 'store' && !storeId) {
      const shell = this.brandShell(providerId);
      return this.resultFromMenu(shell, {
        source: 'bundle',
        status: 'ok',
        fromNetwork: false,
        attemptedNetwork: false,
        errorCode: 'need_store',
        message: 'Select a store to sync shop menu',
        cachedAt: null,
      });
    }

    const key = this.cacheKey(providerId, storeId);
    const normalizer = cfg.normalizer;
    const urls = this.resolveFetchUrls(cfg, storeId);

    const isStaleGeneration = () => this.getGeneration(providerId) !== genAtStart;

    if (urls.length === 0) {
      // No syncEndpoint — cannot load a catalogue in online-first mode
      return this.resultFromMenu(this.brandShell(providerId), {
        source: 'bundle',
        status: 'error',
        fromNetwork: false,
        attemptedNetwork: false,
        errorCode: 'empty',
        message: 'No syncEndpoint configured — menu cannot load',
      });
    }

    let lastError: MenuLoadErrorCode = 'network';
    let rawPayload: unknown = null;
    let fetched = false;

    for (const url of urls) {
      if (isStaleGeneration()) break;
      const outcome = await this.fetchJson(url, options.forceRefresh === true);
      if (outcome.ok) {
        rawPayload = outcome.data;
        fetched = true;
        break;
      }
      lastError = outcome.code;
    }

    // Clear / new generation won — do not write menu back
    if (isStaleGeneration()) {
      return this.resultFromMenu(this.brandShell(providerId), {
        source: 'bundle',
        status: 'ok',
        fromNetwork: false,
        attemptedNetwork: true,
        errorCode: 'need_store',
        message: 'Select a store to load shop menu & prices',
        cachedAt: null,
      });
    }

    if (fetched) {
      const normalized = normalizer.normalize(rawPayload);
      if (!normalized.items?.length) {
        const stale = this.memoryCache.get(key) ?? this.readDiskMenu(key);
        const meta = this.readDiskMeta(key);
        if (stale?.items?.length && this.isTrustedMenuSource(meta?.source)) {
          return this.resultFromMenu(
            stale,
            {
              source: 'cache',
              status: 'degraded',
              fromNetwork: false,
              attemptedNetwork: true,
              errorCode: 'empty',
              message: 'Remote menu was empty — keeping previous download. Retry?',
            },
            meta
          );
        }
        const shell = this.brandShell(providerId);
        return this.resultFromMenu(shell, {
          source: 'bundle',
          status: 'error',
          fromNetwork: false,
          attemptedNetwork: true,
          errorCode: 'empty',
          message: 'Remote menu was empty — no usable prices. Retry?',
        });
      }

      this.saveToCache(key, normalized, { source: 'network', storeId });
      return this.resultFromMenu(normalized, {
        source: 'network',
        status: 'ok',
        fromNetwork: true,
        attemptedNetwork: true,
        message: 'Menu loaded from snapshot',
      });
    }

    // Network failed — trusted device cache only (never bundled catalogue)
    return this.degradedFallback(providerId, key, lastError);
  }

  private static degradedFallback(
    providerId: string,
    key: string,
    errorCode: MenuLoadErrorCode
  ): MenuLoadResult {
    const reason =
      errorCode === 'timeout'
        ? 'Menu request timed out'
        : errorCode === 'http'
          ? 'Menu server returned an error'
          : errorCode === 'parse'
            ? 'Menu data could not be read'
            : 'Could not reach menu';

    const meta = this.readDiskMeta(key);
    const stale = this.memoryCache.get(key) ?? this.readDiskMenu(key);
    if (stale?.items?.length && this.isTrustedMenuSource(meta?.source ?? this.memoryMeta.get(key)?.source)) {
      return this.resultFromMenu(
        stale,
        {
          source: 'cache',
          status: 'degraded',
          fromNetwork: false,
          attemptedNetwork: true,
          errorCode,
          message: `${reason} — showing last downloaded prices (may be outdated). Retry?`,
        },
        meta
      );
    }

    console.info(`Remote sync for ${providerId} failed (${errorCode}); no trusted cache.`);
    const shell = this.brandShell(providerId);
    return this.resultFromMenu(shell, {
      source: 'bundle',
      status: 'error',
      fromNetwork: false,
      attemptedNetwork: true,
      errorCode,
      message: `${reason} — menu unavailable. Connect and Retry (we do not show offline demo prices).`,
    });
  }

  private static async fetchJson(url: string, forceRefresh: boolean): Promise<FetchOutcome> {
    const controller = new AbortController();
    const timer = window.setTimeout(() => controller.abort(), MENU_FETCH_TIMEOUT_MS);

    try {
      const response = await fetch(url, {
        method: 'GET',
        headers: { Accept: 'application/json' },
        cache: forceRefresh ? 'no-store' : 'default',
        signal: controller.signal,
      });

      if (!response.ok) {
        return { ok: false, code: 'http', httpStatus: response.status };
      }

      try {
        const data = await response.json();
        return { ok: true, data };
      } catch {
        return { ok: false, code: 'parse' };
      }
    } catch (e) {
      const name = e instanceof Error ? e.name : '';
      if (name === 'AbortError') {
        return { ok: false, code: 'timeout' };
      }
      return { ok: false, code: 'network' };
    } finally {
      window.clearTimeout(timer);
    }
  }

  /** Append storeId for live proxies that need shop-scoped menus. */
  private static resolveFetchUrls(cfg: ProviderMenuConfig, storeId: string | null): string[] {
    if (!cfg.endpoint) return [];
    let url = cfg.endpoint;
    if (storeId) {
      const sep = url.includes('?') ? '&' : '?';
      url = `${url}${sep}storeId=${encodeURIComponent(storeId)}`;
    }
    return [url];
  }

  private static saveToCache(
    key: string,
    providerData: FastFoodProvider,
    opts: { source: MenuLoadSource; storeId?: string | null }
  ) {
    const meta: MenuCacheMeta = {
      cachedAt: new Date().toISOString(),
      source: opts.source,
      storeId: opts.storeId ?? null,
      menuVersion: providerData.menuVersion,
      updatedAt: providerData.updatedAt,
      schemaVersion: MENU_CACHE_SCHEMA,
    };

    this.memoryCache.set(key, providerData);
    this.memoryMeta.set(key, meta);

    try {
      localStorage.setItem(`${STORAGE_KEY_PREFIX}${key}`, JSON.stringify(providerData));
      localStorage.setItem(`${TIMESTAMP_KEY_PREFIX}${key}`, meta.cachedAt);
      localStorage.setItem(`${META_KEY_PREFIX}${key}`, JSON.stringify(meta));
    } catch (e) {
      console.warn('Failed to save menu to localStorage:', e);
    }

    this.notifySubscribers();
  }

  static getLastSyncedAt(providerId: string, storeId?: string | null): Date | null {
    const sid = this.resolveStoreId(providerId, storeId);
    const meta = this.readDiskMeta(this.cacheKey(providerId, sid));
    if (!meta?.cachedAt) return null;
    const d = new Date(meta.cachedAt);
    return Number.isNaN(d.getTime()) ? null : d;
  }

  static getCacheMeta(providerId: string, storeId?: string | null): MenuCacheMeta | null {
    const sid = this.resolveStoreId(providerId, storeId);
    return this.readDiskMeta(this.cacheKey(providerId, sid));
  }

  static hasCachedMenu(providerId: string): boolean {
    return this.hasAnyCachedMenu(providerId);
  }

  static clearCachedMenu(providerId: string) {
    // Invalidate in-flight downloads first so they cannot re-populate after Clear
    this.stopBackgroundSync();
    this.bumpGeneration(providerId);
    this.dropInflightForProvider(providerId);

    // Drop all memory slots for this provider (provider-only + every store refid)
    for (const k of [...this.memoryCache.keys()]) {
      if (k === providerId || k.startsWith(`${providerId}::`)) {
        this.memoryCache.delete(k);
        this.memoryMeta.delete(k);
      }
    }

    try {
      const lsKeys: string[] = [];
      for (let i = 0; i < localStorage.length; i++) {
        const k = localStorage.key(i);
        if (
          k &&
          (k.startsWith(`${STORAGE_KEY_PREFIX}${providerId}`) ||
            k.startsWith(`${TIMESTAMP_KEY_PREFIX}${providerId}`) ||
            k.startsWith(`${META_KEY_PREFIX}${providerId}`))
        ) {
          lsKeys.push(k);
        }
      }
      lsKeys.forEach((k) => localStorage.removeItem(k));
    } catch (e) {
      console.warn(`Failed to clear menu cache for ${providerId}:`, e);
    }

    this.notifySubscribers();
  }

  static startBackgroundSync(providerId: string, intervalMs: number = 15 * 60 * 1000) {
    this.stopBackgroundSync();

    // Store-gated chains: never auto-download without a shop (avoids refill after Clear)
    if (this.requiresStoreForMenu(providerId) && !StoreSearchService.getSelectedStore(providerId)) {
      return;
    }

    const tick = () => {
      if (this.requiresStoreForMenu(providerId) && !StoreSearchService.getSelectedStore(providerId)) {
        return;
      }
      void this.syncProviderMenu(providerId);
    };

    // Soft revalidate only when a store (or provider-level) scope is valid
    void this.ensureMenuLoaded(providerId);
    this.syncTimer = window.setInterval(tick, intervalMs);
  }

  static stopBackgroundSync() {
    if (this.syncTimer) {
      clearInterval(this.syncTimer);
      this.syncTimer = null;
    }
  }
}
