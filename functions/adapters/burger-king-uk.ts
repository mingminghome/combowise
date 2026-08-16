/**
 * Burger King UK live adapter.
 *
 * Stores (fast path): one nearby RBI GraphQL query after postcodes.io.
 * National 13-hub crawl times out on Pages / the 25s client.
 * Fallback: Just Eat UK discovery (same as McD / Tim Hortons).
 *
 * Menu: official Sanity + plusData when storeId is a BK number;
 * Just Eat menu CDN when storeId is a JE uniqueName slug.
 */
import type { LiveEnv } from './shared';
import { fetchJeBrandStores, fetchJeMenuItems, isJeMenuSlug, resolveUkLocation } from './just-eat-uk';
import {
  brandMenuShell,
  extractGenericUnits,
  isComboName,
  localeText,
  mapGenericCategory,
  penceToPounds,
} from './generic-fastfood';

export type StoreCoords = { lat: number; lng: number };

const BK_GQL = 'https://euc1-prod-bk.rbictg.com/graphql';
const BK_GATEWAY = 'https://euc1-prod-bk-gateway.rbictg.com/graphql';
const SANITY = 'https://czqk28jt.api.sanity.io/v2021-10-21/data/query/prod_bk_gb';

const HUBS: Array<[number, number]> = [
  [51.5074, -0.1278],
  [53.4808, -2.2426],
  [52.4862, -1.8904],
];

function bkHeaders(token?: string): HeadersInit {
  const h: Record<string, string> = {
    Accept: 'application/json',
    'Content-Type': 'application/json',
    Origin: 'https://www.burgerking.co.uk',
    Referer: 'https://www.burgerking.co.uk/',
    'x-ui-region': 'GB',
    'x-ui-platform': 'web',
    'User-Agent': 'ComboWise/1.0 (live-menu-proxy)',
  };
  if (token) h.Authorization = `Bearer ${token}`;
  return h;
}

async function gql<T>(url: string, query: string, variables: Record<string, unknown>, token?: string): Promise<T> {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), 8000);
  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: bkHeaders(token),
      body: JSON.stringify({ query, variables }),
      signal: ctrl.signal,
    });
    const body = (await res.json()) as { data?: T; errors?: Array<{ message?: string }> };
    if (!res.ok || body.errors?.length) {
      throw new Error(body.errors?.[0]?.message || `BK GraphQL HTTP ${res.status}`);
    }
    if (!body.data) throw new Error('BK GraphQL empty data');
    return body.data;
  } finally {
    clearTimeout(t);
  }
}

const RESTAURANTS_Q = `query GetRestaurants($input:RestaurantsInput){
  restaurants(input:$input){
    totalCount pageInfo{hasNextPage endCursor}
    nodes{
      storeId name number latitude longitude
      physicalAddress{address1 city postalCode}
      hasMobileOrdering isAvailable
    }
  }
}`;

type BkNode = {
  storeId?: string;
  name?: string;
  number?: string;
  latitude?: number;
  longitude?: number;
  physicalAddress?: { address1?: string; city?: string; postalCode?: string };
  hasMobileOrdering?: boolean;
  isAvailable?: boolean;
};

export function mapBkStore(n: BkNode) {
  const id = String(n.storeId || n.number || '').trim();
  if (!id) return null;
  const addr = n.physicalAddress || {};
  const city = String(addr.city || '').trim();
  const nameRaw = String(n.name || '').split(' - Great Britain')[0].trim();
  const name = nameRaw.startsWith('Burger King') ? nameRaw : `Burger King ${addr.address1 || city || id}`;
  return {
    id,
    name,
    address: String(addr.address1 || ''),
    city,
    postcode: String(addr.postalCode || ''),
    latitude: n.latitude,
    longitude: n.longitude,
    tierId: /london/i.test(city + name) ? 'london_central' : 'standard',
    isAppMenuAvailable: n.hasMobileOrdering !== false,
  };
}

async function fetchNearby(lat: number, lng: number, radiusM = 25000): Promise<BkNode[]> {
  const data = await gql<{
    restaurants: { nodes?: BkNode[] };
  }>(BK_GQL, RESTAURANTS_Q, {
    input: {
      first: 50,
      coordinates: { searchRadius: radiusM, userLat: lat, userLng: lng },
    },
  });
  return data.restaurants?.nodes || [];
}

function mappedFromNodes(nodes: BkNode[]) {
  const byId = new Map<string, NonNullable<ReturnType<typeof mapBkStore>>>();
  for (const n of nodes) {
    const s = mapBkStore(n);
    if (s) byId.set(s.id, s);
  }
  return [...byId.values()];
}

export async function fetchBurgerKingStores(_env: LiveEnv, q: string, coords?: StoreCoords) {
  const loc = await resolveUkLocation(q, coords);

  if (loc?.lat != null && loc?.lng != null) {
    try {
      const stores = mappedFromNodes(await fetchNearby(loc.lat, loc.lng, 40000));
      if (stores.length) return { stores, source: 'bk_live', count: stores.length };
    } catch {
      /* fall through to Just Eat */
    }
  }

  const je = await fetchJeBrandStores('burger_king', q, coords);
  if (je.count) return { ...je, source: loc?.lat != null ? 'just_eat' : je.source };

  if (!q.trim() && !coords) {
    const byId = new Map<string, NonNullable<ReturnType<typeof mapBkStore>>>();
    const hubs = await Promise.all(
      HUBS.map(async ([lat, lng]) => {
        try {
          return await fetchNearby(lat, lng, 60000);
        } catch {
          return [] as BkNode[];
        }
      })
    );
    for (const nodes of hubs) {
      for (const s of mappedFromNodes(nodes)) byId.set(s.id, s);
    }
    const stores = [...byId.values()];
    if (stores.length) return { stores, source: 'bk_live', count: stores.length };
    throw new Error('Could not load Burger King UK stores. Search by postcode (e.g. WA15).');
  }

  return { stores: [] as NonNullable<ReturnType<typeof mapBkStore>>[], source: 'bk_empty', count: 0 };
}

function collectPlus(raw: any): string[] {
  const out: string[] = [];
  const add = (v: unknown) => {
    const s = String(v || '').trim();
    if (s && !out.includes(s)) out.push(s);
  };
  const vc = raw?.vendorConfigs || {};
  for (const k of Object.keys(vc)) {
    const c = vc[k] || {};
    add(c.constantPlu);
    add(c.sizeBasedPlu?.comboPlu);
  }
  const partners = raw?.pluConfigs?.partner;
  if (Array.isArray(partners)) {
    for (const p of partners) add(p?.vendorConfig?.constantPlu);
  }
  return out;
}

function sanityImage(ref: unknown): string | undefined {
  const m = String(ref || '').match(/^image-([a-f0-9]+)-(\d+x\d+)-([a-z0-9]+)$/i);
  if (!m) return undefined;
  return `https://cdn.sanity.io/images/czqk28jt/prod_bk_gb/${m[1]}-${m[2]}.${m[3]}?w=300`;
}

async function sanityQuery<T>(query: string): Promise<T> {
  const url = `${SANITY}?query=${encodeURIComponent(query)}`;
  const res = await fetch(url, { headers: { Accept: 'application/json' } });
  if (!res.ok) throw new Error(`BK Sanity HTTP ${res.status}`);
  const body = (await res.json()) as { result?: T };
  if (body.result == null) throw new Error('BK Sanity empty');
  return body.result;
}

async function guestToken(): Promise<string> {
  const data = await gql<{ generateGuestToken: string }>(
    BK_GATEWAY,
    'mutation GuestToken($input:GenerateGuestTokenInput!){generateGuestToken(guestInfo:$input)}',
    { input: { country: 'GBR', platform: 'web', stage: 'prod' } }
  );
  return data.generateGuestToken;
}

async function plusMap(storeId: string): Promise<Map<string, number>> {
  const token = await guestToken();
  const data = await gql<{ plus: Array<{ plu?: string; price?: string }> }>(
    BK_GATEWAY,
    'query plusData($storeId:ID!$serviceMode:PosDataServiceMode){plus(storeId:$storeId serviceMode:$serviceMode){plu price}}',
    { storeId, serviceMode: 'pickup' },
    token
  );
  const map = new Map<string, number>();
  for (const row of data.plus || []) {
    const pence = parseFloat(String(row.price || '0'));
    if (!row.plu || !pence || pence <= 0) continue;
    map.set(String(row.plu), penceToPounds(pence));
  }
  return map;
}

function bkMenuShell(storeId: string, items: any[], source: string) {
  return brandMenuShell({
    id: 'burger_king_uk',
    name: 'Burger King UK',
    accentColor: '#d62300',
    logoText: 'BK',
    disclaimer:
      source === 'just_eat'
        ? 'Burger King UK prices are from Just Eat restaurant menus and vary by store. Not official app checkout totals.'
        : 'Burger King UK Click & Collect prices are indicative and vary by store. Not official app checkout totals.',
    items,
    extra: { menuVersion: `bk-${storeId}`, _source: { storeId, source } },
  });
}

async function fetchOfficialBkMenu(storeId: string) {
  const [catalog, prices] = await Promise.all([
    sanityQuery<any[]>(
      `*[_type in ["item","combo"] && defined(name)]{
        _id,_type,name,internalName,description,image,vendorConfigs,pluConfigs,showInStaticMenu
      }`
    ),
    plusMap(storeId.trim()),
  ]);
  const seen = new Set<string>();
  const items: any[] = [];
  for (const raw of catalog || []) {
    const name = localeText(raw.name) || String(raw.internalName || '').trim();
    if (!name || /^offer\b/i.test(name) || /do not use|test item/i.test(name)) continue;
    const plus = collectPlus(raw);
    let price = 0;
    for (const plu of plus) {
      const p = prices.get(plu);
      if (p && p > 0) {
        price = p;
        break;
      }
    }
    if (price <= 0) continue;
    const id = `bk_${String(raw._id || name).replace(/[^a-zA-Z0-9_-]/g, '_')}`;
    if (seen.has(id)) continue;
    seen.add(id);
    const combo = raw._type === 'combo' || isComboName(name);
    const desc = localeText(raw.description);
    items.push({
      id,
      name,
      category: mapGenericCategory(name, combo),
      price,
      description: desc || undefined,
      imageUrl: sanityImage(raw.image?.asset?._ref),
      isCombo: combo || undefined,
      atomicUnits: extractGenericUnits(name),
    });
  }
  return items;
}

export async function fetchBurgerKingMenu(_env: LiveEnv, storeId: string) {
  const sid = storeId.trim();
  if (!sid) throw new Error('Pass storeId (BK store number or Just Eat uniqueName)');

  if (isJeMenuSlug(sid)) {
    const items = await fetchJeMenuItems(sid, 'bk');
    if (!items.length) throw new Error(`Just Eat menu had no priced items for ${sid}`);
    return bkMenuShell(sid, items, 'just_eat');
  }

  const items = await fetchOfficialBkMenu(sid);
  if (!items.length) {
    throw new Error(`BK menu empty for store ${sid} (no priced PLU matches)`);
  }
  return bkMenuShell(sid, items, 'bk_live');
}
