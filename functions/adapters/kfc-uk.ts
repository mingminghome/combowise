/**
 * KFC UK live adapter — ClickAndCollect order pipeline.
 *
 * Same data as:
 *   https://www.kfc.co.uk/order-online/choose-your-food?refid={refid}&modeType=ClickAndCollect
 *
 * Standardization: shared multi-level menu pipeline (`./menu-pipeline`) +
 * KFC rules (`./kfc-menu-pipeline` → kfcMenuRules). Any chain can plug its own
 * MenuPipelineRules into runMenuPipeline — FieldBlob fuzzy match is shared.
 */
import type { LiveEnv } from './shared';
import { parsePrice } from './shared';
import {
  pipelineItem,
  extractAtomicUnits,
  extractUnitsFromMealComponents,
  resolveMealComponentLines,
  resolveKfcItemPrice,
  buildFieldBlob,
  classifyRole,
  fuzz,
  kfcMenuRules,
} from './kfc-menu-pipeline';

const DEFAULT_KFC_API_BASE = 'https://prod.kfcapi.com/api/v3';
const DEFAULT_MENU_OUTPUT = 'https://menuoutput.prod.platform.kfcapi.com';

/** Public SPA client key must come from env (not committed). See .env.example. */
function resolveKfcApiKey(env: LiveEnv): string {
  const key = String(env.KFC_API_KEY || '').trim();
  if (!key) {
    throw new Error(
      'KFC_API_KEY is not set. Add it to Cloudflare Pages env / .dev.vars / shell. ' +
        'Tip: open kfc.co.uk order-online, DevTools → Network, copy request header x-api-key.',
    );
  }
  return key;
}

function kfcHeaders(env: LiveEnv): HeadersInit {
  return {
    Accept: 'application/json',
    'x-api-key': resolveKfcApiKey(env),
    codemarket: 'UK',
    countrycode: 'GB',
    langcode: 'en',
    'User-Agent': 'ComboWise/1.0 (live-menu-proxy)',
    Referer: 'https://www.kfc.co.uk/order-online/choose-your-food',
    Origin: 'https://www.kfc.co.uk',
  };
}

/** Collapse KFC POS twins (same productId / same name+price / LE meal variants). */
function dedupeKfcMenuItems(items: any[]): any[] {
  const compact = (s: string) => String(s || '').toLowerCase().replace(/[^a-z0-9]+/g, '');
  const isLePos = (pos: string) =>
    /\bLE\b/.test(pos) || / ML LE\b/i.test(pos) || /ML LE$/i.test(pos) || /#LE$/i.test(pos);

  const score = (i: any) => {
    let s = 0;
    if (i._menuCategoryId != null) s += 100;
    if (i._source === 'mealComponents' || i.isCombo) s += 25;
    const descLen = String(i.description || '').trim().length;
    if (descLen >= 40) s += 8;
    else if (descLen >= 15) s += 3;
    if (isLePos(String(i._posName || ''))) s -= 60;
    // Prefer real street prices over under-priced LE / slot twins
    s += Math.min(Number(i.price) || 0, 40) * 0.05;
    return s;
  };

  const pickBest = (list: any[]) => {
    if (list.length === 1) return list[0];
    return [...list].sort((a, b) => score(b) - score(a))[0];
  };

  // 1) Same productId (Kids Beans SI-2574 vs SI-24717 share productId 1488)
  const byPid = new Map<string, any[]>();
  const noPid: any[] = [];
  for (const i of items) {
    if (i._productId != null && String(i._productId) !== '') {
      const k = String(i._productId);
      const list = byPid.get(k) || [];
      list.push(i);
      byPid.set(k, list);
    } else {
      noPid.push(i);
    }
  }
  let step: any[] = [...noPid];
  for (const list of byPid.values()) step.push(pickBest(list));

  // 2) Same display name + price (leftover objectKey twins)
  const byNamePrice = new Map<string, any[]>();
  for (const i of step) {
    const k = `${compact(i.name)}|${Number(i.price).toFixed(2)}`;
    const list = byNamePrice.get(k) || [];
    list.push(i);
    byNamePrice.set(k, list);
  }
  step = [];
  for (const list of byNamePrice.values()) step.push(pickBest(list));

  // 3) Same display name — keep one (drops Kids Box LE £0.64 vs main £1.14)
  const byName = new Map<string, any[]>();
  for (const i of step) {
    const k = compact(i.name);
    const list = byName.get(k) || [];
    list.push(i);
    byName.set(k, list);
  }
  step = [];
  for (const list of byName.values()) step.push(pickBest(list));

  // Strip internal fields
  for (const i of step) {
    delete i._source;
    delete i._productId;
    delete i._menuCategoryId;
    delete i._posName;
  }
  return step;
}

function normalizeKfcMenu(raw: any, brandName: string) {
  const categories: { categoryId: number; name: string }[] = Array.isArray(raw.categories)
    ? raw.categories
    : [];
  const catName = new Map(categories.map((c) => [c.categoryId, c.name || '']));
  const seen = new Set<string>();
  const items: any[] = [];

  // Process Meals first so structured products win over Single component lines
  // that share the same posItemId (e.g. Bargain Bucket Meal vs OR 6pc component).
  const rawItems: any[] = Array.isArray(raw.items) ? [...raw.items] : [];
  rawItems.sort((a, b) => {
    const am = a?.type === 'Meal' ? 0 : 1;
    const bm = b?.type === 'Meal' ? 0 : 1;
    return am - bm;
  });

  for (const rawItem of rawItems) {
    // Meals store price on levels[] (website basket uses the same payload — no 2nd fetch)
    const price = resolveKfcItemPrice(rawItem);
    if (price <= 0) continue;
    // objectKey is unique per Meal/Single; posItemId collides across types
    const uniqueKey = String(
      rawItem.objectKey || `${rawItem.type || 'X'}-${rawItem.posItemId || rawItem.productId || ''}`
    );
    if (!uniqueKey || seen.has(uniqueKey)) continue;

    const posId = String(rawItem.posItemId || rawItem.productId || uniqueKey);
    const rawName = String(rawItem.name || rawItem.posName || 'KFC Item').trim();
    const rawDescription = String(rawItem.description || '').trim();
    const posName = String(rawItem.posName || '');
    const menuCategoryId =
      rawItem.categoryId != null && rawItem.categoryId !== ''
        ? Number(rawItem.categoryId)
        : null;
    const catLabel = menuCategoryId != null ? catName.get(menuCategoryId) || '' : '';
    const productId = rawItem.productId != null ? rawItem.productId : null;
    const isStructuredMeal =
      rawItem.type === 'Meal' &&
      Array.isArray(rawItem.mealComponents) &&
      rawItem.mealComponents.length > 0;

    // Structured Meal: use official mealComponents (same tree as “add to basket”)
    if (isStructuredMeal) {
      // Defer unit finalisation until after singles exist — store raw for pass 2
      const result = pipelineItem({
        name: rawName,
        description: rawDescription,
        posName,
        catLabel,
        price,
        type: 'Meal',
      });
      let category =
        result.action === 'keep'
          ? result.category
          : /box meal/i.test(rawName)
            ? 'box_meals'
            : /bucket|feast|banquet|mighty|dine for/i.test(rawName)
              ? 'buckets'
              : 'meals';
      // Force kids aisle for kids boxes (marketing copy mentions drink → was "drinks")
      if (/\bkids?\b/i.test(rawName) || /\bkids?\b/i.test(catLabel)) category = 'kids';

      seen.add(uniqueKey);
      items.push({
        id: `kfc_${uniqueKey.replace(/[^a-zA-Z0-9_-]/g, '_')}`,
        name: rawName,
        category,
        price,
        description: rawDescription || undefined,
        imageUrl: rawItem.imagePath
          ? `https://assets.kfcapi.com/fit-in/300x300/${rawItem.imagePath}`
          : undefined,
        isCombo: true,
        atomicUnits: extractUnitsFromMealComponents(rawItem.mealComponents),
        _source: 'mealComponents',
        _mealComponents: rawItem.mealComponents,
        _productId: productId,
        _menuCategoryId: menuCategoryId,
        _posName: posName,
      });
      continue;
    }

    const result = pipelineItem({
      name: rawName,
      description: rawDescription,
      posName,
      catLabel,
      price,
    });

    if (result.action === 'drop') continue;

    seen.add(uniqueKey);

    const atomicUnits = { ...result.atomicUnits };
    // Prefer name-based opaque key over raw POS numeric codes (auditor shows "1× 85" otherwise)
    if (Object.keys(atomicUnits).length === 0 && !result.isCombo) {
      const slug = String(result.name || rawName || posId)
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-+|-+$/g, '')
        .slice(0, 48);
      atomicUnits[`sku:${slug || posId}`] = 1;
    }

    items.push({
      id: `kfc_${uniqueKey.replace(/[^a-zA-Z0-9_-]/g, '_')}`,
      name: result.name,
      category: result.category,
      price,
      description: result.description || undefined,
      imageUrl: rawItem.imagePath
        ? `https://assets.kfcapi.com/fit-in/300x300/${rawItem.imagePath}`
        : undefined,
      isCombo: result.isCombo || undefined,
      atomicUnits,
      _productId: productId,
      _menuCategoryId: menuCategoryId,
      _posName: posName,
    });
  }

  // Pass 2: resolve mealComponents → equivalentAlaCarteIds + units (same lines as web basket)
  const catalog = items.filter((i) => i.price > 0);
  for (const item of items) {
    if (!item._mealComponents) continue;
    const resolved = resolveMealComponentLines(item._mealComponents, catalog);
    if (resolved.components.length) {
      item.components = resolved.components.map((c) => ({
        itemId: c.itemId || '',
        name: c.name,
        count: c.count,
        category: c.category || 'extra',
      }));
    }
    // Only trust Stage-1 id list when every basket line resolved to a priced SKU
    const allResolved =
      resolved.components.length > 0 && resolved.components.every((c) => !!c.itemId);
    if (allResolved && resolved.equivalentAlaCarteIds.length) {
      item.equivalentAlaCarteIds = resolved.equivalentAlaCarteIds;
    }
    if (Object.keys(resolved.atomicUnits).length) {
      item.atomicUnits = resolved.atomicUnits;
    } else if (!Object.keys(item.atomicUnits || {}).length) {
      item.atomicUnits = extractUnitsFromMealComponents(item._mealComponents);
    }
    delete item._mealComponents;
  }

  // Drop promoted component Singles when a structured Meal already covers that product
  const mealKeys = items
    .filter((i) => i._source === 'mealComponents')
    .map((i) => ({
      compact: String(i.name).toLowerCase().replace(/[^a-z0-9]+/g, ''),
      digits: (String(i.name).match(/\d+/g) || []).join(''),
    }));
  const filtered = items.filter((i) => {
    if (i._source === 'mealComponents') return true;
    const compact = String(i.name).toLowerCase().replace(/[^a-z0-9]+/g, '');
    const digits = (String(i.name).match(/\d+/g) || []).join('');
    for (const m of mealKeys) {
      if (compact === m.compact) return false;
      if (
        digits &&
        digits === m.digits &&
        ((compact.includes('bargainbucket') && m.compact.includes('bargainbucket')) ||
          (compact.includes('familyfeast') && m.compact.includes('familyfeast')) ||
          (compact.includes('partybucket') && m.compact.includes('partybucket')) ||
          (compact.includes('wicked') && m.compact.includes('wicked')))
      ) {
        return false;
      }
    }
    return true;
  });

  // Collapse POS twins (kids sides ×2, LE kids boxes, same productId lines)
  const deduped = dedupeKfcMenuItems(filtered);
  items.length = 0;
  items.push(...deduped);

  return {
    id: 'kfc_uk',
    name: brandName,
    country: 'United Kingdom',
    currencySymbol: '£',
    currencyCode: 'GBP',
    accentColor: '#e4002b',
    logoText: 'KFC',
    locationTiers: [
      { id: 'standard', name: 'Standard UK Store', description: '', priceMultiplier: 1 },
      { id: 'london_central', name: 'Central London', description: '', priceMultiplier: 1.15 },
      { id: 'highway_travel', name: 'Travel / Airport', description: '', priceMultiplier: 1.25 },
    ],
    unitLabels: {
      rice_bowl: 'Rice Bowl',
      chicken_piece: 'Original Recipe Chicken Pieces',
      boneless_tender: 'Boneless Mini Fillets',
      popcorn_chicken: 'Popcorn Chicken',
      zinger_burger: 'Zinger Burger',
      fillet_burger: 'Fillet Burger',
      tower_burger: 'Tower Burger',
      twister_wrap: 'Twister Wrap',
      mini_fillet_burger: 'Mini Fillet Burger',
    },
    unitPpiLabels: {
      rice_bowl: 'bowl',
      chicken_piece: 'pc chicken',
      boneless_tender: 'tender',
      popcorn_chicken: 'portion',
      zinger_burger: 'burger',
      fillet_burger: 'burger',
      tower_burger: 'burger',
      twister_wrap: 'wrap',
      mini_fillet_burger: 'mini burger',
    },
    disclaimer:
      'KFC UK Click & Collect prices are indicative and vary by store. Not official app checkout totals. Item names & descriptions are from the live menu.',
    updatedAt: new Date().toISOString(),
    menuVersion: String(raw.signature || raw.version || 'live'),
    items,
    _source: {
      channel: raw.channel || 'ClickAndCollect',
      refid: raw.refid,
      signature: raw.signature,
    },
  };
}

function mapStore(r: any) {
  const refid = String(r.refid || '');
  if (!refid) return null;
  const name = String(r.name || '').trim();
  if (/do not use/i.test(name)) return null;
  if (r.status && r.status !== 'available') return null;
  const city = String(r.city || '');
  const street = String(r.street || '');
  let tierId = 'standard';
  if (/london/i.test(city + name)) tierId = 'london_central';
  if (/airport|services|motorway/i.test(name + street)) tierId = 'highway_travel';
  return {
    id: refid,
    name: name.startsWith('KFC') ? name : `KFC ${name}`,
    address: street,
    city,
    postcode: String(r.postalcode || ''),
    latitude: r.geolocation?.latitude,
    longitude: r.geolocation?.longitude,
    tierId,
    isAppMenuAvailable: true,
  };
}

export async function fetchKfcMenu(env: LiveEnv, storeId: string) {
  const base = (env.KFC_API_BASE || DEFAULT_KFC_API_BASE).replace(/\/$/, '');
  const metaUrl = `${base}/restaurants/${encodeURIComponent(storeId)}/menu?modeType=ClickAndCollect&serviceType=collection`;
  const metaRes = await fetch(metaUrl, { headers: kfcHeaders(env) });
  if (!metaRes.ok) {
    throw new Error(`KFC menu meta HTTP ${metaRes.status} for store ${storeId}`);
  }
  const meta = (await metaRes.json()) as { menuUrl?: string; channel?: string };

  const outputBase = (env.KFC_MENU_OUTPUT_BASE || DEFAULT_MENU_OUTPUT).replace(/\/$/, '');
  const menuUrl = `${outputBase}/${encodeURIComponent(storeId)}-ClickAndCollect.json`;

  const menuRes = await fetch(menuUrl, {
    headers: {
      Accept: 'application/json',
      Referer: 'https://www.kfc.co.uk/order-online/choose-your-food',
      Origin: 'https://www.kfc.co.uk',
      'User-Agent': 'ComboWise/1.0 (live-menu-proxy)',
    },
  });
  if (!menuRes.ok) {
    if (meta.menuUrl) {
      const fb = await fetch(meta.menuUrl, {
        headers: {
          Accept: 'application/json',
          Referer: 'https://www.kfc.co.uk/',
          'User-Agent': 'ComboWise/1.0',
        },
      });
      if (!fb.ok) throw new Error(`KFC menu body HTTP ${menuRes.status}/${fb.status}`);
      return normalizeKfcMenu(await fb.json(), 'KFC UK');
    }
    throw new Error(`KFC menu body HTTP ${menuRes.status}`);
  }
  return normalizeKfcMenu(await menuRes.json(), 'KFC UK');
}

export async function fetchKfcStores(env: LiveEnv, q: string) {
  const base = (env.KFC_API_BASE || DEFAULT_KFC_API_BASE).replace(/\/$/, '');
  const res = await fetch(`${base}/restaurants/all`, { headers: kfcHeaders(env) });
  if (!res.ok) throw new Error(`KFC stores HTTP ${res.status}`);
  const raw = (await res.json()) as any[];
  let stores = (Array.isArray(raw) ? raw : []).map(mapStore).filter(Boolean) as any[];

  if (q.trim()) {
    const qq = q.replace(/\s+/g, '').toLowerCase();
    stores = stores.filter((s) => {
      const blob = [s.id, s.name, s.city, s.postcode, s.address]
        .map((x) => String(x ?? '').toLowerCase().replace(/\s+/g, ''))
        .join(' ');
      return blob.includes(qq);
    });
  }
  return { stores, source: 'kfc_live', count: stores.length };
}

/** Smoke tests / debugging */
export {
  normalizeKfcMenu,
  extractAtomicUnits,
  extractUnitsFromMealComponents,
  resolveKfcItemPrice,
  pipelineItem,
  buildFieldBlob,
  classifyRole,
  fuzz,
  kfcMenuRules,
};
export { runMenuPipeline, type MenuPipelineRules } from './menu-pipeline';
