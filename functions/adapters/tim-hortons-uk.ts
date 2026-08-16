/**
 * Tim Hortons UK live adapter.
 *
 * Official marketing /menu has names but almost no pickup £ prices.
 * Stores + priced menus come from the Just Eat UK website APIs.
 * Store `id` is the JE `uniqueName` slug.
 */
import type { LiveEnv } from './shared';
import { parsePrice } from './shared';
import { fetchJeBrandStores, fetchJeMenuItems, isJeMenuSlug } from './just-eat-uk';
import {
  brandMenuShell,
  extractGenericUnits,
  isComboName,
  mapGenericCategory,
  slugId,
  ukPostcode,
} from './generic-fastfood';

export type StoreCoords = { lat: number; lng: number };

export function parseThLocatorHtml(html: string) {
  const parts = String(html || '').split('data-module-role="location"').slice(1);
  const stores: any[] = [];
  const seen = new Set<string>();
  for (const p of parts) {
    const lat = Number(/data-module-lat="([^"]+)"/.exec(p)?.[1]);
    const lng = Number(/data-module-lng="([^"]+)"/.exec(p)?.[1]);
    const city = (/class="location-city">([^<]+)/.exec(p)?.[1] || '').trim();
    const addrHtml = /class="location-address">([\s\S]*?)<\/p>/.exec(p)?.[1] || '';
    const addrText = addrHtml
      .replace(/<br\s*\/?>/gi, ', ')
      .replace(/<[^>]+>/g, ' ')
      .replace(/Hours:[\s\S]*/i, '')
      .replace(/\s+/g, ' ')
      .replace(/,\s*,/g, ',')
      .trim();
    const postcode = ukPostcode(addrText);
    const address = addrText.replace(postcode, '').replace(/,\s*$/, '').trim();
    const id = slugId([city, postcode || address]) || `th-${stores.length}`;
    if (seen.has(id)) continue;
    seen.add(id);
    stores.push({
      id,
      name: city ? `Tim Hortons ${city}` : `Tim Hortons ${id}`,
      address,
      city,
      postcode,
      latitude: Number.isFinite(lat) ? lat : undefined,
      longitude: Number.isFinite(lng) ? lng : undefined,
      tierId: /london/i.test(city) ? 'london_central' : 'standard',
      isAppMenuAvailable: true,
    });
  }
  return stores;
}

export function parseThMenuHtml(html: string) {
  const items: any[] = [];
  const seen = new Set<string>();
  const push = (name: string, price: number, extra?: { description?: string; imageUrl?: string }) => {
    const n = name.replace(/\s+/g, ' ').trim();
    if (!n || n.length < 3 || /tim hortons|nutritional|ingredients|logo/i.test(n)) return;
    if (price <= 0) return;
    const id = slugId(['th', n]);
    if (seen.has(id)) return;
    seen.add(id);
    const combo = isComboName(n);
    items.push({
      id,
      name: n,
      category: mapGenericCategory(n, combo),
      price,
      description: extra?.description,
      imageUrl: extra?.imageUrl,
      isCombo: combo || undefined,
      atomicUnits: extractGenericUnits(n),
    });
  };

  const priced = html.matchAll(
    /alt="([^"]+)"[^>]*>[\s\S]{0,240}?£\s*([0-9]+(?:\.[0-9]{1,2})?)/gi
  );
  for (const m of priced) push(m[1], parsePrice(m[2]));

  const dataPrice = html.matchAll(
    /data-price="([^"]+)"[^>]{0,120}(?:data-name|alt|title)="([^"]+)"/gi
  );
  for (const m of dataPrice) push(m[2], parsePrice(m[1]));

  if (/£\s*1\.99\s*Breakfast/i.test(html) || /£1\.99 Breakfast/i.test(html)) {
    push('£1.99 Breakfast', 1.99, { description: 'Official Tim Hortons UK breakfast offer' });
  }

  return items;
}

export async function fetchTimHortonsStores(_env: LiveEnv, q: string, coords?: StoreCoords) {
  const result = await fetchJeBrandStores('tim_hortons', q, coords);
  if (result.count === 0 && !q.trim() && !coords) {
    throw new Error('Could not load Tim Hortons UK stores from Just Eat. Search by postcode (e.g. WA15).');
  }
  return result;
}

export function timHortonsMenuCatalogue(storeId: string, items: any[], source = 'th_menu_page') {
  return brandMenuShell({
    id: 'tim_hortons_uk',
    name: 'Tim Hortons UK',
    accentColor: '#c8102e',
    logoText: 'TH',
    disclaimer:
      items.length > 0
        ? 'Tim Hortons UK prices are from Just Eat restaurant menus and vary by store. Not official app checkout totals.'
        : 'Tim Hortons UK menu had no priced items for this store. Pick the shop again or retry.',
    items,
    extra: {
      menuVersion: `th-${storeId}`,
      _source: { storeId, source },
    },
  });
}

export async function fetchTimHortonsMenu(_env: LiveEnv, storeId: string) {
  const sid = storeId.trim();
  if (!sid) throw new Error('Pass storeId (Just Eat uniqueName, e.g. tim-hortons-uk-trafford-centre-manchester)');
  if (!isJeMenuSlug(sid)) {
    throw new Error(
      'This Tim Hortons shop id is from an older locator. Search by postcode and pick the store again.'
    );
  }
  const items = await fetchJeMenuItems(sid, 'th');
  if (!items.length) {
    throw new Error(`Just Eat menu had no priced items for ${sid}`);
  }
  return timHortonsMenuCatalogue(sid, items, 'just_eat');
}
