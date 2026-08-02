import type { FastFoodProvider, MenuItem, MenuItemCategory, StoreLocation } from '../types/provider';
import { BaseMenuNormalizer } from './baseNormalizer';

/**
 * Maps KFC UK order-online / menu-output payloads (ClickAndCollect)
 * into ComboWise FastFoodProvider shape.
 *
 * Live pipeline (server-side):
 *  1. GET prod.kfcapi.com/api/v3/restaurants/{refid}/menu?modeType=ClickAndCollect&serviceType=collection
 *  2. GET menuoutput.prod.platform.kfcapi.com/{refid}-ClickAndCollect.json
 *
 * Same data the web pickup flow uses after choose-your-food?refid=…
 */
export class KfcLiveNormalizer extends BaseMenuNormalizer {
  private brand: FastFoodProvider;

  constructor(brand: FastFoodProvider) {
    super(brand.id, brand.name);
    this.brand = { ...brand, items: [] };
  }

  normalize(rawPayload: any): FastFoodProvider {
    if (!rawPayload || typeof rawPayload !== 'object') {
      return { ...this.brand, items: [] };
    }

    // Already ComboWise shape
    if (Array.isArray(rawPayload.items) && rawPayload.items[0]?.category && rawPayload.id === 'kfc_uk') {
      return { ...this.brand, ...rawPayload, items: rawPayload.items };
    }

    const categories: { categoryId: number; name: string }[] = Array.isArray(rawPayload.categories)
      ? rawPayload.categories
      : [];
    const catName = new Map<number, string>(
      categories.map((c) => [c.categoryId, c.name || String(c.categoryId)])
    );

    const rawItems: any[] = Array.isArray(rawPayload.items) ? rawPayload.items : [];
    const seen = new Set<string>();
    const items: MenuItem[] = [];

    for (const raw of rawItems) {
      const price = this.parsePrice(raw.price);
      if (price <= 0) continue; // skip modifiers / zero-price POS lines

      const id = String(raw.posItemId || raw.productId || raw.objectKey || raw.slug || '');
      if (!id || seen.has(id)) continue;

      const name = String(raw.name || raw.posName || 'KFC Item').trim();
      const description = String(raw.description || '').trim();
      const posName = String(raw.posName || '');
      // Drop meal-builder / modifier SKUs (same rules as functions/adapters/kfc-uk.ts)
      if (this.isKfcMealComponentSku(name, description, posName)) continue;
      seen.add(id);

      const catLabel = raw.categoryId != null ? catName.get(Number(raw.categoryId)) || '' : '';
      let category = this.mapKfcCategory(catLabel, name, raw.type);
      const atomicUnits = this.extractAtomicUnits(name, description);
      const nameL = name.toLowerCase();
      const descL = description.toLowerCase();
      // Pure multi-packs (8 wings, 4 tenders) are ala-carte pack sizes — not Mode 1 combos
      let isCombo =
        /dine for|for two|for 2\b|box meal|feast|banquet|family feast|variety/i.test(nameL) ||
        (/\bmeal\b/i.test(nameL) && !/meal component/i.test(descL)) ||
        Object.keys(atomicUnits).length > 1 ||
        (/\bstacker\b/.test(nameL) &&
          (atomicUnits.zinger_burger || atomicUnits.fillet_burger || 0) >= 2);
      // Single drink / rice-bowl SKUs are not multi-item combos
      if (category === 'drinks' && Object.keys(atomicUnits).length <= 1) isCombo = false;
      if (atomicUnits.rice_bowl && Object.keys(atomicUnits).length === 1) isCombo = false;
      if (isCombo && category === 'sides') category = 'meals';

      // Prefer single-unit id for unique mains without detected packs
      if (Object.keys(atomicUnits).length === 0 && !isCombo) {
        const slug = name
          .toLowerCase()
          .replace(/[^a-z0-9]+/g, '-')
          .replace(/^-+|-+$/g, '')
          .slice(0, 48);
        atomicUnits[`sku:${slug || id}`] = 1;
      }

      items.push({
        id: `kfc_${id}`,
        name,
        category,
        price,
        description: description || undefined,
        imageUrl: raw.imagePath
          ? `https://assets.kfcapi.com/fit-in/300x300/${raw.imagePath}`
          : undefined,
        isCombo: isCombo || undefined,
        atomicUnits: Object.keys(atomicUnits).length ? atomicUnits : undefined,
      });
    }

    return {
      ...this.brand,
      id: 'kfc_uk',
      name: this.brand.name,
      updatedAt: rawPayload.timestamps?.updated
        ? this.parseKfcTimestamp(rawPayload.timestamps.updated)
        : new Date().toISOString(),
      menuVersion: String(rawPayload.signature || rawPayload.version || 'live'),
      items,
    };
  }

  private isKfcDrinkText(c: string): boolean {
    return (
      c.includes('drink') ||
      c.includes('pepsi') ||
      c.includes('tango') ||
      c.includes('7up') ||
      c.includes('7 up') ||
      c.includes('kwench') ||
      c.includes('matcha') ||
      c.includes('robinsons') ||
      c.includes('lipton') ||
      c.includes('fruit shoot') ||
      c.includes('fruitshoot') ||
      c.includes('lemonade') ||
      c.includes('still water') ||
      c.includes('sparkling water') ||
      /\bwater\b/.test(c) ||
      c.includes('latte') ||
      c.includes('cappuccino') ||
      c.includes('flat white') ||
      c.includes('americano') ||
      c.includes('espresso') ||
      c.includes('coffee') ||
      c.includes('oatly') ||
      c.includes('bottle') ||
      c.includes('litre') ||
      c.includes('liter') ||
      c.includes('shake') ||
      c.includes('juice') ||
      c.includes('smoothie') ||
      c.includes('boba') ||
      c.includes('refresher')
    );
  }

  /** Internal meal-builder / modifier / fee SKUs — not customer menu lines. */
  private isKfcMealComponentSku(name: string, description: string, posName?: string): boolean {
    const blob = `${name} ${description} ${posName || ''}`.toLowerCase();
    if (/\bcomponents?\b/.test(blob)) return true;
    if (/\bmeal\s*comp\b/.test(blob) || /\bmenu\s*comp\b/.test(blob)) return true;
    if (/^component\.?$/i.test(description.trim())) return true;
    // Meal-builder “choice” prices (e.g. Large popcorn chicken choice @ £2) — not street
    const d = description.toLowerCase().trim();
    const p = (posName || '').toLowerCase().trim();
    if (/\bchoice\b/.test(d) && d.length < 80 && !/your choice of/.test(d)) return true;
    if (/\bchoice\b/.test(p) && p.length < 80) return true;
    const n = name.toLowerCase().trim();
    if (
      /^donate\b/.test(n) ||
      n.includes('donation') ||
      /\bbag fee\b/.test(n) ||
      /\btakeaway bag\b/.test(n) ||
      /\bcarrier bag\b/.test(n) ||
      /^window$/i.test(n) ||
      /\balc\b/.test(n) ||
      /do not use/i.test(n) ||
      /test item/i.test(n)
    ) {
      return true;
    }
    if (
      /\bsyrup\b/.test(n) ||
      /\bcoffee shot\b/.test(n) ||
      /^cheese$/.test(n) ||
      /\b(caramel|vanilla|tiramisu|dark chocolate)\s+sauce\b/.test(n)
    ) {
      return true;
    }
    return false;
  }

  /** KFC channel category names → ComboWise categories */
  protected mapKfcCategory(catLabel: string, itemName: string, _type?: string): MenuItemCategory {
    const nameL = itemName.toLowerCase();
    const c = `${catLabel} ${itemName}`.toLowerCase();
    // Kids before drinks — meal copy often mentions "drink"
    if (/\bkids?\b/.test(nameL) || /\bkids?\b/.test(catLabel.toLowerCase())) return 'kids';
    if (this.isKfcDrinkText(c)) return 'drinks';
    if (c.includes('box meal') || c.includes('box meals')) return 'box_meals';
    if (c.includes('dine for') || c.includes('sharing') || c.includes('bucket') || c.includes('feast')) {
      return 'buckets';
    }
    if (c.includes('rice bowl') || c.includes('street bowl')) return 'meals';
    if (c.includes('twister') || c.includes('burger') || c.includes('wrap') || c.includes('naan')) {
      return 'burgers';
    }
    if (
      c.includes('just chicken') ||
      c.includes('wing') ||
      c.includes('tender') ||
      c.includes('popcorn') ||
      /original recipe chicken/.test(nameL)
    ) {
      return 'chicken';
    }
    if (c.includes('sweet') || c.includes('cookie') || c.includes('dessert') || c.includes('sundae')) {
      return 'desserts';
    }
    // Food sides by product name (before aisle label "Sides" swallows dips)
    if (
      nameL.includes('fries') ||
      nameL.includes('gravy') ||
      nameL.includes('beans') ||
      nameL.includes('coleslaw') ||
      nameL.includes('slaw') ||
      nameL.includes('mash') ||
      nameL.includes('cajun rice') ||
      (nameL.includes('rice') && !nameL.includes('rice bowl')) ||
      nameL.includes('salad') ||
      nameL.includes('corn cob') ||
      nameL.includes('cobette') ||
      nameL.includes('hashbrown') ||
      nameL.includes('hash brown')
    ) {
      return 'sides';
    }
    if (
      (nameL.includes('dip') ||
        nameL.includes('mayo') ||
        (nameL.includes('ranch') && !nameL.includes('bowl') && !nameL.includes('burger')) ||
        nameL.endsWith('sauce') ||
        /\b(sauce|mayo)\b/.test(nameL)) &&
      !nameL.includes('fries') &&
      !nameL.includes('burger') &&
      !nameL.includes('bowl') &&
      !nameL.includes('loaded') &&
      !nameL.includes('wrap') &&
      !nameL.includes('tower')
    ) {
      return 'dips';
    }
    if (/\bsides?\b/.test(catLabel.toLowerCase()) || /classic sides/i.test(catLabel)) return 'sides';
    if (
      /\b(box meal|bucket|feast|banquet|dine for)\b/.test(nameL) ||
      (/\bmeal\b/.test(nameL) && !/meal component|menu component/i.test(c)) ||
      c.includes('saver')
    ) {
      return 'meals';
    }
    return this.mapCategory(catLabel || itemName);
  }

  /**
   * KFC brand units — name-first so rice-bowl marketing copy does not explode
   * into corn/slaw/salad/dip ala-carte lines.
   */
  protected extractAtomicUnits(name: string, description: string = ''): Record<string, number> {
    const nameL = name.toLowerCase().replace(/\s+/g, ' ').trim();
    const descL = (description || '').toLowerCase().replace(/\s+/g, ' ').trim();

    if (/rice bowl|street bowl/.test(nameL)) {
      return { rice_bowl: 1 };
    }

    const nameLooksMulti =
      /dine for|for two|for 2\b|box meal|bucket|feast|banquet|variety|family|\bmeal\b|&|\bplus\b|:\s*\d+\s*pc|\d+\s*(pc|pcs|pieces?|tenders?|wings?|burgers?)/i.test(
        nameL
      );
    const descLooksMulti =
      !!descL &&
      (/\d+\s*(?:hot\s*)?(?:wings?|tenders?|pieces?|burgers?|mini fillets?)/i.test(descL) ||
        /\bplus\b.{0,40}\b(fries|gravy|drink|tender|wing)/i.test(descL) ||
        /\bwith\b.{0,40}\d+\s*(?:regular|large)?\s*(?:signature\s*)?fries/i.test(descL) ||
        /\band\b.{0,20}\d+\s*(?:hot\s*)?(?:wings?|tenders?)/i.test(descL));

    // Base pack detection on name only unless multi-deal
    const parseName = nameLooksMulti || descLooksMulti ? `${name} ${description}` : name;
    const units = super.extractAtomicUnits(parseName, nameLooksMulti || descLooksMulti ? description : '');
    const text = parseName.toLowerCase().replace(/\s+/g, ' ');
    const isLarge = /\blarge\b/.test(text);

    // Clear side units super may have pulled from unused desc
    if (!nameLooksMulti && !descLooksMulti) {
      for (const k of Object.keys(units)) {
        if (
          k.includes('fries') ||
          k.includes('gravy') ||
          k.includes('beans') ||
          k.includes('coleslaw') ||
          k.includes('mash') ||
          k.includes('cajun') ||
          k.includes('salad') ||
          k === 'corn_cob' ||
          k === 'dip'
        ) {
          // keep only if name mentions them
          const token = k.replace(/_reg$|_lrg$/, '').replace(/_/g, ' ');
          if (k === 'dip') {
            if (
              !(
                nameL.includes('dip') ||
                nameL.includes('mayo') ||
                (nameL.includes('ranch') && !nameL.includes('bowl')) ||
                /\bsauce\b/.test(nameL)
              )
            ) {
              delete units[k];
            }
          } else if (!nameL.includes(token.split(' ')[0])) {
            delete units[k];
          }
        }
      }
    }

    const zingerN = text.match(/(\d+)\s*zinger/);
    if (zingerN) {
      units.zinger_burger = parseInt(zingerN[1], 10);
      delete units.fillet_burger;
    } else if (text.includes('zinger') && (text.includes('burger') || text.includes('stacker'))) {
      units.zinger_burger = text.includes('stacker') ? 2 : 1;
      delete units.fillet_burger;
    }

    if (
      text.includes('fillet') &&
      text.includes('burger') &&
      !text.includes('tower') &&
      !units.zinger_burger
    ) {
      const n = text.match(/(\d+)\s*fillet/);
      units.fillet_burger = n ? parseInt(n[1], 10) : 1;
    }
    if (text.includes('tower') && text.includes('burger')) units.tower_burger = 1;
    if (text.includes('twister')) units.twister_wrap = 1;
    if (text.includes('mini fillet') && text.includes('burger')) units.mini_fillet_burger = 1;
    if (text.includes('popcorn')) units.popcorn_chicken = 1;

    if (text.includes('fries')) {
      delete units.fries_reg;
      delete units.fries_lrg;
      units[isLarge ? 'fries_lrg' : 'fries_reg'] = 1;
    }
    if (text.includes('gravy')) {
      delete units.gravy_reg;
      units[isLarge ? 'gravy_lrg' : 'gravy_reg'] = 1;
    }
    if (text.includes('beans')) units[isLarge ? 'beans_lrg' : 'beans_reg'] = 1;
    if (text.includes('coleslaw') || (text.includes('slaw') && !text.includes('pickled'))) {
      units[isLarge ? 'coleslaw_lrg' : 'coleslaw'] = 1;
    }
    if (text.includes('mash')) units[isLarge ? 'mash_lrg' : 'mash'] = 1;
    if (text.includes('cajun rice') || (text.includes('rice') && !text.includes('rice bowl') && !text.includes('street bowl'))) {
      units[isLarge ? 'cajun_rice_lrg' : 'cajun_rice'] = 1;
    }
    if (text.includes('salad') && !text.includes('mixed leaf')) {
      units[isLarge ? 'salad_lrg' : 'salad_reg'] = 1;
    }

    // Dip units from product name only
    if (
      (nameL.includes('dip') ||
        nameL.includes('mayo') ||
        (nameL.includes('ranch') && !nameL.includes('bowl') && !nameL.includes('burger')) ||
        /\bsauce\b/.test(nameL)) &&
      !nameL.includes('fries') &&
      !nameL.includes('beans') &&
      !nameL.includes('burger') &&
      !nameL.includes('loaded') &&
      !nameL.includes('bowl') &&
      !nameL.includes('wrap') &&
      !nameL.includes('tower')
    ) {
      units.dip = 1;
    } else {
      delete units.dip;
    }

    if (this.isKfcDrinkText(text)) {
      this.mergeDrinkUnits(
        text.includes('drink') || text.includes('bottle') || text.includes('litre') || text.includes('water')
          ? text
          : `${text} drink`,
        units
      );
    }

    return units;
  }

  private parseKfcTimestamp(ts: string): string {
    // e.g. 260723_120404 → 2026-07-23T12:04:04
    const m = /^(\d{2})(\d{2})(\d{2})_(\d{2})(\d{2})(\d{2})$/.exec(ts);
    if (!m) return new Date().toISOString();
    const [, yy, mo, dd, hh, mm, ss] = m;
    return `20${yy}-${mo}-${dd}T${hh}:${mm}:${ss}.000Z`;
  }
}

export function mapKfcRestaurantToStore(r: any): StoreLocation | null {
  const refid = String(r.refid || r.storeid || r.id || '');
  if (!refid) return null;
  const name = String(r.name || '').trim();
  if (/do not use/i.test(name)) return null;
  if (r.status && r.status !== 'available') return null;

  const city = String(r.city || '');
  const street = String(r.street || r.address || '');
  let tierId = 'standard';
  if (/london/i.test(city) || /london/i.test(name)) tierId = 'london_central';
  if (/airport|services|motorway|m\d+\b/i.test(name + street)) tierId = 'highway_travel';

  return {
    id: refid,
    name: name.startsWith('KFC') ? name : `KFC ${name}`,
    address: street,
    city,
    postcode: String(r.postalcode || r.postcode || ''),
    latitude: r.geolocation?.latitude,
    longitude: r.geolocation?.longitude,
    tierId,
    isAppMenuAvailable: true,
  };
}
