import type { FastFoodProvider, MenuItem, MenuItemCategory, StoreLocation } from '../types/provider';
import { BaseMenuNormalizer } from './baseNormalizer';

/**
 * Maps Popeyes UK ordering SPA payloads into ComboWise shape.
 *
 * Live pipeline (server-side Function preferred):
 *  1. GET …/api/v2/restaurants
 *  2. GET …/api/v2/restaurants/{slug|id}
 *  3. GET …/en/restaurants/{ref}/menus/{collectionMenuId}
 *
 * When the Pages Function already returns FastFoodProvider JSON, the client
 * passthrough normalizer is enough; this class is for raw upstream debugging.
 */
export class PopeyesLiveNormalizer extends BaseMenuNormalizer {
  private brand: FastFoodProvider;

  constructor(brand: FastFoodProvider) {
    super(brand.id, brand.name);
    this.brand = { ...brand, items: [] };
  }

  normalize(rawPayload: any): FastFoodProvider {
    if (!rawPayload || typeof rawPayload !== 'object') {
      return { ...this.brand, items: [] };
    }

    // Already ComboWise shape from /api/live
    if (Array.isArray(rawPayload.items) && rawPayload.id === 'popeyes_uk') {
      return { ...this.brand, ...rawPayload, items: rawPayload.items };
    }

    const data = rawPayload.data && rawPayload.categories == null ? rawPayload.data : rawPayload;
    const categories: any[] = Array.isArray(data?.categories) ? data.categories : [];
    const seen = new Set<string>();
    const items: MenuItem[] = [];

    for (const raw of this.collectItems(categories)) {
      if (raw.outOfStock) continue;
      const price = this.parsePrice(raw.price);
      if (price <= 0) continue;
      const id = String(raw.externalId || raw.slug || '');
      if (!id || seen.has(id)) continue;
      seen.add(id);

      const name = String(raw.productName || raw.categoryViewProductName || 'Popeyes Item').trim();
      const description = String(raw.shortDescription || '').trim();
      const catLabel = String(raw._catLabel || '');
      const n = name.toLowerCase();
      const isCombo =
        /\b(box meal|big box|sharer|feast|banquet|poppy meal)\b/.test(n) ||
        (/\bbox\b/.test(n) && !/\b\d+\s/.test(n)) ||
        (!!raw.isComboMeal && /\b(meal|box|sharer|feast)\b/.test(n));
      const category = this.mapItemCategory(catLabel, name, isCombo);
      const atomicUnits = this.extractAtomicUnits(name, description);
      // Prefer name-based opaque keys over raw POS UUIDs (Mode 1 auditor)
      if (Object.keys(atomicUnits).length === 0 && !isCombo) {
        const slug = name
          .toLowerCase()
          .replace(/[^a-z0-9]+/g, '-')
          .replace(/^-+|-+$/g, '')
          .slice(0, 48);
        atomicUnits[`sku:${slug || id}`] = 1;
      }

      items.push({
        id: `pop_${id}`,
        name,
        category,
        price,
        description: raw.shortDescription || undefined,
        imageUrl: raw.imageUrl || undefined,
        isCombo: isCombo || undefined,
        daypart: /breakfast/i.test(catLabel + name) ? 'breakfast' : undefined,
        atomicUnits,
      });
    }

    return {
      ...this.brand,
      updatedAt: new Date().toISOString(),
      menuVersion: String(rawPayload.menuVersion || 'live'),
      items,
    };
  }

  normalizeStores(rawPayload: any): StoreLocation[] {
    const list = Array.isArray(rawPayload)
      ? rawPayload
      : Array.isArray(rawPayload?.stores)
        ? rawPayload.stores
        : Array.isArray(rawPayload?.data)
          ? rawPayload.data
          : [];

    return list
      .map((r: any) => this.mapStore(r))
      .filter((s: StoreLocation | null): s is StoreLocation => !!s);
  }

  private collectItems(categories: any[]): any[] {
    const out: any[] = [];
    const walk = (cats: any[]) => {
      for (const cat of cats || []) {
        const label = String(cat.categoryShortName || cat.categoryLongName || '');
        for (const item of Array.isArray(cat.items) ? cat.items : []) {
          out.push({ ...item, _catLabel: label });
        }
        if (Array.isArray(cat.subcategories) && cat.subcategories.length) {
          walk(cat.subcategories);
        }
      }
    };
    walk(categories);
    return out;
  }

  private mapItemCategory(catLabel: string, itemName: string, isCombo: boolean): MenuItemCategory {
    const c = `${catLabel} ${itemName}`.toLowerCase();
    if (c.includes('dip') || (c.includes('sauce') && !c.includes('sandwich'))) return 'dips';
    if (c.includes('kid')) return 'kids';
    if (c.includes('box meal') || c.includes('big box')) return 'box_meals';
    if (c.includes('sharer') || c.includes('feast')) return 'buckets';
    if (c.includes('shake') || c.includes('whipz') || c.includes('cookie') || c.includes('mud pie')) {
      return 'desserts';
    }
    if (c.includes('drink') || c.includes('lemonade') || c.includes('pepsi')) return 'drinks';
    if (c.includes('side') || c.includes('fries') || c.includes('biscuit') || c.includes('beans')) {
      return 'sides';
    }
    if (c.includes('wrap') || c.includes('sandwich') || c.includes('superstack')) return 'burgers';
    if (c.includes('tender') || c.includes('wing') || c.includes('boneless') || c.includes('chicken')) {
      return 'chicken';
    }
    if (isCombo || c.includes('meal')) return 'meals';
    return 'sides';
  }

  /**
   * Popeyes brand units (including box meals).
   * Choice lines collapse to the first option; sandwich counted even when title has "box".
   */
  protected extractAtomicUnits(name: string, description: string = ''): Record<string, number> {
    let text = `${name} ${description}`.toLowerCase().replace(/\s+/g, ' ');
    text = text.replace(
      /(?:with a |your )?choice of\s+(.+?)(?=\s+and a\s+(?:kids|regular|hot|big)|\.|\s+served|$)/gi,
      (_m, opts: string) => String(opts).split(/,|\bor\b/i)[0].trim()
    );

    const units = super.extractAtomicUnits(name, description);
    // Re-parse tenders with optional "Classic/Spicy" between count and word
    const tender = text.match(/(\d+)\s*(?:classic\s*|spicy\s*)?tenders?/i);
    if (tender) units.boneless_tender = parseInt(tender[1], 10);

    if (text.includes('mac & cheese') || text.includes('mac and cheese')) {
      units.mac_and_cheese = 1;
    }

    if (text.includes('sandwich') || text.includes('superstack')) {
      const n = text.includes('superstack') ? 2 : 1;
      if (text.includes('spicy') && !text.includes('cajun')) units.spicy_sandwich = n;
      else units.chicken_sandwich = n;
    }
    if (text.includes('wrap') && !units.chicken_sandwich) units.chicken_wrap = 1;

    const nug = text.match(/(\d+)\s*nuggets?/i);
    if (nug) units.nugget = parseInt(nug[1], 10);

    if (text.includes('biscuit')) {
      const b = text.match(/(\d+)\s*biscuits?/i);
      units.biscuit = b ? parseInt(b[1], 10) : 1;
    }
    if (text.includes('smoky beans') || (text.includes('beans') && text.includes('sharer'))) {
      const bn = text.match(/(\d+)\s*(?:smoky\s*)?beans/i);
      units.beans_reg = bn ? parseInt(bn[1], 10) : 1;
    }
    if (text.includes('2 regular sides') || text.includes('choice of 2 regular sides')) {
      units.beans_reg = Math.max(units.beans_reg || 0, 2);
    } else if (text.includes('regular side') && !text.includes('regular sides')) {
      units.beans_reg = Math.max(units.beans_reg || 0, 1);
    }

    if (text.includes('fries') || text.includes('kids fries') || text.includes('kids salad')) {
      const friesN = text.match(/(\d+)\s*(?:regular\s*)?fries/i);
      units.fries_reg = friesN ? parseInt(friesN[1], 10) : units.fries_reg || 1;
    }
    if (
      text.includes('drink') ||
      text.includes('kids drink') ||
      text.includes('bottled drink') ||
      text.includes('bottle of drink')
    ) {
      units.drink_reg = 1;
    }
    if (/\b(?:big\s*)?dips?\b/.test(text)) {
      const dipN = text.match(/(\d+)\s*(?:big\s*)?dips?\b/i);
      units.dip = dipN ? parseInt(dipN[1], 10) : 1;
    }

    if (text.includes('lemonade') || text.includes('pepsi') || text.includes('red bull')) {
      this.mergeDrinkUnits(text.includes('drink') ? text : `${text} drink`, units);
    }

    // Common regular sides — keep out of opaque UUID unit keys
    if (/\bcoleslaw\b|\bcole slaw\b|\bslaw\b/.test(text)) units.coleslaw = 1;
    if (/\bmash(?:ed)?\b|\bmashed potato/.test(text)) units.mash = 1;
    if (/\bcorn\b|\bcobette\b/.test(text) && !/popcorn/.test(text)) units.corn_cob = 1;
    if (/\bgravy\b/.test(text)) units.gravy_reg = 1;
    if (/\brice\b/.test(text) && !/price/.test(text)) units.rice = 1;
    if (/\bsalad\b/.test(text) && !/sandwich|wrap|meal|box/.test(text)) units.salad = 1;

    return units;
  }

  private mapStore(r: any): StoreLocation | null {
    if (r.id && r.name && r.address !== undefined && !r.storeName) {
      // Already ComboWise-ish
      return {
        id: String(r.id),
        name: String(r.name),
        address: String(r.address || ''),
        city: String(r.city || ''),
        postcode: String(r.postcode || ''),
        latitude: r.latitude,
        longitude: r.longitude,
        tierId: r.tierId || 'standard',
        isAppMenuAvailable: r.isAppMenuAvailable !== false,
      };
    }

    const slug = String(r.slug || '').trim();
    const id = slug || String(r.id || '');
    if (!id) return null;
    if (r.showDetailsAsComingSoonPage && !r.isOrderingAvailable) return null;

    const nameRaw = String(r.storeName || r.name || slug).trim();
    const name = nameRaw.startsWith('Popeyes') ? nameRaw : `Popeyes ${nameRaw}`;
    const rawAddr = String(r.storeAddress || r.address || '');
    const parts = rawAddr.split(';').map((p: string) => p.trim()).filter(Boolean);
    const address = parts[0] || rawAddr;
    const rest = parts.slice(1).join(', ');
    const pc = rest.match(/\b([A-Z]{1,2}\d[A-Z\d]?\s*\d[A-Z]{2})\b/i);
    const postcode = pc ? pc[1].toUpperCase() : String(r.postcode || '');
    let city = rest;
    if (pc) city = rest.replace(pc[0], '').replace(/,\s*$/, '').trim();
    if (city.includes(',')) city = city.split(',')[0].trim();

    let tierId = 'standard';
    if (/london/i.test(city + name)) tierId = 'london_central';
    if (/airport|services|motorway|station/i.test(name + address)) tierId = 'highway_travel';

    const coords = r.storeLocation?.coordinates || r.coordinates;
    return {
      id,
      name,
      address,
      city: city || String(r.city || ''),
      postcode,
      latitude: coords?.latitude ?? r.latitude,
      longitude: coords?.longitude ?? r.longitude,
      tierId,
      isAppMenuAvailable: r.isOrderingAvailable !== false,
    };
  }
}
