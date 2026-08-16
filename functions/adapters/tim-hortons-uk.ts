/**
 * Tim Hortons UK live adapter — official locator HTML + marketing menu.
 *
 * Store pick is optional. Menu is the national /menu page (often unpriced).
 */
import type { LiveEnv } from './shared';
import { parsePrice } from './shared';
import type { StoreCoords } from './uk-location';
import {
  brandMenuShell,
  extractGenericUnits,
  isComboName,
  mapGenericCategory,
  slugId,
  ukPostcode,
} from './generic-fastfood';

const TH_LOCATOR = 'https://timhortons.co.uk/find-a-tims';
const TH_MENU = 'https://timhortons.co.uk/menu';

function thHeaders(): HeadersInit {
  return {
    Accept: 'text/html,application/xhtml+xml',
    'User-Agent': 'ComboWise/1.0 (live-menu-proxy)',
    Referer: 'https://timhortons.co.uk/',
  };
}

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

export async function fetchTimHortonsStores(_env: LiveEnv, q: string, _coords?: StoreCoords) {
  let stores: ReturnType<typeof parseThLocatorHtml> = [];
  let source = 'th_locator';
  try {
    const res = await fetch(TH_LOCATOR, { headers: thHeaders() });
    if (res.ok) stores = parseThLocatorHtml(await res.text());
  } catch {
    /* locator HTML may change */
  }
  if (stores.length === 0) source = 'th_empty';
  if (q.trim()) {
    const qq = q.replace(/\s+/g, '').toLowerCase();
    stores = stores.filter((s) =>
      [s.id, s.name, s.city, s.postcode, s.address]
        .map((x) => String(x || '').toLowerCase().replace(/\s+/g, ''))
        .join(' ')
        .includes(qq)
    );
  }
  return { stores, source, count: stores.length };
}

export function timHortonsMenuCatalogue(storeId: string, items: any[]) {
  const usable = items.length >= 3 ? items : [];
  return brandMenuShell({
    id: 'tim_hortons_uk',
    name: 'Tim Hortons UK',
    accentColor: '#c8102e',
    logoText: 'TH',
    disclaimer:
      usable.length > 0
        ? 'Tim Hortons UK prices are indicative and vary by store. Not official app checkout totals.'
        : 'Tim Hortons UK lists products on the marketing menu but no per-item pickup prices. Store pick is optional.',
    items: usable,
    extra: {
      menuVersion: `th-${storeId || 'national'}`,
      _source: { storeId, source: usable.length ? 'th_menu_page' : 'th_unpriced' },
    },
  });
}

export async function fetchTimHortonsMenu(_env: LiveEnv, _storeId: string) {
  try {
    const res = await fetch(TH_MENU, { headers: thHeaders() });
    if (res.ok) return timHortonsMenuCatalogue(_storeId || 'national', parseThMenuHtml(await res.text()));
  } catch {
    /* marketing page may be blocked */
  }
  return timHortonsMenuCatalogue(_storeId || 'national', []);
}
