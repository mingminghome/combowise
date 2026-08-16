/**
 * Just Eat UK public website APIs.
 *
 * Official McD / Tim Hortons pickup feeds are empty or blocked from Pages.
 * BK's national RBI crawl times out. The Just Eat consumer discovery + menu
 * CDN is the same data the just-eat.co.uk restaurant pages use, and it
 * returns nearby shops + per-item £ prices.
 *
 * Stores: GET uk.api.just-eat.io/discovery/uk/restaurants/enriched/bypostcode/{postcode}
 * Menu:   GET menu-globalmenucdn.je-apis.com/{uniqueName}_uk_items.json
 */
import {
  extractGenericUnits,
  isComboName,
  mapGenericCategory,
  slugId,
} from './generic-fastfood';

export const JE_DISCOVERY =
  'https://uk.api.just-eat.io/discovery/uk/restaurants/enriched/bypostcode';
export const JE_MENU_CDN = 'https://menu-globalmenucdn.je-apis.com';
const POSTCODES_IO = 'https://api.postcodes.io';

export type JeBrand = 'mcdonalds' | 'burger_king' | 'tim_hortons';

export type StoreCoords = { lat: number; lng: number };

export type JeStore = {
  id: string;
  name: string;
  address: string;
  city: string;
  postcode: string;
  latitude?: number;
  longitude?: number;
  distanceMiles?: number;
  tierId: string;
  isAppMenuAvailable: boolean;
};

const BRAND_MATCH: Record<JeBrand, { nameRe: RegExp; slugRe: RegExp }> = {
  mcdonalds: { nameRe: /^mcdonald/i, slugRe: /^mcdonalds/i },
  burger_king: { nameRe: /^burger\s*king/i, slugRe: /^burger-king/i },
  tim_hortons: { nameRe: /^tim\s*hortons?/i, slugRe: /^tim-hortons/i },
};

/** Outcodes that cover the main UK cities — used to seed a directory when the client has no query. */
export const JE_HUB_OUTCODES = ['W1', 'M1', 'B1', 'G1', 'LS1', 'BS1'] as const;

const CITY_OUTCODES: Record<string, string> = {
  london: 'W1',
  manchester: 'M1',
  birmingham: 'B1',
  glasgow: 'G1',
  edinburgh: 'EH1',
  leeds: 'LS1',
  liverpool: 'L1',
  bristol: 'BS1',
  cardiff: 'CF10',
  belfast: 'BT1',
  newcastle: 'NE1',
  nottingham: 'NG1',
  sheffield: 'S1',
  leicester: 'LE1',
  coventry: 'CV1',
  reading: 'RG1',
  oxford: 'OX1',
  cambridge: 'CB1',
  brighton: 'BN1',
  southampton: 'SO14',
  plymouth: 'PL1',
  altrincham: 'WA15',
};

const FULL_POSTCODE = /^[A-Z]{1,2}\d[A-Z\d]?\d[A-Z]{2}$/;
const OUTCODE = /^[A-Z]{1,2}\d[A-Z\d]?$/;

export function normalizeUkPostal(raw: string): string {
  return String(raw || '')
    .replace(/\s+/g, '')
    .trim()
    .toUpperCase();
}

export function isUkPostalQuery(raw: string): boolean {
  const c = normalizeUkPostal(raw);
  return FULL_POSTCODE.test(c) || OUTCODE.test(c);
}

export function isJeMenuSlug(storeId: string): boolean {
  const s = String(storeId || '').trim();
  return /[a-z]/i.test(s) && s.includes('-');
}

function jeHeaders(): HeadersInit {
  return {
    Accept: 'application/json',
    'User-Agent': 'ComboWise/1.0 (live-menu-proxy)',
    Origin: 'https://www.just-eat.co.uk',
    Referer: 'https://www.just-eat.co.uk/',
  };
}

async function fetchJson(url: string, timeoutMs: number): Promise<any> {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const res = await fetch(url, { headers: jeHeaders(), signal: ctrl.signal });
    if (!res.ok) throw new Error(`HTTP ${res.status} ${url}`);
    return await res.json();
  } finally {
    clearTimeout(t);
  }
}

export function mapJeRestaurant(raw: any, brand: JeBrand): JeStore | null {
  if (!raw || typeof raw !== 'object') return null;
  const uniqueName = String(raw.uniqueName || '').trim();
  const name = String(raw.name || '').trim();
  const match = BRAND_MATCH[brand];
  if (!match.nameRe.test(name) && !match.slugRe.test(uniqueName)) return null;
  if (raw.isTestRestaurant) return null;
  const id = uniqueName || (raw.id != null ? `je-${raw.id}` : '');
  if (!id) return null;

  const addr = raw.address || {};
  const city = String(addr.city || '').trim();
  const coords = addr.location?.coordinates;
  const lng = Array.isArray(coords) ? Number(coords[0]) : undefined;
  const lat = Array.isArray(coords) ? Number(coords[1]) : undefined;
  const metres = Number(raw.driveDistanceMeters);
  const nameClean = name.replace(/\u00ae/g, '').replace(/\s+/g, ' ').trim();

  return {
    id,
    name: nameClean,
    address: String(addr.firstLine || ''),
    city,
    postcode: String(addr.postalCode || ''),
    latitude: Number.isFinite(lat) ? lat : undefined,
    longitude: Number.isFinite(lng) ? lng : undefined,
    distanceMiles: Number.isFinite(metres) && metres >= 0 ? Math.round((metres / 1609.344) * 10) / 10 : undefined,
    tierId: /london/i.test(`${city} ${nameClean}`) ? 'london_central' : 'standard',
    isAppMenuAvailable: raw.isTemporarilyOffline !== true,
  };
}

export function filterJeRestaurants(restaurants: any[], brand: JeBrand): JeStore[] {
  const byId = new Map<string, JeStore>();
  for (const raw of restaurants || []) {
    const s = mapJeRestaurant(raw, brand);
    if (s) byId.set(s.id, s);
  }
  return [...byId.values()];
}

export async function fetchJeDiscovery(postcode: string): Promise<any[]> {
  const pc = String(postcode || '').replace(/\s+/g, '');
  if (!pc) return [];
  const body = await fetchJson(`${JE_DISCOVERY}/${encodeURIComponent(pc)}`, 8000);
  return Array.isArray(body?.restaurants) ? body.restaurants : [];
}

export function jeMenuImage(raw: any): string | undefined {
  const path = raw?.ImageSources?.[0]?.Path || raw?.imageSources?.[0]?.path;
  if (!path) return undefined;
  return String(path).replace('{transformations}', 'c_fill,w_300,h_300,q_auto');
}

export function normalizeJeMenuItems(raw: any, idPrefix: string): any[] {
  const bag = raw?.Items || raw?.items;
  const list: any[] = Array.isArray(bag) ? bag : bag && typeof bag === 'object' ? Object.values(bag) : [];
  const seen = new Set<string>();
  const items: any[] = [];

  for (const it of list) {
    const name = String(it?.Name || it?.name || '').replace(/\s+/g, ' ').trim();
    if (!name || name.length < 2) continue;
    const type = String(it?.Type || it?.type || 'menuitem').toLowerCase();
    if (type && type !== 'menuitem') continue;

    const variations: any[] = it?.Variations || it?.variations || [];
    let price = 0;
    for (const v of variations) {
      if (v?.DealOnly || v?.dealOnly) continue;
      const p = Number(v?.BasePrice ?? v?.basePrice);
      if (p > 0) {
        price = Math.round(p * 100) / 100;
        break;
      }
    }
    if (price <= 0) continue;

    const rawId = String(it?.Id || it?.id || name);
    const id = slugId([idPrefix, rawId]) || slugId([idPrefix, name]);
    if (!id || seen.has(id)) continue;
    seen.add(id);

    const combo = isComboName(name);
    const desc = String(it?.Description || it?.description || '').trim();
    items.push({
      id,
      name,
      category: mapGenericCategory(name, combo),
      price,
      description: desc || undefined,
      imageUrl: jeMenuImage(it),
      isCombo: combo || undefined,
      atomicUnits: extractGenericUnits(name),
    });
  }
  return items;
}

export async function fetchJeMenuItems(uniqueName: string, idPrefix: string): Promise<any[]> {
  const slug = String(uniqueName || '').trim();
  if (!slug) return [];
  const body = await fetchJson(`${JE_MENU_CDN}/${encodeURIComponent(slug)}_uk_items.json`, 10000);
  return normalizeJeMenuItems(body, idPrefix);
}

export type ResolvedUkLocation = {
  postcode: string;
  lat?: number;
  lng?: number;
};

export async function resolveUkLocation(q: string, coords?: StoreCoords): Promise<ResolvedUkLocation | null> {
  if (coords && Number.isFinite(coords.lat) && Number.isFinite(coords.lng)) {
    try {
      const body = await fetchJson(
        `${POSTCODES_IO}/postcodes?lon=${encodeURIComponent(String(coords.lng))}&lat=${encodeURIComponent(String(coords.lat))}`,
        5000
      );
      const row = body?.result?.[0];
      const pc = String(row?.postcode || '').replace(/\s+/g, '');
      if (pc) return { postcode: pc, lat: coords.lat, lng: coords.lng };
    } catch {
      /* reverse geocode optional */
    }
    return { postcode: '', lat: coords.lat, lng: coords.lng };
  }

  const raw = String(q || '').trim();
  if (!raw) return null;

  const compact = normalizeUkPostal(raw);
  if (isUkPostalQuery(raw)) {
    try {
      const path = FULL_POSTCODE.test(compact) ? `postcodes/${compact}` : `outcodes/${compact}`;
      const body = await fetchJson(`${POSTCODES_IO}/${path}`, 5000);
      const r = body?.result;
      return {
        postcode: compact,
        lat: typeof r?.latitude === 'number' ? r.latitude : undefined,
        lng: typeof r?.longitude === 'number' ? r.longitude : undefined,
      };
    } catch {
      return { postcode: compact };
    }
  }

  const cityKey = raw.toLowerCase().replace(/[^a-z]/g, '');
  const cityPc = CITY_OUTCODES[cityKey];
  if (cityPc) return { postcode: cityPc };

  return null;
}

export async function fetchJeBrandStores(
  brand: JeBrand,
  q: string,
  coords?: StoreCoords
): Promise<{ stores: JeStore[]; source: string; count: number }> {
  const loc = await resolveUkLocation(q, coords);
  const postcodes: string[] = [];
  if (loc?.postcode) postcodes.push(loc.postcode);
  else if (!q.trim() && !coords) postcodes.push(...JE_HUB_OUTCODES);

  const byId = new Map<string, JeStore>();
  const results = await Promise.all(
    postcodes.map(async (pc) => {
      try {
        return await fetchJeDiscovery(pc);
      } catch {
        return [] as any[];
      }
    })
  );
  for (const restaurants of results) {
    for (const s of filterJeRestaurants(restaurants, brand)) {
      byId.set(s.id, s);
    }
  }

  let stores = [...byId.values()];
  if (q.trim() && !isUkPostalQuery(q) && !CITY_OUTCODES[q.toLowerCase().replace(/[^a-z]/g, '')]) {
    const qq = q.replace(/\s+/g, '').toLowerCase();
    stores = stores.filter((s) =>
      [s.id, s.name, s.city, s.postcode, s.address]
        .map((x) => String(x || '').toLowerCase().replace(/\s+/g, ''))
        .join(' ')
        .includes(qq)
    );
  }
  stores.sort((a, b) => (a.distanceMiles ?? 999) - (b.distanceMiles ?? 999));
  return { stores, source: loc?.postcode ? 'just_eat' : 'just_eat_hubs', count: stores.length };
}
