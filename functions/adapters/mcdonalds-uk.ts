/**
 * McDonald’s UK live adapter — official locator + restaurant JSON only.
 *
 * Stores: OSM Overpass, then official googleappsv2 geolocation.
 * Menu: official restaurant JSON when a store id is known.
 * Store pick is optional — empty / failed directory does not block the chain.
 */
import type { LiveEnv } from './shared';
import type { StoreCoords } from './uk-location';
import {
  brandMenuShell,
  extractGenericUnits,
  isComboName,
  mapGenericCategory,
  slugId,
  ukPostcode,
} from './generic-fastfood';

const MCD_GEO =
  'https://www.mcdonalds.com/googleappsv2/geolocation?latitude={lat}&longitude={lng}&radius={r}&maxResults=80&country=gb&language=en-gb&showClosed=';
const OVERPASS = 'https://overpass-api.de/api/interpreter';

const HUBS: Array<[number, number]> = [
  [51.5074, -0.1278],
  [53.4808, -2.2426],
  [52.4862, -1.8904],
  [55.8642, -4.2518],
];

function mcdHeaders(): HeadersInit {
  return {
    Accept: 'application/json',
    'User-Agent': 'ComboWise/1.0 (live-menu-proxy)',
    Referer: 'https://www.mcdonalds.com/gb/en-gb/restaurant-locator.html',
    Origin: 'https://www.mcdonalds.com',
  };
}

export function mapMcdFeature(f: any) {
  const p = f?.properties || f || {};
  const rawId = String(
    p.restaurantNumber || p.nationalStoreNumber || p.identifier || p.id || ''
  ).trim();
  const id = rawId.replace(/:(en-GB|gb)$/i, '');
  if (!id) return null;
  const g = f.geometry?.coordinates;
  const rawName = String(p.name || p.restaurantName || '').trim();
  const name = /^mcdonald/i.test(rawName) ? rawName : `McDonald's ${rawName || p.city || id}`;
  const city = String(p.city || p.subDivision || p.addressLine3 || '');
  return {
    id,
    name,
    address: String(p.addressLine1 || p.addressLine3 || p.address || ''),
    city,
    postcode: String(p.postcode || p.postalCode || ukPostcode(p.addressLine2 || p.address || '')),
    latitude: typeof g?.[1] === 'number' ? g[1] : p.latitude,
    longitude: typeof g?.[0] === 'number' ? g[0] : p.longitude,
    tierId: /london/i.test(String(city || rawName)) ? 'london_central' : 'standard',
    isAppMenuAvailable: true,
  };
}

export function mapOsmMcd(el: any) {
  const tags = el?.tags || {};
  const web = String(tags['contact:website'] || tags.website || '');
  const m = web.match(/\/(\d{5,})\.html/);
  const id = m ? m[1] : String(el.id || '');
  if (!id) return null;
  const city = String(tags['addr:city'] || tags['addr:town'] || '');
  const street = [tags['addr:housenumber'], tags['addr:street']].filter(Boolean).join(' ');
  return {
    id,
    name: tags.name ? String(tags.name) : `McDonald's ${city || id}`,
    address: street,
    city,
    postcode: String(tags['addr:postcode'] || ''),
    latitude: el.lat,
    longitude: el.lon,
    tierId: /london/i.test(city) ? 'london_central' : 'standard',
    isAppMenuAvailable: true,
  };
}

async function fetchGoogleAppsHub(lat: number, lng: number): Promise<any[]> {
  const url = MCD_GEO.replace('{lat}', String(lat)).replace('{lng}', String(lng)).replace('{r}', '90000');
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), 4000);
  try {
    const res = await fetch(url, { headers: mcdHeaders(), signal: ctrl.signal });
    if (!res.ok) throw new Error(`McD locator HTTP ${res.status}`);
    const body = (await res.json()) as { features?: any[] };
    return Array.isArray(body.features) ? body.features : [];
  } finally {
    clearTimeout(t);
  }
}

async function fetchOverpassMcd(): Promise<any[]> {
  const q = `[out:json][timeout:20];area["ISO3166-1"="GB"][admin_level=2];node["brand"="McDonald's"](area);out tags;`;
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), 18000);
  try {
    const res = await fetch(OVERPASS, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded', Accept: 'application/json' },
      body: `data=${encodeURIComponent(q)}`,
      signal: ctrl.signal,
    });
    if (!res.ok) return [];
    const body = (await res.json()) as { elements?: any[] };
    return Array.isArray(body.elements) ? body.elements : [];
  } finally {
    clearTimeout(t);
  }
}

export async function fetchMcdonaldsStores(_env: LiveEnv, q: string, coords?: StoreCoords) {
  const byId = new Map<string, NonNullable<ReturnType<typeof mapMcdFeature>>>();
  let officialOk = false;
  try {
    const els = await fetchOverpassMcd();
    for (const el of els) {
      const s = mapOsmMcd(el);
      if (s) byId.set(s.id, s);
    }
  } catch {
    /* Overpass may rate-limit */
  }
  if (byId.size === 0) {
    const hubs: Array<[number, number]> = coords ? [[coords.lat, coords.lng], ...HUBS] : HUBS;
    for (const [lat, lng] of hubs.slice(0, 4)) {
      try {
        const feats = await fetchGoogleAppsHub(lat, lng);
        officialOk = officialOk || feats.length > 0;
        for (const f of feats) {
          const s = mapMcdFeature(f);
          if (s) byId.set(s.id, s);
        }
      } catch {
        /* locator often blocked */
      }
    }
  }
  let stores = [...byId.values()];
  if (q.trim()) {
    const qq = q.replace(/\s+/g, '').toLowerCase();
    stores = stores.filter((s) =>
      [s.id, s.name, s.city, s.postcode, s.address]
        .map((x) => String(x || '').toLowerCase().replace(/\s+/g, ''))
        .join(' ')
        .includes(qq)
    );
  }
  return {
    stores,
    source: officialOk ? 'mcd_locator' : byId.size ? 'mcd_osm' : 'mcd_empty',
    count: stores.length,
  };
}

export function mcdonaldsMenuCatalogue(storeId: string, items: any[], source: string) {
  return brandMenuShell({
    id: 'mcdonalds_uk',
    name: "McDonald's UK",
    accentColor: '#ffc72c',
    logoText: 'McD',
    disclaimer:
      items.length > 0
        ? "McDonald's UK prices are indicative and vary by store. Not official app checkout totals."
        : "McDonald's UK does not publish a public per-store pickup price feed we can read. Store pick is optional.",
    items,
    extra: { menuVersion: `mcd-${storeId || 'national'}`, _source: { storeId, source } },
  });
}

/** Official restaurant JSON when a store id is known. No store → empty catalogue (HTTP 200). */
export async function fetchMcdonaldsMenu(_env: LiveEnv, storeId: string) {
  const sid = storeId.trim().replace(/:(en-GB|gb)$/i, '');
  if (!sid) return mcdonaldsMenuCatalogue('', [], 'mcd_no_store');
  const urls = [
    `https://www.mcdonalds.com/googleappsv2/restaurant/${encodeURIComponent(sid)}?country=gb&language=en-gb`,
    `https://www.mcdonalds.com/googleappsv2/restaurant/${encodeURIComponent(sid)}:en-GB?country=gb&language=en-gb`,
    `https://www.mcdonalds.com/gb/en-gb/.rest/restaurant/${encodeURIComponent(sid)}.json`,
  ];
  for (const url of urls) {
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), 5000);
    try {
      const res = await fetch(url, { headers: mcdHeaders(), signal: ctrl.signal });
      if (!res.ok) continue;
      const raw = await res.json();
      const items = normalizeMcdMenuItems(raw);
      if (items.length) return mcdonaldsMenuCatalogue(sid, items, 'mcd_live');
    } catch {
      /* try next host */
    } finally {
      clearTimeout(t);
    }
  }
  return mcdonaldsMenuCatalogue(sid, [], 'mcd_unavailable');
}

export function normalizeMcdMenuItems(raw: any): any[] {
  const bags: any[] = [];
  const walk = (v: any) => {
    if (!v) return;
    if (Array.isArray(v)) {
      v.forEach(walk);
      return;
    }
    if (typeof v !== 'object') return;
    const name = String(v.productName || v.name || v.itemName || v.title || '').trim();
    const price =
      Number(v.price) ||
      Number(v.productPrice) ||
      Number(v.displayPrice) ||
      Number(String(v.priceText || '').replace(/[^0-9.]/g, ''));
    if (name && price > 0) bags.push({ name, price, raw: v });
    for (const k of Object.keys(v)) {
      if (k === 'raw') continue;
      if (typeof v[k] === 'object') walk(v[k]);
    }
  };
  walk(raw);
  const seen = new Set<string>();
  const items: any[] = [];
  for (const b of bags) {
    const id = slugId(['mcd', b.raw.productCode || b.raw.id || b.name]);
    if (seen.has(id)) continue;
    seen.add(id);
    const combo = isComboName(b.name);
    items.push({
      id,
      name: b.name,
      category: mapGenericCategory(b.name, combo),
      price: Math.round(b.price * 100) / 100,
      isCombo: combo || undefined,
      atomicUnits: extractGenericUnits(b.name),
    });
  }
  return items;
}
