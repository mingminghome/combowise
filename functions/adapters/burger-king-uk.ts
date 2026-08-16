/**
 * Burger King UK live adapter — RBI GraphQL stores + Sanity catalogue + store PLU prices.
 *
 * Stores: POST https://euc1-prod-bk.rbictg.com/graphql  GetRestaurants
 * Menu items: Sanity dataset prod_bk_gb (czqk28jt)
 * Prices: gateway plusData (pence) after guest token country=GBR
 */
import type { LiveEnv } from './shared';
import {
  brandMenuShell,
  extractGenericUnits,
  isComboName,
  localeText,
  mapGenericCategory,
  penceToPounds,
} from './generic-fastfood';

const BK_GQL = 'https://euc1-prod-bk.rbictg.com/graphql';
const BK_GATEWAY = 'https://euc1-prod-bk-gateway.rbictg.com/graphql';
const SANITY = 'https://czqk28jt.api.sanity.io/v2021-10-21/data/query/prod_bk_gb';

const HUBS: Array<[number, number]> = [
  [51.5074, -0.1278],
  [53.4808, -2.2426],
  [52.4862, -1.8904],
  [55.8642, -4.2518],
  [54.5973, -5.9301],
  [51.4816, -3.1791],
  [53.8008, -1.5491],
  [54.9783, -1.6178],
  [50.7184, -3.5339],
  [53.4084, -2.9916],
  [52.9548, -1.1581],
  [55.9533, -3.1883],
  [51.4545, -2.5879],
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
  const res = await fetch(url, {
    method: 'POST',
    headers: bkHeaders(token),
    body: JSON.stringify({ query, variables }),
  });
  const body = (await res.json()) as { data?: T; errors?: Array<{ message?: string }> };
  if (!res.ok || body.errors?.length) {
    throw new Error(body.errors?.[0]?.message || `BK GraphQL HTTP ${res.status}`);
  }
  if (!body.data) throw new Error('BK GraphQL empty data');
  return body.data;
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

async function fetchHub(lat: number, lng: number): Promise<BkNode[]> {
  const out: BkNode[] = [];
  let after: string | undefined;
  for (let page = 0; page < 8; page++) {
    const input: Record<string, unknown> = {
      first: 50,
      coordinates: { searchRadius: 90000, userLat: lat, userLng: lng },
    };
    if (after) input.after = after;
    const data = await gql<{
      restaurants: {
        pageInfo?: { hasNextPage?: boolean; endCursor?: string };
        nodes?: BkNode[];
      };
    }>(BK_GQL, RESTAURANTS_Q, { input });
    const nodes = data.restaurants?.nodes || [];
    out.push(...nodes);
    if (!data.restaurants?.pageInfo?.hasNextPage) break;
    after = data.restaurants.pageInfo.endCursor;
    if (!after) break;
  }
  return out;
}

export async function fetchBurgerKingStores(_env: LiveEnv, q: string) {
  const byId = new Map<string, ReturnType<typeof mapBkStore>>();
  for (const [lat, lng] of HUBS) {
    try {
      const nodes = await fetchHub(lat, lng);
      for (const n of nodes) {
        const s = mapBkStore(n);
        if (s) byId.set(s.id, s);
      }
    } catch {
      /* hub timeout — keep others */
    }
  }
  let stores = [...byId.values()].filter(Boolean) as NonNullable<ReturnType<typeof mapBkStore>>[];
  if (q.trim()) {
    const qq = q.replace(/\s+/g, '').toLowerCase();
    stores = stores.filter((s) =>
      [s.id, s.name, s.city, s.postcode, s.address]
        .map((x) => String(x || '').toLowerCase().replace(/\s+/g, ''))
        .join(' ')
        .includes(qq)
    );
  }
  return { stores, source: 'bk_live', count: stores.length };
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

export async function fetchBurgerKingMenu(_env: LiveEnv, storeId: string) {
  if (!storeId.trim()) throw new Error('Pass storeId (BK store number, e.g. 33001)');
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
  if (!items.length) {
    throw new Error(`BK menu empty for store ${storeId} (no priced PLU matches)`);
  }
  return brandMenuShell({
    id: 'burger_king_uk',
    name: 'Burger King UK',
    accentColor: '#d62300',
    logoText: 'BK',
    disclaimer:
      'Burger King UK Click & Collect prices are indicative and vary by store. Not official app checkout totals.',
    items,
    extra: { menuVersion: `bk-${storeId}`, _source: { storeId, source: 'bk_live' } },
  });
}
