import type { FastFoodProvider, MenuItemCategory } from '../types/provider';

export interface RawCategoryPayload {
  id: string;
  name: string;
  items?: any[];
}

export interface RawMenuPayload {
  providerId: string;
  providerName: string;
  updatedAt?: string;
  categories?: RawCategoryPayload[];
  products?: any[];
  combos?: any[];
}

/**
 * Base for provider-specific menu normalizers.
 *
 * Keep this class **chain-agnostic**:
 * - Category heuristics that apply to most QSR menus
 * - Generic pack units (wings, tenders, fries, drink sizes)
 *
 * Brand SKUs (Zinger, Twister, Superstack, Kwench, …) belong in
 * `KfcLiveNormalizer` / `PopeyesLiveNormalizer` overrides — not here.
 *
 * Prefer publishing `category` + `atomicUnits` on live/normalized items so
 * these heuristics are a last resort for loose `products[]` payloads only.
 */
export abstract class BaseMenuNormalizer {
  protected providerId: string;
  protected providerName: string;

  constructor(providerId: string, providerName: string) {
    this.providerId = providerId;
    this.providerName = providerName;
  }

  /**
   * Main entry: raw remote payload → FastFoodProvider.
   * Subclasses implement; must not invent a hardcoded offline catalogue.
   */
  abstract normalize(rawPayload: RawMenuPayload | any): FastFoodProvider;

  /**
   * Map remote category labels → shared MenuItemCategory.
   * Override in a provider normalizer for chain-specific aisle names.
   */
  protected mapCategory(rawCategoryName: string): MenuItemCategory {
    const name = rawCategoryName.toLowerCase();
    if (name.includes('box') || name.includes('meal box')) return 'box_meals';
    if (name.includes('meal') || name.includes('combo')) return 'meals';
    if (name.includes('bucket') || name.includes('family') || name.includes('feast') || name.includes('sharer')) {
      return 'buckets';
    }
    if (name.includes('burger') || name.includes('wrap') || name.includes('sandwich')) return 'burgers';
    if (
      name.includes('chicken') ||
      name.includes('wing') ||
      name.includes('piece') ||
      name.includes('tender') ||
      name.includes('nugget') ||
      name.includes('boneless')
    ) {
      return 'chicken';
    }
    if (name.includes('side') || name.includes('fries') || name.includes('gravy') || name.includes('rice') || name.includes('biscuit')) {
      return 'sides';
    }
    if (
      name.includes('drink') ||
      name.includes('beverage') ||
      name.includes('shake') ||
      name.includes('lemonade') ||
      name.includes('water') ||
      name.includes('latte') ||
      name.includes('coffee') ||
      name.includes('juice')
    ) {
      return 'drinks';
    }
    if (name.includes('dessert') || name.includes('sweet') || name.includes('ice') || name.includes('cookie') || name.includes('whipz')) {
      return 'desserts';
    }
    if (name.includes('dip') || name.includes('sauce')) return 'dips';
    if (name.includes('kid')) return 'kids';
    return 'sides';
  }

  /**
   * Generic atomic-unit heuristics only (no brand product names).
   * Subclasses should `super.extractAtomicUnits` then add chain SKUs,
   * or fully override when the brand model differs.
   */
  protected extractAtomicUnits(name: string, description: string = ''): Record<string, number> {
    const text = `${name} ${description}`.toLowerCase().replace(/\s+/g, ' ');
    const units: Record<string, number> = {};

    const wingMatch = text.match(/(\d+)\s*(?:hot\s*)?wings?/i);
    if (wingMatch) units.hot_wing = parseInt(wingMatch[1], 10);

    const tenderMatch = text.match(/(\d+)\s*(?:chicken\s*)?tenders?/i);
    if (tenderMatch) units.boneless_tender = parseInt(tenderMatch[1], 10);

    const nuggetMatch = text.match(/(\d+)\s*(?:chicken\s*)?nuggets?/i);
    if (nuggetMatch) units.nugget = parseInt(nuggetMatch[1], 10);

    const pcMatch = text.match(/(\d+)\s*(?:pc|pcs|pieces?)/i);
    if (pcMatch && !text.includes('wing') && !units.boneless_tender) {
      units.chicken_piece = parseInt(pcMatch[1], 10);
    }

    if (text.includes('fries')) {
      units[/\blarge\b/.test(text) ? 'fries_lrg' : 'fries_reg'] = 1;
    }
    if (text.includes('gravy')) units.gravy_reg = 1;
    if (text.includes('corn cob') || text.includes('cobette')) {
      units.corn_cob = text.includes('2') ? 2 : 1;
    }

    // Generic drink form factors (brand soft-drink names left to subclasses)
    this.mergeDrinkUnits(text, units);

    return units;
  }

  /**
   * Shared drink size / bottle detection. Brand soft-drink keywords
   * (Pepsi, Kwench, …) should call this after marking isDrinkish.
   */
  protected mergeDrinkUnits(text: string, units: Record<string, number>): void {
    const isDrinkish =
      text.includes('drink') ||
      text.includes('bottle') ||
      text.includes('litre') ||
      text.includes('liter') ||
      text.includes('beverage');
    if (!isDrinkish) return;

    if (/\b1\.5\s*l\b/.test(text) || text.includes('1.5 litre') || text.includes('1.5 liter')) {
      units.drink_bottle_1_5l = 1;
    } else if (text.includes('bottle')) {
      units.drink_bottle = 1;
    } else if (/\blarge\b/.test(text)) {
      units.drink_lrg = 1;
    } else if (
      !text.includes('burger') &&
      !text.includes('meal') &&
      !text.includes('box') &&
      !text.includes('dine for')
    ) {
      units.drink_reg = 1;
    }
  }

  /** Sanitize remote price fields to major currency units (e.g. GBP pounds). */
  protected parsePrice(priceVal: any): number {
    if (typeof priceVal === 'number') return Math.round(priceVal * 100) / 100;
    if (typeof priceVal === 'string') {
      const cleaned = priceVal.replace(/[^0-9.]/g, '');
      const parsed = parseFloat(cleaned);
      return isNaN(parsed) ? 0 : Math.round(parsed * 100) / 100;
    }
    return 0;
  }
}
