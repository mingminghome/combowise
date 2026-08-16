/**
 * Shared name→category / combo / unit helpers for new UK chain adapters.
 */
import { parsePrice } from './shared';

export const UK_TIERS = [
  { id: 'standard', name: 'Standard UK Store', description: '', priceMultiplier: 1 },
  { id: 'london_central', name: 'Central London', description: '', priceMultiplier: 1.15 },
  { id: 'highway_travel', name: 'Travel / Airport', description: '', priceMultiplier: 1.25 },
];

export function slugId(parts: Array<string | number | undefined>): string {
  return parts
    .map((p) =>
      String(p || '')
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-+|-+$/g, '')
    )
    .filter(Boolean)
    .join('-')
    .slice(0, 80);
}

export function ukPostcode(text: string): string {
  const m = String(text || '').match(/\b([A-Z]{1,2}\d[A-Z\d]?\s*\d[A-Z]{2})\b/i);
  return m ? m[1].toUpperCase().replace(/\s+/, ' ') : '';
}

export function isComboName(name: string): boolean {
  const n = name.toLowerCase();
  if (/\b(meal|box meal|share box|sharing|family|bundle|combo|deal|banquet|feast)\b/.test(n)) {
    return true;
  }
  if (/\b(and|&|\+)\b/.test(n) && (/\bfries\b|\bdrink\b|\bnugget/.test(n) || /\bburger\b/.test(n))) {
    return true;
  }
  return false;
}

export function mapGenericCategory(name: string, isCombo: boolean): string {
  const n = name.toLowerCase();
  if (/\b(kid|happy meal|junior)\b/.test(n)) return 'kids';
  if (/\b(share|family|bucket|party|box meal)\b/.test(n)) return isCombo || /\bbox\b/.test(n) ? 'box_meals' : 'buckets';
  if (/\b(nugget|tender|wing|mcnugget|chicken piece|selects)\b/.test(n) && !/\bburger\b/.test(n)) {
    return 'chicken';
  }
  if (/\b(shake|sundae|mcflurry|donut|doughnut|cookie|muffin|brownie|pie|dessert|timbit)\b/.test(n)) {
    return 'desserts';
  }
  if (
    /\b(drink|coke|pepsi|sprite|fanta|7up|latte|americano|cappuccino|mocha|coffee|tea|hot chocolate|juice|water|milkshake|smoothie)\b/.test(
      n
    )
  ) {
    return 'drinks';
  }
  if (/\b(fries|hash brown|side|salad|corn|beans|coleslaw|onion ring|apple pie)\b/.test(n) && !isCombo) {
    return 'sides';
  }
  if (/\b(dip|sauce|sachet)\b/.test(n)) return 'dips';
  if (/\b(burger|whopper|royale|big mac|mcchicken|wrap|bagel|muffin|croissant|sandwich|mcplant)\b/.test(n)) {
    return isCombo ? 'meals' : 'burgers';
  }
  if (isCombo || /\bmeal\b/.test(n)) return 'meals';
  return 'sides';
}

export function extractGenericUnits(name: string): Record<string, number> {
  const n = name.toLowerCase();
  const units: Record<string, number> = {};
  const nug = n.match(/\b(\d+)\s*(?:piece\s+)?(?:chicken\s+)?(?:mc)?nuggets?\b/);
  if (nug) units.nugget = parseInt(nug[1], 10);
  const wings = n.match(/\b(\d+)\s*(?:hot\s*)?wings?\b/);
  if (wings) units.hot_wing = parseInt(wings[1], 10);
  const tenders = n.match(/\b(\d+)\s*(?:chicken\s+)?(?:selects|tenders?)\b/);
  if (tenders) units.boneless_tender = parseInt(tenders[1], 10);
  if (/\bfries\b|\bfrites\b/.test(n)) {
    units[/\blarge\b|\blrg\b/.test(n) ? 'fries_lrg' : 'fries_reg'] = 1;
  }
  if (/\b(drink|coke|pepsi|sprite|fanta|7up|latte|americano|coffee|tea)\b/.test(n)) {
    units[/\blarge\b|\blrg\b/.test(n) ? 'drink_lrg' : 'drink_reg'] = 1;
  }
  if (/\bburger\b|\bwhopper\b|\bbig mac\b|\bmcchicken\b|\bmcplant\b|\broyale\b/.test(n)) {
    units.sku_burger = 1;
  }
  if (Object.keys(units).length === 0) {
    const slug = n.replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 40);
    units[`sku:${slug || 'item'}`] = 1;
  }
  return units;
}

export function localeText(v: unknown): string {
  if (typeof v === 'string') return v.trim();
  if (v && typeof v === 'object') {
    const o = v as { en?: unknown; locale?: unknown };
    if (typeof o.en === 'string') return o.en.trim();
    if (Array.isArray(o.en)) {
      return o.en
        .map((b: any) =>
          Array.isArray(b?.children) ? b.children.map((c: any) => c?.text || '').join('') : ''
        )
        .join(' ')
        .trim();
    }
  }
  return '';
}

export function penceToPounds(v: unknown): number {
  const n = typeof v === 'number' ? v : parseFloat(String(v || '').replace(/[^0-9.]/g, ''));
  if (!n || Number.isNaN(n)) return 0;
  // POS plus feeds are pence (499 → £4.99). Already-pounds values stay < 30 typically
  // for a single item; treat integers ≥ 30 as pence.
  if (Number.isInteger(n) && n >= 30) return parsePrice(n / 100);
  return parsePrice(n);
}

export function brandMenuShell(opts: {
  id: string;
  name: string;
  accentColor: string;
  logoText: string;
  disclaimer: string;
  items: any[];
  extra?: Record<string, unknown>;
}) {
  return {
    id: opts.id,
    name: opts.name,
    country: 'United Kingdom',
    currencySymbol: '£',
    currencyCode: 'GBP',
    accentColor: opts.accentColor,
    logoText: opts.logoText,
    locationTiers: UK_TIERS,
    disclaimer: opts.disclaimer,
    updatedAt: new Date().toISOString(),
    items: opts.items,
    ...opts.extra,
  };
}
