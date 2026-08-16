/**
 * McDonald’s UK live adapter.
 *
 * Official googleappsv2 / Overpass locators are empty or blocked from Pages.
 * Stores + priced menus come from the Just Eat UK website APIs (same data as
 * just-eat.co.uk restaurant pages). Store `id` is the JE `uniqueName` slug.
 */
import type { LiveEnv } from './shared';
import { fetchJeBrandStores, fetchJeMenuItems, isJeMenuSlug } from './just-eat-uk';
import { brandMenuShell, extractGenericUnits, isComboName, mapGenericCategory, slugId, ukPostcode } from './generic-fastfood';

export type StoreCoords = { lat: number; lng: number };

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

export async function fetchMcdonaldsStores(_env: LiveEnv, q: string, coords?: StoreCoords) {
  const result = await fetchJeBrandStores('mcdonalds', q, coords);
  if (result.count === 0 && !q.trim() && !coords) {
    throw new Error('Could not load McDonald’s UK stores from Just Eat. Search by postcode (e.g. WA15).');
  }
  return result;
}

export function mcdonaldsMenuCatalogue(storeId: string, items: any[], source: string) {
  return brandMenuShell({
    id: 'mcdonalds_uk',
    name: "McDonald's UK",
    accentColor: '#ffc72c',
    logoText: 'McD',
    disclaimer:
      items.length > 0
        ? "McDonald's UK prices are from Just Eat restaurant menus and vary by store. Not official McDonald’s app checkout totals."
        : "McDonald's UK menu had no priced items for this store. Pick the shop again or retry.",
    items,
    extra: { menuVersion: `mcd-${storeId}`, _source: { storeId, source } },
  });
}

export async function fetchMcdonaldsMenu(_env: LiveEnv, storeId: string) {
  const sid = storeId.trim().replace(/:(en-GB|gb)$/i, '');
  if (!sid) throw new Error('Pass storeId (Just Eat uniqueName, e.g. mcdonalds-baguely-2-manchester)');
  if (!isJeMenuSlug(sid)) {
    throw new Error(
      'This McDonald’s shop id is from an older locator. Search by postcode and pick the store again.'
    );
  }
  const items = await fetchJeMenuItems(sid, 'mcd');
  if (!items.length) {
    throw new Error(`Just Eat menu had no priced items for ${sid}`);
  }
  return mcdonaldsMenuCatalogue(sid, items, 'just_eat');
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
