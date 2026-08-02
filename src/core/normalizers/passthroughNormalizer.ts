import { BaseMenuNormalizer, type RawMenuPayload } from './baseNormalizer';
import type { FastFoodProvider } from '../types/provider';

/**
 * Online-first normalizer: accepts a full FastFoodProvider JSON snapshot.
 * On invalid/empty payload returns brand shell with **items: []** — never a hardcoded catalogue.
 */
export class PassthroughNormalizer extends BaseMenuNormalizer {
  private brandShell: FastFoodProvider;

  constructor(providerId: string, providerName: string, brandShell: FastFoodProvider) {
    super(providerId, providerName);
    this.brandShell = { ...brandShell, items: [] };
  }

  normalize(rawPayload: RawMenuPayload | any): FastFoodProvider {
    if (!rawPayload || typeof rawPayload !== 'object') {
      return { ...this.brandShell, items: [] };
    }

    // Hosted Pages snapshot: full FastFoodProvider
    if (
      typeof rawPayload.id === 'string' &&
      Array.isArray(rawPayload.items)
    ) {
      const items = rawPayload.items;
      if (items.length === 0) {
        return {
          ...this.brandShell,
          ...rawPayload,
          items: [],
          locationTiers:
            Array.isArray(rawPayload.locationTiers) && rawPayload.locationTiers.length > 0
              ? rawPayload.locationTiers
              : this.brandShell.locationTiers,
        };
      }
      return {
        ...this.brandShell,
        ...rawPayload,
        items,
        locationTiers:
          Array.isArray(rawPayload.locationTiers) && rawPayload.locationTiers.length > 0
            ? rawPayload.locationTiers
            : this.brandShell.locationTiers,
      } as FastFoodProvider;
    }

    // Optional products[] schema (no offline fallback list)
    if (Array.isArray(rawPayload.products)) {
      const items = rawPayload.products.map((p: any, i: number) => {
        const name = p.name || p.title || 'Item';
        const category = this.mapCategory(p.category || p.categoryName || 'sides');
        const isCombo =
          p.isCombo || category === 'meals' || category === 'box_meals' || category === 'buckets';
        const description = p.description || p.summary || '';
        const units = this.extractAtomicUnits(name, description);
        return {
          id: p.id || p.sku || `${this.providerId}_${i + 1}`,
          name,
          category,
          price: this.parsePrice(p.price || p.amount || 0),
          description,
          imageUrl: p.imageUrl || p.image,
          isCombo,
          atomicUnits: Object.keys(units).length > 0 ? units : undefined,
        };
      });
      if (items.length === 0) {
        return { ...this.brandShell, items: [] };
      }
      return {
        ...this.brandShell,
        id: typeof rawPayload.id === 'string' ? rawPayload.id : this.brandShell.id,
        items,
      };
    }

    return { ...this.brandShell, items: [] };
  }
}

export function createPassthroughNormalizer(shell: FastFoodProvider): PassthroughNormalizer {
  return new PassthroughNormalizer(shell.id, shell.name, shell);
}
