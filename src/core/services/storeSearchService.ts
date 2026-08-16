import type { StoreLocation } from '../types/provider';
import { PostcodeService } from './postcodeService';

const SELECTED_STORE_KEY_PREFIX = 'ff_calc_selected_store_';
const STORES_CACHE_KEY_PREFIX = 'ff_calc_stores_';
const STORES_META_KEY_PREFIX = 'ff_calc_stores_meta_';

/** Store list cache TTL (same ballpark as menus) */
export const STORES_CACHE_TTL_MS = 24 * 60 * 60 * 1000;
/** KFC restaurants/all can be large; keep generous for Free Tier + mobile */
export const STORES_FETCH_TIMEOUT_MS = 25_000;

interface StoresCacheMeta {
  cachedAt: string;
  source: 'network' | 'cache';
}

interface ProviderStoresConfig {
  endpoint?: string;
}

/**
 * Store directory: online-first like menus.
 * - List comes from GET /stores/{chain}.json (or plugin endpoint)
 * - Cached after successful download
 * - Empty until loaded (no silent bundled demo directory when endpoint is set)
 * - Selected shop is separate (localStorage per provider)
 */
export class StoreSearchService {
  private static configMap: Map<string, ProviderStoresConfig> = new Map();
  private static memoryStores: Map<string, StoreLocation[]> = new Map();
  private static memoryMeta: Map<string, StoresCacheMeta> = new Map();
  private static loadGeneration: Map<string, number> = new Map();
  private static inflight: Map<string, Promise<StoreLocation[]>> = new Map();
  private static subscribers: Set<() => void> = new Set();
  private static lastError: Map<string, string> = new Map();

  static subscribe(callback: () => void): () => void {
    this.subscribers.add(callback);
    return () => {
      this.subscribers.delete(callback);
    };
  }

  private static notify() {
    this.subscribers.forEach((cb) => cb());
  }

  /**
   * Register optional remote store list endpoint.
   * Do not pass a large bundled list as the live directory when endpoint is set.
   */
  static registerProvider(providerId: string, options?: { storesEndpoint?: string; seedStores?: StoreLocation[] }) {
    this.configMap.set(providerId, {
      endpoint: options?.storesEndpoint,
    });
    // Seed only when there is no endpoint (local/test plugins)
    if (!options?.storesEndpoint && options?.seedStores && options.seedStores.length > 0) {
      this.memoryStores.set(providerId, options.seedStores);
      this.memoryMeta.set(providerId, {
        cachedAt: new Date().toISOString(),
        source: 'network',
      });
    }
  }

  /** @deprecated use registerProvider — kept for brief compatibility */
  static registerProviderStores(providerId: string, stores: StoreLocation[]) {
    this.registerProvider(providerId, { seedStores: stores });
  }

  static getStoresForProvider(providerId: string): StoreLocation[] {
    const mem = this.memoryStores.get(providerId);
    if (mem && mem.length > 0) return mem;

    const fromDisk = this.readDiskStores(providerId);
    if (fromDisk) {
      this.memoryStores.set(providerId, fromDisk);
      return fromDisk;
    }
    return [];
  }

  static hasStores(providerId: string): boolean {
    return this.getStoresForProvider(providerId).length > 0;
  }

  static getLastError(providerId: string): string | null {
    return this.lastError.get(providerId) || null;
  }

  static hasFreshStoresCache(providerId: string): boolean {
    const meta = this.readMeta(providerId);
    if (!meta?.cachedAt) return false;
    const stores = this.getStoresForProvider(providerId);
    if (!stores.length) return false;
    const age = Date.now() - new Date(meta.cachedAt).getTime();
    return !Number.isNaN(age) && age >= 0 && age < STORES_CACHE_TTL_MS;
  }

  /**
   * Ensure store directory is loaded (call when chain is selected / store picker opens).
   */
  static async ensureStoresLoaded(
    providerId: string,
    options: { forceRefresh?: boolean } = {}
  ): Promise<StoreLocation[]> {
    if (!options.forceRefresh && this.hasFreshStoresCache(providerId)) {
      return this.getStoresForProvider(providerId);
    }

    const existing = this.inflight.get(providerId);
    if (existing) return existing;

    const run = this.fetchStores(providerId, { forceRefresh: options.forceRefresh === true });
    this.inflight.set(providerId, run);
    try {
      return await run;
    } finally {
      this.inflight.delete(providerId);
    }
  }

  private static storesUrl(
    endpoint: string,
    extra?: { q?: string; lat?: number; lng?: number }
  ): string {
    const u = new URL(endpoint, typeof window !== 'undefined' ? window.location.origin : 'http://localhost');
    if (extra?.q) u.searchParams.set('q', extra.q);
    if (extra?.lat != null && extra?.lng != null && Number.isFinite(extra.lat) && Number.isFinite(extra.lng)) {
      u.searchParams.set('lat', String(extra.lat));
      u.searchParams.set('lng', String(extra.lng));
    }
    return `${u.pathname}${u.search}`;
  }

  private static mergeStores(providerId: string, incoming: StoreLocation[]): StoreLocation[] {
    const existing = this.getStoresForProvider(providerId);
    const byId = new Map<string, StoreLocation>();
    for (const s of existing) byId.set(s.id, s);
    for (const s of incoming) byId.set(s.id, s);
    const merged = [...byId.values()];
    this.saveStoresCache(providerId, merged);
    return merged;
  }

  private static async fetchStores(
    providerId: string,
    options: {
      forceRefresh?: boolean;
      q?: string;
      lat?: number;
      lng?: number;
      merge?: boolean;
    } = {}
  ): Promise<StoreLocation[]> {
    const cfg = this.configMap.get(providerId);
    const endpoint = cfg?.endpoint;
    const gen = this.loadGeneration.get(providerId) ?? 0;
    const queried = Boolean(options.q || (options.lat != null && options.lng != null));

    if (!endpoint) {
      return this.getStoresForProvider(providerId);
    }

    const controller = new AbortController();
    const timer = window.setTimeout(() => controller.abort(), STORES_FETCH_TIMEOUT_MS);

    try {
      const response = await fetch(this.storesUrl(endpoint, options), {
        method: 'GET',
        headers: { Accept: 'application/json' },
        cache: options.forceRefresh || queried ? 'no-store' : 'default',
        signal: controller.signal,
      });

      if ((this.loadGeneration.get(providerId) ?? 0) !== gen) {
        return this.getStoresForProvider(providerId);
      }

      if (!response.ok) {
        let detail = `HTTP ${response.status}`;
        try {
          const err = (await response.json()) as { message?: string; error?: string };
          if (err?.message) detail = err.message;
          else if (err?.error) detail = String(err.error);
        } catch {
          /* body is not JSON */
        }
        this.lastError.set(providerId, detail);
        console.info(`Store list fetch failed for ${providerId}: ${detail}`);
        return this.getStoresForProvider(providerId);
      }

      const raw = await response.json();
      const stores = this.normalizeStoresPayload(raw);
      if (stores.length === 0) {
        if (!queried) this.lastError.set(providerId, 'Store directory was empty');
        return this.getStoresForProvider(providerId);
      }

      if ((this.loadGeneration.get(providerId) ?? 0) !== gen) {
        return this.getStoresForProvider(providerId);
      }

      this.lastError.delete(providerId);
      if (options.merge) return this.mergeStores(providerId, stores);
      this.saveStoresCache(providerId, stores);
      return stores;
    } catch (e) {
      const name = e instanceof Error ? e.name : '';
      const msg =
        name === 'AbortError'
          ? 'Store directory timed out'
          : e instanceof Error
            ? e.message
            : 'Store directory unavailable';
      this.lastError.set(providerId, msg);
      console.info(
        `Store list fetch unavailable for ${providerId}${name === 'AbortError' ? ' (timeout)' : ''}`
      );
      return this.getStoresForProvider(providerId);
    } finally {
      window.clearTimeout(timer);
    }
  }

  private static normalizeStoresPayload(raw: unknown): StoreLocation[] {
    if (Array.isArray(raw)) {
      return raw.filter((s) => s && typeof s === 'object' && typeof (s as StoreLocation).id === 'string') as StoreLocation[];
    }
    if (raw && typeof raw === 'object' && Array.isArray((raw as { stores?: unknown }).stores)) {
      return this.normalizeStoresPayload((raw as { stores: unknown }).stores);
    }
    return [];
  }

  private static saveStoresCache(providerId: string, stores: StoreLocation[]) {
    const meta: StoresCacheMeta = {
      cachedAt: new Date().toISOString(),
      source: 'network',
    };
    this.memoryStores.set(providerId, stores);
    this.memoryMeta.set(providerId, meta);
    try {
      localStorage.setItem(`${STORES_CACHE_KEY_PREFIX}${providerId}`, JSON.stringify(stores));
      localStorage.setItem(`${STORES_META_KEY_PREFIX}${providerId}`, JSON.stringify(meta));
    } catch (e) {
      console.warn('Failed to cache store list:', e);
    }
    this.notify();
  }

  private static readDiskStores(providerId: string): StoreLocation[] | null {
    try {
      const raw = localStorage.getItem(`${STORES_CACHE_KEY_PREFIX}${providerId}`);
      if (!raw) return null;
      const parsed = JSON.parse(raw) as StoreLocation[];
      if (Array.isArray(parsed) && parsed.length > 0) {
        const metaRaw = localStorage.getItem(`${STORES_META_KEY_PREFIX}${providerId}`);
        if (metaRaw) {
          this.memoryMeta.set(providerId, JSON.parse(metaRaw) as StoresCacheMeta);
        }
        return parsed;
      }
    } catch (e) {
      console.warn(`Failed to read store cache for ${providerId}:`, e);
    }
    return null;
  }

  private static readMeta(providerId: string): StoresCacheMeta | null {
    const mem = this.memoryMeta.get(providerId);
    if (mem) return mem;
    try {
      const raw = localStorage.getItem(`${STORES_META_KEY_PREFIX}${providerId}`);
      if (raw) return JSON.parse(raw) as StoresCacheMeta;
    } catch {
      /* ignore */
    }
    return null;
  }

  static clearStoresCache(providerId: string) {
    const next = (this.loadGeneration.get(providerId) ?? 0) + 1;
    this.loadGeneration.set(providerId, next);
    this.memoryStores.delete(providerId);
    this.memoryMeta.delete(providerId);
    try {
      localStorage.removeItem(`${STORES_CACHE_KEY_PREFIX}${providerId}`);
      localStorage.removeItem(`${STORES_META_KEY_PREFIX}${providerId}`);
    } catch {
      /* ignore */
    }
    this.notify();
  }

  private static storeSearchBlob(s: StoreLocation): string {
    return [s.id, s.name, s.city, s.postcode, s.address]
      .map((x) => String(x ?? '').toLowerCase().replace(/\s+/g, ''))
      .join(' ');
  }

  static searchStoresLocal(query: string, providerId: string): StoreLocation[] {
    const stores = this.getStoresForProvider(providerId);
    if (!query || query.trim() === '') {
      return stores;
    }

    const cleanedQ = query.replace(/\s+/g, '').toLowerCase();
    if (!cleanedQ) return stores;

    return stores.filter((s) => this.storeSearchBlob(s).includes(cleanedQ));
  }

  static async searchStoresAsync(query: string, providerId: string): Promise<StoreLocation[]> {
    await this.ensureStoresLoaded(providerId);
    let stores = this.getStoresForProvider(providerId);

    const rawQ = (query || '').trim();
    const localHits = rawQ ? this.searchStoresLocal(rawQ, providerId) : stores;
    const postal = rawQ ? PostcodeService.isPostalQuery(rawQ) : false;

    // Postcode-based chains (McD / TH / BK via Just Eat) need ?q= — a hub
    // seed will not include WA15. Also refetch when the local filter is empty.
    if (rawQ && (postal || localHits.length === 0)) {
      const remote = await this.fetchStores(providerId, { q: rawQ, merge: true });
      if (remote.length) stores = remote;
      else stores = this.getStoresForProvider(providerId);
    }

    if (stores.length === 0 && !rawQ) {
      await this.ensureStoresLoaded(providerId, { forceRefresh: true });
      stores = this.getStoresForProvider(providerId);
    }

    if (!rawQ) return stores;

    const geoResult = await PostcodeService.lookupPostcode(rawQ);
    if (geoResult) {
      const storesWithDist = stores.map((s) => {
        let dist = s.distanceMiles;
        if (s.latitude && s.longitude) {
          dist = PostcodeService.calculateDistanceMiles(
            geoResult.latitude,
            geoResult.longitude,
            s.latitude,
            s.longitude
          );
        }
        return { ...s, distanceMiles: dist };
      });

      storesWithDist.sort((a, b) => (a.distanceMiles ?? 999) - (b.distanceMiles ?? 999));
      return storesWithDist;
    }

    return this.searchStoresLocal(rawQ, providerId);
  }

  static async searchStoresByCoordinatesAsync(
    lat: number,
    lon: number,
    providerId: string
  ): Promise<StoreLocation[]> {
    await this.fetchStores(providerId, { lat, lng: lon, merge: true });
    return this.searchStoresByCoordinates(lat, lon, providerId);
  }

  static searchStoresByCoordinates(lat: number, lon: number, providerId: string): StoreLocation[] {
    const stores = this.getStoresForProvider(providerId);
    const storesWithDist = stores.map((s) => {
      let dist = s.distanceMiles;
      if (s.latitude && s.longitude) {
        dist = PostcodeService.calculateDistanceMiles(lat, lon, s.latitude, s.longitude);
      }
      return { ...s, distanceMiles: dist };
    });

    storesWithDist.sort((a, b) => (a.distanceMiles ?? 999) - (b.distanceMiles ?? 999));
    return storesWithDist;
  }

  static getSelectedStore(providerId: string): StoreLocation | null {
    try {
      const stored = localStorage.getItem(`${SELECTED_STORE_KEY_PREFIX}${providerId}`);
      if (!stored) return null;
      const parsed = JSON.parse(stored) as StoreLocation;
      return parsed && typeof parsed.id === 'string' ? parsed : null;
    } catch (e) {
      console.warn(`Failed to read selected store for ${providerId} from localStorage:`, e);
      return null;
    }
  }

  static setSelectedStore(providerId: string, store: StoreLocation) {
    try {
      localStorage.setItem(`${SELECTED_STORE_KEY_PREFIX}${providerId}`, JSON.stringify(store));
    } catch (e) {
      console.warn(`Failed to save selected store for ${providerId}:`, e);
    }
  }

  static hasSelectedStore(providerId: string): boolean {
    try {
      return localStorage.getItem(`${SELECTED_STORE_KEY_PREFIX}${providerId}`) !== null;
    } catch {
      return false;
    }
  }

  static clearSelectedStore(providerId: string) {
    try {
      localStorage.removeItem(`${SELECTED_STORE_KEY_PREFIX}${providerId}`);
    } catch (e) {
      console.warn(`Failed to clear selected store for ${providerId}:`, e);
    }
  }

  /** Clear selection + downloaded store directory for provider */
  static clearProviderLocalData(providerId: string) {
    this.clearSelectedStore(providerId);
    this.clearStoresCache(providerId);
  }
}
