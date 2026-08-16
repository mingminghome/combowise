/**
 * 8 Hot Wings + fries + drink must become a Hot Wings meal.
 * Run: npx tsx src/core/engine/optimizer.meals.test.ts
 */
import { BasketOptimizer } from './optimizer';
import { extractAtomicUnits } from '../../../functions/adapters/kfc-menu-pipeline';
import type { MenuItem } from '../types/provider';

(globalThis as any).localStorage = {
  _d: new Map<string, string>(),
  getItem(k: string) {
    return this._d.get(k) ?? null;
  },
  setItem(k: string, v: string) {
    this._d.set(k, v);
  },
  removeItem(k: string) {
    this._d.delete(k);
  },
  clear() {
    this._d.clear();
  },
};

function item(
  id: string,
  name: string,
  price: number,
  atomicUnits: Record<string, number>,
  extra: Partial<MenuItem> = {}
): MenuItem {
  return {
    id,
    name,
    price,
    category: extra.category || 'chicken',
    atomicUnits,
    isCombo: extra.isCombo,
    ...extra,
  };
}

const street = [
  item('w3', 'Hot Wings: 3 pc 🔥', 2.19, { hot_wing: 3 }),
  item('w2', 'Hot Wings: 2 pc 🔥', 1.59, { hot_wing: 2 }),
  item('fries', 'Regular Signature Fries', 2.29, { fries_reg: 1 }, { category: 'sides' }),
  item('drink', 'Regular 7Up Free', 1.99, { drink_reg: 1 }, { category: 'drinks' }),
];

const meal6 = item(
  'm6',
  'Hot Wings Meal: 6 pc 🔥',
  7.69,
  { hot_wing: 6, fries_reg: 1, drink_reg: 1 },
  { isCombo: true, category: 'buckets' }
);
const meal10 = item(
  'm10',
  'Hot Wings Meal: 10 pc 🔥',
  9.49,
  { hot_wing: 10, fries_reg: 1, drink_reg: 1 },
  { isCombo: true, category: 'buckets' }
);

const wishlist = [
  { itemId: 'w3', count: 2 },
  { itemId: 'w2', count: 1 },
  { itemId: 'fries', count: 1 },
  { itemId: 'drink', count: 1 },
];

function providerWith(items: MenuItem[]) {
  return {
    id: 'kfc_uk',
    currencySymbol: '£',
    getItems: () => items,
    getUnitDisplayName: (k: string) => k,
    getUnitPpiLabel: (k: string) => k,
  } as any;
}

function assert(cond: unknown, msg: string) {
  if (!cond) throw new Error(msg);
}

const withBoth = BasketOptimizer.optimizeBasket(providerWith([...street, meal6, meal10]), wishlist);
assert(withBoth.originalAlaCarteTotal === 10.25, `street total ${withBoth.originalAlaCarteTotal}`);
assert(
  withBoth.bundlesToBuy.some((b) => b.bundleItem.id === 'm6'),
  `expected 6pc meal, got ${withBoth.bundlesToBuy.map((b) => b.bundleItem.name).join(',') || 'none'}`
);
assert(
  Math.abs(withBoth.optimalTotal - 9.28) < 0.001,
  `6pc + leftover 2pc should be £9.28, got ${withBoth.optimalTotal}`
);
assert(withBoth.savingsAmount > 0.9, `expected ~£0.97 save, got ${withBoth.savingsAmount}`);

const noSix = BasketOptimizer.optimizeBasket(providerWith([...street, meal10]), wishlist);
assert(
  noSix.bundlesToBuy.some((b) => b.bundleItem.id === 'm10'),
  `expected 10pc overshoot meal, got ${noSix.bundlesToBuy.map((b) => b.bundleItem.name).join(',') || 'none'}`
);
assert(
  Math.abs(noSix.optimalTotal - 9.49) < 0.001,
  `10pc meal should be £9.49, got ${noSix.optimalTotal}`
);
assert(noSix.savingsAmount > 0.7, `expected ~£0.76 save, got ${noSix.savingsAmount}`);
assert(
  noSix.recommendations.some((r) => r.id.includes('m10') && r.isSavings),
  `expected 10pc meal recommendation, got ${noSix.recommendations.map((r) => r.title).join(' | ')}`
);

assert(
  extractAtomicUnits('Hot Wings: 3 pc 🔥').hot_wing === 3,
  `name “Hot Wings: 3 pc” should be 3 wings, got ${JSON.stringify(extractAtomicUnits('Hot Wings: 3 pc 🔥'))}`
);
assert(
  extractAtomicUnits('Hot Wings Meal: 10 pc 🔥').hot_wing === 10,
  `name “Hot Wings Meal: 10 pc” should be 10 wings, got ${JSON.stringify(extractAtomicUnits('Hot Wings Meal: 10 pc 🔥'))}`
);

console.log('optimizer.meals.test.ts ok');
